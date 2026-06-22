# Recherche Explorer globale — design

- **Date** : 2026-06-22
- **Statut** : design validé (brainstorming) — en attente de relecture avant plan d'implémentation
- **Périmètre** : élargir la recherche texte de l'Explorer (aujourd'hui nom + ville) à l'ensemble du contenu utile au voyageur : équipements, tags, environnement, taxonomie, classements/labels, **menus (plats, régimes, allergènes, cuisines)** et prose des descriptions, avec **classement par pertinence**.
- **Hors périmètre** : recherche multilingue (FR uniquement au lancement, cohérent avec la règle FR-fallback) ; nouveaux filtres à puces (ex. puce « Végan ») — complément possible, non couvert ici ; overlays org des descriptions.

---

## 1. Problème

La barre de recherche de l'Explorer ([`TopBar.tsx`](../../../bertel-tourism-ui/src/components/layout/TopBar.tsx)) écrit dans `common.search`, transmis à `api.get_filtered_object_ids` (`p_search`). Côté SQL, le terme n'est comparé qu'à **deux** champs :

```sql
-- api_views_functions.sql (≈ ligne 1306)
p_search IS NULL OR
src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR
(src.city_search_vector IS NOT NULL AND src.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)))
```

Un voyageur qui tape « jacuzzi », « salade de palmiste » ou « végan » ne trouve rien, alors que cette information existe déjà sur les fiches (équipements, plats de menu, régimes…), mais uniquement sous forme de **codes** mis en cache (`cached_amenity_codes`, etc.) qui ne servent qu'aux **filtres à puces**, pas à la recherche texte. Les libellés humains vivent dans les tables `ref_*` ; la prose des descriptions vit dans `object_description`.

---

## 2. Décision d'architecture

**Approche retenue : une colonne `tsvector` `object.search_document` maintenue**, agrégeant le contenu textuel issu des tables enfants, pondérée pour permettre le classement. Le nom et la ville restent sur leurs vecteurs générés existants et sont **composés à la requête** (pas dupliqués dans la colonne).

Alternatives écartées :

- **B — résolution libellé→code à la requête + trigram sur description** : trois stratégies de match hétérogènes (full-text + tableau + ILIKE), correspondance de libellé floue, classement unifié difficile, tags/description forcent le chemin live. Plus de pièces mobiles à chaque requête.
- **C — document calculé uniquement dans la MV** : pas de colonne objet, mais l'agrégat est dupliqué (définition MV + LATERAL live pour les brouillons) → risque de dérive et jointures lourdes par ligne sur les brouillons. Viole « une seule source de vérité ».

L'approche A est la plus maintenable, la seule qui gère la prose + le classement avec une sémantique uniforme, et elle se greffe sur l'infrastructure de cache déjà en place (`api.refresh_object_filter_caches`).

---

## 3. Modèle de données — `object.search_document`

Nouvelle colonne `search_document tsvector` (nullable) sur `object`, indexée GIN. Elle ne contient **que** le contenu issu des tables enfants (le nom/ville sont composés à la requête). Pondération :

| Poids | Contenu | Source |
|---|---|---|
| **A** | nom, ville | `object.name_search_vector` + `object_location.city_search_vector` (générés, composés à la requête — **pas** dans la colonne) |
| **B** | libellés taxonomie (nœuds assignés + ancêtres assignables) ; libellés classements/labels (nom du schéma + nom de la valeur : « 3 étoiles », « Clef Verte », « Tourisme & Handicap ») | `object_taxonomy`→`ref_code_taxonomy_closure`→`ref_code.name` ; `object_classification`→`ref_classification_scheme.name`/`ref_classification_value.name` (status `granted`) |
| **C** | équipements (jacuzzi, piscine…) ; tags libres ; tags d'environnement ; **plats de menu** ; noms de menus ; **types de cuisine** ; **régimes (végan, végétarien…)** ; **allergènes** | `object_amenity`→`ref_amenity.name` ; `tag_link`(target_table='object')→`ref_tag.name` ; `object_environment_tag`→`ref_code_environment_tag.name` ; `object_menu_item.name` + `object_menu.name` ; `object_cuisine_type`→`ref_code_cuisine_type.name` ; `object_menu_item_dietary_tag`→`ref_code_dietary_tag.name` ; `object_menu_item_allergen`→`ref_code_allergen.name` |
| **D** | prose description canonique (markdown-strippé) ; descriptions de plats | `object_description` (`org_object_id IS NULL`) colonnes publiques `description`/`description_chapo`/`description_mobile`/`description_adapted` via `api.strip_markdown` ; `object_menu_item.description` |

### Règles de périmètre

- **Langue** : libellés et prose **FR canoniques** (valeur de base `name`/`label`/`description` ; pas de parcours des `*_i18n`). La recherche non-FR est différée.
- **Menus & visibilité** : n'indexer que les menus `object_menu.is_active = TRUE` **et** `visibility IS NULL OR visibility = 'public'`. Les plats, régimes, allergènes héritent de la visibilité de leur menu (via `object_menu_item.menu_id`). Un menu privé/partenaires ne doit **jamais** faire remonter l'objet en recherche publique (fuite de contenu).
- **Descriptions & visibilité** : n'indexer que la ligne **canonique** (`org_object_id IS NULL`) dont `visibility IS NULL OR visibility = 'public'`. Pas d'indexation des overlays org (la source publique unique est le canonique ; cohérent avec l'invariant descriptions).
- **`description_edition`** (ancien champ d'impression OTI) **exclu** — non public.

### Limite connue (documentée)

Renommer un **libellé de référence** (ex. renommer une amenity dans `ref_amenity`) ne déclenche pas le recalcul des `search_document` par objet (les triggers sont sur les tables de liaison `object_*`, pas sur les `ref_*`). Repris par un **backfill périodique** ou une action admin de reconstruction. Acceptable : les renommages de référentiel sont rares et administrés. À documenter dans la note de décision.

---

## 4. Maintenance, triggers, performance

### 4.1 Recalcul

`api.refresh_object_filter_caches(p_object_id)` ([`schema_unified.sql` ≈ 4522](../../../Base%20de%20donnée%20DLL%20et%20API/schema_unified.sql)) est **étendue** :

- calcule `v_search_document tsvector` en agrégeant les sources ci-dessus, chaque groupe via `setweight(to_tsvector('french', immutable_unaccent(lower(<libellés concaténés>))), '<A|B|C|D>')`, le tout concaténé par `||` ;
- ajoute `search_document = v_search_document` à l'`UPDATE object` existant, et `o.search_document IS DISTINCT FROM v_search_document` à la garde `WHERE` (anti-récursion + anti-écriture inutile conservée).

Le backfill unique (bloc `UPDATE object SET cached_* …` existant) est étendu pour peupler `search_document` sur les lignes existantes.

### 4.2 Triggers

`AFTER INSERT OR UPDATE OR DELETE`, appelant le recalcul de l'objet concerné :

- **Réutilisés tels quels** (déclenchent déjà `api.trg_refresh_object_filter_caches_from_child` → `NEW/OLD.object_id`) : `object_amenity`, `object_environment_tag`, `object_classification`, `object_taxonomy`. (`object_payment_method`, `object_language` déclenchent aussi mais n'alimentent pas le document — sans effet.)
- **Nouveaux, `object_id` direct** : `object_cuisine_type`, `object_menu`, `object_description`.
- **Nouveaux, `object_id` résolu via le parent** (petites fonctions trigger dédiées) :
  - `tag_link` → `object_id := target_pk` quand `target_table = 'object'` ;
  - `object_menu_item` → `object_id` via `object_menu(menu_id)` ;
  - `object_menu_item_dietary_tag` / `object_menu_item_allergen` / `object_menu_item_cuisine_type` → `object_id` via `object_menu_item → object_menu`.

**Nom/ville** : aucun trigger — restent sur leurs colonnes générées et sont composés à la requête, donc reflétés immédiatement.

### 4.3 Performance

- **Filtre** index-friendly : `name_sv @@ q OR (city_sv IS NOT NULL AND city_sv @@ q) OR (search_document IS NOT NULL AND search_document @@ q)` — trois `@@` sur trois index GIN distincts (bitmap-OR). Nouvel index GIN sur `object.search_document` **et** sur la colonne ajoutée à `internal.mv_filtered_objects`.
- **Classement** calculé seulement sur les lignes déjà filtrées :
  `ts_rank(setweight(name_sv,'A') || setweight(coalesce(city_sv,''::tsvector),'A') || coalesce(search_document,''::tsvector), q)`.
- Corpus ~840 objets ; le recalcul par écriture = quelques petites jointures bornées. La MV (publié) est rafraîchie toutes les 5 min (chemin chaud) ; les **brouillons** lisent la colonne live → fraîcheur immédiate. Parité publié↔brouillon garantie (même colonne).

---

## 5. Comportement requête + classement

### 5.1 `api.get_filtered_object_ids`

- **Mode de recherche** : lit `p_filters->>'search_mode'`. `'global'` → ajoute le terme `search_document` au filtre et le compose au rang ; toute autre valeur / absent → **nom + ville uniquement** (comportement actuel, rétrocompatible).
- **Nouvelle colonne de sortie** `relevance REAL` : `ts_rank(...)` (cf. 4.3) quand un terme est présent ; `0` sinon (et `0` en mode nom sans correspondance). La signature passe de `RETURNS TABLE(object_id, label_rank, label_match)` à `(object_id, label_rank, label_match, relevance)`.
- Le `use_mv` (chemin MV rapide) reste valable : `search_mode`/`search_document` n'imposent pas le chemin live (la colonne est sur la MV) ; les plats/tags sont déjà cuits dans `search_document`, plus besoin du contournement `tags_any`.

### 5.2 Callers (ordre)

Les fonctions cartes/liste/map qui appellent `get_filtered_object_ids` (9 appels recensés : api_views_functions.sql ≈ 5884, 6085, 7076, 8963, 9050, 9123, 9199, 9282, 9379) :

- sélectionnent en plus `fids.relevance` ;
- changent l'ordre en `ORDER BY relevance DESC, label_rank, name_normalized NULLS LAST, id`.

Sans recherche, `relevance = 0` pour toutes les lignes ⇒ l'ordre est **identique à aujourd'hui** (le tri par pertinence devient un no-op départage). Aucun `CASE` conditionnel nécessaire.

### 5.3 Grants / signature

Changement de signature ⇒ `DROP FUNCTION` + `CREATE` + `REVOKE/GRANT` mis à jour dans `rls_policies.sql` (la fonction reste `SECURITY DEFINER`, exécutée par `authenticated`/`service_role`, `anon` toujours révoqué).

---

## 6. Frontend

- **Opt-in du mode global porté par `ExplorerFilters`** : l'Explorer pose un indicateur `searchScope: 'global'` sur ses filtres ; `buildBucketRpcFilters` ([`utils/facets.ts`](../../../bertel-tourism-ui/src/utils/facets.ts)) mappe cet indicateur vers `p_filters.search_mode = 'global'`. **Indispensable** car `useObjectSearch` (hint de doublon dans `CreateObjectDialog` + `RelationPicker` §15) passe lui aussi par `buildBucketRpcFilters` via `listExplorerCards` : son `buildObjectSearchFilters` **ne pose pas** l'indicateur → reste en mode nom → pickers éditeur **inchangés**. `DEFAULT_EXPLORER_FILTERS` ne porte pas `searchScope='global'` (sinon le picker l'hériterait par spread).
- **Placeholder** de la barre TopBar mis à jour pour refléter l'étendue (ex. « Rechercher : nom, ville, équipement, plat, label… »).

---

## 7. Tests

### 7.1 SQL — `Base de donnée DLL et API/tests/test_global_search.sql`

Monte des fixtures et assert via `api.get_filtered_object_ids(…, p_filters @> {"search_mode":"global"}, …)` :

- « jacuzzi » (équipement) → objet remonte ;
- tag libre, tag d'environnement, libellé taxonomie → remontent ;
- « 3 étoiles » / « Clef Verte » (classement/label) → remonte ;
- **« salade de palmiste »** (plat de menu) remonte un **restaurant ET une chambre d'hôte** ;
- **« végan »** (régime) → remonte un objet servant un plat végan ; allergène idem ;
- mot présent uniquement dans la **description** → remonte ;
- **classement par pertinence** : objet nommé « Le Jacuzzi » (poids A) > objet avec équipement jacuzzi (C) > objet ne le mentionnant qu'en description (D) ;
- **menu privé/inactif** → l'objet ne remonte **pas** via son plat ;
- **mode nom** (sans `search_mode='global'`) → la recherche reste nom+ville (un objet qui n'a « jacuzzi » qu'en équipement ne remonte pas) — garde-fou du non-élargissement des pickers éditeur ;
- **parité** : même résultat en mode brouillon (chemin live `object`) et publié (chemin `mv_filtered_objects`).

### 7.2 Frontend (Jest)

- `buildBucketRpcFilters` émet `search_mode:'global'` quand `searchScope='global'` et l'omet sinon ;
- `buildObjectSearchFilters` (useObjectSearch) ne pose pas `searchScope` → mode nom ;
- placeholder TopBar mis à jour.

---

## 8. Rollout / intégrité de déploiement

- **Migration** `Base de donnée DLL et API/migration_global_search_document.sql` : colonne `object.search_document` + index GIN ; extension de `api.refresh_object_filter_caches` + backfill ; nouveaux triggers ; `get_filtered_object_ids` (nouvelle signature) + callers ; `rls_policies.sql` (grants) ; ajout de la colonne + index à `internal.mv_filtered_objects` (reconstruction MV) ; `REFRESH MATERIALIZED VIEW … internal.mv_filtered_objects`.
- **Folding** dans `schema_unified.sql` (colonne, index, fonction, triggers, définition MV) + `api_views_functions.sql` (RPC + callers) + `rls_policies.sql` (grants), pour que la passe fresh-apply reproduise le live (un fresh DB = no-op).
- **Manifest** : entrée **14y** dans `docs/SQL_ROLLOUT_RUNBOOK.md` (dépendances : step 1 `schema_unified.sql`, `migration_permission_write_paths.sql`, `migration_cards_batch_authorize_definer.sql`, `api_views_functions.sql`, `api.strip_markdown`). CI fresh-apply + `tests/test_global_search.sql` câblés.
- **`NOTIFY pgrst`** après application.
- **Documentation** : note de décision (§ suivant) dans `lot1_mapping_decisions.md` ; nouvel invariant proposé pour `CLAUDE.md` : *« Tout contenu d'une table enfant utile au voyageur (équipement, tag, plat, régime, label, prose) doit être folder dans `object.search_document` via `api.refresh_object_filter_caches` (+ trigger sur sa table source), avec respect de la visibilité (menus/descriptions non-publics exclus). La recherche Explorer matche `name_sv OR city_sv OR search_document` et classe par `ts_rank` pondéré (A nom/ville > B taxo/labels > C facettes/plats > D prose). »*

---

## 9. Risques & points d'attention

- **Bruit de recherche** : inclure la prose des descriptions (poids D) élargit beaucoup ; le poids D minimise son impact sur le classement (le nom domine). À surveiller sur données réelles ; possibilité de retirer la prose du périmètre si le bruit est gênant (le design le permet sans casser le reste).
- **Sémantique multi-mots** : `plainto_tsquery` fait du **ET** entre les termes (« salade palmiste » exige les deux dans le document). Cohérent avec l'actuel ; conservé.
- **Recalcul des triggers menu** : les triggers à résolution de parent (menu_item → menu) doivent gérer DELETE (lire `OLD`) et le déplacement d'item entre menus (rare). Couvert par les fixtures de test.
- **Reconstruction MV** : `DROP/CREATE MATERIALIZED VIEW` invalide brièvement le cache chaud ; appliquer hors pic, suivi d'un REFRESH. Pattern déjà établi.

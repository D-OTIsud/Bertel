# Filtre « Remplissage » de l'Exploreur — design

**Date** : 2026-07-29
**Statut** : spec validée, non implémentée
**Demande** : « dans les filtres il serait bien pour les status editeur et superieur d'avoir un filtre sur le pourcentage de remplissage de la fiche »

---

## 1. Ce qu'on mesure — et pourquoi ce n'est pas un pourcentage

La demande initiale parlait de pourcentage. Le design y renonce délibérément.

Il existe aujourd'hui **deux** mesures de remplissage qui ne donnent pas le même
nombre sur la même fiche :

| Mesure | Où | Contenu |
|---|---|---|
| Bundle des 8 essentiels | SQL, `api.get_dashboard_completeness` | 8 essentiels visiteur, score /8 |
| Modèle 80/15/5 | TS, `features/object-editor/editor-completion.ts` | 80 % essentiels + 15 % complémentaire + 5 % bonus |

L'anneau de l'éditeur est donc **structurellement au-dessus** du chiffre SQL. Un
agent qui filtre « moins de 50 % » dans l'Exploreur puis ouvre la fiche et lit
« 68 % » cesse de faire confiance aux deux.

**Décision** : le filtre porte un **nombre d'essentiels manquants**, pas un
pourcentage. Un comptage d'items est vrai des deux côtés ; un pourcentage ne
l'était pas. Aligner les deux % aurait exigé de porter en SQL les 15 %
complémentaire et 5 % bonus — une réplique du TypeScript qui dériverait à la
première évolution.

**Vocabulaire** : le mot retenu est **« remplissage »**, partout (Exploreur,
anneau de l'éditeur, Dashboard onglet Qualité, aide). Renommage de libellés
uniquement — aucun nom de fonction SQL, aucune clé de contrat RPC ne change.

### Les 8 essentiels

Repris tels quels du bundle existant (`api.get_dashboard_completeness`) — pas de
nouvelle définition métier :

| Code | Essentiel | Source |
|---|---|---|
| `name` | Nom | `object.name` non vide |
| `subcategory` | Sous-catégorie | ≥1 `object_taxonomy` |
| `location` | Lieu | `object_location` avec ville, INSEE ou lat/lon |
| `contact` | Contact public | ≥1 `contact_channel` `is_public` non vide |
| `description` | Descriptif + chapô | `object_description` canonique, les deux remplis |
| `photos` | Photos | `COUNT(media) ≥ photo_target` (FMA 1 · PSV/VIL/COM/SPU 2 · sinon 4) |
| `type_block` | Bloc type | par `object_type` (capacité/chambres, couverts/menu, `object_act`, `object_iti`, `object_fma`, sinon `object_amenity`) |
| `tags` | Tags | ≥1 `tag_link` sur l'objet |

---

## 2. Calibration live (2026-07-29, 846 fiches hors ORG)

Le CLAUDE.md impose de calibrer un seuil sur la couverture réelle avant de le
figer. Mesuré via MCP Supabase sur la base de production :

| Palier | Fiches | dont publiées |
|---|---|---|
| 0 manquant — complète | 409 | 406 |
| 1–2 manquants | 397 | 395 |
| 3 et plus | 39 | 38 |

| Essentiel manquant | Fiches |
|---|---|
| photos | 357 |
| bloc type | 172 |
| descriptif | 111 |
| tags | 27 |
| contact public | 16 |
| lieu | 1 |
| sous-catégorie | 1 |
| **nom** | **0** |

Les trois paliers découpent le corpus de façon exploitable, et « 3 et plus » =
39 fiches, une pile de travail réellement traitable.

**`name` n'est pas proposé dans la facette** : 0 fiche concernée, `object.name`
est structurellement rempli. L'offrir serait un critère muet — exactement ce
que la garde CI §194 interdit. Il **reste compté** dans le total, pour que
`get_dashboard_completeness` conserve son dénominateur /8 inchangé.

---

## 3. Architecture — calcul à la volée, pas de colonne cachée

### Mesure qui tranche

`EXPLAIN (ANALYZE)` sur la base de production, corpus entier :

| Cas | Coût |
|---|---|
| Les 8 essentiels, à chaud | **23 ms** |
| Les 8 essentiels, à froid | 270 ms (réchauffage de cache, non représentatif) |
| Filtre sur **un seul** essentiel | **2,5 ms** |
| Chemin chaud actuel de l'Exploreur (repère) | ~16 ms |

Le plan montre que PostgreSQL **hache** la plupart des sous-requêtes (évaluées
une fois pour tout le corpus, pas par ligne) et **élague les colonnes de CTE non
consommées** — d'où les 2,5 ms quand un seul essentiel est interrogé.

### Route écartée : colonne cachée sur `object`

`object` porte déjà `cached_amenity_codes`, `cached_taxonomy_codes`,
`search_document`… Ajouter `cached_missing_essentials` aurait semblé cohérent.
Écarté pour deux raisons vérifiées :

1. **Les triggers n'existent pas.** Seules 9 tables portent
   `trg_refresh_object_filter_caches_from_child` (`object_amenity`,
   `object_classification`, `object_cuisine_type`, `object_description`,
   `object_environment_tag`, `object_language`, `object_menu`,
   `object_payment_method`, `object_taxonomy`). Il faudrait en ajouter sur
   `media`, `contact_channel`, `object_location`, `tag_link`, `object_capacity`,
   `object_room_type`, `object_act`, `object_iti`, `object_fma` — soit un coût
   permanent sur des chemins d'écriture chauds.
2. **Le backfill est dangereux.** Le CLAUDE.md le dit explicitement : remplir une
   colonne dérivée sur tout le corpus pousse `updated_at` sur chaque ligne — or
   `updated_at` pilote la reprise des synchronisations partenaires — plus un
   snapshot `object_version` par ligne. Il existe une recette (§197) mais elle
   n'est justifiée que si le gain est réel. Ici il ne l'est pas.

Le calcul à la volée est **moins cher à construire, moins cher à maintenir, et
toujours frais** : l'agent ajoute une photo, la fiche quitte la liste au
rafraîchissement suivant, sans attendre un cron.

### Une seule définition du bundle

Le bundle est aujourd'hui écrit **en dur dans le corps** de
`api.get_dashboard_completeness`. Le recopier dans le RPC de filtrage puis dans
celui des cartes garantirait trois copies divergentes.

→ Extraction dans **`internal.v_object_essentials`** :

```
object_id, object_type,
e_name, e_subcat, e_location, e_contact, e_desc,   -- booléens, colonnes séparées
n_photos, photo_target, e_typeblock, e_tags,
missing_essentials text[]                          -- dérivée des colonnes ci-dessus
```

**Les booléens sont exposés en colonnes séparées, et ce n'est pas cosmétique** :
c'est ce qui préserve l'élagage mesuré. Un filtre « sans photo » ne consomme
qu'une colonne → 2,5 ms. Seuls le palier et la pastille, qui ont réellement
besoin des 8, paient les 23 ms.

**Chaque essentiel est calculé une seule fois** : un CTE interne produit les
booléens, le `SELECT` externe dérive `missing_essentials` **depuis ces
booléens**. Recopier les expressions dans le tableau remettrait deux copies du
calcul dans le fichier dont la raison d'être est d'en supprimer les copies — et
la première divergence serait silencieuse.

Schéma `internal` : couche dérivée privée, cohérent avec
`internal.mv_filtered_objects`, et hors de portée de PostgREST.

`api.get_dashboard_completeness` est rebranché sur la vue — **ses chiffres ne
doivent pas bouger d'un point** (garde de parité en test). Il est `DEFINER` mais
son `search_path` ne contient **pas** `internal` (vérifié en base) : il faut l'y
ajouter.

### Qui peut lire la vue — et qui ne peut pas

État vérifié en base au 2026-07-29 :

| Fonction | Sécurité | `internal` dans le `search_path` ? |
|---|---|---|
| `api.get_filtered_object_ids` | DEFINER | **oui** — rien à faire |
| `api.get_dashboard_completeness` | DEFINER | non — à ajouter |
| `api.list_object_resources_filtered_page` | **INVOKER** | non — **et l'ajouter ne suffirait pas** |

Le RPC de pagination est `SECURITY INVOKER` : ce sont les droits de l'appelant
qui s'appliquent, et `authenticated` n'a pas `USAGE` sur `internal` (par
conception — c'est une couche de performance privée). Lui ajouter `internal` au
`search_path` produirait une panne **à l'exécution seulement**, invisible au
déploiement — la classe de gotcha §29.

→ Le chemin cartes passe par un helper dédié :

```sql
api.object_missing_essentials(p_object_ids TEXT[])
  RETURNS TABLE(object_id TEXT, missing TEXT[])
  SECURITY DEFINER
```

Il porte **trois verrous cumulés** :
1. `REVOKE ALL … FROM PUBLIC` **explicite** — PostgreSQL accorde `EXECUTE` à
   `PUBLIC` par défaut sur toute fonction créée, et un `GRANT` ciblé ne retire
   pas ce droit. Sans ce `REVOKE`, `anon` peut appeler la fonction ;
2. rend l'ensemble vide si `NOT api.current_user_can_edit_objects()` — c'est ici
   que vit le « éditeur et supérieur », côté serveur ;
3. **s'auto-autorise** ses ids contre `api.current_user_readable_object_ids()`
   sans jamais faire confiance à la liste reçue (§36).

Appelé **une fois par page**, en ensemble — jamais par ligne.

**Pourquoi il reste dans `api` et non dans un schéma privé.** La règle générale
veut qu'une fonction `SECURITY DEFINER` sorte du schéma exposé. Elle ne
s'applique pas ici, pour une raison mécanique : le RPC de page est
`SECURITY INVOKER`, donc c'est **l'appelant** (`authenticated`) qui doit pouvoir
exécuter le helper. Le placer dans `internal` exigerait d'accorder `USAGE` sur
`internal` à `authenticated` — ouvrant toute la couche privée, bien au-delà de
cette fonction. Basculer le RPC de page en `DEFINER` changerait en bloc la
sémantique d'autorisation d'un RPC central. Le helper reste donc appelable par
un éditeur via PostgREST, ce qui est sans conséquence : pour un éditeur, ces
données ne sont pas un secret.

### Le gate porte aussi sur le filtre, pas seulement sur l'affichage

Gater l'émission de `missing_essentials` ne suffit pas : un utilisateur
authentifié en lecture seule peut envoyer les deux clés directement à
`api.get_filtered_object_ids`. Si « éditeur et supérieur » est une règle
d'autorisation, elle doit être vérifiée **là aussi**. Le CTE `params` évalue donc
`api.current_user_can_edit_objects()` (constant par requête, un seul InitPlan) et
les clés d'un non-éditeur sont **ignorées**.

Ignorées et non rejetées, pour deux raisons : `get_filtered_object_ids` est
`LANGUAGE sql` et ne peut pas lever d'exception sans une fonction tierce ; et une
dégradation douce évite de casser la session d'un utilisateur dont le rôle change
en cours de route. Ignorer ne divulgue rien — le filtre est simplement sans effet.

---

## 4. Contrat RPC

### `api.get_filtered_object_ids` — deux clés dans `p_filters`

| Clé | Type | Sémantique |
|---|---|---|
| `missing_essentials_buckets` | `text[]` parmi `complete` / `few` / `many` | 0 · 1–2 · 3+ manquants. OU interne |
| `missing_essentials_any` | `text[]` parmi les 7 codes hors `name` | au moins un des essentiels cités est manquant. OU interne |

Les deux clés se combinent **en ET** entre elles, comme toutes les facettes.

Codes de palier plutôt qu'un `min`/`max` : la sélection peut être **non
contiguë** (« complètes » + « 3 et plus »), qu'un intervalle ne sait pas
exprimer.

**Garde obligatoire en `CASE`, jamais en `OR`** (leçon §197) :

```sql
AND CASE WHEN params.missing_buckets IS NULL AND params.missing_any IS NULL
         THEN TRUE
         ELSE <prédicat sur la vue>
    END
```

Un `AND (garde IS NULL OR <coûteux>)` ne garantit pas le court-circuit : le
planificateur réordonne les quals par coût. `CASE` court-circuite, lui. Un
`LEFT JOIN LATERAL (SELECT <coûteux> … WHERE <garde>)` ne garde rien non plus —
même leçon.

### `api.list_object_resources_filtered_page` — champ `missing_essentials` par carte

Le RPC appelle `api.object_missing_essentials(<ids de la page>)` — un appel
ensembliste, jamais par ligne — et fusionne le résultat dans les cartes. Le
champ est absent pour un appelant non-éditeur, puisque le helper rend un
ensemble vide.

**Émis dès que l'appelant est éditeur, sans condition sur le filtre.** Mesuré :
**2,0 ms pour une page de 24 fiches**, tout en index scan. Conditionner
l'émission à « le filtre est actif » aurait économisé 2 ms et privé la colonne
Table de ses données filtre éteint — mauvais échange.

Le gating « éditeur et supérieur » est donc **réel côté serveur**, pas seulement
masqué à l'écran.

### ⚠️ Contrainte d'implémentation : où vit le corps courant

`api.get_filtered_object_ids` est **redéfini plusieurs fois** dans le manifeste.
La dernière définition n'est PAS la migration phonétique :

```
16k   migration_label_filter_sections.sql
16k2  migration_explorer_fuzzy_search.sql
16k3  migration_explorer_phonetic_search.sql
…
taxo6 migration_accommodation_unit_type.sql   ← DERNIÈRE définition (l. 318)
```

Vérifié en base : le corps déployé fait 43 378 caractères et contient **à la
fois** `dmetaphone` (§199) et `accommodation_unit_types_any` (§201). Partir de
la migration phonétique ferait **régresser §201** ; partir de la fuzzy ferait
régresser §199 et §201.

`api.list_object_resources_filtered_page` : dernière définition dans
`migration_label_filter_sections.sql` (16k), rien après ne la redéfinit.
7 812 caractères en base.

Le corps de 43 Ko se redéploie avec la recette `.tmp_pgapply/apply_range.cjs`
(§106/§16q) — ne pas le charger en contexte.

---

## 5. Frontend

| Fichier | Changement |
|---|---|
| `types/domain.ts` | `ExplorerCommonFilters` += `missingEssentialsBuckets`, `missingEssentialsAny` ; `ObjectCard` += `missing_essentials?: string[]` |
| `store/explorer-store.ts` | setters + purge quand `canEditObjects` retombe à faux (même traitement que `statuses`) |
| `utils/facets.ts` | `buildBucketRpcFilters` → les deux clés RPC |
| `components/explorer/FiltersPanel.tsx` | groupe « Remplissage », sous la **même** condition `canEditObjects` que le groupe « Statut » existant |
| `components/explorer/explorer-active-chips.ts` | puces des deux critères |
| `components/explorer/ResultCardView.tsx` | pastille « N manquants », détail dans le `title` |
| `components/explorer/table-columns.tsx` | colonne « Remplissage » (voir ci-dessous) |
| `features/object-editor/widgets/CompletionRing.tsx` | libellé → « Remplissage » |
| `components/dashboard/CompletenessTable.tsx`, `ScorecardStrip.tsx` | libellés → « Remplissage » |
| `features/help/content/pilotage.ts` | libellé → « remplissage » |

### Pastille

| Manquants | Rendu |
|---|---|
| 0 | rien |
| 1–2 | neutre |
| 3 | ambre |
| 4+ | rouge |

### Colonne Table — un TODO qu'on débloque

`table-columns.tsx:12` porte déjà :

> NB « Complétude » attend que le RPC cards émette le score (backend, remonté à
> la session API) — `ObjectCard` ne le porte pas aujourd'hui.

Notre design le fait porter. La colonne devient une simple entrée du registre
existant (+ `ALL_TABLE_COLUMN_IDS`), sans backend supplémentaire. Le registre
gérant déjà `sortValue`, le tri « les plus vides d'abord » arrive **gratuitement
dans la vue Table** — sans toucher au contrat de tri du RPC de pagination, qui
reste hors périmètre.

---

## 6. Tests

**La garde SQL doit être non vacante** (doctrine §196/§201) : asserter qu'une
clé est acceptée ne prouve pas que le filtre remonte le bon ensemble.

`Base de donnée DLL et API/tests/test_remplissage_filter.sql` :
1. crée des fiches témoins avec des trous **connus** (une complète, une à 1
   manquant, une à 4). **Le bloc type dépend du type d'objet** : pour des témoins
   `HLO`, `e_typeblock` exige une capacité `max_capacity` ou une chambre —
   `object_amenity` ne vaut que pour la branche `ELSE`. S'y tromper donne un
   témoin « complet » à 1 manquant, et un test qui échoue sans que la cause soit
   lisible ;
2. exécute le **vrai** `api.get_filtered_object_ids` ;
3. exige l'**ensemble exact** pour chaque palier et chaque code de facette ;
4. **parité** : `get_dashboard_completeness` rend les mêmes chiffres avant et
   après le rebranchement sur la vue ;
5. **gardes du helper** `api.object_missing_essentials` : ensemble vide pour un
   appelant non-éditeur, et un id passé en argument mais hors du périmètre
   lisible est écarté (ne pas faire confiance à la liste reçue) ;
6. **gate du filtre** : sous `SET ROLE anon`, les deux clés envoyées à
   `api.get_filtered_object_ids` sont ignorées — les témoins ressortent tous ;
7. vérifié **rouge par sabotage** avant d'être considéré comme une garde.

Le point 5 demande un vrai `SET ROLE` : exécuté en superuser, le test passerait
sans rien prouver — le piège relevé au §48 sur `test_actor_links_editor.sql`.

Front : masquage du groupe pour un lecteur seul, construction du payload,
rendu de la pastille et des puces, purge à la perte de `canEditObjects`.

---

## 7. Hors périmètre

| Écarté | Raison |
|---|---|
| Compteurs par palier dans le panneau (409 / 397 / 39) | demanderait un appel d'agrégat à chaque changement de filtre ; non demandé |
| Tri « les plus vides d'abord » dans la vue Cartes | arbitré : pastille seule. La vue Table l'obtient gratuitement par son registre |
| Les 15 % complémentaire et 5 % bonus du modèle éditeur en SQL | réplique du TypeScript, dérive garantie |
| Colonne cachée `object.cached_missing_essentials` | voir §3 |
| Renommage des identifiants SQL / clés RPC | « remplissage » est un libellé ; les clés décrivent la donnée (`missing_essentials`) |

---

## 8. Ce qui reste incertain

- Le coût de 23 ms est mesuré sur **846 fiches**. Il croît linéairement avec le
  corpus ; au-delà de ~5 000 fiches il faudra reconsidérer la colonne cachée.
- `n_photos` compte **toutes** les lignes `media` (vidéos et documents inclus) —
  approximation héritée du bundle existant, documentée là-bas, non corrigée ici
  pour ne pas déplacer les chiffres du Dashboard dans la même passe.

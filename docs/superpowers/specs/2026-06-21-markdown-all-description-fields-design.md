# Markdown pour tous les champs de description — servis en clair (sans styles) ET structurés (Markdown)

- **Date** : 2026-06-21
- **Périmètre** : champs de description publics de l'objet (éditeur pleine page, RPCs de lecture, tiroir Explorer)
- **Statut** : conception **révisée après revue adversariale** (42 constats, vérifiés sur le code) — en attente de relecture PO
- **Filiation** : généralise [`2026-06-15-section10-adapted-description-markdown-editor-design.md`](2026-06-15-section10-adapted-description-markdown-editor-design.md) (dont le « hors périmètre » prévoyait déjà *« Réutiliser `MarkdownEditor` pour les descriptions principales »*)

> **Note de révision** : une revue adversariale (4 angles + synthèse, sur le code live) a invalidé la v1 (verdict *needs-rework*). Les corrections sont intégrées ci-dessous et signalées par **[R]**. Les constats « fausse alerte » sont consignés en Annexe A pour éviter qu'on les re-chasse.

---

## 1. Contexte & problème

Aujourd'hui **un seul** champ est éditable en Markdown : la « Description adaptée » (`object_description.description_adapted`, §09/§10 Accessibilité). Elle s'édite via un WYSIWYG (`MarkdownEditor`, TipTap + `tiptap-markdown`) qui **stocke du Markdown** comme valeur canonique, et se rend via `MarkdownContent` (`markdown-to-jsx`, durci XSS ; sous-ensemble : H2/H3, gras, italique, listes, citation, liens validés).

Tous les autres champs de prose sont de simples `<Textarea>` stockés en **texte brut**. **Aucun rendu/strip Markdown serveur n'existe** : l'API renvoie les colonnes telles quelles.

Le PO veut :

1. **Généraliser** la capacité Markdown à **tous les champs de description publics** — pour y ajouter de la **structure**.
2. Que l'API les serve **avec ET sans styles** :
   - **sans styles** → la clé existante (ex. `description`) renvoie du **texte propre** (aucune syntaxe Markdown visible), comme aujourd'hui ;
   - **avec styles** → une **nouvelle clé sœur** `description_md` porte la **source Markdown** structurée.

La tension à résoudre (le « mais ») : les consommateurs « plats » — **cartes Explorer, carte géographique, recherche, exports tiers (InDesign/GPX/KML), intégrations** — ne doivent **jamais** recevoir de `**gras**` ou `## titre` bruts. Le contrat « clé plate = texte propre » doit être préservé partout.

**[R] Exception assumée — l'export OUTILS JSON** (`object-io-serialize.ts`) sérialise le **brouillon éditable complet** pour ré-import : il **doit** porter le Markdown brut (c'est la valeur éditable, ré-importable). Ce n'est **pas** un consommateur « plat ». L'export CSV ne contient aucune colonne de description (inchangé).

## 2. Objectifs / non-objectifs

**Objectifs**
- Rendre **Markdown-éditables** les champs de description publics qui **ont une surface d'édition** (§3), en **réutilisant** `MarkdownEditor` / `MarkdownContent`.
- Faire émettre par **toutes** les voies de lecture, pour chaque colonne en périmètre, **deux représentations** issues d'**une seule source** : la clé existante = **texte propre** (`strip_markdown`), une clé `*_md` = **Markdown** (sur les voies riches).
- **Une seule source de vérité** : le Markdown stocké dans les colonnes texte **existantes** ; le texte propre est **dérivé à la lecture**.
- Préserver multilingue, gating de droits, et **compatibilité ascendante** des consommateurs plats — **vérifiée par diff sur données live** (pas postulée).

**Non-objectifs (différés)**
- Champs **non-publics / opérationnels** : notes CRM, conditions tarifaires (`object_price/discount.conditions`), notes de classement/durabilité/relation, légendes média, `object_iti.status_note`.
- **Rendu HTML côté serveur.** « Avec styles » = Markdown brut rendu par `MarkdownContent` (client), **pas** de HTML produit en SQL.
- Site public hors dépôt.
- **[R] Construction de nouvelles surfaces d'édition/rendu** pour les colonnes de prose de type qui n'en ont pas (cf. §3.3, §7) — au-delà du *swap* des surfaces existantes ; voir phasage §12.

## 3. Périmètre (verrouillé, corrigé [R])

Trois axes distincts qu'il faut traiter séparément : **(3.1)** quelles colonnes deviennent Markdown ; **(3.2)** quelles **voies de lecture** doivent strip (plat) ou ajouter `*_md` (riche) ; **(3.3)** quelles colonnes ont réellement une **surface d'édition** à *swapper*.

### 3.1 Colonnes en périmètre (deviennent Markdown canonique)

| Table | Colonne(s) | i18n ? |
|---|---|---|
| `object_description` | `description`, `description_chapo`, `description_mobile`, `description_edition`, `description_adapted` *(déjà MD)* | oui |
| `object_place_description` | `description`, `description_chapo`, `description_adapted` | oui |
| `object_room_type` | `description` | oui |
| `object_menu` / `object_menu_item` | `description` | non |
| `object_iti_stage` | `description` | oui |
| `object_iti_info` | `access`, `ambiance`, `recommended_parking`, `required_equipment`, `info_places` | oui |
| `object_location` | `direction` | non |

**[R] Décisions de bord**
- `object_room_type.bed_config` : **retiré** du périmètre — c'est désormais une **liste de lits structurée** (§72), plus un texte. (La v1 le listait à tort.)
- `description_offre_hors_zone` et `sanitary_measures` (émis par `get_object_resource`, lignes ~2827/2833) : **hors périmètre** (pas de surface d'édition Markdown) → restent du texte brut, **aucun strip** (rien n'y écrira de Markdown). Consignés ici pour qu'on ne les oublie pas et qu'on ne les *swappe* pas.

### 3.2 Voies de lecture à traiter — **[R] liste exhaustive** (la v1 ne nommait que `get_object_cards_batch`)

| Voie de lecture | Type | Action |
|---|---|---|
| `get_object_resource` (single `description`, `descriptions[]`, blocs de type) | riche | clé plate = `strip_markdown(valeur résolue)` **+** clé `*_md` = valeur résolue |
| `get_object_with_deep_data` | riche | **hérite** (embarque `get_object_resource` verbatim, ~ligne 6628) → **assertion** seule, pas de code |
| `get_object_resource_adapted` | riche (mort en app) | aligner le contrat (strip + `*_md`) **ou** documenter déprécié — cf. §12 |
| `get_object_card` (api_views_functions.sql:2040) | **plat** | wrapper `strip_markdown` sur `description_chapo` **et** `description` |
| `get_object_cards_batch` (2346) | **plat** | idem |
| `get_object_map_item` (6882) → `list_objects_map_view` | **plat** | idem (sinon **toute la carte Explorer** fuit) |
| `get_object_room_types` (7171) — RPC publique autonome | **plat/riche** | strip `description` + ajouter `description_md` (RPC tierce sur la même colonne) |
| `export_publication_indesign` (4878) | **plat (tiers print)** | strip `description_edition`/`description` du `print_text` (garder `custom_print_text` tel quel) |
| `export_itinerary_gpx` (7430/7472) + wrapper batch | **plat (tiers GPS)** | strip `od.description` + description d'étape avant l'échappement XML `<desc>` |
| `build_iti_track` (773/796) — KML/GPX | **plat (tiers GPS)** | strip description d'étape avant `<description>` CDATA / `<desc>` |

> Le plan établira la **liste exacte clé-par-clé** par RPC. Le périmètre **colonnes** (3.1) et **voies** (3.2) ci-dessus est verrouillé.

### 3.3 Surfaces d'édition réelles — **[R]** (« swap textarea » sur-estimait)

| Colonne | Surface d'édition aujourd'hui | Action éditeur |
|---|---|---|
| `object_description.description` (§04) | `<Textarea>` | **swap** → `MarkdownEditor` (block) |
| `object_description.description_chapo` (§04) | `<Textarea>` 160c | **swap** → `MarkdownEditor` **variant `inline`** |
| `object_description.description_adapted` (§09/§10) | déjà `MarkdownEditor` | inchangé (repointer la **lecture** sur `*_md`, cf. §6) |
| `object_description.description_mobile` / `description_edition` | **aucune** surface en §04 | **aucun swap** — strip-on-read seulement |
| `object_place_description.description` (§16) | `<Textarea>` | **swap** → `MarkdownEditor` |
| `object_place_description.description_chapo` / `description_adapted` | aucune (place.chapo non éditée) | strip-on-read seulement |
| `object_room_type.description` (RoomEditModal) | `<Textarea>` | **swap** → `MarkdownEditor` |
| `object_menu(_item).description` | **aucune** (l'éditeur menus édite `name` / items, pas un descriptif menu) | strip-on-read seulement |
| `object_iti_stage.description` (§16) | **`<Input>` mono-ligne** | swap → `MarkdownEditor` = **changement de layout §16 (validé PO 2026-06-21)** |
| `object_iti_info.*` (5 champs) | textareas (bloc ITI) | swap → `MarkdownEditor` |
| `object_location.direction` (§02) | `<Textarea>` | **swap** → `MarkdownEditor` |

**Conséquence** : une colonne peut être **strip-on-read sans éditeur** (mobile/editorial, place.chapo, menu.description). Le contrat plat reste correct (rien n'y injecte de Markdown tant qu'aucun éditeur n'écrit), mais on strip quand même par **cohérence défensive** (un import pourrait y mettre du Markdown).

## 4. Décision d'architecture (Approche A, corrigée [R])

| Décision | Choix |
|---|---|
| Stockage | **Markdown canonique** dans les colonnes texte **existantes** (aucune colonne ajoutée) |
| Texte propre | **dérivé à la lecture** via `internal.strip_markdown()` (`IMMUTABLE`) |
| Contrat API **[R]** | les RPCs émettent des **scalaires résolus par langue** (`i18n_pick(col_i18n, lang)`), pas des maps : **clé plate** = `strip_markdown(i18n_pick(...))` · **clé `*_md`** = `i18n_pick(...)` (non strippée). **Pas** de clés `*_i18n` ajoutées sur la voie riche. |
| Maps i18n brutes | `internal.strip_markdown_jsonb()` n'est utilisée **que** là où une **map brute** est émise — c.-à-d. les legs **éditeur** `canonical_description`/`org_description` (lignes brutes complètes). **[R]** |
| Mode de livraison | les **deux** clés sur la voie riche ; **plat seul** sur cartes/carte/exports |
| Édition | réutilise `MarkdownEditor` (+ variant `inline`) |
| Rendu | réutilise `MarkdownContent` (jamais de `dangerouslySetInnerHTML`) |

Approches B (colonnes `*_md`) / C (colonne `*_plain` par trigger) écartées (dérive de schéma sur ~7 tables).

## 5. `internal.strip_markdown` — sémantique **précise** [R]

Fonction **`IMMUTABLE STRICT`** (schéma `internal`), bornée au sous-ensemble que `MarkdownEditor` **émet réellement** (le plan **vérifie** ce que `tiptap-markdown` sérialise : `*`/`**` pour italique/gras, forme des liens), idempotente, sans backtracking catastrophique.

### 5.1 Règles, **ordre figé** (load-bearing)
Appliquer dans cet ordre exact :
1. **Images** `![alt](url)` → **supprimées entièrement** (cohérent avec le renderer qui mappe `img→null`). *Avant* les liens (sinon `!` résiduel).
2. **Liens** `[label](url)` → `label`. Tolérer les **parenthèses dans l'URL** (URL Maps) : matcher jusqu'à la `)` finale du motif lien sur la ligne, OU documenter la limite + test `parens-in-URL`. Formes *reference-style* `[label][ref]` et **autolinks** (l'éditeur a `autolink:true`) : le plan **vérifie** la forme sérialisée et la traite ; à défaut, limitation documentée + test.
3. **Emphase** : seulement les marqueurs **émis** (`**x**`→`x`, `*x*`→`x`). Ne **pas** toucher `_` simple (protège `fichier_2024_final`), ne strip que les **paires** (protège `10€ * 2` non apparié). Cas `***x***` / `**a** **b**` : règles left/right-flanking **ou** limite assumée + tests.
4. **Titres** `^#{1,3}[ \t]+` → retire le marqueur (l'**espace est requis** → `#1` survit). Setext (`Titre\n===`) : vérifier s'il est émis ; sinon retirer la ligne de soulignement.
5. **Listes** `^[ \t]*[-*+][ \t]+` et `^[ \t]*\d+\.[ \t]+` → retire le marqueur (espace requis ; multi-chiffres `10.` ; ancré en début de ligne → `Lun - Ven`, `Phase 2. Lancement` non touchés).
6. **Citation** `^[ \t]*>[ \t]?` → retire (jusqu'à point fixe pour `> > `).
7. **Échappements** `\*`→`*`, `\_`→`_`, etc. (aligné sur le renderer).
8. **Lignes vides** 3+ → 1.

**Toutes** les règles de bloc (4–6) sont **ancrées `^`** avec les **flags Postgres `gn`** (`g` global, `n` = `^`/`$` multi-lignes). Oublier `n` = corruption (`regexp_replace` ancre sur le **début de chaîne** seul par défaut).

### 5.2 Variante cartes [R]
Ordre **figé** : `strip_markdown(source COMPLETE)` → **collapse des sauts de ligne en espaces** → **un seul** `LEFT(…, 200)`. **Retirer** le `LEFT(description,200)` **interne** existant (tronquer avant de stripper laisserait un demi-marqueur). Insérer un séparateur aux frontières de titre pour éviter le *run-on* après collapse.

### 5.3 Companion i18n
`internal.strip_markdown_jsonb(jsonb) → jsonb` : applique `strip_markdown` à chaque valeur d'une map `lang→texte`. **Contrat** [R] : valeur JSON `null` → préservée `null` ; valeur non-string → passthrough ; entrée non-objet → renvoyée telle quelle ; objet vide → round-trip ; clés inconnues préservées et **non réordonnées**. **Uniquement** pour les legs éditeur (maps brutes), pas pour la voie riche (scalaires).

### 5.4 Garanties
- **Idempotence** prouvée/à point fixe y compris sur imbriqués (`> > x`, `***x***`, `\n\n\n\n`) — testée, pas seulement sur texte plat.
- **Perf** : `IMMUTABLE` ; budget vérifié sur `get_object_cards_batch` pire cas vs l'invariant hot-path (~75 ms, CLAUDE.md §36) ; regex sans backtracking catastrophique.
- **EXECUTE** : énumérer les voies `DEFINER` vs `INVOKER` ; pour toute voie `INVOKER`, `GRANT EXECUTE` à `anon`+`authenticated` (gotcha P0.3) ; *fuzz test* « strip ne lève jamais ».

## 6. Édition (éditeur pleine page) [R]

- **Invariant data-loss (le risque #1)** : les legs **`canonical_description` / `org_description`** (lignes brutes complètes lues par `object-workspace-parser.ts:1180-1181,1327`) **NE SONT JAMAIS strippées** — elles portent le **Markdown brut** dont l'éditeur a besoin pour éditer/ré-enregistrer sans perte. Le strip ne s'applique **que** aux clés **publiques** (`description` single, `descriptions[]`, blocs de type). **Test obligatoire** : `charger → enregistrer → recharger` **octet-identique** (niveau parser, éditeur mocké).
- Chaque champ **avec surface** (§3.3) passe de `<Textarea>`/`<Input>` à **`MarkdownEditor`** via **`MarkdownEditorLazy`** (TipTap reste hors bundle initial, comme §10). L'éditeur **lit la valeur brute** et **réécrit du Markdown** dans la même colonne ; **payloads/RPCs d'écriture inchangés**.
- **`description_adapted`** : aujourd'hui rendu côté **tiroir** via la clé plate `description_adapted` ; après strip de cette clé, le **tiroir** lit `description_adapted_md` (la lecture **éditeur** via `canonical_description` reste brute → inchangée).
- **`MarkdownEditor` — variant `inline`** : nouvelle prop `variant?: 'block' | 'inline'`, câblée à **deux endroits** : `StarterKit.configure` (`heading:false`, listes/citation off) **et** la `Toolbar` (n'afficher que gras/italique/lien). Défaut `block`. Utilisé par l'**Accroche**.
- **Limite ≤160 de l'Accroche** : enforced dans le **wrapper de champ**, pas dans l'éditeur ; cf. décision §3 (Nuance Accroche).

## 7. Rendu (lecture publique) [R]

- **Famille `object_description`** : généraliser `OverviewSection`/`renderCopy` (`ObjectDetailView.tsx`) pour rendre via `MarkdownContent` à partir de `*_md` quand présent, sinon `<p>`. Supprime le cas spécial `adaptedDescription`-only.
- **Prose spécifique au type** : aujourd'hui le tiroir **ne rend quasiment aucune** de ces proses (rooms/menus/places/iti/direction). Donc, par champ : soit une surface de rendu existe → la passer en `MarkdownContent` ; soit **elle n'existe pas** → l'API **émet `*_md`** (prêt pour un futur rendu) mais le rendu est **nouveau travail nommé** (cf. phasage §12), pas un simple « généraliser renderCopy ».
- **Cartes / carte / exports** : **texte plat** (clé strippée) — aucune régression `**`.

## 8. Flux de données & compatibilité ascendante [R]

```
DB (colonnes texte = Markdown)                         ← source unique
  ├─ voie riche (get_object_resource & co.)
  │     ├─ <clé>     = strip_markdown(i18n_pick(col_i18n, lang))   → texte propre (sans styles)
  │     └─ <clé>_md  = i18n_pick(col_i18n, lang)                   → Markdown (avec styles)
  │           └─ tiroir → MarkdownContent (rendu sûr)
  ├─ voie plate (cards/map/exports) → strip_markdown(source) [+collapse] [+LEFT 200]
  └─ legs éditeur (canonical_description / org_description) → maps BRUTES (jamais strippées)
        └─ MarkdownEditor → onChange(md) → payload INCHANGÉ → upsert (texte) → DB
```

**Composition des blocs [R]** : `get_object_resource` passe par `resource_block_descriptions` (pick-list) et `resource_block_misc` (subtract-list) (api_views_functions.sql:2420, ~2491-2514). Les **nouvelles clés `*_md`** doivent être **ajoutées aux deux listes** sinon elles atterrissent dans `misc` (ou disparaissent). **Étape explicite du plan.**

**Blocs `to_jsonb(row)` [R]** : `places`, `location`, `menus`, `iti_info`/`iti_stage` sont construits par `to_jsonb(ligne)` → la **clé plate y porte la colonne BRUTE**. Ajouter seulement `*_md` **laisserait la clé plate fuir du Markdown**. Pour chaque colonne en périmètre de ces blocs, **surcharger** la clé plate en `strip_markdown(col)` (i18n via `strip_markdown_jsonb` si map) **et** ajouter `*_md`, en remplaçant le passthrough `to_jsonb` (lignes ~3748/3767/4125/4171/3938/3975).

**Compatibilité ascendante — la v1 affirmait à tort « strip = no-op sur l'existant »** [R]. Les ~840 lignes de prose live ont été saisies en texte libre et contiennent des marqueurs **fortuits** (`- ` listes, `*Promo*`, `#1`, `> 15 ans`, `1.`, underscores, `[texte]`). Après bascule, la clé plate les **réinterprète** → régression silencieuse possible (`10€ - 15€`, `#1 du quartier`). **Mitigations cumulées** :
1. règles **ancrées en début de ligne + espace requis + marqueurs émis seulement** (§5) → réduit massivement les faux positifs (`Lun - Ven`, `fichier_2024_final`, `#1` survivent) ;
2. **gate de vérification pré-déploiement** : exécuter le strip proposé sur un **snapshot de toutes les colonnes en périmètre**, **diff input/output**, trier chaque ligne modifiée ;
3. décision documentée. **Décision PO 2026-06-21** : on retient (1)+(2) — règles ancrées + gate de diff + tri des lignes modifiées ; **pas** de migration d'échappement des marqueurs fortuits (mute 840 lignes + complique l'édition). La revendication de compat est **conditionnée** à ce gate, pas postulée.

**Colonnes `*_normalized` générées [R]** : `object_description.description_normalized` / `description_chapo_normalized` (+ index trigram GIN, schema_unified.sql:1361-1362,668) sont **GENERATED STORED** sur les colonnes en périmètre → contiendront les marqueurs une fois la colonne en Markdown. Soit **redéfinir** la génération sur `internal.strip_markdown(...)` (autorisé car `IMMUTABLE`), soit documenter qu'elles portent du Markdown (et stripper à la requête). Pas de fuite active aujourd'hui (index inutilisés) mais à traiter pour la qualité de recherche future.

## 9. Sécurité

- **Jamais** de `dangerouslySetInnerHTML` ; `markdown-to-jsx` avec `disableParsingRawHTML: true` (HTML inline rendu comme texte).
- Liens : schéma validé (`http`/`https`/`mailto`) + `rel="noopener noreferrer"`, à l'édition **et** au rendu (déjà en place).
- `MarkdownEditor` : `Markdown.configure({ html: false })`.
- `strip_markdown` ne fait que **retirer** des marqueurs (jamais d'interprétation HTML) → aucune surface d'injection ajoutée.

## 10. Tests [R]

- **SQL `test_strip_markdown.sql`** : chaque règle de §5 ; **cas négatifs** (`sous-titre`, `Lun - Ven`, `Phase 2. Lancement`, `#1 du quartier`, `fichier_2024_final`, `10€ * 2`) ; **liens** (`parens-in-URL`, image, autolink) ; **idempotence imbriquée** (`> > x`, `***x***`, `\n\n\n\n`) ; `strip_markdown_jsonb` (null/non-string/objet vide) ; *fuzz* « ne lève jamais ».
- **Assertions RPC** : pour un objet à description Markdown, sur chaque voie de §3.2 : clé plate **strippée**, clé `*_md` **brute** ; cartes/map/exports **sans `**`/`#`**. **Assertion d'héritage** : `get_object_with_deep_data` porte les deux clés (pass-through verbatim, ~6628).
- **Round-trip éditeur (anti data-loss)** : test parser-level — la valeur remise au champ = le **Markdown brut** et round-trip inchangée (attrape la perte de structure même éditeur mocké).
- **Gate données live** : diff strip sur snapshot des colonnes en périmètre (cf. §8).
- **Frontend** : câblage `MarkdownEditor`/Lazy par surface *swappée* (éditeur **mocké**) ; variant `inline` de l'Accroche (titres/listes absents) ; rendu `MarkdownContent` de la famille `object_description` dans le tiroir ; suite FE verte + `tsc` + `next build` exit 0.
- **Perf** : EXPLAIN/timing `get_object_cards_batch` pire cas vs budget hot-path.

## 11. Intégrité de déploiement & rollback [R]

- Nouveau `migration_markdown_strip_descriptions.sql` (création `strip_markdown` + `strip_markdown_jsonb` ; ré-création des RPCs de §3.2 ; mise à jour des allow-lists `resource_block_*` ; surcharge des clés des blocs `to_jsonb` ; éventuelle redéfinition des colonnes `*_normalized`).
- **Foldé** dans `schema_unified.sql` (fonctions, colonnes générées) **et** `api_views_functions.sql` (RPCs), ajouté au **manifeste/runbook** (`SQL_ROLLOUT_RUNBOOK.md`), prochain id **14v**, couvert par le **gate CI fresh-apply**.
- `NOTIFY pgrst` après déploiement.
- **Rollback** : le strip est **additif en lecture** (pas de changement de données, sauf colonnes `*_normalized` si redéfinies) → rollback = redéployer les corps de RPC antérieurs. Vérifier qu'aucun changement de **signature/type de retour** n'impose un `DROP`+`CREATE` (sinon le séquencer).
- MAJ `lot1_mapping_decisions.md` (décision §105) + proposition d'invariant CLAUDE.md (§13).

## 12. Phasage (verrouillé PO 2026-06-21) [R] (chaque étape livrable et vérifiable seule)

**Décision PO : livrer la famille `object_description` d'abord** (phases 1–4 = **1ʳᵉ livraison**), puis le **type-spécifique** (phases 5–7 = **2ᵈᵉ livraison**, son propre plan). Conséquence sur la phase 2 : la 1ʳᵉ livraison ne strip que les lecteurs plats de la **famille `object_description`** (cartes, carte, InDesign — qui lisent `description_chapo`/`description`/`description_edition`) ; le strip GPX/KML (`build_iti_track`, `export_itinerary_gpx`) et `get_object_room_types` part avec la 2ᵈᵉ livraison (ils lisent des colonnes de type qui ne recevront du Markdown qu'en phase 6). Le strip restant un *no-op* tant qu'aucun Markdown n'est écrit, cet ordre est sûr.

1. **Socle SQL** : `strip_markdown` + `strip_markdown_jsonb` + tests SQL + **gate diff** sur données live. *(aucune RPC modifiée — isolé)*
2. **Voies plates** : wrapper `strip_markdown` dans `get_object_card`, `get_object_cards_batch`, `get_object_map_item` (→ map view), `export_publication_indesign`, `export_itinerary_gpx`/`build_iti_track` (+ wrappers batch). Tests anti-fuite. *(protège les tiers AVANT toute écriture Markdown)*
3. **Voie riche `object_description`** : `get_object_resource` (single + `descriptions[]`) + `get_object_resource_adapted` → clés `*_md` ; **MAJ allow-lists** `resource_block_descriptions`/`misc` ; **legs éditeur restent bruts**. Assertions RPC + deep-data.
4. **Éditeur famille `object_description`** : variant `inline` ; swap §04 Descriptif + Accroche ; repoint **tiroir** `description_adapted`→`*_md` ; généraliser `renderCopy`. Tests FE + **round-trip**.
5. **Type-spécifique — backend** : blocs `places`/`room_types`/menus/iti/location de `get_object_resource` (**surcharge clé plate + `*_md`** sur les blocs `to_jsonb`) + `get_object_room_types`. Assertions.
6. **Type-spécifique — surfaces** : swaps existants (room.description, location.direction, place.description, iti_info) ; ITI stage `Input`→éditeur (layout) ; rendu tiroir **là où une surface existe / nouveau rendu nommé**.
7. **Intégrité deploy** : fold + manifeste/runbook + fresh-apply + colonnes `*_normalized` + décision log + CLAUDE.md.

1→3 et 5 sont backend ; 4 et 6 frontend. **Les étapes 1–2 sont sans risque et protègent les consommateurs plats avant toute écriture de Markdown** — ordre important.

## 13. Invariant proposé pour CLAUDE.md [R]

> **Descriptions — Markdown canonique servi en clair + structuré.** Les champs de description **publics** (famille `object_description` + prose publique des facettes de type, cf. décision log §105) stockent du **Markdown** dans leur colonne texte existante (édité via `MarkdownEditor`, sous-ensemble H2/H3 · gras · italique · listes · citation · liens validés ; les champs *teaser* type `description_chapo` n'utilisent que le sous-ensemble **inline**, sans structure de bloc). **Toute** voie de lecture émet deux représentations dérivées d'**une seule** source : la clé historique = `internal.strip_markdown(i18n_pick(col_i18n, lang))` (**texte propre** — contrat plat préservé pour cartes, carte géo, recherche, exports InDesign/GPX/KML, tiers) et une clé sœur `*_md` = la valeur résolue brute (**Markdown**, rendu **client** par `MarkdownContent` ; jamais de HTML serveur ni `dangerouslySetInnerHTML`). **Tout lecteur plat** d'une de ces colonnes (cartes, exports, blocs `to_jsonb(row)`) DOIT wrapper dans `strip_markdown` — `to_jsonb(ligne)` porte la colonne brute, donc surcharger la clé plate. Les legs **éditeur** (`canonical_description`/`org_description`) ne sont **jamais** strippés (l'éditeur a besoin du brut pour ré-enregistrer sans perte). `strip_markdown` est `IMMUTABLE`, ancrée en début de ligne, bornée aux marqueurs réellement émis par l'éditeur ; pas de colonne `*_plain`/`*_md` dupliquée (source unique). Étendre le périmètre = ajouter la colonne (§3.1), traiter **toutes** ses voies de lecture (§3.2), et émettre `*_md` sur les voies riches.

## 14. Liste indicative des changements

**Nouveaux** : `migration_markdown_strip_descriptions.sql` ; `test_strip_markdown.sql` (+ tests RPC) ; tests FE par surface.
**Modifiés backend** : `api_views_functions.sql` (toutes les RPCs de §3.2 + allow-lists + blocs `to_jsonb`), `schema_unified.sql` (fonctions + colonnes `*_normalized`), `SQL_ROLLOUT_RUNBOOK.md` (14v).
**Modifiés frontend** : `MarkdownEditor.tsx` (prop `variant`) + `MarkdownEditorLazy.tsx` (passthrough) ; sections/modales §04, §02, §16, RoomEditModal, bloc ITI ; `ObjectDetailView.tsx` (`renderCopy` + blocs de type) ; parser/loaders (repoint **tiroir** `description_adapted`→`*_md`).
**Inchangés (vérifiés)** : schéma **colonnes** de description, payloads/RPCs d'**écriture**, `MarkdownContent`, cœur `MarkdownEditor` (hors `variant`), legs éditeur bruts.

---

## Annexe A — Fausses alertes écartées par la revue (ne pas re-chasser)

Vérifié sur le code : **aucune** prose en périmètre n'est lue par — `get_dashboard_completeness` (présence seule, n'émet pas le texte), la recherche plein-texte (vecteurs `name`/`city`, pas de tsvector sur `description`), le cache image de couverture, `refresh_open_status`, `get_media_for_web`, `get_object_reviews`, les données acteur/org. Côté frontend, `ResultCardView`/`MapPanel`/métadonnées SEO ne lisent **aucune** prose en périmètre (ils consomment les clés plates des cartes). `get_object_with_deep_data` hérite `*_md` par embarquement verbatim de `get_object_resource` (assertion, pas de code). L'export **CSV** OUTILS ne contient aucune colonne de description.

## Décisions PO (verrouillées 2026-06-21)

1. **Phasage** → **famille `object_description` d'abord** (phases 1–4, 1ʳᵉ livraison), type-spécifique en suite (phases 5–7, plan séparé).
2. **ITI stage** → **oui**, passer le descriptif d'étape à un éditeur bloc Markdown (changement de layout §16 assumé) — fait partie de la 2ᵈᵉ livraison.
3. **Données live** → règles strip **ancrées** + **diff de vérification** pré-déploiement + tri des lignes modifiées ; **pas** de migration d'échappement.

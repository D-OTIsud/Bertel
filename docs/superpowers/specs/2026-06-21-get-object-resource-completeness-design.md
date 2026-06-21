# Design — Compléter `api.get_object_resource` : 5 facettes autorables (invariant §101)

Date : 2026-06-21
Statut : design validé (en attente de relecture utilisateur)
Périmètre : **backend/API + réconciliation frontend non-cassante**. Changement à faire **avant la production**.

## 1. Problème / objectif

`api.get_object_resource` (RPC `SECURITY DEFINER`, API **consommateur** : drawer, site public, `get_object_with_deep_data`, cartes) n'émet pas toute la donnée **autorable** de l'objet. 5 facettes sont chargées par l'éditeur via des **selects directs** et restent invisibles aux autres consommateurs — violation de l'invariant **§101** (« toute table rattachée à l'objet et éditable DOIT être émise par un RPC consommateur, pas seulement en PostgREST direct »).

Objectif : exposer ces 5 facettes dans `get_object_resource`. `get_object_with_deep_data` en hérite automatiquement (son bloc `object` = cette fonction verbatim). **L'export reste sur le loader éditeur — non touché par cette passe.** Supersède la note §41 (« pas d'édition `get_object_resource` pour `object_zone` »).

Source : `Base de donnée DLL et API/api_views_functions.sql` — `api.get_object_resource` à L2546 (lignes vérifiées cette passe). Parser : `bertel-tourism-ui/src/services/object-workspace-parser.ts`. Loaders : `bertel-tourism-ui/src/services/object-workspace.ts`.

## 2. Périmètre verrouillé (décision PO)

**Contenu complet = 5 facettes** : zones, labels accessibilité, niveau de langue, promotions liées, médias par chambre. **Exclus** (et pourquoi) : UUID internes éditeur (`subvalue_ids`/`document_id`/id bruts — l'API émet la forme dérivée), adhésions non-actives (filtre actif volontaire), file modération / sélections impression (données opérationnelles, pas du contenu objet).

## 3. Conception par facette

### A. Zones — `object_zone` (NOUVEAU bloc)
- **Forme** : top-level `object_zone` (le parser accepte `object_zone`/`object_zones`), `jsonb_agg` de `{insee_commune, position, name}`. `name` via `LEFT JOIN ref_commune rc ON rc.insee_code = z.insee_commune` (LEFT : un `is_active=false` futur ne doit pas dropper la zone). **Ne PAS émettre le catalogue `ref_commune`** (loader-owned).
- **Pattern** : `jsonb_agg(... ORDER BY z.position, z.insee_commune)`, `COALESCE(..., '{}'::jsonb)` (clé omise si zéro zone).
- **Insertion** : après le bloc `activity` (après L3227, avant `prices` L3229). Garde `IF v_fields IS NULL OR 'object_zone' = ANY(v_fields) THEN`. **Pas** de type-gating.
- **Garde** : aucune visibilité par ligne → garde objet en tête (L2584-2597) suffit.
- **Parser** : **aucune édition** — `parseObjectWorkspace` construit déjà `zoneCodes` depuis `raw.object_zone[].insee_commune` (L3257-3260).

### B. Labels accessibilité — `object_classification` `display_group='accessibility_labels'` (NOUVEAU bloc + MODIF)
- **Forme** : top-level `accessibility_labels`, 1 ligne/classification, forme `ObjectWorkspaceDistinctionItem` (§10) : `{id, scheme, scheme_name, value, value_name, value_id, status, awarded_at, valid_until, document_id, disability_types_covered[]}`. Clés `scheme`/`value` (pas `*_code`) pour matcher le parser ; inclure `value_id`. `disability_types_covered` = sous-requête `unnest(subvalue_ids) → ref_classification_value.metadata->>'disability_type'` (verbatim de L3294-3302 / fn adaptée L8701-8706).
- **Statuts** : **TOUS** (pas de filtre `status='granted'` — l'éditeur §10 voit requested/granted/suspended/expired).
- **Pattern** : `COALESCE(..., '[]'::jsonb)`. Garde `IF v_fields IS NULL OR 'accessibility_labels' = ANY(v_fields) THEN`.
- **Insertion** : juste APRÈS le bloc `sustainability_labels` (après L3818), avant `sustainability_actions` (L3821).
- **MODIF OBLIGATOIRE** : rétrécir le WHERE de `sustainability_labels` à **L3815** de `display_group IN ('sustainability_labels','accessibility_labels')` → `display_group = 'sustainability_labels'` (sinon double-emit).
- **Câblage compose (NE PAS RATER)** : ajouter `'accessibility_labels'` (1) dans `resource_block_itinerary` (L2477) **et** (2) dans la strip-list misc (L2511), à côté de `sustainability_labels`. Sinon `accessibility_labels` disparaît sur le chemin `deep_data`.
- **Parser** : **édition requise** — `parseWorkspaceDistinctionsModule` (L1737-1745) ne prend pas `raw` aujourd'hui (tout vide). Le faire accepter `raw` et lire `raw.accessibility_labels` → `accessibilityLabels[]`.

### C. Niveau de langue — `object_language.level_id` (MODIF du bloc `languages`)
- **Forme** : chaque entrée `languages[]` gagne `'level'` : `{code, name} | null` (null, pas omis). Inner : `jsonb_build_object('code', rl.code, 'name', rl.name, 'level', CASE WHEN lvl.id IS NULL THEN NULL ELSE jsonb_build_object('code', lvl.code, 'name', COALESCE(api.i18n_pick_strict(lvl.name_i18n, lang, 'fr'), lvl.name)) END)`.
- **Insertion** : in-place — `LEFT JOIN ref_code_language_level lvl ON lvl.id = ol.level_id` après L3038 (LEFT load-bearing : `level_id` NULLABLE, `ON DELETE SET NULL`), étendre le `jsonb_build_object` L3034. Garder la garde `'languages'` + `ORDER BY rl.name, rl.code`. Pas de changement compose.
- **Parser** : **édition requise** — `parseWorkspaceCharacteristicsModule` (L1599-1668) blanchit `levelId/levelCode/levelLabel` (L1613-1615). Lire `record.level?.code`→`levelCode`, `.name`→`levelLabel`, résoudre `levelId` via `languageLevelOptions` par code.

### D. Promotions liées — `promotion_object → promotion` (NOUVEAU bloc)
- **Forme** : top-level `promotions`, `jsonb_agg` de la forme jonction que le parser lit déjà (`normalizePromotionSummary`) : `{promotion_id, promotion: {id, code, name, discount_type, discount_value, currency, valid_from, valid_to, is_active, is_public}}`. `COALESCE(..., '[]'::jsonb)`.
- **Insertion** : zone §13 pricing, après `prices` (~L3229+), près de `discounts`. Garde `IF v_fields IS NULL OR 'promotions' = ANY(v_fields) THEN`. Pas de type-gating. Fall-through misc (pas dans strip-list) → pas de câblage compose.
- **GARDE CRITIQUE (§49, load-bearing)** : le DEFINER contourne la RLS → le WHERE **DOIT** répliquer `AND p.is_public = TRUE AND p.is_active = TRUE` (le select loader ne renvoie que ça via la policy `rls_policies.sql` L1317-1318). Omettre = fuite de promos privées/inactives.
- **Parser** : **édition requise** — `parseWorkspacePricingModule` blanchit `promotions:[]` (L1824). Lire `raw.promotions` via `normalizePromotionSummary` partagé.

### E. Médias par chambre — `object_room_type_media` (MODIF du bloc `room_types`)
- **Forme** : chaque chambre gagne `'media'` (sibling de `amenities` L3674 / `beds` L3684), array de `{id, url, title, credit, is_main, is_published, position}` (porté de la fn non-appelée `api.get_object_room_types` L7203-7218). Le parser lit `media[].id` → `mediaIds`.
- **Insertion** : virgule après le `beds` COALESCE (après L3693), ajouter le `media` COALESCE avant le `)` fermant L3694. Pas de garde séparée (suit la garde `room_types` + boucle chambre `rt.object_id = obj.id AND (v_can_read_extended OR rt.is_published IS TRUE)`). Fall-through misc.
- **GARDE CRITIQUE (§49/§59, load-bearing)** : inner SELECT **DOIT** composer `AND m.is_published = TRUE AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')` (identique au média-item-menu L4234 ; NULL ≈ public pour média). Une chambre publiée peut porter un média non-publié/privé. `v_can_read_extended` en scope (L2578).
- **Parser** : **aucune édition** — `parseWorkspaceRoomsModule` lit déjà `record.media[].id`→`mediaIds` (L1906-1908).

## 4. Transversal

- **Garde lecture** : 1 garde objet en tête (L2584-2597 : `published OR can_read_extended`). Suffit pour A/B/C (pas de visibilité par ligne). **Insuffisant** pour **D** et **E** (visibilité par champ, RLS bypassée) → répliquer le filtre (cf. §3 D/E). Ce sont les 2 cas §49 « les gardes de champ se composent, ne se substituent jamais ».
- **Type-gating** : seul **E** est implicitement type-scopé (suit `room_types`). A–D **universels** — ne PAS ajouter `IF obj.object_type IN (...)`.
- **Héritage deep_data** : `get_object_with_deep_data` compose `get_object_resource` verbatim. C/E suivent des clés déjà routées ; A/D suivent le fall-through misc ; **B DOIT être câblé** (resource_block_itinerary L2477 + strip misc L2511) — sinon `accessibility_labels` dropé en deep_data.

## 5. Déploiement (process §101, avant prod)

1. **Éditer la source** `api_views_functions.sql` (la source EST le schéma — fold obligatoire).
2. **Appliquer** `CREATE OR REPLACE FUNCTION api.get_object_resource(...)` (corps complet ~2300 lignes) au **live** via MCP Supabase (`apply_migration`/`execute_sql`) ; les 2 edits compose de B (`resource_block_itinerary` + `resource_block_misc`) = `CREATE OR REPLACE` de ces petites fns, **même migration**.
3. **`get_advisors`** (sécurité+perf) — seulement les notices §36 DEFINER-executable préexistantes ; **aucun nouveau flag**.
4. **Test comportemental** chaque clé sur un objet réel (`-> 'object_zone'`, `-> 'accessibility_labels'`, `-> 'promotions'`, `-> 'languages' -> 0 -> 'level'`, `-> 'room_types' -> 0 -> 'media'`). Pour B : assert PAS aussi sous `sustainability_labels`. Pour **D/E** : **persona anon** sur objet draft / média privé → confirmer la garde (zéro fuite).
5. **`NOTIFY pgrst, 'reload schema';`** (la forme RETURNS change).
6. **Deploy-integrity** : pas de DDL PROD-only — le live `CREATE OR REPLACE` = la source foldée ; fresh-apply gate reproduit le live. Remplacement in-place d'une fn d'un fichier déjà listé (pas de nouvelle entrée manifest). **Logger** la décision dans `lot1_mapping_decisions.md` (supersède §41).

## 6. Réconciliation frontend (non-cassante : ajouter la lecture parser, garder le loader en fallback, supprimer plus tard)

| Facette | Édition parser | Loader | Reco |
|---|---|---|---|
| A zones | aucune (lit déjà `raw.object_zone`) | `getObjectWorkspaceZonesModule` (L5762) direct-select `object_zone` (redondant) + `ref_commune` (catalogue, **reste**) | garder loader ; le select `object_zone` devient fallback (drop différé) ; jamais le catalogue |
| B accessibilité | **requise** (parser ne lit rien) | `getObjectWorkspaceDistinctionsModule` (L1293) selects `object_classification` + catalogues (restent) | ajouter lecture parser ; url/titre doc restent loader-résolus (bloc émet `document_id`) |
| C langues | **requise** (blanchit le niveau) | `getObjectWorkspaceCharacteristicsModule` (L615) select `object_language` (autoritaire) | ajouter lecture parser (fallback dégrade AVEC niveau) ; loader reste autoritaire §07 |
| D promotions | **requise** (blanchit `promotions:[]`) | `getObjectWorkspacePricingModule` (L2415) select via RLS (public+actif) | ajouter lecture parser ; bloc réplique le même filtre → les 2 chemins concordent |
| E médias chambre | aucune (lit déjà `record.media[].id`) | `getObjectWorkspaceRoomsModule` (L2597) select `object_room_type_media` | garder loader (source éditeur) ; chemin resource dispo pour drawer/deep_data |

**Éditions parser nettes : B, C, D** (additives, ne doivent pas régresser les loaders qui les overrident).

## 7. Tests

**SQL comportemental par facette** (1 fichier de test ou extension d'un test resource existant) :
- A : seed 1 `object_zone` → `-> 'object_zone'` array 1 élément avec `insee_commune` + `name` joint ; objet vide → clé absente.
- B : seed `object_classification` `display_group='accessibility_labels'` + `subvalue_ids` → `-> 'accessibility_labels'` porte `disability_types_covered` ; assert **PAS** sous `sustainability_labels` ; assert un statut non-`granted` apparaît.
- C : seed `object_language` avec `level_id` ET un NULL → les 2 apparaissent ; ligne avec niveau a `level:{code,name}`, l'autre `level:null`.
- D : seed `promotion` (public+actif) lié + un privé/inactif lié → seul public+actif apparaît (persona anon) ; assert la garde.
- E : seed chambre publiée + 1 média publié + 1 privé/non-publié → anon voit seulement le public ; persona extended voit tout.
- + assert `get_object_with_deep_data` : `accessibility_labels` survit le compose (câblage B).

**Tests frontend qui doivent rester verts** : `object-workspace.distinctions.test.ts` (§30), specs characteristics/langues (§32/§07), specs pricing/promotion, `parseWorkspaceRoomsModule` (§54/§72), specs zones (§41). Suite éditeur (~1028) verte ; les 3 éditions parser (B/C/D) sont additives.

## 8. Décisions par défaut / risques ouverts

1. **B statuts** : émettre TOUS les statuts dans `get_object_resource` (éditeur) ; la fn publique `get_object_resource_adapted` garde `status='granted'`. **À vérifier** : aucun consommateur **drawer public** de `get_object_resource` ne doit afficher un label non-`granted` (le drawer filtre client-side ou lit la fn adaptée). Vérif obligatoire en impl.
2. **B document** : bloc émet `document_id` seul ; url/titre restent loader-résolus (mirroir §08). Plus petit blast radius.
3. **C i18n** : `level.name` localisé via `api.i18n_pick_strict` (cohérent média `type_*`).
4. **A/E cleanup loader** : retrait différé des selects `object_zone`/`object_room_type_media` redondants (non-cassant) — item de suivi. **Jamais** retirer `ref_commune` / catalogues classification.
5. **Compose B** : le seul facette à câbler explicitement (pick + strip) — les 2 endroits obligatoires.

## 9. Ancres source (vérifiées)

`api.get_object_resource` L2546 ; `languages` L3028-3042 ; `pet/stay/activity` L3196-3227 ; `prices` L3229+ ; `room_types` L3666-3702 ; `sustainability_labels` L3790-3818 ; compose helpers L2458-2514 (itinerary pick L2477, misc strip L2491-2513) ; garde objet L2584-2597 ; `v_can_read_extended` L2578 ; fn adaptée `get_object_resource_adapted` L8622 (granted-only) ; `get_object_room_types` L7203-7218 (source du bloc média chambre).

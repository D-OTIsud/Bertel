# Complétude `api.get_object_resource` — 5 facettes (§101) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **NOTE EXÉCUTION : les tâches SQL (1-6) modifient une fonction `SECURITY DEFINER` de ~2300 lignes appliquée au LIVE — l'application live (Tâche 6) est une action CONTRÔLEUR (MCP Supabase), pas déléguée à un subagent. Préférer l'exécution INLINE pour les tâches SQL ; les éditions parser (7-9) peuvent être subagent.**

**Goal:** Faire émettre par `api.get_object_resource` 5 facettes autorables aujourd'hui invisibles (zones, labels accessibilité, niveau de langue, promotions liées, médias par chambre), fermant l'invariant §101, sans toucher l'export ni casser les consommateurs existants.

**Architecture:** Ajout de 4 blocs `jsonb` dans la fonction (`object_zone`, `accessibility_labels`, `promotions` nouveaux ; `media` imbriqué dans `room_types`) + 1 extension du bloc `languages` (`level`) + 1 rétrécissement du WHERE de `sustainability_labels` (anti double-emit de B). **Aucun edit du compose** (les 3 nouvelles clés top-level passent par le fall-through `misc`). `get_object_with_deep_data` hérite gratuitement. Réconciliation frontend : 3 éditions parser additives (B/C/D), loaders d'enrichissement conservés en fallback.

**Tech Stack:** PostgreSQL (Supabase, fonction `SECURITY DEFINER`), MCP Supabase (apply/execute/advisors), TypeScript/Jest (parser frontend).

## Global Constraints

- **Backend appliqué au LIVE avant prod** — process §101 : éditer la source `Base de donnée DLL et API/api_views_functions.sql` (la source EST le schéma, fold obligatoire) → appliquer `CREATE OR REPLACE` complet au live via MCP → `get_advisors` (aucun nouveau flag) → test comportemental + persona → `NOTIFY pgrst, 'reload schema';`.
- **Pas de DDL PROD-only** : le live `CREATE OR REPLACE` == la source foldée ; fresh-apply gate reproduit le live. Remplacement in-place (fichier déjà listé) — pas de nouvelle entrée manifest.
- **2 gardes §49 load-bearing** (le DEFINER bypasse la RLS) : **D promotions** `AND p.is_public = TRUE AND p.is_active = TRUE` ; **E médias** `AND m.is_published = TRUE AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')`. Omettre = fuite. Testées par persona anon.
- **Anchors par CODE, pas par numéro de ligne** (les lignes glissent quand on insère les blocs). Variable de langue dans la fonction = `lang` (pas `v_lang`). Variable de scope extended = `v_can_read_extended`.
- Commits : directement sur `master`, **uniquement les hunks de cette tâche**, pas de co-author, `--no-verify`. SQL source = un seul fichier (`api_views_functions.sql`) — commits SQL séquentiels.
- Vert obligatoire : tests SQL comportementaux (live) verts ; suite éditeur frontend (~1028) + `tsc` + `next build` verts.
- Logger en fin dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§104+, supersède §41).

---

### Task 1 : Bloc A — `object_zone` (zones / communes desservies)

**Files:** Modify `Base de donnée DLL et API/api_views_functions.sql` (insérer après le bloc `activity`, avant le bloc `prices`). Create `tests/test_resource_completeness.sql` (fichier de tests comportementaux, étendu par les tâches suivantes).

**Interfaces:** Produit la clé top-level `object_zone: [{insee_commune, position, name}]`. Aucune édition parser (le parser lit déjà `raw.object_zone[].insee_commune`).

- [ ] **Step 1 : Insérer le bloc A dans la source**

Anchor : juste après le `END IF;` du bloc `activity` (`IF obj.object_type IN ('ACT','ASC') THEN … FROM object_act a WHERE a.object_id = obj.id … END IF;`), avant le commentaire `-- Prices (enriched) …`. Insérer :

```sql
  -- Zones (communes desservies) — §41/§103/§101 P3 : object_zone était éditeur-only (select
  -- direct) ; désormais émis pour l'API consommateur. Garde objet en tête suffit (pas de
  -- visibilité par ligne). N'émet QUE les communes de l'objet ; le catalogue ref_commune reste
  -- loader-owned. LEFT JOIN : une commune is_active=false ne doit pas dropper la zone.
  IF v_fields IS NULL OR 'object_zone' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'object_zone',
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object('insee_commune', z.insee_commune, 'position', z.position, 'name', rc.name)
                 ORDER BY z.position, z.insee_commune
               )
        FROM object_zone z
        LEFT JOIN ref_commune rc ON rc.insee_code = z.insee_commune
        WHERE z.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;
```

- [ ] **Step 2 : Écrire le test comportemental A**

Créer `tests/test_resource_completeness.sql` avec un en-tête + le test A (transient : seed, assert, ROLLBACK). Pattern (à exécuter via MCP sur le live, encadré d'un BEGIN/ROLLBACK) :

```sql
-- test_resource_completeness.sql — §101 : get_object_resource émet les 5 facettes autorables.
-- Chaque test seed une ligne, appelle la fn, assert via RAISE EXCEPTION, et est exécuté dans
-- une transaction ROLLBACK (aucune écriture persistée). Exécution : MCP execute_sql.
DO $$
DECLARE v JSONB; v_obj TEXT;
BEGIN
  SELECT id INTO v_obj FROM object LIMIT 1;  -- un objet réel quelconque
  INSERT INTO object_zone(object_id, insee_commune, position) VALUES (v_obj, '97411', 0)
    ON CONFLICT DO NOTHING;
  SELECT api.get_object_resource(v_obj, ARRAY['fr'], 'geojson', '{"include_private":true}'::jsonb)::jsonb
    INTO v;
  IF NOT (v -> 'object_zone' @> '[{"insee_commune":"97411"}]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL A: object_zone absent ou mal formé : %', v -> 'object_zone';
  END IF;
  RAISE NOTICE 'PASS A: object_zone = %', v -> 'object_zone';
  RAISE EXCEPTION 'ROLLBACK_OK';  -- annule le seed
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
```

- [ ] **Step 3 : Vérifier l'échec AVANT apply (clé absente sur le live actuel)**

Run (controller, MCP `execute_sql`) : le DO block ci-dessus contre le live **actuel** (fonction non encore modifiée).
Expected : `FAIL A: object_zone absent` (la clé n'existe pas encore) ⇒ confirme le test discrimine.

- [ ] **Step 4 : Commit (source SQL, bloc A)**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add "Base de donnée DLL et API/api_views_functions.sql" tests/test_resource_completeness.sql
git commit --no-verify -m "feat(api): get_object_resource émet object_zone (communes desservies, §101 P3)"
```
(L'application live se fait en Tâche 6, après les 5 blocs.)

---

### Task 2 : Bloc B — `accessibility_labels` + rétrécir `sustainability_labels`

**Files:** Modify `api_views_functions.sql` (nouveau bloc après `sustainability_labels` ; modifier le WHERE de `sustainability_labels`). Modify `tests/test_resource_completeness.sql`.

**Interfaces:** Produit `accessibility_labels: [{id, scheme, scheme_name, value, value_name, value_id, status, awarded_at, valid_until, document_id, disability_types_covered[]}]`. Édition parser requise (Tâche 7).

- [ ] **Step 1 : Rétrécir le WHERE de `sustainability_labels`**

Dans le bloc `sustainability_labels`, remplacer la ligne :
```sql
        AND sc.display_group IN ('sustainability_labels', 'accessibility_labels')
```
par :
```sql
        AND sc.display_group = 'sustainability_labels'
```

- [ ] **Step 2 : Insérer le bloc `accessibility_labels`**

Anchor : juste après le `END IF;` du bloc `sustainability_labels`, avant le commentaire `-- Then, get all sustainability actions …`. Insérer :

```sql
  -- Accessibility labels — §101 : sortis de 'sustainability_labels' (où ils ridaient avant) dans
  -- leur propre clé pour l'éditeur §10. Forme = ObjectWorkspaceDistinctionItem (clés scheme/value,
  -- pas *_code). TOUS les statuts (l'éditeur voit requested/granted/suspended/expired ; la fn
  -- publique get_object_resource_adapted garde granted-only). Garde objet en tête suffit (status
  -- est une donnée, pas une garde). Fall-through misc (clé hors strip-list) ⇒ deep_data hérite.
  IF v_fields IS NULL OR 'accessibility_labels' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'accessibility_labels',
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id',          oc.id,
                   'scheme',      sc.code,
                   'scheme_name', COALESCE(api.i18n_pick_strict(sc.name_i18n, lang, 'fr'), sc.name),
                   'value',       cv.code,
                   'value_name',  COALESCE(api.i18n_pick_strict(cv.name_i18n, lang, 'fr'), cv.name),
                   'value_id',    cv.id,
                   'status',      oc.status,
                   'awarded_at',  oc.awarded_at,
                   'valid_until', oc.valid_until,
                   'document_id', oc.document_id,
                   'disability_types_covered', COALESCE((
                     SELECT jsonb_agg(cv2.metadata->>'disability_type' ORDER BY cv2.position NULLS LAST)
                     FROM ref_classification_scheme s2
                     CROSS JOIN unnest(oc.subvalue_ids) AS sv(uid)
                     JOIN ref_classification_value cv2 ON cv2.id = sv.uid
                     WHERE s2.id = oc.scheme_id
                       AND s2.code = 'LBL_TOURISME_HANDICAP'
                       AND cv2.metadata->>'disability_type' IS NOT NULL
                   ), '[]'::jsonb)
                 )
                 ORDER BY sc.position NULLS LAST, cv.position NULLS LAST, cv.code
               )
        FROM object_classification oc
        JOIN ref_classification_scheme sc ON sc.id = oc.scheme_id
        JOIN ref_classification_value cv ON cv.id = oc.value_id
        WHERE oc.object_id = obj.id
          AND sc.display_group = 'accessibility_labels'
      ), '[]'::jsonb)
    );
  END IF;
```

- [ ] **Step 3 : Étendre le test comportemental (B + non-double-emit + deep_data)**

Ajouter à `tests/test_resource_completeness.sql` un DO block B : seed un `object_classification` d'un schéma `display_group='accessibility_labels'` avec `subvalue_ids` ; assert `v -> 'accessibility_labels'` non vide ET que la même ligne **n'apparaît PAS** sous `v -> 'sustainability_labels'` ; assert qu'un statut non-`granted` apparaît ; + un appel `api.get_object_with_deep_data(...)` et assert que `accessibility_labels` y survit (fall-through misc). (Le seed exact dépend d'un schéma accessibilité réel — résoudre `SELECT id FROM ref_classification_scheme WHERE display_group='accessibility_labels' LIMIT 1` + une `ref_classification_value` de ce schéma.)

- [ ] **Step 4 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add "Base de donnée DLL et API/api_views_functions.sql" tests/test_resource_completeness.sql
git commit --no-verify -m "feat(api): get_object_resource émet accessibility_labels (sorti de sustainability_labels, §101)"
```

---

### Task 3 : Bloc C — niveau de langue (`languages[].level`)

**Files:** Modify `api_views_functions.sql` (bloc `languages`). Modify `tests/test_resource_completeness.sql`.

**Interfaces:** Chaque entrée `languages[]` gagne `level: {code, name} | null`. Édition parser requise (Tâche 8).

- [ ] **Step 1 : Étendre le bloc `languages`**

Remplacer le corps du `SELECT jsonb_agg(...)` du bloc `languages` (le `jsonb_build_object('code', rl.code, 'name', rl.name)` + le `FROM object_language ol JOIN ref_language rl …`) par :

```sql
      SELECT jsonb_agg(
               jsonb_build_object(
                 'code', rl.code,
                 'name', rl.name,
                 'level', CASE WHEN lvl.id IS NULL THEN NULL
                          ELSE jsonb_build_object('code', lvl.code,
                                                  'name', COALESCE(api.i18n_pick_strict(lvl.name_i18n, lang, 'fr'), lvl.name))
                          END
               )
               ORDER BY rl.name, rl.code
             )
      FROM object_language ol
      JOIN ref_language rl ON rl.id = ol.language_id
      LEFT JOIN ref_code_language_level lvl ON lvl.id = ol.level_id
      WHERE ol.object_id = obj.id
```

(LEFT JOIN load-bearing : `level_id` NULLABLE ; `code`/`name` conservés ⇒ additif.)

- [ ] **Step 2 : Étendre le test (C)**

Ajouter un DO block C : seed 2 `object_language` (un avec `level_id` non-NULL via `SELECT id FROM ref_code_language_level LIMIT 1`, un avec `level_id NULL`) ; assert les 2 langues apparaissent, celle avec niveau a `level:{code,name}`, l'autre `level:null` (pas absent).

- [ ] **Step 3 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add "Base de donnée DLL et API/api_views_functions.sql" tests/test_resource_completeness.sql
git commit --no-verify -m "feat(api): get_object_resource — languages[] expose le niveau (level_id, §101)"
```

---

### Task 4 : Bloc D — `promotions` (avec garde §49)

**Files:** Modify `api_views_functions.sql` (insérer dans la zone pricing, après le bloc `prices`). Modify `tests/test_resource_completeness.sql`.

**Interfaces:** Produit `promotions: [{promotion_id, promotion: {id, code, name, discount_type, discount_value, currency, valid_from, valid_to, is_active, is_public}}]`. Édition parser requise (Tâche 9).

- [ ] **Step 1 : Insérer le bloc D**

Anchor : juste après le `END IF;` du bloc `prices` (avant le bloc `discounts` ou tout bloc pricing suivant). Insérer :

```sql
  -- Promotions liées — §101 : promotion_object était éditeur-only. GARDE §49 LOAD-BEARING : le
  -- DEFINER bypasse la RLS, donc on réplique le filtre champ is_public AND is_active (le select
  -- loader ne renvoyait que ça via la policy). Omettre = fuite de promos privées/inactives.
  IF v_fields IS NULL OR 'promotions' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'promotions',
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'promotion_id', p.id,
                   'promotion', jsonb_build_object(
                     'id', p.id,
                     'code', p.code,
                     'name', COALESCE(api.i18n_pick_strict(p.name_i18n, lang, 'fr'), p.name),
                     'discount_type', p.discount_type,
                     'discount_value', p.discount_value,
                     'currency', p.currency,
                     'valid_from', p.valid_from,
                     'valid_to', p.valid_to,
                     'is_active', p.is_active,
                     'is_public', p.is_public
                   )
                 )
                 ORDER BY p.valid_from NULLS LAST, p.name
               )
        FROM promotion_object po
        JOIN promotion p ON p.id = po.promotion_id
        WHERE po.object_id = obj.id
          AND p.is_public = TRUE
          AND p.is_active = TRUE
      ), '[]'::jsonb)
    );
  END IF;
```

- [ ] **Step 2 : Étendre le test (D + persona fuite)**

Ajouter un DO block D : seed une `promotion` (is_public=TRUE,is_active=TRUE) + `promotion_object`, et une seconde `promotion` (is_public=FALSE) liée ; assert que **seule** la publique+active apparaît dans `promotions`. (Note : le DEFINER renvoie selon le WHERE, indépendamment du caller — donc le test du WHERE suffit ; pas besoin de SET ROLE, le filtre EST dans le SQL.)

- [ ] **Step 3 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add "Base de donnée DLL et API/api_views_functions.sql" tests/test_resource_completeness.sql
git commit --no-verify -m "feat(api): get_object_resource émet promotions (garde is_public/is_active §49, §101)"
```

---

### Task 5 : Bloc E — `room_types[].media` (avec garde §49)

**Files:** Modify `api_views_functions.sql` (bloc `room_types`, par-chambre `jsonb_build_object`). Modify `tests/test_resource_completeness.sql`.

**Interfaces:** Chaque chambre gagne `media: [{id, url, title, credit, is_main, is_published, position}]`. Aucune édition parser (le parser lit déjà `record.media[].id`).

- [ ] **Step 1 : Ajouter `media` au par-chambre `jsonb_build_object`**

Dans le bloc `room_types`, le `jsonb_build_object` par chambre se termine par la clé `'beds'` (`'beds', COALESCE((… FROM object_room_type_bed … ), '[]'::jsonb)`). Ajouter une **virgule** après la fermeture `'[]'::jsonb)` du `beds`, puis la clé `media` :

```sql
                 ,
                 -- Room media — §101/§59 : object_room_type_media était éditeur-only. GARDE §49
                 -- LOAD-BEARING : DEFINER bypasse la RLS ⇒ répliquer is_published + visibility
                 -- (NULL ≈ public). Une chambre publiée peut porter un média privé/non-publié.
                 'media', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'id', m.id,
                              'url', m.url,
                              'title', COALESCE(api.i18n_pick_strict(m.title_i18n, lang, 'fr'), m.title),
                              'credit', m.credit,
                              'is_main', m.is_main,
                              'is_published', m.is_published,
                              'position', rtm.position
                            )
                            ORDER BY rtm.position NULLS LAST
                          )
                   FROM object_room_type_media rtm
                   JOIN media m ON m.id = rtm.media_id
                   WHERE rtm.room_type_id = rt.id
                     AND m.is_published = TRUE
                     AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
                 ), '[]'::jsonb)
```

(Insérer entre le `'[]'::jsonb)` du `beds` et le `)` qui ferme le `jsonb_build_object` par chambre.)

- [ ] **Step 2 : Étendre le test (E + persona fuite)**

Ajouter un DO block E : seed une `object_room_type` publiée + 2 `media` (un is_published=TRUE visibility public, un is_published=FALSE) liés via `object_room_type_media` ; appeler la fn **sans** include_private (chemin non-extended) et assert que `room_types[0].media` ne contient que le public ; puis avec un objet extended assert qu'on voit les 2.

- [ ] **Step 3 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add "Base de donnée DLL et API/api_views_functions.sql" tests/test_resource_completeness.sql
git commit --no-verify -m "feat(api): get_object_resource — room_types[].media (garde is_published/visibility §49/§59, §101)"
```

---

### Task 6 : [CONTRÔLEUR] Application live + vérification complète

**Files:** aucun nouveau (application + vérification). MCP Supabase.

- [ ] **Step 1 : Appliquer la fonction complète au live**

Via MCP `apply_migration` (nom : `get_object_resource_completeness_5facets`), appliquer le `CREATE OR REPLACE FUNCTION api.get_object_resource(...)` **complet** (le corps entier de la source à jour, ~2300 lignes). **Aucun edit de compose helper** (les nouvelles clés ridaient déjà le fall-through misc).

- [ ] **Step 2 : Advisors**

Run MCP `get_advisors` (type `security` puis `performance`).
Expected : seulement les notices §36 `*_security_definer_function_executable` préexistantes ; **aucun nouveau flag**.

- [ ] **Step 3 : Tests comportementaux + deep_data**

Run MCP `execute_sql` sur chaque DO block de `tests/test_resource_completeness.sql` (A→E + l'assert deep_data de B). Tous doivent afficher `PASS` (et `ROLLBACK_OK`).
Expected : A object_zone présent ; B accessibility_labels présent + PAS sous sustainability_labels + survit deep_data ; C level{code,name}/null ; D seule promo publique+active ; E média public-only en non-extended.

- [ ] **Step 4 : Reload PostgREST**

Run MCP `execute_sql` : `NOTIFY pgrst, 'reload schema';`

- [ ] **Step 5 : Vérifier la cohérence source↔live**

Run MCP `execute_sql` : `SELECT pg_get_functiondef('api.get_object_resource(text,text[],text,jsonb)'::regprocedure)` et confirmer que les 5 blocs y figurent (le live == la source foldée). (Pas de commit ici — la source a été committée en Tâches 1-5.)

---

### Task 7 : Parser frontend B — lire `accessibility_labels`

**Files:** Modify `bertel-tourism-ui/src/services/object-workspace-parser.ts` (`parseWorkspaceDistinctionsModule`, L1737-1745, + son call-site). Test : `bertel-tourism-ui/src/services/object-workspace.distinctions.test.ts` (ou un nouveau spec).

**Interfaces:** Consomme la clé `raw.accessibility_labels` ; remplit `accessibilityLabels: ObjectWorkspaceDistinctionItem[]`.

- [ ] **Step 1 : Écrire le test (RED)** — un test qui passe un `raw` avec `accessibility_labels: [{id, scheme, value, value_id, status, disability_types_covered:['visual']}]` et attend `parseWorkspaceDistinctionsModule(raw).accessibilityLabels[0]` peuplé (id/scheme/value/status/disabilityTypesCovered selon le mapping de `ObjectWorkspaceDistinctionItem` — lire l'interface autour de L351-356 pour les noms de champs exacts).
- [ ] **Step 2 : Lancer, vérifier l'échec** (`parseWorkspaceDistinctionsModule` renvoie `accessibilityLabels: []`).
- [ ] **Step 3 : Implémenter** — faire `parseWorkspaceDistinctionsModule(raw: Record<string, unknown>)` accepter `raw`, mapper `readArray(raw.accessibility_labels)` → `ObjectWorkspaceDistinctionItem[]` (champs exacts selon l'interface) ; mettre à jour le call-site dans `parseObjectWorkspace` pour passer `detail.raw`. **Additif** : ne pas régresser le reste (le loader d'enrichissement override toujours en éditeur).
- [ ] **Step 4 : Vérifier le vert** (`npx jest object-workspace.distinctions`).
- [ ] **Step 5 : Commit** (`git add` parser + test ; `feat(editor): parser lit accessibility_labels depuis la ressource (§101)`).

---

### Task 8 : Parser frontend C — lire `languages[].level`

**Files:** Modify `object-workspace-parser.ts` (`parseWorkspaceCharacteristicsModule`, mapping `selectedLanguages` ~L1607-1617). Test : le spec characteristics existant.

**Interfaces:** Lit `record.level?.code`/`.name` dans chaque langue.

- [ ] **Step 1 : Test (RED)** — `parseWorkspaceCharacteristicsModule` sur un `raw.languages: [{code:'fr', name:'Français', level:{code:'B2', name:'Intermédiaire'}}]` attend `selectedLanguages[0].levelCode==='B2'` et `levelLabel==='Intermédiaire'`.
- [ ] **Step 2 : Échec** (aujourd'hui `levelCode:''`, L1614).
- [ ] **Step 3 : Implémenter** — dans le `.map` des langues, remplacer `levelCode: ''`/`levelLabel: ''` par `levelCode: readString((record.level as Record<string,unknown>)?.code)` / `levelLabel: readString((record.level as Record<string,unknown>)?.name)` (garde `levelId: ''` — résolu par l'enrichissement). Garder le `.filter`.
- [ ] **Step 4 : Vert.**
- [ ] **Step 5 : Commit** (`feat(editor): parser lit le niveau de langue depuis la ressource (§101)`).

---

### Task 9 : Parser frontend D — lire `promotions`

**Files:** Modify `object-workspace-parser.ts` (`parseWorkspacePricingModule`, `promotions:[]` L1824, + `normalizePromotionSummary` existant). Test : le spec pricing existant.

**Interfaces:** Lit `raw.promotions` via `normalizePromotionSummary`.

- [ ] **Step 1 : Test (RED)** — `parseWorkspacePricingModule` sur `raw.promotions: [{promotion_id:'x', promotion:{id:'x', code:'C', name:'N', discount_type:'percent', discount_value:10, is_active:true, is_public:true}}]` attend `promotions[0]` peuplé (via `normalizePromotionSummary` — lire sa signature pour les champs exacts).
- [ ] **Step 2 : Échec** (aujourd'hui `promotions:[]`, L1824).
- [ ] **Step 3 : Implémenter** — remplacer `promotions: []` par `promotions: readArray(raw.promotions).map(normalizePromotionSummary)` (réutiliser le helper partagé). Additif.
- [ ] **Step 4 : Vert.**
- [ ] **Step 5 : Commit** (`feat(editor): parser lit promotions depuis la ressource (§101)`).

---

### Task 10 : Vérification finale + documentation

**Files:** Modify `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (local).

- [ ] **Step 1 : Suite frontend complète** — `cd bertel-tourism-ui && npx jest src/services src/features/object-editor` vert (incl. distinctions §30, characteristics §32/§07, pricing/promotion, rooms §54/§72, zones §41). `npx tsc --noEmit` 0. `npm run build` exit 0.
- [ ] **Step 2 : Décision log** — ajouter §105 (ou suivant) dans `lot1_mapping_decisions.md` : 5 facettes ajoutées à `get_object_resource` (zones/accessibilité/niveau-langue/promotions/médias-chambre), gardes §49 D/E, fall-through misc (pas d'edit compose), supersède §41, loaders éditeur conservés en fallback (cleanup différé : retrait des selects `object_zone`/`object_room_type_media` redondants — jamais les catalogues). Note la décision « émettre tous les statuts B » + vérif drawer-public-filtre-granted.
- [ ] **Step 3 : Vérif drawer public (décision ouverte B)** — confirmer quelle fn lit le drawer public pour les distinctions/accessibilité : si `get_object_resource` (et non `get_object_resource_adapted`), s'assurer que le rendu drawer filtre `status='granted'` côté client (sinon il afficherait un label « expiré/demandé »). Documenter le constat ; corriger le filtre client si nécessaire (petit ajout, sa propre vérif).

---

## Self-Review (auteur du plan)

**Couverture spec :** A zones → T1 ✓ ; B accessibilité (+narrow+parser) → T2/T7 ✓ ; C niveau langue (+parser) → T3/T8 ✓ ; D promotions (+garde §49+parser) → T4/T9 ✓ ; E média chambre (+garde §49) → T5 ✓ ; déploiement live+advisors+persona+NOTIFY → T6 ✓ ; compose = NON nécessaire (fall-through misc, documenté) ✓ ; réconciliation frontend non-cassante → T7-9 ✓ ; tests → DO blocks A-E + deep_data + suite frontend T10 ✓ ; décision log + vérif drawer → T10 ✓.

**Placeholders :** aucun TODO. Les 2 points « lire l'interface exacte » (T7 ObjectWorkspaceDistinctionItem, T9 normalizePromotionSummary) sont des références précises (fichier+lignes), pas des placeholders — le mapping est additif et contraint par l'interface existante.

**Cohérence types/noms :** clés SQL `object_zone`/`accessibility_labels`/`promotions`/`languages[].level`/`room_types[].media` cohérentes entre blocs SQL (T1-5), tests (T6) et parsers (T7-9). Variable `lang`/`v_can_read_extended` cohérentes. Gardes §49 présentes en T4/T5 ET rappelées en contraintes globales.

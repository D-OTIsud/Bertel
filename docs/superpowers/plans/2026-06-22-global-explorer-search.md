# Recherche Explorer globale — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre la recherche texte de l'Explorer (nom + ville) à tout le contenu utile au voyageur (équipements, tags, environnement, taxonomie, labels, menus/plats/régimes/allergènes/cuisines, prose de description), avec classement par pertinence — sans élargir les pickers de l'éditeur.

**Architecture:** Une colonne `object.search_document tsvector` pondérée, maintenue par l'extension de `api.refresh_object_filter_caches` + nouveaux triggers ; la recherche matche `name_sv OR city_sv OR search_document` et classe par `ts_rank`. Le mode global est opt-in via `p_filters.search_mode='global'`, porté par `ExplorerFilters.common.searchScope` côté front.

**Tech Stack:** PostgreSQL (tsvector/tsquery français, triggers PL/pgSQL, MV `internal.mv_filtered_objects`), Supabase MCP pour l'application live, Next.js/React + Zustand + TanStack Query côté front, Jest.

## Global Constraints

- Périmètre **FR canonique** uniquement (pas de parcours `*_i18n`) — recherche non-FR différée.
- Menus indexés seulement si `object_menu.is_active = TRUE AND (visibility IS NULL OR visibility='public')`.
- Descriptions indexées seulement la ligne **canonique** (`org_object_id IS NULL`) et `visibility IS NULL OR visibility='public'`. `description_edition` exclu.
- Vecteur construit `to_tsvector('french', immutable_unaccent(lower(<texte>)))` — strict miroir de `object.name_search_vector` ; côté requête `plainto_tsquery('french', api.norm_search(<terme>))` (sémantique ET multi-mots conservée).
- Toute DDL foldée dans `schema_unified.sql` (+ `api_views_functions.sql` / `rls_policies.sql`) ET listée dans `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée **14y**) — un fresh DB doit reproduire le live (no-op).
- `gen_random_uuid()` jamais `uuid_generate_v4()` dans toute fonction à search_path restreint (sans objet ici, mais règle maison).
- Commits directs sur `master`, **hunks propres uniquement** (le PO édite des fichiers partagés via Cursor) ; pas de push (le PO pousse) ; pas de trailer co-author.
- Déploiement live via Supabase MCP, **testé transactionnellement (ROLLBACK)** avant tout fold/commit ; `NOTIFY pgrst` après application.

---

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `Base de donnée DLL et API/migration_global_search_document.sql` | Migration autonome : colonne + index + extension fn + triggers + backfill + MV + get_filtered_object_ids + caller + grants | Créer |
| `Base de donnée DLL et API/schema_unified.sql` | Folding : colonne `object.search_document`, index, fn `refresh_object_filter_caches`, triggers, def MV + index | Modifier |
| `Base de donnée DLL et API/api_views_functions.sql` | Folding : `get_filtered_object_ids` (signature+corps) + caller liste principale | Modifier |
| `Base de donnée DLL et API/rls_policies.sql` | Folding : REVOKE/GRANT de la nouvelle signature | Modifier |
| `Base de donnée DLL et API/tests/test_global_search.sql` | Test CI (transactionnel) | Créer |
| `docs/SQL_ROLLOUT_RUNBOOK.md` | Entrée manifest 14y | Modifier |
| `.github/workflows/sql-fresh-apply.yml` | Câbler le test | Modifier (si liste explicite) |
| `bertel-tourism-ui/src/types/domain.ts` | `searchScope?: 'name'｜'global'` sur `ExplorerCommonFilters` | Modifier |
| `bertel-tourism-ui/src/utils/facets.ts` | `buildBucketRpcFilters` mappe `searchScope→search_mode` ; `normalizeExplorerFilters` préserve | Modifier |
| `bertel-tourism-ui/src/store/explorer-store.ts` | `searchScope:'global'` dans le `common` initial de l'Explorer | Modifier |
| `bertel-tourism-ui/src/components/layout/TopBar.tsx` | Placeholder élargi | Modifier |
| `bertel-tourism-ui/src/utils/facets.test.ts` | Tests builder (global émis / non émis) | Modifier |

---

## Task 1 : Colonne `search_document` + recalcul + triggers + backfill + MV

**Files:**
- Create: `Base de donnée DLL et API/migration_global_search_document.sql`
- Modify: `Base de donnée DLL et API/schema_unified.sql` (≈886 colonnes object ; ≈4203 def MV ; ≈4522 `refresh_object_filter_caches` ; ≈4675 backfill)

**Interfaces:**
- Produces: `object.search_document tsvector` ; `internal.mv_filtered_objects.search_document` ; `api.refresh_object_filter_caches(text)` peuple aussi la colonne ; triggers sur `object_cuisine_type`, `object_menu`, `object_menu_item`, `object_menu_item_dietary_tag`, `object_menu_item_allergen`, `object_menu_item_cuisine_type`, `tag_link`, `object_description`.

- [ ] **Step 1 — Colonne + index (migration + fold).** Ajouter à la migration et à `schema_unified.sql` (près des autres `cached_*`, ≈ ligne 893/928) :

```sql
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS search_document tsvector;
CREATE INDEX IF NOT EXISTS idx_object_search_document_gin ON object USING GIN (search_document);
```

- [ ] **Step 2 — Étendre `api.refresh_object_filter_caches`.** Déclarer `v_search_document tsvector;` et, avant l'`UPDATE`, le calculer. Les agrégats utilisent `immutable_unaccent(lower(...))` ; menus/desc respectent la visibilité :

```sql
  WITH src AS (
    SELECT
      -- B : taxonomie (assignés + ancêtres assignables) + classements/labels
      (
        COALESCE((SELECT string_agg(DISTINCT anc.name, ' ')
          FROM object_taxonomy ot
          JOIN ref_code_taxonomy_closure cl ON cl.domain=ot.domain AND cl.descendant_id=ot.ref_code_id
          JOIN ref_code anc ON anc.id=cl.ancestor_id AND anc.domain=cl.domain
          WHERE ot.object_id=p_object_id AND anc.is_assignable=TRUE), '')
        || ' ' ||
        COALESCE((SELECT string_agg(DISTINCT s.name||' '||v.name, ' ')
          FROM object_classification oc
          JOIN ref_classification_scheme s ON s.id=oc.scheme_id
          JOIN ref_classification_value v ON v.id=oc.value_id
          WHERE oc.object_id=p_object_id AND oc.status='granted'), '')
      ) AS doc_b,
      -- C : équipements + tags + environnement + cuisines + menus + plats + régimes + allergènes
      (
        COALESCE((SELECT string_agg(DISTINCT ra.name,' ') FROM object_amenity oa JOIN ref_amenity ra ON ra.id=oa.amenity_id WHERE oa.object_id=p_object_id),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT t.name,' ') FROM tag_link tl JOIN ref_tag t ON t.id=tl.tag_id WHERE tl.target_table='object' AND tl.target_pk=p_object_id),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT et.name,' ') FROM object_environment_tag oet JOIN ref_code_environment_tag et ON et.id=oet.environment_tag_id WHERE oet.object_id=p_object_id),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT ct.name,' ') FROM object_cuisine_type oct JOIN ref_code_cuisine_type ct ON ct.id=oct.cuisine_type_id WHERE oct.object_id=p_object_id),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT m.name||' '||COALESCE(mi.name,''),' ')
                FROM object_menu m LEFT JOIN object_menu_item mi ON mi.menu_id=m.id
                WHERE m.object_id=p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility='public')),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT dt.name,' ')
                FROM object_menu m JOIN object_menu_item mi ON mi.menu_id=m.id
                JOIN object_menu_item_dietary_tag mid ON mid.menu_item_id=mi.id
                JOIN ref_code_dietary_tag dt ON dt.id=mid.dietary_tag_id
                WHERE m.object_id=p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility='public')),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT al.name,' ')
                FROM object_menu m JOIN object_menu_item mi ON mi.menu_id=m.id
                JOIN object_menu_item_allergen mia ON mia.menu_item_id=mi.id
                JOIN ref_code_allergen al ON al.id=mia.allergen_id
                WHERE m.object_id=p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility='public')),'')
      ) AS doc_c,
      -- D : prose description canonique (strippée) + descriptions de plats
      (
        COALESCE((SELECT string_agg(DISTINCT
            api.strip_markdown(d.description)||' '||api.strip_markdown(d.description_chapo)||' '
            ||api.strip_markdown(d.description_mobile)||' '||api.strip_markdown(d.description_adapted),' ')
          FROM object_description d
          WHERE d.object_id=p_object_id AND d.org_object_id IS NULL
            AND (d.visibility IS NULL OR d.visibility='public')),'')
        ||' '|| COALESCE((SELECT string_agg(DISTINCT mi.description,' ')
                FROM object_menu m JOIN object_menu_item mi ON mi.menu_id=m.id
                WHERE m.object_id=p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility='public') AND mi.description IS NOT NULL),'')
      ) AS doc_d
  )
  SELECT
       setweight(to_tsvector('french', immutable_unaccent(lower(src.doc_b))), 'B')
    || setweight(to_tsvector('french', immutable_unaccent(lower(src.doc_c))), 'C')
    || setweight(to_tsvector('french', immutable_unaccent(lower(src.doc_d))), 'D')
  INTO v_search_document
  FROM src;
```

Puis ajouter à l'`UPDATE object SET …` la ligne `search_document = v_search_document,` et à la garde `WHERE … OR o.search_document IS DISTINCT FROM v_search_document`.

- [ ] **Step 3 — Trigger generic-via-parent.** Créer une fonction trigger qui résout `object_id` puis appelle le recalcul, pour les tables sans `object_id` direct :

```sql
CREATE OR REPLACE FUNCTION api.trg_refresh_caches_from_menu_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
DECLARE v_obj TEXT;
BEGIN
  SELECT m.object_id INTO v_obj FROM object_menu m
   JOIN object_menu_item mi ON mi.menu_id=m.id
   WHERE mi.id = COALESCE(NEW.menu_item_id, OLD.menu_item_id);
  IF v_obj IS NOT NULL THEN PERFORM api.refresh_object_filter_caches(v_obj); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION api.trg_refresh_caches_from_object_menu_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
DECLARE v_new TEXT; v_old TEXT;
BEGIN
  IF TG_OP<>'DELETE' THEN SELECT object_id INTO v_new FROM object_menu WHERE id=NEW.menu_id; END IF;
  IF TG_OP<>'INSERT' THEN SELECT object_id INTO v_old FROM object_menu WHERE id=OLD.menu_id; END IF;
  IF v_old IS NOT NULL THEN PERFORM api.refresh_object_filter_caches(v_old); END IF;
  IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM api.refresh_object_filter_caches(v_new); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION api.trg_refresh_caches_from_tag_link()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
BEGIN
  IF COALESCE(OLD.target_table,NEW.target_table)='object' THEN
    IF TG_OP<>'INSERT' AND OLD.target_table='object' THEN PERFORM api.refresh_object_filter_caches(OLD.target_pk); END IF;
    IF TG_OP<>'DELETE' AND NEW.target_table='object' AND NEW.target_pk IS DISTINCT FROM OLD.target_pk
       THEN PERFORM api.refresh_object_filter_caches(NEW.target_pk); END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
```

- [ ] **Step 4 — Brancher les triggers.** `object_description`, `object_menu`, `object_cuisine_type` réutilisent `api.trg_refresh_object_filter_caches_from_child` (elles ont `object_id`). `object_menu_item` → `trg_refresh_caches_from_object_menu_item`. `object_menu_item_dietary_tag`/`_allergen`/`_cuisine_type` → `trg_refresh_caches_from_menu_item`. `tag_link` → `trg_refresh_caches_from_tag_link`. Une ligne par table :

```sql
DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_description ON object_description;
CREATE TRIGGER trg_refresh_object_filter_caches_object_description
AFTER INSERT OR UPDATE OR DELETE ON object_description
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();
-- idem object_menu, object_cuisine_type ;
-- object_menu_item → api.trg_refresh_caches_from_object_menu_item();
-- object_menu_item_dietary_tag / _allergen / _cuisine_type → api.trg_refresh_caches_from_menu_item();
-- tag_link → api.trg_refresh_caches_from_tag_link();
```

- [ ] **Step 5 — Backfill.** Recalculer toutes les fiches existantes (la fn idempotente fait le DISTINCT-guard) :

```sql
SELECT api.refresh_object_filter_caches(o.id) FROM object o;
```

- [ ] **Step 6 — MV.** Ajouter `o.search_document` à la def de `internal.mv_filtered_objects` (≈4204) et un index GIN ; reconstruire (DROP/CREATE déjà en place dans le fichier) :

```sql
-- dans le SELECT de la MV : o.search_document,
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_search_doc_gin
ON internal.mv_filtered_objects USING GIN(search_document);
```

- [ ] **Step 7 — Appliquer à live (MCP) + vérifier le peuplement.** Appliquer Steps 1–6 via `apply_migration`. Vérifier qu'une fiche resto avec un plat « Salade de palmiste » a un `search_document` qui matche :

Run (MCP execute_sql) :
```sql
SELECT count(*) FROM object WHERE search_document @@ plainto_tsquery('french','palmiste');
```
Expected : ≥ 0 sans erreur (si données présentes, > 0 ; sinon valider via Task 3 fixture).

- [ ] **Step 8 — Commit (hunks propres).**

```bash
git add "Base de donnée DLL et API/migration_global_search_document.sql" "Base de donnée DLL et API/schema_unified.sql"
git commit -m "feat(sql): object.search_document tsvector + maintenance triggers (§109)" -- "Base de donnée DLL et API/migration_global_search_document.sql" "Base de donnée DLL et API/schema_unified.sql"
```

---

## Task 2 : `get_filtered_object_ids` mode global + pertinence + caller

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (≈942 def fn ; ≈1305 clause search ; ≈5875 caller liste ; ≈949 RETURNS), `Base de donnée DLL et API/migration_global_search_document.sql`, `Base de donnée DLL et API/rls_policies.sql` (≈3342 grants)

**Interfaces:**
- Consumes: `object.search_document` (Task 1).
- Produces: `api.get_filtered_object_ids(jsonb,object_type[],object_status[],text)` RETURNS `TABLE(object_id text, label_rank integer, label_match jsonb, relevance real)` ; mode lu sur `p_filters->>'search_mode'`.

- [ ] **Step 1 — Test d'abord (fixture dans test_global_search.sql, cf. Task 3) en mode RED** : asserter qu'en `search_mode='global'` un objet draft avec amenity « jacuzzi » remonte ; lancer → échoue (clause pas encore élargie).

- [ ] **Step 2 — Étendre la fn.** `DROP FUNCTION IF EXISTS api.get_filtered_object_ids(jsonb, object_type[], object_status[], text);` puis recréer avec `RETURNS TABLE(object_id TEXT, label_rank INTEGER, label_match JSONB, relevance REAL)`. Ajouter dans `source_rows` la colonne `search_document` (depuis `m.search_document` côté MV et `o.search_document` côté live). Remplacer la clause search (≈1305) :

```sql
    AND (
      p_search IS NULL OR
      src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR
      (src.city_search_vector IS NOT NULL AND src.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search))) OR
      (
        (params.filters->>'search_mode') = 'global'
        AND src.search_document IS NOT NULL
        AND src.search_document @@ plainto_tsquery('french', api.norm_search(p_search))
      )
    )
```

et ajouter la colonne de sortie `relevance` au SELECT final :

```sql
    CASE WHEN p_search IS NULL THEN 0::real
      ELSE ts_rank(
        setweight(src.name_search_vector,'A')
        || setweight(COALESCE(src.city_search_vector, ''::tsvector),'A')
        || CASE WHEN (params.filters->>'search_mode')='global'
                THEN COALESCE(src.search_document, ''::tsvector) ELSE ''::tsvector END,
        plainto_tsquery('french', api.norm_search(p_search)))
    END AS relevance
```

- [ ] **Step 3 — Caller liste principale (≈5875).** Ajouter `fids.relevance` à `filt`, et trier d'abord par pertinence :

```sql
  -- dans filt : fids.relevance,
  paged AS (
    SELECT f.*, ROW_NUMBER() OVER (ORDER BY f.relevance DESC, f.label_rank, f.name_normalized NULLS LAST, f.id) AS ord
    FROM filt f
    ORDER BY f.relevance DESC, f.label_rank, f.name_normalized NULLS LAST, f.id
    OFFSET v_offset LIMIT v_limit
  ),
```

(Les autres callers font `SELECT object_id`/keyset temps ⇒ ignorent `relevance`, aucun changement.)

- [ ] **Step 4 — Grants.** Dans `rls_policies.sql` (≈3342) et la migration, mettre à jour pour la nouvelle signature (identique : 4 params in) :

```sql
REVOKE EXECUTE ON FUNCTION api.get_filtered_object_ids(jsonb, object_type[], object_status[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_filtered_object_ids(jsonb, object_type[], object_status[], text) TO authenticated, service_role;
```

- [ ] **Step 5 — Appliquer live (MCP) DROP+CREATE fn, CREATE OR REPLACE caller, grants ; `NOTIFY pgrst`.** Vérifier le test RED → GREEN (Task 3).

- [ ] **Step 6 — Commit (hunks propres).**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/rls_policies.sql" "Base de donnée DLL et API/migration_global_search_document.sql"
git commit -m "feat(sql): get_filtered_object_ids global search + relevance ranking (§109)" -- "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/rls_policies.sql" "Base de donnée DLL et API/migration_global_search_document.sql"
```

---

## Task 3 : Test SQL + manifest + CI

**Files:**
- Create: `Base de donnée DLL et API/tests/test_global_search.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (manifest 14y), `.github/workflows/sql-fresh-apply.yml`

- [ ] **Step 1 — Écrire le test (transactionnel, miroir de `test_object_cuisine_type.sql`).** Fixtures en superuser : un RES draft `GS_RES` avec amenity « Jacuzzi », un plat « Salade de palmiste » (menu actif/public) + un dietary « Végan » ; une chambre d'hôte draft `GS_HLO` avec aussi un plat « Salade de palmiste » ; un objet draft avec « palmiste » seulement dans la description ; un menu **privé** avec « Bredes mafane » qui ne doit PAS remonter. Après inserts : `PERFORM api.refresh_object_filter_caches(<id>)` pour chacun. Asserts (statuts draft ⇒ chemin live) :

```sql
-- helper inline
CREATE OR REPLACE FUNCTION pg_temp.found(p_term text, p_id text, p_mode text)
RETURNS boolean LANGUAGE sql AS $f$
  SELECT EXISTS (SELECT 1 FROM api.get_filtered_object_ids(
    jsonb_build_object('search_mode', p_mode), NULL,
    ARRAY['draft']::object_status[], p_term) f WHERE f.object_id = p_id)
$f$;

ASSERT pg_temp.found('jacuzzi', v_res, 'global'),               'global: jacuzzi (amenity) doit remonter';
ASSERT pg_temp.found('salade de palmiste', v_res, 'global'),    'global: plat doit remonter le resto';
ASSERT pg_temp.found('salade de palmiste', v_hlo, 'global'),    'global: plat doit remonter la chambre d hote';
ASSERT pg_temp.found('vegan', v_res, 'global'),                 'global: régime végan doit remonter';
ASSERT pg_temp.found('palmiste', v_desc, 'global'),             'global: mot de description doit remonter';
ASSERT NOT pg_temp.found('mafane', v_priv, 'global'),           'global: menu privé NE doit PAS remonter';
ASSERT NOT pg_temp.found('jacuzzi', v_res, 'name'),             'name: ne doit PAS s élargir aux équipements';
-- ranking : objet nommé contenant le terme passe avant un match équipement seul
ASSERT (SELECT relevance FROM api.get_filtered_object_ids(
          jsonb_build_object('search_mode','global'), NULL, ARRAY['draft']::object_status[], 'jacuzzi')
        WHERE object_id = v_named_jacuzzi)
     > (SELECT relevance FROM api.get_filtered_object_ids(
          jsonb_build_object('search_mode','global'), NULL, ARRAY['draft']::object_status[], 'jacuzzi')
        WHERE object_id = v_res),                               'ranking: nom > équipement';
```

- [ ] **Step 2 — Lancer le test contre live (MCP execute_sql, BEGIN…ROLLBACK).** Expected : aucune ASSERT ne lève.

- [ ] **Step 3 — Manifest 14y** dans `docs/SQL_ROLLOUT_RUNBOOK.md` : décrire `migration_global_search_document.sql` (colonne+index+fn+triggers+backfill+MV+get_filtered_object_ids+caller+grants), dépendances (step 1 `schema_unified.sql`, `migration_permission_write_paths.sql`, `migration_cards_batch_authorize_definer.sql`, `api.strip_markdown`, `api_views_functions.sql`, `rls_policies.sql`), couvert par `tests/test_global_search.sql`, decision log §109. Ajouter le test à `sql-fresh-apply.yml` si la liste est explicite.

- [ ] **Step 4 — Commit.**

```bash
git add "Base de donnée DLL et API/tests/test_global_search.sql" "docs/SQL_ROLLOUT_RUNBOOK.md" ".github/workflows/sql-fresh-apply.yml"
git commit -m "test(sql): global search coverage + manifest 14y (§109)" -- "Base de donnée DLL et API/tests/test_global_search.sql" "docs/SQL_ROLLOUT_RUNBOOK.md" ".github/workflows/sql-fresh-apply.yml"
```

---

## Task 4 : Frontend — flag opt-in + placeholder + tests

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts` (≈142), `bertel-tourism-ui/src/utils/facets.ts` (≈296 `buildBucketRpcFilters` + `normalizeExplorerFilters`), `bertel-tourism-ui/src/store/explorer-store.ts`, `bertel-tourism-ui/src/components/layout/TopBar.tsx` (≈108), `bertel-tourism-ui/src/utils/facets.test.ts`

**Interfaces:**
- Consumes: `p_filters.search_mode='global'` (Task 2).
- Produces: `ExplorerCommonFilters.searchScope?: 'name'|'global'`.

- [ ] **Step 1 — Test d'abord (facets.test.ts).** RED :

```ts
it('émet search_mode global quand searchScope=global et un terme est présent', () => {
  const filters = { ...DEFAULT_EXPLORER_FILTERS, common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'jacuzzi', searchScope: 'global' } };
  expect(buildBucketRpcFilters(filters as ExplorerFilters, 'all').search_mode).toBe('global');
});
it("n'émet pas search_mode global sans searchScope (picker éditeur)", () => {
  const filters = { ...DEFAULT_EXPLORER_FILTERS, common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'jacuzzi' } };
  expect(buildBucketRpcFilters(filters as ExplorerFilters, 'all').search_mode).toBeUndefined();
});
```

Run: `cd bertel-tourism-ui && npx jest src/utils/facets.test.ts -t "search_mode"` → FAIL.

- [ ] **Step 2 — Type.** Dans `domain.ts`, ajouter à `ExplorerCommonFilters` : `searchScope?: 'name' | 'global';`.

- [ ] **Step 3 — Builder.** Dans `buildBucketRpcFilters`, après lecture de `common`, ajouter :

```ts
  if (common.searchScope === 'global' && cleanString(common.search)) {
    payload.search_mode = 'global';
  }
```

S'assurer que `normalizeExplorerFilters` recopie `searchScope` (sinon l'ajouter dans le normaliseur, sans défaut).

- [ ] **Step 4 — Store.** Dans `explorer-store.ts`, le `common` initial pose `searchScope: 'global'` (l'Explorer envoie toujours global ; `DEFAULT_EXPLORER_FILTERS` reste sans `searchScope` pour ne pas contaminer `buildObjectSearchFilters`).

- [ ] **Step 5 — Placeholder.** `TopBar.tsx` ≈108 : `placeholder="Rechercher : nom, ville, équipement, plat, label…"`.

- [ ] **Step 6 — Vérifier GREEN + suite + types.**

Run: `cd bertel-tourism-ui && npx jest src/utils/facets.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 7 — Vérification preview (recherche réelle).** Démarrer le preview, taper « jacuzzi » dans l'Explorer, confirmer que des fiches équipées remontent ; taper un nom connu pour confirmer le tri par pertinence ; vérifier console/réseau (le payload porte `search_mode:'global'`).

- [ ] **Step 8 — Commit.**

```bash
git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/store/explorer-store.ts bertel-tourism-ui/src/components/layout/TopBar.tsx bertel-tourism-ui/src/utils/facets.test.ts
git commit -m "feat(explorer): recherche globale opt-in (search_mode) + placeholder (§109)" -- bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/store/explorer-store.ts bertel-tourism-ui/src/components/layout/TopBar.tsx bertel-tourism-ui/src/utils/facets.test.ts
```

---

## Task 5 : Documentation décisions

- [ ] **Step 1** — `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` : ajouter §109 (recherche Explorer globale : modèle, périmètre, visibilité, limite renommage référentiel, manifest 14y).
- [ ] **Step 2** — Proposer l'invariant CLAUDE.md (cf. spec §8) au PO.
- [ ] **Step 3 — Commit** `git commit -m "docs(decisions): §109 recherche Explorer globale" -- bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`.

---

## Self-Review

- **Couverture spec** : §3 champs→Task1 Step2 ; §4 maintenance/triggers→Task1 Step2-4 ; §4.3 perf/index→Task1 Step1/6 + Task2 Step2 ; §5 requête/rang→Task2 ; §6 front→Task4 ; §7 tests→Task3+Task4 ; §8 rollout→Task1-3 + Task5. OK.
- **Placeholders** : aucun TODO ; SQL/tests/édits front montrés. Les agrégats Task1 Step2 sont complets ; à valider syntaxiquement contre live à l'application (Step 7).
- **Cohérence types** : `relevance REAL` ajouté en sortie et consommé seulement par le caller liste (`f.relevance`) ; `search_mode` (clé JSONB) ↔ `searchScope` (front) mappés une seule fois dans `buildBucketRpcFilters`. `api.strip_markdown` présent (folded §106). `immutable_unaccent`/`api.norm_search` cohérents entre build et requête.

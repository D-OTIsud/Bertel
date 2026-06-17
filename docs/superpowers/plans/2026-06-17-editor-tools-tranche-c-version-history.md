# Tranche C — Outil « Versions / historique » (timeline + diff + restauration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'entrée OUTILS « Versions / historique » fonctionnelle — une `VersionHistoryModal` qui liste l'historique des versions canoniques (vN · date · auteur · type), permet d'inspecter le diff des champs canoniques d'une version, et de **restaurer** une version (champs canoniques uniquement, avec avertissement, créant une nouvelle version) — et remplacer le badge `v12` factice par le vrai `current_version`.

**Architecture :** Une migration backend neuve (`migration_object_version_read_restore.sql`) expose 3 RPC `SECURITY DEFINER` sur la table `object_version` déjà existante : `api.get_object_versions` (authorize-once, résout l'auteur via `app_user_profile`, calcule `changed_fields` via `LAG(data)`), `api.get_object_version_snapshot` (authorize-once, renvoie le snapshot JSONB), et `api.rpc_restore_object_version` (gate `user_can_write_object_canonical`, `UPDATE object` sur les colonnes canoniques inscriptibles uniquement — `status`/caches/identité exclus). Le frontend ajoute un service (`object-versions.ts`, fonctions pures de diff + appels RPC), deux hooks TanStack Query/Mutation, la `VersionHistoryModal`, et câble l'outil `'versions'` dans `ObjectEditPage` + `buildEditorTools`.

**Tech Stack :** PostgreSQL (Supabase, RLS + RPC `SECURITY DEFINER`), React 19 + TypeScript, Next.js App Router, TanStack Query, supabase-js (PostgREST `.schema('api').rpc(...)`), Jest + React Testing Library.

## Global Constraints

- **Backend = migration manifestée** — `migration_object_version_read_restore.sql` est ajoutée à `docs/SQL_ROLLOUT_RUNBOOK.md` (id de série **14q** — le plus haut courant est 14p) en ordre de dépendance, repliée dans `api_views_functions.sql`, et couverte par un test SQL sous `Base de donnée DLL et API/tests/`. Une fresh DB doit reproduire le live.
- **RPC `SECURITY DEFINER`** — `SET search_path` explicite ; `gen_random_uuid()` (jamais `uuid_generate_v4()`) ; `REVOKE EXECUTE ... FROM PUBLIC, anon` puis `GRANT EXECUTE ... TO authenticated, service_role`.
- **Authorize-once (§36)** — les RPC de lecture s'auto-autorisent : `IF p_object_id NOT IN (SELECT api.current_user_readable_object_ids()) THEN RAISE` ; ne jamais faire confiance à l'id passé par le client.
- **Restauration canonique uniquement** — `rpc_restore_object_version` n'écrit QUE les colonnes canoniques inscriptibles ; exclut `id`, `current_version`, `created_at`, `created_by`, `updated_at`, `is_editing`, toutes les colonnes `cached_*`, les colonnes générées (`name_normalized`, `name_search_vector`), et **`status`** (le changement de statut passe par `rpc_set_object_status`/`rpc_publish_object` — le trigger `trg_guard_object_status_change` est `BEFORE UPDATE OF status`, donc exclure `status` de la liste de colonnes l'évite entièrement).
- **Pas de données factices** — le badge nav affiche le vrai `current_version` (issu de la requête versions) ; le badge `v12` codé en dur a déjà été retiré en tranche B (pas de `stat` sur l'outil `versions` après B).
- **Immutabilité** — les fonctions pures de diff retournent de nouvelles structures ; pas de mutation d'entrée.
- **Style maison** — la modale réutilise `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (de `components/ui/dialog`) + les classes `btn`/`btn primary`/`btn danger`, comme `BlockersModal`/`EditorModal`.
- **TDD** — fonctions pures et SQL testés avant câblage ; suite Jest + `tsc` + `next build` verts avant de clore ; test SQL vérifié en transient + ROLLBACK.
- **Cross-tranche (dépend de B)** — `EditorNav` est piloté par props `tools: EditorToolItem[]` + `onToolSelect: (key: EditorToolKey)=>void`, `EditorToolKey = 'versions'|'import-export'|'archive'`, et `buildEditorTools` vit dans `src/features/object-editor/shell/editor-tools.ts`. Cette tranche **active** l'outil `'versions'` (passe `disabled: false` + un `stat` = numéro de version) et ajoute son handler dans `ObjectEditPage`. Tranche B doit être appliquée avant.
- **Commits** — directement sur `master`, uniquement les hunks de cette tranche, pas de trailer co-author (le push est fait par le PO).
- **CWD des commandes** — `C:/Users/dphil/Bertel3.0/bertel-tourism-ui` (toutes les commandes `npx jest` / `npx tsc` / `npm run build`).

---

## File Structure

- **Create** `Base de donnée DLL et API/migration_object_version_read_restore.sql` — les 3 RPC (`get_object_versions`, `get_object_version_snapshot`, `rpc_restore_object_version`) + grants. Source unique de l'historique/restauration.
- **Create** `Base de donnée DLL et API/tests/test_object_version_read_restore.sql` — test SQL : authorize-once (scope), `changed_fields`, restore exclut `status`/caches/id, restore crée une nouvelle version.
- **Modify** `Base de donnée DLL et API/api_views_functions.sql` — replier les 3 RPC (fold pour la fresh-apply parity).
- **Modify** `docs/SQL_ROLLOUT_RUNBOOK.md` — entrée manifeste 14q en ordre de dépendance.
- **Create** `bertel-tourism-ui/src/services/object-versions.ts` — types `ObjectVersionRow`/`ObjectVersionDiffField`, fonctions pures `computeVersionDiff`/`formatChangeType`, et les appels RPC `getObjectVersions`/`getObjectVersionSnapshot`/`restoreObjectVersion`.
- **Create** `bertel-tourism-ui/src/services/object-versions.test.ts` — tests des fonctions pures + des callers RPC (mock supabase).
- **Modify** `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` — `useObjectVersionsQuery` + `useRestoreObjectVersionMutation`.
- **Create** `bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.tsx` — la modale timeline + diff + restauration.
- **Create** `bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.test.tsx` — tests de rendu/diff/confirmation de restauration.
- **Modify** `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts` — activer l'outil `'versions'` (un nouveau champ `currentVersion?` dans l'input ⇒ `disabled: false` + `stat: 'vN'`).
- **Modify** `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts` — couvrir l'outil `versions` activé.
- **Modify** `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` — câbler la requête versions, l'état de la modale, le handler `'versions'`, et passer `currentVersion` à `buildEditorTools`.

---

### Task 1: Backend — RPC `get_object_versions` / `get_object_version_snapshot` / `rpc_restore_object_version`

**Files:**
- Create: `Base de donnée DLL et API/migration_object_version_read_restore.sql`
- Test: `Base de donnée DLL et API/tests/test_object_version_read_restore.sql`
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (fold)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (manifest 14q)

**Interfaces:**
- Consumes (existant, vérifié) : `api.current_user_readable_object_ids()` (SETOF text, published ∪ extended — `migration_cards_batch_authorize_definer.sql`), `api.user_can_write_object_canonical(text)` (`migration_permission_write_paths.sql`), table `object_version(object_id, version_number, data jsonb, created_at, created_by uuid, change_type, change_reason)` + index `idx_object_version_object_id_created`, table `app_user_profile(id uuid, display_name text)`, trigger `save_object_version()` (auto-capture append-only sur `UPDATE object`).
- Produces :
  - `api.get_object_versions(p_object_id text, p_limit int default 50, p_offset int default 0) RETURNS TABLE(version_number int, created_at timestamptz, created_by_name text, change_type text, change_reason text, changed_fields text[])`
  - `api.get_object_version_snapshot(p_object_id text, p_version_number int) RETURNS jsonb`
  - `api.rpc_restore_object_version(p_object_id text, p_version_number int) RETURNS void`

- [ ] **Step 1: Write the failing SQL test**

```sql
-- Base de donnée DLL et API/tests/test_object_version_read_restore.sql
-- Proves migration_object_version_read_restore.sql: authorize-once scope, changed_fields via LAG,
-- restore writes ONLY canonical columns (status/caches/id excluded) and creates a NEW append-only version.
-- Run AFTER the full manifest (incl. migration_object_version_read_restore.sql + seeds).
-- Self-contained + transactional (ROLLBACK; nothing persists). Inserts run as the connecting
-- superuser (RLS bypassed); SET LOCAL ROLE + request.jwt.claims drive the per-role checks.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj       text := 'PCURUN9999999C01';  -- published object we own (mutated to build versions)
  v_other     text := 'PCURUN9999999C02';  -- published object the stranger may NOT read scope-wise
  v_other_uid uuid := '00000000-0000-4000-a000-0000000000d1';
  v_n         int;
  v_fields    text[];
  v_snap      jsonb;
  v_cur_after int;
  v_status_after text;
  v_name_after   text;
  v_raised    boolean := false;
BEGIN
  -- ---------- Structural assertions (catalog) ----------
  ASSERT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='api' AND p.proname='get_object_versions'),
         'get_object_versions must be SECURITY DEFINER';
  ASSERT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='api' AND p.proname='rpc_restore_object_version'),
         'rpc_restore_object_version must be SECURITY DEFINER';
  ASSERT NOT has_function_privilege('anon', 'api.get_object_versions(text,integer,integer)', 'EXECUTE'),
         'anon must NOT have EXECUTE on get_object_versions';
  ASSERT has_function_privilege('authenticated', 'api.rpc_restore_object_version(text,integer)', 'EXECUTE'),
         'authenticated must have EXECUTE on rpc_restore_object_version';

  -- ---------- Fixture (as superuser; RLS bypassed; triggers fire normally) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_obj,   'PCU', 'Version test base', 'published'),
    (v_other, 'PCU', 'Version test other', 'published');
  -- Build version history on v_obj. Each UPDATE that changes a non-cache column appends a version.
  UPDATE object SET name = 'Version test v2'              WHERE id = v_obj;  -- changed: name
  UPDATE object SET commercial_visibility = 'suspended'   WHERE id = v_obj;  -- changed: commercial_visibility
  -- pure cache-only change does NOT create a version (save_object_version skips it)
  UPDATE object SET cached_rating = 4.5                    WHERE id = v_obj;

  SELECT count(*) INTO v_n FROM object_version WHERE object_id = v_obj;
  ASSERT v_n >= 2, 'expected >=2 captured versions (cache-only update must NOT append)';

  -- the stranger (no membership/actor on any object) for the scope test
  INSERT INTO auth.users (id, email) VALUES (v_other_uid, 'version_stranger@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES (v_other_uid, 'tourism_agent', 'Marie Stranger')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

  -- ---------- changed_fields: the LAG diff lists 'name' for the v2 version, never a cache key ----------
  SELECT changed_fields INTO v_fields
  FROM api.get_object_versions(v_obj, 50, 0)
  WHERE version_number = (SELECT min(version_number) + 1 FROM object_version WHERE object_id = v_obj);
  ASSERT 'name' = ANY(v_fields), 'changed_fields must include name for the rename version';
  ASSERT NOT ('cached_rating' = ANY(COALESCE(v_fields,'{}'))), 'changed_fields must NOT include cache columns';
  ASSERT NOT ('updated_at'   = ANY(COALESCE(v_fields,'{}'))), 'changed_fields must NOT include updated_at';
  ASSERT NOT ('current_version' = ANY(COALESCE(v_fields,'{}'))), 'changed_fields must NOT include current_version';

  -- ---------- snapshot returns the data jsonb of the requested version ----------
  v_snap := api.get_object_version_snapshot(v_obj, (SELECT min(version_number) FROM object_version WHERE object_id = v_obj));
  ASSERT v_snap ? 'name', 'snapshot must be the row jsonb (has a name key)';

  -- ---------- AUTHORIZE-ONCE: stranger cannot read versions/snapshot for an out-of-scope object ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- v_other IS published ⇒ in readable scope ⇒ allowed (no rows is fine: 0 versions for a never-updated obj)
    PERFORM api.get_object_versions(v_other, 50, 0);
    -- a fabricated unknown id is NOT in the readable set ⇒ must RAISE
    v_raised := false;
    BEGIN
      PERFORM api.get_object_versions('PCURUN0000000NONE', 50, 0);
    EXCEPTION WHEN others THEN v_raised := true;
    END;
    ASSERT v_raised, 'get_object_versions must RAISE for an id outside the caller readable scope';
    -- restore is gated on canonical-write: stranger cannot restore v_obj
    v_raised := false;
    BEGIN
      PERFORM api.rpc_restore_object_version(v_obj, (SELECT min(version_number) FROM object_version WHERE object_id = v_obj));
    EXCEPTION WHEN others THEN v_raised := true;
    END;
    ASSERT v_raised, 'rpc_restore_object_version must RAISE for a non-writer';
  RESET ROLE;

  -- ---------- RESTORE (as superuser = writer): brings name back, leaves status, appends a version ----------
  SELECT current_version INTO v_cur_after FROM object WHERE id = v_obj;
  PERFORM api.rpc_restore_object_version(v_obj, (SELECT min(version_number) FROM object_version WHERE object_id = v_obj));
  SELECT status::text, name, current_version INTO v_status_after, v_name_after, v_n FROM object WHERE id = v_obj;
  ASSERT v_status_after = 'published', 'restore must NOT change status';
  ASSERT v_name_after = 'Version test base', 'restore must bring back the v1 canonical name';
  ASSERT v_n > v_cur_after, 'restore must create a NEW version (append-only history)';

  RAISE NOTICE 'object_version read/restore assertions passed (scope + changed_fields + restore exclusions + new version).';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails**

This test runs against a live/local Supabase via psql/MCP. Run it (transient, with ROLLBACK) **before** creating the migration:
`psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_object_version_read_restore.sql"`
Expected: FAIL — `function api.get_object_versions(text, integer, integer) does not exist` (the RPC is not created yet).

- [ ] **Step 3: Write the migration (minimal implementation)**

```sql
-- Base de donnée DLL et API/migration_object_version_read_restore.sql
-- §3.C — Editor "Versions / historique" tool: read history + canonical restore over the existing
-- append-only object_version table (snapshot JSONB of the object row, captured by save_object_version()).
-- Three SECURITY DEFINER RPCs:
--   (1) api.get_object_versions     — authorize-once (§36) timeline; resolves the author via
--       app_user_profile.display_name; computes changed_fields = the keys whose value differs from the
--       previous version (LAG(data) OVER version_number), MINUS the cache/updated_at/current_version
--       columns (mirrors save_object_version's own ignore-list ⇒ no noise rows in the diff).
--   (2) api.get_object_version_snapshot — same authorize-once; returns the data jsonb of one version.
--   (3) api.rpc_restore_object_version — gated by api.user_can_write_object_canonical; UPDATE object SET
--       only the WRITABLE CANONICAL columns from the snapshot. EXCLUDES id, current_version, created_at,
--       created_by, updated_at, is_editing, every cached_* column, the generated columns
--       (name_normalized/name_search_vector are GENERATED ALWAYS ⇒ cannot be assigned), and STATUS.
--       Status is excluded ON PURPOSE: status changes go through rpc_set_object_status / rpc_publish_object,
--       enforced by trg_guard_object_status_change (BEFORE UPDATE OF status) — by NOT listing status in the
--       SET clause that trigger never fires, so a restore can never silently un/re-publish a fiche.
--       The existing save_object_version trigger auto-captures a NEW version for this UPDATE: history is
--       append-only; restore = a new version forward, never a rewrite of the past.
-- AUTHORIZE-ONCE (§36): the read RPCs are PostgREST-executable (authenticated). They self-authorize their
--   p_object_id against api.current_user_readable_object_ids() (published ∪ extended = the object table's
--   own SELECT visibility) — never trust the caller's id. The 0028/0029 SECURITY-DEFINER advisor on these
--   RPCs is EXPECTED (§36 precedent).
-- PREREQUISITES: migration_cards_batch_authorize_definer.sql (api.current_user_readable_object_ids),
--   migration_permission_write_paths.sql (api.user_can_write_object_canonical), schema_unified.sql
--   (object, object_version, save_object_version, app_user_profile). Manifest step 14q.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + guarded grants. REVERSIBLE: DROP the three functions.
\set ON_ERROR_STOP on
BEGIN;

-- (1) Timeline + per-version changed_fields. The cache/meta ignore-list is the SAME set
--     save_object_version() strips, so a captured version never differs only on noise.
CREATE OR REPLACE FUNCTION api.get_object_versions(
  p_object_id text,
  p_limit     int DEFAULT 50,
  p_offset    int DEFAULT 0
)
RETURNS TABLE(
  version_number int,
  created_at     timestamptz,
  created_by_name text,
  change_type    text,
  change_reason  text,
  changed_fields text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  -- authorize-once: never trust the caller's id (PostgREST-executable).
  IF p_object_id NOT IN (SELECT api.current_user_readable_object_ids()) THEN
    RAISE EXCEPTION 'FORBIDDEN: object % is not readable by the current user', p_object_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ignore_keys AS (
    SELECT ARRAY[
      'updated_at','is_editing','commercial_visibility',
      'cached_min_price','cached_main_image_url','cached_rating','cached_review_count',
      'cached_is_open_now','cached_amenity_codes','cached_payment_codes','cached_environment_tags',
      'cached_language_codes','cached_classification_codes','cached_taxonomy_codes',
      'current_version','updated_by'
    ]::text[] AS keys
  ), ordered AS (
    SELECT
      ov.version_number,
      ov.created_at,
      ov.created_by,
      ov.change_type,
      ov.change_reason,
      ov.data,
      LAG(ov.data) OVER (ORDER BY ov.version_number) AS prev_data
    FROM object_version ov
    WHERE ov.object_id = p_object_id
  )
  SELECT
    o.version_number,
    o.created_at,
    COALESCE(p.display_name, '') AS created_by_name,
    o.change_type,
    o.change_reason,
    COALESCE(
      (
        SELECT array_agg(k ORDER BY k)
        FROM jsonb_object_keys(o.data) AS k
        WHERE NOT (k = ANY((SELECT keys FROM ignore_keys)))
          AND (
            o.prev_data IS NULL
            OR (o.data -> k) IS DISTINCT FROM (o.prev_data -> k)
          )
          AND o.prev_data IS NOT NULL  -- the first version has no "changed" set (full snapshot)
      ),
      '{}'::text[]
    ) AS changed_fields
  FROM ordered o
  LEFT JOIN app_user_profile p ON p.id = o.created_by
  ORDER BY o.version_number DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION api.get_object_versions(text, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_object_versions(text, int, int) TO authenticated, service_role;

-- (2) Single-version snapshot (the full data jsonb) for the detailed diff.
CREATE OR REPLACE FUNCTION api.get_object_version_snapshot(
  p_object_id      text,
  p_version_number int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF p_object_id NOT IN (SELECT api.current_user_readable_object_ids()) THEN
    RAISE EXCEPTION 'FORBIDDEN: object % is not readable by the current user', p_object_id
      USING ERRCODE = '42501';
  END IF;

  SELECT ov.data INTO v_data
  FROM object_version ov
  WHERE ov.object_id = p_object_id AND ov.version_number = p_version_number
  ORDER BY ov.created_at DESC
  LIMIT 1;

  RETURN v_data;  -- NULL if the version does not exist (the client renders an empty diff)
END;
$$;

REVOKE EXECUTE ON FUNCTION api.get_object_version_snapshot(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_object_version_snapshot(text, int) TO authenticated, service_role;

-- (3) Restore: apply ONLY writable canonical columns from the snapshot. EXCLUDES id, current_version,
--     created_at/by, updated_at, is_editing, all cached_*, the generated columns, and STATUS.
CREATE OR REPLACE FUNCTION api.rpc_restore_object_version(
  p_object_id      text,
  p_version_number int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_data   jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_restore_object_version requires an authenticated user';
  END IF;
  IF NOT api.user_can_write_object_canonical(p_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: restoring a version requires canonical-write rights on object %', p_object_id
      USING ERRCODE = '42501';
  END IF;

  SELECT ov.data INTO v_data
  FROM object_version ov
  WHERE ov.object_id = p_object_id AND ov.version_number = p_version_number
  ORDER BY ov.created_at DESC
  LIMIT 1;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: version % of object % does not exist', p_version_number, p_object_id;
  END IF;

  -- Writable canonical columns only. Explicit list (NOT a generic jsonb_populate) so a future column
  -- is opt-in and status/caches/identity/generated columns can never be reached by a restore.
  UPDATE object SET
    object_type       = COALESCE((v_data ->> 'object_type'), object_type::text)::object_type,
    name              = COALESCE((v_data ->> 'name'), name),
    business_timezone = COALESCE((v_data ->> 'business_timezone'), business_timezone),
    commercial_visibility = COALESCE((v_data ->> 'commercial_visibility'), commercial_visibility),
    region_code       = NULLIF(v_data ->> 'region_code', ''),
    updated_at_source = CASE WHEN v_data ? 'updated_at_source'
                             THEN (v_data ->> 'updated_at_source')::timestamptz ELSE updated_at_source END,
    secondary_types   = CASE WHEN v_data ? 'secondary_types'
                             THEN ARRAY(SELECT jsonb_array_elements_text(v_data -> 'secondary_types'))::object_type[]
                             ELSE secondary_types END,
    extra             = CASE WHEN v_data ? 'extra' THEN (v_data -> 'extra') ELSE extra END,
    name_i18n         = CASE WHEN v_data ? 'name_i18n' THEN (v_data -> 'name_i18n') ELSE name_i18n END,
    updated_by        = v_caller,
    updated_at        = NOW()
  WHERE id = p_object_id;
  -- The trg_object_version trigger fires on this UPDATE and appends a new version (append-only).
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_restore_object_version(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_restore_object_version(text, int) TO authenticated, service_role;

COMMIT;

-- After applying to a live database: NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Apply the migration + run the test to verify it passes**

Apply transiently and run the test (against local/live via MCP `apply_migration` or psql):
`psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/migration_object_version_read_restore.sql"`
then
`psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_object_version_read_restore.sql"`
Expected: PASS — `NOTICE: object_version read/restore assertions passed (...)` and `ROLLBACK`.

- [ ] **Step 5: Fold the 3 RPCs into `api_views_functions.sql`**

Append the three `CREATE OR REPLACE FUNCTION` blocks (and their `REVOKE`/`GRANT`) **verbatim** from the migration to the end of `api_views_functions.sql`, under a header comment:

```sql
-- =====================================================
-- §3.C — Object version history read + canonical restore (manifest 14q).
-- Mirrors migration_object_version_read_restore.sql VERBATIM so a fresh apply == live.
-- Authorize-once read RPCs (§36) + canonical-write-gated restore (status/caches/id excluded).
-- =====================================================
```

(Paste the `api.get_object_versions`, `api.get_object_version_snapshot`, `api.rpc_restore_object_version` definitions + grants exactly as in Step 3, minus the `BEGIN;`/`COMMIT;`/`\set` lines — this file is not transaction-wrapped.)

- [ ] **Step 6: Add the manifest entry to `docs/SQL_ROLLOUT_RUNBOOK.md`**

Insert after the `14p.` line (highest current id), keeping the dependency order:

```markdown
14q. `migration_object_version_read_restore.sql` — **§3.C éditeur « Versions / historique »** : 3 RPC `SECURITY DEFINER` sur la table `object_version` existante (snapshot JSONB append-only capté par `save_object_version`). (1) `api.get_object_versions(p_object_id, p_limit, p_offset)` — authorize-once (§36 : `p_object_id IN api.current_user_readable_object_ids()` sinon `RAISE 42501`) ; auteur résolu via `app_user_profile.display_name` ; `changed_fields` = clés du `data` qui diffèrent de la version précédente (`LAG(data) OVER version_number`) MOINS la liste cache/`updated_at`/`current_version`/`updated_by` (la même que `save_object_version` ignore). (2) `api.get_object_version_snapshot(p_object_id, p_version_number)` — même authorize-once ; renvoie le `data` jsonb. (3) `api.rpc_restore_object_version(p_object_id, p_version_number)` — gate `api.user_can_write_object_canonical` ; `UPDATE object` sur les **colonnes canoniques inscriptibles uniquement** (liste explicite : object_type/name/business_timezone/commercial_visibility/region_code/updated_at_source/secondary_types/extra/name_i18n) ; EXCLUT `id`, `current_version`, `created_at/by`, `updated_at`, `is_editing`, tous les `cached_*`, les colonnes générées (`name_normalized`/`name_search_vector`), et **`status`** (le changement de statut passe par `rpc_set_object_status`/`rpc_publish_object` ; `trg_guard_object_status_change` est `BEFORE UPDATE OF status` ⇒ ne pas lister `status` l'évite). Le trigger `save_object_version` capte une **nouvelle** version pour cet UPDATE (append-only ; restaurer = nouvelle version, pas de réécriture du passé). Grants : `REVOKE … FROM PUBLIC, anon` puis `GRANT … TO authenticated, service_role` ; l'advisor `0028/0029_*_security_definer_function_executable` sur les 3 RPC est **attendu** (§36). After step 1 (`schema_unified.sql` — `object`/`object_version`/`save_object_version`/`app_user_profile`), `migration_cards_batch_authorize_definer.sql` (`api.current_user_readable_object_ids`), `migration_permission_write_paths.sql` (`api.user_can_write_object_canonical`), et la api functions file (`api_views_functions.sql`). Idempotent (`CREATE OR REPLACE` + grants gardés). Couvert par `tests/test_object_version_read_restore.sql`. **Folded into `api_views_functions.sql`.** Decision log §C.
```

- [ ] **Step 7: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add "Base de donnée DLL et API/migration_object_version_read_restore.sql" "Base de donnée DLL et API/tests/test_object_version_read_restore.sql" "Base de donnée DLL et API/api_views_functions.sql" "docs/SQL_ROLLOUT_RUNBOOK.md"
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(db): object_version read + canonical restore RPCs (tranche C)"
```

---

### Task 2: Service — `object-versions.ts` (types + pure diff + RPC callers)

**Files:**
- Create: `bertel-tourism-ui/src/services/object-versions.ts`
- Test: `bertel-tourism-ui/src/services/object-versions.test.ts`

**Interfaces:**
- Consumes: `getApiClient` from `../lib/supabase`; `useSessionStore` from `../store/session-store` (demoMode short-circuit, like every other service in `object-workspace.ts`).
- Produces:
  - `interface ObjectVersionRow { versionNumber: number; createdAt: string; createdByName: string; changeType: string; changeReason: string; changedFields: string[] }`
  - `interface ObjectVersionDiffField { key: string; before: string; after: string }`
  - `function computeVersionDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): ObjectVersionDiffField[]`
  - `function formatChangeType(changeType: string): string`
  - `async function getObjectVersions(objectId: string, limit?: number, offset?: number): Promise<ObjectVersionRow[]>`
  - `async function getObjectVersionSnapshot(objectId: string, versionNumber: number): Promise<Record<string, unknown> | null>`
  - `async function restoreObjectVersion(objectId: string, versionNumber: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// bertel-tourism-ui/src/services/object-versions.test.ts
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: () => ({ demoMode: false }) },
}));

import { getApiClient } from '../lib/supabase';
import {
  computeVersionDiff,
  formatChangeType,
  getObjectVersions,
  getObjectVersionSnapshot,
  restoreObjectVersion,
} from './object-versions';

const mockGetApiClient = getApiClient as jest.Mock;

describe('computeVersionDiff', () => {
  it('lists only the keys that differ, with before/after stringified', () => {
    const diff = computeVersionDiff(
      { name: 'Old', region_code: 'RUN', extra: null },
      { name: 'New', region_code: 'RUN', extra: { a: 1 } },
    );
    const byKey = Object.fromEntries(diff.map((d) => [d.key, d]));
    expect(Object.keys(byKey).sort()).toEqual(['extra', 'name']);
    expect(byKey.name).toEqual({ key: 'name', before: 'Old', after: 'New' });
    expect(byKey.extra.after).toContain('"a":1');
  });

  it('ignores cache/meta columns even when they differ', () => {
    const diff = computeVersionDiff(
      { name: 'A', cached_rating: 1, updated_at: 't1', current_version: 1 },
      { name: 'A', cached_rating: 5, updated_at: 't2', current_version: 2 },
    );
    expect(diff).toEqual([]);
  });

  it('treats a null side as an all-keys add/remove without throwing', () => {
    expect(computeVersionDiff(null, { name: 'X' })).toEqual([
      { key: 'name', before: '', after: 'X' },
    ]);
    expect(computeVersionDiff({ name: 'X' }, null)).toEqual([
      { key: 'name', before: 'X', after: '' },
    ]);
  });
});

describe('formatChangeType', () => {
  it('maps the backend change_type to a French label', () => {
    expect(formatChangeType('insert')).toBe('Création');
    expect(formatChangeType('update')).toBe('Modification');
    expect(formatChangeType('delete')).toBe('Suppression');
    expect(formatChangeType('weird')).toBe('weird');
  });
});

describe('getObjectVersions', () => {
  it('calls the RPC and maps snake_case rows to camelCase', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          version_number: 3,
          created_at: '2026-06-17T10:00:00Z',
          created_by_name: 'Alice',
          change_type: 'update',
          change_reason: null,
          changed_fields: ['name'],
        },
      ],
      error: null,
    });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });

    const rows = await getObjectVersions('PCURUN0000000001', 50, 0);
    expect(rpc).toHaveBeenCalledWith('get_object_versions', {
      p_object_id: 'PCURUN0000000001',
      p_limit: 50,
      p_offset: 0,
    });
    expect(rows).toEqual([
      {
        versionNumber: 3,
        createdAt: '2026-06-17T10:00:00Z',
        createdByName: 'Alice',
        changeType: 'update',
        changeReason: '',
        changedFields: ['name'],
      },
    ]);
  });

  it('throws a friendly message on RPC error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await expect(getObjectVersions('PCURUN0000000001')).rejects.toThrow(/historique/i);
  });
});

describe('getObjectVersionSnapshot', () => {
  it('returns the data record from the RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { name: 'X' }, error: null });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    const snap = await getObjectVersionSnapshot('PCURUN0000000001', 2);
    expect(rpc).toHaveBeenCalledWith('get_object_version_snapshot', {
      p_object_id: 'PCURUN0000000001',
      p_version_number: 2,
    });
    expect(snap).toEqual({ name: 'X' });
  });
});

describe('restoreObjectVersion', () => {
  it('calls the restore RPC and resolves on success', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await restoreObjectVersion('PCURUN0000000001', 2);
    expect(rpc).toHaveBeenCalledWith('rpc_restore_object_version', {
      p_object_id: 'PCURUN0000000001',
      p_version_number: 2,
    });
  });

  it('throws a friendly message on RPC error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await expect(restoreObjectVersion('PCURUN0000000001', 2)).rejects.toThrow(/restaur/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/object-versions.test.ts`
Expected: FAIL — `Cannot find module './object-versions'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// bertel-tourism-ui/src/services/object-versions.ts
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

/** One row from api.get_object_versions (snake_case → camelCase). */
export interface ObjectVersionRow {
  versionNumber: number;
  createdAt: string;
  createdByName: string;
  changeType: string;
  changeReason: string;
  changedFields: string[];
}

/** One canonical field that changed between two snapshots. */
export interface ObjectVersionDiffField {
  key: string;
  before: string;
  after: string;
}

/**
 * Cache/meta keys the diff ignores — the SAME ignore-list save_object_version() / get_object_versions
 * use, so a snapshot diff never surfaces noise rows. Keep in lockstep with the SQL list.
 */
const DIFF_IGNORE_KEYS: ReadonlySet<string> = new Set([
  'updated_at', 'is_editing', 'commercial_visibility',
  'cached_min_price', 'cached_main_image_url', 'cached_rating', 'cached_review_count',
  'cached_is_open_now', 'cached_amenity_codes', 'cached_payment_codes', 'cached_environment_tags',
  'cached_language_codes', 'cached_classification_codes', 'cached_taxonomy_codes',
  'current_version', 'updated_by', 'created_at', 'created_by', 'id',
  'name_normalized', 'name_search_vector',
]);

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/** Pure: the canonical fields that differ between two snapshots, cache/meta keys excluded. */
export function computeVersionDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): ObjectVersionDiffField[] {
  const keys = new Set<string>();
  for (const k of Object.keys(before ?? {})) keys.add(k);
  for (const k of Object.keys(after ?? {})) keys.add(k);

  const diff: ObjectVersionDiffField[] = [];
  for (const key of keys) {
    if (DIFF_IGNORE_KEYS.has(key)) {
      continue;
    }
    const beforeStr = stringifyValue(before?.[key]);
    const afterStr = stringifyValue(after?.[key]);
    if (beforeStr !== afterStr) {
      diff.push({ key, before: beforeStr, after: afterStr });
    }
  }
  return diff.sort((a, b) => a.key.localeCompare(b.key));
}

/** Pure: backend change_type → French label. */
export function formatChangeType(changeType: string): string {
  if (changeType === 'insert') return 'Création';
  if (changeType === 'update') return 'Modification';
  if (changeType === 'delete') return 'Suppression';
  return changeType;
}

function readRow(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** api.get_object_versions — timeline of canonical versions, newest first. */
export async function getObjectVersions(
  objectId: string,
  limit = 50,
  offset = 0,
): Promise<ObjectVersionRow[]> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return [];
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour l'historique des versions.");
  }
  const { data, error } = await apiClient.schema('api').rpc('get_object_versions', {
    p_object_id: objectId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error("Impossible de charger l'historique des versions.");
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw) => {
    const row = readRow(raw);
    return {
      versionNumber: Number(row.version_number ?? 0),
      createdAt: String(row.created_at ?? ''),
      createdByName: String(row.created_by_name ?? ''),
      changeType: String(row.change_type ?? ''),
      changeReason: String(row.change_reason ?? ''),
      changedFields: Array.isArray(row.changed_fields) ? (row.changed_fields as string[]) : [],
    };
  });
}

/** api.get_object_version_snapshot — the full row jsonb of one version (null if absent). */
export async function getObjectVersionSnapshot(
  objectId: string,
  versionNumber: number,
): Promise<Record<string, unknown> | null> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour l'historique des versions.");
  }
  const { data, error } = await apiClient.schema('api').rpc('get_object_version_snapshot', {
    p_object_id: objectId,
    p_version_number: versionNumber,
  });
  if (error) {
    throw new Error("Impossible de charger cette version.");
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

/** api.rpc_restore_object_version — restores canonical fields and appends a new version. */
export async function restoreObjectVersion(objectId: string, versionNumber: number): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour restaurer cette version.");
  }
  const { error } = await apiClient.schema('api').rpc('rpc_restore_object_version', {
    p_object_id: objectId,
    p_version_number: versionNumber,
  });
  if (error) {
    throw new Error("Impossible de restaurer cette version.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/object-versions.test.ts`
Expected: PASS (all diff / formatChangeType / getObjectVersions / snapshot / restore cases).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/services/object-versions.ts bertel-tourism-ui/src/services/object-versions.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): object-versions service — pure diff + read/restore RPC callers (C)"
```

---

### Task 3: Hooks — `useObjectVersionsQuery` + `useRestoreObjectVersionMutation`

**Files:**
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts`

**Interfaces:**
- Consumes: `getObjectVersions`, `restoreObjectVersion` from `../services/object-versions` (Task 2); existing `useQuery`/`useMutation`/`useQueryClient` (already imported line 1).
- Produces:
  - `function useObjectVersionsQuery(objectId: string | null)` — `useQuery` keyed `['object-versions', objectId]`, `enabled: Boolean(objectId)`.
  - `function useRestoreObjectVersionMutation(objectId: string | null)` — `useMutation` over `restoreObjectVersion`, invalidates `['object-versions', objectId]`, `['object-workspace', objectId]`, `['object-detail', objectId]` on success.

- [ ] **Step 1: Add the service import** (extend the existing `from '../services/object-workspace'` block is wrong — these live in a NEW module; add a fresh import line after line 43, the end of the object-workspace import block)

```ts
import { getObjectVersions, restoreObjectVersion } from '../services/object-versions';
```

- [ ] **Step 2: Append the two hooks** (after `useSetObjectStatusMutation`, i.e. after line 392)

```ts
export function useObjectVersionsQuery(objectId: string | null) {
  return useQuery({
    queryKey: ['object-versions', objectId],
    queryFn: () => getObjectVersions(objectId ?? ''),
    enabled: Boolean(objectId),
    staleTime: 30 * 1000,
  });
}

export function useRestoreObjectVersionMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionNumber: number) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour restaurer une version.");
      }
      return restoreObjectVersion(objectId, versionNumber);
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-versions', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
      ]);
    },
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (the new hooks reference existing imports; the service module from Task 2 exists).

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/hooks/useExplorerQueries.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): useObjectVersionsQuery + useRestoreObjectVersionMutation (C)"
```

---

### Task 4: `VersionHistoryModal` (timeline + expand-to-diff + restore-with-warning)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `../../../components/ui/dialog`; `ObjectVersionRow`, `ObjectVersionDiffField`, `computeVersionDiff`, `formatChangeType`, `getObjectVersionSnapshot` from `../../../services/object-versions`.
- Produces: `VersionHistoryModal` (presentational + own snapshot-fetch on expand). Props:
  - `interface VersionHistoryModalProps { open: boolean; onClose: () => void; objectId: string; versions: ObjectVersionRow[]; isLoading: boolean; canRestore: boolean; restoreDisabledReason?: string; restoringVersion: number | null; onRestore: (versionNumber: number) => void }`

- [ ] **Step 1: Write the failing test**

```tsx
// bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { ObjectVersionRow } from '../../../services/object-versions';

jest.mock('../../../services/object-versions', () => {
  const actual = jest.requireActual('../../../services/object-versions');
  return { ...actual, getObjectVersionSnapshot: jest.fn() };
});
import { getObjectVersionSnapshot } from '../../../services/object-versions';
const mockSnapshot = getObjectVersionSnapshot as jest.Mock;

const VERSIONS: ObjectVersionRow[] = [
  { versionNumber: 3, createdAt: '2026-06-17T10:00:00Z', createdByName: 'Alice', changeType: 'update', changeReason: '', changedFields: ['name'] },
  { versionNumber: 2, createdAt: '2026-06-16T09:00:00Z', createdByName: '', changeType: 'update', changeReason: '', changedFields: ['region_code'] },
  { versionNumber: 1, createdAt: '2026-06-15T08:00:00Z', createdByName: 'Bob', changeType: 'insert', changeReason: '', changedFields: [] },
];

function setup(overrides: Partial<React.ComponentProps<typeof VersionHistoryModal>> = {}) {
  const onClose = jest.fn();
  const onRestore = jest.fn();
  render(
    <VersionHistoryModal
      open
      onClose={onClose}
      objectId="PCURUN0000000001"
      versions={VERSIONS}
      isLoading={false}
      canRestore
      restoringVersion={null}
      onRestore={onRestore}
      {...overrides}
    />,
  );
  return { onClose, onRestore };
}

describe('VersionHistoryModal', () => {
  beforeEach(() => mockSnapshot.mockReset());

  it('renders a timeline row per version with number, author, and change type', () => {
    setup();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getAllByText('Modification').length).toBeGreaterThan(0);
    expect(screen.getByText('Création')).toBeInTheDocument();
  });

  it('fetches both snapshots and renders the canonical diff when a version is expanded', async () => {
    mockSnapshot.mockImplementation((_id: string, n: number) =>
      Promise.resolve(n === 3 ? { name: 'New', region_code: 'RUN' } : { name: 'Old', region_code: 'RUN' }),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Voir les changements de la version 3/i }));
    expect(await screen.findByText('name')).toBeInTheDocument();
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(mockSnapshot).toHaveBeenCalledWith('PCURUN0000000001', 3);
    expect(mockSnapshot).toHaveBeenCalledWith('PCURUN0000000001', 2);
  });

  it('shows the canonical-only restore warning and fires onRestore', () => {
    const { onRestore } = setup();
    expect(screen.getByText(/champs principaux uniquement/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Restaurer la version 1/i }));
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('disables restore with the supplied reason when canRestore is false', () => {
    setup({ canRestore: false, restoreDisabledReason: 'Lecture seule.' });
    const btn = screen.getByRole('button', { name: /Restaurer la version 1/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Lecture seule.');
  });

  it('renders an empty state when there are no versions', () => {
    setup({ versions: [] });
    expect(screen.getByText(/Aucun historique/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/widgets/VersionHistoryModal.test.tsx`
Expected: FAIL — `Cannot find module './VersionHistoryModal'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import {
  computeVersionDiff,
  formatChangeType,
  getObjectVersionSnapshot,
  type ObjectVersionDiffField,
  type ObjectVersionRow,
} from '../../../services/object-versions';

interface VersionHistoryModalProps {
  open: boolean;
  onClose: () => void;
  objectId: string;
  versions: ObjectVersionRow[];
  isLoading: boolean;
  canRestore: boolean;
  restoreDisabledReason?: string;
  /** versionNumber being restored (spinner/disable), or null. */
  restoringVersion: number | null;
  onRestore: (versionNumber: number) => void;
}

function formatDate(iso: string): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

/**
 * Object version history: a timeline (vN · date · author · change type), each row expandable to the
 * canonical field diff (this version's snapshot vs the previous version's), and a "Restaurer cette
 * version" action that restores CANONICAL fields only (not media/prices/etc.) and creates a new version.
 */
export function VersionHistoryModal({
  open,
  onClose,
  objectId,
  versions,
  isLoading,
  canRestore,
  restoreDisabledReason,
  restoringVersion,
  onRestore,
}: VersionHistoryModalProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [diff, setDiff] = useState<ObjectVersionDiffField[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  async function toggleExpand(row: ObjectVersionRow) {
    if (expanded === row.versionNumber) {
      setExpanded(null);
      return;
    }
    setExpanded(row.versionNumber);
    setDiff([]);
    setDiffError(null);
    setDiffLoading(true);
    try {
      const idx = versions.findIndex((v) => v.versionNumber === row.versionNumber);
      const previous = idx >= 0 ? versions[idx + 1] : undefined; // versions are newest-first
      const [after, before] = await Promise.all([
        getObjectVersionSnapshot(objectId, row.versionNumber),
        previous ? getObjectVersionSnapshot(objectId, previous.versionNumber) : Promise.resolve(null),
      ]);
      setDiff(computeVersionDiff(before, after));
    } catch {
      setDiffError('Impossible de charger le détail de cette version.');
    } finally {
      setDiffLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor max-w-2xl">
        <DialogHeader>
          <DialogTitle>Versions / historique</DialogTitle>
        </DialogHeader>
        <div className="version-history__body">
          <p className="version-history__warn">
            La restauration applique les <strong>champs principaux uniquement</strong> de la fiche
            (identité, type, fuseau, visibilité commerciale…) — pas les médias, tarifs, ouvertures, etc.
            Elle <strong>crée une nouvelle version</strong> ; l'historique n'est jamais réécrit.
          </p>

          {isLoading && <p className="version-history__empty">Chargement de l'historique…</p>}
          {!isLoading && versions.length === 0 && (
            <p className="version-history__empty">Aucun historique pour cette fiche.</p>
          )}

          {versions.map((row) => {
            const isExpanded = expanded === row.versionNumber;
            const isRestoring = restoringVersion === row.versionNumber;
            return (
              <div key={row.versionNumber} className="version-row">
                <div className="version-row__head">
                  <span className="version-row__num">v{row.versionNumber}</span>
                  <span className="version-row__type">{formatChangeType(row.changeType)}</span>
                  <span className="version-row__when">{formatDate(row.createdAt)}</span>
                  <span className="version-row__who">{row.createdByName || 'Système'}</span>
                  <span className="version-row__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      aria-label={`Voir les changements de la version ${row.versionNumber}`}
                      onClick={() => void toggleExpand(row)}
                    >
                      {isExpanded ? 'Masquer' : 'Détail'}
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      aria-label={`Restaurer la version ${row.versionNumber}`}
                      disabled={!canRestore || isRestoring}
                      title={canRestore ? undefined : restoreDisabledReason}
                      onClick={() => onRestore(row.versionNumber)}
                    >
                      {isRestoring ? 'Restauration…' : 'Restaurer cette version'}
                    </button>
                  </span>
                </div>
                {isExpanded && (
                  <div className="version-row__diff">
                    {diffLoading && <p className="version-history__empty">Chargement du détail…</p>}
                    {diffError && <p className="version-history__empty">{diffError}</p>}
                    {!diffLoading && !diffError && diff.length === 0 && (
                      <p className="version-history__empty">Aucun changement de champ principal.</p>
                    )}
                    {!diffLoading && !diffError && diff.map((field) => (
                      <div key={field.key} className="version-diff__field">
                        <span className="version-diff__key">{field.key}</span>
                        <span className="version-diff__before">{field.before || '—'}</span>
                        <span className="version-diff__arrow">→</span>
                        <span className="version-diff__after">{field.after || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <button type="button" className="btn primary" onClick={onClose}>Fermer</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/widgets/VersionHistoryModal.test.tsx`
Expected: PASS (timeline render + diff fetch + restore warning/fire + disabled-reason + empty state).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.tsx bertel-tourism-ui/src/features/object-editor/widgets/VersionHistoryModal.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): VersionHistoryModal — timeline + canonical diff + restore-with-warning (C)"
```

---

### Task 5: Activer l'outil `'versions'` dans `buildEditorTools` (vrai numéro de version)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts`

**Interfaces:**
- Consumes: `BuildEditorToolsInput` (from tranche B) — extend with `currentVersion?: number | null`.
- Produces: when `currentVersion` is provided, the `versions` tool is `disabled: false` with `stat: 'v<currentVersion>'` and no `disabledReason`; when absent (loading/no data), it stays disabled « Bientôt disponible » (unchanged from B). The `versions` tool is never disabled by a permission — viewing history is always allowed for a readable fiche; restore is gated inside the modal.

- [ ] **Step 1: Write the failing test** (append to the existing `buildEditorTools` describe block in `editor-tools.test.ts`)

```ts
  it('enables the versions tool with a real version stat when currentVersion is provided', () => {
    const versions = buildEditorTools({ ...base, currentVersion: 7 }).find((t) => t.key === 'versions')!;
    expect(versions.disabled).toBe(false);
    expect(versions.stat).toBe('v7');
    expect(versions.disabledReason).toBeUndefined();
  });

  it('keeps versions disabled (no fake stat) while currentVersion is unknown', () => {
    const versions = buildEditorTools(base).find((t) => t.key === 'versions')!;
    expect(versions.disabled).toBe(true);
    expect(versions.stat).toBeUndefined();
    expect(versions.disabledReason).toMatch(/bient/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/shell/editor-tools.test.ts`
Expected: FAIL — `currentVersion` not on the input type; `versions` still hardcoded disabled with no stat.

- [ ] **Step 3: Write minimal implementation** (edit `editor-tools.ts` — add the field to the input interface and the conditional in `buildEditorTools`)

Add to `BuildEditorToolsInput` (after `archiveDisabledReason`):

```ts
  /** object.current_version (from the versions query). When set, the history tool is enabled. */
  currentVersion?: number | null;
```

Replace the `versions` entry in the returned array:

```ts
    {
      key: 'versions',
      label: 'Versions / historique',
      disabled: input.currentVersion == null,
      disabledReason: input.currentVersion == null ? SOON : undefined,
      stat: input.currentVersion == null ? undefined : `v${input.currentVersion}`,
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/shell/editor-tools.test.ts`
Expected: PASS (tranche B tests + the 2 new versions cases).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): enable the versions tool with the real current_version stat (C)"
```

---

### Task 6: Câbler l'outil `'versions'` dans `ObjectEditPage`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

**Interfaces:**
- Consumes: `useObjectVersionsQuery`, `useRestoreObjectVersionMutation` from `../../hooks/useExplorerQueries`; `VersionHistoryModal` from `./widgets/VersionHistoryModal`; existing `buildEditorTools` + `EditorToolKey` (from tranche B, after Task 5); `resource.permissions.publication.{canDirectWrite,disabledReason}`; existing `setStatusMessage`. Assumes tranche B already wired `editorTools`/`handleToolSelect`/`<EditorNav tools=... onToolSelect=... />`.
- Produces: a functional Versions/historique tool. No new exported symbols.

- [ ] **Step 1: Add imports** (extend the existing `useExplorerQueries` import on line 6 and add the modal import after the `BlockersModal` import on line 24)

```tsx
import { useObjectWorkspaceQuery, usePublishObjectWorkspaceMutation, useSetObjectStatusMutation, useObjectVersionsQuery, useRestoreObjectVersionMutation } from '../../hooks/useExplorerQueries';
```

> Note: `useSetObjectStatusMutation` was added to this import by tranche B; keep all four on the one line.

```tsx
import { VersionHistoryModal } from './widgets/VersionHistoryModal';
```

- [ ] **Step 2: Add the query, mutation, and modal state** (inside `EditorReady`, after the tranche-B archive state, near line 357 — `const [archiveConfirmOpen, ...]`)

```tsx
  const versionsQuery = useObjectVersionsQuery(objectId);
  const restoreVersion = useRestoreObjectVersionMutation(objectId);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);

  // Real current version = the highest version_number from the history (the parser does not expose
  // object.current_version). null while loading ⇒ the nav badge stays "Bientôt disponible" (no fake v12).
  const currentVersion =
    versionsQuery.data && versionsQuery.data.length > 0
      ? Math.max(...versionsQuery.data.map((v) => v.versionNumber))
      : null;

  async function handleRestoreVersion(versionNumber: number) {
    try {
      await restoreVersion.mutateAsync(versionNumber);
      setVersionsModalOpen(false);
      setStatusMessage(`Version v${versionNumber} restaurée — une nouvelle version a été créée.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Restauration impossible.');
    }
  }
```

- [ ] **Step 3: Feed `currentVersion` into `buildEditorTools` and handle the `'versions'` tool key** (update the tranche-B `editorTools` useMemo and `handleToolSelect`)

Update the `buildEditorTools({...})` input (add `currentVersion`) and its dep array:

```tsx
  const editorTools = useMemo(
    () =>
      buildEditorTools({
        status: lifecycleStatus,
        canArchive: resource.permissions.publication.canDirectWrite,
        archiveDisabledReason: resource.permissions.publication.disabledReason,
        currentVersion,
      }),
    [lifecycleStatus, resource.permissions.publication.canDirectWrite, resource.permissions.publication.disabledReason, currentVersion],
  );
```

Update `handleToolSelect` (add the `versions` branch):

```tsx
  function handleToolSelect(key: EditorToolKey) {
    if (key === 'archive') {
      setArchiveConfirmOpen(true);
    } else if (key === 'versions') {
      setVersionsModalOpen(true);
    }
    // 'import-export' is disabled in this tranche and never fires.
  }
```

- [ ] **Step 4: Render the modal** (just before the tranche-B `<ConfirmDialog .../>` inside the returned JSX, near line 410)

```tsx
      <VersionHistoryModal
        open={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        objectId={objectId}
        versions={versionsQuery.data ?? []}
        isLoading={versionsQuery.isLoading}
        canRestore={resource.permissions.publication.canDirectWrite}
        restoreDisabledReason={
          resource.permissions.publication.disabledReason ?? 'Vos droits ne permettent pas de restaurer une version.'
        }
        restoringVersion={restoreVersion.isPending ? (restoreVersion.variables ?? null) : null}
        onRestore={(versionNumber) => void handleRestoreVersion(versionNumber)}
      />
```

> Note: restore is gated on `permissions.publication.canDirectWrite` (the same canonical-write proxy the editor already uses for archive/publish; the backend re-checks `user_can_write_object_canonical`). `restoreVersion.variables` is the `versionNumber` argument of the in-flight `mutateAsync` — TanStack exposes it during `isPending`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Run the editor + service test suites (regression)**

Run: `npx jest src/features/object-editor src/services/object-versions.test.ts`
Expected: PASS — all object-editor specs + editor-tools / VersionHistoryModal / object-versions specs.

- [ ] **Step 7: Production build**

Run: `npm run build`
Expected: exit 0 (`.test.*` excluded from the build per tsconfig).

- [ ] **Step 8: Manual verification (preview)**

Start the dev server, open `/objects/<id>/edit` for a fiche the persona can write:
- OUTILS « Versions / historique » shows a real badge (e.g. `v3`, not `v12`) once the history loads; clicking it opens `VersionHistoryModal`.
- The modal lists one row per version (vN · type · date · auteur) newest-first; expanding a row shows the canonical field diff (before → after); the canonical-only warning is visible.
- « Restaurer cette version » on an older version → after success the save-bar shows « Version vN restaurée — une nouvelle version a été créée. » and the badge increments.
- With a read-only persona (`canDirectWrite=false`), the restore buttons are disabled with the reason in `title`; the modal still opens and the diff still renders (viewing is always allowed).
Capture a screenshot of the modal (timeline + an expanded diff) as proof.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): wire Versions/historique tool — modal + real current_version badge (C)"
```

---

## Self-Review

**1. Spec coverage (tranche C scope = spec §3.C):**
- `api.get_object_versions` (authorize-once, `created_by_name` via `app_user_profile`, `changed_fields` via `LAG(data)` minus cache/`updated_at`/`current_version`) → Task 1 RPC + test. ✔
- `api.get_object_version_snapshot` (same authorize-once) → Task 1 RPC + test. ✔
- `api.rpc_restore_object_version` (gate `user_can_write_object_canonical`; UPDATE writable canonical columns only; excludes id/current_version/created_*/updated_at/is_editing/cached_*/generated/`status`; append-only new version) → Task 1 RPC + test (status-unchanged, name-restored, new-version assertions). ✔
- `VersionHistoryModal` (timeline vN·date·author·type; expand → canonical diff; « Restaurer cette version » with canonical-only warning) → Task 4. ✔
- Real `current_version` badge replacing the fake `v12` (already removed in B) → Task 5 (`buildEditorTools` stat) + Task 6 (`currentVersion` derived from the versions query). ✔
- `useObjectVersionsQuery` + `useRestoreObjectVersionMutation` → Task 3. ✔
- Enable the `'versions'` tool in `buildEditorTools` → Task 5; handler in `ObjectEditPage` → Task 6. ✔
- SQL + Jest tests → Tasks 1 (SQL), 2/4/5 (Jest). ✔
- Deploy invariant (migration manifestée 14q + folded into `api_views_functions.sql` + SQL test) → Task 1 Steps 5–6. ✔

**2. Spec §6 open decisions resolved:**
- §6 #2 (status exclusion avoids the status guard): CONFIRMED by reading `migration_permission_write_paths.sql` — `trg_guard_object_status_change` is `BEFORE UPDATE OF status`, so omitting `status` from the restore `SET` clause means the trigger never fires. Stated in the migration header + Global Constraints.
- §6 #3 (`created_by` → name): resolved via `LEFT JOIN app_user_profile p ON p.id = ov.created_by`, `COALESCE(p.display_name,'')` (verified `app_user_profile.display_name` is the column).
- §6 #6 (next manifest id): **14q** (highest current id in `docs/SQL_ROLLOUT_RUNBOOK.md` is 14p).
- Current-version source (not in spec §6 but left open): the parser does NOT expose `object.current_version`, so the badge derives it from the versions query (`Math.max(version_number)`), per the prompt's guidance. Stated in Task 6 Step 2.

**3. Placeholder scan:** no TBD/TODO/"similar to"; every code step carries complete code (SQL bodies, service module, hooks, modal, tool input field, page wiring). ✔

**4. Type consistency:**
- `ObjectVersionRow` (Task 2) is consumed identically by the hook (`useObjectVersionsQuery`), the modal (`versions: ObjectVersionRow[]`), and `ObjectEditPage` (`versionsQuery.data`). ✔
- `computeVersionDiff(before, after)` signature `(Record<string,unknown>|null, Record<string,unknown>|null) → ObjectVersionDiffField[]` matches its callers in the modal (snapshot fetch returns `Record<string,unknown>|null`). ✔
- `getObjectVersions(objectId, limit?, offset?)` / `restoreObjectVersion(objectId, versionNumber)` signatures match the hook callers (Task 3). ✔
- `BuildEditorToolsInput.currentVersion?: number|null` (Task 5) matches the `currentVersion` passed by `ObjectEditPage` (Task 6, `number|null`). ✔
- RPC param names match between SQL (`p_object_id`/`p_limit`/`p_offset`/`p_version_number`) and the service callers. ✔

**5. Cross-tranche dependency / risk noted:**
- DEPENDS ON TRANCHE B: `EditorNav` props (`tools`/`onToolSelect`), `EditorToolKey`/`EditorToolItem`/`buildEditorTools`/`BuildEditorToolsInput` in `shell/editor-tools.ts`, and the `editorTools`/`handleToolSelect`/`<EditorNav tools onToolSelect>`/`<ConfirmDialog>` wiring in `ObjectEditPage` are all assumed present after B. Task 5 extends `BuildEditorToolsInput`; Task 6 extends the B `useMemo` dep array + `handleToolSelect` + adds the modal next to the B `ConfirmDialog`. If B is not yet merged, apply B first.
- RISK (low): if the parser later starts exposing `current_version`, prefer it over the `Math.max(version_number)` derivation to avoid a network round-trip; documented inline in Task 6.
- RISK (low): the diff ignore-list lives in TWO places (the SQL `ignore_keys` array in `get_object_versions` and `DIFF_IGNORE_KEYS` in `object-versions.ts`) — they must stay in lockstep (noted in both files). The Jest test in Task 2 asserts the cache keys are excluded; the SQL test asserts `changed_fields` excludes cache keys.

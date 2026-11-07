# Tranche A — §22 « Identifiants externes » CTA fonctionnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le CTA §22 « + Lier un nouvel identifiant externe » et les actions par ligne (✎ / supprimer) fonctionnels — réservés aux administrateurs ORG / superusers, avec sources canoniques (OTI/SU/`*canonical*`) verrouillées. Ajoute deux RPC d'écriture `SECURITY DEFINER` (`api.rpc_upsert_object_external_id`, `api.rpc_delete_object_external_id`) + un petit helper d'autorisation front (`api.current_user_is_org_admin`), une modale d'édition, des hooks de mutation, et les callers de service.

**Architecture :** Le backend ajoute deux RPC d'écriture gated admin (le client ne choisit jamais l'org — `organization_object_id` est dérivé de `api.current_user_org_id()`) + un helper booléen `api.current_user_is_org_admin()` qui réplique exactement le gate d'écriture (`is_platform_superuser() OR current_user_admin_role_code() IS NOT NULL`). Côté front, `getObjectWorkspacePermissions` probe ce helper et alimente `permissions.syncIdentifiers.canDirectWrite` ; `SectionSync` suit le patron de `SectionPublication` (mutations appelées directement depuis la section, gate sur la permission, modale `ExternalIdEditModal` + `ConfirmDialog`). Les RPC sont `DEFINER` ⇒ elles bypassent la RLS `admin_*` par-commande de `object_external_id` ; le gate applicatif EST la frontière.

**Tech Stack :** PostgreSQL (SECURITY DEFINER, `search_path = public, api, internal`, `gen_random_uuid()`), React 19 + TypeScript, Next.js App Router, TanStack Query, Jest + React Testing Library. Composants `EditorModal` / `ConfirmDialog` / `Field` / `Input` / `ReferenceSelect` maison.

## Global Constraints

- **Sources canoniques verrouillées** — `upper(source_system) IN ('OTI','SU')` OU `lower(source_system) LIKE '%canonical%'` ⇒ rejet côté RPC ET désactivation côté front (✎/supprimer absents sur ces lignes).
- **Le client ne choisit jamais l'org** — `organization_object_id := api.current_user_org_id()` est server-dérivé ; la modale n'expose aucun champ org.
- **Gate admin uniquement** — écriture autorisée si `api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL`, sinon le CTA/✎ restent désactivés avec une raison explicite ; côté RPC, `RAISE EXCEPTION` (403-like, fail-closed).
- **DEFINER discipline (invariant CLAUDE.md)** — `gen_random_uuid()` (jamais `uuid_generate_v4()`), `SET search_path = public, api, internal`, `REVOKE EXECUTE FROM PUBLIC, anon` puis `GRANT EXECUTE TO authenticated, service_role`.
- **Déploiement (invariant CLAUDE.md)** — la migration neuve est ajoutée au manifeste/runbook (`docs/SQL_ROLLOUT_RUNBOOK.md`, prochain id libre **14q**), repliée dans `api_views_functions.sql`, avec un test CI sous `Base de donnée DLL et API/tests/`. Une fresh DB doit reproduire le live.
- **Immutabilité** — les fonctions pures front retournent de nouveaux objets ; pas de mutation d'entrée.
- **TDD** — SQL : un test transactionnel (gate admin, refus canonique, dérivation org, upsert/delete) ; Front : fonctions pures et composant présentationnel testés avant câblage ; suite Jest + `tsc` + `next build` verts avant de clore.
- **Commits** — directement sur `master`, uniquement les hunks de cette tranche, pas de trailer co-author (le push est fait par le PO).
- **CWD des commandes front** — `C:/Users/dphil/Bertel3.0/bertel-tourism-ui` (toutes les commandes `npx jest` / `npx tsc` / `npm run build`).
- **Tranche A bâtit sur la tranche B** — le groupe OUTILS est déjà piloté par props (`tools: EditorToolItem[]` + `onToolSelect`, builder `buildEditorTools` dans `shell/editor-tools.ts`). Tranche A ne touche PAS au groupe OUTILS ; elle agit uniquement sur la section §22.

---

## File Structure

- **Create** `Base de donnée DLL et API/migration_object_external_id_writes.sql` — les 2 RPC d'écriture `object_external_id` (upsert/delete, gated admin) + le helper `api.current_user_is_org_admin()`. Repliée dans `api_views_functions.sql`.
- **Create** `Base de donnée DLL et API/tests/test_object_external_id_writes.sql` — test SQL transactionnel (gate admin, refus canonique, dérivation org, upsert/delete, helper).
- **Modify** `Base de donnée DLL et API/api_views_functions.sql` — fold des 3 fonctions de la migration (no-op sur une fresh DB).
- **Modify** `docs/SQL_ROLLOUT_RUNBOOK.md` — entrée manifeste **14q** en ordre de dépendance.
- **Create** `bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.ts` — type `ExternalIdSourceOption`, constantes `EXTERNAL_ID_SOURCE_OPTIONS`, fns pures `isCanonicalSourceSystem`, `createExternalIdDraft`, `isExternalIdSaveDisabled`.
- **Create** `bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.test.ts` — tests des fns pures.
- **Create** `bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.tsx` — modale add/edit (select source non-canonique + champ identifiant + date de synchro).
- **Create** `bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.test.tsx` — tests de la modale.
- **Modify** `bertel-tourism-ui/src/services/object-workspace.ts` — callers `upsertObjectExternalId` / `deleteObjectExternalId` + probe `current_user_is_org_admin` dans `getObjectWorkspacePermissions` alimentant `permissions.syncIdentifiers`.
- **Modify** `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` — hooks `useUpsertExternalIdMutation` / `useDeleteExternalIdMutation` (invalident `['object-workspace', id]`).
- **Modify** `bertel-tourism-ui/src/features/object-editor/sections/SectionSync.tsx` — CTA + ✎/supprimer actifs pour les admins (sinon désactivés avec raison), montage `ExternalIdEditModal` + `ConfirmDialog`.
- **Modify** `bertel-tourism-ui/src/features/object-editor/sections/SectionSync.test.tsx` — couvre admin vs non-admin, verrou canonique, appels mutation. (Créé s'il n'existe pas.)

---

### Task 1: Backend — RPC d'écriture `object_external_id` + helper admin

**Files:**
- Create: `Base de donnée DLL et API/migration_object_external_id_writes.sql`
- Create: `Base de donnée DLL et API/tests/test_object_external_id_writes.sql`
- Modify: `Base de donnée DLL et API/api_views_functions.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`

**Interfaces:**
- Consumes: `api.is_platform_superuser()` (bool), `api.current_user_admin_role_code()` (text, NULL si non-admin), `api.current_user_org_id()` (text), table `object_external_id` (`id`, `object_id`, `organization_object_id`, `source_system`, `external_id`, `last_synced_at`, `created_at`, `updated_at`), contrainte `uq_object_external_id_object_org_source (object_id, organization_object_id, source_system)`. (Tous lus/vérifiés dans `rls_policies.sql` et `schema_unified.sql`.)
- Produces:
  - `api.current_user_is_org_admin() RETURNS boolean` — `SELECT api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL`.
  - `api.rpc_upsert_object_external_id(p_object_id text, p_source_system text, p_external_id text, p_last_synced_at timestamptz DEFAULT NULL) RETURNS uuid`.
  - `api.rpc_delete_object_external_id(p_id uuid) RETURNS void`.

- [ ] **Step 1: Write the failing SQL test**

```sql
-- Base de donnée DLL et API/tests/test_object_external_id_writes.sql
-- Behavioral test for api.rpc_upsert_object_external_id / api.rpc_delete_object_external_id
-- + api.current_user_is_org_admin. Self-contained + transactional (ROLLBACK at end).
-- Run AFTER the full manifest INCLUDING migration_object_external_id_writes.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org        text := 'ORGRUN9999999931';
  v_obj        text := 'HOTRUN9999999931';
  v_admin_uid  uuid := '00000000-0000-4000-a000-0000000000c1';  -- ORG admin
  v_member_uid uuid := '00000000-0000-4000-a000-0000000000c2';  -- ORG member, NOT admin
  v_admin_role uuid;
  v_m_admin uuid; v_m_member uuid;
  v_id uuid;
  v_id2 uuid;
  v_ext text;
  v_org_col text;
  v_count int;
BEGIN
  -- ---------- Fixture (as postgres; RLS bypassed for setup) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ExtId Test Org', 'published'),
    (v_obj, 'HOT', 'ExtId Test Hotel', 'draft');

  INSERT INTO auth.users (id, email) VALUES
    (v_admin_uid,  'extid_admin@test.local'),
    (v_member_uid, 'extid_member@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_admin_uid, 'tourism_agent'), (v_member_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_admin_uid, v_org, TRUE) RETURNING id INTO v_m_admin;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_member_uid, v_org, TRUE) RETURNING id INTO v_m_member;

  -- Grant the admin an ORG admin role (any code makes current_user_admin_role_code() non-NULL).
  SELECT id INTO v_admin_role FROM ref_org_admin_role ORDER BY id LIMIT 1;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_m_admin, v_admin_role, TRUE);

  -- ---------- Helper reflects the admin gate ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role','authenticated')::text, true);
  ASSERT api.current_user_is_org_admin() = TRUE, 'admin should be org admin';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_uid, 'role','authenticated')::text, true);
  ASSERT api.current_user_is_org_admin() = FALSE, 'plain member is not org admin';

  -- ---------- Admin: upsert inserts, derives org, returns id ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role','authenticated')::text, true);
  v_id := api.rpc_upsert_object_external_id(v_obj, 'AT', 'recABC123', NULL);
  ASSERT v_id IS NOT NULL, 'upsert returns a row id';
  SELECT external_id, organization_object_id INTO v_ext, v_org_col
    FROM object_external_id WHERE id = v_id;
  ASSERT v_ext = 'recABC123', 'external_id stored';
  ASSERT v_org_col = v_org, 'organization_object_id derived from current_user_org_id (client cannot choose)';

  -- ---------- Admin: upsert again on same (object,org,source) UPDATES, same id ----------
  v_id2 := api.rpc_upsert_object_external_id(v_obj, 'AT', 'recXYZ999', '2026-06-17T08:00:00Z');
  ASSERT v_id2 = v_id, 'ON CONFLICT updates the existing row (uq_object_external_id_object_org_source)';
  SELECT external_id INTO v_ext FROM object_external_id WHERE id = v_id;
  ASSERT v_ext = 'recXYZ999', 'external_id updated on conflict';
  SELECT count(*) INTO v_count FROM object_external_id WHERE object_id = v_obj;
  ASSERT v_count = 1, 'no duplicate row created on conflict';

  -- ---------- Admin: canonical sources rejected ----------
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'OTI', 'oti-1', NULL);
    RAISE EXCEPTION 'CANONICAL GUARD FAILED: OTI accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('CANONICAL_SOURCE' IN SQLERRM) > 0, 'expected CANONICAL_SOURCE for OTI, got: ' || SQLERRM;
  END;
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'su', 'su-1', NULL);
    RAISE EXCEPTION 'CANONICAL GUARD FAILED: su accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('CANONICAL_SOURCE' IN SQLERRM) > 0, 'expected CANONICAL_SOURCE for su, got: ' || SQLERRM;
  END;
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'my_canonical_feed', 'c-1', NULL);
    RAISE EXCEPTION 'CANONICAL GUARD FAILED: *canonical* accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('CANONICAL_SOURCE' IN SQLERRM) > 0, 'expected CANONICAL_SOURCE for *canonical*, got: ' || SQLERRM;
  END;

  -- ---------- Non-admin member is blocked on upsert ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_uid, 'role','authenticated')::text, true);
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'DT', 'dt-1', NULL);
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: non-admin upserted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN, got: ' || SQLERRM;
  END;

  -- ---------- Non-admin is blocked on delete ----------
  BEGIN
    PERFORM api.rpc_delete_object_external_id(v_id);
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: non-admin deleted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN on delete, got: ' || SQLERRM;
  END;

  -- ---------- Admin deletes the row ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role','authenticated')::text, true);
  PERFORM api.rpc_delete_object_external_id(v_id);
  SELECT count(*) INTO v_count FROM object_external_id WHERE id = v_id;
  ASSERT v_count = 0, 'admin delete removes the row';

  RAISE NOTICE 'object_external_id write RPC assertions passed.';
END$$;

ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails**

Run (any psql against a DB built from the manifest, e.g. the CI fresh-apply DB):
`psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_object_external_id_writes.sql"`
Expected: FAIL — `function api.current_user_is_org_admin() does not exist` (and the upsert/delete RPCs do not exist yet).

> If a live local DB is not reachable, validate transactionally via the Supabase MCP recipe used elsewhere in this repo: apply the migration + test inside one transaction body and `ROLLBACK` (or RAISE on assertion failure). The migration is `CREATE OR REPLACE`-only ⇒ safe to re-apply.

- [ ] **Step 3: Write minimal implementation (the migration)**

```sql
-- Base de donnée DLL et API/migration_object_external_id_writes.sql  (manifest step 14q; decision log §A1)
-- Tranche A — §22 « Identifiants externes » CTA fonctionnel.
-- Adds the two admin-gated write RPCs for object_external_id (the table shipped admin_*
-- per-command RLS but NO write RPC) + a tiny front-facing admin-gate helper.
-- All three are SECURITY DEFINER (they bypass the table's admin_* RLS — the IN-FUNCTION
-- gate IS the boundary). UUID via gen_random_uuid(); SET search_path = public, api, internal.
-- Idempotent (CREATE OR REPLACE) + transaction-wrapped.
-- Apply order: AFTER step 1 (object_external_id table) and step 6 (rls_policies.sql:
-- api.is_platform_superuser / api.current_user_admin_role_code / api.current_user_org_id).
\set ON_ERROR_STOP on
BEGIN;

-- 1. Admin-gate helper — single source for the §22 front gate (mirrors the write gate exactly).
CREATE OR REPLACE FUNCTION api.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal
AS $$
  SELECT api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION api.current_user_is_org_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_is_org_admin() TO   authenticated, service_role;

-- 2. Upsert one external identifier on the CURRENT USER'S ORG (server-derived org; admin-only;
--    canonical sources rejected). ON CONFLICT respects uq_object_external_id_object_org_source.
CREATE OR REPLACE FUNCTION api.rpc_upsert_object_external_id(
  p_object_id text,
  p_source_system text,
  p_external_id text,
  p_last_synced_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $$
DECLARE
  v_org text;
  v_src text := btrim(coalesce(p_source_system, ''));
  v_ext text := btrim(coalesce(p_external_id, ''));
  v_id  uuid;
BEGIN
  -- Auth context required.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_upsert_object_external_id requires an authenticated user';
  END IF;

  -- Admin gate (platform superuser OR ORG admin). Fail-closed.
  IF NOT api.current_user_is_org_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: managing external identifiers requires a platform superuser or an ORG admin role';
  END IF;

  -- Required inputs.
  IF v_src = '' OR v_ext = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: source_system and external_id are required';
  END IF;

  -- Reject canonical sources (OTI / SU / anything *canonical*) — those are platform-owned.
  IF upper(v_src) IN ('OTI','SU') OR lower(v_src) LIKE '%canonical%' THEN
    RAISE EXCEPTION 'CANONICAL_SOURCE: % is a canonical source and cannot be edited here', v_src;
  END IF;

  -- The client never chooses the org — derive it from the active membership.
  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG: the current user has no active ORG membership';
  END IF;

  -- Object must exist (FK would catch it, but give a clean error).
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = p_object_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;

  INSERT INTO object_external_id (id, object_id, organization_object_id, source_system, external_id, last_synced_at)
  VALUES (gen_random_uuid(), p_object_id, v_org, v_src, v_ext, p_last_synced_at)
  ON CONFLICT (object_id, organization_object_id, source_system) DO UPDATE
    SET external_id    = EXCLUDED.external_id,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at     = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_upsert_object_external_id(text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_upsert_object_external_id(text, text, text, timestamptz) TO   authenticated, service_role;

-- 3. Delete one external identifier owned by the current user's ORG (admin-only, non-canonical).
CREATE OR REPLACE FUNCTION api.rpc_delete_object_external_id(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $$
DECLARE
  v_org text;
  v_src text;
  v_row_org text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_delete_object_external_id requires an authenticated user';
  END IF;

  IF NOT api.current_user_is_org_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: managing external identifiers requires a platform superuser or an ORG admin role';
  END IF;

  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG: the current user has no active ORG membership';
  END IF;

  SELECT source_system, organization_object_id INTO v_src, v_row_org
    FROM object_external_id WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: external identifier % does not exist', p_id;
  END IF;

  -- Row must belong to the caller's ORG (platform superuser may delete any non-canonical row).
  IF v_row_org IS DISTINCT FROM v_org AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: external identifier % does not belong to your organisation', p_id;
  END IF;

  -- Never delete a canonical-source row through this path.
  IF upper(v_src) IN ('OTI','SU') OR lower(v_src) LIKE '%canonical%' THEN
    RAISE EXCEPTION 'CANONICAL_SOURCE: % is a canonical source and cannot be deleted here', v_src;
  END IF;

  DELETE FROM object_external_id WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_delete_object_external_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_delete_object_external_id(uuid) TO   authenticated, service_role;

COMMIT;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/migration_object_external_id_writes.sql"` then `… -f "Base de donnée DLL et API/tests/test_object_external_id_writes.sql"`
Expected: PASS — `NOTICE: object_external_id write RPC assertions passed.` and the script ends on `ROLLBACK` with no error.

- [ ] **Step 5: Fold into `api_views_functions.sql`** (append the SAME three function bodies at the end of the file, after the last `GRANT … get_dashboard_filter_options …` line, so a fresh DB reproduces the live schema — idempotent `CREATE OR REPLACE`)

Append verbatim (no `BEGIN`/`COMMIT` — this file is a plain DDL script applied as step 5 of the manifest):

```sql

-- =====================================================
-- §22 external identifiers — admin-gated write RPCs (tranche A; manifest 14q)
-- Folded from migration_object_external_id_writes.sql so a fresh DB reproduces live.
-- DEFINER + search_path = public, api, internal; gen_random_uuid(); canonical sources locked.
-- =====================================================
CREATE OR REPLACE FUNCTION api.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal
AS $$
  SELECT api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION api.current_user_is_org_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_is_org_admin() TO   authenticated, service_role;

CREATE OR REPLACE FUNCTION api.rpc_upsert_object_external_id(
  p_object_id text,
  p_source_system text,
  p_external_id text,
  p_last_synced_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $$
DECLARE
  v_org text;
  v_src text := btrim(coalesce(p_source_system, ''));
  v_ext text := btrim(coalesce(p_external_id, ''));
  v_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_upsert_object_external_id requires an authenticated user';
  END IF;
  IF NOT api.current_user_is_org_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: managing external identifiers requires a platform superuser or an ORG admin role';
  END IF;
  IF v_src = '' OR v_ext = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: source_system and external_id are required';
  END IF;
  IF upper(v_src) IN ('OTI','SU') OR lower(v_src) LIKE '%canonical%' THEN
    RAISE EXCEPTION 'CANONICAL_SOURCE: % is a canonical source and cannot be edited here', v_src;
  END IF;
  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG: the current user has no active ORG membership';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = p_object_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;
  INSERT INTO object_external_id (id, object_id, organization_object_id, source_system, external_id, last_synced_at)
  VALUES (gen_random_uuid(), p_object_id, v_org, v_src, v_ext, p_last_synced_at)
  ON CONFLICT (object_id, organization_object_id, source_system) DO UPDATE
    SET external_id    = EXCLUDED.external_id,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at     = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_upsert_object_external_id(text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_upsert_object_external_id(text, text, text, timestamptz) TO   authenticated, service_role;

CREATE OR REPLACE FUNCTION api.rpc_delete_object_external_id(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $$
DECLARE
  v_org text;
  v_src text;
  v_row_org text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_delete_object_external_id requires an authenticated user';
  END IF;
  IF NOT api.current_user_is_org_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: managing external identifiers requires a platform superuser or an ORG admin role';
  END IF;
  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG: the current user has no active ORG membership';
  END IF;
  SELECT source_system, organization_object_id INTO v_src, v_row_org
    FROM object_external_id WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: external identifier % does not exist', p_id;
  END IF;
  IF v_row_org IS DISTINCT FROM v_org AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: external identifier % does not belong to your organisation', p_id;
  END IF;
  IF upper(v_src) IN ('OTI','SU') OR lower(v_src) LIKE '%canonical%' THEN
    RAISE EXCEPTION 'CANONICAL_SOURCE: % is a canonical source and cannot be deleted here', v_src;
  END IF;
  DELETE FROM object_external_id WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_delete_object_external_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_delete_object_external_id(uuid) TO   authenticated, service_role;
```

- [ ] **Step 6: Add the manifest entry to `docs/SQL_ROLLOUT_RUNBOOK.md`** (insert immediately AFTER the `14p.` paragraph, i.e. just before the blank line preceding `14n.` / the `14.` REFRESH step)

```markdown
14q. `migration_object_external_id_writes.sql` — **§22 « Identifiants externes » CTA fonctionnel (tranche A — folded into `api_views_functions.sql` ⇒ no-op on a fresh DB)**: adds the two admin-gated write RPCs the table never had (`object_external_id` shipped `admin_*` per-command RLS + 0 write RPC). (1) `api.rpc_upsert_object_external_id(p_object_id, p_source_system, p_external_id, p_last_synced_at)` — `SECURITY DEFINER` (bypasses the table's `admin_*` RLS ⇒ the in-function gate IS the boundary), gate = `api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL` else `RAISE FORBIDDEN`; `organization_object_id := api.current_user_org_id()` (the client NEVER chooses the org); rejects canonical sources (`upper(source_system) IN ('OTI','SU')` OR `lower(source_system) LIKE '%canonical%'` ⇒ `CANONICAL_SOURCE`); `INSERT … ON CONFLICT (object_id, organization_object_id, source_system) DO UPDATE` (respects `uq_object_external_id_object_org_source`); `gen_random_uuid()`; `SET search_path = public, api, internal`. (2) `api.rpc_delete_object_external_id(p_id)` — same admin gate; the row must belong to `current_user_org_id()` (platform superuser may delete any non-canonical row) and must not be canonical. (3) `api.current_user_is_org_admin()` — tiny boolean helper mirroring the gate, consumed by the front to drive `permissions.syncIdentifiers.canDirectWrite`. All three `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated, service_role`. The `0028/0029_*_security_definer_function_executable` advisor on the RPCs is **expected** (§36 class — public-executable DEFINER that self-authorizes). After step 1 (`schema_unified.sql` — `object_external_id` + `uq_object_external_id_object_org_source`) and step 6 (`rls_policies.sql` — `api.is_platform_superuser` / `api.current_user_admin_role_code` / `api.current_user_org_id`). Idempotent (`CREATE OR REPLACE`). Covered by `tests/test_object_external_id_writes.sql`. Decision log §A1.
```

- [ ] **Step 7: Verify the fresh-apply ordering is consistent**

Read `Base de donnée DLL et API/ci_fresh_apply.sql` and confirm whether it `\i`-includes individual `migration_*` files or relies solely on the folded `api_views_functions.sql`. Since the three functions are folded into `api_views_functions.sql` (step 5), a fresh apply already creates them — the standalone `migration_object_external_id_writes.sql` is the live-incremental path only (like 14h/14m). No change to `ci_fresh_apply.sql` is required; the manifest entry documents the incremental order.

Run: `grep -n "object_external_id_writes\|api_views_functions" "Base de donnée DLL et API/ci_fresh_apply.sql"`
Expected: `api_views_functions.sql` is present in the driver (step 5); `object_external_id_writes` is absent (folded) — confirming no driver edit is needed.

- [ ] **Step 8: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add "Base de donnée DLL et API/migration_object_external_id_writes.sql" "Base de donnée DLL et API/tests/test_object_external_id_writes.sql" "Base de donnée DLL et API/api_views_functions.sql" "docs/SQL_ROLLOUT_RUNBOOK.md"
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(db): §22 admin-gated object_external_id write RPCs + org-admin helper (tranche A)"
```

---

### Task 2: Fonctions pures `external-id-edit.ts` (source options + canonical guard + draft)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.test.ts`

**Interfaces:**
- Consumes: `ObjectWorkspaceExternalIdentifierItem` from `../../../services/object-workspace-parser` (fields: `id`, `organizationObjectId`, `sourceSystem`, `externalId`, `lastSyncedAt`, `createdAt`, `updatedAt`).
- Produces:
  - `interface ExternalIdSourceOption { v: string; l: string }`
  - `const EXTERNAL_ID_SOURCE_OPTIONS: ExternalIdSourceOption[]` — the non-canonical sources (AT / AP / DT) — `SelectOption`-shaped.
  - `function isCanonicalSourceSystem(sourceSystem: string): boolean`
  - `function createExternalIdDraft(): ObjectWorkspaceExternalIdentifierItem`
  - `function isExternalIdSaveDisabled(draft: ObjectWorkspaceExternalIdentifierItem): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.test.ts
import {
  EXTERNAL_ID_SOURCE_OPTIONS,
  isCanonicalSourceSystem,
  createExternalIdDraft,
  isExternalIdSaveDisabled,
} from './external-id-edit';

describe('external-id-edit', () => {
  it('offers only non-canonical sources (AT / AP / DT), never OTI or SU', () => {
    const codes = EXTERNAL_ID_SOURCE_OPTIONS.map((o) => o.v);
    expect(codes).toEqual(['AT', 'AP', 'DT']);
    expect(codes).not.toContain('OTI');
    expect(codes).not.toContain('SU');
  });

  it('flags canonical sources case-insensitively and via the *canonical* substring', () => {
    expect(isCanonicalSourceSystem('OTI')).toBe(true);
    expect(isCanonicalSourceSystem('oti')).toBe(true);
    expect(isCanonicalSourceSystem('SU')).toBe(true);
    expect(isCanonicalSourceSystem('su')).toBe(true);
    expect(isCanonicalSourceSystem('my_canonical_feed')).toBe(true);
    expect(isCanonicalSourceSystem('CanonicalThing')).toBe(true);
    expect(isCanonicalSourceSystem('AT')).toBe(false);
    expect(isCanonicalSourceSystem('Apidae')).toBe(false);
    expect(isCanonicalSourceSystem('')).toBe(false);
  });

  it('creates an empty draft with no id and the first source preselected', () => {
    const draft = createExternalIdDraft();
    expect(draft.id).toBe('');
    expect(draft.sourceSystem).toBe('AT');
    expect(draft.externalId).toBe('');
    expect(draft.lastSyncedAt).toBe('');
    expect(draft.organizationObjectId).toBe('');
  });

  it('disables save until both source and identifier are present', () => {
    expect(isExternalIdSaveDisabled(createExternalIdDraft())).toBe(true);
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), externalId: 'recABC' })).toBe(false);
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), externalId: '   ' })).toBe(true);
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), sourceSystem: '', externalId: 'x' })).toBe(true);
  });

  it('disables save for a canonical source even with an identifier (defence in depth)', () => {
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), sourceSystem: 'OTI', externalId: 'x' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/sections/external-id-edit.test.ts`
Expected: FAIL — `Cannot find module './external-id-edit'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.ts
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

export interface ExternalIdSourceOption {
  v: string;
  l: string;
}

/**
 * Non-canonical external-id sources the editor may author. OTI (canonical ID) and SU
 * (Supabase row id) are platform-owned and intentionally absent — the RPC also rejects them
 * (api.rpc_upsert_object_external_id raises CANONICAL_SOURCE). Codes mirror SectionSync's
 * SOURCE_LABELS map (AT=Airtable, AP=Apidae, DT=DataTourisme).
 */
export const EXTERNAL_ID_SOURCE_OPTIONS: ExternalIdSourceOption[] = [
  { v: 'AT', l: 'Airtable (recId)' },
  { v: 'AP', l: 'Apidae (object_id)' },
  { v: 'DT', l: 'DataTourisme (URI)' },
];

/** Mirror of the RPC's canonical guard: OTI / SU (case-insensitive) or any *canonical* substring. */
export function isCanonicalSourceSystem(sourceSystem: string): boolean {
  const normalized = sourceSystem.trim();
  if (!normalized) {
    return false;
  }
  const upper = normalized.toUpperCase();
  return upper === 'OTI' || upper === 'SU' || normalized.toLowerCase().includes('canonical');
}

/** Empty add-draft — no id (insert), first non-canonical source preselected, empty org (server-derived). */
export function createExternalIdDraft(): ObjectWorkspaceExternalIdentifierItem {
  return {
    id: '',
    organizationObjectId: '',
    sourceSystem: EXTERNAL_ID_SOURCE_OPTIONS[0].v,
    externalId: '',
    lastSyncedAt: '',
    createdAt: '',
    updatedAt: '',
  };
}

/** Save is disabled until a non-canonical source AND a non-empty identifier are present. */
export function isExternalIdSaveDisabled(draft: ObjectWorkspaceExternalIdentifierItem): boolean {
  const source = draft.sourceSystem.trim();
  const identifier = draft.externalId.trim();
  return source === '' || identifier === '' || isCanonicalSourceSystem(source);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/sections/external-id-edit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.ts bertel-tourism-ui/src/features/object-editor/sections/external-id-edit.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): pure helpers for §22 external-id authoring (tranche A)"
```

---

### Task 3: `ExternalIdEditModal` (add/edit one external identifier)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.test.tsx`

**Interfaces:**
- Consumes: `EditorModal`, `Field`, `Input`, `Select` from `../primitives`; `EXTERNAL_ID_SOURCE_OPTIONS`, `isExternalIdSaveDisabled` from `../sections/external-id-edit`; `ObjectWorkspaceExternalIdentifierItem` from `../../../services/object-workspace-parser`.
- Produces: `ExternalIdEditModal` component with props `{ open: boolean; mode: 'add' | 'edit'; item: ObjectWorkspaceExternalIdentifierItem; onClose: () => void; onSave: (item: ObjectWorkspaceExternalIdentifierItem) => void }`. On save returns the draft with trimmed `sourceSystem` / `externalId`.

- [ ] **Step 1: Write the failing test**

```tsx
// bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.test.tsx
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ExternalIdEditModal } from './ExternalIdEditModal';
import { createExternalIdDraft } from '../sections/external-id-edit';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

function renderModal(over: Partial<Parameters<typeof ExternalIdEditModal>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <ExternalIdEditModal
      open
      mode="add"
      item={createExternalIdDraft()}
      onClose={onClose}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave, onClose };
}

describe('ExternalIdEditModal', () => {
  it('offers only the non-canonical sources in the selector', () => {
    renderModal();
    const select = screen.getByRole('combobox', { name: 'Système source' });
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['Airtable (recId)', 'Apidae (object_id)', 'DataTourisme (URI)']);
  });

  it('keeps save disabled until an identifier is entered', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Identifiant externe'), { target: { value: 'recABC123' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('returns the trimmed source and identifier on save', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('Système source'), { target: { value: 'AP' } });
    fireEvent.change(screen.getByLabelText('Identifiant externe'), { target: { value: '  12345  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceExternalIdentifierItem;
    expect(saved.sourceSystem).toBe('AP');
    expect(saved.externalId).toBe('12345');
  });

  it('uses an edit title and preserves the row id in edit mode', () => {
    const { onSave } = renderModal({
      mode: 'edit',
      item: { ...createExternalIdDraft(), id: 'row-1', sourceSystem: 'DT', externalId: 'uri:1' },
    });
    expect(screen.getByText('Modifier l’identifiant externe')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceExternalIdentifierItem;
    expect(saved.id).toBe('row-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/widgets/ExternalIdEditModal.test.tsx`
Expected: FAIL — `Cannot find module './ExternalIdEditModal'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.tsx
import { useState } from 'react';
import { EditorModal, Field, Input, Select } from '../primitives';
import { EXTERNAL_ID_SOURCE_OPTIONS, isExternalIdSaveDisabled } from '../sections/external-id-edit';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

interface ExternalIdEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  item: ObjectWorkspaceExternalIdentifierItem;
  onClose: () => void;
  onSave: (item: ObjectWorkspaceExternalIdentifierItem) => void;
}

/**
 * Focused add/edit modal for one §22 external identifier (Airtable / Apidae / DataTourisme).
 * Canonical sources (OTI / SU / *canonical*) are absent from the selector AND rejected by the
 * RPC. Edits a draft copy; onSave returns the patched item (source + identifier trimmed) — the
 * section issues the upsert mutation. `organization_object_id` is NEVER chosen here (server-derived).
 */
export function ExternalIdEditModal({ open, mode, item, onClose, onSave }: ExternalIdEditModalProps) {
  const [draft, setDraft] = useState(item);
  const set = (patch: Partial<ObjectWorkspaceExternalIdentifierItem>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier l’identifiant externe' : 'Lier un nouvel identifiant externe'}
      onClose={onClose}
      onSave={() => onSave({ ...draft, sourceSystem: draft.sourceSystem.trim(), externalId: draft.externalId.trim() })}
      saveDisabled={isExternalIdSaveDisabled(draft)}
    >
      <Field label="Système source" required>
        <Select
          value={draft.sourceSystem}
          options={EXTERNAL_ID_SOURCE_OPTIONS}
          aria-label="Système source"
          onChange={(sourceSystem) => set({ sourceSystem })}
        />
      </Field>

      <Field label="Identifiant externe" required>
        <Input
          value={draft.externalId}
          aria-label="Identifiant externe"
          mono
          placeholder="recABC123 · 4567890 · https://data…"
          onChange={(externalId) => set({ externalId })}
        />
      </Field>

      <Field label="Dernière synchro" hint="Optionnel — date du dernier import depuis ce système.">
        <Input
          type="date"
          value={draft.lastSyncedAt ? draft.lastSyncedAt.slice(0, 10) : ''}
          aria-label="Dernière synchro"
          onChange={(lastSyncedAt) => set({ lastSyncedAt })}
        />
      </Field>
    </EditorModal>
  );
}
```

> Note: the title in the test (`'Modifier l’identifiant externe'`) uses the typographic apostrophe `’` — match it exactly in the impl (it already does). The "add" title differs from the edit title intentionally and is not asserted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/widgets/ExternalIdEditModal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.tsx bertel-tourism-ui/src/features/object-editor/widgets/ExternalIdEditModal.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): ExternalIdEditModal for §22 add/edit (tranche A)"
```

---

### Task 4: Service callers + admin permission probe (`object-workspace.ts`)

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts`

**Interfaces:**
- Consumes: existing `getApiClient()`, `mapMutationError(error, fallback)`, `readString(value)`, `useSessionStore`, the existing per-object permission-probe block inside `getObjectWorkspacePermissions` (lines ~3517-3552), and the existing `syncIdentifiers` permission entry (lines ~3577-3582).
- Produces:
  - `export async function upsertObjectExternalId(input: { objectId: string; sourceSystem: string; externalId: string; lastSyncedAt: string | null }): Promise<string>` — returns the row id.
  - `export async function deleteObjectExternalId(id: string): Promise<void>`.
  - `permissions.syncIdentifiers.canDirectWrite` now reflects `api.current_user_is_org_admin()` (true for demo/superuser; probed otherwise).

- [ ] **Step 1: Add the two service callers** (append after `setObjectStatus`, near the end of the file, after the `friendlyStatusError` / `setObjectStatus` block around line 3940)

```ts
/**
 * §22 — admin-gated upsert of one external identifier. The org is server-derived
 * (api.current_user_org_id), canonical sources are rejected by the RPC, and the table's
 * admin_* RLS is bypassed (the RPC is SECURITY DEFINER ⇒ the in-function gate is the boundary).
 * Returns the row id.
 */
export async function upsertObjectExternalId(input: {
  objectId: string;
  sourceSystem: string;
  externalId: string;
  lastSyncedAt: string | null;
}): Promise<string> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return 'demo-external-id';
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour enregistrer l'identifiant externe.");
  }
  const { data, error } = await apiClient.schema('api').rpc('rpc_upsert_object_external_id', {
    p_object_id: input.objectId,
    p_source_system: input.sourceSystem,
    p_external_id: input.externalId,
    p_last_synced_at: input.lastSyncedAt,
  });
  if (error) {
    throw mapMutationError(error, "Enregistrement de l'identifiant externe impossible.");
  }
  return readString(data);
}

/** §22 — admin-gated delete of one external identifier (must belong to the caller's ORG, non-canonical). */
export async function deleteObjectExternalId(id: string): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour supprimer l'identifiant externe.");
  }
  const { error } = await apiClient.schema('api').rpc('rpc_delete_object_external_id', { p_id: id });
  if (error) {
    throw mapMutationError(error, "Suppression de l'identifiant externe impossible.");
  }
}
```

- [ ] **Step 2: Add the admin probe to the permission block** (inside `getObjectWorkspacePermissions`, extend the `Promise.allSettled` array on line ~3519 with one more probe and add a `let isOrgAdmin = directWrite;` next to the other `let` flags on line ~3516)

Add next to the other capability flags (after `let objectOwner = false;` on line 3516):

```ts
  let isOrgAdmin = directWrite;
```

Extend the destructured `Promise.allSettled` (the array currently ends with `…user_can_write_crm', { p_object_id: objectId }),`) — add the admin probe as a 7th element and capture its result:

```ts
      const [canonicalResult, enrichmentResult, publishResult, providerFollowUpResult, ownerResult, crmResult, orgAdminResult] = await Promise.allSettled([
        apiClient.schema('api').rpc('user_can_write_canonical', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_write_enrichment', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_publish_object', { p_object_id: objectId }),
        apiClient.schema('api').rpc('can_write_object_private_notes', { p_object_id: objectId }),
        apiClient.schema('api').rpc('is_object_owner', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_write_crm', { p_object_id: objectId }),
        // §22 external identifiers: admin-only write gate (mirrors the RPC gate exactly).
        apiClient.schema('api').rpc('current_user_is_org_admin'),
      ]);
```

After the `crmWrite = …` assignment (line ~3541), add:

```ts
      isOrgAdmin =
        directWrite
        || (orgAdminResult.status === 'fulfilled' && orgAdminResult.value.error == null && orgAdminResult.value.data === true);
```

And in the `catch` block (line ~3545-3551) add `isOrgAdmin = directWrite;` alongside the other resets:

```ts
    } catch {
      canPrepareProposal = directWrite;
      canWriteSafeWorkspaceRpc = directWrite;
      canPublishObject = directWrite;
      canWriteProviderFollowUp = directWrite;
      crmWrite = false;
      isOrgAdmin = directWrite;
    }
```

- [ ] **Step 3: Wire the flag into the `syncIdentifiers` permission** (replace the existing `syncIdentifiers` block on lines ~3577-3582)

```ts
    syncIdentifiers: {
      canDirectWrite: isOrgAdmin,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: isOrgAdmin
        ? null
        : "Réservé aux administrateurs d'organisation — l'administration des identifiants externes nécessite un rôle admin.",
    },
```

- [ ] **Step 4: Type-check**

Run (CWD `C:/Users/dphil/Bertel3.0/bertel-tourism-ui`): `npx tsc --noEmit`
Expected: exit 0 (no type errors).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/services/object-workspace.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): §22 external-id service callers + org-admin permission probe (tranche A)"
```

---

### Task 5: Mutation hooks (`useExplorerQueries.ts`)

**Files:**
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts`

**Interfaces:**
- Consumes: `upsertObjectExternalId`, `deleteObjectExternalId` from `../services/object-workspace`; `useMutation`, `useQueryClient` (already imported on line 1).
- Produces:
  - `export function useUpsertExternalIdMutation(objectId: string | null)` — `mutateAsync(input: { sourceSystem: string; externalId: string; lastSyncedAt: string | null })` → `Promise<string>`; invalidates `['object-workspace', objectId]` + `['object-detail', objectId]` on success.
  - `export function useDeleteExternalIdMutation(objectId: string | null)` — `mutateAsync(id: string)` → `Promise<void>`; same invalidations.

- [ ] **Step 1: Extend the import from `../services/object-workspace`** (add the two callers to the existing import block on lines 16-43)

```ts
  saveObjectWorkspaceTags,
  saveObjectWorkspaceTaxonomy,
  upsertObjectExternalId,
  deleteObjectExternalId,
} from '../services/object-workspace';
```

(Insert the two new lines just before the closing `} from '../services/object-workspace';` — i.e. after `saveObjectWorkspaceTaxonomy,`.)

- [ ] **Step 2: Add the two hooks** (append after `useSetObjectStatusMutation`, before `useAddObjectPrivateNoteMutation`, around line 392)

```ts
export function useUpsertExternalIdMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { sourceSystem: string; externalId: string; lastSyncedAt: string | null }) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour enregistrer l'identifiant externe.");
      }

      return upsertObjectExternalId({ objectId, ...input });
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
      ]);
    },
  });
}

export function useDeleteExternalIdMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour supprimer l'identifiant externe.");
      }

      return deleteObjectExternalId(id);
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
      ]);
    },
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/hooks/useExplorerQueries.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): §22 upsert/delete external-id mutation hooks (tranche A)"
```

---

### Task 6: Câbler `SectionSync` (CTA + ✎/supprimer admin-gated, modale + confirm)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionSync.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionSync.test.tsx` (create — none exists today)

**Interfaces:**
- Consumes: `SectionProps` (`editor`, `permissions`, `objectId`, `folded`); `editor.draft.syncIdentifiers` (`ObjectWorkspaceSyncIdentifiersModule`); `permissions.syncIdentifiers.{canDirectWrite, disabledReason}`; `useUpsertExternalIdMutation`, `useDeleteExternalIdMutation` from `../../../hooks/useExplorerQueries`; `ExternalIdEditModal` from `../widgets/ExternalIdEditModal`; `ConfirmDialog` from `../primitives`; `createExternalIdDraft`, `isCanonicalSourceSystem` from `./external-id-edit`; `ObjectWorkspaceExternalIdentifierItem` from `../../../services/object-workspace-parser`.
- Produces: a functional §22 — admin sees an active CTA + per-row ✎/supprimer (canonical rows stay locked); non-admin sees the disabled CTA with the permission reason. No new exported symbols. The section mutates `editor.draft.syncIdentifiers` optimistically after a successful mutation (and the query invalidation reloads the authoritative snapshot).

- [ ] **Step 1: Write the failing test**

```tsx
// bertel-tourism-ui/src/features/object-editor/sections/SectionSync.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SectionSync } from './SectionSync';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceModuleAccess,
  ObjectWorkspacePermissions,
} from '../../../services/object-workspace';
import type { ObjectWorkspaceSyncIdentifiersModule } from '../../../services/object-workspace-parser';

const mockUpsert = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../../hooks/useExplorerQueries', () => ({
  useUpsertExternalIdMutation: () => ({ mutateAsync: mockUpsert, isPending: false }),
  useDeleteExternalIdMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

function makeAccess(over: Partial<ObjectWorkspaceModuleAccess> = {}): ObjectWorkspaceModuleAccess {
  return { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null, ...over };
}

function makeSync(rows: ObjectWorkspaceSyncIdentifiersModule['externalIdentifiers']): ObjectWorkspaceSyncIdentifiersModule {
  return {
    objectCreatedAt: '',
    objectUpdatedAt: '',
    objectUpdatedAtSource: '',
    externalIdentifiers: rows,
    origins: [],
    externalIdentifiersVisibilityNote: null,
    originsVisibilityNote: null,
  };
}

function row(over: Partial<ObjectWorkspaceSyncIdentifiersModule['externalIdentifiers'][number]>) {
  return {
    id: 'r1',
    organizationObjectId: 'ORG1',
    sourceSystem: 'AT',
    externalId: 'recABC',
    lastSyncedAt: '',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function renderSection(opts: { admin: boolean; rows: ObjectWorkspaceSyncIdentifiersModule['externalIdentifiers'] }) {
  const sync = makeSync(opts.rows);
  const replaceModule = jest.fn();
  const editor = {
    draft: { syncIdentifiers: sync },
    replaceModule,
  } as unknown as SectionProps['editor'];
  const permissions = {
    syncIdentifiers: makeAccess({
      canDirectWrite: opts.admin,
      disabledReason: opts.admin ? null : "Réservé aux administrateurs d'organisation.",
    }),
  } as unknown as ObjectWorkspacePermissions;

  render(
    <QueryClientProvider client={new QueryClient()}>
      <SectionSync editor={editor} permissions={permissions} objectId="HOT1" />
    </QueryClientProvider>,
  );
  return { replaceModule };
}

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue('r-new');
  mockDelete.mockReset().mockResolvedValue(undefined);
});

describe('SectionSync §22', () => {
  it('keeps the CTA disabled with the permission reason for a non-admin', () => {
    renderSection({ admin: false, rows: [] });
    const cta = screen.getByRole('button', { name: /Lier un nouvel identifiant externe/i });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('title', "Réservé aux administrateurs d'organisation.");
  });

  it('enables the CTA for an admin and opens the add modal', () => {
    renderSection({ admin: true, rows: [] });
    const cta = screen.getByRole('button', { name: /Lier un nouvel identifiant externe/i });
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(screen.getByText('Lier un nouvel identifiant externe', { selector: 'h2, [role="heading"]' })).toBeInTheDocument();
  });

  it('disables the per-row edit action on a canonical row even for an admin', () => {
    renderSection({ admin: true, rows: [row({ id: 'oti', sourceSystem: 'OTI', externalId: 'oti-1' })] });
    expect(screen.getByRole('button', { name: 'Modifier cet identifiant' })).toBeDisabled();
  });

  it('calls the upsert mutation when an admin saves a new identifier', async () => {
    renderSection({ admin: true, rows: [] });
    fireEvent.click(screen.getByRole('button', { name: /Lier un nouvel identifiant externe/i }));
    fireEvent.change(screen.getByLabelText('Identifiant externe'), { target: { value: 'recNEW1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Identifiant externe enregistr/i)).toBeInTheDocument();
    expect(mockUpsert).toHaveBeenCalledWith({ sourceSystem: 'AT', externalId: 'recNEW1', lastSyncedAt: null });
  });

  it('calls the delete mutation after confirming on a non-canonical row', async () => {
    renderSection({ admin: true, rows: [row({ id: 'r9', sourceSystem: 'AP', externalId: '12345' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer cet identifiant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText(/Identifiant externe supprim/i)).toBeInTheDocument();
    expect(mockDelete).toHaveBeenCalledWith('r9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/sections/SectionSync.test.tsx`
Expected: FAIL — the current `SectionSync` has a hardcoded `disabled` CTA, no admin gate, no modal, no mutation calls, and no `aria-label`ed per-row buttons.

- [ ] **Step 3: Write minimal implementation** (replace the whole file)

```tsx
// bertel-tourism-ui/src/features/object-editor/sections/SectionSync.tsx
import { useState } from 'react';
import { ConfirmDialog, Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';
import { ExternalIdEditModal } from '../widgets/ExternalIdEditModal';
import { createExternalIdDraft, isCanonicalSourceSystem } from './external-id-edit';
import { useUpsertExternalIdMutation, useDeleteExternalIdMutation } from '../../../hooks/useExplorerQueries';

const SOURCE_LABELS: Record<string, string> = {
  OTI: 'ID OTI (canonical)',
  AT: 'Airtable recId',
  DT: 'DataTourisme URI',
  AP: 'Apidae object_id',
  SU: 'Supabase row_id',
};

function sourceCode(sourceSystem: string) {
  const normalized = sourceSystem.trim();
  if (normalized.length <= 3 && normalized === normalized.toUpperCase()) {
    return normalized;
  }
  return normalized.slice(0, 2).toUpperCase();
}

function rowLabel(row: ObjectWorkspaceExternalIdentifierItem) {
  const code = sourceCode(row.sourceSystem);
  return SOURCE_LABELS[code] ?? row.sourceSystem;
}

function formatWhen(row: ObjectWorkspaceExternalIdentifierItem) {
  if (row.lastSyncedAt) {
    return row.lastSyncedAt.includes('Sync') ? row.lastSyncedAt : `Sync OK · ${row.lastSyncedAt}`;
  }
  return row.updatedAt || row.createdAt || '—';
}

type ModalState = { mode: 'add' | 'edit'; item: ObjectWorkspaceExternalIdentifierItem } | null;

export function SectionSync({ editor, permissions, objectId, folded }: SectionProps) {
  const sync = editor.draft.syncIdentifiers;
  const rows = sync.externalIdentifiers;
  const canManage = permissions.syncIdentifiers.canDirectWrite;
  const manageReason = permissions.syncIdentifiers.disabledReason ?? 'Réservé aux administrateurs.';

  const upsert = useUpsertExternalIdMutation(objectId ?? null);
  const remove = useDeleteExternalIdMutation(objectId ?? null);
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingDelete, setPendingDelete] = useState<ObjectWorkspaceExternalIdentifierItem | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const syncedCount = rows.filter((r) => Boolean(r.lastSyncedAt)).length;
  const pillTone = rows.length === 0 ? 'warn' : syncedCount >= rows.length ? 'ok' : 'warn';
  const pillLabel = rows.length === 0 ? 'Lecture seule' : `${syncedCount} / ${rows.length} synchros`;

  // Optimistically patch the loaded draft so the row reflects immediately; the mutation's
  // invalidation of ['object-workspace', id] reloads the authoritative snapshot right after.
  function patchDraftRows(next: ObjectWorkspaceExternalIdentifierItem[]) {
    editor.replaceModule('syncIdentifiers', { ...sync, externalIdentifiers: next });
  }

  async function handleSave(item: ObjectWorkspaceExternalIdentifierItem) {
    setFeedback(null);
    try {
      const newId = await upsert.mutateAsync({
        sourceSystem: item.sourceSystem,
        externalId: item.externalId,
        lastSyncedAt: item.lastSyncedAt ? item.lastSyncedAt : null,
      });
      const saved: ObjectWorkspaceExternalIdentifierItem = { ...item, id: item.id || newId };
      const next = item.id
        ? rows.map((r) => (r.id === item.id ? saved : r))
        : [...rows, saved];
      patchDraftRows(next);
      setModal(null);
      setFeedback('Identifiant externe enregistré.');
    } catch (error) {
      setModal(null);
      setFeedback(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  }

  async function handleDelete(item: ObjectWorkspaceExternalIdentifierItem) {
    setFeedback(null);
    try {
      await remove.mutateAsync(item.id);
      patchDraftRows(rows.filter((r) => r.id !== item.id));
      setPendingDelete(null);
      setFeedback('Identifiant externe supprimé.');
    } catch (error) {
      setPendingDelete(null);
      setFeedback(error instanceof Error ? error.message : 'Suppression impossible.');
    }
  }

  return (
    <Fs
      num="22"
      title="Identifiants externes & synchronisation"
      sub="Correspondances inter-systèmes · dernier import · jobs planifiés"
      folded={folded}
      pill={{ tone: pillTone, label: pillLabel }}
    >
      {rows.length > 0 ? (
        rows.map((rowItem) => {
          const locked = isCanonicalSourceSystem(rowItem.sourceSystem);
          const actionsDisabled = !canManage || locked;
          const actionTitle = locked ? 'Source canonique — verrouillée' : (!canManage ? manageReason : undefined);
          return (
            <div key={`${rowItem.id}-${rowItem.sourceSystem}`} className="sync-row">
              <div className="sync-row__src">{sourceCode(rowItem.sourceSystem)}</div>
              <div>
                <strong>{rowLabel(rowItem)}</strong>
                <small>{rowItem.externalId}</small>
              </div>
              <span className="sync-row__when">{formatWhen(rowItem)}</span>
              <div className="sync-row__actions">
                <button
                  type="button"
                  className="sync-row__btn"
                  aria-label="Modifier cet identifiant"
                  title={actionTitle ?? 'Modifier'}
                  disabled={actionsDisabled}
                  onClick={() => setModal({ mode: 'edit', item: rowItem })}
                >
                  {locked ? '🔒' : '✎'}
                </button>
                <button
                  type="button"
                  className="sync-row__btn"
                  aria-label="Supprimer cet identifiant"
                  title={actionTitle ?? 'Supprimer'}
                  disabled={actionsDisabled}
                  onClick={() => setPendingDelete(rowItem)}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          {sync.externalIdentifiersVisibilityNote ?? 'Aucun identifiant externe visible.'}
        </p>
      )}

      <button
        type="button"
        className="rep-add"
        style={{ marginTop: 10 }}
        disabled={!canManage}
        title={canManage ? undefined : manageReason}
        onClick={() => setModal({ mode: 'add', item: createExternalIdDraft() })}
      >
        + Lier un nouvel identifiant externe
      </button>

      {!canManage && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{manageReason}</p>
      )}
      {feedback && (
        <p className="muted" role="status" style={{ marginTop: 8, fontSize: 12 }}>{feedback}</p>
      )}

      {modal && (
        <ExternalIdEditModal
          open
          mode={modal.mode}
          item={modal.item}
          onClose={() => setModal(null)}
          onSave={(item) => void handleSave(item)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title="Supprimer l’identifiant externe"
          message={`Le lien ${rowLabel(pendingDelete)} (${pendingDelete.externalId}) sera supprimé. Cette action ne supprime pas la fiche source dans le système externe.`}
          confirmLabel="Supprimer"
          tone="danger"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete(pendingDelete)}
        />
      )}
    </Fs>
  );
}
```

> Design choices grounded in the codebase: (a) the per-row action title prefers the canonical-lock reason over the permission reason because a canonical row is locked for everyone (matches the old `🔒` vs `✎` distinction); (b) `replaceModule('syncIdentifiers', …)` is the typed draft setter (`useObjectEditorState.replaceModule(key, value)`) and is the only state write — no `patchModule` since we replace the whole module slice; (c) `lastSyncedAt ? … : null` because the RPC's `p_last_synced_at` is nullable and the draft carries `''` when unset.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/sections/SectionSync.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Run the editor test suite (regression)**

Run: `npx jest src/features/object-editor`
Expected: PASS — all existing object-editor specs + the new external-id-edit / ExternalIdEditModal / SectionSync specs.

- [ ] **Step 7: Production build**

Run: `npm run build`
Expected: exit 0 (`.test.*` excluded from the build per tsconfig).

- [ ] **Step 8: Manual verification (preview)**

Start the dev server, open `/objects/<id>/edit`, scroll to §22 « Identifiants externes & synchronisation »:
- As a **platform superuser / ORG admin**: « + Lier un nouvel identifiant externe » is enabled → opens `ExternalIdEditModal` (source select limited to Airtable / Apidae / DataTourisme; identifier required) → save → the row appears + « Identifiant externe enregistré. »; a non-canonical row shows ✎ + 🗑 (🗑 → ConfirmDialog danger → Supprimer); a canonical (OTI/SU) row shows 🔒 with both actions disabled.
- As a **non-admin member**: the CTA is greyed with the permission reason in `title`, and the explanatory line is shown.
Capture a screenshot of §22 in admin mode (CTA + a row with actions + the modal) as proof.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/sections/SectionSync.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionSync.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): §22 external-id CTA + per-row edit/delete (admin-gated, canonical locked) (tranche A)"
```

---

## Self-Review

**1. Spec coverage (tranche A scope = design spec §3.A + §6 #1):**
- Backend `api.rpc_upsert_object_external_id(p_object_id, p_source_system, p_external_id, p_last_synced_at default null) RETURNS uuid` — SECURITY DEFINER, admin gate (`is_platform_superuser() OR current_user_admin_role_code() IS NOT NULL` else RAISE), org server-derived (`current_user_org_id()`), canonical refusal (`upper IN ('OTI','SU')` / `lower LIKE '%canonical%'`), `ON CONFLICT (object_id, organization_object_id, source_system) DO UPDATE` → Task 1. ✔
- Backend `api.rpc_delete_object_external_id(p_id uuid) RETURNS void` — same gate, row must belong to `current_user_org_id()`, non-canonical → Task 1. ✔
- Grants `REVOKE FROM PUBLIC, anon; GRANT TO authenticated, service_role;` on all three functions → Task 1. ✔
- **Spec §6 #1 resolved:** the workspace resource exposes NO admin flag (verified — `getObjectWorkspacePermissions` only probes `user_can_write_canonical / _enrichment / publish / private_notes / is_object_owner / write_crm`). **Decision:** add a dedicated tiny RPC `api.current_user_is_org_admin()` (mirrors the write gate exactly, one source of truth) and probe it in the existing `Promise.allSettled` block to drive `permissions.syncIdentifiers.canDirectWrite`. Chosen over piggy-backing an admin boolean onto an unrelated key because §22's gate is admin-role-based (org-wide), distinct from the per-object canonical/publish gates already probed; it also keeps the front gate byte-identical to the RPC gate. → Tasks 1 + 4. ✔
- Frontend: CTA + per-row ✎/delete ONLY for admins (else disabled with reason) → Task 6; `ExternalIdEditModal` (non-canonical AT/AP/DT select + identifier input) → Task 3; hooks `useUpsertExternalIdMutation`/`useDeleteExternalIdMutation` invalidating `['object-workspace', id]` → Task 5; service callers → Task 4; SQL + Jest tests → Tasks 1, 2, 3, 6. ✔
- Deploy invariant: migration added to manifest (`14q`), folded into `api_views_functions.sql`, CI test under `tests/` → Task 1. ✔

**2. Placeholder scan:** no TBD/TODO/"similar to"/"add error handling" — every step carries complete code (SQL bodies, TS impls, full test files). Error handling is explicit (`try/catch` in the section, `mapMutationError` in callers, `RAISE EXCEPTION` in RPCs). ✔

**3. Type consistency:**
- `ObjectWorkspaceExternalIdentifierItem` fields (`id`, `organizationObjectId`, `sourceSystem`, `externalId`, `lastSyncedAt`, `createdAt`, `updatedAt`) used identically in `external-id-edit.ts` (Task 2), `ExternalIdEditModal` (Task 3), and `SectionSync` (Task 6) — matches the parser definition (lines 193-201). ✔
- `EXTERNAL_ID_SOURCE_OPTIONS` is `{ v, l }[]` = `SelectOption` shape consumed by the `Select` primitive (Task 3). ✔
- Service callers' signatures (`upsertObjectExternalId({ objectId, sourceSystem, externalId, lastSyncedAt })` → `Promise<string>`, `deleteObjectExternalId(id)` → `Promise<void>`) match the hooks' `mutationFn` inputs (Task 5) and the section's `mutateAsync` calls (Task 6: `{ sourceSystem, externalId, lastSyncedAt }`). ✔
- RPC parameter names (`p_object_id`, `p_source_system`, `p_external_id`, `p_last_synced_at`, `p_id`) match the `apiClient.schema('api').rpc(name, { … })` payloads (Task 4) and the SQL signatures (Task 1). ✔
- `permissions.syncIdentifiers.canDirectWrite` / `disabledReason` are `ObjectWorkspaceModuleAccess` fields (verified, lines 80-85) — read in Task 6, written in Task 4. ✔
- `editor.replaceModule('syncIdentifiers', value)` matches `useObjectEditorState.replaceModule(key, value)` (verified, line 45). ✔

> Cross-tranche note: tranche A does not touch `shell/editor-tools.ts` or `EditorNav` (the OUTILS group); it is independent of tranche B's prop-driven nav refactor and can land before or after B. The only shared surface with other tranches is `getObjectWorkspacePermissions` / `useExplorerQueries.ts`, where additive insertions avoid conflicts. **Risk:** if tranche C/E also extend the `Promise.allSettled` probe array in `getObjectWorkspacePermissions`, the array destructuring order must stay consistent — append new probes at the end (as done here for `orgAdminResult`).

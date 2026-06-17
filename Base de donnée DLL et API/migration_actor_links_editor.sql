-- migration_actor_links_editor.sql
-- §48 — Editor write path for actor_object_role (operator/guide links) + actor search RPC.
-- (a) Converges actor_object_role writes to the §47 per-command canonical family and retires the
--     legacy admin FOR ALL (canonical SUBSUMES admin/superuser via is_object_owner — see 8o's
--     predicate note). Rewrites the read policy in the §38/§39 form (set-based extended scope,
--     wrapped auth fns, actor-self arm preserved). NO published-read arm is added — the
--     "read under-exposure" item stays deferred.
-- (b) api.save_object_relations gains a real `actors` branch (delete-all + re-insert; role by id or
--     ref_actor_role.code; visibility mirror of the table CHECK; ≤1 primary per role enforced by
--     uq_actor_object_role_primary). actor_channel / actor_consent stay OUT of the contract.
--     §95: the actor-existence pre-check is NO LONGER an EXISTS over public.actor (which, under this
--     INVOKER fn, was RLS-filtered by ext_actor_read and hid not-yet-linked actors → "Unknown actor_id"
--     for non-admin editors). Existence is now FK-enforced (actor_object_role.actor_id → actor(id));
--     authorization stays workspace_assert_can_write_object (object-write). So ANY object editor can
--     associate ANY existing actor — not just the superadmin.
-- (c) api.search_actors(p_query): SECURITY DEFINER picker, gated on api.current_user_can_edit_objects()
--     so read-only members cannot enumerate actor PII. §95: scope is the FULL actor directory for any
--     editor (was admin/superuser → all, else self ∪ extended) — the save path no longer RLS-filters
--     existence, so the picker need not be restricted to the caller's own/extended actors. LIKE
--     wildcards escaped ('%'/'_'/'\') so '%%' cannot bypass the min-2-char guard; LIMIT 20.
--     Advisor will flag the DEFINER — expected (§36 precedent).
-- PREREQUISITES: rls_policies.sql (step 6 — also defines api.current_user_can_edit_objects),
--   object_workspace_safe_write_rpcs.sql (step 7 — helpers + save_object_relations baseline),
--   migration_permission_write_paths.sql (8b — user_can_write_object_canonical).
--   Manifest step 8r.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE FUNCTION.
-- REVERSIBLE: re-create ext_actor_object_role_read / admin_actor_object_role_write from
--   rls_policies.sql (Actor system tables block); re-apply step 7's
--   save_object_relations; DROP FUNCTION api.search_actors(text).
-- ⚠ RE-APPLY CAVEAT: rls_policies.sql still creates admin_actor_object_role_write (FOR ALL) and
--   step 7 still ships the actors-skip RPC body — after re-applying either to a live DB, re-run THIS file.
BEGIN;

-- == 1. actor_object_role: §47 per-command canonical write family ==
DROP POLICY IF EXISTS "admin_actor_object_role_write" ON actor_object_role;
DROP POLICY IF EXISTS "canonical_ins_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_ins_actor_object_role" ON actor_object_role FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_upd_actor_object_role" ON actor_object_role FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_del_actor_object_role" ON actor_object_role FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- == 2. read policy: same semantics (admin OR self OR extended), §39-wrapped + §38 set form ==
DROP POLICY IF EXISTS "ext_actor_object_role_read" ON actor_object_role;
CREATE POLICY "ext_actor_object_role_read" ON actor_object_role FOR SELECT USING (
  (select auth.role()) IN ('service_role', 'admin')
  -- NOTE: the actor-self arm is INERT today (actor.id is uuid_generate_v4(), never an auth uid; the
  -- email bridge is api.user_actor_ids()) — preserved verbatim from the legacy policy for behavior
  -- parity. See decision log §48.
  OR actor_id = (select auth.uid())
  OR object_id IN (SELECT api.current_user_extended_object_ids())
);

-- == 3. save_object_relations: real `actors` branch (replaces the skip) ==
-- Body identical to object_workspace_safe_write_rpcs.sql (fold there too — fresh == live).
CREATE OR REPLACE FUNCTION api.save_object_relations(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_id uuid;
  v_deleted integer;
  v_inserted integer;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'object_relations' THEN
    DELETE FROM public.object_relation WHERE source_object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'object_relations')) AS t(value) LOOP
      IF COALESCE(NULLIF(v_row->>'source_object_id', ''), p_object_id) <> p_object_id THEN
        RAISE EXCEPTION 'object_relations source_object_id must match p_object_id' USING ERRCODE = '22023';
      END IF;
      IF v_row->>'target_object_id' = p_object_id THEN
        RAISE EXCEPTION 'object_relation cannot target itself' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'target_object_id') THEN
        RAISE EXCEPTION 'Unknown target_object_id: %', v_row->>'target_object_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'relation_type_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_object_relation_type WHERE lower(code) = lower(v_row->>'relation_type_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown relation_type reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_relation (id, source_object_id, target_object_id, relation_type_id, distance_m, note, position)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        v_row->>'target_object_id',
        v_id,
        NULLIF(v_row->>'distance_m', '')::numeric,
        NULLIF(v_row->>'note', ''),
        COALESCE(NULLIF(v_row->>'position', '')::integer, v_inserted)
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_relation_deleted', v_deleted, 'object_relation_inserted', v_inserted);
  END IF;

  IF p_payload ? 'org_links' THEN
    IF (
      SELECT count(*)
      FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'org_links')) AS t(value)
      WHERE COALESCE(NULLIF(value->>'is_primary', '')::boolean, false)
    ) > 1 THEN
      RAISE EXCEPTION 'Only one primary organization link is allowed per object' USING ERRCODE = '23505';
    END IF;

    DELETE FROM public.object_org_link WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'org_links')) AS t(value) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'org_object_id') THEN
        RAISE EXCEPTION 'Unknown org_object_id: %', v_row->>'org_object_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_org_role WHERE lower(code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown org role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary, note)
      VALUES (
        p_object_id,
        v_row->>'org_object_id',
        v_id,
        COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        NULLIF(v_row->>'note', '')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_org_link_deleted', v_deleted, 'object_org_link_inserted', v_inserted);
  END IF;

  IF p_payload ? 'incoming_relations' THEN
    v_skipped := array_append(v_skipped, 'incoming_relations');
    v_warnings := array_append(v_warnings, 'Incoming relations are read-only here because their source object owns the write.');
  END IF;
  -- §48/§95: actor links (actor_object_role only — actor_channel/actor_consent stay out of contract).
  IF p_payload ? 'actors' THEN
    DELETE FROM public.actor_object_role WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'actors')) AS t(value) LOOP
      -- §95: existence is enforced by actor_object_role.actor_id -> actor(id) FK (RLS-independent).
      -- Do NOT add an EXISTS over public.actor here: this fn is SECURITY INVOKER, so that probe is
      -- filtered by ext_actor_read and would HIDE actors the caller cannot READ (e.g. a not-yet-linked
      -- prestataire), failing the save for any non-admin editor even though they may WRITE the object.
      -- Authorization is workspace_assert_can_write_object (object-write); api.search_actors bounds the
      -- offered set. A truly unknown actor_id surfaces as the FK violation (23503).
      IF internal.workspace_uuid(v_row->>'actor_id') IS NULL THEN
        RAISE EXCEPTION 'Invalid or missing actor_id: %', COALESCE(v_row->>'actor_id', '(null)') USING ERRCODE = '22023';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT ref.id INTO v_id FROM public.ref_actor_role ref WHERE lower(ref.code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown actor role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      IF COALESCE(NULLIF(v_row->>'visibility', ''), 'public') NOT IN ('public', 'private', 'partners') THEN
        RAISE EXCEPTION 'Invalid actor link visibility: %', v_row->>'visibility' USING ERRCODE = '22023';
      END IF;
      -- ≤1 primary per (object, role) is enforced by uq_actor_object_role_primary (unique partial index).
      INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to, visibility, note)
      VALUES (
        internal.workspace_uuid(v_row->>'actor_id'),
        p_object_id,
        v_id,
        COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        NULLIF(v_row->>'valid_from', '')::date,
        NULLIF(v_row->>'valid_to', '')::date,
        COALESCE(NULLIF(v_row->>'visibility', ''), 'public'),
        NULLIF(v_row->>'note', '')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('actor_object_role_deleted', v_deleted, 'actor_object_role_inserted', v_inserted);
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

-- == 4. picker RPC ==
-- §95b: RETURNS gender + primary email (actor_channel kind 'email') for the rich picker card.
-- DROP+CREATE (not CREATE OR REPLACE) because the return-table signature changed (re-apply safe).
DROP FUNCTION IF EXISTS api.search_actors(text);
CREATE FUNCTION api.search_actors(p_query text)
RETURNS TABLE(id uuid, display_name text, first_name text, last_name text, gender text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api
AS $fn$
DECLARE
  v_pattern text;
BEGIN
  -- Editors only: read-only ORG members must not enumerate actor PII through this DEFINER.
  IF NOT api.current_user_can_edit_objects() THEN
    RAISE EXCEPTION 'Actor search requires editor rights' USING ERRCODE = '42501';
  END IF;
  IF p_query IS NULL OR length(btrim(p_query)) < 2 THEN
    RETURN;
  END IF;
  -- Escape LIKE wildcards: '%%' must not enumerate the whole table past the length guard.
  v_pattern := '%' || replace(replace(replace(immutable_unaccent(lower(btrim(p_query))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- §95: ANY editor (current_user_can_edit_objects gate above) may search the FULL actor directory to
  -- associate a prestataire — NOT only admin/superuser. The save path (api.save_object_relations) no
  -- longer RLS-filters actor existence (FK-enforced), so the picker is not restricted to the caller's
  -- own/extended actors. Bounded by editor rights + min-2-char + LIKE-escape + LIMIT 20.
  -- (Privacy tradeoff per PO request 2026-06-17 — editors can name-search all actors. See decision log §95.)
  -- §95b: DEFINER bypasses actor_channel RLS, so the email subquery resolves for any editor.
  RETURN QUERY
  SELECT a.id, a.display_name, a.first_name, a.last_name, a.gender,
    (SELECT ac.value
       FROM public.actor_channel ac
       JOIN public.ref_code_contact_kind k ON k.id = ac.kind_id
      WHERE ac.actor_id = a.id AND lower(k.code) = 'email'
      ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
      LIMIT 1) AS email
  FROM public.actor a
  WHERE (a.display_name_normalized LIKE v_pattern
      OR a.last_name_normalized    LIKE v_pattern
      OR a.first_name_normalized   LIKE v_pattern)
  ORDER BY a.display_name
  LIMIT 20;
END;
$fn$;
REVOKE ALL ON FUNCTION api.search_actors(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.search_actors(text) TO authenticated, service_role;

COMMIT;

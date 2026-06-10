-- test_actor_links_editor.sql
-- Proves migration_actor_links_editor.sql (§48 / manifest 8r): per-command canonical write triple
-- on actor_object_role (legacy admin FOR ALL retired), §39-wrapped read policy, the
-- save_object_relations `actors` branch, and the gated api.search_actors picker.
-- Behavior block uses the service-role claims mechanics of test_object_fma_rls.sql (set_config on
-- request.jwt.claims so auth.role() resolves; fixtures inserted as the connecting superuser).
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Against a DB WITHOUT 8r, the structural asserts go red (FOR ALL still present, search_actors missing).
\set ON_ERROR_STOP on
BEGIN;

-- ============================ DO #1 — structural ============================
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='canonical_ins_actor_object_role' AND cmd='INSERT'), 'canonical_ins missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='canonical_upd_actor_object_role' AND cmd='UPDATE'), 'canonical_upd missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='canonical_del_actor_object_role' AND cmd='DELETE'), 'canonical_del missing';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND cmd='ALL'), 'FOR ALL must be retired on actor_object_role (P0.3 gotcha class)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='ext_actor_object_role_read' AND cmd='SELECT'), 'ext_actor_object_role_read (rewritten §38/§39 form) missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api' AND p.proname='search_actors'), 'api.search_actors missing';
  ASSERT NOT has_function_privilege('anon', 'api.search_actors(text)', 'EXECUTE'), 'anon must not execute search_actors';
  ASSERT has_function_privilege('authenticated', 'api.search_actors(text)', 'EXECUTE'), 'authenticated must be able to execute search_actors (gate is in-function)';
END$$;

-- ============================ DO #2 — behavior: actors branch round-trip ============================
-- (persona fixture per test_object_fma_rls.sql; service-role claims so the SECURITY INVOKER RPC's
--  workspace gate passes via api.is_object_owner's auth.role() arm)
DO $$
DECLARE
  v_obj    text := 'ACTRUN9999999801';
  v_actor  uuid := 'aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa';
  v_role   uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  ASSERT v_role IS NOT NULL, 'fixture ref missing (operator role -- seeds not applied)';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ACT', 'actor link test', 'draft');
  INSERT INTO actor (id, display_name) VALUES (v_actor, 'Test Operator');
  v_result := api.save_object_relations(v_obj, jsonb_build_object('actors', jsonb_build_array(
    jsonb_build_object('actor_id', v_actor, 'role_code', 'operator', 'is_primary', true, 'visibility', 'public', 'note', 't')
  )));
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 1, 'actors branch did not insert';
  ASSERT (SELECT is_primary FROM actor_object_role WHERE object_id = v_obj), 'is_primary lost';
  v_result := api.save_object_relations(v_obj, jsonb_build_object('actors', '[]'::jsonb));
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 0, 'actors branch did not clear';
  RAISE NOTICE 'actor links editor assertions passed (per-command structural + read policy + gated picker + actors round-trip).';
END$$;
ROLLBACK;

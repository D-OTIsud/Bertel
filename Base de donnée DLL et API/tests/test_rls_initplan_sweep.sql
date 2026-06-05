-- test_rls_initplan_sweep.sql
-- Proves the auth-initplan sweep (§39) on the OBJECT-FAMILY policies that still re-evaluated raw
-- auth.role()/auth.uid() PER ROW (the Supabase `auth_rls_initplan` lint). The fix wraps each call
-- as `(select auth.x())` so the planner hoists it to a single InitPlan (evaluated once per query,
-- not once per scanned row). These are `FOR ALL` write policies that ALSO gate SELECT (the P0.3
-- gotcha), on tables that grow with object count — so the per-row eval is on the read path at scale.
-- The wrap is SEMANTICS-IDENTICAL (a scalar subquery returning the same value), so access decisions
-- are unchanged — re-verified behaviourally on `object` (the highest-risk policies: owner_update/delete).
-- Scope (18 policies / 13 tables): object, object_external_id, object_membership, object_origin,
--   object_place_description, object_private_description, object_relation, object_review,
--   object_room_type(+_amenity,+_media), object_sustainability_action(+_label).
--   (object_version audit partitions, media_tag, ref_*/RBAC tiny tables are deferred — bounded rows,
--    admin-only, off the hot path; see decision log §39.)
-- Two assertion layers:
--   STRUCTURAL  — NO object-family policy qual/with_check contains an UN-wrapped auth.x() call
--                 (detected by removing the wrapped `SELECT auth.x()` occurrences, then checking for
--                 a remaining bare `auth.x()`). Red before the migration (18 bare calls remain).
--   BEHAVIOURAL — on `object`: the creator may UPDATE its own row; an unrelated user may NOT
--                 (owner_update_object still gates correctly after wrapping).
-- Self-contained + transactional (ROLLBACK). Mirrors test_read_gate_setbased.sql mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_unwrapped int;
  v_obj    text := 'HOTRUN9999990091';
  v_userA  uuid := '00000000-0000-4000-a000-0000000000c1';  -- creator
  v_userB  uuid := '00000000-0000-4000-a000-0000000000c2';  -- unrelated
  v_rows   int;
BEGIN
  -- ---------- STRUCTURAL: no un-wrapped auth.x() left in the object-family policies ----------
  SELECT count(*) INTO v_unwrapped
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('object','object_external_id','object_membership','object_origin',
                      'object_place_description','object_private_description','object_relation',
                      'object_review','object_room_type','object_room_type_amenity',
                      'object_room_type_media','object_sustainability_action',
                      'object_sustainability_action_label')
    AND regexp_replace(coalesce(qual,'')||' '||coalesce(with_check,''),
                       'SELECT auth\.(uid|role|jwt)\(\)', '', 'g') ~ 'auth\.(uid|role|jwt)\(\)';
  ASSERT v_unwrapped = 0,
    format('auth-initplan sweep not applied: %s object-family policies still re-evaluate auth.x() per row', v_unwrapped);

  -- ---------- BEHAVIOURAL: owner_update_object still gates correctly after the wrap ----------
  -- v_obj is PUBLISHED so it is SELECT-visible to BOTH users (UPDATE ... WHERE applies SELECT
  -- policies too); this isolates the owner_update_object USING decision — creator allowed, stranger
  -- denied — rather than conflating it with draft SELECT-visibility (the extended set keys off
  -- org/actor links, not created_by, so a link-less draft would be invisible to its own creator).
  INSERT INTO auth.users (id,email) VALUES
    (v_userA,'initplan_a@test.local'),(v_userB,'initplan_b@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id,role) VALUES
    (v_userA,'tourism_agent'),(v_userB,'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status, created_by) VALUES
    (v_obj,'HOT','Initplan Owner Test','published', v_userA);

  -- creator (user A) may UPDATE its own object (owner path: (select auth.uid()) = created_by)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    UPDATE object SET name = 'Renamed by owner' WHERE id = v_obj;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    ASSERT v_rows = 1, format('owner UPDATE should affect 1 row, affected %s', v_rows);
  RESET ROLE;

  -- unrelated user (user B) may NOT UPDATE it (no canonical permission, not creator)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userB,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    UPDATE object SET name = 'Hijacked by stranger' WHERE id = v_obj;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    ASSERT v_rows = 0, format('non-owner UPDATE must affect 0 rows (RLS), affected %s', v_rows);
  RESET ROLE;

  RAISE NOTICE 'RLS auth-initplan sweep assertions passed.';
END$$;
ROLLBACK;

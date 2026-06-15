-- test_create_tag.sql
-- §09 (manifest 14h): api.create_tag — dedup-guarded GLOBAL tag creation.
-- Run AFTER the manifest (incl. migration_tags_create_and_order.sql).
-- Self-contained + transactional (ROLLBACK; nothing persists). Personas via
-- request.jwt.claims + SET LOCAL ROLE (mirrors test_object_act_rls.sql). Against a DB
-- without the migration, api.create_tag does not exist -> the structural ASSERTs go red.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj   text := 'TAGTESTCREATE001';
  v_uid   uuid := '00000000-0000-4000-a000-0000000000e1';  -- authenticated non-owner
  v_owner uuid := '00000000-0000-4000-a000-0000000000e3';  -- service_role caller (sub) for created_by
  v_r jsonb; v_id1 uuid; v_denied boolean;
BEGIN
  -- ---------- Structural ----------
  ASSERT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='api' AND p.proname='create_tag'),
         'api.create_tag must be SECURITY DEFINER';
  ASSERT NOT has_function_privilege('anon','api.create_tag(text,text,text)','EXECUTE'),
         'anon must NOT execute api.create_tag (global catalog write)';
  ASSERT has_function_privilege('authenticated','api.create_tag(text,text,text)','EXECUTE'),
         'authenticated must execute api.create_tag';

  -- ---------- Fixture (superuser; RLS bypass) ----------
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ACT', 'create_tag test', 'published');
  INSERT INTO auth.users (id, email) VALUES (v_uid,   'create_tag_noowner@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (v_owner, 'create_tag_owner@test.local')   ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_uid, 'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;

  -- ---------- ALLOWED (service_role arm of is_object_owner; sub carries created_by) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_owner)::text, true);
  SET LOCAL ROLE service_role;
    v_r := api.create_tag(v_obj, 'Bord de Mer', '#14B8A6');
    ASSERT (v_r->>'created')::boolean = true, 'first create -> created=true';
    ASSERT v_r->>'color' = '#14b8a6', 'hex stored lowercased';
    v_id1 := (v_r->>'tag_id')::uuid;
    ASSERT (SELECT created_by FROM ref_tag WHERE id=v_id1) = v_owner, 'created_by = caller auth.uid()';

    -- dedup: exact + case/accent variant resolve to the SAME row via name_normalized, no recolor
    v_r := api.create_tag(v_obj, 'Bord de Mer', '#ff0000');
    ASSERT (v_r->>'created')::boolean = false AND (v_r->>'tag_id')::uuid = v_id1, 'exact dedup -> existing id';
    ASSERT v_r->>'color' = '#14b8a6', 'dedup must NOT recolor';
    v_r := api.create_tag(v_obj, 'BORD DE MER', '#00ff00');
    ASSERT (v_r->>'tag_id')::uuid = v_id1, 'case-variant dedups (name_normalized)';
    v_r := api.create_tag(v_obj, 'Bòrd de Mer', '#0000ff');  -- accent variant (immutable_unaccent)
    ASSERT (v_r->>'tag_id')::uuid = v_id1, 'accent-variant dedups (immutable_unaccent)';
    ASSERT (SELECT count(*) FROM ref_tag WHERE name_normalized = immutable_unaccent(lower('Bord de Mer'))) = 1,
           'only ONE ref_tag row for the normalized name';

    -- default color when none supplied
    v_r := api.create_tag(v_obj, 'Sans Couleur', NULL);
    ASSERT v_r->>'color' = '#64748b', 'null color -> default slate';

    -- bad inputs
    BEGIN v_denied:=false; PERFORM api.create_tag(v_obj, '   ', '#112233'); EXCEPTION WHEN sqlstate '22023' THEN v_denied:=true; END;
    ASSERT v_denied, 'empty name -> 22023';
    BEGIN v_denied:=false; PERFORM api.create_tag(v_obj, 'Bad Hex', 'teal'); EXCEPTION WHEN sqlstate '22023' THEN v_denied:=true; END;
    ASSERT v_denied, 'non-hex color -> 22023';
    BEGIN v_denied:=false; PERFORM api.create_tag('NONEXISTENTOBJ00', 'X', '#112233'); EXCEPTION WHEN sqlstate 'P0002' THEN v_denied:=true; END;
    ASSERT v_denied, 'unknown anchor object -> P0002';
  RESET ROLE;

  -- ---------- DENIED (authenticated non-owner) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    BEGIN v_denied:=false; PERFORM api.create_tag(v_obj, 'Hacker', '#000000'); EXCEPTION WHEN sqlstate '42501' THEN v_denied:=true; END;
    ASSERT v_denied, 'non-owner create_tag -> 42501 (gate enforced)';
  RESET ROLE;

  RAISE NOTICE 'create_tag assertions passed.';
END$$;
ROLLBACK;

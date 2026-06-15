-- test_set_tag_color.sql
-- §09 (manifest 14h): api.set_tag_color — GLOBAL recolor (ref_tag.color, HEX), gated per-object.
-- Run AFTER the manifest. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj text := 'TAGTESTCOLOR0001';
  v_uid uuid := '00000000-0000-4000-a000-0000000000e2';
  v_tag uuid; v_denied boolean; v_r jsonb;
BEGIN
  ASSERT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='api' AND p.proname='set_tag_color'),
         'api.set_tag_color must be SECURITY DEFINER';
  ASSERT NOT has_function_privilege('anon','api.set_tag_color(text,uuid,text)','EXECUTE'),
         'anon must NOT execute api.set_tag_color';
  ASSERT has_function_privilege('authenticated','api.set_tag_color(text,uuid,text)','EXECUTE'),
         'authenticated must execute api.set_tag_color';

  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ACT', 'set_tag_color test', 'published');
  INSERT INTO auth.users (id, email) VALUES (v_uid, 'set_color_noowner@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_uid, 'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO ref_tag (id, slug, name, color) VALUES (gen_random_uuid(), 'set-color-test', 'Set Color Test', '#111111') RETURNING id INTO v_tag;

  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  SET LOCAL ROLE service_role;
    v_r := api.set_tag_color(v_obj, v_tag, '#0EA5E9');
    ASSERT v_r->>'color' = '#0ea5e9', 'returns lowercased hex';
    ASSERT (SELECT color FROM ref_tag WHERE id=v_tag) = '#0ea5e9', 'recolor persisted GLOBALLY';
    BEGIN v_denied:=false; PERFORM api.set_tag_color(v_obj, v_tag, '#12'); EXCEPTION WHEN sqlstate '22023' THEN v_denied:=true; END;
    ASSERT v_denied, 'short hex -> 22023';
    BEGIN v_denied:=false; PERFORM api.set_tag_color(v_obj, v_tag, 'blue'); EXCEPTION WHEN sqlstate '22023' THEN v_denied:=true; END;
    ASSERT v_denied, 'named color -> 22023';
    BEGIN v_denied:=false; PERFORM api.set_tag_color(v_obj, gen_random_uuid(), '#123456'); EXCEPTION WHEN sqlstate 'P0002' THEN v_denied:=true; END;
    ASSERT v_denied, 'unknown tag_id -> P0002';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    BEGIN v_denied:=false; PERFORM api.set_tag_color(v_obj, v_tag, '#abcdef'); EXCEPTION WHEN sqlstate '42501' THEN v_denied:=true; END;
    ASSERT v_denied, 'non-owner set_tag_color -> 42501';
  RESET ROLE;

  RAISE NOTICE 'set_tag_color assertions passed.';
END$$;
ROLLBACK;

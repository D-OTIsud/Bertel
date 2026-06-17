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
  v_writer    uuid := '00000000-0000-4000-a000-0000000000d9';  -- service_role writer for the restore step
  v_n         int;
  v_fields    text[];
  v_snap      jsonb;
  v_cur_after int;
  v_status_after text;
  v_name_after   text;
  v_min_ver   int;
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
  UPDATE object SET name = 'Version test v2'              WHERE id = v_obj;  -- changed: name (real)
  UPDATE object SET business_timezone = 'Europe/Paris'    WHERE id = v_obj;  -- changed: business_timezone (real)
  -- pure cache-only change does NOT create a version (save_object_version skips it)
  UPDATE object SET cached_rating = 4.5                    WHERE id = v_obj;

  SELECT count(*) INTO v_n FROM object_version WHERE object_id = v_obj;
  ASSERT v_n >= 2, 'expected >=2 captured versions (cache-only update must NOT append)';

  SELECT min(version_number) INTO v_min_ver FROM object_version WHERE object_id = v_obj;

  -- the stranger (no membership/actor on any object) for the scope test
  INSERT INTO auth.users (id, email) VALUES
    (v_other_uid, 'version_stranger@test.local'),
    (v_writer,    'version_writer@test.local')   -- FK target for object.updated_by on restore
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES (v_other_uid, 'tourism_agent', 'Marie Stranger')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

  -- ---------- changed_fields: the LAG diff lists 'name' for the v2 version, never a cache key ----------
  SELECT changed_fields INTO v_fields
  FROM api.get_object_versions(v_obj, 50, 0)
  WHERE version_number = v_min_ver + 1;
  ASSERT 'name' = ANY(v_fields), 'changed_fields must include name for the rename version';
  ASSERT NOT ('cached_rating' = ANY(COALESCE(v_fields,'{}'))), 'changed_fields must NOT include cache columns';
  ASSERT NOT ('updated_at'   = ANY(COALESCE(v_fields,'{}'))), 'changed_fields must NOT include updated_at';
  ASSERT NOT ('current_version' = ANY(COALESCE(v_fields,'{}'))), 'changed_fields must NOT include current_version';

  -- ---------- snapshot returns the data jsonb of the requested version ----------
  v_snap := api.get_object_version_snapshot(v_obj, v_min_ver);
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
      PERFORM api.rpc_restore_object_version(v_obj, v_min_ver);
    EXCEPTION WHEN others THEN v_raised := true;
    END;
    ASSERT v_raised, 'rpc_restore_object_version must RAISE for a non-writer';
  RESET ROLE;
  -- writer context: a service_role jwt ⇒ api.is_platform_superuser() ⇒ is_object_owner ⇒ canonical-write.
  -- (A NULL claim would leave auth.uid() NULL and trip the NO_AUTH_CONTEXT guard.)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer, 'role','service_role')::text, true);

  -- ---------- RESTORE (as service_role writer): brings name back, leaves status, appends a version ----------
  SELECT current_version INTO v_cur_after FROM object WHERE id = v_obj;
  PERFORM api.rpc_restore_object_version(v_obj, v_min_ver);
  SELECT status::text, name, current_version INTO v_status_after, v_name_after, v_n FROM object WHERE id = v_obj;
  ASSERT v_status_after = 'published', 'restore must NOT change status';
  ASSERT v_name_after = 'Version test base', 'restore must bring back the v1 canonical name';
  ASSERT v_n > v_cur_after, 'restore must create a NEW version (append-only history)';

  RAISE NOTICE 'object_version read/restore assertions passed (scope + changed_fields + restore exclusions + new version).';
END$$;
ROLLBACK;

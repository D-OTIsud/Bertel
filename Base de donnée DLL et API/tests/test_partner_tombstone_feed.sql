-- tests/test_partner_tombstone_feed.sql
-- Pins the C-4 partner tombstone feed (audit API, Phase 1) :
--   api.list_deleted_objects_since(timestamptz, int) over the immutable object_deletion_log (§108).
-- Structural (existence, SECURITY INVOKER, service_role-only grants) + behavioural
-- (projection shape, RGPD non-leak, since filter, cursor, empty-page echo, limit).
-- Self-cleaning: seeds tombstones in a sub-transaction always rolled back (ROLLBACK_PROBE) —
-- NEVER leaves rows in the immutable log.
DO $$
DECLARE
  v_t1    timestamptz := '2026-01-01T00:00:00Z';
  v_t2    timestamptz := '2026-06-01T00:00:00Z';
  v_full  jsonb;
  v_since jsonb;
  v_empty jsonb;
  v_one   jsonb;
  v_first jsonb;
BEGIN
  -- 1. Function exists and is SECURITY INVOKER (least privilege — not DEFINER).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='list_deleted_objects_since' AND NOT p.prosecdef) <> 1 THEN
    RAISE EXCEPTION 'list_deleted_objects_since missing or not SECURITY INVOKER';
  END IF;

  -- 2. Grants: service_role-ONLY (a partner never reaches PostgREST; anon/authenticated denied).
  IF has_function_privilege('anon','api.list_deleted_objects_since(timestamptz,int)','EXECUTE')
     OR has_function_privilege('authenticated','api.list_deleted_objects_since(timestamptz,int)','EXECUTE') THEN
    RAISE EXCEPTION 'tombstone feed must be service_role-only (anon/authenticated denied)';
  END IF;
  IF NOT has_function_privilege('service_role','api.list_deleted_objects_since(timestamptz,int)','EXECUTE') THEN
    RAISE EXCEPTION 'tombstone feed must be EXECUTE-able by service_role';
  END IF;

  -- 3. Seed two tombstones (with sensitive columns populated, to prove they are NOT projected).
  INSERT INTO object_deletion_log(object_id, object_name, object_type, status_at_deletion, performed_by, performed_at, report)
  VALUES ('OBJ_OLD', 'Secret Name Old', 'HOT', 'archived', gen_random_uuid(), v_t1, '{"storage":["s3://leak-old"]}'::jsonb),
         ('OBJ_NEW', 'Secret Name New', 'RES', 'archived', gen_random_uuid(), v_t2, '{"storage":["s3://leak-new"]}'::jsonb);

  -- 4. Full history (p_since NULL) → both, ordered by performed_at ASC.
  v_full := api.list_deleted_objects_since(NULL, 500);
  IF (v_full->>'count')::int <> 2 THEN RAISE EXCEPTION 'full feed count expected 2, got %', v_full->>'count'; END IF;
  v_first := v_full->'tombstones'->0;
  IF (v_first->>'object_id') <> 'OBJ_OLD' THEN RAISE EXCEPTION 'expected OBJ_OLD first (ASC), got %', v_first->>'object_id'; END IF;

  -- 5. Projection: ONLY {object_id, type, deleted_at}. RGPD: NO sensitive columns.
  IF NOT (v_first ? 'object_id' AND v_first ? 'type' AND v_first ? 'deleted_at') THEN
    RAISE EXCEPTION 'tombstone missing projected keys: %', v_first;
  END IF;
  IF (v_first->>'type') <> 'HOT' THEN RAISE EXCEPTION 'type not projected from object_type: %', v_first; END IF;
  IF (v_first->>'deleted_at')::timestamptz <> v_t1 THEN RAISE EXCEPTION 'deleted_at not projected from performed_at: %', v_first; END IF;
  IF (v_first ? 'report') OR (v_first ? 'performed_by') OR (v_first ? 'object_name') OR (v_first ? 'status_at_deletion') THEN
    RAISE EXCEPTION 'RGPD LEAK: sensitive column projected in tombstone: %', v_first;
  END IF;

  -- 6. Cursor = MAX(performed_at) of the page.
  IF (v_full->>'cursor')::timestamptz <> v_t2 THEN RAISE EXCEPTION 'cursor should be max performed_at (%), got %', v_t2, v_full->>'cursor'; END IF;

  -- 7. since filter: strictly AFTER v_t1 → only OBJ_NEW.
  v_since := api.list_deleted_objects_since(v_t1, 500);
  IF (v_since->>'count')::int <> 1 OR (v_since->'tombstones'->0->>'object_id') <> 'OBJ_NEW' THEN
    RAISE EXCEPTION 'since=v_t1 should return only OBJ_NEW, got %', v_since;
  END IF;

  -- 8. Empty page (since = latest) → count 0, cursor echoes the caller's since (keeps its place).
  v_empty := api.list_deleted_objects_since(v_t2, 500);
  IF (v_empty->>'count')::int <> 0 THEN RAISE EXCEPTION 'page after last should be empty, got %', v_empty; END IF;
  IF (v_empty->>'cursor')::timestamptz <> v_t2 THEN RAISE EXCEPTION 'empty page should echo since as cursor, got %', v_empty->>'cursor'; END IF;

  -- 9. limit: page of 1 → only the oldest (ASC), cursor advances to it.
  v_one := api.list_deleted_objects_since(NULL, 1);
  IF (v_one->>'count')::int <> 1 OR (v_one->'tombstones'->0->>'object_id') <> 'OBJ_OLD' THEN
    RAISE EXCEPTION 'limit=1 should return only OBJ_OLD, got %', v_one;
  END IF;
  IF (v_one->>'cursor')::timestamptz <> v_t1 THEN RAISE EXCEPTION 'limit=1 cursor should be OBJ_OLD performed_at'; END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE'; -- leave no rows in the immutable log
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'test_partner_tombstone_feed.sql: OK'; END $$;

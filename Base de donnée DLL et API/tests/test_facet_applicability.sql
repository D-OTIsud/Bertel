-- test_facet_applicability.sql
-- Proves migration_facet_applicability.sql (§46): ref_facet_registry + ref_facet_applicability
-- (single machine-readable type->facet registry), the assert_facet_applicable trigger on the 13
-- type-specific facet tables, the object_type change guard, and the violations report fn.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Against a DB WITHOUT the migration, every assertion goes red.
\set ON_ERROR_STOP on
BEGIN;

-- ============================ DO #1 — structural + seeds + behavior + type-change ============================
DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  -- ---------- Structural ----------
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ref_facet_registry'),
         'ref_facet_registry missing';
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ref_facet_applicability'),
         'ref_facet_applicability missing';
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='ref_facet_registry'), 'ref_facet_registry RLS not enabled';
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='ref_facet_applicability'), 'ref_facet_applicability RLS not enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ref_facet_registry' AND policyname='pub_ref_facet_registry_read' AND cmd='SELECT'),
         'pub_ref_facet_registry_read missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ref_facet_applicability' AND policyname='pub_ref_facet_applicability_read' AND cmd='SELECT'),
         'pub_ref_facet_applicability_read missing';
  -- 13 enrolled tables, each carrying the trigger
  ASSERT (SELECT count(*) FROM ref_facet_registry) = 13, 'expected 13 enrolled facet tables';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname='trg_assert_facet_applicable' AND NOT tgisinternal) = 13,
         'expected trg_assert_facet_applicable on the 13 enrolled tables';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_guard_object_type_change' AND NOT tgisinternal),
         'trg_guard_object_type_change missing on object';
  -- violations fn: exists, service-only
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='api' AND p.proname='facet_applicability_violations'),
         'api.facet_applicability_violations missing';
  ASSERT NOT has_function_privilege('anon', 'api.facet_applicability_violations()', 'EXECUTE'),
         'anon must NOT execute the violations report';

  -- ---------- Seed matrix (superset asserts — observed-data extensions are allowed) ----------
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_iti' AND object_type='ITI'), 'object_iti must accept ITI';
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_act' AND object_type='ACT'), 'object_act must accept ACT';
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_fma' AND object_type='FMA'), 'object_fma must accept FMA';
  ASSERT (SELECT count(*) FROM ref_facet_applicability WHERE facet_table='object_room_type'
          AND object_type IN ('HOT','HPA','HLO','CAMP','RVA')) = 5, 'object_room_type must accept the HEB family';
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_menu' AND object_type='RES'), 'object_menu must accept RES';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_iti' AND object_type='HOT'),
         'object_iti must NOT accept HOT';
  ASSERT (SELECT object_id_column FROM ref_facet_registry WHERE facet_table='object_iti_section') = 'parent_object_id',
         'object_iti_section must be registered under parent_object_id';

  -- ---------- Behavior: wrong type rejected, right type accepted ----------
  INSERT INTO object (id, object_type, name, status) VALUES ('FACRES9999999901', 'RES', 'facet test RES', 'draft');
  INSERT INTO object (id, object_type, name, status) VALUES ('FACITI9999999902', 'ITI', 'facet test ITI', 'draft');
  v_ok := false;
  BEGIN
    INSERT INTO object_iti (object_id) VALUES ('FACRES9999999901');
    v_ok := true;  -- only reached if the trigger let it through
  EXCEPTION WHEN check_violation THEN NULL;  -- ERRCODE 23514 expected
  END;
  ASSERT NOT v_ok, 'object_iti accepted a RES object (trigger missing/inactive)';
  INSERT INTO object_iti (object_id) VALUES ('FACITI9999999902');
  ASSERT EXISTS (SELECT 1 FROM object_iti WHERE object_id='FACITI9999999902'), 'object_iti rejected a valid ITI insert';

  -- ---------- Behavior: type change blocked while disallowed facet rows exist ----------
  v_ok := false;
  BEGIN
    UPDATE object SET object_type = 'RES' WHERE id = 'FACITI9999999902';
    v_ok := true;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT NOT v_ok, 'object_type change to RES allowed despite existing object_iti rows';
  DELETE FROM object_iti WHERE object_id='FACITI9999999902';
  UPDATE object SET object_type = 'RES' WHERE id = 'FACITI9999999902';  -- now allowed
  ASSERT (SELECT object_type FROM object WHERE id='FACITI9999999902') = 'RES', 'type change failed after facet rows removed';
END$$;

-- ============================ DO #2 — zero violations (registry fully intact) ============================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM api.facet_applicability_violations()) = 0,
         'fresh-applied DB has facet applicability violations (a seed file inserts wrong-type facet rows)';
END$$;

-- ============================ DO #3 — fail-closed on registry misconfiguration + final notice ============================
DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DELETE FROM ref_facet_registry WHERE facet_table = 'object_act';  -- cascades applicability (txn-local)
  INSERT INTO object (id, object_type, name, status) VALUES ('FACACT9999999903', 'ACT', 'facet test ACT', 'draft');
  v_ok := false;
  BEGIN
    INSERT INTO object_act (object_id) VALUES ('FACACT9999999903');
    v_ok := true;
  EXCEPTION WHEN others THEN NULL;  -- 'no registry row' exception expected
  END;
  ASSERT NOT v_ok, 'enrolled table without a registry row must fail closed';
  RAISE NOTICE 'facet applicability assertions passed (structural + matrix + trigger + type-change guard + zero violations + fail-closed).';
END$$;

ROLLBACK;

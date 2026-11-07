-- test_partition_maintenance_hardening.sql
-- Proves migration_partition_maintenance_hardening.sql (16e, §146): both partition creators are
-- born-gated (RLS + wrapped policy at creation), object_version is cron-maintained via
-- audit.maintain_partitions(), no partition of either parent is bare, and the default partition
-- holds no stranded rows. Direct reads of the new children exercise effective grants and RLS.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_month TIMESTAMPTZ := date_trunc('month', CURRENT_DATE) + INTERVAL '5 months'; -- beyond the 3-month horizon
  v_ov_part TEXT := 'object_version_' || to_char(date_trunc('month', CURRENT_DATE) + INTERVAL '5 months', 'YYYY_MM');
  v_au_part TEXT := 'audit_log_'      || to_char(date_trunc('month', CURRENT_DATE) + INTERVAL '5 months', 'YYYY_MM');
  v_reader UUID := '00000000-0000-4000-a000-00000000ac13';
  v_child REGCLASS;
  v_role TEXT;
  v_schema OID;
  v_can_select BOOLEAN;
  v_calibration BOOLEAN;
  v_rows BIGINT;
  v_txt TEXT;
BEGIN
  ASSERT to_regclass(format('public.%I', v_ov_part)) IS NULL
     AND to_regclass(format('audit.%I', v_au_part)) IS NULL,
     'the test month must start without either child';

  -- ---------- creator: object_version partition is born gated ----------
  PERFORM public.create_object_version_monthly_partition(v_month);
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='public' AND c.relname=v_ov_part),
         'fresh object_version partition must be created WITH RLS enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_ov_part
                 AND policyname='admin_object_version' AND cmd='ALL'),
         'fresh object_version partition must carry admin_object_version';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_ov_part
                 AND replace(coalesce(qual,''), '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)'),
         'fresh object_version partition policy must use the wrapped (select auth.*()) form';

  -- ---------- creator: audit partition is born gated ----------
  PERFORM audit.create_monthly_partition(v_month);
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='audit' AND c.relname=v_au_part),
         'fresh audit partition must be created WITH RLS enabled';
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='audit' AND tablename=v_au_part) = 2,
         'fresh audit partition must carry the read + insert policy pair';

  -- Route a synthetic row through each parent, then read the named children directly.
  INSERT INTO auth.users (id, email) VALUES (v_reader, 'acc13-partitions@test.local');
  INSERT INTO public.app_user_profile (id, role, display_name)
    VALUES (v_reader, 'tourism_agent', 'Synthetic ACC13 reader')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO public.object (id, object_type, name, status)
    VALUES ('PCURUN999999AC13', 'PCU', 'Synthetic ACC13', 'draft');
  INSERT INTO public.object_version (object_id, version_number, data, created_at)
    VALUES ('PCURUN999999AC13', 1, '{"fixture":"ACC13"}', v_month);
  INSERT INTO audit.audit_log (id, table_name, operation, row_pk, changed_at)
    VALUES (-13007, 'acc13_fixture', 'UPDATE', '{"id":"synthetic"}', v_month);

  FOR v_child IN SELECT unnest(ARRAY[format('public.%I', v_ov_part)::regclass,
                                   format('audit.%I', v_au_part)::regclass])
  LOOP
    SELECT relnamespace INTO STRICT v_schema FROM pg_class WHERE oid = v_child;
    EXECUTE format('SELECT count(*) FROM %s', v_child) INTO v_rows;
    ASSERT v_rows = 1, format('expected one synthetic row in %s', v_child);

    FOREACH v_calibration IN ARRAY ARRAY[false, true] LOOP
      IF v_calibration THEN
        -- Calibrate the policy independently of default privileges. All grants roll back.
        EXECUTE format('GRANT USAGE ON SCHEMA %s TO anon, authenticated, service_role', v_schema::regnamespace);
        EXECUTE format('GRANT SELECT ON TABLE %s TO anon, authenticated, service_role', v_child);
      END IF;

      FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        v_can_select := has_schema_privilege(v_role, v_schema, 'USAGE')
                     AND has_any_column_privilege(v_role, v_child, 'SELECT');
        IF v_calibration THEN
          ASSERT v_can_select, 'calibration must reach the child policy';
        ELSE
          RAISE NOTICE 'new child % / % effective ACL: schema usage %, direct select %, insert %, update %, delete %, truncate %',
            v_child, v_role, has_schema_privilege(v_role, v_schema, 'USAGE'), v_can_select,
            has_any_column_privilege(v_role, v_child, 'INSERT'),
            has_any_column_privilege(v_role, v_child, 'UPDATE'),
            has_table_privilege(v_role, v_child, 'DELETE'),
            has_table_privilege(v_role, v_child, 'TRUNCATE');
        END IF;

        PERFORM set_config('request.jwt.claims',
          jsonb_strip_nulls(jsonb_build_object('role', v_role,
            'sub', CASE WHEN v_role = 'authenticated' THEN v_reader END))::text, true);
        EXECUTE format('SET LOCAL ROLE %I', v_role);
        ASSERT row_security_active(v_child), format('RLS must apply to %s on %s', v_role, v_child);
        BEGIN
          EXECUTE format('SELECT count(*) FROM %s', v_child) INTO v_rows;
          ASSERT v_can_select AND v_rows = 0, format('%s must see no rows in %s', v_role, v_child);
        EXCEPTION WHEN insufficient_privilege THEN
          ASSERT NOT v_can_select, format('%s must be filtered by RLS when it can query %s', v_role, v_child);
        END;
        RESET ROLE;
      END LOOP;
    END LOOP;

    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SET LOCAL ROLE service_role;
    EXECUTE format('SELECT count(*) FROM %s', v_child) INTO v_rows;
    ASSERT v_rows = 1, format('service_role must read the synthetic row in %s', v_child);
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{}', true);

  -- ---------- global born-gated invariant: NO bare partition on either parent ----------
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pn ON pn.oid = p.relnamespace
    WHERE ((pn.nspname='public' AND p.relname='object_version')
        OR (pn.nspname='audit'  AND p.relname='audit_log'))
      AND (NOT c.relrowsecurity
           OR NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid))
  ), 'every partition of object_version / audit_log must have RLS enabled AND at least one policy';

  -- ---------- maintenance covers both parents; default partition is empty ----------
  v_txt := audit.maintain_partitions();
  ASSERT v_txt LIKE '%object_version%', 'maintain_partitions() must maintain object_version too';
  ASSERT (SELECT count(*) FROM public.object_version_default) = 0,
         'object_version_default must hold no stranded rows (re-home + monthly creation active)';

  -- ---------- horizon: current month partitions exist for both parents ----------
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public'
                 AND tablename='object_version_' || to_char(CURRENT_DATE, 'YYYY_MM')),
         'current-month object_version partition must exist';
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='audit'
                 AND tablename='audit_log_' || to_char(CURRENT_DATE, 'YYYY_MM')),
         'current-month audit_log partition must exist';

  RAISE NOTICE 'partition maintenance hardening assertions passed (born-gated creators + dual-parent maintenance + empty default).';
END$$;
ROLLBACK;

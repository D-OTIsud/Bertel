-- test_partition_maintenance_hardening.sql
-- Proves migration_partition_maintenance_hardening.sql (16e, §146): both partition creators are
-- born-gated (RLS + wrapped policy at creation), object_version is cron-maintained via
-- audit.maintain_partitions(), no partition of either parent is bare, and the default partition
-- holds no stranded rows.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_month TIMESTAMPTZ := date_trunc('month', CURRENT_DATE) + INTERVAL '5 months'; -- beyond the 3-month horizon
  v_ov_part TEXT := 'object_version_' || to_char(date_trunc('month', CURRENT_DATE) + INTERVAL '5 months', 'YYYY_MM');
  v_au_part TEXT := 'audit_log_'      || to_char(date_trunc('month', CURRENT_DATE) + INTERVAL '5 months', 'YYYY_MM');
  v_txt TEXT;
BEGIN
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

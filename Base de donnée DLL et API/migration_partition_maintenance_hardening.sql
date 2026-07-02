-- migration_partition_maintenance_hardening.sql
-- Partitions born-gated + object_version maintenance (2026-07-02). Manifest 16e. Decision log §146.
--
-- SYMPTOM (DB structure audit 2026-07-02, docs/db-structure-audit-2026-07-02.md P1a):
--   public.object_version monthly partitions stop at 2026_05 — NOTHING creates new months
--   (audit.maintain_partitions() only handles audit.audit_log), so since 2026-06-01 every version
--   row lands in object_version_default (951 live rows), silently defeating the partition scheme.
-- ROOT CAUSE (two-part):
--   1. public.create_object_version_monthly_partition() exists (schema_unified.sql) but was never
--      wired into the daily cron (`maintain-partitions` → audit.maintain_partitions()).
--   2. BOTH partition creators build BARE partitions: no ENABLE ROW LEVEL SECURITY, no policy —
--      partitions do NOT inherit RLS from the parent; the rls_policies.sql per-partition loops only
--      gate partitions existing at apply time. Live proof: audit.audit_log_2026_08/_09 (cron-created
--      ahead) have relrowsecurity=false and 0 policies. For audit this is defense-in-depth only
--      (schema not PostgREST-exposed, no anon/authenticated grants); for public.object_version a
--      future bare partition WOULD be anon-readable via direct PostgREST (public schema is exposed
--      and granted — full draft snapshots). Closed here before it can materialize.
-- FIX:
--   1. Both creators become born-gated + self-repairing: create-if-missing, then ALWAYS re-assert
--      ENABLE RLS + the parent's policy set (§39 wrapped form). audit's read policy includes the
--      api.is_platform_superuser() arm only when that function exists (fresh-order: schema_unified
--      runs BEFORE rls_policies.sql which defines it; the rls_policies partition loop upgrades the
--      early partitions afterwards).
--   2. public.ensure_object_version_partitions(months_ahead) — mirror of audit.ensure_future_partitions.
--   3. audit.maintain_partitions() maintains BOTH parents (cron `maintain-partitions`, daily 02:00).
--      Deliberately NO drop_old for object_version: versions are product data (restore §98/14r),
--      not logs — retention stays audit-only (12 months).
--   4. Repair pass: re-gate every EXISTING partition of both parents (fixes audit 08/09; converts
--      the §39-deferred raw-auth partition policies to the wrapped form).
--   5. Re-home: move the stranded object_version_default rows into real monthly partitions
--      (DETACH default → create months present in the data → INSERT → TRUNCATE → re-ATTACH).
--      trg_audit_object_version is AFTER UPDATE OR DELETE only ⇒ the INSERT re-home fires nothing.
-- IDEMPOTENT: CREATE OR REPLACE + create-if-missing + re-assert gating + re-home no-ops when
--   default is empty. Fresh build: schema_unified's inline creator calls now produce gated
--   partitions; this file is a converging no-op on top. Folded into schema_unified.sql.
-- REVERSIBLE: previous creator/maintainer bodies in git history (schema_unified.sql); re-homed rows
--   are plain row moves within the same logical table.

BEGIN;

-- ============================================================================
-- 1) object_version partition creator — born-gated + self-repairing
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_object_version_monthly_partition(partition_date TIMESTAMPTZ)
RETURNS TEXT
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE partition_name TEXT; start_date TIMESTAMPTZ; end_date TIMESTAMPTZ; v_created BOOLEAN := FALSE;
BEGIN
  partition_name := 'object_version_' || to_char(partition_date, 'YYYY_MM');
  start_date := date_trunc('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=partition_name) THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.object_version FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
    v_created := TRUE;
  END IF;
  -- Born gated (§146): partitions do NOT inherit RLS/policies from the parent. Always re-assert,
  -- so the creator also repairs a pre-existing bare partition. Policy = parent's, §39 wrapped form.
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
  EXECUTE format('DROP POLICY IF EXISTS "admin_object_version" ON public.%I', partition_name);
  EXECUTE format(
    'CREATE POLICY "admin_object_version" ON public.%I FOR ALL USING ((select auth.role()) IN (''service_role'',''admin''))',
    partition_name
  );
  RETURN CASE WHEN v_created THEN 'Created partition: ' ELSE 'Ensured partition: ' END || partition_name;
END; $$ LANGUAGE plpgsql;

-- Q1a grant shape (migration_revoke_ops_grants_anon.sql): ops fn, never anon
REVOKE EXECUTE ON FUNCTION public.create_object_version_monthly_partition(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_object_version_monthly_partition(timestamptz) TO authenticated, service_role;

-- ============================================================================
-- 2) ensure_object_version_partitions — mirror of audit.ensure_future_partitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ensure_object_version_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS TEXT
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE i INTEGER; result_text TEXT := ''; partition_date TIMESTAMPTZ;
BEGIN
  FOR i IN 0..months_ahead-1 LOOP
    partition_date := date_trunc('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
    result_text := result_text || public.create_object_version_monthly_partition(partition_date) || E'\n';
  END LOOP;
  RETURN result_text;
END; $$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.ensure_object_version_partitions(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_object_version_partitions(integer) TO service_role;

-- ============================================================================
-- 3) audit partition creator — same hardening (indexes kept; superuser arm if available)
-- ============================================================================
CREATE OR REPLACE FUNCTION audit.create_monthly_partition(partition_date TIMESTAMPTZ)
RETURNS TEXT
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE partition_name TEXT; start_date TIMESTAMPTZ; end_date TIMESTAMPTZ; v_created BOOLEAN := FALSE; v_super_arm TEXT;
BEGIN
  partition_name := audit.get_month_partition_name(partition_date);
  start_date := date_trunc('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='audit' AND tablename=partition_name) THEN
    EXECUTE format('CREATE TABLE audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)', partition_name, start_date, end_date);
    v_created := TRUE;
  END IF;
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_table_name ON audit.%I (table_name)', partition_name, partition_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_changed_at ON audit.%I (changed_at)', partition_name, partition_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_operation ON audit.%I (operation)', partition_name, partition_name);
  -- Born gated (§146). Superuser arm only when api.is_platform_superuser exists (fresh-order:
  -- schema_unified's inline calls run before rls_policies.sql defines it; its partition loop
  -- re-creates the policy WITH the arm on those early partitions).
  v_super_arm := CASE WHEN to_regproc('api.is_platform_superuser') IS NOT NULL
                      THEN ' OR api.is_platform_superuser()' ELSE '' END;
  EXECUTE format('ALTER TABLE audit.%I ENABLE ROW LEVEL SECURITY', partition_name);
  EXECUTE format('DROP POLICY IF EXISTS "Lecture audit (admin/service_role)" ON audit.%I', partition_name);
  EXECUTE format(
    'CREATE POLICY "Lecture audit (admin/service_role)" ON audit.%I FOR SELECT USING ((select auth.role()) IN (''service_role'',''admin'')%s)',
    partition_name, v_super_arm
  );
  EXECUTE format('DROP POLICY IF EXISTS "Insertion via triggers" ON audit.%I', partition_name);
  EXECUTE format(
    'CREATE POLICY "Insertion via triggers" ON audit.%I FOR INSERT TO service_role, postgres WITH CHECK (true)',
    partition_name
  );
  RETURN CASE WHEN v_created THEN 'Created partition ' ELSE 'Ensured partition ' END || partition_name;
END; $$ LANGUAGE plpgsql;

-- ============================================================================
-- 4) maintain_partitions — maintains BOTH parents (cron `maintain-partitions`, daily)
-- ============================================================================
CREATE OR REPLACE FUNCTION audit.maintain_partitions()
RETURNS TEXT
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE result_text TEXT := '';
BEGIN
  result_text := result_text || '=== Creating future partitions (audit.audit_log) ===' || E'\n' || audit.ensure_future_partitions(3) || E'\n';
  result_text := result_text || '=== Ensuring object_version partitions ===' || E'\n' || public.ensure_object_version_partitions(3) || E'\n';
  -- Retention is audit-only: object_version rows are product data (version restore §98/14r), never dropped here.
  result_text := result_text || '=== Cleaning old partitions (audit) ===' || E'\n' || audit.drop_old_partitions(12) || E'\n';
  EXECUTE 'ANALYZE audit.audit_log';
  EXECUTE 'ANALYZE public.object_version';
  result_text := result_text || 'Updated statistics for audit.audit_log + public.object_version' || E'\n';
  RETURN result_text;
END; $$ LANGUAGE plpgsql;

-- ============================================================================
-- 5) Repair pass — re-gate every EXISTING partition of both parents
--    (fixes the live bare audit_log_2026_08/_09; converts raw-auth partition policies to wrapped)
-- ============================================================================
DO $$
DECLARE v_part RECORD; v_super_arm TEXT;
BEGIN
  FOR v_part IN
    SELECT c.relname FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pn ON pn.oid = p.relnamespace
    WHERE pn.nspname = 'public' AND p.relname = 'object_version'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_part.relname);
    EXECUTE format('DROP POLICY IF EXISTS "admin_object_version" ON public.%I', v_part.relname);
    EXECUTE format(
      'CREATE POLICY "admin_object_version" ON public.%I FOR ALL USING ((select auth.role()) IN (''service_role'',''admin''))',
      v_part.relname
    );
  END LOOP;

  v_super_arm := CASE WHEN to_regproc('api.is_platform_superuser') IS NOT NULL
                      THEN ' OR api.is_platform_superuser()' ELSE '' END;
  FOR v_part IN
    SELECT c.relname FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pn ON pn.oid = p.relnamespace
    WHERE pn.nspname = 'audit' AND p.relname = 'audit_log'
  LOOP
    EXECUTE format('ALTER TABLE audit.%I ENABLE ROW LEVEL SECURITY', v_part.relname);
    EXECUTE format('DROP POLICY IF EXISTS "Lecture audit (admin/service_role)" ON audit.%I', v_part.relname);
    EXECUTE format(
      'CREATE POLICY "Lecture audit (admin/service_role)" ON audit.%I FOR SELECT USING ((select auth.role()) IN (''service_role'',''admin'')%s)',
      v_part.relname, v_super_arm
    );
    EXECUTE format('DROP POLICY IF EXISTS "Insertion via triggers" ON audit.%I', v_part.relname);
    EXECUTE format(
      'CREATE POLICY "Insertion via triggers" ON audit.%I FOR INSERT TO service_role, postgres WITH CHECK (true)',
      v_part.relname
    );
  END LOOP;
END $$;

-- ============================================================================
-- 6) Re-home the stranded default rows into real monthly partitions
-- ============================================================================
DO $$
DECLARE r RECORD; v_n BIGINT; v_left BIGINT;
BEGIN
  SELECT count(*) INTO v_n FROM public.object_version_default;
  IF v_n > 0 THEN
    ALTER TABLE public.object_version DETACH PARTITION public.object_version_default;
    -- one partition per month actually present in the stranded rows
    FOR r IN SELECT DISTINCT date_trunc('month', created_at) AS m FROM public.object_version_default LOOP
      PERFORM public.create_object_version_monthly_partition(r.m);
    END LOOP;
    INSERT INTO public.object_version SELECT * FROM public.object_version_default;
    TRUNCATE public.object_version_default;
    ALTER TABLE public.object_version ATTACH PARTITION public.object_version_default DEFAULT;
    RAISE NOTICE 're-homed % object_version rows from the default partition into monthly partitions', v_n;
  END IF;
  SELECT count(*) INTO v_left FROM public.object_version_default;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'object_version_default still holds % rows after re-home', v_left;
  END IF;
END $$;

-- ============================================================================
-- 7) Ensure the horizon now (don't wait for tonight's cron)
-- ============================================================================
SELECT public.ensure_object_version_partitions(3);
SELECT audit.ensure_future_partitions(3);

COMMIT;

-- No `NOTIFY pgrst`: internal maintenance functions + RLS on partitions; no exposed-signature change.

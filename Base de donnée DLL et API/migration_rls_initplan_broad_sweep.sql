-- migration_rls_initplan_broad_sweep.sql
-- RLS auth-initplan BROAD sweep — catalog-driven remainder (2026-07-02). Manifest 16h. Decision log §146.
--
-- SYMPTOM (DB structure audit 2026-07-02, P2b; advisor `auth_rls_initplan` 129 findings): the §39
--   sweep (migration_rls_initplan_sweep.sql, manifest 8k) fixed the 18 object-family policies and
--   documented the remainder as deferred (ref_*/ref_code_* partitions, user_org_*/permissions,
--   app_user_profile, object_version + audit partitions, promotion/publication, i18n, org_config).
--   Since then, NEW modules regressed on the CLAUDE.md §39 invariant ("new policies MUST use
--   `(select auth.x())`"): actor / actor_channel / actor_consent (CRM §61/§63), pending_change
--   (moderation §120), incident_report, app_user_profile.
-- FIX: catalog-driven, not a hand-written list — scan pg_policies (schemas public + audit) for
--   USING/WITH CHECK expressions carrying an UNWRAPPED auth.uid()/auth.role()/auth.jwt()/auth.email()
--   call and ALTER POLICY each one with the wrapped form. Wrapping is Supabase's documented,
--   SEMANTICS-IDENTICAL remedy (a scalar subquery returns the same value; Postgres hoists it to one
--   InitPlan per query instead of one call per scanned row). Already-wrapped occurrences are
--   protected via a sentinel on the deparsed form `( SELECT auth.`; live carries 0 policies using
--   raw current_setting() (verified 2026-07-02), so auth.* is the whole class.
--   Being catalog-driven, a re-run also converges any policy a later migration re-created raw —
--   the permanent guard is tests/test_rls_initplan_broad_sweep.sql (CI fresh-apply gate asserts
--   ZERO unwrapped policies database-wide at the end of the manifest).
-- IDEMPOTENT: re-run finds nothing unwrapped and rewrites nothing. Self-asserting: raises if any
--   unwrapped expression survives the sweep.
-- REVERSIBLE: ALTER POLICY back to the bare form (git history of the creating files).

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_qual  TEXT;
  v_check TEXT;
  v_sql   TEXT;
  v_n     INT := 0;
  v_left  INT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public','audit')
      AND (replace(coalesce(qual,''),       '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)'
        OR replace(coalesce(with_check,''), '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)')
  LOOP
    -- wrap qual: protect already-wrapped deparse form, wrap the bare calls, restore
    v_qual := r.qual;
    IF v_qual IS NOT NULL THEN
      v_qual := replace(v_qual, '( SELECT auth.', chr(1));
      v_qual := regexp_replace(v_qual, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g');
      v_qual := replace(v_qual, chr(1), '( SELECT auth.');
    END IF;
    v_check := r.with_check;
    IF v_check IS NOT NULL THEN
      v_check := replace(v_check, '( SELECT auth.', chr(1));
      v_check := regexp_replace(v_check, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g');
      v_check := replace(v_check, chr(1), '( SELECT auth.');
    END IF;

    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF v_qual IS NOT NULL AND v_qual IS DISTINCT FROM r.qual THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL AND v_check IS DISTINCT FROM r.with_check THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'initplan broad sweep: % policies rewritten to the wrapped form', v_n;

  -- self-assert: the class must be EMPTY after the sweep
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname IN ('public','audit')
    AND (replace(coalesce(qual,''),       '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)'
      OR replace(coalesce(with_check,''), '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'initplan broad sweep incomplete: % policies still carry unwrapped auth calls', v_left;
  END IF;
END $$;

COMMIT;

-- No `NOTIFY pgrst`: RLS policy changes do not affect the PostgREST schema cache.

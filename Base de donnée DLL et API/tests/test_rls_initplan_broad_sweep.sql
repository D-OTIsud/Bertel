-- test_rls_initplan_broad_sweep.sql
-- Proves migration_rls_initplan_broad_sweep.sql (16h, §146) AND acts as the permanent CI guard for
-- the CLAUDE.md §39 invariant: NO RLS policy in public/audit may call
-- auth.uid()/auth.role()/auth.jwt()/auth.email() unwrapped (per-row re-evaluation). Runs at the end
-- of the fresh-apply manifest, so ANY migration that creates a raw-auth policy fails this gate.
-- Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_offenders TEXT;
BEGIN
  SELECT string_agg(schemaname || '.' || tablename || ' / ' || policyname, E'\n  ' ORDER BY schemaname, tablename, policyname)
  INTO v_offenders
  FROM pg_policies
  WHERE schemaname IN ('public','audit')
    AND (replace(coalesce(qual,''),       '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)'
      OR replace(coalesce(with_check,''), '( SELECT auth.', '') ~ 'auth\.(uid|role|jwt|email)\(\)');

  ASSERT v_offenders IS NULL,
         format(E'policies with UNWRAPPED auth.*() calls (CLAUDE.md §39 — use (select auth.x())):\n  %s', v_offenders);

  -- sanity: the sweep must not have destroyed policies — the object family still carries its gates
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='object') >= 5,
         'object table lost policies — sweep must only rewrite expressions';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object'
                 AND policyname='public_objects_published'),
         'public_objects_published missing on object';

  RAISE NOTICE 'initplan broad-sweep guard passed (zero unwrapped auth.*() policies in public/audit).';
END$$;
ROLLBACK;

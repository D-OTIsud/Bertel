-- migration_object_act_rls.sql
-- Close the object_act anon read/write leak (2026-06-04 live-DB audit;
-- OBJECT_DATA_DICTIONARY.md Appendix F + lot1_mapping_decisions.md §27).
--
-- object_act (the ACT type-extension, 1:1 with object) shipped with RLS DISABLED and ZERO policies
-- while anon/authenticated hold full SELECT/INSERT/UPDATE/DELETE table grants, so ANY role could read
-- and write it directly through PostgREST, bypassing the parent object's publication gate. It is the
-- ONLY object-child table the P0.3 read-gate (migration_rls_read_gate_p03.sql) did not cover, because
-- it never carried an RLS policy to convert. This brings it to the exact same gate as its siblings:
--   read  -> api.can_read_object(object_id)                 (parent published OR api.can_read_extended)
--   write -> api.user_can_write_object_canonical(object_id) (owner/superuser OR publisher + edit_canonical_when_publisher)
--
-- The app is UNAFFECTED. No SECURITY DEFINER RPC reads object_act; the full-page editor reads and
-- upserts it as `authenticated` via direct PostgREST (bertel-tourism-ui/src/services/object-workspace.ts
-- `.from('object_act')`), and an editor holds can_read_extended + user_can_write_object_canonical on
-- its own objects — the same path P0.3 already proved on 40 sibling child tables. Only direct
-- anon / other-ORG PostgREST access to object_act is now gated. That is the fix.
--
-- PREREQUISITES: schema_unified.sql (object_act table); rls_policies.sql + migration_permission_write_paths.sql
--   (define api.user_can_write_object_canonical); migration_rls_read_gate_p03.sql (defines api.can_read_object).
--   APPLY AFTER migration_rls_read_gate_p03.sql — slotted at step 8g in the manifest (ci_fresh_apply.sql /
--   docs/SQL_ROLLOUT_RUNBOOK.md).
-- IDEMPOTENT: ENABLE RLS is a no-op when already on; DROP POLICY IF EXISTS + CREATE; GRANT is idempotent.
-- REVERSIBLE: DROP POLICY canonical_write_object_act, read_object_act ON public.object_act;
--             ALTER TABLE public.object_act DISABLE ROW LEVEL SECURITY;
--             (the anon/authenticated EXECUTE grant is shared with P0.3 — leave it.)

BEGIN;

-- 1) Turn the gate on. anon/authenticated keep their table grants; RLS now filters which rows they see/write.
ALTER TABLE public.object_act ENABLE ROW LEVEL SECURITY;

-- 2) P0.3 gotcha: a permissive FOR ALL write policy ALSO applies to SELECT, so every role that may read
--    object_act (incl. anon) must be able to EXECUTE the write predicate, or the SELECT fails with
--    "permission denied for function". The function returns FALSE for anon (no uid/actor/membership), so
--    granting EXECUTE exposes no extra row (the policy OR collapses to api.can_read_object) and is required
--    for anon direct reads to evaluate instead of erroring. Already granted by migration_rls_read_gate_p03.sql;
--    re-asserted here (idempotently) so this migration is self-contained regardless of apply order.
GRANT EXECUTE ON FUNCTION api.user_can_write_object_canonical(text) TO anon, authenticated;

-- 3) Read gate: parent published -> anyone (incl. anon); draft/hidden/archived -> only api.can_read_extended.
DROP POLICY IF EXISTS "read_object_act" ON public.object_act;
CREATE POLICY "read_object_act" ON public.object_act
  FOR SELECT USING (api.can_read_object(object_id));

-- 4) Write gate: canonical writer only. FOR ALL with an explicit WITH CHECK so INSERT/UPSERT (the editor's
--    `.from('object_act').upsert(...)` path) is gated identically to UPDATE/DELETE.
DROP POLICY IF EXISTS "canonical_write_object_act" ON public.object_act;
CREATE POLICY "canonical_write_object_act" ON public.object_act
  FOR ALL
  USING      (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));

COMMIT;

-- migration_object_fma_write_policy.sql
-- §47 — object_fma write policies (gap: RLS enabled since rls_policies.sql but ONLY SELECT
-- policies existed -- pub_fma_published / ext_fma_org_actor -- so the editor's direct PostgREST
-- upsert on object_fma was denied for every non-service role; the analogous object_act gap was
-- fixed by migration_object_act_rls.sql / 8g).
-- Written per-command (canonical_ins/upd/del) per the §47 convergence standard: write predicates
-- never pollute SELECT, so no P0.3 EXECUTE grant is required (anon already holds EXECUTE on the
-- predicate from P0.3, harmless and unrelated to SELECT here).
-- PREREQUISITES: rls_policies.sql (step 6), migration_permission_write_paths.sql (8b --
--   api.user_can_write_object_canonical). APPLY AFTER 8m -- manifest step 8n.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: DROP POLICY canonical_ins_object_fma, canonical_upd_object_fma,
--   canonical_del_object_fma ON object_fma;
BEGIN;

DROP POLICY IF EXISTS "canonical_ins_object_fma" ON object_fma;
CREATE POLICY "canonical_ins_object_fma" ON object_fma
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "canonical_upd_object_fma" ON object_fma;
CREATE POLICY "canonical_upd_object_fma" ON object_fma
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "canonical_del_object_fma" ON object_fma;
CREATE POLICY "canonical_del_object_fma" ON object_fma
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

COMMIT;

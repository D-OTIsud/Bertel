-- migration_rls_ref_and_bak_cleanup.sql
-- Housekeeping from the 2026-06-04 live-DB audit (OBJECT_DATA_DICTIONARY.md Appendix F +
-- lot1_mapping_decisions.md §27). Two unrelated, low-risk cleanups kept OUT of
-- migration_object_act_rls.sql so the security fix stays surgical and trivially reversible.
--
--  A) Enable RLS on 3 ref_* tables created by migration_sustainability_v5.sql that shipped with RLS OFF
--     (ref_classification_equivalent_action, ref_classification_equivalent_group,
--     ref_sustainability_action_group). Reads are public like every other ref_* table, but with RLS off
--     the anon/authenticated INSERT/UPDATE/DELETE grants are UNGUARDED writes. Bring them to the same
--     pub-read / admin-write pair their siblings already use (ref_amenity, ref_sustainability_action, …
--     in rls_policies.sql). The public-read policy stays USING(true), so anon SELECT still short-circuits
--     the OR and never needs EXECUTE on api.is_platform_superuser() (no P0.3 gotcha here).
--
--  B) Drop 5 leftover backup tables (`*_bak_20260519_082607z`, the opening_* family) left in `public`
--     by a 2026-05-19 refactor. Verified on live 2026-06-04: RLS off, 0 inbound FKs, 0 view deps —
--     pure schema pollution. No-op on a fresh DB (they are never created there); DROP IF EXISTS keeps
--     the manifest clean and the CI fresh-apply gate green.
--
-- PREREQUISITES: migration_sustainability_v5.sql (the 3 ref tables); rls_policies.sql (api.is_platform_superuser).
--   APPLY AFTER rls_policies.sql — slotted at step 8h in the manifest (after migration_object_act_rls.sql).
-- IDEMPOTENT: ENABLE RLS no-op when already on; DROP POLICY IF EXISTS + CREATE; DROP TABLE IF EXISTS.
-- REVERSIBLE: the RLS enable (DISABLE ROW LEVEL SECURITY + DROP POLICY). The table DROP is NOT reversible
--   (the 2026-05-19 backups are discarded — that is the intent).

BEGIN;

-- ── A) ref_* tables: public read + admin/superuser write (mirrors the ref_* pair in rls_policies.sql) ──
ALTER TABLE public.ref_classification_equivalent_action ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_classification_equivalent_action_read" ON public.ref_classification_equivalent_action;
CREATE POLICY "pub_ref_classification_equivalent_action_read" ON public.ref_classification_equivalent_action
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_classification_equivalent_action" ON public.ref_classification_equivalent_action;
CREATE POLICY "admin_write_ref_classification_equivalent_action" ON public.ref_classification_equivalent_action
  FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'admin' OR api.is_platform_superuser());

ALTER TABLE public.ref_classification_equivalent_group ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_classification_equivalent_group_read" ON public.ref_classification_equivalent_group;
CREATE POLICY "pub_ref_classification_equivalent_group_read" ON public.ref_classification_equivalent_group
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_classification_equivalent_group" ON public.ref_classification_equivalent_group;
CREATE POLICY "admin_write_ref_classification_equivalent_group" ON public.ref_classification_equivalent_group
  FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'admin' OR api.is_platform_superuser());

ALTER TABLE public.ref_sustainability_action_group ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_sustainability_action_group_read" ON public.ref_sustainability_action_group;
CREATE POLICY "pub_ref_sustainability_action_group_read" ON public.ref_sustainability_action_group
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_sustainability_action_group" ON public.ref_sustainability_action_group;
CREATE POLICY "admin_write_ref_sustainability_action_group" ON public.ref_sustainability_action_group
  FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'admin' OR api.is_platform_superuser());

-- ── B) Drop leftover backup tables (no-op on a fresh DB; verified 0 FK / 0 view deps on live 2026-06-04) ──
DROP TABLE IF EXISTS public.opening_period_bak_20260519_082607z;
DROP TABLE IF EXISTS public.opening_schedule_bak_20260519_082607z;
DROP TABLE IF EXISTS public.opening_time_frame_bak_20260519_082607z;
DROP TABLE IF EXISTS public.opening_time_period_bak_20260519_082607z;
DROP TABLE IF EXISTS public.opening_time_period_weekday_bak_20260519_082607z;

COMMIT;

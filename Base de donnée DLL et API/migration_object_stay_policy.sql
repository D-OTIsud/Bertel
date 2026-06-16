-- =====================================================================
-- migration_object_stay_policy.sql  (manifest step 14k)
-- §85 — Accommodation stay policy (heure d'arrivée / heure de départ).
--
-- For lodging (HEB), opening hours are the wrong frame for whole-rentals: a gîte has a
-- check-in window + a check-out deadline, not weekly desk hours. This adds a per-object
-- stay policy, a direct sibling of object_pet_policy / object_group_policy (surfaced in §06).
-- Weekly opening hours (§14) are KEPT for everyone (some places still refuse arrivals on
-- certain days). Mirrors object_pet_policy exactly: 1 row/object, §38 read gate + per-command
-- canonical write, updated_at + audit triggers, house DML grants (RLS-gated).
-- Read + write go through direct PostgREST (the §40/§41 child-table precedent), so NO change
-- to save_object_commercial or get_object_resource. Additive, idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.object_stay_policy (
  object_id       text PRIMARY KEY REFERENCES public.object(id) ON DELETE CASCADE,
  check_in_from   time,
  check_in_until  time,
  check_out_until time,
  conditions      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.object_stay_policy ENABLE ROW LEVEL SECURITY;

-- Read gate: §38 split form (published parent OR caller's extended scope) — mirror object_pet_policy.
DROP POLICY IF EXISTS "read_object_stay_policy" ON public.object_stay_policy;
CREATE POLICY "read_object_stay_policy" ON public.object_stay_policy
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM public.object o WHERE o.id = object_stay_policy.object_id AND o.status = 'published'))
    OR object_id IN (SELECT api.current_user_extended_object_ids())
  );

-- Per-command canonical write family (NEVER FOR ALL — §47).
DROP POLICY IF EXISTS "canonical_ins_object_stay_policy" ON public.object_stay_policy;
CREATE POLICY "canonical_ins_object_stay_policy" ON public.object_stay_policy
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_stay_policy" ON public.object_stay_policy;
CREATE POLICY "canonical_upd_object_stay_policy" ON public.object_stay_policy
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_stay_policy" ON public.object_stay_policy;
CREATE POLICY "canonical_del_object_stay_policy" ON public.object_stay_policy
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- House DML grants (RLS enforces; mirror object_pet_policy).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_stay_policy TO anon, authenticated, service_role;

-- updated_at + audit triggers (mirror object_pet_policy).
DROP TRIGGER IF EXISTS update_object_stay_policy_updated_at ON public.object_stay_policy;
CREATE TRIGGER update_object_stay_policy_updated_at
  BEFORE UPDATE ON public.object_stay_policy
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_audit_object_stay_policy ON public.object_stay_policy;
CREATE TRIGGER trg_audit_object_stay_policy
  AFTER DELETE OR UPDATE ON public.object_stay_policy
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes();

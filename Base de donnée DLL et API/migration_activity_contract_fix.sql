-- migration_activity_contract_fix.sql
-- Surface fix: object_act.equipment_provided stays boolean; optional detail text when true.
-- get_object_resource emits activity via to_jsonb(object_act) — the new column is included automatically.
-- IDEMPOTENT. REVERSIBLE: DROP CONSTRAINT + DROP COLUMN equipment_provided_details.

BEGIN;

ALTER TABLE IF EXISTS public.object_act
  ADD COLUMN IF NOT EXISTS equipment_provided_details TEXT;

ALTER TABLE IF EXISTS public.object_act
  DROP CONSTRAINT IF EXISTS chk_object_act_equipment_details;

ALTER TABLE IF EXISTS public.object_act
  ADD CONSTRAINT chk_object_act_equipment_details
  CHECK (equipment_provided_details IS NULL OR equipment_provided);

COMMIT;

-- migration_activity_contract_fix.sql
-- Surface fix: object_act.equipment_provided stays boolean; optional detail text when true.
-- Historical fresh-apply step. A served existing database must instead use
-- 20261103065333_partner_portal_activity_api_contract.sql: it adds this column and
-- excludes its key from the shared JSON reader in ONE transaction, preserving the API.
-- Keep additive data on rollback; do not drop this column to revert an application release.

BEGIN;

ALTER TABLE IF EXISTS public.object_act
  ADD COLUMN IF NOT EXISTS equipment_provided_details TEXT;

ALTER TABLE IF EXISTS public.object_act
  DROP CONSTRAINT IF EXISTS chk_object_act_equipment_details;

ALTER TABLE IF EXISTS public.object_act
  ADD CONSTRAINT chk_object_act_equipment_details
  CHECK (equipment_provided_details IS NULL OR equipment_provided);

COMMIT;

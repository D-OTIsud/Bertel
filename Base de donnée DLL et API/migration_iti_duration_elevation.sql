-- migration_iti_duration_elevation.sql
-- Greenfield ITI model change (object_iti has 0 rows in prod — verified 2026-06-04):
--   * duration_hours DECIMAL(4,2)  ->  duration_min INTEGER  (minutes)
--   * add elevation_loss INTEGER (descent, metres) alongside the existing elevation_gain (ascent)
--
-- WHY: the editor already authors durations in minutes and only divided by 60 to fit the old hours
-- column (a lossy round-trip); storing minutes removes that. The single elevation_gain column could
-- not represent descent — elevation_loss adds it. Filtering keeps its PUBLIC contract in hours
-- (duration_min_h / duration_max_h) and converts to minutes internally (see api_views_functions.sql).
--
-- Because object_iti has 0 rows, this is a destructive-but-safe retype (no data to convert): drop + add.
-- IDEMPOTENT: DROP COLUMN IF EXISTS + ADD COLUMN IF NOT EXISTS — a no-op on a DB already at the new shape
--   (e.g. a fresh build from schema_unified.sql, which now ships duration_min + elevation_loss directly).
-- TRANSACTION-WRAPPED. REVERSIBLE: ALTER TABLE public.object_iti
--   DROP COLUMN duration_min, DROP COLUMN elevation_loss, ADD COLUMN duration_hours DECIMAL(4,2);
--
-- PREREQUISITES: schema_unified.sql (object_iti). APPLY BEFORE api_views_functions.sql — its
--   get_object_resource / get_filtered_object_ids / get_itinerary_track_geojson reference duration_min.
--   Slotted at step 4b in the manifest (ci_fresh_apply.sql / docs/SQL_ROLLOUT_RUNBOOK.md).
-- ⚠️ DEPLOY NOTE: BREAKING column change. Apply to live IN LOCKSTEP with the frontend build that reads
--   duration_min / elevation_loss (bertel-tourism-ui/src/services/object-workspace.ts). Applying to live
--   before the frontend ships breaks the editor's ITI read (it would still select duration_hours).

BEGIN;
ALTER TABLE public.object_iti DROP COLUMN IF EXISTS duration_hours;
ALTER TABLE public.object_iti ADD COLUMN IF NOT EXISTS duration_min integer
  CONSTRAINT chk_object_iti_duration_min CHECK (duration_min IS NULL OR duration_min > 0);
ALTER TABLE public.object_iti ADD COLUMN IF NOT EXISTS elevation_loss integer;
COMMIT;

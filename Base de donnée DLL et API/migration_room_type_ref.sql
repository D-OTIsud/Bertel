-- migration_room_type_ref.sql
-- Adds object_room_type.room_type_id, a nullable FK to ref_code_room_type, so the
-- object editor can offer a DB-backed room-type selector. Mirrors the existing
-- object_room_type.view_type_id -> ref_code_view_type pattern on the same table.
--
-- PREREQUISITE: schema_unified.sql applied (object_room_type, ref_code_room_type exist).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
-- REVERSIBLE: ALTER TABLE object_room_type DROP COLUMN IF EXISTS room_type_id;
-- BACKFILL: none — existing rows keep room_type_id NULL; the free `name` is retained.

BEGIN;

ALTER TABLE IF EXISTS object_room_type
  ADD COLUMN IF NOT EXISTS room_type_id UUID REFERENCES ref_code_room_type(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_object_room_type_room_type_id
  ON object_room_type(room_type_id);

COMMIT;

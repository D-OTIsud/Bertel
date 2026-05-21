-- migration_tag_link_position.sql
-- Adds tag_link.position so per-object tag display order survives reload (drag-and-drop
-- ordering in the editor §09). tag_link previously had no order column.
--
-- PREREQUISITE: schema_unified.sql applied (tag_link exists).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
-- REVERSIBLE: ALTER TABLE tag_link DROP COLUMN IF EXISTS position;
-- BACKFILL: existing rows default to 0; order normalises on the next per-object tag save.

BEGIN;

ALTER TABLE IF EXISTS tag_link
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

COMMIT;

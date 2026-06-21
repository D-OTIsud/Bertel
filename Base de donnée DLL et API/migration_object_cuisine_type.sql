-- migration_object_cuisine_type.sql
-- §06 Restaurant — Phase 1 : « cuisines proposées » devient un attribut NIVEAU-OBJET.
-- Manifest step 14t. Idempotent. Folded into schema_unified.sql (table/index) + rls_policies.sql (RLS/grants).
--
-- WHY: cuisine was a property of object_menu_item (dish-level), aggregated up. A restaurant could not
-- declare its cuisine without building a full menu, and the editor field silently dropped the selection
-- (write-trap, 100% of restaurants — 0 menu live). This table makes cuisine a first-class restaurant
-- descriptor (mirrors object_amenity / object_environment_tag), decoupled from menus, with `position`
-- carrying « la 1ère = cuisine principale ». 0 data to migrate (0 cuisine links live).
--
-- RLS: §38 split read gate (published OR extended) — NEVER USING(true). Per-command canonical write
-- family (NEVER FOR ALL). Outer column object_cuisine_type.object_id is qualified in the read subquery
-- (silent-rebinding gotcha). anon needs EXECUTE on api.user_can_write_object_canonical (granted globally).

CREATE TABLE IF NOT EXISTS object_cuisine_type (
  object_id       TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  cuisine_type_id UUID NOT NULL REFERENCES ref_code_cuisine_type(id) ON DELETE CASCADE,
  position        INT  NOT NULL DEFAULT 1,   -- 1 = cuisine principale (ordre de sélection)
  PRIMARY KEY (object_id, cuisine_type_id)
);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_object ON object_cuisine_type(object_id);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_type   ON object_cuisine_type(cuisine_type_id);

ALTER TABLE object_cuisine_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_object_cuisine_type ON object_cuisine_type;
CREATE POLICY read_object_cuisine_type ON object_cuisine_type FOR SELECT USING (
  (EXISTS (SELECT 1 FROM object o WHERE o.id = object_cuisine_type.object_id AND o.status = 'published'))
  OR object_cuisine_type.object_id IN (SELECT api.current_user_extended_object_ids())
);

DROP POLICY IF EXISTS canonical_ins_object_cuisine_type ON object_cuisine_type;
CREATE POLICY canonical_ins_object_cuisine_type ON object_cuisine_type FOR INSERT
  WITH CHECK (api.user_can_write_object_canonical(object_cuisine_type.object_id));
DROP POLICY IF EXISTS canonical_upd_object_cuisine_type ON object_cuisine_type;
CREATE POLICY canonical_upd_object_cuisine_type ON object_cuisine_type FOR UPDATE
  USING (api.user_can_write_object_canonical(object_cuisine_type.object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_cuisine_type.object_id));
DROP POLICY IF EXISTS canonical_del_object_cuisine_type ON object_cuisine_type;
CREATE POLICY canonical_del_object_cuisine_type ON object_cuisine_type FOR DELETE
  USING (api.user_can_write_object_canonical(object_cuisine_type.object_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON object_cuisine_type TO authenticated, service_role;
GRANT SELECT ON object_cuisine_type TO anon;

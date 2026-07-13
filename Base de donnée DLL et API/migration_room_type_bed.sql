-- migration_room_type_bed.sql
-- §72 (Phase 2 — room descriptive): structured bed list per room type.
-- Adds: (1) ref_code 'bed_type' FK-target partition (+ uniques + house RLS pair), (2) ~10
-- seeded bed-type codes + en/es i18n, (3) object_room_type_bed (room -> bed type + quantity)
-- with the §38 split read gate + per-command canonical write (outer columns qualified, §55).
-- IDEMPOTENT (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS). Folded into
-- schema_unified.sql / rls_policies.sql / seeds_data.sql => NO-OP on a fresh DB.
-- PREREQUISITE: schema_unified.sql (object_room_type, ref_code) + rls_policies.sql
--   (api.current_user_extended_object_ids, api.user_can_write_object_canonical).

BEGIN;

-- 1. ref_code 'bed_type' FK-target partition (mirror ref_code_room_type: partition + id/code uniques + house RLS pair).
CREATE TABLE IF NOT EXISTS ref_code_bed_type PARTITION OF ref_code FOR VALUES IN ('bed_type');
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_bed_type_id   ON ref_code_bed_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_bed_type_code ON ref_code_bed_type (code);
ALTER TABLE ref_code_bed_type ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_code_read"   ON ref_code_bed_type;
CREATE POLICY "pub_ref_code_read"   ON ref_code_bed_type FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_bed_type;
CREATE POLICY "admin_ref_code_write" ON ref_code_bed_type FOR ALL USING (auth.role() IN ('service_role','admin'));

-- 2. Seed bed_type vocabulary (FR canonical) -- deduped by uq_ref_code_bed_type_code.
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('bed_type','single','Lit simple (90 cm)','Lit une place', 1),
  ('bed_type','double','Lit double (140 cm)','Lit deux places standard', 2),
  ('bed_type','queen','Lit queen (160 cm)','Grand lit deux places', 3),
  ('bed_type','king','Lit king (180 cm)','Très grand lit deux places', 4),
  ('bed_type','twin_singles','Lits jumeaux (2 x 90 cm)','Deux lits simples séparables', 5),
  ('bed_type','bunk','Lits superposés','Lits superposés', 6),
  ('bed_type','sofa_bed','Canapé-lit','Canapé convertible', 7),
  ('bed_type','extra_bed','Lit d''appoint','Lit d''appoint sur demande', 8),
  ('bed_type','baby_cot','Lit bébé / berceau','Lit bébé ou berceau', 9),
  ('bed_type','mezzanine','Lit mezzanine','Lit en mezzanine', 10)
ON CONFLICT DO NOTHING;

WITH bed_type_translations(code, name_en, name_es) AS (
  VALUES
    ('single','Single bed (90 cm)','Cama individual (90 cm)'),
    ('double','Double bed (140 cm)','Cama doble (140 cm)'),
    ('queen','Queen bed (160 cm)','Cama queen (160 cm)'),
    ('king','King bed (180 cm)','Cama king (180 cm)'),
    ('twin_singles','Twin beds (2 x 90 cm)','Camas gemelas (2 x 90 cm)'),
    ('bunk','Bunk beds','Literas'),
    ('sofa_bed','Sofa bed','Sofá cama'),
    ('extra_bed','Extra bed','Cama supletoria'),
    ('baby_cot','Baby cot','Cuna'),
    ('mezzanine','Mezzanine bed','Cama en altillo')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', btt.name_en, 'es', btt.name_es)
FROM bed_type_translations btt
WHERE rc.domain = 'bed_type' AND rc.code = btt.code;

-- 3. object_room_type_bed link table (mirror object_room_type_amenity + quantity/position payload).
CREATE TABLE IF NOT EXISTS object_room_type_bed (
  room_type_id UUID NOT NULL REFERENCES object_room_type(id) ON DELETE CASCADE,
  bed_type_id  UUID NOT NULL REFERENCES ref_code_bed_type(id) ON DELETE CASCADE,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  position     INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_type_id, bed_type_id)
);
CREATE INDEX IF NOT EXISTS idx_room_type_bed_bed_type_id ON object_room_type_bed(bed_type_id);

ALTER TABLE object_room_type_bed ENABLE ROW LEVEL SECURITY;

-- §38 split read gate (mirror read_object_room_type_amenity), including canonical writers so
-- unpublished child rows remain readable during editor saves; outer column table-qualified (§55).
DROP POLICY IF EXISTS "read_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "read_object_room_type_bed" ON object_room_type_bed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM object_room_type rt
      JOIN object o ON o.id = rt.object_id
      WHERE rt.id = object_room_type_bed.room_type_id
        AND rt.is_published IS TRUE AND o.status = 'published')
    OR room_type_id IN (
      SELECT rt.id FROM object_room_type rt
      WHERE rt.object_id IN (SELECT api.current_user_extended_object_ids()))
    OR room_type_id IN (
      SELECT rt.id FROM object_room_type rt
      WHERE api.user_can_write_object_canonical(rt.object_id))
  );

-- Per-command canonical write (mirror canonical_*_object_room_type_amenity): canonical-write OR
-- legacy CREATEDBY leg; outer columns qualified (§55). NEVER FOR ALL on an object-child table.
DROP POLICY IF EXISTS "canonical_ins_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "canonical_ins_object_room_type_bed" ON object_room_type_bed FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "canonical_upd_object_room_type_bed" ON object_room_type_bed FOR UPDATE USING (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid()))) WITH CHECK (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "canonical_del_object_room_type_bed" ON object_room_type_bed FOR DELETE USING (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid())));

COMMIT;

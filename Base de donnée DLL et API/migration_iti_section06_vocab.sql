-- =====================================================================
-- migration_iti_section06_vocab.sql  (Section 06 ITI — vocabulaires manquants)
-- ---------------------------------------------------------------------
-- The Section 06 itinerary editor needs labeled pickers + linkable roles that
-- have no vocabulary today:
--   * ref_iti_assoc_role          -> rôles des « objets liés » (UNSEEDED -> FK 23503)
--   * ref_code domain iti_difficulty   -> libellés de object_iti.difficulty_level (INTEGER 1-5)
--   * ref_code domain iti_open_status  -> libellés de object_iti.open_status (TEXT CHECK)
--   * ref_code domain iti_stage_kind   -> type d'étape (object_iti_stage.extra->>'kind')
--
-- ref_code is PARTITION BY LIST (domain): each new domain needs its own partition
-- + per-partition (id)/(code) uniques + the house RLS pair, then seeds via
-- INSERT…SELECT…WHERE NOT EXISTS (ref_code PK is (id,domain) with a random-id
-- default -> no re-runnable ON CONFLICT target). Recipe mirrors
-- migration_pricing_vocabulary.sql (§13) and schema_unified.sql ref_code_* lines.
-- ref_iti_assoc_role is a normal table with UNIQUE(code) -> ON CONFLICT (code).
-- Idempotent / re-runnable. 0 ITI child rows live ⇒ greenfield.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Rôles « objets liés » (object_iti_associated_object.role_id -> ref_iti_assoc_role)
-- ---------------------------------------------------------------------
INSERT INTO ref_iti_assoc_role (id, code, name, description, position) VALUES
  (gen_random_uuid(), 'sur_le_parcours',   'Sur le parcours',      'Objet situé sur le tracé',                10),
  (gen_random_uuid(), 'a_proximite',       'À proximité',          'Objet à proximité immédiate du tracé',    20),
  (gen_random_uuid(), 'point_de_depart',   'Point de départ',      'Objet servant de point de départ',        30),
  (gen_random_uuid(), 'hebergement_etape', 'Hébergement d''étape', 'Hébergement sur l''itinéraire',           40),
  (gen_random_uuid(), 'restauration',      'Restauration',         'Point de restauration lié au parcours',   50),
  (gen_random_uuid(), 'parking',           'Parking',              'Stationnement conseillé',                 60),
  (gen_random_uuid(), 'point_interet',     'Point d''intérêt',     'Objet d''intérêt lié au parcours',        70),
  (gen_random_uuid(), 'prestataire',       'Prestataire',          'Prestataire associé à l''itinéraire',     80)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Nouvelles partitions ref_code (mirror schema_unified ref_code_* recipe)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_code_iti_difficulty  PARTITION OF ref_code FOR VALUES IN ('iti_difficulty');
CREATE TABLE IF NOT EXISTS ref_code_iti_open_status PARTITION OF ref_code FOR VALUES IN ('iti_open_status');
CREATE TABLE IF NOT EXISTS ref_code_iti_stage_kind  PARTITION OF ref_code FOR VALUES IN ('iti_stage_kind');

-- Per-partition uniques ((id)-only and (code)-only cannot include the partition key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_difficulty_id   ON ref_code_iti_difficulty (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_difficulty_code ON ref_code_iti_difficulty (code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_open_status_id   ON ref_code_iti_open_status (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_open_status_code ON ref_code_iti_open_status (code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_stage_kind_id   ON ref_code_iti_stage_kind (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_stage_kind_code ON ref_code_iti_stage_kind (code);

-- House RLS pair (public read / admin write) — matches every other ref_code partition.
ALTER TABLE ref_code_iti_difficulty  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_iti_open_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_iti_stage_kind  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_iti_difficulty;
CREATE POLICY "pub_ref_code_read" ON ref_code_iti_difficulty FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_iti_difficulty;
CREATE POLICY "admin_ref_code_write" ON ref_code_iti_difficulty FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_iti_open_status;
CREATE POLICY "pub_ref_code_read" ON ref_code_iti_open_status FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_iti_open_status;
CREATE POLICY "admin_ref_code_write" ON ref_code_iti_open_status FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_iti_stage_kind;
CREATE POLICY "pub_ref_code_read" ON ref_code_iti_stage_kind FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_iti_stage_kind;
CREATE POLICY "admin_ref_code_write" ON ref_code_iti_stage_kind FOR ALL USING (auth.role() IN ('service_role','admin'));

-- ---------------------------------------------------------------------
-- 3. Seeds (idempotent via NOT EXISTS)
-- ---------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position)
SELECT v.domain, v.code, v.name, v.description, v.position
FROM (VALUES
  ('iti_difficulty','1','Très facile',   'Niveau de difficulté 1/5', 1),
  ('iti_difficulty','2','Facile',        'Niveau de difficulté 2/5', 2),
  ('iti_difficulty','3','Moyen',         'Niveau de difficulté 3/5', 3),
  ('iti_difficulty','4','Difficile',     'Niveau de difficulté 4/5', 4),
  ('iti_difficulty','5','Très difficile','Niveau de difficulté 5/5', 5),
  ('iti_open_status','open',            'Ouvert',              'Itinéraire ouvert',            1),
  ('iti_open_status','partially_closed','Partiellement fermé', 'Itinéraire partiellement fermé',2),
  ('iti_open_status','warning',         'Vigilance',           'Praticabilité à surveiller',   3),
  ('iti_open_status','closed',          'Fermé',               'Itinéraire fermé',             4),
  ('iti_stage_kind','depart',        'Départ',          'Point de départ',               1),
  ('iti_stage_kind','etape',         'Étape',           'Étape du parcours',             2),
  ('iti_stage_kind','point_interet', 'Point d''intérêt','Point d''intérêt',              3),
  ('iti_stage_kind','point_eau',     'Point d''eau',    'Source / ravitaillement en eau',4),
  ('iti_stage_kind','panorama',      'Panorama',        'Point de vue',                  5),
  ('iti_stage_kind','parking',       'Parking',         'Stationnement',                 6),
  ('iti_stage_kind','ravitaillement','Ravitaillement',  'Point de ravitaillement',       7),
  ('iti_stage_kind','arrivee',       'Arrivée',         'Point d''arrivée',              8)
) AS v(domain, code, name, description, position)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code r WHERE r.domain = v.domain AND r.code = v.code
);

COMMIT;

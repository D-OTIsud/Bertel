-- =====================================================================
-- migration_pricing_vocabulary.sql  (§13 Tarifs & extras — vocabulaire)
-- ---------------------------------------------------------------------
-- Two-axis pricing model for object_price:
--   * kind_id        -> price_kind  (PUBLIC / bénéficiaire: adulte, enfant…)
--   * indication_code-> price_type  (TYPE de tarif: principal, option, menu…)  ← NEW
--   * unit_id        -> price_unit  (UNITÉ: par personne, par nuit…)
--
-- The editor §13 conflated price_kind (audience) with a hard-coded tariff-type
-- list. This migration introduces a real `price_type` ref_code domain (stored in
-- the already-wired but unused `object_price.indication_code` text column — NO new
-- column, NO save_object_commercial change), enriches `price_unit` (+10) and lightly
-- audits `price_kind` (+5), and sets display `position` on all three domains
-- (previously all NULL → unordered dropdowns).
--
-- Idempotent: re-runnable. ref_code is PARTITION BY LIST (domain); a new domain
-- needs its own partition + per-partition uniques + the house RLS pair
-- (CLAUDE.md §61 recipe). 0 object_price rows live ⇒ greenfield, no data migration.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. New `price_type` partition (mirrors the schema_unified ref_code_* recipe)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_code_price_type PARTITION OF ref_code FOR VALUES IN ('price_type');

-- Per-partition uniques. (domain,code) and (domain,parent_id) propagate automatically
-- from the parent partitioned indexes; only the (id)-only and (code)-only uniques —
-- which cannot include the partition key — are created per-partition.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_price_type_id   ON ref_code_price_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_price_type_code ON ref_code_price_type (code);

-- House RLS pair (public read / admin write) — matches every other ref_code partition.
ALTER TABLE ref_code_price_type ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_price_type;
CREATE POLICY "pub_ref_code_read" ON ref_code_price_type FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_price_type;
CREATE POLICY "admin_ref_code_write" ON ref_code_price_type FOR ALL USING (auth.role() IN ('service_role','admin'));

-- ---------------------------------------------------------------------
-- 2. Seed price_type rows (idempotent via NOT EXISTS — ref_code has no
--    re-runnable ON CONFLICT target: PK is (id,domain) with a random id default).
-- ---------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position)
SELECT v.domain, v.code, v.name, v.description, v.position
FROM (VALUES
  ('price_type','principal',   'Tarif principal',   'Tarif de base de la prestation',                1),
  ('price_type','option',      'Option / extra',    'Supplément ou prestation optionnelle',          2),
  ('price_type','menu',        'Menu / formule',    'Menu, formule ou plat',                         3),
  ('price_type','pack',        'Pack / forfait',    'Offre groupée ou forfait packagé',              4),
  ('price_type','abonnement',  'Abonnement / pass', 'Abonnement, carte ou pass multi-entrées',       5),
  ('price_type','taxe',        'Taxe / redevance',  'Taxe de séjour, redevance ou collecte',         6),
  ('price_type','caution',     'Caution',           'Caution ou dépôt de garantie',                  7),
  ('price_type','devis',       'Sur devis',         'Tarif communiqué sur devis',                    8)
) AS v(domain, code, name, description, position)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code r WHERE r.domain = v.domain AND r.code = v.code
);

-- ---------------------------------------------------------------------
-- 3. Enrich price_unit (+10) — idempotent
-- ---------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description)
SELECT v.domain, v.code, v.name, v.description
FROM (VALUES
  ('price_unit','par_personne_jour','Par personne et par jour','Tarif combiné personne/jour'),
  ('price_unit','par_an',           'Par an',                  'Tarif annuel (abonnement, pass)'),
  ('price_unit','par_seance',       'Par séance',              'Tarif par séance ou créneau'),
  ('price_unit','par_entree',       'Par entrée / billet',     'Tarif par entrée ou billet'),
  ('price_unit','par_couvert',      'Par couvert',             'Tarif par couvert (restauration)'),
  ('price_unit','par_chambre',      'Par chambre',             'Tarif par chambre'),
  ('price_unit','par_logement',     'Par logement (entier)',   'Tarif pour le logement entier (location)'),
  ('price_unit','par_vehicule',     'Par véhicule',            'Tarif par véhicule'),
  ('price_unit','par_trajet',       'Par trajet',              'Tarif par trajet (transport)'),
  ('price_unit','par_unite',        'Par unité',               'Tarif par unité / article')
) AS v(domain, code, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code r WHERE r.domain = v.domain AND r.code = v.code
);

-- ---------------------------------------------------------------------
-- 4. Audit price_kind (+5 audiences) — idempotent
-- ---------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description)
SELECT v.domain, v.code, v.name, v.description
FROM (VALUES
  ('price_kind','bebe',            'Bébé / Tout-petit','Tarif bébé / tout-petit'),
  ('price_kind','jeune',           'Jeune / Junior',   'Tarif jeune / junior'),
  ('price_kind','scolaire',        'Scolaire',         'Tarif groupe scolaire'),
  ('price_kind','abonne',          'Abonné / Adhérent','Tarif abonné / adhérent'),
  ('price_kind','demandeur_emploi','Demandeur d''emploi','Tarif demandeur d''emploi')
) AS v(domain, code, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code r WHERE r.domain = v.domain AND r.code = v.code
);

-- ---------------------------------------------------------------------
-- 5. Display order (position) for the three pricing domains.
--    All rows were position NULL ⇒ dropdowns rendered in insertion order.
-- ---------------------------------------------------------------------
UPDATE ref_code AS r SET position = o.position
FROM (VALUES
  -- price_kind (audience)
  ('price_kind','adulte',1),('price_kind','enfant',2),('price_kind','bebe',3),('price_kind','jeune',4),
  ('price_kind','etudiant',5),('price_kind','senior',6),('price_kind','famille',7),('price_kind','couple',8),
  ('price_kind','groupe',9),('price_kind','scolaire',10),('price_kind','resident',11),('price_kind','abonne',12),
  ('price_kind','demandeur_emploi',13),('price_kind','personne_handicapee',14),('price_kind','gratuit',15),
  -- price_unit
  ('price_unit','par_personne',1),('price_unit','par_personne_nuit',2),('price_unit','par_personne_jour',3),
  ('price_unit','par_nuit',4),('price_unit','par_sejour',5),('price_unit','par_jour',6),('price_unit','par_semaine',7),
  ('price_unit','par_mois',8),('price_unit','par_an',9),('price_unit','par_heure',10),('price_unit','par_seance',11),
  ('price_unit','par_entree',12),('price_unit','par_couvert',13),('price_unit','par_chambre',14),
  ('price_unit','par_logement',15),('price_unit','par_vehicule',16),('price_unit','par_trajet',17),
  ('price_unit','par_groupe',18),('price_unit','par_forfait',19),('price_unit','par_unite',20)
) AS o(domain, code, position)
WHERE r.domain = o.domain AND r.code = o.code
  AND r.position IS DISTINCT FROM o.position;

-- ---------------------------------------------------------------------
-- 6. Document the indication_code repurpose.
-- ---------------------------------------------------------------------
COMMENT ON COLUMN object_price.indication_code IS
  'Type de tarif (§13) — code du domaine ref_code ''price_type'' (principal/option/menu/pack/abonnement/taxe/caution/devis). Stocké en texte, non FK.';

COMMIT;

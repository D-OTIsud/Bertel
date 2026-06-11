-- =============================================================================
-- migration_object_type_spu.sql — Nouveau type d'objet SPU « Service public » (§53)
-- Manifest step 8u. Idempotent (IF NOT EXISTS / ON CONFLICT) — re-run = no-op.
-- =============================================================================
-- POURQUOI. PSV est canoniquement « Prestataire de services » (taxonomy_psv :
-- transport_mobility + leisure_equipment_rental ; 18 objets live reclassés
-- ORG→PSV volontairement le 2026-05-14 par 03_correct_old_data_object_types.sql).
-- Les POI « service public » que la légende du doc API (docs/index.html §1.7,
-- 2025-10-04) attribuait à tort à PSV reçoivent leur PROPRE type :
--   SPU = Service public (équipement public autonome : toilettes publiques,
--         point d'eau potable, borne de recharge électrique).
-- Les codes ref_amenity homonymes (public_toilets / drinking_water /
-- electric_charging, seeds_data.sql) restent inchangés : une amenity décrit
-- l'équipement D'UN autre objet ; un objet SPU EST l'équipement autonome.
-- Les codes de taxonomie ci-dessous reprennent volontairement les mêmes
-- identifiants pour faciliter les correspondances amenity ↔ sous-catégorie.
--
-- QUOI.
--   1. Enum object_type += 'SPU' (même pattern DO/exception que le bloc
--      d'upgrade de schema_unified.sql:1250).
--   2. Registre taxonomie : ref_code_domain_registry « taxonomy_spu »
--      (position 85, après taxonomy_psv=80) + nœud racine technique + 3
--      sous-catégories assignables (pattern 03_correct_old_data_object_types).
-- PAS de table facette type-spécifique ⇒ AUCUNE ligne ref_facet_applicability
-- (même classe que PCU/PNA/VIL : modules génériques uniquement). Pas de
-- métrique ref_capacity_applicability. api.rpc_create_object valide déjà
-- dynamiquement contre pg_enum (§46) et api.generate_object_id est générique.
--
-- APPLY LIVE : DEUX transactions (une valeur d'enum ajoutée ne peut pas être
-- UTILISÉE dans la même transaction) — partie 1 = enum, partie 2 = taxonomie.
-- En psql autocommit (CI fresh-apply, \ir) le fichier passe tel quel.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Partie 1 — valeur d'enum (transaction séparée du premier usage)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    ALTER TYPE object_type ADD VALUE IF NOT EXISTS 'SPU';
  EXCEPTION WHEN others THEN NULL; END;
END $$;

-- ---------------------------------------------------------------------------
-- Partie 2 — taxonomie SPU (registre + racine + sous-catégories)
-- ---------------------------------------------------------------------------
INSERT INTO ref_code_domain_registry (
  domain, name, description, object_type,
  is_hierarchical, is_taxonomy, position, is_active,
  name_i18n, description_i18n, metadata
) VALUES (
  'taxonomy_spu', 'Taxonomie SPU',
  'Sous-catégories pour les services publics autonomes (toilettes, eau potable, recharge électrique).',
  'SPU'::object_type, TRUE, TRUE, 85, TRUE,
  jsonb_build_object('fr', 'Taxonomie SPU'),
  jsonb_build_object('fr', 'Sous-catégories pour les services publics autonomes (toilettes, eau potable, recharge électrique).'),
  jsonb_build_object('source', 'object_type_spu_20260611')
)
ON CONFLICT (domain) DO UPDATE
SET object_type = EXCLUDED.object_type,
    is_hierarchical = TRUE,
    is_taxonomy = TRUE,
    is_active = TRUE,
    name_i18n = coalesce(ref_code_domain_registry.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code_domain_registry.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    metadata = coalesce(ref_code_domain_registry.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

-- Racine technique (non assignable), même convention que taxonomy_act/psv.
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
VALUES (
  'taxonomy_spu', 'root', 'SPU', 'Racine technique Taxonomie SPU', 0, NULL, FALSE,
  jsonb_build_object('source', 'object_type_spu_20260611'),
  jsonb_build_object('fr', 'SPU'),
  jsonb_build_object('fr', 'Racine technique Taxonomie SPU')
)
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_assignable = FALSE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

-- Sous-catégories assignables (codes alignés sur ref_amenity, voir en-tête).
WITH root AS (
  SELECT id FROM ref_code WHERE domain = 'taxonomy_spu' AND code = 'root'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT
  'taxonomy_spu', v.code, v.name, v.description, v.position, root.id, TRUE,
  jsonb_build_object('source', 'object_type_spu_20260611'),
  jsonb_build_object('fr', v.name, 'en', v.name_en),
  jsonb_build_object('fr', v.description)
FROM (VALUES
  ('public_toilets',    'Toilettes publiques',           'Toilettes publiques accessibles au public',                    1, 'Public toilets'),
  ('drinking_water',    'Point d''eau potable',          'Fontaine ou robinet d''eau potable en libre accès',            2, 'Drinking water point'),
  ('electric_charging', 'Borne de recharge électrique',  'Station de recharge pour véhicules électriques',               3, 'EV charging station')
) AS v(code, name, description, position, name_en)
CROSS JOIN root
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id,
    position = EXCLUDED.position,
    is_assignable = TRUE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

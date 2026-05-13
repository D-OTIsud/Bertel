-- ===========================================================================
-- Old_data enrichment for already-imported Berta 2.0 objects
-- Generated: 2026-05-12
--
-- Expected imported objects: 837
-- Expected publication split from original import: 363 published / 474 draft active
-- Source match: object_external_id.source_system = 'berta_v2_csv_export'
-- Source batch: old-data-berta2-all-20260501-01
--
-- Compact SQL Editor version:
-- - Does not embed the 837 source rows.
-- - Reads the already-loaded old import rows from staging.object_temp.
-- - Reads D_Durable rows from staging.object_sustainability_action_temp when present.
-- - Does not depend on external CSV files.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.old_data_norm(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(public.immutable_unaccent(lower(coalesce(p_value, ''))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION pg_temp.old_data_first_part(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(split_part(coalesce(p_value, ''), ';', 1));
$$;

CREATE OR REPLACE FUNCTION pg_temp.old_data_slug(p_value text, p_fallback text DEFAULT 'item')
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(
      left(
        btrim(
          regexp_replace(
            regexp_replace(public.immutable_unaccent(lower(coalesce(p_value, ''))), '[^a-z0-9]+', '_', 'g'),
            '_+', '_', 'g'
          ),
          '_'
        ),
        80
      ),
      ''
    ),
    p_fallback
  );
$$;

DO $old_data_prereq$
BEGIN
  IF to_regclass('staging.object_temp') IS NULL THEN
    RAISE EXCEPTION 'Missing staging.object_temp. This compact enrichment SQL expects the already-run Old_data import staging rows to still exist.';
  END IF;
END $old_data_prereq$;

CREATE TEMP TABLE old_data_objects ON COMMIT DROP AS
WITH imported AS (
  SELECT DISTINCT ON (oei.external_id)
    oei.external_id AS legacy_id,
    oei.object_id
  FROM object_external_id oei
  JOIN object o ON o.id = oei.object_id
  WHERE oei.source_system = 'berta_v2_csv_export'
  ORDER BY oei.external_id, oei.updated_at DESC NULLS LAST, oei.created_at DESC NULLS LAST
),
staged AS (
  SELECT DISTINCT ON (t.external_id)
    t.external_id AS legacy_id,
    t.object_type,
    t.name,
    t.status,
    t.commercial_visibility,
    t.raw_source_data,
    coalesce(t.extra, '{}'::jsonb) AS extra
  FROM staging.object_temp t
  WHERE t.import_batch_id = 'old-data-berta2-all-20260501-01'
    AND t.external_id IS NOT NULL
    AND t.is_approved IS TRUE
  ORDER BY t.external_id, t.updated_at DESC NULLS LAST, t.created_at DESC NULLS LAST
)
SELECT
  i.object_id,
  s.legacy_id,
  s.object_type,
  s.name,
  s.status,
  s.commercial_visibility,
  s.raw_source_data,
  s.extra,
  coalesce(s.extra->>'source_group_category', s.raw_source_data->>'Groupe catégorie', '') AS source_group_category,
  coalesce(s.extra->>'source_category', s.raw_source_data->>'Nom catégorie', '') AS source_category,
  coalesce(s.extra->>'source_subcategory', s.raw_source_data->>'Nom sous catégorie', '') AS source_subcategory,
  coalesce(s.raw_source_data->>'Localisations', '') AS localisations,
  coalesce(s.raw_source_data->>'Prestations sur place', '') AS onsite,
  coalesce(s.raw_source_data->>'Prestations à proximité', '') AS nearby,
  coalesce(s.raw_source_data->>'Labels', '') AS labels,
  coalesce(s.raw_source_data->>'Classement', '') AS classement,
  coalesce(s.raw_source_data->>'Accroche', '') AS teaser,
  coalesce(s.raw_source_data->>'Descriptif', '') AS description,
  coalesce(s.raw_source_data->>'En ligne', '') AS en_ligne,
  pg_temp.old_data_norm(concat_ws(' ',
    s.name,
    s.extra->>'source_group_category',
    s.extra->>'source_category',
    s.extra->>'source_subcategory',
    s.raw_source_data->>'Groupe catégorie',
    s.raw_source_data->>'Nom catégorie',
    s.raw_source_data->>'Nom sous catégorie',
    s.raw_source_data->>'Localisations',
    s.raw_source_data->>'Prestations sur place',
    s.raw_source_data->>'Prestations à proximité',
    s.raw_source_data->>'Labels',
    s.raw_source_data->>'Classement',
    s.raw_source_data->>'Accroche',
    s.raw_source_data->>'Descriptif'
  )) AS full_text_norm
FROM imported i
JOIN staged s ON s.legacy_id = i.legacy_id;

DO $old_data_assert_objects$
DECLARE
  n integer;
  archived_n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM old_data_objects;
  IF n < 837 THEN
    RAISE EXCEPTION 'Old_data enrichment expected 837 imported objects, found %', n
      USING HINT = 'Run the original Old_data import first, then rerun this enrichment SQL.';
  END IF;

  SELECT COUNT(*) INTO archived_n
  FROM old_data_objects odo
  JOIN object o ON o.id = odo.object_id
  WHERE o.status = 'archived';

  IF archived_n > 0 THEN
    RAISE EXCEPTION 'Old_data enrichment refuses to continue: % imported objects are archived. Offline source rows must remain draft/active, not archived.', archived_n;
  END IF;
END $old_data_assert_objects$;

CREATE TEMP TABLE old_data_domain_def ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('taxonomy_hot',  'Taxonomie HOT',  'Sous-catégories métier pour les hôtels.', 'HOT',  10),
    ('taxonomy_act',  'Taxonomie ACT',  'Sous-catégories métier pour les activités encadrées.', 'ACT',  20),
    ('taxonomy_com',  'Taxonomie COM',  'Sous-catégories métier pour les commerces.', 'COM',  30),
    ('taxonomy_hlo',  'Taxonomie HLO',  'Sous-catégories métier pour les hébergements locatifs.', 'HLO',  40),
    ('taxonomy_res',  'Taxonomie RES',  'Sous-catégories métier pour la restauration.', 'RES',  50),
    ('taxonomy_loi',  'Taxonomie LOI',  'Sous-catégories métier pour loisirs, visites et découvertes.', 'LOI',  60),
    ('taxonomy_org',  'Taxonomie ORG',  'Sous-catégories métier pour organisations et services.', 'ORG',  70),
    ('taxonomy_psv',  'Taxonomie PSV',  'Sous-catégories métier pour prestations de services.', 'PSV',  80),
    ('taxonomy_camp', 'Taxonomie CAMP', 'Sous-catégories métier pour campings.', 'CAMP', 90)
) AS d(domain, name, description, object_type, position)
WHERE EXISTS (
  SELECT 1
  FROM old_data_objects odo
  WHERE ('taxonomy_' || lower(odo.object_type)) = d.domain
     OR (odo.object_type = 'HOT' AND d.domain = 'taxonomy_hot')
     OR (odo.object_type = 'ACT' AND d.domain = 'taxonomy_act')
     OR (odo.object_type = 'COM' AND d.domain = 'taxonomy_com')
);

INSERT INTO ref_code_domain_registry (
  domain, name, description, object_type, is_hierarchical, is_taxonomy,
  position, is_active, name_i18n, description_i18n, metadata
)
SELECT
  d.domain,
  d.name,
  d.description,
  d.object_type::object_type,
  TRUE,
  TRUE,
  d.position,
  TRUE,
  jsonb_build_object('fr', d.name),
  jsonb_build_object('fr', d.description),
  jsonb_build_object('source', 'old_data_enrichment_20260512', 'batch_id', 'old-data-berta2-all-20260501-01')
FROM old_data_domain_def d
ON CONFLICT (domain) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    object_type = EXCLUDED.object_type,
    is_hierarchical = TRUE,
    is_taxonomy = TRUE,
    position = EXCLUDED.position,
    is_active = TRUE,
    name_i18n = coalesce(ref_code_domain_registry.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code_domain_registry.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    metadata = coalesce(ref_code_domain_registry.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT
  d.domain,
  'root',
  replace(d.name, 'Taxonomie ', ''),
  'Racine technique ' || d.name,
  0,
  NULL::uuid,
  FALSE,
  jsonb_build_object('source', 'old_data_enrichment_20260512'),
  jsonb_build_object('fr', replace(d.name, 'Taxonomie ', '')),
  jsonb_build_object('fr', 'Racine technique ' || d.name)
FROM old_data_domain_def d
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    position = EXCLUDED.position,
    parent_id = EXCLUDED.parent_id,
    is_assignable = FALSE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

CREATE TEMP TABLE old_data_taxonomy_candidates ON COMMIT DROP AS
WITH parts AS (
  SELECT
    odo.*,
    pg_temp.old_data_first_part(odo.source_category) AS category_one,
    pg_temp.old_data_first_part(odo.source_subcategory) AS subcategory_one
  FROM old_data_objects odo
)
SELECT
  p.object_id,
  p.legacy_id,
  CASE
    WHEN p.object_type = 'HOT' THEN 'taxonomy_hot'
    WHEN p.object_type = 'ACT' THEN 'taxonomy_act'
    WHEN p.object_type = 'COM' THEN 'taxonomy_com'
    ELSE 'taxonomy_' || lower(p.object_type)
  END AS domain,
  CASE
    WHEN p.object_type IN ('HOT', 'ACT', 'COM') THEN NULL
    WHEN pg_temp.old_data_slug(nullif(p.category_one, ''), lower(p.object_type)) = pg_temp.old_data_slug(coalesce(nullif(p.subcategory_one, ''), nullif(p.category_one, ''), p.object_type), lower(p.object_type)) THEN NULL
    ELSE pg_temp.old_data_slug(nullif(p.category_one, ''), lower(p.object_type))
  END AS parent_code,
  CASE
    WHEN p.object_type IN ('HOT', 'ACT', 'COM') THEN NULL
    WHEN pg_temp.old_data_slug(nullif(p.category_one, ''), lower(p.object_type)) = pg_temp.old_data_slug(coalesce(nullif(p.subcategory_one, ''), nullif(p.category_one, ''), p.object_type), lower(p.object_type)) THEN NULL
    ELSE nullif(p.category_one, '')
  END AS parent_name,
  CASE
    WHEN p.object_type = 'HOT' AND p.full_text_norm LIKE '%restaurant%' THEN 'hotel_with_restaurant'
    WHEN p.object_type = 'HOT' THEN 'hotel'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%canyon%' THEN 'canyoning'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%plonge%' THEN 'scuba_diving'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%parapente%' THEN 'paragliding'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%kayak%' OR p.full_text_norm LIKE '%paddle%' OR p.full_text_norm LIKE '%randonnee aquatique%' OR p.full_text_norm LIKE '%promenade en mer%') THEN 'kayaking_paddleboarding'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%vtt%' OR p.full_text_norm LIKE '%velo%') THEN 'guided_mountain_biking'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%cheval%' OR p.full_text_norm LIKE '%equit%') THEN 'horse_riding'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%randon%' THEN 'guided_hiking'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%escalad%' THEN 'guided_climbing'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%snorkeling%' OR p.full_text_norm LIKE '%palme masque tuba%') THEN 'guided_snorkeling'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%surf%' THEN 'surf_lessons'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%bien etre%' OR p.full_text_norm LIKE '%massage%' OR p.full_text_norm LIKE '%spa%' OR p.full_text_norm LIKE '%remise en forme%' OR p.full_text_norm LIKE '%yoga%') THEN 'fitness_wellness'
    WHEN p.object_type = 'ACT' THEN 'other_guided_activity'
    WHEN p.object_type = 'COM' AND (p.full_text_norm LIKE '%boulanger%' OR p.full_text_norm LIKE '%patisserie%') THEN 'bakery'
    WHEN p.object_type = 'COM' AND p.full_text_norm LIKE '%pharmacie%' THEN 'pharmacy'
    WHEN p.object_type = 'COM' AND (p.full_text_norm LIKE '%supermarche%' OR p.full_text_norm LIKE '%epicerie%') THEN 'supermarket'
    WHEN p.object_type = 'COM' AND p.full_text_norm LIKE '%souvenir%' THEN 'souvenir_shop'
    WHEN p.object_type = 'COM' THEN 'local_crafts'
    ELSE pg_temp.old_data_slug(coalesce(nullif(p.subcategory_one, ''), nullif(p.category_one, ''), p.object_type), lower(p.object_type))
  END AS code,
  CASE
    WHEN p.object_type = 'HOT' AND p.full_text_norm LIKE '%restaurant%' THEN 'Hôtel-restaurant'
    WHEN p.object_type = 'HOT' THEN 'Hotel'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%canyon%' THEN 'Canyoning'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%plonge%' THEN 'Plongée sous-marine'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%parapente%' THEN 'Parapente'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%kayak%' OR p.full_text_norm LIKE '%paddle%' OR p.full_text_norm LIKE '%randonnee aquatique%' OR p.full_text_norm LIKE '%promenade en mer%') THEN 'Kayak / Paddle'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%vtt%' OR p.full_text_norm LIKE '%velo%') THEN 'VTT guidé'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%cheval%' OR p.full_text_norm LIKE '%equit%') THEN 'Équitation'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%randon%' THEN 'Randonnée guidée'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%escalad%' THEN 'Escalade encadrée'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%snorkeling%' OR p.full_text_norm LIKE '%palme masque tuba%') THEN 'Snorkeling encadré'
    WHEN p.object_type = 'ACT' AND p.full_text_norm LIKE '%surf%' THEN 'Cours de surf'
    WHEN p.object_type = 'ACT' AND (p.full_text_norm LIKE '%bien etre%' OR p.full_text_norm LIKE '%massage%' OR p.full_text_norm LIKE '%spa%' OR p.full_text_norm LIKE '%remise en forme%' OR p.full_text_norm LIKE '%yoga%') THEN 'Remise en forme / Fitness'
    WHEN p.object_type = 'ACT' THEN 'Autre activité encadrée'
    WHEN p.object_type = 'COM' AND (p.full_text_norm LIKE '%boulanger%' OR p.full_text_norm LIKE '%patisserie%') THEN 'Boulangerie / pâtisserie'
    WHEN p.object_type = 'COM' AND p.full_text_norm LIKE '%pharmacie%' THEN 'Pharmacie'
    WHEN p.object_type = 'COM' AND (p.full_text_norm LIKE '%supermarche%' OR p.full_text_norm LIKE '%epicerie%') THEN 'Supermarché'
    WHEN p.object_type = 'COM' AND p.full_text_norm LIKE '%souvenir%' THEN 'Boutique de souvenirs'
    WHEN p.object_type = 'COM' THEN 'Artisanat / produits locaux'
    ELSE coalesce(nullif(p.subcategory_one, ''), nullif(p.category_one, ''), p.object_type)
  END AS name
FROM parts p;

WITH parent_candidates AS (
  SELECT domain, parent_code AS code, parent_name AS name
  FROM old_data_taxonomy_candidates
  WHERE parent_code IS NOT NULL
    AND parent_name IS NOT NULL
), parent_nodes AS (
  SELECT DISTINCT ON (domain, code)
    domain,
    code,
    name
  FROM parent_candidates
  ORDER BY domain, code, name
), roots AS (
  SELECT domain, id
  FROM ref_code
  WHERE code = 'root'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT
  p.domain,
  p.code,
  p.name,
  p.name,
  100 + row_number() OVER (PARTITION BY p.domain ORDER BY p.name, p.code),
  r.id,
  FALSE,
  jsonb_build_object('source', 'old_data_enrichment_20260512', 'level', 'source_category'),
  jsonb_build_object('fr', p.name),
  jsonb_build_object('fr', p.name)
FROM parent_nodes p
JOIN roots r ON r.domain = p.domain
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id,
    is_assignable = FALSE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

WITH leaf_candidates AS (
  SELECT domain, code, name, parent_code
  FROM old_data_taxonomy_candidates
), leaf_nodes AS (
  SELECT DISTINCT ON (domain, code)
    domain,
    code,
    name,
    parent_code
  FROM leaf_candidates
  ORDER BY domain, code, (parent_code IS NULL), name
), parents AS (
  SELECT domain, code, id
  FROM ref_code
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT
  l.domain,
  l.code,
  l.name,
  l.name,
  1000 + row_number() OVER (PARTITION BY l.domain ORDER BY l.name, l.code),
  coalesce(parent.id, root.id),
  TRUE,
  jsonb_build_object('source', 'old_data_enrichment_20260512', 'level', 'source_subcategory'),
  jsonb_build_object('fr', l.name),
  jsonb_build_object('fr', l.name)
FROM leaf_nodes l
JOIN parents root ON root.domain = l.domain AND root.code = 'root'
LEFT JOIN parents parent ON parent.domain = l.domain AND parent.code = l.parent_code
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = coalesce(ref_code.parent_id, EXCLUDED.parent_id),
    is_assignable = TRUE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

SELECT api.refresh_ref_code_taxonomy_closure(domain)
FROM old_data_domain_def
ORDER BY position;

WITH taxonomy_rows AS (
  SELECT DISTINCT ON (tc.object_id, tc.domain)
    tc.object_id,
    tc.domain,
    rc.id AS ref_code_id,
    concat_ws(' | ', 'Berta old-data taxonomy', nullif(odo.source_category, ''), nullif(odo.source_subcategory, '')) AS note
  FROM old_data_taxonomy_candidates tc
  JOIN old_data_objects odo ON odo.object_id = tc.object_id
  JOIN ref_code rc ON rc.domain = tc.domain AND rc.code = tc.code
  ORDER BY tc.object_id, tc.domain, tc.code
)
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note, created_at, updated_at)
SELECT
  tr.object_id,
  tr.domain,
  tr.ref_code_id,
  'old_data_enrichment_20260512',
  tr.note,
  NOW(),
  NOW()
FROM taxonomy_rows tr
ON CONFLICT (object_id, domain) DO UPDATE
SET ref_code_id = EXCLUDED.ref_code_id,
    source = EXCLUDED.source,
    note = EXCLUDED.note,
    updated_at = NOW()
WHERE object_taxonomy.source IS NULL
   OR object_taxonomy.source = 'old_data_enrichment_20260512'
   OR object_taxonomy.source LIKE 'old_data_%';

CREATE TEMP TABLE old_data_tag_catalog ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('accommodation', 'Hébergement', 'Offre d''hébergement', '#3b82f6', 'bed', 10),
    ('beach', 'Mer et littoral', 'Proximité mer, plage, lagon ou littoral', '#06b6d4', 'waves', 20),
    ('family', 'Famille', 'Adapté aux familles ou aux enfants', '#f59e0b', 'users', 30),
    ('farm', 'Ferme et agrotourisme', 'Ferme, exploitation agricole ou agrotourisme', '#65a30d', 'wheat', 40),
    ('food', 'Cuisine', 'Restaurant, table, spécialité ou expérience culinaire', '#f97316', 'utensils', 50),
    ('guided_tour', 'Visite guidée', 'Visite, guidage ou médiation encadrée', '#6366f1', 'route', 60),
    ('heritage', 'Patrimoine', 'Patrimoine culturel, naturel ou historique', '#a16207', 'landmark', 70),
    ('local_products', 'Produits locaux', 'Produits péi, terroir ou artisanat local', '#22c55e', 'sprout', 80),
    ('organic', 'Bio', 'Agriculture biologique ou produits bio explicitement cités', '#84cc16', 'leaf', 90),
    ('outdoor', 'Plein air', 'Activité ou expérience extérieure', '#16a34a', 'mountain', 100),
    ('panorama', 'Panorama', 'Vue ou point de vue remarquable', '#0ea5e9', 'binoculars', 110),
    ('romantic', 'Romantique', 'Ambiance couple, intime ou cocooning', '#e11d48', 'heart', 120),
    ('shopping', 'Boutique', 'Boutique, commerce ou vente sur place', '#14b8a6', 'shopping-bag', 130),
    ('volcano', 'Volcan', 'Expérience ou localisation liée au volcan', '#ef4444', 'flame', 140),
    ('wellness', 'Bien-être', 'Spa, massage, détente ou remise en forme', '#ec4899', 'heart', 150),
    ('workshop', 'Atelier', 'Atelier, fabrication, stage ou pratique participative', '#8b5cf6', 'palette', 160)
) AS t(slug, name, description, color, icon, position);

CREATE TEMP TABLE old_data_tag_candidates ON COMMIT DROP AS
SELECT DISTINCT odo.object_id, tag.slug
FROM old_data_objects odo
CROSS JOIN LATERAL (
  VALUES
    ('family', odo.full_text_norm LIKE '% enfant%' OR odo.full_text_norm LIKE '%famille%' OR odo.full_text_norm LIKE '%familial%' OR odo.full_text_norm LIKE '%aire de jeux%' OR odo.full_text_norm LIKE '%coin enfants%'),
    ('panorama', odo.full_text_norm LIKE '%vue panoramique%' OR odo.full_text_norm LIKE '%point de vue%' OR odo.full_text_norm LIKE '%vue mer%' OR odo.full_text_norm LIKE '%vue montagne%'),
    ('local_products', odo.full_text_norm LIKE '%produits locaux%' OR odo.full_text_norm LIKE '%produits du terroir%' OR odo.full_text_norm LIKE '%terroir%' OR odo.full_text_norm LIKE '%artisan%' OR odo.full_text_norm LIKE '%curcuma%' OR odo.full_text_norm LIKE '%vanille%' OR odo.full_text_norm LIKE '%confiture%' OR odo.full_text_norm LIKE '%miel%' OR odo.full_text_norm LIKE '%palmiste%' OR odo.full_text_norm LIKE '% pei%'),
    ('guided_tour', odo.full_text_norm LIKE '%visite guidee%' OR odo.full_text_norm LIKE '%visites pedagogiques%' OR odo.full_text_norm LIKE '%guide %' OR odo.full_text_norm LIKE '%accompagnateur%'),
    ('wellness', odo.full_text_norm LIKE '%spa%' OR odo.full_text_norm LIKE '%massage%' OR odo.full_text_norm LIKE '%bien etre%' OR odo.full_text_norm LIKE '%remise en forme%' OR odo.full_text_norm LIKE '%yoga%' OR odo.full_text_norm LIKE '%jacuzzi%'),
    ('outdoor', odo.full_text_norm LIKE '%randon%' OR odo.full_text_norm LIKE '%vtt%' OR odo.full_text_norm LIKE '%canyon%' OR odo.full_text_norm LIKE '%kayak%' OR odo.full_text_norm LIKE '%paddle%' OR odo.full_text_norm LIKE '%equitation%' OR odo.full_text_norm LIKE '%peche%' OR odo.full_text_norm LIKE '%plongee%' OR odo.full_text_norm LIKE '%sentier%' OR odo.full_text_norm LIKE '%montagne%'),
    ('beach', odo.full_text_norm LIKE '% plage%' OR odo.full_text_norm LIKE '% mer %' OR odo.full_text_norm LIKE '%littoral%' OR odo.full_text_norm LIKE '%lagon%' OR odo.full_text_norm LIKE '%bassin%' OR odo.full_text_norm LIKE '%bord de mer%'),
    ('volcano', odo.full_text_norm LIKE '%volcan%' OR odo.full_text_norm LIKE '%fournaise%' OR odo.full_text_norm LIKE '%lave%'),
    ('heritage', odo.full_text_norm LIKE '%patrimoine%' OR odo.full_text_norm LIKE '%historique%' OR odo.full_text_norm LIKE '%culturel%' OR odo.full_text_norm LIKE '%musee%' OR odo.full_text_norm LIKE '%temple%' OR odo.full_text_norm LIKE '%eglise%' OR odo.full_text_norm LIKE '%four a pain%'),
    ('romantic', odo.full_text_norm LIKE '%amoureux%' OR odo.full_text_norm LIKE '%romantique%' OR odo.full_text_norm LIKE '%cocoon%' OR odo.full_text_norm LIKE '%couple%' OR odo.full_text_norm LIKE '%intime%'),
    ('workshop', odo.full_text_norm LIKE '%atelier%' OR odo.full_text_norm LIKE '%stage%' OR odo.full_text_norm LIKE '%fabrication%' OR odo.full_text_norm LIKE '%poterie%' OR odo.full_text_norm LIKE '%ceramique%' OR odo.full_text_norm LIKE '%cuisine anti%'),
    ('farm', odo.full_text_norm LIKE '%ferme%' OR odo.full_text_norm LIKE '%exploitation agricole%' OR odo.full_text_norm LIKE '%agrotourisme%' OR odo.full_text_norm LIKE '%maraichage%' OR odo.full_text_norm LIKE '%bienvenue a la ferme%'),
    ('food', odo.object_type = 'RES' OR odo.full_text_norm LIKE '%restaurant%' OR odo.full_text_norm LIKE '%table d hote%' OR odo.full_text_norm LIKE '%auberge%' OR odo.full_text_norm LIKE '%cuisine%' OR odo.full_text_norm LIKE '%pizzeria%' OR odo.full_text_norm LIKE '%snack%' OR odo.full_text_norm LIKE '%creperie%'),
    ('accommodation', odo.object_type IN ('HLO','HOT','CAMP') OR odo.full_text_norm LIKE '%hebergement%' OR odo.full_text_norm LIKE '%gite%' OR odo.full_text_norm LIKE '%villa%' OR odo.full_text_norm LIKE '%chambre d hote%' OR odo.full_text_norm LIKE '%hotel%' OR odo.full_text_norm LIKE '%camping%'),
    ('shopping', odo.object_type = 'COM' OR odo.full_text_norm LIKE '%boutique%' OR odo.full_text_norm LIKE '%commerce%' OR odo.full_text_norm LIKE '%souvenir%' OR odo.full_text_norm LIKE '%vente directe%'),
    ('organic', odo.full_text_norm LIKE '%agriculture biologique%' OR odo.full_text_norm LIKE '% bio %' OR odo.full_text_norm LIKE '%produits bio%')
) AS tag(slug, matched)
WHERE tag.matched IS TRUE;

INSERT INTO ref_tag (slug, name, description, color, icon, position, extra)
SELECT slug, name, description, color, icon, position,
       jsonb_build_object('source', 'old_data_enrichment_20260512', 'controlled_old_data_tag', true)
FROM old_data_tag_catalog
WHERE slug IN (SELECT slug FROM old_data_tag_candidates)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    color = EXCLUDED.color,
    icon = EXCLUDED.icon,
    position = EXCLUDED.position,
    extra = coalesce(ref_tag.extra, '{}'::jsonb) || EXCLUDED.extra,
    updated_at = NOW();

INSERT INTO tag_link (tag_id, target_table, target_pk, extra)
SELECT DISTINCT
  rt.id,
  'object',
  tc.object_id,
  jsonb_build_object('source', 'old_data_enrichment_20260512', 'batch_id', 'old-data-berta2-all-20260501-01')
FROM old_data_tag_candidates tc
JOIN ref_tag rt ON rt.slug = tc.slug
ON CONFLICT (tag_id, target_table, target_pk) DO UPDATE
SET extra = coalesce(tag_link.extra, '{}'::jsonb) || EXCLUDED.extra;

CREATE TEMP TABLE old_data_amenity_candidates ON COMMIT DROP AS
SELECT DISTINCT odo.object_id, rule.code
FROM old_data_objects odo
CROSS JOIN LATERAL (
  VALUES
    ('wifi', ARRAY['wifi','wi fi','internet sans fil']),
    ('parking', ARRAY['parking','stationnement']),
    ('air_conditioning', ARRAY['climatisation','climatise']),
    ('tv', ARRAY[' tv ','television','televiseur','ecran plat']),
    ('bbq', ARRAY['barbecue']),
    ('jacuzzi', ARRAY['jacuzzi']),
    ('garden', ARRAY['jardin','jardin arbore']),
    ('outdoor_furniture', ARRAY['salon de jardin','mobilier exterieur']),
    ('swimming_pool', ARRAY['piscine']),
    ('spa', ARRAY['espace spa','spa ',' centre spa']),
    ('massage', ARRAY['massage','bien etre']),
    ('boutique', ARRAY['boutique','vente sur place']),
    ('common_terrace', ARRAY['terrasse','varangue']),
    ('laundry', ARRAY['lave linge','laverie','machine a laver','blanchisserie']),
    ('private_bathroom', ARRAY['salle de bain privee','sanitaires prives','toilettes privees']),
    ('shared_bathroom', ARRAY['sanitaires communs','salle de bain commune']),
    ('shower', ARRAY['douche']),
    ('microwave', ARRAY['micro onde','micro-ondes','micro ondes']),
    ('coffee_machine', ARRAY['cafetiere','nespresso','machine a cafe']),
    ('refrigerator', ARRAY['frigo','refrigerateur','mini-refrigerateur']),
    ('kitchenette', ARRAY['kitchenette','cuisine equipee']),
    ('dining_room', ARRAY['salle a manger']),
    ('towels', ARRAY['linge de toilette','serviettes']),
    ('bed_linen', ARRAY['linge de maison','linge de lit','draps']),
    ('hairdryer', ARRAY['seche cheveux']),
    ('baby_crib', ARRAY['lit bebe']),
    ('high_chair', ARRAY['chaise haute']),
    ('playground', ARRAY['aire de jeux','coin enfants','jeux enfants']),
    ('pet_friendly', ARRAY['animaux acceptes','animaux admis']),
    ('bike_rental', ARRAY['location velo','location de velo','location vtt','vttae']),
    ('kayak_rental', ARRAY['kayak','paddle']),
    ('diving_center', ARRAY['plongee']),
    ('fishing_gear', ARRAY['peche']),
    ('electric_charging', ARRAY['borne electrique','recharge electrique']),
    ('restaurant', ARRAY['restaurant','table d hote','restauration']),
    ('bar', ARRAY[' bar ','pub']),
    ('breakfast', ARRAY['petit dejeuner']),
    ('public_toilets', ARRAY['toilettes publiques']),
    ('drinking_water', ARRAY['eau potable','point d eau']),
    ('hiking_gear', ARRAY['materiel pour l activite','sentier de randonnee'])
) AS rule(code, needles)
WHERE EXISTS (
  SELECT 1 FROM unnest(rule.needles) n WHERE odo.full_text_norm LIKE '%' || n || '%'
);

INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT DISTINCT ac.object_id, ra.id, NOW()
FROM old_data_amenity_candidates ac
JOIN ref_amenity ra ON ra.code = ac.code
WHERE ac.code <> 'wheelchair_access'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

CREATE TEMP TABLE old_data_environment_candidates ON COMMIT DROP AS
SELECT DISTINCT odo.object_id, rule.code
FROM old_data_objects odo
CROSS JOIN LATERAL (
  VALUES
    ('volcan', ARRAY['volcan','fournaise','lave']),
    ('plage', ARRAY['plage']),
    ('lagon', ARRAY['lagon']),
    ('cascade', ARRAY['cascade']),
    ('riviere', ARRAY['riviere','bassin']),
    ('jardin', ARRAY['jardin']),
    ('terrasse', ARRAY['terrasse','varangue']),
    ('vue_panoramique', ARRAY['point de vue panoramique','vue panoramique','vue mer','vue montagne','panoram']),
    ('calme', ARRAY['calme','tranquille','detente']),
    ('bord_mer', ARRAY['littoral','bord de mer','proximite mer']),
    ('front_de_mer', ARRAY['front de mer']),
    ('centre_ville', ARRAY['centre ville','centre-ville','hyper centre']),
    ('ville', ARRAY[' en ville ','urbain']),
    ('montagne', ARRAY['montagne','hauts','altitude','village des hauts']),
    ('campagne', ARRAY['campagne']),
    ('foret', ARRAY['foret']),
    ('parc_national', ARRAY['parc national','esprit parc']),
    ('rural', ARRAY['milieu rural','rural','village']),
    ('patrimoine', ARRAY['patrimoine','historique','culturel'])
) AS rule(code, needles)
WHERE EXISTS (
  SELECT 1 FROM unnest(rule.needles) n WHERE odo.full_text_norm LIKE '%' || n || '%'
);

INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT DISTINCT ec.object_id, et.id, NOW()
FROM old_data_environment_candidates ec
JOIN ref_code_environment_tag et ON et.code = ec.code
ON CONFLICT (object_id, environment_tag_id) DO NOTHING;

CREATE TEMP TABLE old_data_classification_candidates (
  object_id text,
  scheme_code text,
  value_code text,
  note text
) ON COMMIT DROP;

INSERT INTO old_data_classification_candidates
SELECT object_id, 'qualite_tourisme_reunion', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%qualite tourisme ile de la reunion%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'maitre_restaurateur', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%maitre restaurateur%' OR full_text_norm LIKE '%maitres restaurateur%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'esprit_parc', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%esprit parc%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'cte', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%centre de tourisme equestre%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'bienvenue_ferme',
  CASE
    WHEN full_text_norm LIKE '%table%' OR full_text_norm LIKE '%restaurant%' OR full_text_norm LIKE '%auberge%' THEN 'table_hote'
    WHEN full_text_norm LIKE '%vente%' OR full_text_norm LIKE '%boutique%' OR full_text_norm LIKE '%produit%' THEN 'vente_directe'
    WHEN object_type = 'HLO' THEN 'ferme_sejour'
    ELSE 'ferme_pedagogique'
  END,
  labels
FROM old_data_objects
WHERE full_text_norm LIKE '%bienvenue a la ferme%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'accueil_paysan',
  CASE
    WHEN object_type IN ('HLO','CAMP') THEN 'hebergement'
    WHEN object_type = 'RES' THEN 'restauration'
    WHEN full_text_norm LIKE '%vente%' OR full_text_norm LIKE '%boutique%' OR full_text_norm LIKE '%produit%' THEN 'vente'
    WHEN full_text_norm LIKE '%visite%' OR full_text_norm LIKE '%decouverte%' THEN 'decouverte'
    ELSE 'loisirs'
  END,
  labels
FROM old_data_objects
WHERE full_text_norm LIKE '%accueil paysan%' OR full_text_norm LIKE '%accueil payasn%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'LBL_TOURISME_HANDICAP', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%tourisme & handicap%' OR full_text_norm LIKE '%tourisme handicap%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'LBL_ECO_LABEL_UE', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%ecolabel europeen%';

INSERT INTO old_data_classification_candidates
SELECT object_id, 'LBL_QUALITE_TOURISME', 'granted', labels
FROM old_data_objects
WHERE full_text_norm LIKE '%qualite tourisme%'
  AND full_text_norm NOT LIKE '%qualite tourisme ile de la reunion%';

INSERT INTO old_data_classification_candidates
SELECT odo.object_id, 'gites_epics', m.match[1], coalesce(nullif(odo.classement, ''), odo.labels)
FROM old_data_objects odo
CROSS JOIN LATERAL (
  SELECT pg_temp.old_data_norm(concat_ws(' ', nullif(odo.classement, ''), nullif(odo.labels, ''))) AS evidence_text
) e
CROSS JOIN LATERAL regexp_matches(e.evidence_text, '([1-5])\s*epi', 'g') AS m(match)
WHERE e.evidence_text <> '';

INSERT INTO old_data_classification_candidates
SELECT odo.object_id, 'clevacances_keys', m.match[1], coalesce(nullif(odo.classement, ''), odo.labels)
FROM old_data_objects odo
CROSS JOIN LATERAL (
  SELECT pg_temp.old_data_norm(concat_ws(' ', nullif(odo.classement, ''), nullif(odo.labels, ''))) AS evidence_text
) e
CROSS JOIN LATERAL regexp_matches(e.evidence_text, '([1-5])\s*cle', 'g') AS m(match)
WHERE e.evidence_text <> '';

INSERT INTO old_data_classification_candidates
SELECT odo.object_id,
  CASE
    WHEN odo.object_type = 'HOT' THEN 'hot_stars'
    WHEN odo.object_type = 'CAMP' THEN 'camp_stars'
    ELSE 'meuble_stars'
  END,
  m.match[1],
  coalesce(nullif(odo.classement, ''), odo.labels)
FROM old_data_objects odo
CROSS JOIN LATERAL (
  SELECT pg_temp.old_data_norm(concat_ws(' ', nullif(odo.classement, ''), nullif(odo.labels, ''))) AS evidence_text
) e
CROSS JOIN LATERAL regexp_matches(e.evidence_text, '([1-5])\s*etoile', 'g') AS m(match)
WHERE e.evidence_text <> '';

DELETE FROM object_classification oc
USING old_data_objects odo, ref_classification_scheme s
WHERE oc.object_id = odo.object_id
  AND oc.scheme_id = s.id
  AND oc.source = 'old_data_enrichment_20260512'
  AND s.selection = 'single'
  AND EXISTS (
    SELECT 1
    FROM old_data_classification_candidates cc
    WHERE cc.object_id = oc.object_id
      AND cc.scheme_code = s.code
  );

WITH resolved_raw AS (
  SELECT
    cc.object_id,
    s.id AS scheme_id,
    s.code AS scheme_code,
    s.selection,
    v.id AS value_id,
    v.code AS value_code,
    v.ordinal,
    string_agg(DISTINCT nullif(cc.note, ''), ' | ') FILTER (WHERE nullif(cc.note, '') IS NOT NULL) AS note
  FROM old_data_classification_candidates cc
  JOIN ref_classification_scheme s ON s.code = cc.scheme_code
  JOIN ref_classification_value v ON v.scheme_id = s.id AND v.code = cc.value_code
  GROUP BY cc.object_id, s.id, s.code, s.selection, v.id, v.code, v.ordinal
), ranked AS (
  SELECT
    rr.*,
    row_number() OVER (
      PARTITION BY rr.object_id, rr.scheme_id
      ORDER BY
        CASE
          WHEN rr.scheme_code IN ('hot_stars', 'camp_stars', 'meuble_stars', 'gites_epics', 'clevacances_keys') THEN coalesce(rr.ordinal, 0)
          ELSE 0
        END DESC,
        rr.value_code DESC
    ) AS single_rank
  FROM resolved_raw rr
), resolved AS (
  SELECT object_id, scheme_id, selection, value_id, note
  FROM ranked
  WHERE selection <> 'single'
     OR single_rank = 1
)
INSERT INTO object_classification (object_id, scheme_id, value_id, status, source, note, created_at, updated_at)
SELECT r.object_id, r.scheme_id, r.value_id, 'granted', 'old_data_enrichment_20260512', nullif(r.note, ''), NOW(), NOW()
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1
  FROM object_classification existing
  WHERE existing.object_id = r.object_id
    AND existing.scheme_id = r.scheme_id
    AND existing.value_id = r.value_id
)
AND (
  r.selection <> 'single'
  OR NOT EXISTS (
    SELECT 1
    FROM object_classification existing_single
    WHERE existing_single.object_id = r.object_id
      AND existing_single.scheme_id = r.scheme_id
      AND existing_single.status = 'granted'
  )
);

DELETE FROM object_classification oc
USING (
  SELECT id, row_number() OVER (PARTITION BY object_id, scheme_id, value_id ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC) AS rn
  FROM object_classification
  WHERE source = 'old_data_enrichment_20260512'
) d
WHERE oc.id = d.id
  AND d.rn > 1;

DO $old_data_dd$
BEGIN
  IF to_regclass('staging.object_sustainability_action_temp') IS NULL THEN
    CREATE TEMP TABLE old_data_sustainability_map (legacy_id text, action_code text, note text, resolution_status text) ON COMMIT DROP;
  ELSE
    CREATE TEMP TABLE old_data_sustainability_map ON COMMIT DROP AS
    SELECT staging_object_key AS legacy_id, action_id AS action_code, note, resolution_status
    FROM staging.object_sustainability_action_temp
    WHERE import_batch_id = 'old-data-berta2-all-20260501-01';
  END IF;
END $old_data_dd$;

WITH action_ref AS (
  SELECT DISTINCT ON (code) code, id
  FROM ref_sustainability_action
  ORDER BY code, position NULLS LAST, id
), candidate_raw AS (
  SELECT DISTINCT odo.object_id, ar.id AS action_id, nullif(sm.note, '') AS note, sm.resolution_status
  FROM old_data_sustainability_map sm
  JOIN old_data_objects odo ON odo.legacy_id = sm.legacy_id
  JOIN action_ref ar ON ar.code = sm.action_code
), candidates AS (
  SELECT
    object_id,
    action_id,
    string_agg(DISTINCT note, ' | ' ORDER BY note) FILTER (WHERE note IS NOT NULL) AS note,
    string_agg(DISTINCT nullif(resolution_status, ''), ' | ' ORDER BY nullif(resolution_status, '')) FILTER (WHERE nullif(resolution_status, '') IS NOT NULL) AS resolution_status
  FROM candidate_raw
  GROUP BY object_id, action_id
)
INSERT INTO object_sustainability_action (object_id, action_id, note, created_at, updated_at)
SELECT object_id, action_id, concat_ws(' | ', 'Old_data D_Durable', note, nullif(resolution_status, '')), NOW(), NOW()
FROM candidates
ON CONFLICT (object_id, action_id) DO UPDATE
SET note = coalesce(object_sustainability_action.note, EXCLUDED.note),
    updated_at = NOW();

SELECT api.refresh_object_filter_caches(object_id)
FROM old_data_objects
ORDER BY object_id;

DO $old_data_enrichment_validation$
DECLARE
  n integer;
  missing_taxonomy integer;
  legacy_amenity integer;
  duplicate_taxonomy integer;
  duplicate_tag_links integer;
  duplicate_amenities integer;
  duplicate_environment integer;
  duplicate_classifications integer;
  single_classification_conflicts integer;
  leaked_business_subtypes integer;
BEGIN
  SELECT COUNT(*) INTO n FROM old_data_objects;
  IF n <> 837 THEN
    RAISE EXCEPTION 'Validation failed: expected 837 old-data objects, found %', n;
  END IF;

  SELECT COUNT(*) INTO missing_taxonomy
  FROM old_data_objects odo
  WHERE NOT EXISTS (
    SELECT 1
    FROM object_taxonomy ot
    JOIN old_data_taxonomy_candidates tc ON tc.object_id = ot.object_id AND tc.domain = ot.domain
    WHERE ot.object_id = odo.object_id
  );

  IF missing_taxonomy > 0 THEN
    RAISE EXCEPTION 'Validation failed: % old-data object(s) still have no taxonomy assignment in their expected domain', missing_taxonomy;
  END IF;

  SELECT COUNT(*) INTO legacy_amenity FROM ref_amenity WHERE code = 'wheelchair_access';
  IF legacy_amenity > 0 THEN
    RAISE WARNING 'Legacy amenity code wheelchair_access still exists in ref_amenity; this enrichment file did not create or use it.';
  END IF;

  SELECT coalesce(sum(dupe_count - 1), 0)::integer INTO duplicate_taxonomy
  FROM (
    SELECT ot.object_id, ot.domain, COUNT(*) AS dupe_count
    FROM object_taxonomy ot JOIN old_data_objects odo ON odo.object_id = ot.object_id
    GROUP BY ot.object_id, ot.domain HAVING COUNT(*) > 1
  ) d;

  SELECT coalesce(sum(dupe_count - 1), 0)::integer INTO duplicate_tag_links
  FROM (
    SELECT tl.target_pk, tl.tag_id, COUNT(*) AS dupe_count
    FROM tag_link tl JOIN old_data_objects odo ON odo.object_id = tl.target_pk
    WHERE tl.target_table = 'object'
    GROUP BY tl.target_pk, tl.tag_id HAVING COUNT(*) > 1
  ) d;

  SELECT coalesce(sum(dupe_count - 1), 0)::integer INTO duplicate_amenities
  FROM (
    SELECT oa.object_id, oa.amenity_id, COUNT(*) AS dupe_count
    FROM object_amenity oa JOIN old_data_objects odo ON odo.object_id = oa.object_id
    GROUP BY oa.object_id, oa.amenity_id HAVING COUNT(*) > 1
  ) d;

  SELECT coalesce(sum(dupe_count - 1), 0)::integer INTO duplicate_environment
  FROM (
    SELECT oet.object_id, oet.environment_tag_id, COUNT(*) AS dupe_count
    FROM object_environment_tag oet JOIN old_data_objects odo ON odo.object_id = oet.object_id
    GROUP BY oet.object_id, oet.environment_tag_id HAVING COUNT(*) > 1
  ) d;

  SELECT coalesce(sum(dupe_count - 1), 0)::integer INTO duplicate_classifications
  FROM (
    SELECT oc.object_id, oc.scheme_id, oc.value_id, COUNT(*) AS dupe_count
    FROM object_classification oc JOIN old_data_objects odo ON odo.object_id = oc.object_id
    GROUP BY oc.object_id, oc.scheme_id, oc.value_id HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO single_classification_conflicts
  FROM (
    SELECT oc.object_id, oc.scheme_id
    FROM object_classification oc
    JOIN old_data_objects odo ON odo.object_id = oc.object_id
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    WHERE s.selection = 'single'
      AND oc.status = 'granted'
    GROUP BY oc.object_id, oc.scheme_id
    HAVING COUNT(DISTINCT oc.value_id) > 1
  ) d;

  SELECT COUNT(*) INTO leaked_business_subtypes
  FROM object_classification oc
  JOIN old_data_objects odo ON odo.object_id = oc.object_id
  JOIN ref_classification_scheme s ON s.id = oc.scheme_id
  WHERE s.code IN ('type_hot', 'type_act', 'retail_category');

  IF duplicate_taxonomy > 0 THEN RAISE WARNING 'Redundancy audit: % duplicate object_taxonomy rows found for old-data objects.', duplicate_taxonomy; END IF;
  IF duplicate_tag_links > 0 THEN RAISE WARNING 'Redundancy audit: % duplicate tag_link rows found for old-data objects.', duplicate_tag_links; END IF;
  IF duplicate_amenities > 0 THEN RAISE WARNING 'Redundancy audit: % duplicate object_amenity rows found for old-data objects.', duplicate_amenities; END IF;
  IF duplicate_environment > 0 THEN RAISE WARNING 'Redundancy audit: % duplicate object_environment_tag rows found for old-data objects.', duplicate_environment; END IF;
  IF duplicate_classifications > 0 THEN RAISE WARNING 'Redundancy audit: % duplicate object_classification rows found for old-data objects.', duplicate_classifications; END IF;
  IF single_classification_conflicts > 0 THEN RAISE WARNING 'Redundancy audit: % old-data object(s) already have conflicting granted values in a single-selection classification scheme.', single_classification_conflicts; END IF;
  IF leaked_business_subtypes > 0 THEN
    RAISE EXCEPTION 'Validation failed: % old-data business subtype classification row(s) remain in object_classification. Subtypes must live in object_taxonomy.', leaked_business_subtypes;
  END IF;
END $old_data_enrichment_validation$;

SELECT 'old_data_objects' AS check_name, COUNT(*) AS rows FROM old_data_objects
UNION ALL SELECT 'taxonomy_assignments', COUNT(*) FROM old_data_taxonomy_candidates tc JOIN object_taxonomy ot ON ot.object_id = tc.object_id AND ot.domain = tc.domain
UNION ALL SELECT 'tag_links', COUNT(*) FROM old_data_tag_candidates tc JOIN tag_link tl ON tl.target_table = 'object' AND tl.target_pk = tc.object_id JOIN ref_tag rt ON rt.id = tl.tag_id AND rt.slug = tc.slug
UNION ALL SELECT 'amenity_links', COUNT(*) FROM old_data_amenity_candidates ac JOIN object_amenity oa ON oa.object_id = ac.object_id JOIN ref_amenity ra ON ra.id = oa.amenity_id AND ra.code = ac.code
UNION ALL SELECT 'environment_links', COUNT(*) FROM old_data_environment_candidates ec JOIN object_environment_tag oet ON oet.object_id = ec.object_id JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id AND et.code = ec.code
UNION ALL SELECT 'classification_links', COUNT(*) FROM old_data_objects odo JOIN object_classification oc ON oc.object_id = odo.object_id AND oc.source = 'old_data_enrichment_20260512'
UNION ALL SELECT 'sustainability_actions', COUNT(*) FROM old_data_objects odo JOIN object_sustainability_action osa ON osa.object_id = odo.object_id
UNION ALL SELECT 'duplicate_classification_rows', coalesce(sum(dupe_count - 1), 0)::bigint FROM (
  SELECT oc.object_id, oc.scheme_id, oc.value_id, COUNT(*) AS dupe_count
  FROM object_classification oc JOIN old_data_objects odo ON odo.object_id = oc.object_id
  GROUP BY oc.object_id, oc.scheme_id, oc.value_id HAVING COUNT(*) > 1
) d
UNION ALL SELECT 'single_classification_conflicts', COUNT(*) FROM (
  SELECT oc.object_id, oc.scheme_id
  FROM object_classification oc
  JOIN old_data_objects odo ON odo.object_id = oc.object_id
  JOIN ref_classification_scheme s ON s.id = oc.scheme_id
  WHERE s.selection = 'single'
    AND oc.status = 'granted'
  GROUP BY oc.object_id, oc.scheme_id
  HAVING COUNT(DISTINCT oc.value_id) > 1
) d;

COMMIT;

DO $old_data_refresh_mv$
BEGIN
  IF to_regclass('internal.mv_filtered_objects') IS NOT NULL THEN
    EXECUTE 'REFRESH MATERIALIZED VIEW internal.mv_filtered_objects';
  END IF;
END $old_data_refresh_mv$;

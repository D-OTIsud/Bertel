-- ===========================================================================
-- Old_data hotfix: correct Berta transport/service objects imported as ORG
-- Generated: 2026-05-14
--
-- Scope:
-- - 15 Berta v2 objects matched through object_external_id.source_system.
-- - Reclassifies 14 transport/leisure-rental records from ORG to PSV.
-- - Reclassifies 1 wellness/massage record from ORG to ACT.
-- - Moves taxonomy from taxonomy_org to taxonomy_psv/taxonomy_act.
--
-- This is intentionally an in-place correction, not a delete/reinsert:
-- media, contacts, locations, descriptions, CRM links, actor roles, payments,
-- labels, and object_external_id rows remain attached to the same object ids.
-- ===========================================================================

BEGIN;

CREATE TEMP TABLE old_data_type_correction_map (
  legacy_id text PRIMARY KEY,
  expected_name text NOT NULL,
  target_object_type text NOT NULL,
  target_domain text NOT NULL,
  parent_code text,
  parent_name text,
  leaf_code text NOT NULL,
  leaf_name text NOT NULL,
  correction_reason text NOT NULL
) ON COMMIT DROP;

INSERT INTO old_data_type_correction_map (
  legacy_id,
  expected_name,
  target_object_type,
  target_domain,
  parent_code,
  parent_name,
  leaf_code,
  leaf_name,
  correction_reason
) VALUES
  ('recsinOHawUF3oqCt', 'Austral Taxis Réunion', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'tourist_excursion_transport', 'Excursion touristique en transport', 'Transport provider imported as ORG'),
  ('b652da63', 'VTC ALP Réunion', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'vtc', 'VTC', 'Transport provider imported as ORG'),
  ('recjjoewAKm3r8jAv', 'Travel Island', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'tourist_excursion_transport', 'Excursion touristique en transport', 'Transport provider imported as ORG'),
  ('5c171a96', 'VTC POININ COULIN', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'vtc', 'VTC', 'Transport provider imported as ORG'),
  ('6e009b41', 'Destination Bien Être', 'ACT', 'taxonomy_act', NULL, NULL, 'fitness_wellness', 'Remise en forme / Fitness', 'Wellness activity imported as ORG'),
  ('recpy7o2HPIDgzItk', 'VTC Réunion', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'vtc', 'VTC', 'Transport provider imported as ORG'),
  ('a1a9fa58', 'Couleurs du Sud Sauvage -  EXCURSIONS', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'private_driver', 'Voiture avec chauffeur', 'Transport provider imported as ORG'),
  ('recp0PF6BVL6MwiUP', 'Run Sud VTC', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'private_driver', 'Voiture avec chauffeur', 'Transport provider imported as ORG'),
  ('cbf4f863', 'Vel''Hauts Run', 'PSV', 'taxonomy_psv', 'leisure_equipment_rental', 'Location de matériel de loisirs', 'cycle_scooter_rental', 'Location de vélos et trottinettes', 'Leisure rental service imported as ORG'),
  ('recMMMvP8mGoaRGgO', 'DG-TROT', 'PSV', 'taxonomy_psv', 'leisure_equipment_rental', 'Location de matériel de loisirs', 'cycle_scooter_rental', 'Location de vélos et trottinettes', 'Leisure rental service imported as ORG'),
  ('f18563bc', 'TRANSPORTANOU', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'vtc', 'VTC', 'Transport provider imported as ORG'),
  ('recd2tgUGHFZVOMtm', 'Couloutchy Transports', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'tourist_excursion_transport', 'Excursion touristique en transport', 'Transport provider imported as ORG'),
  ('2609e9e8', 'TRANSPORT MAILLOT', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'private_driver', 'Voiture avec chauffeur', 'Transport provider imported as ORG'),
  ('e6d7c9a1', '5A Transports', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'vtc', 'VTC', 'Transport provider imported as ORG'),
  ('828017bf', 'KREOL TOURS REUNION', 'PSV', 'taxonomy_psv', 'transport_mobility', 'Transport et mobilité', 'tourist_excursion_transport', 'Excursion touristique en transport', 'Transport provider imported as ORG');

CREATE TEMP TABLE old_data_type_correction_targets ON COMMIT DROP AS
SELECT DISTINCT ON (m.legacy_id)
  m.*,
  oei.object_id,
  o.name AS current_name,
  o.object_type::text AS current_object_type,
  o.status::text AS current_status
FROM old_data_type_correction_map m
JOIN object_external_id oei
  ON oei.source_system = 'berta_v2_csv_export'
 AND oei.external_id = m.legacy_id
JOIN object o
  ON o.id = oei.object_id
ORDER BY m.legacy_id, oei.updated_at DESC NULLS LAST, oei.created_at DESC NULLS LAST;

DO $assert_targets$
DECLARE
  found_n integer;
  expected_n integer;
  bad_type_n integer;
  used_as_org_n integer;
BEGIN
  SELECT COUNT(*) INTO found_n FROM old_data_type_correction_targets;
  SELECT COUNT(*) INTO expected_n FROM old_data_type_correction_map;

  IF found_n <> expected_n THEN
    RAISE EXCEPTION 'Old_data type correction expected % matched objects, found %', expected_n, found_n
      USING HINT = 'Check object_external_id.source_system = berta_v2_csv_export and the legacy ids in this file.';
  END IF;

  SELECT COUNT(*) INTO bad_type_n
  FROM old_data_type_correction_targets
  WHERE current_object_type NOT IN ('ORG', target_object_type);

  IF bad_type_n > 0 THEN
    RAISE EXCEPTION 'Old_data type correction found % object(s) already using an unexpected object_type', bad_type_n;
  END IF;

  SELECT COUNT(*) INTO used_as_org_n
  FROM object_org_link l
  JOIN old_data_type_correction_targets t
    ON t.object_id = l.org_object_id;

  IF used_as_org_n > 0 THEN
    RAISE EXCEPTION 'Old_data type correction refused: % target object(s) are used as org_object_id in object_org_link', used_as_org_n
      USING HINT = 'Review those relationships before converting these objects out of ORG.';
  END IF;
END $assert_targets$;

INSERT INTO ref_code_domain_registry (
  domain,
  name,
  description,
  object_type,
  is_hierarchical,
  is_taxonomy,
  position,
  is_active,
  name_i18n,
  description_i18n,
  metadata
) VALUES
  ('taxonomy_act', 'Taxonomie ACT', 'Sous-catégories métier pour les activités encadrées.', 'ACT'::object_type, TRUE, TRUE, 20, TRUE, jsonb_build_object('fr', 'Taxonomie ACT'), jsonb_build_object('fr', 'Sous-catégories métier pour les activités encadrées.'), jsonb_build_object('source', 'old_data_type_correction_20260514')),
  ('taxonomy_psv', 'Taxonomie PSV', 'Sous-catégories métier pour prestations de services.', 'PSV'::object_type, TRUE, TRUE, 80, TRUE, jsonb_build_object('fr', 'Taxonomie PSV'), jsonb_build_object('fr', 'Sous-catégories métier pour prestations de services.'), jsonb_build_object('source', 'old_data_type_correction_20260514'))
ON CONFLICT (domain) DO UPDATE
SET object_type = EXCLUDED.object_type,
    is_hierarchical = TRUE,
    is_taxonomy = TRUE,
    is_active = TRUE,
    name_i18n = coalesce(ref_code_domain_registry.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code_domain_registry.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    metadata = coalesce(ref_code_domain_registry.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
VALUES
  ('taxonomy_act', 'root', 'ACT', 'Racine technique Taxonomie ACT', 0, NULL, FALSE, jsonb_build_object('source', 'old_data_type_correction_20260514'), jsonb_build_object('fr', 'ACT'), jsonb_build_object('fr', 'Racine technique Taxonomie ACT')),
  ('taxonomy_psv', 'root', 'PSV', 'Racine technique Taxonomie PSV', 0, NULL, FALSE, jsonb_build_object('source', 'old_data_type_correction_20260514'), jsonb_build_object('fr', 'PSV'), jsonb_build_object('fr', 'Racine technique Taxonomie PSV'))
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_assignable = FALSE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

WITH parent_nodes AS (
  SELECT DISTINCT target_domain AS domain, parent_code AS code, parent_name AS name
  FROM old_data_type_correction_targets
  WHERE parent_code IS NOT NULL
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
  jsonb_build_object('source', 'old_data_type_correction_20260514', 'level', 'corrected_category'),
  jsonb_build_object('fr', p.name),
  jsonb_build_object('fr', p.name)
FROM parent_nodes p
JOIN roots r
  ON r.domain = p.domain
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id,
    is_assignable = FALSE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

WITH leaf_nodes AS (
  SELECT DISTINCT target_domain AS domain, leaf_code AS code, leaf_name AS name, parent_code
  FROM old_data_type_correction_targets
), roots AS (
  SELECT domain, id
  FROM ref_code
  WHERE code = 'root'
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
  jsonb_build_object('source', 'old_data_type_correction_20260514', 'level', 'corrected_subcategory'),
  jsonb_build_object('fr', l.name),
  jsonb_build_object('fr', l.name)
FROM leaf_nodes l
JOIN roots root
  ON root.domain = l.domain
LEFT JOIN parents parent
  ON parent.domain = l.domain
 AND parent.code = l.parent_code
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id,
    is_assignable = TRUE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    name_i18n = coalesce(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    updated_at = NOW();

SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_act');
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_psv');

DELETE FROM object_taxonomy ot
USING old_data_type_correction_targets t
WHERE ot.object_id = t.object_id
  AND ot.domain = 'taxonomy_org';

UPDATE object o
SET object_type = t.target_object_type::object_type,
    extra = coalesce(o.extra, '{}'::jsonb)
      || jsonb_build_object(
        'old_data_type_correction',
        jsonb_build_object(
          'corrected_at', NOW(),
          'source', 'old_data_type_correction_20260514',
          'legacy_id', t.legacy_id,
          'from_object_type', o.object_type::text,
          'to_object_type', t.target_object_type,
          'reason', t.correction_reason
        )
      ),
    updated_at = NOW()
FROM old_data_type_correction_targets t
WHERE o.id = t.object_id
  AND o.object_type::text IS DISTINCT FROM t.target_object_type;

WITH taxonomy_rows AS (
  SELECT
    t.object_id,
    t.target_domain AS domain,
    rc.id AS ref_code_id,
    concat_ws(' | ', 'Berta old-data type correction', t.expected_name, t.correction_reason) AS note
  FROM old_data_type_correction_targets t
  JOIN ref_code rc
    ON rc.domain = t.target_domain
   AND rc.code = t.leaf_code
)
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note, created_at, updated_at)
SELECT
  tr.object_id,
  tr.domain,
  tr.ref_code_id,
  'old_data_type_correction_20260514',
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
   OR object_taxonomy.source LIKE 'old_data_%';

DO $refresh_caches$
BEGIN
  IF to_regprocedure('api.refresh_object_filter_caches(text)') IS NOT NULL THEN
    PERFORM api.refresh_object_filter_caches(object_id)
    FROM old_data_type_correction_targets;
  END IF;
END $refresh_caches$;

DO $assert_result$
DECLARE
  still_org_n integer;
  missing_taxonomy_n integer;
  lingering_org_taxonomy_n integer;
  archived_n integer;
BEGIN
  SELECT COUNT(*) INTO still_org_n
  FROM object o
  JOIN old_data_type_correction_targets t
    ON t.object_id = o.id
  WHERE o.object_type::text <> t.target_object_type;

  IF still_org_n > 0 THEN
    RAISE EXCEPTION 'Old_data type correction failed: % object(s) still have the wrong object_type', still_org_n;
  END IF;

  SELECT COUNT(*) INTO missing_taxonomy_n
  FROM old_data_type_correction_targets t
  WHERE NOT EXISTS (
    SELECT 1
    FROM object_taxonomy ot
    JOIN ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE ot.object_id = t.object_id
      AND ot.domain = t.target_domain
      AND rc.code = t.leaf_code
  );

  IF missing_taxonomy_n > 0 THEN
    RAISE EXCEPTION 'Old_data type correction failed: % object(s) missing corrected taxonomy', missing_taxonomy_n;
  END IF;

  SELECT COUNT(*) INTO lingering_org_taxonomy_n
  FROM object_taxonomy ot
  JOIN old_data_type_correction_targets t
    ON t.object_id = ot.object_id
  WHERE ot.domain = 'taxonomy_org';

  IF lingering_org_taxonomy_n > 0 THEN
    RAISE EXCEPTION 'Old_data type correction failed: % old taxonomy_org assignment(s) remain', lingering_org_taxonomy_n;
  END IF;

  SELECT COUNT(*) INTO archived_n
  FROM object o
  JOIN old_data_type_correction_targets t
    ON t.object_id = o.id
  WHERE o.status = 'archived';

  IF archived_n > 0 THEN
    RAISE EXCEPTION 'Old_data type correction failed: % corrected object(s) are archived', archived_n;
  END IF;
END $assert_result$;

SELECT
  target_object_type AS object_type,
  target_domain AS taxonomy_domain,
  leaf_code AS taxonomy_code,
  COUNT(*) AS corrected_objects
FROM old_data_type_correction_targets
GROUP BY target_object_type, target_domain, leaf_code
ORDER BY target_object_type, target_domain, leaf_code;

COMMIT;

DO $refresh_filtered_mv$
BEGIN
  IF to_regclass('internal.mv_filtered_objects') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped internal.mv_filtered_objects refresh: insufficient privilege. Wait for the scheduled refresh or run it as the database owner.';
  WHEN undefined_table THEN
    RAISE NOTICE 'Skipped internal.mv_filtered_objects refresh: materialized view not found.';
END $refresh_filtered_mv$;

NOTIFY pgrst, 'reload schema';

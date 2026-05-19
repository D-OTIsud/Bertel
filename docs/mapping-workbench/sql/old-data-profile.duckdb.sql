-- Bertel old-data profiling workbench.
-- Run from the repository root:
--   duckdb old-data-profile.duckdb -c ".read docs/mapping-workbench/sql/old-data-profile.duckdb.sql"
--
-- This is read-only. It queries the cleaned CSV bundle directly.

CREATE OR REPLACE VIEW object_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_location_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_location_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_description_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_description_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_capacity_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_capacity_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_language_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_language_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_payment_method_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_payment_method_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW contact_channel_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/contact_channel_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW actor_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/actor_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW actor_channel_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/actor_channel_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW actor_object_role_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/actor_object_role_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_price_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_price_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW opening_period_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/opening_period_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW object_sustainability_action_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/object_sustainability_action_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW crm_interaction_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/crm_interaction_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW crm_comment_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/crm_comment_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW media_galerie_lot1_temp AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/media_galerie_lot1_temp.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW old_data_object_id_coverage AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/old_data_object_id_coverage.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW old_data_review_mapped AS
SELECT * FROM read_csv_auto('Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/old_data_review_mapped.csv', header = true, all_varchar = true);

CREATE OR REPLACE VIEW table_counts AS
SELECT 'object_temp' AS table_name, COUNT(*) AS rows FROM object_temp
UNION ALL SELECT 'object_location_temp', COUNT(*) FROM object_location_temp
UNION ALL SELECT 'object_description_temp', COUNT(*) FROM object_description_temp
UNION ALL SELECT 'object_capacity_temp', COUNT(*) FROM object_capacity_temp
UNION ALL SELECT 'object_language_temp', COUNT(*) FROM object_language_temp
UNION ALL SELECT 'object_payment_method_temp', COUNT(*) FROM object_payment_method_temp
UNION ALL SELECT 'contact_channel_temp', COUNT(*) FROM contact_channel_temp
UNION ALL SELECT 'actor_temp', COUNT(*) FROM actor_temp
UNION ALL SELECT 'actor_channel_temp', COUNT(*) FROM actor_channel_temp
UNION ALL SELECT 'actor_object_role_temp', COUNT(*) FROM actor_object_role_temp
UNION ALL SELECT 'object_price_temp', COUNT(*) FROM object_price_temp
UNION ALL SELECT 'opening_period_temp', COUNT(*) FROM opening_period_temp
UNION ALL SELECT 'object_sustainability_action_temp', COUNT(*) FROM object_sustainability_action_temp
UNION ALL SELECT 'crm_interaction_temp', COUNT(*) FROM crm_interaction_temp
UNION ALL SELECT 'crm_comment_temp', COUNT(*) FROM crm_comment_temp
UNION ALL SELECT 'media_galerie_lot1_temp', COUNT(*) FROM media_galerie_lot1_temp
UNION ALL SELECT 'old_data_object_id_coverage', COUNT(*) FROM old_data_object_id_coverage
UNION ALL SELECT 'old_data_review_mapped', COUNT(*) FROM old_data_review_mapped;

CREATE OR REPLACE VIEW satellite_object_refs AS
SELECT 'object_location_temp' AS source_table, staging_object_key FROM object_location_temp
UNION ALL SELECT 'object_description_temp', staging_object_key FROM object_description_temp
UNION ALL SELECT 'object_capacity_temp', staging_object_key FROM object_capacity_temp
UNION ALL SELECT 'object_language_temp', staging_object_key FROM object_language_temp
UNION ALL SELECT 'object_payment_method_temp', staging_object_key FROM object_payment_method_temp
UNION ALL SELECT 'contact_channel_temp', staging_object_key FROM contact_channel_temp
UNION ALL SELECT 'actor_temp', staging_object_key FROM actor_temp
UNION ALL SELECT 'actor_object_role_temp', staging_object_key FROM actor_object_role_temp
UNION ALL SELECT 'object_price_temp', staging_object_key FROM object_price_temp
UNION ALL SELECT 'opening_period_temp', staging_object_key FROM opening_period_temp
UNION ALL SELECT 'object_sustainability_action_temp', staging_object_key FROM object_sustainability_action_temp
UNION ALL SELECT 'crm_interaction_temp', staging_object_key FROM crm_interaction_temp
UNION ALL SELECT 'media_galerie_lot1_temp', legacy_formulaire AS staging_object_key FROM media_galerie_lot1_temp;

CREATE OR REPLACE VIEW satellite_object_refs_summary AS
SELECT
  source_table,
  COUNT(*) AS rows,
  COUNT(DISTINCT staging_object_key) AS distinct_object_refs,
  COUNT(*) FILTER (WHERE staging_object_key IS NULL OR trim(staging_object_key) = '') AS blank_object_refs
FROM satellite_object_refs
GROUP BY source_table
ORDER BY source_table;

CREATE OR REPLACE VIEW satellite_refs_missing_main_object AS
SELECT
  r.source_table,
  r.staging_object_key,
  COUNT(*) AS rows
FROM satellite_object_refs r
LEFT JOIN object_temp o
  ON o.staging_object_key = r.staging_object_key
WHERE COALESCE(trim(r.staging_object_key), '') <> ''
  AND o.staging_object_key IS NULL
GROUP BY r.source_table, r.staging_object_key
ORDER BY rows DESC, r.source_table, r.staging_object_key;

CREATE OR REPLACE VIEW objects_without_core_surface AS
SELECT
  o.staging_object_key,
  o.object_type,
  o.name,
  CASE WHEN l.staging_object_key IS NULL THEN true ELSE false END AS missing_location,
  CASE WHEN d.staging_object_key IS NULL THEN true ELSE false END AS missing_description,
  CASE WHEN c.staging_object_key IS NULL THEN true ELSE false END AS missing_contact,
  CASE WHEN m.legacy_formulaire IS NULL THEN true ELSE false END AS missing_media
FROM object_temp o
LEFT JOIN (SELECT DISTINCT staging_object_key FROM object_location_temp) l USING (staging_object_key)
LEFT JOIN (SELECT DISTINCT staging_object_key FROM object_description_temp) d USING (staging_object_key)
LEFT JOIN (SELECT DISTINCT staging_object_key FROM contact_channel_temp) c USING (staging_object_key)
LEFT JOIN (SELECT DISTINCT legacy_formulaire FROM media_galerie_lot1_temp) m
  ON m.legacy_formulaire = o.staging_object_key
WHERE l.staging_object_key IS NULL
   OR d.staging_object_key IS NULL
   OR c.staging_object_key IS NULL
   OR m.legacy_formulaire IS NULL
ORDER BY object_type, name;

CREATE OR REPLACE VIEW duplicate_object_contacts AS
SELECT
  staging_object_key,
  lower(trim(kind_code)) AS kind_code,
  lower(trim(value)) AS normalized_value,
  COUNT(*) AS rows
FROM contact_channel_temp
WHERE COALESCE(trim(value), '') <> ''
GROUP BY staging_object_key, lower(trim(kind_code)), lower(trim(value))
HAVING COUNT(*) > 1
ORDER BY rows DESC, staging_object_key, kind_code, normalized_value;

CREATE OR REPLACE VIEW duplicate_actor_channels AS
SELECT
  staging_actor_key,
  lower(trim(kind_code)) AS kind_code,
  lower(trim(value)) AS normalized_value,
  COUNT(*) AS rows
FROM actor_channel_temp
WHERE COALESCE(trim(value), '') <> ''
GROUP BY staging_actor_key, lower(trim(kind_code)), lower(trim(value))
HAVING COUNT(*) > 1
ORDER BY rows DESC, staging_actor_key, kind_code, normalized_value;

CREATE OR REPLACE VIEW crm_interaction_legacy_ids AS
SELECT DISTINCT json_extract_string(raw_source_data, '$.ID') AS legacy_crm_id
FROM crm_interaction_temp
WHERE COALESCE(trim(json_extract_string(raw_source_data, '$.ID')), '') <> '';

CREATE OR REPLACE VIEW crm_comment_parent_refs_summary AS
SELECT
  COUNT(*) AS rows,
  COUNT(DISTINCT parent_legacy_crm_id) AS distinct_parent_refs,
  COUNT(*) FILTER (WHERE parent_legacy_crm_id IS NULL OR trim(parent_legacy_crm_id) = '') AS blank_parent_refs
FROM crm_comment_temp;

CREATE OR REPLACE VIEW crm_comment_parent_refs_missing_parent AS
SELECT
  c.parent_legacy_crm_id,
  COUNT(*) AS rows
FROM crm_comment_temp c
LEFT JOIN crm_interaction_legacy_ids p
  ON p.legacy_crm_id = c.parent_legacy_crm_id
WHERE COALESCE(trim(c.parent_legacy_crm_id), '') <> ''
  AND p.legacy_crm_id IS NULL
GROUP BY c.parent_legacy_crm_id
ORDER BY rows DESC, c.parent_legacy_crm_id;

CREATE OR REPLACE VIEW invalid_coordinates AS
SELECT
  staging_object_key,
  latitude,
  longitude,
  city,
  address1
FROM object_location_temp
WHERE (COALESCE(trim(latitude), '') = '' AND COALESCE(trim(longitude), '') <> '')
   OR (COALESCE(trim(latitude), '') <> '' AND COALESCE(trim(longitude), '') = '')
   OR try_cast(latitude AS DOUBLE) NOT BETWEEN -90 AND 90
   OR try_cast(longitude AS DOUBLE) NOT BETWEEN -180 AND 180;

CREATE OR REPLACE VIEW review_mapped_type_counts AS
SELECT
  provisional_object_type,
  reason,
  COUNT(*) AS rows
FROM old_data_review_mapped
GROUP BY provisional_object_type, reason
ORDER BY rows DESC, provisional_object_type, reason;

CREATE OR REPLACE VIEW coverage_status_counts AS
SELECT coverage_status, COUNT(*) AS rows
FROM old_data_object_id_coverage
GROUP BY coverage_status
ORDER BY rows DESC, coverage_status;

SELECT 'table_counts' AS report, * FROM table_counts ORDER BY table_name;

SELECT 'object_type_counts' AS report, object_type, status, commercial_visibility, COUNT(*) AS rows
FROM object_temp
GROUP BY object_type, status, commercial_visibility
ORDER BY rows DESC, object_type;

SELECT 'satellite_object_refs_summary' AS report, * FROM satellite_object_refs_summary;

SELECT 'satellite_refs_missing_main_object' AS report, * FROM satellite_refs_missing_main_object;

SELECT 'objects_without_core_surface' AS report, * FROM objects_without_core_surface;

SELECT 'duplicate_object_contacts' AS report, * FROM duplicate_object_contacts;

SELECT 'duplicate_actor_channels' AS report, * FROM duplicate_actor_channels;

SELECT 'crm_comment_parent_refs_summary' AS report, * FROM crm_comment_parent_refs_summary;

SELECT 'crm_comment_parent_refs_missing_parent' AS report, * FROM crm_comment_parent_refs_missing_parent;

SELECT 'invalid_coordinates' AS report, * FROM invalid_coordinates;

SELECT 'review_mapped_type_counts' AS report, * FROM review_mapped_type_counts;

SELECT 'coverage_status_counts' AS report, * FROM coverage_status_counts;

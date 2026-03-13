-- Cleanup migration: remove legacy contact/location fields from staging.object_temp
-- after migrating any remaining values into the proper staging satellite tables.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'staging'
      AND table_name = 'object_temp'
      AND column_name = 'email'
  ) THEN
    EXECUTE $sql$
      INSERT INTO staging.contact_channel_temp (
        import_batch_id,
        staging_object_key,
        kind_code,
        value,
        source_sheet,
        is_public,
        is_primary,
        raw_source_data,
        resolution_status,
        is_approved
      )
      SELECT
        o.import_batch_id,
        o.staging_object_key,
        'email',
        o.email,
        o.source_sheet,
        TRUE,
        TRUE,
        o.raw_source_data,
        COALESCE(o.resolution_status, 'pending'),
        o.is_approved
      FROM staging.object_temp o
      WHERE o.email IS NOT NULL
        AND btrim(o.email) <> ''
        AND o.staging_object_key IS NOT NULL
      ON CONFLICT (import_batch_id, staging_object_key, kind_code, value) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'staging'
      AND table_name = 'object_temp'
      AND column_name = 'phone'
  ) THEN
    EXECUTE $sql$
      INSERT INTO staging.contact_channel_temp (
        import_batch_id,
        staging_object_key,
        kind_code,
        value,
        source_sheet,
        is_public,
        is_primary,
        raw_source_data,
        resolution_status,
        is_approved
      )
      SELECT
        o.import_batch_id,
        o.staging_object_key,
        'phone',
        o.phone,
        o.source_sheet,
        TRUE,
        TRUE,
        o.raw_source_data,
        COALESCE(o.resolution_status, 'pending'),
        o.is_approved
      FROM staging.object_temp o
      WHERE o.phone IS NOT NULL
        AND btrim(o.phone) <> ''
        AND o.staging_object_key IS NOT NULL
      ON CONFLICT (import_batch_id, staging_object_key, kind_code, value) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'staging'
      AND table_name = 'object_temp'
      AND column_name = 'latitude'
  ) OR EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'staging'
      AND table_name = 'object_temp'
      AND column_name = 'longitude'
  ) THEN
    EXECUTE $sql$
      INSERT INTO staging.object_location_temp (
        import_batch_id,
        staging_object_key,
        latitude,
        longitude,
        source_sheet,
        is_main_location,
        raw_source_data,
        resolution_status,
        is_approved
      )
      SELECT
        o.import_batch_id,
        o.staging_object_key,
        o.latitude,
        o.longitude,
        o.source_sheet,
        TRUE,
        o.raw_source_data,
        COALESCE(o.resolution_status, 'pending'),
        o.is_approved
      FROM staging.object_temp o
      WHERE o.latitude IS NOT NULL
        AND o.longitude IS NOT NULL
        AND o.staging_object_key IS NOT NULL
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;
END $$;

DROP INDEX IF EXISTS staging.idx_object_temp_email;
DROP INDEX IF EXISTS staging.idx_object_temp_phone;
DROP INDEX IF EXISTS staging.idx_object_temp_latlon;

ALTER TABLE IF EXISTS staging.object_temp
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

CREATE OR REPLACE FUNCTION staging.run_dedup_for_batch(
    p_batch_id TEXT,
    p_distance_meters INTEGER DEFAULT 50,
    p_name_similarity REAL DEFAULT 0.45
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_exact_count INTEGER := 0;
DECLARE v_conflict_count INTEGER := 0;
DECLARE v_new_count INTEGER := 0;
BEGIN
    UPDATE staging.object_temp
    SET deduplication_status = 'pending',
        matched_public_object_id = NULL,
        ai_merge_proposal = NULL
    WHERE import_batch_id = p_batch_id
      AND deduplication_status IN ('pending', 'new', 'exact_update', 'ai_conflict');

    WITH staging_contact_values AS (
        SELECT
            o.import_row_id,
            MAX(CASE WHEN lower(c.kind_code) = 'email' THEN lower(c.value) END) AS email_value,
            MAX(CASE WHEN lower(c.kind_code) IN ('phone', 'telephone', 'mobile') THEN staging.normalize_phone(c.value) END) AS phone_value
        FROM staging.object_temp o
        LEFT JOIN staging.contact_channel_temp c
          ON c.import_batch_id = o.import_batch_id
         AND c.staging_object_key = o.staging_object_key
        WHERE o.import_batch_id = p_batch_id
        GROUP BY o.import_row_id
    ), exact_candidates AS (
        SELECT
            s.import_row_id,
            COALESCE(
                (
                    SELECT oei.object_id
                    FROM object_external_id oei
                    WHERE s.external_id IS NOT NULL
                      AND s.source_org_object_id IS NOT NULL
                      AND oei.organization_object_id = s.source_org_object_id
                      AND oei.external_id = s.external_id
                    LIMIT 1
                ),
                (
                    SELECT cc.object_id
                    FROM contact_channel cc
                    JOIN ref_code_contact_kind k ON k.id = cc.kind_id
                    WHERE sc.email_value IS NOT NULL
                      AND lower(k.code) = 'email'
                      AND lower(cc.value) = sc.email_value
                    LIMIT 1
                ),
                (
                    SELECT cc2.object_id
                    FROM contact_channel cc2
                    JOIN ref_code_contact_kind k2 ON k2.id = cc2.kind_id
                    WHERE sc.phone_value IS NOT NULL
                      AND lower(k2.code) IN ('phone', 'telephone', 'mobile')
                      AND staging.normalize_phone(cc2.value) = sc.phone_value
                    LIMIT 1
                )
            ) AS matched_id
        FROM staging.object_temp s
        LEFT JOIN staging_contact_values sc ON sc.import_row_id = s.import_row_id
        WHERE s.import_batch_id = p_batch_id
    )
    UPDATE staging.object_temp s
    SET deduplication_status = 'exact_update',
        matched_public_object_id = e.matched_id
    FROM exact_candidates e
    WHERE s.import_row_id = e.import_row_id
      AND e.matched_id IS NOT NULL;

    GET DIAGNOSTICS v_exact_count = ROW_COUNT;

    WITH staging_main_location AS (
        SELECT DISTINCT ON (o.import_row_id)
            o.import_row_id,
            l.latitude,
            l.longitude
        FROM staging.object_temp o
        JOIN staging.object_location_temp l
          ON l.import_batch_id = o.import_batch_id
         AND l.staging_object_key = o.staging_object_key
        WHERE o.import_batch_id = p_batch_id
          AND l.latitude IS NOT NULL
          AND l.longitude IS NOT NULL
        ORDER BY o.import_row_id, l.is_main_location DESC, l.updated_at DESC, l.created_at DESC
    ), fuzzy_candidates AS (
        SELECT
            s.import_row_id,
            o.id AS candidate_id,
            similarity(o.name_normalized, immutable_unaccent(lower(COALESCE(s.name, '')))) AS name_sim,
            ST_Distance(
                ol.geog2,
                ST_SetSRID(ST_MakePoint(loc.longitude, loc.latitude), 4326)::geography
            ) AS distance_m,
            ROW_NUMBER() OVER (
                PARTITION BY s.import_row_id
                ORDER BY
                    similarity(o.name_normalized, immutable_unaccent(lower(COALESCE(s.name, '')))) DESC,
                    ST_Distance(ol.geog2, ST_SetSRID(ST_MakePoint(loc.longitude, loc.latitude), 4326)::geography) ASC
            ) AS rn
        FROM staging.object_temp s
        JOIN staging_main_location loc ON loc.import_row_id = s.import_row_id
        JOIN object o ON TRUE
        JOIN object_location ol
          ON ol.object_id = o.id
         AND ol.is_main_location IS TRUE
        WHERE s.import_batch_id = p_batch_id
          AND s.deduplication_status = 'pending'
          AND s.name IS NOT NULL
          AND ol.geog2 IS NOT NULL
          AND ST_DWithin(
              ol.geog2,
              ST_SetSRID(ST_MakePoint(loc.longitude, loc.latitude), 4326)::geography,
              p_distance_meters
          )
          AND similarity(o.name_normalized, immutable_unaccent(lower(COALESCE(s.name, '')))) >= p_name_similarity
    )
    UPDATE staging.object_temp s
    SET deduplication_status = 'ai_conflict',
        matched_public_object_id = f.candidate_id,
        ai_merge_proposal = jsonb_build_object(
            'reason', 'fuzzy_name_plus_distance',
            'candidate_id', f.candidate_id,
            'name_similarity', round(f.name_sim::numeric, 4),
            'distance_meters', round(f.distance_m::numeric, 2),
            'proposed_action', 'review_merge'
        )
    FROM fuzzy_candidates f
    WHERE s.import_row_id = f.import_row_id
      AND f.rn = 1;

    GET DIAGNOSTICS v_conflict_count = ROW_COUNT;

    UPDATE staging.object_temp
    SET deduplication_status = 'new'
    WHERE import_batch_id = p_batch_id
      AND deduplication_status = 'pending';
    GET DIAGNOSTICS v_new_count = ROW_COUNT;

    UPDATE staging.import_batches
    SET status = 'deduplicated'
    WHERE batch_id = p_batch_id;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'exact_update', v_exact_count,
        'ai_conflict', v_conflict_count,
        'new', v_new_count
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Media Lot 1 — 01 : Réconciliation galerie
-- Usage psql : \set batch_id 'votre-batch-id'
--              puis \i media_lot1_01_reconcile.sql
-- Prérequis : crm_lot1_01_prereq.sql doit avoir été exécuté
--             (object_external_id peuplé pour source_system='berta_v2_csv_export')
-- =============================================================================

DO $recon_media$
DECLARE
    v_batch_id TEXT := :'batch_id';
    v_org_id   TEXT;
    n          INTEGER;
BEGIN
    -- Résoudre l'org OTI une seule fois — lève une exception si absent ou ambigu
    SELECT id::text INTO STRICT v_org_id
    FROM object
    WHERE object_type = 'ORG'
      AND name        = 'OTI du Sud'
      AND region_code = 'RUN';

    RAISE NOTICE 'Media réconciliation — batch: %, org: %', v_batch_id, v_org_id;

    -- Étape 1 : initialiser extra depuis raw_source_data (img_id + formulaire legacy)
    UPDATE staging.media_galerie_lot1_temp
    SET extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object(
                    'legacy_img_id',    raw_source_data->>'Img_id',
                    'legacy_formulaire', raw_source_data->>'formulaire'
                )
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 1 (init extra) : % lignes', n;

    -- Étape 2 : rejeter les lignes sans URL valide dès maintenant
    UPDATE staging.media_galerie_lot1_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'missing_or_invalid_url')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND (url_source IS NULL OR TRIM(url_source) = '' OR url_source !~* '^https?://');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 2 (rejected invalid url) : % lignes', n;

    -- Étape 3 : legacy_formulaire → object.id via object_external_id (scope OTI)
    UPDATE staging.media_galerie_lot1_temp t
    SET object_id = oei.object_id
    FROM object_external_id oei
    WHERE oei.organization_object_id = v_org_id
      AND oei.source_system           = 'berta_v2_csv_export'
      AND oei.external_id             = t.legacy_formulaire
      AND t.import_batch_id           = v_batch_id
      AND t.resolution_status         = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 3 (object_id) : % lignes résolues', n;

    -- Étape 4 : résolution is_main_resolved — Option A
    UPDATE staging.media_galerie_lot1_temp t
    SET is_main_resolved = TRUE
    FROM (
        SELECT DISTINCT ON (import_batch_id, legacy_formulaire)
               import_media_id
        FROM   staging.media_galerie_lot1_temp
        WHERE  import_batch_id   = v_batch_id
          AND  resolution_status = 'pending'
          AND  main_pic_source   = TRUE
          AND  object_id         IS NOT NULL
        ORDER  BY import_batch_id, legacy_formulaire, legacy_img_id ASC
    ) winners
    WHERE t.import_media_id = winners.import_media_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 4 (is_main_resolved=TRUE) : % lignes', n;

    -- Étape 5 : approuver
    UPDATE staging.media_galerie_lot1_temp
    SET resolution_status = 'approved',
        is_approved       = TRUE
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND object_id  IS NOT NULL
      AND url_source IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 5 (approved) : % lignes', n;

    -- Étape 6 : rejeter — object non résolu
    UPDATE staging.media_galerie_lot1_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'no_object_resolved')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 6 (rejected no object) : % lignes', n;

END
$recon_media$;

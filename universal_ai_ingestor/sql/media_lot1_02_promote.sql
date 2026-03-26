-- =============================================================================
-- Media Lot 1 — 02 : Promotion galerie → media
-- Usage psql : \set batch_id 'votre-batch-id'
--              puis \i media_lot1_02_promote.sql
-- Prérequis : media_lot1_01_reconcile.sql doit avoir été exécuté sur ce batch.
-- =============================================================================

DO $promote_media$
DECLARE
    v_batch_id       TEXT := :'batch_id';
    v_org_id         TEXT;
    v_photo_type_id  UUID;
    n                INTEGER;
BEGIN
    -- Résoudre l'org OTI une seule fois
    SELECT id::text INTO STRICT v_org_id
    FROM object
    WHERE object_type = 'ORG'
      AND name        = 'OTI du Sud'
      AND region_code = 'RUN';

    -- Résoudre le type média 'photo' une seule fois
    SELECT id INTO STRICT v_photo_type_id
    FROM ref_code_media_type
    WHERE code = 'photo';

    RAISE NOTICE 'Promotion media — batch: %, org: %, photo_type: %',
        v_batch_id, v_org_id, v_photo_type_id;

    INSERT INTO media (
        object_id,
        media_type_id,
        url,
        description,
        is_main,
        is_published,
        org_object_id,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_id,
        v_photo_type_id,
        t.url_source,
        NULLIF(TRIM(t.description_source), ''),  -- description vide → NULL
        t.is_main_resolved,                       -- Option A déjà appliquée en réconciliation
        TRUE,                                     -- is_published par défaut
        v_org_id,
        jsonb_build_object(
            'legacy_img_id',    t.legacy_img_id,
            'legacy_formulaire', t.legacy_formulaire,
            'import_batch_id',  v_batch_id
        ),
        NOW(),
        NOW()
    FROM staging.media_temp t
    WHERE t.import_batch_id   = v_batch_id
      AND t.resolution_status = 'approved'
      AND t.is_approved        = TRUE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % médias promus', n;
END
$promote_media$;

-- =============================================================================
-- CRM Lot 1 — 01 : Prérequis object_external_id
-- Copie les IDs Airtable (rec*) depuis object_origin vers object_external_id
-- avec scope OTI du Sud, pour que la réconciliation CRM puisse résoudre
-- staging_object_key → object.id.
-- Idempotent : ON CONFLICT DO NOTHING.
-- Exécuter une seule fois avant tout batch CRM.
-- =============================================================================

DO $prereq_crm$
DECLARE
    v_org_id TEXT;
    n        INTEGER;
BEGIN
    -- Résoudre l'org OTI une seule fois — lève une exception si absent ou ambigu
    SELECT id::text INTO STRICT v_org_id
    FROM object
    WHERE object_type = 'ORG'
      AND name        = 'OTI du Sud'
      AND region_code = 'RUN';

    RAISE NOTICE 'Prérequis CRM — org OTI résolu : %', v_org_id;

    INSERT INTO object_external_id (
        object_id,
        organization_object_id,
        source_system,
        external_id,
        last_synced_at,
        created_at,
        updated_at
    )
    SELECT
        oo.object_id,
        v_org_id,
        'berta_v2_csv_export',
        oo.source_object_id,
        NOW(),
        NOW(),
        NOW()
    FROM object_origin oo
    WHERE oo.source_system    = 'berta_v2_csv_export'
      AND oo.source_object_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_object_external_id_by_source DO NOTHING;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % entrées insérées dans object_external_id (ON CONFLICT DO NOTHING)', n;

    -- Vérification immédiate : doit être 0 après l'insert
    SELECT COUNT(*) INTO n
    FROM object_origin oo
    WHERE oo.source_system    = 'berta_v2_csv_export'
      AND oo.source_object_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM object_external_id oei
          WHERE oei.external_id            = oo.source_object_id
            AND oei.source_system          = 'berta_v2_csv_export'
            AND oei.organization_object_id = v_org_id
      );

    IF n > 0 THEN
        RAISE EXCEPTION 'Prérequis CRM échoué : % entrée(s) manquante(s) dans object_external_id', n;
    END IF;

    RAISE NOTICE '  Vérification OK : 0 manquant dans object_external_id';
END
$prereq_crm$;

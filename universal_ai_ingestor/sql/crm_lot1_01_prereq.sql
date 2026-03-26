-- =============================================================================
-- CRM Lot 1 — 01 : Prérequis object_external_id
-- Copie les IDs Airtable (rec*) depuis object_origin vers object_external_id
-- avec scope OTI du Sud, pour que la réconciliation CRM puisse résoudre
-- staging_object_key → object.id.
-- Idempotent : ON CONFLICT DO NOTHING.
-- Exécuter une seule fois avant tout batch CRM.
-- =============================================================================

WITH oti_org AS (
    SELECT id AS org_id
    FROM object
    WHERE object_type = 'ORG'
      AND name        = 'OTI du Sud'
      AND region_code = 'RUN'
)
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
    oti_org.org_id,
    'berta_v2_csv_export',
    oo.source_object_id,
    NOW(),
    NOW(),
    NOW()
FROM object_origin oo
CROSS JOIN oti_org
WHERE oo.source_system    = 'berta_v2_csv_export'
  AND oo.source_object_id IS NOT NULL
ON CONFLICT ON CONSTRAINT uq_object_external_id_by_source DO NOTHING;

-- Vérification immédiate : doit retourner 0 après l'insert
WITH oti_org AS (
    SELECT id AS org_id FROM object
    WHERE object_type = 'ORG' AND name = 'OTI du Sud' AND region_code = 'RUN'
)
SELECT COUNT(*) AS manquants_dans_ext_id
FROM object_origin oo
CROSS JOIN oti_org
WHERE oo.source_system = 'berta_v2_csv_export'
  AND oo.source_object_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM object_external_id oei
      WHERE oei.external_id             = oo.source_object_id
        AND oei.source_system           = 'berta_v2_csv_export'
        AND oei.organization_object_id  = oti_org.org_id
  );

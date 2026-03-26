-- =============================================================================
-- CRM Lot 1 — 04 : Validation ciblée
-- Usage psql : \set batch_id 'votre-batch-id'
-- Toutes les requêtes doivent retourner 0 ou les résultats attendus indiqués.
-- =============================================================================

-- 1. Aucune ligne promue avec un object_id invalide
-- Attendu : 0
SELECT COUNT(*) AS interactions_object_fk_invalide
FROM crm_interaction ci
WHERE ci.source = 'import_berta2_crm'
  AND NOT EXISTS (SELECT 1 FROM object o WHERE o.id = ci.object_id);

-- 2. Aucune ligne pending restante après réconciliation
-- Attendu : aucune ligne avec resolution_status = 'pending'
SELECT resolution_status, COUNT(*) AS nb
FROM staging.crm_interaction_temp
WHERE import_batch_id = :'batch_id'
GROUP BY 1
ORDER BY 1;

SELECT resolution_status, COUNT(*) AS nb
FROM staging.crm_comment_temp
WHERE import_batch_id = :'batch_id'
GROUP BY 1
ORDER BY 1;

-- 3. Couverture demand_topic : lignes approuvées sans topic résolu
-- Attendu : 0 (tous les 20 codes OTI doivent matcher)
SELECT demand_topic_code, COUNT(*) AS nb
FROM staging.crm_interaction_temp
WHERE import_batch_id   = :'batch_id'
  AND resolution_status = 'approved'
  AND (extra->>'oti_demand_topic_id') IS NULL
GROUP BY 1;

-- 4. Commentaires orphelins rejetés
-- Attendu : taux d'orphelins < 1% du total commentaires du batch
SELECT
    COUNT(*) FILTER (WHERE resolution_status = 'rejected'
                       AND extra->>'rejection_reason' = 'parent_not_found') AS orphelins,
    COUNT(*)                                                                  AS total,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE resolution_status = 'rejected'
                                   AND extra->>'rejection_reason' = 'parent_not_found')
        / NULLIF(COUNT(*), 0), 2
    ) AS pct_orphelins
FROM staging.crm_comment_temp
WHERE import_batch_id = :'batch_id';

-- 5. Chaque commentaire promu porte le parent_interaction_id dans extra
-- Attendu : 0
SELECT COUNT(*) AS commentaires_sans_parent_dans_extra
FROM crm_interaction
WHERE source = 'import_berta2_commentaire'
  AND (extra->>'promoted_parent_interaction_id') IS NULL;

-- 6. Prérequis object_external_id satisfait (à exécuter avant tout batch)
-- Attendu : 0
WITH oti_org AS (
    SELECT id AS org_id FROM object
    WHERE object_type = 'ORG' AND name = 'OTI du Sud' AND region_code = 'RUN'
)
SELECT COUNT(*) AS manquants
FROM object_origin oo
CROSS JOIN oti_org
WHERE oo.source_system = 'berta_v2_csv_export'
  AND oo.source_object_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM object_external_id oei
      WHERE oei.external_id            = oo.source_object_id
        AND oei.source_system          = 'berta_v2_csv_export'
        AND oei.organization_object_id = oti_org.org_id
  );

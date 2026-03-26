-- =============================================================================
-- Media Lot 1 — 03 : Validation ciblée galerie
-- Usage psql : \set batch_id 'votre-batch-id'
-- Toutes les requêtes doivent retourner 0 ou les résultats attendus indiqués.
-- =============================================================================

-- 1. Aucune ligne promue avec un object_id invalide (batch courant)
-- Attendu : 0
SELECT COUNT(*) AS media_object_fk_invalide
FROM media m
WHERE m.extra->>'import_batch_id' = :'batch_id'
  AND NOT EXISTS (SELECT 1 FROM object o WHERE o.id = m.object_id);

-- 2. Aucune ligne pending restante après réconciliation
-- Attendu : aucune ligne avec resolution_status = 'pending'
SELECT resolution_status, COUNT(*) AS nb
FROM staging.media_galerie_lot1_temp
WHERE import_batch_id = :'batch_id'
GROUP BY 1
ORDER BY 1;

-- 3. Distribution des motifs de rejet
-- Informationnel — vérifie que les raisons sont uniquement 'no_object_resolved' ou 'missing_or_invalid_url'
SELECT extra->>'rejection_reason' AS rejection_reason, COUNT(*) AS nb
FROM staging.media_galerie_lot1_temp
WHERE import_batch_id   = :'batch_id'
  AND resolution_status = 'rejected'
GROUP BY 1
ORDER BY 2 DESC;

-- 4. Cohérence comptage : staging approved = promus avec import_batch_id
-- Attendu : staging_approved = promus_avec_batch_id
SELECT
    (SELECT COUNT(*)
     FROM staging.media_galerie_lot1_temp
     WHERE import_batch_id   = :'batch_id'
       AND resolution_status = 'approved'
       AND is_approved        = TRUE)                      AS staging_approved,
    (SELECT COUNT(*)
     FROM media
     WHERE extra->>'import_batch_id' = :'batch_id')        AS promus_avec_batch_id;

-- 5. Aucun établissement avec plus d'un is_main=TRUE pour le type photo (batch courant)
-- Attendu : 0
SELECT COUNT(*) AS violations_is_main
FROM (
    SELECT object_id, COUNT(*) AS nb_main
    FROM media m
    JOIN ref_code_media_type rmt ON rmt.id = m.media_type_id
    WHERE m.extra->>'import_batch_id' = :'batch_id'
      AND rmt.code                    = 'photo'
      AND m.is_main                   = TRUE
    GROUP BY object_id
    HAVING COUNT(*) > 1
) violations;

-- 6. Informationnel : répartition is_main dans le batch promu
SELECT is_main, COUNT(*) AS nb
FROM media
WHERE extra->>'import_batch_id' = :'batch_id'
GROUP BY 1
ORDER BY 1;

-- =============================================================================
-- CRM Lot 1 — 02b : Réconciliation des commentaires
-- Usage psql : \set batch_id 'votre-batch-id'
--              puis \i crm_lot1_02b_reconcile_comments.sql
--
-- Séquence obligatoire :
--   02a_reconcile_parents → 03a_promote_parents → 02b (ce fichier) → 03b_promote_comments
--
-- PRÉREQUIS STRICT : 03a_promote_parents doit avoir tourné sur ce batch.
-- Ce script résout parent_legacy_crm_id → crm_interaction.id,
-- ce qui nécessite que les parents soient déjà dans crm_interaction.
-- =============================================================================

DO $recon_comments$
DECLARE
    v_batch_id TEXT := :'batch_id';
    n          INTEGER;
BEGIN
    RAISE NOTICE 'Commentaires réconciliation — batch: %', v_batch_id;

    -- Étape 1 : stamper id legacy dans la colonne id
    UPDATE staging.crm_comment_temp
    SET id = raw_source_data->>'ID'
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 1 (id legacy) : % lignes', n;

    -- Étape 2 : parent_legacy_crm_id → crm_interaction.id promu
    --           hériter object_id et actor_id du parent
    UPDATE staging.crm_comment_temp t
    SET resolved_parent_interaction_id = ci.id::text,
        object_id                      = ci.object_id,
        actor_id                       = ci.actor_id::text
    FROM crm_interaction ci
    WHERE ci.extra->>'legacy_crm_id' = t.parent_legacy_crm_id
      AND ci.source                  = 'import_berta2_crm'
      AND t.import_batch_id          = v_batch_id
      AND t.resolution_status        = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 2 (parent + héritage object/actor) : % lignes résolues', n;

    -- Étape 3 : user_email → owner via auth.users.email
    UPDATE staging.crm_comment_temp t
    SET owner = u.id::text
    FROM auth.users u
    WHERE u.email               = t.user_email
      AND t.user_email IS NOT NULL
      AND t.import_batch_id     = v_batch_id
      AND t.resolution_status   = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 3 (owner) : % lignes résolues', n;

    -- Étape 4 : approuver — parent résolu + object_id + occurred_at
    UPDATE staging.crm_comment_temp
    SET resolution_status = 'approved',
        is_approved       = TRUE
    WHERE import_batch_id                = v_batch_id
      AND resolution_status              = 'pending'
      AND resolved_parent_interaction_id IS NOT NULL
      AND object_id                      IS NOT NULL
      AND occurred_at                    IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 4 (approved) : % lignes', n;

    -- Étape 5a : rejeter — parent résolu mais occurred_at absent/invalide
    UPDATE staging.crm_comment_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'missing_or_invalid_occurred_at')
    WHERE import_batch_id                = v_batch_id
      AND resolution_status              = 'pending'
      AND resolved_parent_interaction_id IS NOT NULL
      AND object_id                      IS NOT NULL
      AND occurred_at                    IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 5a (rejected missing occurred_at) : % lignes', n;

    -- Étape 5b : rejeter orphelins — parent non résolu
    UPDATE staging.crm_comment_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'parent_not_found')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 5b (rejected orphelins) : % lignes', n;

END
$recon_comments$;

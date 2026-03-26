-- =============================================================================
-- CRM Lot 1 — 03b : Promotion des commentaires → crm_interaction (type='note')
-- Usage psql : \set batch_id 'votre-batch-id'
--              puis \i crm_lot1_03b_promote_comments.sql
--
-- Séquence obligatoire :
--   02a_reconcile_parents → 03a_promote_parents → 02b_reconcile_comments → 03b (ce fichier)
--
-- ⚠️  CE SCRIPT ÉCRIT DANS LA TABLE FINALE crm_interaction
-- =============================================================================

DO $promote_comments$
DECLARE
    v_batch_id TEXT := :'batch_id';
    n          INTEGER;
BEGIN
    RAISE NOTICE 'Promotion commentaires — batch: %', v_batch_id;

    INSERT INTO crm_interaction (
        object_id,
        actor_id,
        interaction_type,
        direction,
        status,
        body,
        occurred_at,
        owner,
        demand_topic_id,
        request_mood_id,
        response_mood_id,
        source,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_id,
        t.actor_id::uuid,                          -- hérité du parent, nullable
        'note'::crm_interaction_type,
        'internal'::crm_direction,
        'done'::crm_status,                        -- toujours done, sans exception
        t.body,
        t.occurred_at,
        t.owner::uuid,                             -- nullable
        NULL,
        NULL,
        NULL,
        'import_berta2_commentaire',
        jsonb_build_object(
            'legacy_comment_id',               t.id,
            'parent_legacy_crm_id',            t.parent_legacy_crm_id,
            'promoted_parent_interaction_id',  t.resolved_parent_interaction_id,
            'original_comment_status',         t.original_comment_status,
            'close_reqs',                      t.close_reqs,
            'humeur_raw',                      t.humeur_raw,
            'modere',                          t.modere,
            'import_batch_id',                 v_batch_id
        ),
        NOW(),
        NOW()
    FROM staging.crm_comment_temp t
    WHERE t.import_batch_id   = v_batch_id
      AND t.resolution_status = 'approved'
      AND t.is_approved       = TRUE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % commentaires promus', n;
END
$promote_comments$;

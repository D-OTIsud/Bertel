-- =============================================================================
-- CRM Lot 1 — 03 : Promotion
-- Usage psql : \set batch_id 'votre-batch-id'
-- Bloc A (parents) doit être exécuté AVANT le bloc B (commentaires).
-- Le bloc B de réconciliation (02_reconcile.sql) doit tourner entre les deux.
-- =============================================================================

-- =============================================================================
-- BLOC A — Promotion des interactions CRM parent → crm_interaction
-- =============================================================================
DO $promote_crm$
DECLARE
    v_batch_id TEXT := :'batch_id';
    n          INTEGER;
BEGIN
    RAISE NOTICE 'Promotion CRM parent — batch: %', v_batch_id;

    INSERT INTO crm_interaction (
        object_id,
        actor_id,
        interaction_type,
        direction,
        status,
        body,
        occurred_at,
        resolved_at,
        is_actionable,
        owner,
        demand_topic_id,     -- NULL : domain mismatch FK (UUID dans extra.oti_demand_topic_id)
        request_mood_id,     -- NULL : pas de seeds crm_mood
        response_mood_id,    -- NULL : pas de seeds crm_mood
        source,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_id,                               -- TEXT, type target est TEXT
        t.actor_id::uuid,                          -- TEXT → UUID (nullable)
        t.interaction_type::crm_interaction_type,
        'internal'::crm_direction,
        t.status::crm_status,
        t.body,
        t.occurred_at,
        t.resolved_at,
        COALESCE(t.is_actionable, TRUE),
        t.owner::uuid,                             -- TEXT → UUID (nullable)
        NULL,
        NULL,
        NULL,
        'import_berta2_crm',
        COALESCE(t.extra, '{}'::jsonb) || jsonb_build_object('import_batch_id', v_batch_id),
        NOW(),
        NOW()
    FROM staging.crm_interaction_temp t
    WHERE t.import_batch_id   = v_batch_id
      AND t.resolution_status = 'approved'
      AND t.is_approved       = TRUE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % interactions CRM parent promues', n;
END
$promote_crm$;

-- =============================================================================
-- BLOC B — Promotion des commentaires → crm_interaction (type='note')
-- Exécuter après : 02_reconcile.sql bloc B
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

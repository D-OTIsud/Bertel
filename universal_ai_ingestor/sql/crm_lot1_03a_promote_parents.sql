-- =============================================================================
-- CRM Lot 1 — 03a : Promotion des interactions CRM parent → crm_interaction
-- Usage psql : \set batch_id 'votre-batch-id'
--              puis \i crm_lot1_03a_promote_parents.sql
--
-- Séquence obligatoire :
--   02a_reconcile_parents → 03a (ce fichier) → 02b_reconcile_comments → 03b_promote_comments
--
-- ⚠️  CE SCRIPT ÉCRIT DANS LA TABLE FINALE crm_interaction
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

-- =============================================================================
-- CRM Lot 1 — 02a : Réconciliation des interactions CRM parent
-- Usage psql : \set batch_id 'votre-batch-id'
--              puis \i crm_lot1_02a_reconcile_parents.sql
--
-- Séquence obligatoire :
--   02a (ce fichier) → 03a_promote_parents → 02b_reconcile_comments → 03b_promote_comments
--
-- NE PAS exécuter 02b avant que 03a ait tourné :
-- le bloc commentaires résout les parents depuis crm_interaction,
-- qui doit donc être peuplé au préalable.
-- =============================================================================

DO $recon_crm$
DECLARE
    v_batch_id TEXT := :'batch_id';
    v_org_id   TEXT;
    n          INTEGER;
BEGIN
    -- Résoudre OTI org une seule fois
    SELECT id::text INTO STRICT v_org_id
    FROM object
    WHERE object_type = 'ORG'
      AND name        = 'OTI du Sud'
      AND region_code = 'RUN';

    RAISE NOTICE 'CRM parent réconciliation — batch: %, org: %', v_batch_id, v_org_id;

    -- Étape 1 : stamper id legacy + initialiser extra depuis raw_source_data
    UPDATE staging.crm_interaction_temp
    SET id    = raw_source_data->>'ID',
        extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object(
                    'legacy_crm_id',       raw_source_data->>'ID',
                    'humeur_raw',          NULLIF(raw_source_data->>'Humeur', ''),
                    'humeur_apres_raw',    NULLIF(raw_source_data->>'Humeur_apres', ''),
                    'sous_categorie',      NULLIF(raw_source_data->>'Sous-catégorie', ''),
                    'interlocuteur_email', NULLIF(raw_source_data->>'Interlocuteur', '')
                )
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 1 (init extra) : % lignes', n;

    -- Étape 2 : staging_object_key → object.id via object_external_id (scope OTI)
    UPDATE staging.crm_interaction_temp t
    SET object_id = oei.object_id
    FROM object_external_id oei
    WHERE oei.organization_object_id = v_org_id
      AND oei.source_system           = 'berta_v2_csv_export'
      AND oei.external_id             = t.staging_object_key
      AND t.import_batch_id           = v_batch_id
      AND t.resolution_status         = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 2 (object_id) : % lignes résolues', n;

    -- Étape 3 : staging_actor_key → actor.id via actor.extra->>'legacy_presta_id'
    UPDATE staging.crm_interaction_temp t
    SET actor_id = a.id::text
    FROM actor a
    WHERE a.extra->>'legacy_presta_id' = t.staging_actor_key
      AND t.staging_actor_key IS NOT NULL
      AND t.import_batch_id            = v_batch_id
      AND t.resolution_status          = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 3 (actor_id) : % lignes résolues', n;

    -- Étape 4 : interlocuteur_email → owner via auth.users.email
    UPDATE staging.crm_interaction_temp t
    SET owner = u.id::text
    FROM auth.users u
    WHERE u.email               = t.extra->>'interlocuteur_email'
      AND t.extra->>'interlocuteur_email' IS NOT NULL
      AND t.import_batch_id     = v_batch_id
      AND t.resolution_status   = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 4 (owner) : % lignes résolues', n;

    -- Étape 5 : demand_topic_code → UUID OTI dans extra uniquement
    -- demand_topic_id reste NULL (domain mismatch FK — voir lot1_crm_import_plan.md)
    UPDATE staging.crm_interaction_temp t
    SET extra = t.extra || jsonb_build_object(
                    'oti_demand_topic_id',   rc.id::text,
                    'oti_demand_topic_code', rc.code
                )
    FROM ref_code rc
    WHERE rc.domain             = 'crm_demand_topic_oti'
      AND rc.name               = t.demand_topic_code
      AND t.import_batch_id     = v_batch_id
      AND t.resolution_status   = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 5 (demand_topic) : % lignes résolues', n;

    -- Étape 6 : approuver — object résolu + occurred_at présent
    UPDATE staging.crm_interaction_temp
    SET resolution_status = 'approved',
        is_approved       = TRUE
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND object_id  IS NOT NULL
      AND occurred_at IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 6 (approved) : % lignes', n;

    -- Étape 7a : rejeter — object résolu mais occurred_at absent/invalide
    UPDATE staging.crm_interaction_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'missing_or_invalid_occurred_at')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND object_id  IS NOT NULL
      AND occurred_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 7a (rejected missing occurred_at) : % lignes', n;

    -- Étape 7b : rejeter — object non résolu
    UPDATE staging.crm_interaction_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'no_object_resolved')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Étape 7b (rejected no object) : % lignes', n;

END
$recon_crm$;

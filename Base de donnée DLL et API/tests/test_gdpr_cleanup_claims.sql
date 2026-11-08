-- Claim durable RGPD : exclusivité, alias, issue inconnue sans TTL, liaison de l'ACK, ACL.
-- À exécuter en propriétaire, en READ COMMITTED, après la migration 20261108074602.
-- L'exclusivité concurrente repose sur le verrou de cible et l'index unique contrôlés ci-dessous.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

CREATE FUNCTION pg_temp.claim_refused(p_op uuid, p_task uuid, p_attempt uuid, p_action text, p_meta jsonb, p_key text)
RETURNS boolean LANGUAGE plpgsql AS $helper$
BEGIN
  PERFORM api.rpc_gdpr_claim_cleanup_task(p_op, p_task, p_attempt, p_action, p_meta, p_key);
  RETURN false;
EXCEPTION WHEN SQLSTATE '55000' THEN RETURN true;
END;
$helper$;

CREATE FUNCTION pg_temp.ack_refused(p_op uuid, p_task uuid, p_attempt uuid, p_success boolean, p_effect boolean)
RETURNS boolean LANGUAGE plpgsql AS $helper$
BEGIN
  PERFORM api.rpc_gdpr_ack_cleanup_attempt(p_op, p_task, p_attempt, p_success, p_effect, 'synthetic');
  RETURN false;
EXCEPTION WHEN SQLSTATE '55000' THEN RETURN true;
END;
$helper$;

CREATE FUNCTION pg_temp.task(p_id uuid) RETURNS internal.gdpr_cleanup_task
LANGUAGE sql AS $helper$
  SELECT t FROM internal.gdpr_cleanup_task t WHERE t.id = p_id;
$helper$;

DO $test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_op uuid := gen_random_uuid();
  v_op2 uuid := gen_random_uuid();
  v_op3 uuid := gen_random_uuid();
  v_op4 uuid := gen_random_uuid();
  v_canon uuid := gen_random_uuid();
  v_raw uuid := gen_random_uuid();
  v_later uuid := gen_random_uuid();
  v_unknown uuid := gen_random_uuid();
  v_unknown_alias uuid := gen_random_uuid();
  v_lost uuid := gen_random_uuid();
  v_released uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_unresolved uuid := gen_random_uuid();
  v_free uuid := gen_random_uuid();
  v_attempt uuid := gen_random_uuid();
  v_attempt2 uuid := gen_random_uuid();
  v_avatar_key text := 'storage_remove:avatars/' || v_user::text || '/avatar.jpg';
  v_meta_canon jsonb := jsonb_build_object('bucket', 'avatars', 'path', v_user::text || '/avatar.jpg');
  v_meta_raw jsonb := jsonb_build_object('raw_url', 'https://x.supabase.co/storage/v1/object/public/avatars/' || v_user::text || '/avatar.jpg?v=1');
  v_meta_unknown jsonb := '{"bucket":"media","path":"claims/unknown.jpg"}';
  v_unknown_key text := 'storage_remove:media/claims/unknown.jpg';
  v_meta_lost jsonb := '{"bucket":"media","path":"claims/lost.jpg"}';
  v_lost_key text := 'storage_remove:media/claims/lost.jpg';
  v_meta_released jsonb := '{"bucket":"media","path":"claims/released.jpg"}';
  v_released_key text := 'storage_remove:media/claims/released.jpg';
  v_meta_free jsonb := '{"bucket":"media","path":"claims/free.jpg"}';
  v_meta_auth jsonb;
  v_result jsonb;
  v_row internal.gdpr_cleanup_task;
  v_flag boolean;
  v_signature text;
  v_role text;
BEGIN
  v_meta_auth := jsonb_build_object('user_id', v_user::text);

  -- Toutes les RPC et la table restent réservées au propriétaire.
  FOREACH v_signature IN ARRAY ARRAY[
    'internal.gdpr_cleanup_lock_target(text)',
    'api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text)',
    'api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text)',
    'api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)',
    'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)'
  ] LOOP
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = to_regprocedure(v_signature) AND a.grantee <> p.proowner
    ), v_signature || ' doit rester propriétaire seul';
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      ASSERT NOT has_function_privilege(v_role, to_regprocedure(v_signature), 'EXECUTE'),
        v_signature || ' ouvert à ' || v_role;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_table_privilege(v_role, 'internal.gdpr_cleanup_task', 'SELECT,INSERT,UPDATE,DELETE');
  END LOOP;
  ASSERT (SELECT confdeltype = 'r' FROM pg_constraint
           WHERE conrelid = 'internal.gdpr_cleanup_task'::regclass
             AND conname = 'gdpr_cleanup_task_operation_id_fkey'),
    'la FK vers le journal ne doit plus effacer les reçus en cascade';

  INSERT INTO public.gdpr_erasure_log(id, subject_kind, subject_id, mode, report) VALUES
    (v_op, 'user', v_user::text, 'delete', jsonb_build_object('operationId', v_op)),
    (v_op2, 'user', v_user::text, 'delete', jsonb_build_object('operationId', v_op2)),
    (v_op3, 'actor', gen_random_uuid()::text, 'anonymize', jsonb_build_object('operationId', v_op3)),
    (v_op4, 'actor', gen_random_uuid()::text, 'anonymize', jsonb_build_object('operationId', v_op4));
  INSERT INTO internal.gdpr_cleanup_task(id, operation_id, action, metadata) VALUES
    (v_canon, v_op, 'storage_remove', v_meta_canon),
    (v_raw, v_op, 'storage_remove', v_meta_raw),
    (v_later, v_op2, 'storage_remove', v_meta_raw),
    (v_unknown, v_op3, 'storage_remove', v_meta_unknown),
    (v_unknown_alias, v_op4, 'storage_remove', v_meta_unknown),
    (v_lost, v_op3, 'storage_remove', v_meta_lost),
    (v_released, v_op3, 'storage_remove', v_meta_released),
    (v_auth, v_op, 'auth_delete', v_meta_auth),
    (v_unresolved, v_op3, 'storage_remove', '{"raw_url":"https://evil.example/x.jpg"}'),
    (v_free, v_op3, 'storage_remove', v_meta_free);

  -- L'ancien ACK à quatre arguments ne mute plus rien.
  v_flag := false;
  BEGIN
    PERFORM api.rpc_gdpr_ack_cleanup_task(v_op, v_canon, true, NULL);
  EXCEPTION WHEN SQLSTATE '55000' THEN v_flag := true;
  END;
  ASSERT v_flag, 'l''ancien ACK doit échouer en 55000';
  ASSERT (pg_temp.task(v_canon)).status = 'pending' AND (pg_temp.task(v_canon)).attempts = 0;

  -- Liaison stricte : aucun mauvais argument n'obtient de tentative.
  ASSERT pg_temp.claim_refused(v_op, v_canon, v_attempt, 'auth_delete', v_meta_canon, v_avatar_key);
  ASSERT pg_temp.claim_refused(v_op, v_canon, v_attempt, 'storage_remove', v_meta_raw, v_avatar_key);
  ASSERT pg_temp.claim_refused(v_op2, v_canon, v_attempt, 'storage_remove', v_meta_canon, v_avatar_key);
  ASSERT pg_temp.claim_refused(v_op, v_canon, v_attempt, 'storage_remove', v_meta_canon, 'storage_remove:avatars/autre.jpg');
  ASSERT pg_temp.claim_refused(v_op, v_canon, NULL, 'storage_remove', v_meta_canon, v_avatar_key);
  ASSERT pg_temp.claim_refused(v_op, v_auth, v_attempt, 'auth_delete', v_meta_auth, 'auth_delete:' || gen_random_uuid()::text);
  ASSERT (pg_temp.task(v_canon)).attempt_id IS NULL AND (pg_temp.task(v_canon)).target_key IS NULL;

  -- Claim : la réponse reprend toute la liaison.
  v_result := api.rpc_gdpr_claim_cleanup_task(v_op, v_canon, v_attempt, 'storage_remove', v_meta_canon, v_avatar_key);
  ASSERT v_result->>'claimOutcome' = 'claimed' AND v_result->>'attemptId' = v_attempt::text
     AND v_result->>'operationId' = v_op::text AND v_result->>'taskId' = v_canon::text
     AND v_result->>'action' = 'storage_remove' AND v_result->'metadata' = v_meta_canon
     AND v_result->>'targetKey' = v_avatar_key;
  v_row := pg_temp.task(v_canon);
  ASSERT v_row.status = 'pending' AND v_row.attempt_state = 'claimed' AND v_row.attempt_id = v_attempt;

  -- Exclusivité : même tâche, même ou nouvelle tentative, aucune seconde admission.
  ASSERT pg_temp.claim_refused(v_op, v_canon, v_attempt, 'storage_remove', v_meta_canon, v_avatar_key);
  ASSERT pg_temp.claim_refused(v_op, v_canon, v_attempt2, 'storage_remove', v_meta_canon, v_avatar_key);

  -- Alias raw_url de la même cible : lié au propriétaire, sans tentative ni effet.
  v_result := api.rpc_gdpr_claim_cleanup_task(v_op, v_raw, v_attempt2, 'storage_remove', v_meta_raw, v_avatar_key);
  ASSERT v_result->>'claimOutcome' = 'linked' AND v_result->>'receiptTaskId' = v_canon::text
     AND NOT v_result ? 'attemptId';
  v_row := pg_temp.task(v_raw);
  ASSERT v_row.status = 'pending' AND v_row.attempt_id IS NULL AND v_row.attempt_state IS NULL
     AND v_row.receipt_task_id = v_canon AND v_row.target_key = v_avatar_key;
  ASSERT api.avatar_upload_allowed(v_user) IS NOT TRUE;

  -- Filet d'index : un second propriétaire direct de la cible est impossible.
  v_flag := false;
  BEGIN
    UPDATE internal.gdpr_cleanup_task
       SET target_key = v_avatar_key, attempt_id = gen_random_uuid(), attempt_state = 'claimed'
     WHERE id = v_free;
  EXCEPTION WHEN unique_violation THEN v_flag := true;
  END;
  ASSERT v_flag, 'l''index doit refuser un second propriétaire de cible';

  -- ACK : mauvaise tentative, tâche ou opération refusées sans mutation.
  ASSERT pg_temp.ack_refused(v_op, v_canon, gen_random_uuid(), true, true);
  ASSERT pg_temp.ack_refused(v_op, v_raw, v_attempt, true, true);
  ASSERT pg_temp.ack_refused(v_op2, v_canon, v_attempt, true, true);
  ASSERT pg_temp.ack_refused(v_op, v_canon, v_attempt, NULL, true);
  v_row := pg_temp.task(v_canon);
  ASSERT v_row.status = 'pending' AND v_row.attempts = 0 AND v_row.attempt_state = 'claimed';

  -- Succès : le reçu résout l'alias et ouvre de nouveau l'avatar.
  v_result := api.rpc_gdpr_ack_cleanup_attempt(v_op, v_canon, v_attempt, true, true, NULL);
  ASSERT v_result->>'status' = 'succeeded' AND v_result->>'attemptId' = v_attempt::text;
  ASSERT (pg_temp.task(v_canon)).attempt_state = 'succeeded';
  v_row := pg_temp.task(v_raw);
  ASSERT v_row.status = 'succeeded' AND v_row.attempts = 0 AND v_row.attempt_id IS NULL;
  -- La tâche Auth de cette opération reste en file : traitée plus bas.
  ASSERT api.avatar_upload_allowed(v_user) IS NOT TRUE;

  -- ACK rejoué idempotent ; un succès ne régresse jamais.
  v_result := api.rpc_gdpr_ack_cleanup_attempt(v_op, v_canon, v_attempt, true, true, NULL);
  ASSERT v_result->>'status' = 'succeeded' AND (pg_temp.task(v_canon)).attempts = 1;
  ASSERT pg_temp.ack_refused(v_op, v_canon, v_attempt, false, true);

  -- Autre opération, même clé déjà réussie : liée au reçu, sans effet.
  v_result := api.rpc_gdpr_claim_cleanup_task(v_op2, v_later, gen_random_uuid(), 'storage_remove', v_meta_raw, v_avatar_key);
  ASSERT v_result->>'claimOutcome' = 'linked' AND NOT v_result ? 'attemptId';
  v_row := pg_temp.task(v_later);
  ASSERT v_row.status = 'succeeded' AND v_row.receipt_task_id = v_canon AND v_row.attempt_id IS NULL;

  -- Auth : cible normalisée en minuscules, même protocole.
  v_attempt := gen_random_uuid();
  v_result := api.rpc_gdpr_claim_cleanup_task(v_op, v_auth, v_attempt, 'auth_delete', v_meta_auth, 'auth_delete:' || v_user::text);
  ASSERT v_result->>'claimOutcome' = 'claimed';
  PERFORM api.rpc_gdpr_ack_cleanup_attempt(v_op, v_auth, v_attempt, true, false, NULL);
  ASSERT (pg_temp.task(v_auth)).status = 'succeeded';
  ASSERT api.avatar_upload_allowed(v_user) IS TRUE, 'alias et reçu réussis ne doivent plus bloquer l''avatar';

  -- Effet envoyé, issue inconnue : définitif, sans TTL, et jamais un succès pour un alias.
  v_attempt := gen_random_uuid();
  PERFORM api.rpc_gdpr_claim_cleanup_task(v_op3, v_unknown, v_attempt, 'storage_remove', v_meta_unknown, v_unknown_key);
  PERFORM api.rpc_gdpr_ack_cleanup_attempt(v_op3, v_unknown, v_attempt, false, true, 'storage_remove_failed');
  v_row := pg_temp.task(v_unknown);
  ASSERT v_row.status = 'failed' AND v_row.attempt_state = 'unknown' AND v_row.last_error = 'storage_remove_failed';
  UPDATE internal.gdpr_cleanup_task SET updated_at = now() - interval '10 years' WHERE id = v_unknown;
  ASSERT pg_temp.claim_refused(v_op3, v_unknown, gen_random_uuid(), 'storage_remove', v_meta_unknown, v_unknown_key);
  ASSERT pg_temp.ack_refused(v_op3, v_unknown, v_attempt, true, true);

  v_result := api.rpc_gdpr_claim_cleanup_task(v_op4, v_unknown_alias, gen_random_uuid(), 'storage_remove', v_meta_unknown, v_unknown_key);
  ASSERT v_result->>'claimOutcome' = 'linked';
  v_row := pg_temp.task(v_unknown_alias);
  ASSERT v_row.status = 'pending' AND v_row.attempt_id IS NULL AND v_row.receipt_task_id = v_unknown;

  -- Claim sans ACK : tentative inconnue, ni reprise ni expiration.
  v_attempt := gen_random_uuid();
  PERFORM api.rpc_gdpr_claim_cleanup_task(v_op3, v_lost, v_attempt, 'storage_remove', v_meta_lost, v_lost_key);
  UPDATE internal.gdpr_cleanup_task SET updated_at = now() - interval '10 years' WHERE id = v_lost;
  ASSERT pg_temp.claim_refused(v_op3, v_lost, gen_random_uuid(), 'storage_remove', v_meta_lost, v_lost_key);
  v_row := pg_temp.task(v_lost);
  ASSERT v_row.status = 'pending' AND v_row.attempt_state = 'claimed' AND v_row.attempt_id = v_attempt;

  -- Refus prouvé sans effet : libère la tâche, relançable avec une nouvelle tentative.
  v_attempt := gen_random_uuid();
  PERFORM api.rpc_gdpr_claim_cleanup_task(v_op3, v_released, v_attempt, 'storage_remove', v_meta_released, v_released_key);
  PERFORM api.rpc_gdpr_ack_cleanup_attempt(v_op3, v_released, v_attempt, false, false, 'task_subject_mismatch');
  v_row := pg_temp.task(v_released);
  ASSERT v_row.status = 'failed' AND v_row.attempt_id IS NULL AND v_row.attempt_state IS NULL
     AND v_row.target_key = v_released_key;
  v_result := api.rpc_gdpr_claim_cleanup_task(v_op3, v_released, v_attempt2, 'storage_remove', v_meta_released, v_released_key);
  ASSERT v_result->>'attemptId' = v_attempt2::text AND (pg_temp.task(v_released)).status = 'pending';

  -- Référence sans cible : échec durable, sans jamais masquer une tentative ou un succès.
  v_result := api.rpc_gdpr_refuse_cleanup_task(v_op3, v_unresolved, 'storage_remove', '{"raw_url":"https://evil.example/x.jpg"}', 'unresolved_external_or_invalid_reference');
  ASSERT v_result->>'status' = 'failed';
  ASSERT (pg_temp.task(v_unresolved)).last_error = 'unresolved_external_or_invalid_reference';
  FOREACH v_signature IN ARRAY ARRAY[v_lost::text, v_unknown::text, v_canon::text] LOOP
    v_flag := false;
    BEGIN
      PERFORM api.rpc_gdpr_refuse_cleanup_task(
        (SELECT operation_id FROM internal.gdpr_cleanup_task WHERE id = v_signature::uuid),
        v_signature::uuid, 'storage_remove',
        (SELECT metadata FROM internal.gdpr_cleanup_task WHERE id = v_signature::uuid), 'synthetic');
    EXCEPTION WHEN SQLSTATE '55000' THEN v_flag := true;
    END;
    ASSERT v_flag, 'un refus ne doit jamais toucher une tentative ou un succès';
  END LOOP;

  -- Un reçu ne disparaît pas avec son journal.
  v_flag := false;
  BEGIN
    DELETE FROM public.gdpr_erasure_log WHERE id = v_op;
  EXCEPTION WHEN foreign_key_violation THEN v_flag := true;
  END;
  ASSERT v_flag, 'supprimer le journal ne doit pas effacer ses reçus';
END;
$test$;
ROLLBACK;

-- START stable autour du vrai journal 19a. Données fictives, transaction annulée.
-- Aucun appel Storage/Auth et aucune permission de nettoyage ajoutée.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
\ir fixtures/object_current_rights.sql

DO $test$
DECLARE
  v_actor uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_next uuid := gen_random_uuid();
  v_report jsonb;
  v_replay jsonb;
  v_operation uuid;
  v_count bigint;
  v_tasks bigint;
  v_refused boolean;
  v_role text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(v_role, 'api.rpc_gdpr_start_erasure(uuid,text,text,text,text)', 'EXECUTE');
    ASSERT NOT has_function_privilege(v_role, 'api.rpc_gdpr_find_start_request(uuid)', 'EXECUTE');
    ASSERT NOT has_function_privilege(v_role, 'internal.gdpr_start_actor_identity()', 'EXECUTE');
  END LOOP;
  ASSERT (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc
    WHERE oid='api.rpc_gdpr_erase_subject(text,text,text,text)'::regprocedure) = '690e95cd8f9eee68300c38cec1414714',
    'Le wrapper ne remplace pas le corps erase4';

  INSERT INTO public.actor(id, display_name, photo_url, is_test) VALUES
    (v_actor, 'Synthetic START actor', 'https://synthetic.invalid/storage/v1/object/public/media/start.jpg', false),
    (v_other, 'Synthetic other actor', NULL, false);
  SELECT count(*) INTO v_count FROM public.gdpr_erasure_log;
  v_report := api.rpc_gdpr_start_erasure(v_request, 'actor', v_actor::text, 'anonymize', 'Synthetic request');
  v_operation := (v_report->>'operationId')::uuid;
  ASSERT v_operation <> v_request, 'requestId ne renomme pas la PK du journal';
  ASSERT v_report->'startRequestId' = to_jsonb(v_request);
  ASSERT (SELECT id=v_operation AND report=v_report FROM public.gdpr_erasure_log WHERE id=v_operation);
  ASSERT (SELECT count(*)=v_count+1 FROM public.gdpr_erasure_log);
  ASSERT EXISTS (SELECT FROM internal.gdpr_cleanup_task WHERE operation_id=v_operation AND status='pending'),
    'Contrôle non vide : tâche fictive en attente';
  SELECT count(*) INTO v_tasks FROM internal.gdpr_cleanup_task WHERE operation_id=v_operation;

  -- Perdre la réponse ne supprime pas le lien requestId -> vrai operationId.
  ASSERT api.rpc_gdpr_find_start_request(v_request) = jsonb_build_object('requestId',v_request,'operationId',v_operation);
  UPDATE public.actor SET display_name='New synthetic data after START' WHERE id=v_actor;
  v_replay := api.rpc_gdpr_start_erasure(v_request, 'actor', upper(v_actor::text), 'anonymize', 'Synthetic request');
  ASSERT v_replay=v_report, 'Même demande : rapport initial';
  ASSERT (SELECT display_name='New synthetic data after START' FROM public.actor WHERE id=v_actor),
    'Le replay ne ré-efface pas des données ajoutées après';
  ASSERT (SELECT count(*)=v_tasks FROM internal.gdpr_cleanup_task WHERE operation_id=v_operation);

  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_start_erasure(v_request, 'actor', v_actor::text, 'delete', 'Synthetic request');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_refused := true; END;
  ASSERT v_refused, 'Le mode appartient au binding';
  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_start_erasure(v_request, 'actor', v_actor::text, 'anonymize', 'Changed');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_refused := true; END;
  ASSERT v_refused, 'La raison appartient au binding';
  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_start_erasure(v_request, 'actor', v_other::text, 'anonymize', 'Synthetic request');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_refused := true; END;
  ASSERT v_refused, 'Le sujet appartient au binding';

  -- Une autre clé et un autre mode ne contournent pas le travail non résolu.
  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_start_erasure(v_next, 'actor', upper(v_actor::text), 'delete', NULL);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_refused := true; END;
  ASSERT v_refused, 'Verrou temporaire sujet, pas seulement une clé ou un mode';
  ASSERT (SELECT count(*)=v_count+1 FROM public.gdpr_erasure_log);

  -- Lookup absent : P0002, aucun journal ni START implicite.
  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_find_start_request(v_next);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN v_refused := true; END;
  ASSERT v_refused;
  ASSERT (SELECT count(*)=v_count+1 FROM public.gdpr_erasure_log);

  -- Réconciliation TECHNIQUE de fixture, pas une preuve d'effacement Storage.
  UPDATE internal.gdpr_cleanup_task SET status='succeeded' WHERE operation_id=v_operation;
  UPDATE public.gdpr_erasure_log SET report=report||'{"manualReviewRequired":true}'::jsonb WHERE id=v_operation;
  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_start_erasure(v_next, 'actor', v_actor::text, 'anonymize', NULL);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_refused := true; END;
  ASSERT v_refused, 'Une revue manuelle non résolue bloque encore';
  UPDATE public.gdpr_erasure_log SET report=report||'{"manualReviewRequired":false}'::jsonb WHERE id=v_operation;
  v_replay := api.rpc_gdpr_start_erasure(v_next, 'actor', v_actor::text, 'anonymize', NULL);
  ASSERT (v_replay->>'operationId')::uuid <> v_operation,
    'Après résultat certain, un nouveau geste reste possible';
  ASSERT (SELECT count(*)=v_count+2 FROM public.gdpr_erasure_log);

  -- Autorité courante avant recherche : pas de lookup par un compte métier.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub','00000000-0000-4000-a000-00000000ae11','role','authenticated')::text, true);
  ASSERT api.is_platform_superuser() IS NOT TRUE, 'Contrôle négatif réel de la fixture';
  v_refused := false;
  BEGIN PERFORM api.rpc_gdpr_find_start_request(v_request);
  EXCEPTION WHEN insufficient_privilege THEN v_refused := true; END;
  ASSERT v_refused, 'Un lookup ne contourne pas les droits courants';
END;
$test$;
ROLLBACK;

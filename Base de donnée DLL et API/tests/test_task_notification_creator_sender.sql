-- Local/test databases only. Every fixture and outbox mutation is rolled back.
-- No SMTP connection is made. The creator, assigner and recipient are distinct.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  v_creator uuid := '00000000-0000-4000-a000-000000000941';
  v_assigner uuid := '00000000-0000-4000-a000-000000000942';
  v_recipient uuid := '00000000-0000-4000-a000-000000000943';
  v_object text := 'HOTRUN9999990941';
  v_task uuid := '00000000-0000-4000-b000-000000000941';
  v_notification uuid := '00000000-0000-4000-c000-000000000941';
  v_review uuid := '00000000-0000-4000-c000-000000000942';
  v_rows jsonb;
  v_row jsonb;
  v_empty_email text;
BEGIN
  ASSERT has_function_privilege('service_role', 'api.claim_unmailed_notifications(integer)', 'execute'),
    'Server must be able to claim';
  ASSERT NOT has_function_privilege('anon', 'api.claim_unmailed_notifications(integer)', 'execute'),
    'Anonymous clients must not read creator e-mails';
  ASSERT NOT has_function_privilege('authenticated', 'api.claim_unmailed_notifications(integer)', 'execute'),
    'Authenticated clients must not read creator e-mails';

  INSERT INTO auth.users (id, email) VALUES
    (v_creator, 'creator@example.test'), (v_assigner, 'assigner@example.test'),
    (v_recipient, 'recipient@example.test');
  INSERT INTO public.app_user_profile (id, role, display_name) VALUES
    (v_creator, 'tourism_agent', 'Camille Créatrice'),
    (v_assigner, 'tourism_agent', 'Alex Réaffectation'),
    (v_recipient, 'tourism_agent', 'Éditeur Destinataire')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO public.object (id, object_type, name, status)
    VALUES (v_object, 'HOT', 'Hôtel sender test', 'draft');
  INSERT INTO public.crm_task (id, object_id, title, owner, created_by, due_at)
    VALUES (v_task, v_object, 'Tâche réaffectée', v_recipient, v_creator, '2026-09-20T10:00:00Z');

  -- Isolate this transaction's outbox; none of these changes survives ROLLBACK.
  UPDATE public.app_notification SET email_sent_at = now() WHERE email_sent_at IS NULL;
  INSERT INTO public.app_notification (id, recipient_id, kind, task_id, created_by, payload) VALUES
    (v_notification, v_recipient, 'crm_task_assigned', v_task, v_assigner,
      '{"creator_email":"forged@example.test","creator_name":"Forged sender"}'),
    (v_review, v_recipient, 'fiche_submission_reviewed', v_task, v_assigner,
      '{"outcome":"approved","submission_id":"sender-test-submission"}');
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'service_role', 'sub', v_assigner)::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
  v_rows := api.claim_unmailed_notifications(20);
  EXECUTE 'RESET ROLE';
  ASSERT jsonb_array_length(v_rows) = 2, 'Both existing notification kinds must still be claimed';
  SELECT item INTO v_row FROM jsonb_array_elements(v_rows) item
    WHERE item->>'notification_id' = v_notification::text;
  ASSERT v_row->>'creator_email' = 'creator@example.test',
    'Sender must be the task creator, never the assigner, recipient, caller or payload';
  ASSERT v_row->>'creator_name' = 'Camille Créatrice', 'Creator display name must match creator';
  ASSERT v_row->>'assigner_name' = 'Alex Réaffectation', 'Assigner label must retain its existing meaning';
  ASSERT v_row->>'recipient_email' = 'recipient@example.test', 'Recipient must stay unchanged';
  ASSERT v_row->>'task_title' = 'Tâche réaffectée' AND v_row->>'object_name' = 'Hôtel sender test'
    AND (v_row->>'due_at')::timestamptz = '2026-09-20T10:00:00Z'::timestamptz,
    'Existing task content must survive RPC replacement';
  SELECT item INTO v_row FROM jsonb_array_elements(v_rows) item
    WHERE item->>'notification_id' = v_review::text;
  ASSERT v_row->>'kind' = 'fiche_submission_reviewed' AND v_row->>'outcome' = 'approved'
    AND v_row->>'submission_id' = 'sender-test-submission', 'Portal review payload must survive';
  ASSERT v_row ? 'creator_email' AND v_row->>'creator_email' IS NULL
    AND v_row->>'creator_name' IS NULL, 'Portal reviews keep the configured SMTP sender';

  UPDATE public.app_notification SET email_sent_at = now() WHERE id = v_review;
  -- Changing the creator's account affects the next claim, without snapshotting PII.
  UPDATE auth.users SET email = 'creator-updated@example.test' WHERE id = v_creator;
  UPDATE public.app_user_profile SET display_name = 'Camille Nouveau Nom' WHERE id = v_creator;
  UPDATE public.app_notification SET email_claimed_at = now() - interval '5 minutes'
    WHERE id = v_notification;
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0, 'Claim still holds at five minutes';
  UPDATE public.app_notification SET email_claimed_at = now() - interval '11 minutes'
    WHERE id = v_notification;
  v_row := api.claim_unmailed_notifications(20)->0;
  ASSERT v_row->>'creator_email' = 'creator-updated@example.test'
    AND v_row->>'creator_name' = 'Camille Nouveau Nom', 'Expired claims use current creator details';

  FOREACH v_empty_email IN ARRAY ARRAY[NULL::text, '', '   '] LOOP
    UPDATE auth.users SET email = v_empty_email WHERE id = v_creator;
    UPDATE public.app_notification SET email_claimed_at = NULL WHERE id = v_notification;
    v_rows := api.claim_unmailed_notifications(20);
    ASSERT jsonb_array_length(v_rows) = 1 AND (v_rows->0) ? 'creator_email'
      AND v_rows->0->>'creator_email' IS NULL,
      'Missing/blank creator e-mail must preserve delivery with SMTP fallback';
  END LOOP;
  UPDATE auth.users SET email = 'creator@example.test' WHERE id = v_creator;

  UPDATE public.crm_task SET created_by = NULL WHERE id = v_task;
  UPDATE public.app_notification SET email_claimed_at = NULL WHERE id = v_notification;
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 1 AND v_rows->0->>'creator_email' IS NULL
    AND v_rows->0->>'creator_name' IS NULL, 'Historical tasks must not invent a creator';
  UPDATE public.crm_task SET created_by = v_creator WHERE id = v_task;
  DELETE FROM auth.users WHERE id = v_creator;
  UPDATE public.app_notification SET email_claimed_at = NULL WHERE id = v_notification;
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 1 AND v_rows->0->>'creator_email' IS NULL
    AND v_rows->0->>'creator_name' IS NULL, 'Deleted creators must not be retained in the outbox';

  UPDATE public.app_notification SET email_claimed_at = NULL, email_attempts = 5
    WHERE id = v_notification;
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0,
    'Exhausted notifications must remain out of the queue';
  UPDATE public.app_notification SET email_attempts = 0 WHERE id = v_notification;
  UPDATE auth.users SET email = '' WHERE id = v_recipient;
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0,
    'Missing recipient e-mail must still be excluded';
  ASSERT (SELECT email_sent_at IS NOT NULL AND email_error = 'no_recipient_email'
    FROM public.app_notification WHERE id = v_notification), 'Missing-recipient termination must survive';

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_assigner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM api.claim_unmailed_notifications(20);
    RAISE EXCEPTION 'Authenticated callers unexpectedly read the outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: creator sender, reassignment, live identity, fallback, portal, TTL, retry and permissions';
END $test$;
ROLLBACK;

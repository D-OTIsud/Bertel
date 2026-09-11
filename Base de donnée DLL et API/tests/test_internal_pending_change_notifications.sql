-- Ordinary contributor notification contract. Transactional: never sends email
-- and leaves no fixtures, claims, inbox rows or permission changes behind.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  ASSERT lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) <> 'off',
    'notification test assertions are disabled';
  ASSERT to_regprocedure('internal.user_can_moderate_pending_object(uuid,text)') IS NOT NULL,
    'recipient authorization helper missing';
  ASSERT NOT has_function_privilege('authenticated', 'internal.sync_pending_change_notifications(text,uuid)', 'EXECUTE'),
    'authenticated must not write arbitrary inboxes';
  ASSERT NOT has_function_privilege('service_role', 'internal.sync_pending_change_notifications(text,uuid)', 'EXECUTE'),
    'internal notification helper must remain owner-only';
  ASSERT NOT has_function_privilege('authenticated', 'api.claim_unmailed_notifications(integer)', 'EXECUTE')
     AND has_function_privilege('service_role', 'api.claim_unmailed_notifications(integer)', 'EXECUTE'),
    'outbox must remain service-role-only';
  ASSERT EXISTS (SELECT 1 FROM pg_index i
                 WHERE i.indexrelid = 'public.uq_app_notification_pending_change_recipient'::regclass
                   AND i.indisunique),
    'concurrent duplicate deliveries require a unique recipient/group index';
  ASSERT pg_get_functiondef('internal.tg_pending_change_notifications()'::regprocedure)
         LIKE '%pg_advisory_xact_lock%',
    'submission and final review must serialize their group lifecycle';
END $$;

DO $$
DECLARE
  v_org text := 'ORGNTF9999990001';
  v_other_org text := 'ORGNTF9999990002';
  v_object text := 'HOTNTF9999990001';
  v_submitter uuid := '72000000-0000-4000-a000-000000000001';
  v_direct uuid := '72000000-0000-4000-a000-000000000002';
  v_role uuid := '72000000-0000-4000-a000-000000000003';
  v_no_permission uuid := '72000000-0000-4000-a000-000000000004';
  v_outside uuid := '72000000-0000-4000-a000-000000000005';
  v_inactive uuid := '72000000-0000-4000-a000-000000000006';
  v_cross_org_role uuid := '72000000-0000-4000-a000-000000000007';
  v_admin_only uuid := '72000000-0000-4000-a000-000000000008';
  v_super uuid := '72000000-0000-4000-a000-000000000009';
  v_test_realm uuid := '72000000-0000-4000-a000-000000000010';
  v_no_email uuid := '72000000-0000-4000-a000-000000000011';
  v_users uuid[];
  v_expected uuid[];
  v_user uuid;
  v_pub_role uuid;
  v_editor_role uuid;
  v_admin_role uuid;
  v_permission uuid;
  v_first uuid;
  v_second uuid;
  v_new uuid;
  v_notification uuid;
  v_next_notification uuid;
  v_portal uuid;
  v_portal_change uuid;
  v_inbox jsonb;
  v_claim jsonb;
  v_row jsonb;
  v_expected_permission boolean;
BEGIN
  v_users := ARRAY[v_submitter,v_direct,v_role,v_no_permission,v_outside,v_inactive,
                   v_cross_org_role,v_admin_only,v_super,v_test_realm,v_no_email];
  v_expected := ARRAY[v_direct,v_role,v_cross_org_role,v_super,v_no_email];
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';
  SELECT id INTO v_editor_role FROM ref_org_business_role WHERE code = 'editor';
  SELECT id INTO v_admin_role FROM ref_org_admin_role WHERE code = 'org_admin';
  SELECT id INTO v_permission FROM ref_permission WHERE code = 'validate_changes' AND is_active;
  ASSERT v_pub_role IS NOT NULL AND v_editor_role IS NOT NULL
     AND v_admin_role IS NOT NULL AND v_permission IS NOT NULL,
    'fixture requires the publisher/editor/admin roles and validate_changes permission';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'Notification organisation', 'published'),
    (v_other_org, 'ORG', 'Other notification organisation', 'published'),
    (v_object, 'HOT', 'Notification hotel', 'published');
  INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary)
    VALUES (v_object, v_org, v_pub_role, true);
  INSERT INTO auth.users (id, email, raw_app_meta_data)
    SELECT u, CASE WHEN u = v_no_email THEN NULL ELSE u::text || '@example.test' END,
           CASE WHEN u = v_test_realm THEN '{"sandbox_discovery":true}'::jsonb ELSE '{}'::jsonb END
    FROM unnest(v_users) u;
  INSERT INTO public.app_user_profile (id, role, display_name)
    SELECT u, CASE WHEN u IN (v_super, v_cross_org_role) THEN 'super_admin' ELSE 'tourism_agent' END,
           CASE WHEN u = v_submitter THEN 'Contributor notification fixture' ELSE 'Reviewer notification fixture' END
    FROM unnest(v_users) u
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    SELECT u, CASE WHEN u = v_outside THEN v_other_org ELSE v_org END, u <> v_inactive
    FROM unnest(v_users) u WHERE u <> v_super;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_cross_org_role, v_other_org, true);
  -- Same legal historical fixture as test_listes_cycle_vie S7: a platform
  -- administrator is demoted after two memberships. The membership trigger
  -- does not erase those memberships when the profile role changes.
  UPDATE public.app_user_profile SET role='tourism_agent' WHERE id=v_cross_org_role;
  ASSERT (SELECT count(*) FROM public.user_org_membership
          WHERE user_id=v_cross_org_role AND is_active)=2,
    'cross-membership fixture must retain two active memberships after demotion';
  INSERT INTO public.user_permission (user_id, permission_id, is_active)
    SELECT u, v_permission, true FROM unnest(ARRAY[v_submitter,v_direct,v_outside,v_inactive,v_test_realm,v_no_email]) u;
  INSERT INTO public.user_org_business_role (membership_id, role_id, is_active)
    SELECT m.id, v_editor_role, true FROM public.user_org_membership m
    WHERE (m.user_id = v_role AND m.org_object_id = v_org)
       OR (m.user_id = v_cross_org_role AND m.org_object_id = v_other_org);
  INSERT INTO public.org_role_permission (org_object_id, role_id, permission_id, is_active)
    VALUES (v_org, v_editor_role, v_permission, true), (v_other_org, v_editor_role, v_permission, true)
    ON CONFLICT (org_object_id, role_id, permission_id) DO UPDATE SET is_active=true;
  INSERT INTO public.user_org_admin_role (membership_id, role_id, is_active)
    SELECT m.id, v_admin_role, true FROM public.user_org_membership m WHERE m.user_id = v_admin_only;

  -- Compare every recipient with the actual moderation authorization, including
  -- grants from another active membership and the server-controlled test realm.
  FOREACH v_user IN ARRAY v_users LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated',
      'app_metadata', (SELECT raw_app_meta_data FROM auth.users WHERE id = v_user))::text, true);
    v_expected_permission := v_user = v_submitter OR v_user = ANY(v_expected);
    ASSERT COALESCE(api.user_can_moderate_object(v_object), false) = v_expected_permission,
      format('fixture actual moderation permission mismatch for %s', v_user);
    ASSERT internal.user_can_moderate_pending_object(v_user, v_object) = v_expected_permission,
      format('notification recipient differs from actual moderation permission for %s', v_user);
  END LOOP;

  -- Isolate the outbox inside this rollback-only transaction. No delivery occurs.
  UPDATE public.app_notification SET email_sent_at = now() WHERE email_sent_at IS NULL;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_submitter,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_first := api.submit_pending_change(v_object, 'object', v_object, 'update', '{}', '{"field":"contacts"}');
    v_second := api.submit_pending_change(v_object, 'object', v_object, 'update', '{}', '{"field":"descriptions"}');
  RESET ROLE;
  ASSERT (SELECT array_agg(n.recipient_id ORDER BY n.recipient_id)
          FROM public.app_notification n WHERE n.kind = 'pending_change_submitted'
            AND n.payload->>'object_id' = v_object AND n.recipient_id = ANY(v_users)) = v_expected,
    'two section submissions must create exactly one alert per eligible moderator, excluding submitter';
  SELECT id INTO v_notification FROM public.app_notification
    WHERE kind = 'pending_change_submitted' AND payload->>'object_id' = v_object AND recipient_id = v_direct;
  ASSERT v_notification IS NOT NULL, 'expected reviewer alert is missing';
  BEGIN
    INSERT INTO public.app_notification (recipient_id,kind,created_by,payload)
    VALUES (v_direct,'pending_change_submitted',v_submitter,
            jsonb_build_object('object_id',v_object,'pending_change_id',v_second,'submitted_by',v_submitter));
    RAISE EXCEPTION 'duplicate recipient/group unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_direct,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_inbox := api.list_my_notifications();
    ASSERT jsonb_array_length(v_inbox->'items') = 1 AND (v_inbox->>'unread_count')::integer = 1,
      'reviewer bell must show and count exactly one proposal';
    ASSERT v_inbox#>>'{items,0,object_id}' = v_object
       AND v_inbox#>>'{items,0,object_name}' = 'Notification hotel'
       AND v_inbox#>>'{items,0,created_by_name}' = 'Contributor notification fixture',
      'bell object and submitter names must resolve without a CRM task';
  RESET ROLE;

  -- Revoke permission between submission and delivery: hide inbox/count and
  -- skip e-mail. Restoring it reveals the same row, not a fresh duplicate.
  UPDATE public.user_permission SET is_active = false
    WHERE user_id = v_direct AND permission_id = v_permission;
  SET LOCAL ROLE authenticated;
    v_inbox := api.list_my_notifications();
    ASSERT jsonb_array_length(v_inbox->'items') = 0 AND (v_inbox->>'unread_count')::integer = 0,
      'revoked moderator must not see proposal or unread count';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_claim := api.claim_unmailed_notifications(200);
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_claim) x WHERE x->>'notification_id' = v_notification::text),
    'revoked moderator must not receive e-mail';
  ASSERT EXISTS (SELECT 1 FROM public.app_notification WHERE kind='pending_change_submitted'
                   AND recipient_id=v_no_email AND email_sent_at IS NOT NULL AND email_error='no_recipient_email'),
    'recipient without email must finish without blocking or retry flooding';
  UPDATE public.user_permission SET is_active = true
    WHERE user_id = v_direct AND permission_id = v_permission;
  v_claim := api.claim_unmailed_notifications(200);
  SELECT x INTO v_row FROM jsonb_array_elements(v_claim) x WHERE x->>'notification_id' = v_notification::text;
  ASSERT v_row IS NOT NULL AND v_row->>'kind' = 'pending_change_submitted'
     AND v_row->>'object_id' = v_object AND v_row->>'object_name' = 'Notification hotel'
     AND v_row->>'assigner_name' = 'Contributor notification fixture'
     AND v_row->>'creator_email' IS NULL,
    'email contract must resolve proposal labels, preserve standard SMTP sender, and include destination';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.claim_unmailed_notifications(200)) x
                     WHERE x->>'notification_id'=v_notification::text),
    'a claimed email must not be reclaimed inside the lease';
  PERFORM api.mark_notifications_emailed(ARRAY[v_notification]);
  UPDATE public.app_notification SET read_at=now() WHERE id=v_notification;

  UPDATE public.pending_change SET status='approved', reviewed_by=v_direct, reviewed_at=now() WHERE id=v_first;
  ASSERT (SELECT id=v_notification AND read_at IS NOT NULL AND email_sent_at IS NOT NULL
          FROM public.app_notification WHERE id=v_notification),
    'partial approval must preserve the same read/sent notification';
  ASSERT (SELECT count(*) FROM public.app_notification WHERE kind='pending_change_submitted'
            AND payload->>'object_id'=v_object AND recipient_id=v_direct)=1,
    'partial approval must not re-notify';
  ASSERT (SELECT payload->>'pending_change_id' FROM public.app_notification WHERE id=v_notification)=v_second::text,
    'partial approval must anchor a remaining pending item';
  UPDATE public.pending_change SET status='rejected', reviewed_by=v_direct, reviewed_at=now() WHERE id=v_second;
  ASSERT NOT EXISTS (SELECT 1 FROM public.app_notification WHERE kind='pending_change_submitted'
                     AND payload->>'object_id'=v_object),
    'resolving the final section must remove all actionable proposal alerts';

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_submitter,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
    v_new := api.submit_pending_change(v_object,'object',v_object,'update','{}','{}');
  RESET ROLE;
  SELECT id INTO v_next_notification FROM public.app_notification
    WHERE kind='pending_change_submitted' AND payload->>'object_id'=v_object AND recipient_id=v_direct;
  ASSERT v_next_notification IS NOT NULL AND v_next_notification <> v_notification,
    'a later proposal after completed review must produce a new notification';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM api.claim_unmailed_notifications(200);
  PERFORM api.mark_notifications_emailed('{}',jsonb_build_array(jsonb_build_object('id',v_next_notification,'error','temporary_failure')));
  ASSERT (SELECT email_attempts=1 AND email_claimed_at IS NULL AND email_sent_at IS NULL
          FROM public.app_notification WHERE id=v_next_notification),
    'proposal email failure must release claim and count retry';
  UPDATE public.app_notification SET email_attempts=5 WHERE id=v_next_notification;
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.claim_unmailed_notifications(200)) x
                     WHERE x->>'notification_id'=v_next_notification::text),
    'proposal retries must stop at the existing cap';
  DELETE FROM public.pending_change WHERE id=v_new;
  ASSERT NOT EXISTS (SELECT 1 FROM public.app_notification WHERE kind='pending_change_submitted'
                     AND payload->>'object_id'=v_object),
    'deletion of final pending item must clean proposal alerts';

  -- Portal submissions already produce their own verification task. Their
  -- pending_change rows must never create this second notification type.
  INSERT INTO public.fiche_submission (object_id,submitted_by) VALUES (v_object,v_submitter) RETURNING id INTO v_portal;
  INSERT INTO public.pending_change (object_id,target_table,target_pk,action,payload,submitted_by,status,submission_id)
    VALUES (v_object,'object',v_object,'update','{}',v_submitter,'pending',v_portal) RETURNING id INTO v_portal_change;
  ASSERT NOT EXISTS (SELECT 1 FROM public.app_notification WHERE kind='pending_change_submitted'
                     AND payload->>'object_id'=v_object),
    'portal section must not duplicate its existing verification notification';
  UPDATE public.pending_change SET status='approved',reviewed_by=v_direct,reviewed_at=now() WHERE id=v_portal_change;
  ASSERT EXISTS (SELECT 1 FROM public.app_notification WHERE kind='fiche_submission_reviewed'
                  AND payload->>'submission_id'=v_portal::text),
    'portal review notification behavior must remain intact';
END $$;

ROLLBACK;

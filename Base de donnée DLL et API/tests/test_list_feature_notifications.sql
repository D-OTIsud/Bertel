-- Prouve la notification inbox des propositions de listes.
-- Autoportant et transactionnel : les fixtures et les lignes inbox sont annulées.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) = 'off' THEN
    RAISE EXCEPTION 'harnais VACANT: plpgsql.check_asserts = off';
  END IF;
  ASSERT to_regprocedure('internal.notify_list_feature_reviewers(uuid)') IS NOT NULL,
    'helper de notification de proposition absent';
  ASSERT to_regprocedure('internal.backfill_list_feature_notifications()') IS NOT NULL,
    'backfill de notifications de proposition absent';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_app_notification_list_feature_recipient'
  ), 'index unique anti-doublon de proposition absent';
  ASSERT (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conname = 'chk_app_notification_kind'
            AND conrelid = 'public.app_notification'::regclass)
         LIKE '%list_feature_requested%',
    'CHECK fail-closed ne reconnait pas list_feature_requested';
END $$;

DO $$
DECLARE
  v_org_a text := 'ORGLNTF000000001';
  v_org_b text := 'ORGLNTF000000002';
  v_owner uuid := '70000000-0000-4000-a000-000000000001';
  v_admin_a uuid := '70000000-0000-4000-a000-000000000002';
  v_admin_b uuid := '70000000-0000-4000-a000-000000000003';
  v_super uuid := '70000000-0000-4000-a000-000000000004';
  v_admin_role uuid;
  v_list uuid;
  v_backfill uuid;
  v_delete uuid;
  v_inbox jsonb;
  v_deleted integer;
BEGIN
  SELECT id INTO v_admin_role FROM ref_org_admin_role WHERE code = 'org_admin' LIMIT 1;
  ASSERT v_admin_role IS NOT NULL, 'fixture: role org_admin manquant';

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org_a, 'ORG', 'Organisation inbox A', 'published'),
    (v_org_b, 'ORG', 'Organisation inbox B', 'published'),
    ('HOTLNTF000000001', 'HOT', 'Hotel inbox', 'published');
  INSERT INTO auth.users (id, email) VALUES
    (v_owner, 'owner-list-notification@example.test'),
    (v_admin_a, 'admin-a-list-notification@example.test'),
    (v_admin_b, 'admin-b-list-notification@example.test'),
    (v_super, 'super-list-notification@example.test');
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_owner, 'tourism_agent', 'Owner notification'),
    (v_admin_a, 'tourism_agent', 'Admin A notification'),
    (v_admin_b, 'tourism_agent', 'Admin B notification'),
    (v_super, 'owner', 'Super notification')
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        display_name = EXCLUDED.display_name;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_owner, v_org_a, TRUE),
    (v_admin_a, v_org_a, TRUE),
    (v_admin_b, v_org_b, TRUE);
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
  SELECT m.id, v_admin_role, TRUE
  FROM user_org_membership m
  WHERE (m.user_id = v_admin_a AND m.org_object_id = v_org_a)
     OR (m.user_id = v_admin_b AND m.org_object_id = v_org_b);

  -- The owner makes a first proposal.  It must reach only the org-A reviewer
  -- and the explicit platform superuser, never a rank-30 admin of org B.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_list := api.create_list('static', 'Liste à valider', ARRAY['HOTLNTF000000001'], NULL, NULL);
    PERFORM api.request_list_feature(v_list);
    PERFORM api.request_list_feature(v_list); -- retry is idempotent
  RESET ROLE;

  ASSERT (SELECT array_agg(recipient_id ORDER BY recipient_id)
          FROM app_notification
          WHERE kind = 'list_feature_requested'
            AND payload->>'list_id' = v_list::text
            AND recipient_id IN (v_admin_a, v_admin_b, v_super))
         = ARRAY[v_admin_a, v_super],
    'parmi les personas de fixture, seuls l admin de l ORG exacte et le superuser sont notifies';
  ASSERT NOT EXISTS (
    SELECT 1 FROM app_notification
    WHERE kind = 'list_feature_requested'
      AND payload->>'list_id' = v_list::text
      AND recipient_id = v_admin_b
  ), 'un admin de l autre ORG ne doit jamais etre notifie';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_inbox := api.list_my_notifications();
    ASSERT jsonb_array_length(v_inbox->'items') = 1
       AND v_inbox#>>'{items,0,kind}' = 'list_feature_requested',
      'admin de la bonne ORG doit voir sa proposition dans son inbox';
    ASSERT v_inbox#>>'{items,0,payload,list_id}' = v_list::text
       AND v_inbox#>>'{items,0,payload,list_name}' = 'Liste à valider'
       AND v_inbox#>>'{items,0,payload,org_object_id}' = v_org_a,
      'payload de proposition incomplet ou incorrect';
    ASSERT (v_inbox->>'unread_count')::integer = 1,
      'la proposition non lue doit compter dans unread_count';
  RESET ROLE;

  -- Current eligibility is evaluated again when reading: revoking membership
  -- hides both the payload and its unread count without exposing org A.
  UPDATE user_org_membership SET is_active = FALSE
  WHERE user_id = v_admin_a AND org_object_id = v_org_a;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_inbox := api.list_my_notifications();
    ASSERT jsonb_array_length(v_inbox->'items') = 0 AND (v_inbox->>'unread_count')::integer = 0,
      'role revoque ne doit plus voir ni compter la proposition';
  RESET ROLE;
  UPDATE user_org_membership SET is_active = TRUE
  WHERE user_id = v_admin_a AND org_object_id = v_org_a;

  -- An archived pending proposal is likewise not actionable in inbox; restoring
  -- activity makes the same pending alert visible again without a duplicate.
  UPDATE object_list SET last_activity_at = now() - interval '22 days' WHERE id = v_list;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_inbox := api.list_my_notifications();
    ASSERT jsonb_array_length(v_inbox->'items') = 0 AND (v_inbox->>'unread_count')::integer = 0,
      'proposition archivee ne doit plus etre actionnable dans inbox';
    BEGIN
      PERFORM api.review_list_feature(v_list, TRUE);
      RAISE EXCEPTION 'review archivee aurait du etre NOT_PENDING';
    EXCEPTION WHEN OTHERS THEN
      ASSERT SQLSTATE = 'PT409',
        format('review archivee doit etre NOT_PENDING (PT409), recu %s', SQLSTATE);
    END;
  RESET ROLE;
  UPDATE object_list SET last_activity_at = now() WHERE id = v_list;

  -- This kind remains in-app only: the SMTP claim returns no row even though
  -- email_sent_at is NULL (the claim whitelist must stay closed).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM api.claim_unmailed_notifications(20);
  ASSERT (SELECT count(*) FROM app_notification
          WHERE kind = 'list_feature_requested' AND email_claimed_at IS NOT NULL) = 0,
    'list_feature_requested ne doit jamais recevoir email_claimed_at';

  -- Refusing resolves every recipient row.  The current admin can review after
  -- the archived probe has restored the lifecycle clock.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.review_list_feature(v_list, FALSE);
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM app_notification
                     WHERE kind = 'list_feature_requested' AND payload->>'list_id' = v_list::text),
    'refus doit retirer les anciennes notifications de proposition';

  -- Simulate a proposal predating this migration, then invoke the same
  -- backfill routine the migration calls.  It creates the eligible recipients
  -- once, and repeated invocation stays deduplicated.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_backfill := api.create_list('static', 'Liste historique pending', ARRAY['HOTLNTF000000001'], NULL, NULL);
  RESET ROLE;
  UPDATE object_list SET feature_requested_at = now() WHERE id = v_backfill;
  PERFORM internal.backfill_list_feature_notifications();
  PERFORM internal.backfill_list_feature_notifications();
  ASSERT (SELECT array_agg(recipient_id ORDER BY recipient_id)
          FROM app_notification
          WHERE kind = 'list_feature_requested'
            AND payload->>'list_id' = v_backfill::text
            AND recipient_id IN (v_admin_a, v_admin_b, v_super))
         = ARRAY[v_admin_a, v_super],
    'backfill doit creer les reviewers de fixture une seule fois';

  -- The deletion trigger also covers future retention purges and direct SQL
  -- deletes, not only api.delete_list.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_delete := api.create_list('static', 'Liste a supprimer', ARRAY['HOTLNTF000000001'], NULL, NULL);
    PERFORM api.request_list_feature(v_delete);
    PERFORM api.delete_list(v_delete);
  RESET ROLE;
  SELECT count(*) INTO v_deleted FROM app_notification
  WHERE kind = 'list_feature_requested' AND payload->>'list_id' = v_delete::text;
  ASSERT v_deleted = 0, 'suppression de liste doit retirer son inbox orphan';

  -- All cards now report capability state independently of editorial status:
  -- live, expired, and explicitly revoked links are three distinct states.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT e->>'has_active_share_link'
            FROM jsonb_array_elements(api.list_my_lists()::jsonb) e
            WHERE e->>'id' = v_backfill::text) = 'false',
      'une liste non partagee doit emettre has_active_share_link=false';
    PERFORM api.share_list(v_backfill, TRUE, NULL);
    ASSERT (SELECT e->>'has_active_share_link'
            FROM jsonb_array_elements(api.list_my_lists()::jsonb) e
            WHERE e->>'id' = v_backfill::text) = 'true',
      'un token active non expire doit emettre has_active_share_link=true';
    PERFORM api.share_list(v_backfill, TRUE, now() - interval '1 minute');
    ASSERT (SELECT e->>'has_active_share_link'
            FROM jsonb_array_elements(api.list_my_lists()::jsonb) e
            WHERE e->>'id' = v_backfill::text) = 'false',
      'un token expire doit emettre has_active_share_link=false';
    PERFORM api.share_list(v_backfill, FALSE, NULL);
    ASSERT (SELECT e->>'has_active_share_link'
            FROM jsonb_array_elements(api.list_my_lists()::jsonb) e
            WHERE e->>'id' = v_backfill::text) = 'false',
      'un token revoque doit emettre has_active_share_link=false';
  RESET ROLE;
END $$;

ROLLBACK;

-- Actor identities must remain in their creation realm, including after unlinking.
-- Run after 20260907073235_actor_test_realm_isolation.sql. Every write, including
-- export audit records, is rolled back. Persona checks execute as authenticated,
-- so SECURITY DEFINER RPCs and direct RLS reads are exercised independently.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  v_org text[] := ARRAY['ORGRUN9999992701', 'ORGRUN9999992702'];
  v_obj text[] := ARRAY['HOTRUN9999992711', 'HOTRUN9999992712'];
  -- Index 1 is production; index 2 is the sandbox. The final four accounts are
  -- production/sandbox platform owners, then actor portals without memberships.
  v_user uuid[] := ARRAY[
    '00000000-0000-4000-a000-000000002701'::uuid,
    '00000000-0000-4000-a000-000000002702'::uuid,
    '00000000-0000-4000-a000-000000002703'::uuid,
    '00000000-0000-4000-a000-000000002704'::uuid,
    '00000000-0000-4000-a000-000000002705'::uuid,
    '00000000-0000-4000-a000-000000002706'::uuid
  ];
  v_linked uuid[] := ARRAY[NULL::uuid, NULL::uuid];
  v_prospect uuid[] := ARRAY[NULL::uuid, NULL::uuid];
  v_orphan uuid[] := ARRAY[NULL::uuid, NULL::uuid];
  v_channel uuid[] := ARRAY[NULL::uuid, NULL::uuid];
  v_note uuid[] := ARRAY[NULL::uuid, NULL::uuid];
  v_pub_role uuid;
  v_actor_role uuid;
  v_permission uuid;
  v_email_kind uuid;
  v_seed uuid;
  v_payload jsonb;
  v_directory jsonb;
  v_denied boolean;
  v_i integer;
  v_persona integer;
  v_other integer;
  v_is_test boolean;
  v_target uuid;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'actor'
      AND column_name = 'is_test' AND is_nullable = 'NO'
  ), 'actor realm: persistent NOT NULL actor.is_test is missing';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.actor WHERE extra->>'test_corpus' = 'true' AND NOT is_test
  ), 'actor realm: existing seed actors were not backfilled';

  SELECT id INTO v_pub_role FROM public.ref_org_role WHERE code = 'publisher';
  SELECT id INTO v_actor_role FROM public.ref_actor_role WHERE code = 'operator';
  SELECT id INTO v_email_kind FROM public.ref_code_contact_kind WHERE code = 'email' AND is_active;
  ASSERT v_pub_role IS NOT NULL AND v_actor_role IS NOT NULL AND v_email_kind IS NOT NULL,
    'actor realm fixture: publisher/operator/email catalogues are required';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.object (id, object_type, name, status) VALUES
    (v_org[1], 'ORG', 'Actor realm production organisation', 'published'),
    (v_org[2], 'ORG', 'Actor realm sandbox organisation', 'published'),
    (v_obj[1], 'HOT', 'Actor realm production hotel', 'published'),
    (v_obj[2], 'HOT', 'Actor realm sandbox hotel', 'published');
  INSERT INTO public.org_config (org_object_id, access_scope, is_test_org) VALUES
    (v_org[1], 'all_published', false), (v_org[2], 'own_objects_only', true);
  INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_obj[1], v_org[1], v_pub_role, true), (v_obj[2], v_org[2], v_pub_role, true);

  FOR v_i IN 1..6 LOOP
    INSERT INTO auth.users (id, email)
    VALUES (v_user[v_i], format('actor-realm-%s@test.local', v_i));
    INSERT INTO public.app_user_profile (id, role, display_name)
    VALUES (v_user[v_i], CASE WHEN v_i IN (3, 4) THEN 'owner' ELSE 'tourism_agent' END,
      format('Actor realm persona %s', v_i))
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  END LOOP;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_user[1], v_org[1], true), (v_user[2], v_org[2], true),
    (v_user[4], v_org[2], true);
  FOR v_permission IN
    SELECT id FROM public.ref_permission WHERE code IN ('create_object', 'write_crm_notes') AND is_active
  LOOP
    INSERT INTO public.user_permission (user_id, permission_id, is_active) VALUES
      (v_user[1], v_permission, true), (v_user[2], v_permission, true);
  END LOOP;

  -- An administrative seed insert uses the same trusted marker as the real
  -- corpus generator. This actor intentionally has neither owner nor object.
  INSERT INTO public.actor (display_name, extra)
  VALUES ('Zzactorrealm Seed orphan', '{"test_corpus":true}'::jsonb)
  RETURNING id INTO v_seed;
  ASSERT (SELECT is_test FROM public.actor WHERE id = v_seed),
    'actor realm: a trusted seed orphan lost its sandbox provenance';

  -- Exercise real creation paths. The client deliberately supplies the opposite
  -- is_test / owner / seed values; creation realm must come from trusted context.
  FOR v_i IN 1..2 LOOP
    v_other := 3 - v_i;
    v_is_test := v_i = 2;
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_user[v_i], 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.current_user_test_realm() = v_is_test, 'actor realm fixture: wrong caller realm';
      ASSERT api.current_user_can_edit_objects(), 'actor realm fixture: picker permission missing';
      ASSERT api.user_can_write_crm(v_obj[v_i]), 'actor realm fixture: CRM write permission missing';
      v_payload := api.save_crm_actor(jsonb_build_object(
        'display_name', format('Zzactorrealm Linked %s', v_i), 'object_id', v_obj[v_i],
        'is_test', NOT v_is_test, 'crm_owner_org_id', v_org[v_other],
        'extra', jsonb_build_object('test_corpus', NOT v_is_test)));
      v_linked[v_i] := (v_payload->>'id')::uuid;
      v_payload := api.save_crm_actor(jsonb_build_object(
        'display_name', format('Zzactorrealm Prospect %s', v_i),
        'is_test', NOT v_is_test, 'crm_owner_org_id', v_org[v_other]));
      v_prospect[v_i] := (v_payload->>'id')::uuid;
      v_payload := api.save_crm_actor(jsonb_build_object(
        'display_name', format('Zzactorrealm Orphan %s', v_i), 'object_id', v_obj[v_i]));
      v_orphan[v_i] := (v_payload->>'id')::uuid;
      v_payload := api.save_actor_channel(jsonb_build_object(
        'actor_id', v_linked[v_i], 'kind_code', 'email', 'is_primary', true,
        'value', format('actor-realm-contact-%s@fixture.test', v_i)));
      v_channel[v_i] := (v_payload->>'id')::uuid;
      v_payload := api.save_crm_interaction(jsonb_build_object(
        'actor_id', v_linked[v_i], 'interaction_type', 'call', 'body', 'Actor-only realm fixture'));
      v_note[v_i] := (v_payload->>'id')::uuid;
    RESET ROLE;
    ASSERT v_linked[v_i] IS NOT NULL AND v_prospect[v_i] IS NOT NULL AND v_orphan[v_i] IS NOT NULL,
      'actor realm fixture: actor creation returned no identity';
    ASSERT (SELECT count(*) FROM public.actor
      WHERE id = ANY(ARRAY[v_linked[v_i], v_prospect[v_i], v_orphan[v_i]])
        AND is_test = v_is_test AND crm_owner_org_id = v_org[v_i]) = 3,
      'actor realm: a client payload chose the actor realm/owner or creation lost provenance';
  END LOOP;

  -- Losing the final object and owner must never turn sandbox data into real data.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM public.actor_object_role WHERE actor_id = ANY(v_orphan);
  UPDATE public.actor SET crm_owner_org_id = NULL WHERE id = ANY(v_orphan);
  ASSERT (SELECT is_test FROM public.actor WHERE id = v_orphan[2]),
    'actor realm: unlinking a sandbox actor relabelled it as production';
  ASSERT NOT (SELECT is_test FROM public.actor WHERE id = v_orphan[1]),
    'actor realm: unlinking a real actor changed its realm';

  -- Members and platform owners must obey the same separation. Owners expose
  -- the formerly leaking all-actors and unattached-prospects directory branches.
  FOR v_persona IN 1..4 LOOP
    v_i := CASE WHEN v_persona IN (1, 3) THEN 1 ELSE 2 END;
    v_other := 3 - v_i;
    v_is_test := v_i = 2;
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_user[v_persona], 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.current_user_test_realm() = v_is_test, 'actor realm: platform role changed caller realm';
      v_directory := api.list_crm_directory(p_search := 'zzactorrealm');
      ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_directory) d
        WHERE (d->>'actor_id')::uuid = v_linked[v_i]),
        format('actor realm P%s: same-realm linked actor disappeared from CRM', v_persona);
      ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_directory) d
        WHERE (d->>'actor_id')::uuid = v_prospect[v_i]),
        format('actor realm P%s: same-realm prospect disappeared from CRM', v_persona);
      ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_directory) d
        WHERE (d->>'actor_id')::uuid = ANY(ARRAY[v_linked[v_other], v_prospect[v_other], v_orphan[v_other]])),
        format('actor realm P%s: other-realm actor leaked into the CRM directory', v_persona);
      IF v_persona >= 3 THEN
        ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_directory) d
          WHERE (d->>'actor_id')::uuid = v_orphan[v_i]),
          'actor realm: same-realm owner lost the orphan directory branch';
      END IF;
      IF NOT v_is_test THEN
        ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_directory) d
          WHERE (d->>'actor_id')::uuid = v_seed),
          'actor realm: seeded sandbox orphan leaked into production CRM';
      ELSIF v_persona = 4 THEN
        ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_directory) d
          WHERE (d->>'actor_id')::uuid = v_seed),
          'actor realm: sandbox owner cannot find its seeded orphan';
      END IF;
      ASSERT EXISTS (SELECT 1 FROM api.search_actors('zzactorrealm') a WHERE a.id = v_linked[v_i]),
        'actor realm: same-realm picker result disappeared';
      ASSERT EXISTS (SELECT 1 FROM api.search_actors('zzactorrealm') a WHERE a.id = v_orphan[v_i]),
        'actor realm: same-realm unlinked actors must remain searchable for attachment';
      ASSERT NOT EXISTS (SELECT 1 FROM api.search_actors('zzactorrealm') a
        WHERE a.id = ANY(ARRAY[v_linked[v_other], v_prospect[v_other], v_orphan[v_other]])),
        format('actor realm P%s: other-realm identity leaked through search_actors', v_persona);
      ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_crm_actor_ids() AS a(id)
        WHERE a.id = ANY(ARRAY[v_linked[v_other], v_prospect[v_other], v_orphan[v_other]])),
        'actor realm: CRM scope helper crossed the realm boundary';

      -- Positive witnesses distinguish isolation from a completely broken fixture.
      ASSERT api.user_can_read_crm_actor(v_linked[v_i]) IS TRUE
        AND api.user_can_write_crm_actor(v_linked[v_i]) IS TRUE,
        'actor realm: same-realm actor guards are too restrictive';
      ASSERT api.list_actor_crm(v_linked[v_i])->'actor'->>'id' = v_linked[v_i]::text,
        'actor realm: same-realm CRM details are unavailable';
      ASSERT api.list_actor_support(v_linked[v_i]) IS NOT NULL,
        'actor realm: same-realm actor support is unavailable';
      PERFORM api.save_crm_actor(jsonb_build_object('id', v_linked[v_i],
        'first_name', 'Allowed edit', 'is_test', NOT v_is_test,
        'crm_owner_org_id', v_org[v_other]));
      PERFORM api.save_actor_channel(jsonb_build_object('id', v_channel[v_i], 'is_public', false));

      FOREACH v_target IN ARRAY ARRAY[v_linked[v_other], v_prospect[v_other], v_orphan[v_other]] LOOP
        ASSERT api.user_can_read_crm_actor(v_target) IS FALSE
          AND api.user_can_write_crm_actor(v_target) IS FALSE,
          format('actor realm P%s: cross-realm actor guard grants access', v_persona);
        v_denied := false;
        BEGIN PERFORM api.list_actor_crm(v_target);
        EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
        END;
        ASSERT v_denied, 'actor realm: cross-realm CRM detail read succeeded';
        v_denied := false;
        BEGIN PERFORM api.list_actor_support(v_target);
        EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
        END;
        ASSERT v_denied, 'actor realm: cross-realm actor document/support read succeeded';
        v_denied := false;
        BEGIN PERFORM api.save_crm_actor(jsonb_build_object('id', v_target, 'first_name', 'Forbidden edit'));
        EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
        END;
        ASSERT v_denied, 'actor realm: cross-realm actor edit succeeded';
        IF v_persona >= 3 THEN
          v_denied := false;
          BEGIN PERFORM api.rpc_gdpr_erase_subject('actor', v_target::text, 'anonymize', 'Realm regression');
          EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
          END;
          ASSERT v_denied, 'actor realm: platform owner erased an actor from the other realm';
        END IF;
      END LOOP;

      v_denied := false;
      BEGIN PERFORM api.save_actor_channel(jsonb_build_object('id', v_channel[v_other], 'is_public', true));
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: other-realm contact edit succeeded';
      v_denied := false;
      BEGIN PERFORM api.delete_actor_channel(v_channel[v_other]);
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: other-realm contact deletion succeeded';
      v_denied := false;
      BEGIN PERFORM api.delete_crm_interaction(v_note[v_other]);
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: other-realm actor-only note deletion succeeded';

      -- Authorizing only the OLD actor leaves an actor-only note movable into
      -- production. Prove the new anchor is checked even without an object.
      PERFORM api.save_crm_interaction(jsonb_build_object(
        'id', v_note[v_i], 'actor_id', v_prospect[v_i], 'body', 'Allowed same-realm move'));
      PERFORM api.save_crm_interaction(jsonb_build_object('id', v_note[v_i], 'actor_id', v_linked[v_i]));
      v_denied := false;
      BEGIN PERFORM api.save_crm_interaction(jsonb_build_object(
        'id', v_note[v_i], 'actor_id', v_linked[v_other]));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: actor-only interaction moved to an actor in the opposite realm';
      v_denied := false;
      BEGIN PERFORM api.save_crm_interaction(jsonb_build_object(
        'id', v_note[v_i], 'actor_id', v_linked[v_other], 'object_id', v_obj[v_other]));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: moving every interaction anchor crossed the realm boundary';
      v_denied := false;
      BEGIN PERFORM api.save_crm_interaction(jsonb_build_object('id', v_note[v_i], 'actor_id', NULL));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: clearing the last actor anchor orphaned an interaction';
      v_denied := false;
      BEGIN PERFORM api.save_crm_interaction(jsonb_build_object(
        'id', v_note[v_i], 'actor_id', NULL, 'object_id', v_obj[v_other]));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: replacing an actor anchor with an opposite-realm object succeeded';

      -- Check raw reads separately: API functions are SECURITY DEFINER and can
      -- pass every API assertion while leaving permissive table policies open.
      ASSERT EXISTS (SELECT 1 FROM public.actor WHERE id = v_linked[v_i]),
        'actor realm: same-realm linked actor RLS read is unavailable';
      ASSERT NOT EXISTS (SELECT 1 FROM public.actor
        WHERE id = ANY(ARRAY[v_linked[v_other], v_prospect[v_other], v_orphan[v_other]])),
        'actor realm: direct actor SELECT leaks the opposite realm';
      ASSERT NOT EXISTS (SELECT 1 FROM public.actor_object_role WHERE actor_id = v_linked[v_other]),
        'actor realm: direct actor/object links leak the opposite realm';
      ASSERT NOT EXISTS (SELECT 1 FROM public.actor_channel WHERE id = v_channel[v_other]),
        'actor realm: direct actor channels leak the opposite realm';

      -- A valid object in the caller realm cannot launder an actor from the other
      -- realm through CRM links, interactions, tasks, or the object editor.
      v_denied := false;
      BEGIN PERFORM api.link_actor_to_object(jsonb_build_object(
        'actor_id', v_prospect[v_other], 'object_id', v_obj[v_i]));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: cross-realm link_actor_to_object succeeded';
      v_denied := false;
      BEGIN PERFORM api.save_crm_interaction(jsonb_build_object(
        'actor_id', v_linked[v_other], 'object_id', v_obj[v_i],
        'interaction_type', 'call', 'body', 'Forbidden mixed realm interaction'));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: mixed-realm CRM interaction succeeded';
      v_denied := false;
      BEGIN PERFORM api.save_crm_task(jsonb_build_object(
        'actor_id', v_linked[v_other], 'object_id', v_obj[v_i], 'title', 'Forbidden mixed realm task'));
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: mixed-realm CRM task succeeded';

      ASSERT api.can_read_actor_contacts(v_obj[v_i]) IS TRUE,
        'actor realm: same-realm contact guard failed';
      ASSERT api.can_read_actor_contacts(v_obj[v_other]) IS FALSE,
        'actor realm: contact guard bypassed realm for a platform owner';
      v_payload := api.export_actor_contacts(ARRAY[v_obj[v_i]], 'Actor realm regression test', 'csv');
      ASSERT (v_payload->>'actor_count')::integer >= 1,
        'actor realm: same-realm contact export lost its actors';
      v_denied := false;
      BEGIN PERFORM api.export_actor_contacts(ARRAY[v_obj[v_other]], 'Actor realm regression test', 'csv');
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
      END;
      ASSERT v_denied, 'actor realm: export_actor_contacts emitted the opposite realm';
      v_payload := api.list_selection_emails('Actor realm regression test', ARRAY[v_obj[v_i], v_obj[v_other]])::jsonb;
      ASSERT position(format('actor-realm-contact-%s@fixture.test', v_other) IN v_payload::text) = 0,
        'actor realm: email selection emitted a contact from the opposite realm';
    RESET ROLE;
    ASSERT (SELECT is_test FROM public.actor WHERE id = v_linked[v_i]) = v_is_test,
      'actor realm: a save payload changed persisted actor realm';
    ASSERT (SELECT crm_owner_org_id FROM public.actor WHERE id = v_linked[v_i]) = v_org[v_i],
      'actor realm: a save payload changed the trusted CRM owner';
    ASSERT EXISTS (SELECT 1 FROM public.crm_interaction
      WHERE id = v_note[v_i] AND actor_id = v_linked[v_i] AND object_id IS NULL
        AND body = 'Allowed same-realm move'),
      'actor realm: rejected anchor mutations changed the actor-only interaction';
  END LOOP;

  -- Trigger-level integrity also protects service-side/import paths that bypass
  -- RLS. Both combinations are rejected, and same-realm attachment still works.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  FOR v_i IN 1..2 LOOP
    v_other := 3 - v_i;
    v_denied := false;
    BEGIN
      UPDATE public.actor SET is_test = NOT is_test WHERE id = v_linked[v_i];
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
    END;
    ASSERT v_denied, 'actor realm: persisted actor realm was mutable';
    v_denied := false;
    BEGIN
      UPDATE public.actor SET crm_owner_org_id = v_org[v_other] WHERE id = v_linked[v_i];
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
    END;
    ASSERT v_denied, 'actor realm: moving CRM ownership crossed the realm boundary';
    INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary)
    VALUES (v_prospect[v_i], v_obj[v_i], v_actor_role, false);
    v_denied := false;
    BEGIN
      INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary)
      VALUES (v_prospect[v_other], v_obj[v_i], v_actor_role, false);
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
    END;
    ASSERT v_denied, 'actor realm: raw cross-realm actor/object link was accepted';
    v_denied := false;
    BEGIN
      INSERT INTO public.crm_interaction (actor_id, object_id, interaction_type, body)
      VALUES (v_linked[v_other], v_obj[v_i], 'call', 'Forbidden raw mixed realm interaction');
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
    END;
    ASSERT v_denied, 'actor realm: raw cross-realm CRM interaction was accepted';
    v_denied := false;
    BEGIN
      INSERT INTO public.crm_task (actor_id, object_id, title)
      VALUES (v_linked[v_other], v_obj[v_i], 'Forbidden raw mixed realm task');
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_denied := true;
    END;
    ASSERT v_denied, 'actor realm: raw cross-realm CRM task was accepted';
  END LOOP;

  -- Portal accounts have a trusted actor assignment but no membership. They must
  -- inherit the actor realm, or the sandbox portal silently falls into production.
  UPDATE public.app_user_profile SET role = 'actor', actor_id = v_linked[1] WHERE id = v_user[5];
  UPDATE public.app_user_profile SET role = 'actor', actor_id = v_linked[2] WHERE id = v_user[6];
  FOR v_i IN 1..2 LOOP
    v_other := 3 - v_i;
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_user[v_i + 4], 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.current_user_test_realm() = (v_i = 2),
        'actor realm: membership-free actor portal lost its assigned actor realm';
      ASSERT api.can_read_object(v_obj[v_i]) IS TRUE,
        'actor realm: portal cannot read its own same-realm establishment';
      ASSERT api.can_read_object(v_obj[v_other]) IS FALSE,
        'actor realm: portal can read the opposite realm';
    RESET ROLE;
  END LOOP;

  -- Untrusted user metadata is not a realm selector for a production account.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_user[1], 'role', 'authenticated',
    'user_metadata', jsonb_build_object('sandbox_discovery', true, 'is_test', true))::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.current_user_test_realm() IS FALSE, 'actor realm: user_metadata selected a sandbox realm';
  RESET ROLE;

  -- Existing administrative erasure must retain its object anchor and preserve
  -- the actor's durable realm while clearing personal content.
  FOR v_i IN 1..2 LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_user[v_i + 2], 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      v_payload := api.save_crm_actor(jsonb_build_object(
        'display_name', 'Zzactorrealm Erasure', 'object_id', v_obj[v_i]));
      v_target := (v_payload->>'id')::uuid;
      v_payload := api.save_crm_interaction(jsonb_build_object(
        'actor_id', v_target, 'object_id', v_obj[v_i], 'interaction_type', 'note',
        'subject', 'Erasure fixture', 'body', 'Note to erase', 'status', 'new'));
      v_note[v_i] := (v_payload->>'id')::uuid;
      PERFORM api.rpc_gdpr_erase_subject('actor', v_target::text, 'anonymize', 'Realm regression');
    RESET ROLE;
    ASSERT (SELECT is_test = (v_i = 2) AND first_name IS NULL
      FROM public.actor WHERE id = v_target), 'Erasure must preserve actor realm';
    ASSERT EXISTS (SELECT 1 FROM public.crm_interaction
      WHERE id = v_note[v_i] AND actor_id IS NULL AND object_id = v_obj[v_i] AND body IS NULL),
      'Administrative erasure must clear actor references and personal content';
  END LOOP;

  RAISE NOTICE 'actor test realm: creation, linked/prospect/orphan directory, owner bypass, picker, RPC guards, RLS, exports, links and portal assertions passed';
END
$test$;

ROLLBACK;

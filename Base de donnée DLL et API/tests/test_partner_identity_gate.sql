-- Focused guard for partner_api_identity_initplan. Run after the full manifest.
-- Connect as a test database owner able to SET ROLE; every fixture rolls back.
-- Complement (do not replace) test_read_gate_setbased.sql, test_actor_portal.sql,
-- test_actor_test_realm.sql, test_actor_email_realm.sql and
-- test_actor_contacts_org_gate.sql, which cover the full persona/PII matrix.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

DO $test$
DECLARE
  v_org text := 'ORGRUN9999992910';
  v_published text := 'HOTRUN9999992911';
  v_draft text := 'HOTRUN9999992912';
  v_bridge text := 'HOTRUN9999992913';
  v_member uuid := gen_random_uuid();
  v_portal uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_test_actor uuid := gen_random_uuid();
  v_email text := 'identity-gate-' || gen_random_uuid()::text || '@fixture.test';
  v_kind uuid;
  v_operator uuid;
  v_publisher uuid;
  v_claims jsonb;
  v_payload jsonb;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT id INTO STRICT v_kind FROM public.ref_code_contact_kind WHERE code = 'email';
  SELECT id INTO STRICT v_operator FROM public.ref_actor_role WHERE code = 'operator';
  SELECT id INTO STRICT v_publisher FROM public.ref_org_role WHERE code = 'publisher';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'api.user_actor_ids()'::regprocedure),
    'user_actor_ids must retain INVOKER semantics';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = 'api.current_user_extended_object_ids()'::regprocedure),
    'extended object helper must retain DEFINER semantics';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'Identity gate org', 'published'),
    (v_published, 'HOT', 'Identity gate public', 'published'),
    (v_draft, 'HOT', 'Identity gate draft', 'draft'),
    (v_bridge, 'HOT', 'Identity gate email bridge', 'draft');
  INSERT INTO public.org_config (org_object_id, access_scope, is_test_org)
    VALUES (v_org, 'own_objects_only', false);
  INSERT INTO public.object_org_link (object_id, org_object_id, role_id) VALUES
    (v_published, v_org, v_publisher), (v_draft, v_org, v_publisher);
  INSERT INTO auth.users (id, email) VALUES
    (v_member, 'member-' || v_member::text || '@fixture.test'),
    (v_portal, 'portal-' || v_portal::text || '@fixture.test');
  INSERT INTO public.app_user_profile (id, role) VALUES
    (v_member, 'tourism_agent'), (v_portal, 'actor')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_member, v_org, true);
  INSERT INTO public.actor (id, display_name, extra) VALUES
    (v_actor, 'Identity gate production', '{}'::jsonb),
    (v_test_actor, 'Identity gate sandbox', '{"test_corpus":true}'::jsonb);
  UPDATE public.app_user_profile SET actor_id = v_actor WHERE id = v_portal;
  INSERT INTO public.actor_channel (actor_id, kind_id, value) VALUES
    (v_actor, v_kind, upper(v_email)), (v_test_actor, v_kind, v_email);
  INSERT INTO public.actor_object_role (actor_id, object_id, role_id, visibility) VALUES
    (v_actor, v_published, v_operator, 'partners'),
    (v_actor, v_bridge, v_operator, 'partners');

  -- Identity-free authenticated calls model the partner read context. An empty
  -- email and whitespace must have the same empty scope as an absent email.
  FOR v_claims IN SELECT value FROM jsonb_array_elements(
    '[{"role":"anon"},{"role":"authenticated"},
      {"role":"authenticated","email":null},
      {"role":"authenticated","email":""},
      {"role":"authenticated","email":"   "}]'::jsonb)
  LOOP
    PERFORM set_config('request.jwt.claims', v_claims::text, true);
    IF v_claims->>'role' = 'anon' THEN SET LOCAL ROLE anon;
    ELSE SET LOCAL ROLE authenticated;
    END IF;
    ASSERT auth.uid() IS NULL, 'identity-free fixture unexpectedly has a UID';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids()),
      'identity-free caller acquired extended object scope';
    ASSERT api.can_read_extended(v_published) IS FALSE,
      'identity-free caller acquired indirect DEFINER extended access';
    ASSERT EXISTS (SELECT 1 FROM public.object WHERE id = v_published),
      'identity-free caller lost published object access';
    ASSERT NOT EXISTS (SELECT 1 FROM public.object WHERE id IN (v_draft, v_bridge)),
      'identity-free caller sees a draft';
    v_payload := api.get_object_resource(v_published, ARRAY['fr'], 'none',
      '{"render":false,"fields":["actors"]}'::jsonb)::jsonb;
    ASSERT v_payload IS NOT NULL, 'published JSON witness is absent';
    ASSERT jsonb_array_length(coalesce(v_payload->'actors', '[]'::jsonb)) = 0,
      'identity-free published JSON exposes a partners actor';
    RESET ROLE;
  END LOOP;

  -- Partner SQL executes as service_role with no human UID/email. Its table
  -- role bypasses RLS, so exercise the API gate and resource RPC explicitly.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  ASSERT auth.uid() IS NULL, 'partner fixture unexpectedly has a UID';
  ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids()),
    'identity-free partner acquired extended object scope';
  ASSERT api.can_read_extended(v_draft) IS FALSE,
    'identity-free partner acquired indirect DEFINER extended access';
  ASSERT api.get_object_resource(v_draft, ARRAY['fr'], 'none',
    '{"render":false,"fields":["actors"]}'::jsonb)::jsonb IS NULL,
    'identity-free partner resource RPC exposes a draft';
  v_payload := api.get_object_resource(v_published, ARRAY['fr'], 'none',
    '{"render":false,"fields":["actors"]}'::jsonb)::jsonb;
  ASSERT v_payload IS NOT NULL, 'partner lost published resource JSON';
  ASSERT jsonb_array_length(coalesce(v_payload->'actors', '[]'::jsonb)) = 0,
    'identity-free partner published JSON exposes a partners actor';
  RESET ROLE;

  -- UID alone is sufficient: both the membership and assigned actor branches
  -- must survive, even though neither JWT carries an email claim.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', v_member)::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() AS s(id) WHERE id = v_draft),
    'UID-only member lost own organisation draft';
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id = v_draft),
    'UID-only member lost direct RLS read';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', v_portal)::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() AS s(id) WHERE id = v_bridge),
    'UID-only actor persona lost assigned portal scope';
  ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() AS s(id) WHERE id = v_draft),
    'actor persona inherited organisation membership scope';
  RESET ROLE;

  -- Historical email-only bridge is still supported. Direct INVOKER and nested
  -- DEFINER calls must exclude the sandbox actor sharing the same email.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', upper(v_email))::text, true);
  SET LOCAL ROLE authenticated;
  -- INVOKER observes actor_channel RLS; an email-only caller has no human
  -- membership and need not receive a positive result here. The DEFINER path
  -- below is the positive witness for the historical email bridge.
  ASSERT NOT EXISTS (SELECT 1 FROM api.user_actor_ids() AS a(id) WHERE id = v_test_actor),
    'email-only INVOKER lookup crossed the actor realm';
  ASSERT api.can_read_extended(v_bridge) IS TRUE,
    'email-only bridge lost its indirect DEFINER access';
  SELECT jsonb_agg(id ORDER BY id) INTO v_before
    FROM api.current_user_extended_object_ids() AS s(id);
  v_payload := api.get_object_resource(v_bridge, ARRAY['fr'], 'none',
    '{"render":false,"fields":["actors"]}'::jsonb)::jsonb;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', lower(v_email))::text, true);
  SET LOCAL ROLE authenticated;
  SELECT jsonb_agg(id ORDER BY id) INTO v_after
    FROM api.current_user_extended_object_ids() AS s(id);
  ASSERT v_after IS NOT DISTINCT FROM v_before, 'email case changed extended rights';
  ASSERT api.get_object_resource(v_bridge, ARRAY['fr'], 'none',
    '{"render":false,"fields":["actors"]}'::jsonb)::jsonb IS NOT DISTINCT FROM v_payload,
    'email case changed final resource JSON';
  RESET ROLE;
  RAISE NOTICE 'partner identity gate: anonymous, UID-only, email-only, INVOKER/DEFINER and JSON checks passed';
END
$test$;
ROLLBACK;

-- Email deduplication must neither expose nor reserve the other realm's email.
-- Every fixture and channel is rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_real uuid := gen_random_uuid();
  v_real_other uuid := gen_random_uuid();
  v_test uuid := gen_random_uuid();
  v_test_other uuid := gen_random_uuid();
  v_kind uuid;
  v_email text := 'actor-realm-' || gen_random_uuid()::text || '@example.test';
  v_test_channel uuid;
  v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO STRICT v_kind FROM public.ref_code_contact_kind WHERE code = 'email';
  INSERT INTO public.actor (id, display_name, extra) VALUES
    (v_real, 'Email realm real', '{}'::jsonb),
    (v_real_other, 'Email realm real duplicate', '{}'::jsonb),
    (v_test, 'Email realm test', '{"test_corpus":true}'::jsonb),
    (v_test_other, 'Email realm test duplicate', '{"test_corpus":true}'::jsonb);
  ASSERT (SELECT NOT is_test FROM public.actor WHERE id = v_real);
  ASSERT (SELECT is_test FROM public.actor WHERE id = v_test);

  INSERT INTO public.actor_channel (actor_id, kind_id, value)
    VALUES (v_real, v_kind, v_email);
  INSERT INTO public.actor_channel (actor_id, kind_id, value)
    VALUES (v_test, v_kind, upper(v_email)) RETURNING id INTO v_test_channel;
  ASSERT (SELECT count(*) = 2 FROM public.actor_channel
    WHERE actor_id IN (v_real, v_test) AND lower(value) = v_email),
    'The same email can be exercised in the sandbox without colliding with production';

  v_denied := false;
  BEGIN
    INSERT INTO public.actor_channel (actor_id, kind_id, value)
      VALUES (v_real_other, v_kind, upper(v_email));
  EXCEPTION WHEN raise_exception OR unique_violation THEN v_denied := true;
  END;
  ASSERT v_denied, 'Production still rejects same-realm duplicate email';

  v_denied := false;
  BEGIN
    INSERT INTO public.actor_channel (actor_id, kind_id, value)
      VALUES (v_test_other, v_kind, v_email);
  EXCEPTION WHEN raise_exception OR unique_violation THEN v_denied := true;
  END;
  ASSERT v_denied, 'Sandbox still rejects same-realm duplicate email';

  UPDATE public.actor_channel SET value = lower(value) WHERE id = v_test_channel;
  ASSERT (SELECT value = v_email FROM public.actor_channel WHERE id = v_test_channel),
    'Editing a test email does not collide with the production actor';

  RAISE NOTICE 'Actor email realm: cross-realm reuse and same-realm duplicate rejection passed';
END $$;
ROLLBACK;

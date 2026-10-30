-- Run on a local/test database after the provider_scope_preference migration.
-- Fixtures and preference writes always roll back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-a000-000000003901', 'provider-scope-one@test.local'),
  ('00000000-0000-4000-a000-000000003902', 'provider-scope-two@test.local');
INSERT INTO public.app_user_profile (id, role, preferences) VALUES
  ('00000000-0000-4000-a000-000000003901', 'tourism_agent', '{"unrelated":"keep"}'),
  ('00000000-0000-4000-a000-000000003902', 'tourism_agent', '{"provider_only":false}')
ON CONFLICT (id) DO UPDATE SET preferences=EXCLUDED.preferences;

INSERT INTO public.object (id, object_type, name, status) VALUES
  ('HOTRUN9999993901', 'HOT', 'Provider scope active', 'draft'),
  ('HOTRUN9999993902', 'HOT', 'Provider scope absent', 'draft'),
  ('HOTRUN9999993903', 'HOT', 'Provider scope expired', 'draft'),
  ('HOTRUN9999993904', 'HOT', 'Provider scope future', 'draft'),
  ('HOTRUN9999993905', 'HOT', 'Provider scope today', 'draft');
INSERT INTO public.actor (id, display_name) VALUES
  ('00000000-0000-4000-a000-000000003911', 'Provider scope one'),
  ('00000000-0000-4000-a000-000000003912', 'Provider scope two');
INSERT INTO public.actor_object_role (actor_id, object_id, role_id, valid_from, valid_to)
SELECT '00000000-0000-4000-a000-000000003911'::uuid, v.id, r.id, v.start_date, v.end_date
FROM (VALUES
  ('HOTRUN9999993901', NULL::date, NULL::date),
  ('HOTRUN9999993903', NULL::date, (now() AT TIME ZONE 'Indian/Reunion')::date - 1),
  ('HOTRUN9999993904', (now() AT TIME ZONE 'Indian/Reunion')::date + 1, NULL::date),
  ('HOTRUN9999993905', (now() AT TIME ZONE 'Indian/Reunion')::date, (now() AT TIME ZONE 'Indian/Reunion')::date)
) v(id, start_date, end_date)
CROSS JOIN public.ref_actor_role r WHERE r.code='operator';
INSERT INTO public.actor_object_role (actor_id, object_id, role_id)
SELECT '00000000-0000-4000-a000-000000003912'::uuid, 'HOTRUN9999993901', id
FROM public.ref_actor_role WHERE code='operator';

DO $test$
DECLARE ids text[];
BEGIN
  SELECT array_agg(object_id ORDER BY object_id) INTO ids
  FROM api.get_filtered_object_ids('{"has_provider":true}', ARRAY['HOT']::public.object_type[], ARRAY['draft']::public.object_status[])
  WHERE object_id LIKE 'HOTRUN99999939%';
  ASSERT ids=ARRAY['HOTRUN9999993901','HOTRUN9999993905'], 'Active links, inclusive dates, and no duplicates';
  SELECT array_agg(object_id ORDER BY object_id) INTO ids
  FROM api.get_filtered_object_ids('{}', ARRAY['HOT']::public.object_type[], ARRAY['draft']::public.object_status[])
  WHERE object_id LIKE 'HOTRUN99999939%';
  ASSERT cardinality(ids)=5, 'Disabled toggle must preserve all objects';
  ASSERT NOT has_function_privilege('anon', 'api.set_provider_only_preference(boolean)', 'execute'), 'No anonymous preference writes';
  ASSERT NOT has_function_privilege('anon', 'api.get_dashboard_provider_crm_open()', 'execute'), 'No anonymous CRM aggregates';
  ASSERT NOT has_function_privilege('authenticated', 'internal.provider_crm_interactions()', 'execute'), 'Raw CRM helper is private';
END $test$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-a000-000000003901"}', true);
SET LOCAL ROLE authenticated;
SELECT api.set_provider_only_preference(true);
RESET ROLE;
DO $test$
BEGIN
  ASSERT (SELECT preferences='{"provider_only":true,"unrelated":"keep"}'::jsonb FROM public.app_user_profile WHERE id='00000000-0000-4000-a000-000000003901'), 'Atomic merge must preserve unrelated preferences';
  ASSERT (SELECT preferences='{"provider_only":false}'::jsonb FROM public.app_user_profile WHERE id='00000000-0000-4000-a000-000000003902'), 'Other accounts must be unchanged';
  ASSERT (api.get_dashboard_provider_crm_open() ? 'open_interactions'), 'CRM counter executes';
  ASSERT jsonb_array_length(api.get_dashboard_provider_crm_activity()->'open_by_age')=4, 'All four CRM age buckets are emitted';
  ASSERT jsonb_array_length(api.get_dashboard_provider_team_activity()->'weeks')=12, 'All twelve weeks are emitted';
END $test$;
SELECT set_config('request.jwt.claims', '{}', true);
DO $test$
BEGIN
  BEGIN
    PERFORM api.set_provider_only_preference(true);
    RAISE EXCEPTION 'Missing authentication was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM api.get_dashboard_provider_crm_open();
    RAISE EXCEPTION 'Missing authentication was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;

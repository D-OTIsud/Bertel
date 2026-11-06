-- DB-08: real authenticated role + request claims, real permission helpers,
-- real auto-attach and create/publication RPCs. Synthetic transactional fixtures.
-- Run after the complete fresh manifest. No production connection is required.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.object (id, object_type, name, status) VALUES
  ('ORGRUN9980080001', 'ORG', 'DB08 publisher A', 'published'),
  ('ORGRUN9980080002', 'ORG', 'DB08 publisher B', 'published');
INSERT INTO public.org_config (org_object_id, access_scope) VALUES
  ('ORGRUN9980080001', 'own_objects_only'), ('ORGRUN9980080002', 'own_objects_only');
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-a000-000000008001', 'db08-contributor@example.invalid'),
  ('00000000-0000-4000-a000-000000008002', 'db08-editor@example.invalid'),
  ('00000000-0000-4000-a000-000000008003', 'db08-other@example.invalid'),
  ('00000000-0000-4000-a000-000000008004', 'db08-platform@example.invalid');
INSERT INTO public.app_user_profile (id, role) VALUES
  ('00000000-0000-4000-a000-000000008001', 'tourism_agent'),
  ('00000000-0000-4000-a000-000000008002', 'tourism_agent'),
  ('00000000-0000-4000-a000-000000008003', 'tourism_agent'),
  ('00000000-0000-4000-a000-000000008004', 'super_admin')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.user_org_membership (user_id, org_object_id, is_active) VALUES
  ('00000000-0000-4000-a000-000000008001', 'ORGRUN9980080001', TRUE),
  ('00000000-0000-4000-a000-000000008002', 'ORGRUN9980080001', TRUE),
  ('00000000-0000-4000-a000-000000008003', 'ORGRUN9980080002', TRUE);
INSERT INTO public.user_org_business_role (membership_id, role_id, is_active)
SELECT m.id, r.id, TRUE
FROM public.user_org_membership m
JOIN public.ref_org_business_role r ON r.code = CASE
  WHEN m.user_id = '00000000-0000-4000-a000-000000008001'::uuid THEN 'contributor'
  ELSE 'editor' END
WHERE m.user_id IN ('00000000-0000-4000-a000-000000008001',
                    '00000000-0000-4000-a000-000000008002',
                    '00000000-0000-4000-a000-000000008003');

-- Use the ordinary client role, not merely a JWT while retaining postgres.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000008001","role":"authenticated"}', TRUE);
DO $test$
DECLARE v_id text;
BEGIN
  ASSERT current_user = 'authenticated' AND auth.role() = 'authenticated', 'real client role required';
  ASSERT api.user_can_create_object() IS TRUE, 'non-vacuous contributor create permission';
  ASSERT api.user_has_permission('publish_object') IS FALSE, 'contributor must lack publish permission';

  INSERT INTO public.object (id, object_type, name, status, created_by)
  VALUES ('HOTRUN9980080001', 'HOT', 'DB08 direct draft', 'draft', auth.uid());
  ASSERT (SELECT count(*) FROM public.object WHERE id = 'HOTRUN9980080001' AND status = 'draft') = 1,
    'ordinary direct draft creation preserved';
  ASSERT api.user_can_publish_object('HOTRUN9980080001') IS FALSE, 'publisher link alone grants no permission';
  v_id := api.rpc_create_object('HOT', 'DB08 RPC draft', 'RUN');
  ASSERT v_id IS NOT NULL AND (SELECT status FROM public.object WHERE id = v_id) = 'draft', 'RPC creation remains draft';

  BEGIN
    INSERT INTO public.object (id, object_type, name, status, created_by)
    VALUES ('HOTRUN9980080002', 'HOT', 'DB08 refused publication', 'published', auth.uid());
    RAISE EXCEPTION 'DB08_FAIL: contributor inserted published';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Initial publication' IN SQLERRM) > 0, 'publication gate, not unrelated RLS';
  END;
  BEGIN
    UPDATE public.object SET status = 'published' WHERE id = 'HOTRUN9980080001';
    RAISE EXCEPTION 'DB08_FAIL: contributor updated status without publish permission';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Object status changes' IN SQLERRM) > 0, 'existing UPDATE guard remains effective';
  END;
  BEGIN
    INSERT INTO public.object (id, object_type, name, status, created_by) VALUES
      ('HOTRUN9980080003', 'HOT', 'DB08 atomic draft', 'draft', auth.uid()),
      ('HOTRUN9980080004', 'HOT', 'DB08 atomic published', 'published', auth.uid());
    RAISE EXCEPTION 'DB08_FAIL: mixed multi-row insert published';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Initial publication' IN SQLERRM) > 0, 'mixed insert reaches publication gate';
  END;
  BEGIN
    INSERT INTO public.object (id, object_type, name, status, created_by)
    VALUES ('ORGRUN9980080003', 'ORG', 'DB08 forbidden ORG', 'draft', auth.uid());
    RAISE EXCEPTION 'DB08_FAIL: contributor inserted ORG draft';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Organization creation' IN SQLERRM) > 0, 'ORG gate reached';
  END;
  BEGIN
    PERFORM api.rpc_create_object('ORG', 'DB08 forbidden RPC ORG', 'RUN');
    RAISE EXCEPTION 'DB08_FAIL: generic RPC created ORG';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Organization creation' IN SQLERRM) > 0, 'generic RPC respects same ORG gate';
  END;
END;
$test$;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000008002","role":"authenticated"}', TRUE);
DO $test$
DECLARE v_id text;
BEGIN
  ASSERT api.user_can_create_object() IS TRUE AND api.user_has_permission('publish_object') IS TRUE,
    'non-vacuous editor create and publish permission';
  INSERT INTO public.object (id, object_type, name, status, created_by)
  VALUES ('HOTRUN9980080005', 'HOT', 'DB08 legitimate direct publication', 'published', auth.uid());
  ASSERT (SELECT count(*) FROM public.object WHERE id = 'HOTRUN9980080005' AND status = 'published') = 1,
    'authorized initial publication succeeds after auto-attach';
  ASSERT api.user_can_publish_object('HOTRUN9980080005') IS TRUE, 'actual publisher scope established';
  v_id := api.rpc_create_object('HOT', 'DB08 create then publish', 'RUN');
  ASSERT (SELECT status FROM public.object WHERE id = v_id) = 'draft', 'authorized workflow starts draft';
  PERFORM api.rpc_publish_object(v_id, TRUE);
  ASSERT (SELECT count(*) FROM public.object WHERE id = v_id AND status = 'published' AND published_at IS NOT NULL) = 1,
    'legitimate create then publish RPC preserved';
END;
$test$;

-- Role-based permission revocation is effective under the SAME request claims.
RESET ROLE;
UPDATE public.org_role_permission SET is_active = FALSE
WHERE org_object_id = 'ORGRUN9980080001'
  AND role_id = (SELECT id FROM public.ref_org_business_role WHERE code = 'editor')
  AND permission_id = (SELECT id FROM public.ref_permission WHERE code = 'publish_object');
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT api.user_can_create_object() IS TRUE AND api.user_has_permission('publish_object') IS FALSE,
    'revocation removes only publication capability';
  BEGIN
    INSERT INTO public.object (id, object_type, name, status, created_by)
    VALUES ('HOTRUN9980080006', 'HOT', 'DB08 revoked publication', 'published', auth.uid());
    RAISE EXCEPTION 'DB08_FAIL: revoked editor inserted published';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Initial publication' IN SQLERRM) > 0, 'revoked permission reaches gate';
  END;
END;
$test$;

-- A publisher from another ORG still cannot publish A's draft.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000008003","role":"authenticated"}', TRUE);
DO $test$
BEGIN
  ASSERT api.user_has_permission('publish_object') IS TRUE, 'other ORG really has publish permission';
  ASSERT api.user_can_publish_object('HOTRUN9980080001') IS FALSE, 'publish permission does not widen ORG scope';
  BEGIN
    PERFORM api.rpc_publish_object('HOTRUN9980080001', TRUE);
    RAISE EXCEPTION 'DB08_FAIL: other ORG published foreign draft';
  EXCEPTION WHEN raise_exception THEN
    ASSERT position('FORBIDDEN' IN SQLERRM) > 0, 'cross-ORG RPC authorization refusal';
  END;
END;
$test$;

-- Institutional onboarding remains available to its existing platform role.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000008004","role":"authenticated"}', TRUE);
DO $test$
DECLARE v_id text;
BEGIN
  ASSERT api.is_platform_superuser() IS TRUE, 'canonical platform fixture';
  v_id := api.rpc_create_org('DB08 legitimate platform ORG', 'RUN', 'own_objects_only');
  ASSERT v_id IS NOT NULL AND (SELECT count(*) FROM public.object WHERE id = v_id AND object_type = 'ORG' AND status = 'published') = 1,
    'platform ORG onboarding preserved';
END;
$test$;

-- Missing request identity cannot use the maintenance exception through client
-- grants: the pre-existing create/creator RLS remains the first gate.
SELECT set_config('request.jwt.claims', '{}', TRUE);
DO $test$
BEGIN
  ASSERT current_user = 'authenticated' AND auth.uid() IS NULL, 'client role with missing claims';
  BEGIN
    INSERT INTO public.object (id, object_type, name, status)
    VALUES ('HOTRUN9980080007', 'HOT', 'DB08 missing identity', 'published');
    RAISE EXCEPTION 'DB08_FAIL: missing identity inserted through client grants';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('row-level security' IN SQLERRM) > 0, 'existing create RLS rejects missing identity';
  END;
END;
$test$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);
DO $test$
BEGIN
  INSERT INTO public.object (id, object_type, name, status)
  VALUES ('HOTRUN9980080008', 'HOT', 'DB08 trusted service import', 'published');
  ASSERT (SELECT count(*) FROM public.object WHERE id = 'HOTRUN9980080008' AND status = 'published') = 1,
    'existing technical import exemption preserved';
END;
$test$;

-- Prove failed INSERT and its auto-attach are fully rolled back; no public row
-- or partner serializer can retrieve a record which does not exist.
RESET ROLE;
DO $test$
BEGIN
  ASSERT (SELECT count(*) FROM public.object WHERE id IN
    ('HOTRUN9980080002','HOTRUN9980080003','HOTRUN9980080004','HOTRUN9980080006','HOTRUN9980080007','ORGRUN9980080003')) = 0,
    'all refused rows absent, including mixed-statement draft';
  ASSERT (SELECT count(*) FROM public.object_org_link WHERE object_id IN
    ('HOTRUN9980080002','HOTRUN9980080003','HOTRUN9980080004','HOTRUN9980080006','HOTRUN9980080007','ORGRUN9980080003')) = 0,
    'all refused auto-attach side effects absent';
  ASSERT (SELECT count(*) FROM public.object_org_link l JOIN public.ref_org_role r ON r.id = l.role_id
    WHERE l.object_id = 'HOTRUN9980080005' AND l.org_object_id = 'ORGRUN9980080001' AND r.code = 'publisher') = 1,
    'positive direct publication has exactly its real publisher link';
  RAISE NOTICE 'DB08 initial publication guard assertions passed.';
END;
$test$;
ROLLBACK;

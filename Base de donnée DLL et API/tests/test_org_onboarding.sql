-- test_org_onboarding.sql
-- Prouve migration_org_onboarding.sql :
-- A) rpc_create_org superuser : ORG créée published (published_at posé), id ORGRUN…, org_config créée.
-- B) Gardes : non-superuser FORBIDDEN ; nom vide MISSING_REQUIRED_FIELD ; doublon (casse-insensible,
--    même région) DUPLICATE_ORG ; scope invalide INVALID_ACCESS_SCOPE.
-- C) rpc_list_orgs : superuser voit la nouvelle ORG (memberCount 0) ; non-superuser FORBIDDEN.
-- Contre une base sans la migration : échec immédiat (api.rpc_create_org absente) — état rouge.
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Mécanique de personas calquée sur tests/test_sp4_list_org_members.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  -- Plage de fixtures dédiée (09xx) : 08xx = test_crm_module.
  v_super uuid := '00000000-0000-4000-a000-000000000901';
  v_plain uuid := '00000000-0000-4000-a000-000000000902';
  v_org_id text;
  v_denied boolean := false;
  v_list jsonb;
BEGIN
  -- Personas
  INSERT INTO auth.users (id, email) VALUES
    (v_super, 'onb-super-0901@test.local'), (v_plain, 'onb-plain-0902@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super, 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
  INSERT INTO app_user_profile (id, role) VALUES (v_plain, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = 'tourism_agent';

  -- ---------- A. Création par le superuser ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  v_org_id := api.rpc_create_org('ORG Test Onboarding 0901', 'RUN', 'all_published');
  ASSERT v_org_id LIKE 'ORGRUN%', 'id ORG inattendu: ' || coalesce(v_org_id, '<null>');
  ASSERT (SELECT status FROM object WHERE id = v_org_id) = 'published', 'ORG doit naître published';
  ASSERT (SELECT published_at FROM object WHERE id = v_org_id) IS NOT NULL, 'published_at doit être posé';
  ASSERT (SELECT object_type FROM object WHERE id = v_org_id) = 'ORG', 'object_type doit être ORG';
  ASSERT (SELECT access_scope FROM org_config WHERE org_object_id = v_org_id) = 'all_published',
         'org_config absente ou access_scope incorrect';

  -- ---------- B. Gardes ----------
  -- Doublon casse-insensible, même région
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('org test onboarding 0901', 'RUN');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'DUPLICATE_ORG%'; END;
  ASSERT v_denied, 'le doublon casse-insensible doit être refusé (DUPLICATE_ORG)';

  -- Nom vide
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('   ', 'RUN');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'MISSING_REQUIRED_FIELD%'; END;
  ASSERT v_denied, 'un nom vide doit être refusé (MISSING_REQUIRED_FIELD)';

  -- Scope invalide
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('ORG Scope KO 0901', 'RUN', 'everything');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'INVALID_ACCESS_SCOPE%'; END;
  ASSERT v_denied, 'un access_scope invalide doit être refusé (INVALID_ACCESS_SCOPE)';

  -- ---------- C. rpc_list_orgs superuser ----------
  v_list := api.rpc_list_orgs();
  ASSERT v_list @> jsonb_build_array(jsonb_build_object('id', v_org_id, 'memberCount', 0)),
         'rpc_list_orgs doit contenir la nouvelle ORG avec memberCount 0';

  -- ---------- B/C. Non-superuser refusé ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_plain, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('ORG Interdite 0901', 'RUN');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'FORBIDDEN%'; END;
  ASSERT v_denied, 'rpc_create_org doit être refusée à un non-superuser (FORBIDDEN)';

  v_denied := false;
  BEGIN
    PERFORM api.rpc_list_orgs();
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'FORBIDDEN%'; END;
  ASSERT v_denied, 'rpc_list_orgs doit être refusée à un non-superuser (FORBIDDEN)';

  RAISE NOTICE 'test_org_onboarding: OK';
END $$;
ROLLBACK;

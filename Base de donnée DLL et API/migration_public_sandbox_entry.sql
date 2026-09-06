BEGIN;

CREATE TABLE IF NOT EXISTS internal.sandbox_discovery_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE internal.sandbox_discovery_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.sandbox_discovery_identity FROM PUBLIC, anon, authenticated;

-- Le marqueur signé par Auth conserve le cloisonnement même si l’appartenance
-- du visiteur est révoquée. On ne doit jamais retomber sur le corpus réel.
CREATE OR REPLACE FUNCTION api.current_user_test_realm()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
  SELECT COALESCE(auth.jwt()->'app_metadata'->>'sandbox_discovery' = 'true', false)
    OR EXISTS (SELECT 1 FROM public.user_org_membership m
      JOIN public.org_config c ON c.org_object_id = m.org_object_id
      WHERE m.user_id = auth.uid() AND m.is_active AND c.is_test_org);
$$;
REVOKE ALL ON FUNCTION api.current_user_test_realm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.current_user_test_realm() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_sandbox_discovery_user()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $$
DECLARE v_user uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_config WHERE org_object_id = internal.test_org_id() AND is_test_org)
    THEN RAISE EXCEPTION 'SANDBOX_NOT_READY'; END IF;
  SELECT user_id INTO v_user FROM internal.sandbox_discovery_identity WHERE singleton;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u JOIN public.app_user_profile p ON p.id = u.id
      WHERE u.id = v_user AND u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb
      AND p.role = 'tourism_agent' AND p.actor_id IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.user_org_membership m
      JOIN public.user_org_business_role b ON b.membership_id = m.id AND b.is_active
      JOIN public.ref_org_business_role r ON r.id = b.role_id AND r.code = 'contributor'
      WHERE m.user_id = v_user AND m.org_object_id = internal.test_org_id() AND m.is_active)
    OR EXISTS (SELECT 1 FROM public.user_org_membership WHERE user_id = v_user AND is_active AND org_object_id <> internal.test_org_id())
    OR EXISTS (SELECT 1 FROM public.user_permission WHERE user_id = v_user AND is_active)
    OR EXISTS (SELECT 1 FROM public.user_org_membership m JOIN public.user_org_admin_role a ON a.membership_id = m.id WHERE m.user_id = v_user AND a.is_active)
    THEN RAISE EXCEPTION 'UNSAFE_SANDBOX_IDENTITY'; END IF;
  RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION api.get_sandbox_discovery_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_sandbox_discovery_user() TO service_role;

CREATE OR REPLACE FUNCTION api.configure_sandbox_discovery_user(p_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $$
DECLARE v_user uuid; v_member uuid; v_role uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bertel-sandbox-discovery'));
  v_user := api.get_sandbox_discovery_user();
  IF v_user IS NOT NULL THEN RETURN v_user; END IF;
  SELECT id INTO v_user FROM auth.users
    WHERE raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb
      AND email LIKE 'discovery-%@sandbox.bertel.invalid'
      AND (p_user_id IS NULL OR id = p_user_id)
    ORDER BY created_at, id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'INVALID_DISCOVERY_USER'; END IF;
  -- Ne jamais convertir une identité qui possède déjà un périmètre de travail.
  IF EXISTS (SELECT 1 FROM public.user_org_membership WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.user_permission WHERE user_id = v_user AND is_active)
    THEN RAISE EXCEPTION 'EXISTING_USER_SCOPE'; END IF;
  SELECT id INTO STRICT v_role FROM public.ref_org_business_role WHERE code = 'contributor';
  INSERT INTO public.app_user_profile (id, role, display_name)
    VALUES (v_user, 'tourism_agent', 'Visiteur découverte')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_user, internal.test_org_id(), true) RETURNING id INTO v_member;
  INSERT INTO public.user_org_business_role (membership_id, role_id, is_active) VALUES (v_member, v_role, true);
  INSERT INTO internal.sandbox_discovery_identity (singleton, user_id) VALUES (true, v_user);
  RETURN api.get_sandbox_discovery_user();
END $$;
REVOKE ALL ON FUNCTION api.configure_sandbox_discovery_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.configure_sandbox_discovery_user(uuid) TO service_role;

COMMENT ON TABLE internal.sandbox_discovery_identity IS
  'Identité publique de découverte, sans droits d’administration. Sessions séparées, corpus fictif partagé. Préparation serveur obligatoire avant émission de tokens.';
COMMIT;
NOTIFY pgrst, 'reload schema';

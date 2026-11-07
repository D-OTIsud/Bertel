-- CL-SEC-03. Realtime evaluates these permissions on private channel joins.
-- The provider-owned table is already protected by RLS. Public access is a
-- separate tenant setting and stays outside this migration.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = pg_catalog.to_regclass('realtime.messages') AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Realtime messages must already have RLS enabled';
  END IF;

  -- The reviewed baseline has no other policies. Permissive policies combine
  -- with OR, so an unexpected policy must be reviewed before applying this one.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = 'realtime.messages'::pg_catalog.regclass
      AND polname NOT IN ('bertel_realtime_channel_read', 'bertel_realtime_channel_write')
  ) THEN
    RAISE EXCEPTION 'Unexpected Realtime messages policy';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION internal.bertel_realtime_channel_allowed(
  p_topic text, p_extension text, p_write boolean
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_role text;
  in_test_realm boolean;
  realm_suffix text;
  object_id text;
BEGIN
  IF caller_id IS NULL OR p_topic IS NULL OR p_write IS NULL
    OR p_extension IS NULL OR p_extension NOT IN ('presence', 'broadcast') THEN
    RETURN false;
  END IF;

  -- Use the durable Auth provenance shared by the discovery entry point and
  -- the notification guard. A previous JWT or editable metadata can be stale.
  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = caller_id AND u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb
  ) THEN
    RETURN false;
  END IF;

  -- All three consumers live in the authenticated back-office. Published
  -- object access alone does not entitle a partner to the staff roster.
  SELECT p.role INTO caller_role FROM public.app_user_profile p WHERE p.id = caller_id;
  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'super_admin', 'tourism_agent') THEN
    RETURN false;
  END IF;
  IF caller_role = 'tourism_agent' AND api.current_user_org_id() IS NULL THEN
    RETURN false;
  END IF;

  in_test_realm := api.current_user_test_realm();
  IF in_test_realm IS NULL THEN RETURN false; END IF;
  realm_suffix := CASE WHEN in_test_realm THEN 'test' ELSE 'prod' END;

  -- Realtime v2.78.10 requires broadcast read authorization to join even a
  -- presence-only private channel. Clients still cannot send broadcasts here.
  IF p_topic = 'presence:global:' || realm_suffix THEN
    RETURN p_extension = 'presence' OR NOT p_write;
  END IF;

  IF p_topic = 'crm:tasks:' || realm_suffix THEN
    RETURN (p_extension = 'presence' OR NOT p_write) AND caller_role <> 'owner'
      AND COALESCE(api.current_user_can_edit_objects(), false);
  END IF;

  IF p_topic COLLATE pg_catalog."C" !~ '^room:[A-Z]{3}[A-Z0-9]{13}$' THEN
    RETURN false;
  END IF;
  object_id := pg_catalog.substr(p_topic, 6);
  IF NOT EXISTS (
    SELECT 1 FROM public.object o
    WHERE o.id = object_id AND o.is_test = in_test_realm
  ) OR NOT COALESCE(api.can_read_object(object_id), false) THEN
    RETURN false;
  END IF;

  -- ObjectEditPage emits object:saved only after a direct canonical batch save.
  -- Specialized legal/CRM rights alone do not authorize a client broadcast.
  RETURN NOT p_write OR p_extension = 'presence'
    OR COALESCE(api.user_can_write_object_canonical(object_id), false);
END;
$function$;

REVOKE ALL ON FUNCTION internal.bertel_realtime_channel_allowed(text, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.bertel_realtime_channel_allowed(text, text, boolean)
  TO authenticated;

DROP POLICY IF EXISTS bertel_realtime_channel_read ON realtime.messages;
CREATE POLICY bertel_realtime_channel_read ON realtime.messages FOR SELECT TO authenticated
  USING (topic = (SELECT realtime.topic())
    AND internal.bertel_realtime_channel_allowed(topic, extension, false));

DROP POLICY IF EXISTS bertel_realtime_channel_write ON realtime.messages;
CREATE POLICY bertel_realtime_channel_write ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (topic = (SELECT realtime.topic())
    AND internal.bertel_realtime_channel_allowed(topic, extension, true));

COMMIT;

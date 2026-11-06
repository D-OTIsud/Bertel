-- DB-08: INSERT must not bypass the existing publication permission.
-- Run after the canonical RLS, role matrix and ORG onboarding definitions.
BEGIN;

CREATE OR REPLACE FUNCTION api.guard_object_initial_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
BEGIN
  -- Preserve trusted SQL bootstrap/imports without a request context, and the
  -- service/platform exemptions already used by the UPDATE status guard.
  -- Application INSERTs still require the existing create/creator RLS policy.
  IF (auth.uid() IS NULL AND auth.role() IS NULL)
     OR COALESCE(api.is_platform_superuser(), FALSE)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.object_type = 'ORG' THEN
    RAISE EXCEPTION 'Organization creation requires the platform onboarding workflow (api.rpc_create_org)'
      USING ERRCODE = '42501';
  END IF;

  -- AFTER INSERT is intentional: auto-attach must first establish the real
  -- publisher link. A permission flag alone never grants another ORG's scope.
  IF NEW.status = 'published'
     AND NOT COALESCE(api.user_can_publish_object(NEW.id), FALSE)
  THEN
    RAISE EXCEPTION 'Initial publication requires the publish_object permission and a publisher ORG (use api.rpc_publish_object)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION api.guard_object_initial_publication() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_object_initial_publication ON public.object;
-- PostgreSQL runs same-event triggers by name: trg_auto_attach_* precedes this
-- trigger. Both effects are rolled back together if authorization is refused.
CREATE TRIGGER trg_guard_object_initial_publication
  AFTER INSERT ON public.object
  FOR EACH ROW EXECUTE FUNCTION api.guard_object_initial_publication();

COMMIT;

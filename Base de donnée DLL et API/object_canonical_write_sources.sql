-- Bounded authority-source hardening for current canonical object writes.
-- Preserve permission, publisher, platform, NULL and LIMIT semantics.
-- Managed auth.uid/auth.role are inventoried, not redefined.
BEGIN;

CREATE OR REPLACE FUNCTION api.current_user_org_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  SELECT uom.org_object_id
  FROM public.user_org_membership uom
  WHERE uom.user_id = auth.uid()
    AND uom.is_active = TRUE
  LIMIT 1;
$authority$;

CREATE OR REPLACE FUNCTION api.user_has_permission(p_permission_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  WITH perm AS (
    SELECT id
    FROM public.ref_permission
    WHERE code = p_permission_code
      AND is_active = TRUE
    LIMIT 1
  )
  SELECT
    -- Chemin 1 : droit accordé INDIVIDUELLEMENT — une exception, assumée comme telle.
    EXISTS (
      SELECT 1
      FROM public.user_permission up
      JOIN perm p ON p.id = up.permission_id
      WHERE up.user_id   = (SELECT auth.uid())
        AND up.is_active = TRUE
    )
    OR
    -- Chemin 2 : droit CONFÉRÉ par le rôle métier du membre, dans SON ORG (§227).
    -- La jointure sur `ubr.role_id = orp.role_id` est ce qui distingue cette couche de celle
    -- qu'elle remplace : l'ancienne accordait à tout membre de l'ORG, celle-ci n'accorde qu'aux
    -- membres qui portent le rôle visé.
    EXISTS (
      SELECT 1
      FROM public.org_role_permission orp
      JOIN perm p ON p.id = orp.permission_id
      JOIN public.user_org_membership     uom ON uom.org_object_id = orp.org_object_id
      JOIN public.user_org_business_role  ubr ON ubr.membership_id = uom.id
      WHERE uom.user_id   = (SELECT auth.uid())
        AND uom.is_active = TRUE
        AND ubr.is_active = TRUE
        AND ubr.role_id   = orp.role_id
        AND orp.is_active = TRUE
    );
$authority$;

CREATE OR REPLACE FUNCTION api.is_platform_superuser()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  SELECT
    auth.role() IN ('service_role', 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'super_admin')
    );
$authority$;

CREATE OR REPLACE FUNCTION api.user_can_write_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  SELECT
    api.user_has_permission('edit_canonical_when_publisher')
    AND EXISTS (
      SELECT 1
      FROM public.object_org_link ool
      JOIN public.ref_org_role    ror ON ror.id = ool.role_id AND ror.code = 'publisher'
      WHERE ool.object_id     = p_object_id
        AND ool.org_object_id = api.current_user_org_id()
    )
$authority$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Permission volontairement absente des droits initiaux de tous les rôles métier.
-- Équipe > Permissions peut ensuite l’accorder à un rôle ou à un membre.
BEGIN;

INSERT INTO public.ref_permission (code, name, category, description)
VALUES ('manage_actor_portal_access', 'Gérer l’accès au portail prestataire', 'crm',
        'Afficher le bloc Accès portail du CRM et gérer les invitations, renvois et révocations, dans le périmètre CRM autorisé.')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION api.current_user_can_manage_actor_portal()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
  SELECT COALESCE(api.is_platform_superuser()
    OR api.user_has_permission('manage_actor_portal_access'), false);
$$;
REVOKE ALL ON FUNCTION api.current_user_can_manage_actor_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.current_user_can_manage_actor_portal() TO authenticated, service_role;
COMMENT ON FUNCTION api.current_user_can_manage_actor_portal() IS
  'Permission dédiée au bloc CRM Accès portail. Superutilisateur plateforme ou permission explicite ; aucun rôle métier ne la reçoit par défaut. Les gardes CRM par acteur restent requises.';

COMMIT;
NOTIFY pgrst, 'reload schema';

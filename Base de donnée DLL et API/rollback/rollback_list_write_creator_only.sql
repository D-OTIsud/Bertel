-- rollback_list_write_creator_only.sql
-- Annule migration_list_write_creator_only.sql (manifeste 17k, §227).
--
-- Restaure la définition d'avant 17k, recopiée telle quelle depuis la base vive.
--
-- ⚠️ Ce rollback ROUVRE l'écriture de TOUTE liste de l'ORG à n'importe quel porteur d'un rôle
--    d'administration, `team_lead` (rang 10) compris — y compris à un membre dont le rôle métier
--    est Lecteur. C'est exactement ce que 17k a fermé.

BEGIN;

CREATE OR REPLACE FUNCTION api.user_can_write_list(p_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT api.is_platform_superuser()
      OR EXISTS (SELECT 1 FROM object_list l WHERE l.id = p_list_id AND l.org_object_id = api.current_user_org_id()
                   AND (l.created_by = auth.uid() OR api.current_user_admin_rank() IS NOT NULL));
$function$;

COMMENT ON FUNCTION api.user_can_write_list(uuid) IS NULL;

COMMIT;

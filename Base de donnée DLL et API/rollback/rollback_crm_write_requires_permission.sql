-- rollback_crm_write_requires_permission.sql
-- Annule migration_crm_write_requires_permission.sql (manifeste 17j, §227).
--
-- Restaure le bras `OR api.current_user_admin_rank() IS NOT NULL` sur les quatre gardes
-- d'écriture CRM — définitions recopiées telles quelles depuis la base vive avant 17j.
--
-- ⚠️ Ce rollback ROUVRE l'écriture CRM à tout porteur d'un rôle d'administration, quel que soit
--    son rôle métier. C'est exactement ce que l'arbitrage PO du 2026-08-31 a fermé
--    (« un lecteur ne doit jamais écrire le CRM »). Ne l'exécuter que pour débloquer une
--    régression avérée, et prévenir le PO.

BEGIN;

CREATE OR REPLACE FUNCTION api.user_can_write_crm(p_object_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT api.is_platform_superuser()
      OR (p_object_id IN (SELECT api.current_user_crm_object_ids())
          AND (api.user_has_permission('write_crm_notes')
               OR api.current_user_admin_rank() IS NOT NULL));
$function$;

CREATE OR REPLACE FUNCTION api.user_can_write_crm_actor(p_actor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT api.is_platform_superuser()
      OR (p_actor_id IN (SELECT api.current_user_crm_actor_ids())
          AND (api.user_has_permission('write_crm_notes')
               OR api.current_user_admin_rank() IS NOT NULL));
$function$;

CREATE OR REPLACE FUNCTION api.current_user_can_write_crm_notes()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR api.user_has_permission('write_crm_notes')
    OR api.current_user_admin_rank() IS NOT NULL,
    FALSE);
$function$;

-- `api.save_crm_actor` : patch inverse sur la source vive, même garde anti-no-op qu'à l'aller.
DO $patch$
DECLARE
  v_src text;
  v_new text;
  v_motif CONSTANT text := 'api.user_has_permission(''write_crm_notes'')';
  v_cible CONSTANT text :=
    'api.user_has_permission(''write_crm_notes'') or api.current_user_admin_rank() is not null';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'save_crm_actor';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'STOP: api.save_crm_actor introuvable.';
  END IF;

  IF position(v_cible IN v_src) > 0 THEN
    RAISE NOTICE 'rollback 17j : api.save_crm_actor porte déjà le bras de rang admin — rien à faire.';
    RETURN;
  END IF;

  IF position(v_motif IN v_src) = 0 THEN
    RAISE EXCEPTION
      'STOP: motif introuvable dans api.save_crm_actor — la fonction a changé de forme, '
      'relire avant de rejouer ce rollback.';
  END IF;

  -- Garde de cardinalité — le motif court est moins spécifique que celui de l'aller : si
  -- `api.user_has_permission('write_crm_notes')` apparaissait ailleurs dans la fonction, ce
  -- rollback rouvrirait le rang admin sur un site qu'on n'a pas relu.
  IF (length(v_src) - length(replace(v_src, v_motif, ''))) / length(v_motif) <> 1 THEN
    RAISE EXCEPTION 'STOP: le motif apparaît % fois dans api.save_crm_actor, une seule attendue.',
      (length(v_src) - length(replace(v_src, v_motif, ''))) / length(v_motif);
  END IF;

  v_new := replace(v_src, v_motif, v_cible);
  EXECUTE v_new;
END
$patch$;

COMMIT;

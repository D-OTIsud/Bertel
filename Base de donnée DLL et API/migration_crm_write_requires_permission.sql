-- migration_crm_write_requires_permission.sql
-- Manifeste 17j — l'écriture CRM exige la PERMISSION, jamais le seul rang d'administration (§227).
-- Arbitrage PO 2026-08-31 : « non, un lecteur ne doit jamais écrire le CRM ».
--
-- CE QUE FAIT CETTE MIGRATION
--   Elle retire le bras `api.current_user_admin_rank() IS NOT NULL` des QUATRE gardes d'écriture
--   CRM. Après elle, écrire du CRM demande `write_crm_notes` — conférée par le rôle métier
--   (§227) ou accordée en exception individuelle. Le superuser plateforme reste souverain.
--
-- ═══ POURQUOI CE BRAS ÉTAIT UN TROU ═══
--
--   Le test n'était pas un SEUIL de rang mais une simple non-nullité : `IS NOT NULL`. Or
--   `team_lead` vaut 10, très en dessous du rang 30 exigé pour toute écriture de permission.
--   N'IMPORTE QUEL rôle d'administration ouvrait donc l'écriture CRM, en court-circuitant
--   complètement le système de permissions — et donc le rôle métier.
--
--   Constaté en production le 2026-08-31, APRÈS le correctif 17i : `xyz.makimura@gmail.com`,
--   rétrogradé Lecteur avec 0 permission, conservait `team_lead` et pouvait toujours écrire le
--   CRM. Le tableau de /team affichait « 0 permission » à côté d'un accès en écriture réel :
--   17i avait rendu le compteur honnête, ce bras le rendait de nouveau menteur.
--
--   Deux systèmes d'autorisation concurrents sur le même verbe, dont l'un ignore l'autre : le
--   rôle métier ne peut pas être la source des droits si un rôle d'administration le contourne.
--
-- ═══ QUI PERD L'ACCÈS ═══
--
--   Relevé sur la base vive avant application : UNE personne, `xyz.makimura@gmail.com`
--   (Lecteur + `team_lead`, 0 permission) — précisément la cible de l'arbitrage. Les 6 Éditeurs
--   gardent l'écriture CRM par `write_crm_notes`, que leur rôle confère depuis 17i.
--
-- ═══ CE QUE CETTE MIGRATION NE TOUCHE PAS ═══
--
--   `api.user_can_write_list` porte le même motif `current_user_admin_rank() IS NOT NULL`, mais
--   ce n'est pas la même règle : elle dit « créateur de la liste OU admin de l'ORG », sans
--   aucune permission en jeu, et il n'existe pas de permission « écrire une liste » dans
--   `ref_permission`. La retirer fermerait l'édition des listes d'autrui sans rien pour la
--   rouvrir. Laissée telle quelle — décision distincte, à porter séparément.
--
-- Idempotent (CREATE OR REPLACE + patch guardé). NON foldé dans schema_unified.sql.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Écriture CRM sur un ÉTABLISSEMENT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.user_can_write_crm(p_object_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  -- 17j — le bras `OR api.current_user_admin_rank() IS NOT NULL` est retiré : un rôle
  -- d'administration, même de rang 10, ouvrait l'écriture CRM par-dessus le rôle métier.
  SELECT api.is_platform_superuser()
      OR (p_object_id IN (SELECT api.current_user_crm_object_ids())
          AND api.user_has_permission('write_crm_notes'));
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Écriture CRM sur un ACTEUR.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.user_can_write_crm_actor(p_actor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT api.is_platform_superuser()
      OR (p_actor_id IN (SELECT api.current_user_crm_actor_ids())
          AND api.user_has_permission('write_crm_notes'));
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La SONDE lue par le front (« Lecture seule » de §19).
--
--    COALESCE conservé (§204) : la chaîne de OR traverse `auth.*()`, qui rend NULL hors
--    contexte HTTP. Sans lui la sonde serait à TROIS valeurs et un `if (!canWrite)` côté client
--    deviendrait fail-OPEN — l'écran afficherait l'édition à quelqu'un qui ne peut pas écrire.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.current_user_can_write_crm_notes()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR api.user_has_permission('write_crm_notes'),
    FALSE);
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Création d'un acteur « en projet » dans `api.save_crm_actor`.
--
--    Patch sur la SOURCE VIVE plutôt que réécriture : la fonction fait ~200 lignes et n'a
--    qu'un bras à corriger. La recopier à la main pour changer une condition introduirait un
--    risque de dérive bien plus grand que le motif ne vaut. Le `RAISE` si le motif est absent
--    interdit le no-op silencieux — c'est ce qui distingue un patch d'un vœu.
-- ─────────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_src text;
  v_new text;
  v_motif CONSTANT text :=
    'api.user_has_permission(''write_crm_notes'') or api.current_user_admin_rank() is not null';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'save_crm_actor';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'STOP: api.save_crm_actor introuvable.';
  END IF;

  IF position(v_motif IN v_src) = 0 THEN
    -- Déjà patchée (rejeu) ou réécrite entre-temps : dans les deux cas on ne devine pas.
    IF position('api.current_user_admin_rank()' IN v_src) = 0 THEN
      RAISE NOTICE '17j : api.save_crm_actor ne porte plus le bras de rang admin — rien à faire.';
      RETURN;
    END IF;
    RAISE EXCEPTION
      'STOP: le bras de rang admin de api.save_crm_actor a changé de forme. '
      'Relire la fonction et adapter ce patch — ne PAS laisser passer en silence.';
  END IF;

  -- Garde de cardinalité : `replace` remplace TOUTES les occurrences. Le motif n'en a qu'une
  -- aujourd'hui (compté sur la base vive) ; s'il s'en ajoutait une, ce patch corrigerait
  -- silencieusement un site qu'on n'a pas relu. Mieux vaut échouer.
  IF (length(v_src) - length(replace(v_src, v_motif, ''))) / length(v_motif) <> 1 THEN
    RAISE EXCEPTION 'STOP: le motif apparaît % fois dans api.save_crm_actor, une seule attendue.',
      (length(v_src) - length(replace(v_src, v_motif, ''))) / length(v_motif);
  END IF;

  v_new := replace(v_src, v_motif, 'api.user_has_permission(''write_crm_notes'')');
  EXECUTE v_new;
END
$patch$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS POST-APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- V1. Plus aucune garde d'ÉCRITURE CRM ne mentionne le rang admin.
--     Attendu : `user_can_write_list` SEULE (voir l'encadré « ce qu'on ne touche pas »).
--
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='api' AND p.prokind='f'
--     AND pg_get_functiondef(p.oid) ILIKE '%current_user_admin_rank%'
--     AND p.proname <> 'current_user_admin_rank'
--   ORDER BY 1;
--
-- V2. SABOTAGE — la garde doit BOUGER, et sur la bonne cause.
--     Se placer dans la peau du Lecteur porteur d'un rôle admin :
--       (a) attendu FALSE ;
--       (b) lui accorder `write_crm_notes` en exception ⇒ attendu TRUE ;
--       (c) la retirer ⇒ attendu FALSE.
--     Si (a) et (b) rendent la même valeur, la garde ne lit pas la permission : STOP.
--     À jouer en transaction ANNULÉE.
--
-- V3. Aucun Éditeur ne perd l'accès (ils tiennent `write_crm_notes` de leur rôle depuis 17i).

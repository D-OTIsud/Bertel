-- migration_list_write_creator_only.sql
-- Manifeste 17k — écrire une liste : son créateur, pas « n'importe quel rôle admin » (§227).
-- Demande PO 2026-08-31, à la suite de 17j.
--
-- CE QUE FAIT CETTE MIGRATION
--   `api.user_can_write_list` acceptait `api.current_user_admin_rank() IS NOT NULL` — le dernier
--   porteur du motif fermé par 17j sur le CRM. Même défaut : une NON-NULLITÉ, pas un seuil.
--   `team_lead` (rang 10) donnait donc le droit de modifier, partager, marquer envoyée ou
--   SUPPRIMER la liste de n'importe qui dans l'ORG — y compris à un membre dont le rôle métier
--   est Lecteur (constaté : `xyz.makimura@gmail.com`, Lecteur + `team_lead`).
--
-- ═══ POURQUOI PAS UNE PERMISSION, COMME POUR LE CRM ═══
--
--   17j a pu exiger `write_crm_notes` parce que ce droit EXISTE dans `ref_permission`. Il n'y a
--   aucun droit « écrire une liste » au catalogue, et `api.create_list` n'en demande aucun : tout
--   membre d'une ORG crée déjà des listes, Lecteur compris (2 des 12 listes en base sont d'un
--   Lecteur). Inventer une permission ici retirerait aux Lecteurs une fonction de travail qu'ils
--   ont toujours eue, sans que personne ne l'ait demandé — une liste est une SÉLECTION
--   personnelle, pas du contenu publié.
--
--   La règle juste n'est donc pas « quel droit faut-il » mais « à qui appartient cette liste » :
--   son créateur. C'est ce que la fonction dit désormais.
--
-- ═══ LE PIÈGE QUE CETTE MIGRATION ÉVITE ═══
--
--   « Créateur seul » pur créerait des listes ORPHELINES : `object_list.created_by` ne porte
--   AUCUNE clé étrangère (vérifié : seule `org_object_id` en a une). Au départ d'un membre, sa
--   liste resterait en base avec un `created_by` pendant, et plus personne dans l'ORG ne
--   pourrait la corriger ni la supprimer — seul un superuser plateforme, qu'une ORG n'a pas
--   forcément sous la main.
--
--   D'où le second bras, étroit et explicite : un administrateur d'ORG de **rang ≥ 30** (le même
--   seuil que pour écrire une permission) peut reprendre une liste dont le créateur n'est PLUS
--   membre actif de l'ORG. Tant que le créateur est là, personne d'autre que lui n'y touche.
--
-- Idempotent. NON foldé dans schema_unified.sql.

BEGIN;

CREATE OR REPLACE FUNCTION api.user_can_write_list(p_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  -- COALESCE (§204, même raison que la sonde CRM) : `api.is_platform_superuser()` rend NULL
  -- quand la claim `role` est absente, et `NULL OR FALSE` = NULL. Or les appelants écrivent
  -- `IF NOT api.user_can_write_list(...) THEN RAISE` — et `NOT NULL` = NULL ne déclenche PAS
  -- le RAISE : la garde deviendrait fail-OPEN. PostgREST fournit toujours la claim, mais une
  -- garde ne doit pas dépendre de la bonne volonté de son appelant.
  SELECT COALESCE(
    api.is_platform_superuser()
      OR EXISTS (
        SELECT 1
        FROM object_list l
        WHERE l.id = p_list_id
          AND l.org_object_id = api.current_user_org_id()
          AND (
            -- La liste appartient à celui qui l'a faite.
            l.created_by = (SELECT auth.uid())
            -- Reprise d'une liste ORPHELINE : créateur plus membre actif de l'ORG, appelant
            -- administrateur d'ORG (rang ≥ 30, même seuil que l'écriture de permissions).
            -- `COALESCE(..., 0)` : hors contexte HTTP le rang est NULL, et `NULL >= 30` rendrait
            -- NULL — donc l'EXISTS entier NULL, donc fail-CLOSED ici, mais on préfère l'écrire.
            OR (
              COALESCE(api.current_user_admin_rank(), 0) >= 30
              AND NOT EXISTS (
                SELECT 1 FROM user_org_membership m
                WHERE m.user_id       = l.created_by
                  AND m.org_object_id = l.org_object_id
                  AND m.is_active
              )
            )
          )
      ),
    FALSE);
$function$;

COMMENT ON FUNCTION api.user_can_write_list(uuid) IS
  'Écriture d''une liste : son créateur, ou un admin d''ORG (rang >= 30) si le créateur n''est '
  'plus membre actif (reprise d''orpheline), ou le superuser plateforme. Le bras '
  '« n''importe quel rôle admin » a été retiré le 2026-08-31 (17k).';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS POST-APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- V1. Plus AUCUNE fonction n'accepte un rôle admin sans seuil.
--     (`can_delete_object_private_note` / `can_manage_object_private_note` comparent un seuil —
--      classe différente, hors sujet.)
--
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='api' AND p.prokind='f'
--     AND regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--         ILIKE '%current_user_admin_rank() IS NOT NULL%';
--
--   Attendu : 0 ligne.
--
-- V2. SABOTAGE, à jouer en transaction ANNULÉE, sur une liste d'AUTRUI :
--       (a) Lecteur + team_lead        ⇒ FALSE (c'est le trou qu'on ferme)
--       (b) Éditeur + team_lead        ⇒ FALSE (rang 10 < 30, et ce n'est pas sa liste)
--       (c) le créateur lui-même       ⇒ TRUE
--       (d) admin rang 30, créateur DÉSACTIVÉ ⇒ TRUE (reprise d'orpheline)
--       (e) admin rang 30, créateur ACTIF     ⇒ FALSE
--     Si (d) et (e) rendent la même valeur, le bras de reprise ne regarde pas l'appartenance :
--     STOP.

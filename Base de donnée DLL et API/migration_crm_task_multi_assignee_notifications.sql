-- migration_crm_task_multi_assignee_notifications.sql
-- Manifest 16w — CRM Kanban : provenance du créateur, assignation MULTIPLE, notifications
-- persistantes (brief docs/superpowers/plans/2026-08-28-crm-kanban-task-improvements.md).
--
-- Ce que la passe installe :
--   1. `crm_task.created_by` — provenance IMMUABLE du créateur (posée à l'INSERT, jamais
--      modifiable par un payload d'UPDATE). Les lignes historiques restent NULL : voir §A.
--   2. `crm_task_assignee` — table de liaison (task_id, user_id) : une tâche peut être
--      confiée à PLUSIEURS personnes. `crm_task.owner` SURVIT comme valeur de compatibilité
--      (déterministe : le 1er uuid par ordre croissant) le temps du déploiement — un front
--      déployé plus ancien continue de lire owner_id/owner_name. Sa suppression est une
--      migration de contraction ULTÉRIEURE, jamais celle-ci.
--   3. `app_notification` — notifications applicatives persistantes, GÉNÉRIQUES (colonne
--      `kind`), première espèce = `crm_task_assigned`. Le destinataire (`recipient_id`) est
--      la FRONTIÈRE DE SÉCURITÉ : aucune décision d'autorisation ne vit dans `payload`.
--   4. `api.save_crm_task` — contrat `assignee_ids` (tableau JSON d'uuid) + réconcile NON
--      DESTRUCTIF + notification des SEULS entrants + garde de concurrence.
--   5. `api.list_crm_tasks` / `api.list_object_crm` — clés `assignees[]`, `created_by_id`,
--      `created_by_name` (forme stable, `[]` jamais `null`).
--   6. `api.list_my_notifications` (items + unread_count) / `mark_notification_read` /
--      `mark_all_notifications_read`.
--
-- ────────────────────────────────────────────────────────────────────────────────────────
-- §A — POURQUOI `created_by` N'EST PAS BACKFILLÉ (écart assumé au brief §4.1)
-- ────────────────────────────────────────────────────────────────────────────────────────
-- Le brief proposait `created_by = owner` en « approximation best-effort ». C'est refusé :
-- l'historique du créateur N'EXISTE PAS, et écrire une approximation dans une colonne de
-- PROVENANCE la rend indiscernable d'un fait au premier lecteur suivant (doctrine projet :
-- « les cas ambigus ne sont PAS écrits »). Les 4 tâches historiques (mesuré sur live le
-- 2026-08-28) restent `created_by IS NULL` et l'UI affiche « Créateur inconnu » — une
-- information vraie. Un backfill fabriquerait 4 mentions fausses pour éviter 4 mentions
-- honnêtes : le change n'en vaut pas la peine, et il serait irréversible (rien ne distingue
-- ensuite l'approximation du fait). Corollaire : `crm_task_assignee.assigned_by` est NULL
-- sur les lignes backfillées — personne ne sait qui a assigné.
--
-- **`assigned_at` N'EST JAMAIS BACKFILLÉ : toute ligne reprise depuis `owner` vaut NULL.**
-- Deux rédactions successives ont voulu être plus malignes, deux fois à tort :
--   1. `assigned_at = crm_task.created_at` — faux, `crm_task.owner` est MODIFIABLE : sur une
--      tâche réassignée, `created_at` est la naissance de la TÂCHE, pas celle de
--      l'assignation. Exactement le créateur inventé que ce paragraphe refuse, deux lignes
--      plus haut.
--   2. `created_at` seulement si `updated_at = created_at` (« jamais modifiée ») — faux
--      aussi : `update_updated_at_column()` et `api.save_crm_task` posent `NOW()`, le
--      timestamp de TRANSACTION, constant du début à la fin. Une création suivie d'une
--      réassignation DANS LA MÊME TRANSACTION laisse donc l'égalité intacte tout en ayant
--      changé d'assigné. Reproduit sur live le 2026-08-28 (transaction annulée) : témoin
--      réassigné de A à B, `updated_at = created_at` toujours vrai.
-- Il n'existe pas de test bon marché qui distingue « jamais réassignée » de « réassignée
-- dans la transaction de création ». On cesse donc de dériver : NULL = « on ne sait pas
-- quand », ce qui est vrai et le restera. `assigned_at` est NULLABLE pour pouvoir le dire ;
-- son défaut `now()` ne couvre que les lignes écrites par `api.save_crm_task`.
-- Le journal `audit.audit_log` (`trg_audit_crm_task`, §61) garde la réponse pour qui en
-- aurait besoin un jour — aucun consommateur ne lit `assigned_at` aujourd'hui.
--
-- ────────────────────────────────────────────────────────────────────────────────────────
-- §B — LE RÉCONCILE EST NON DESTRUCTIF (invariant CLAUDE.md §214)
-- ────────────────────────────────────────────────────────────────────────────────────────
-- Ordre imposé : résoudre → CALCULER LE DIFF (avant toute écriture) → INSERT … ON CONFLICT
-- → DELETE du reliquat EN DERNIER. Deux raisons, toutes deux nécessaires :
--   (a) `assigned_at`/`assigned_by` d'un assigné INCHANGÉ doivent survivre à un ré-save ;
--       un delete-all+reinsert les remettrait à now()/moi et l'historique d'assignation
--       serait réécrit à chaque édition de titre ;
--   (b) le diff `nouveaux = demandés − existants` doit être calculé AVANT le DELETE, sinon
--       tout le monde redevient « nouveau » et chaque save re-notifie toute l'équipe.
-- (Le motif §214 stricto sensu — « ne jamais détruire la ligne qui porte le droit d'écrire »
--  — ne s'applique pas ici : `api.user_can_write_crm` probe l'OBJET, pas l'assignation.
--  L'ordre reste le même parce qu'il est le bon par ailleurs.)
--
-- ────────────────────────────────────────────────────────────────────────────────────────
-- §C — CONSOMMATEURS NON CITÉS PAR LE BRIEF, vérifiés sur live avant écriture
-- ────────────────────────────────────────────────────────────────────────────────────────
--   • `api.create_crm_artifacts_from_incident` (TRIGGER sur incident_report) insère dans
--     `crm_task` EN DIRECT, sans passer par `api.save_crm_task` : les tâches d'incident
--     naissent donc SANS assigné (et déjà aujourd'hui sans owner). Contrat respecté :
--     `assignees` sort `[]`, jamais NULL. Conséquence produit assumée : ces tâches ne
--     remontent pas dans le filtre « mes tâches » — elles sont visibles via « Toutes les
--     personnes ». Ne PAS leur inventer un assigné.
--   • `api.rpc_gdpr_erase_subject` (branche 'user') anonymise `app_user_profile`. C'est la
--     raison pour laquelle `app_notification.payload` NE CONTIENT AUCUN NOM : tout libellé
--     de personne est JOINT À LA LECTURE depuis `app_user_profile`, donc l'effacement RGPD
--     le neutralise sans qu'aucune purge de `payload` soit nécessaire. Ne JAMAIS y
--     recopier un display_name (ce serait une copie de PII hors de portée de l'effacement).
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DO $$ gardés) : ré-appliquer CETTE
-- version est un no-op. Portée exacte de cette promesse : le backfill est en
-- `ON CONFLICT DO NOTHING`, donc il ne RÉPARE pas une base où un brouillon antérieur aurait
-- écrit des `assigned_at` datés — il les laisse tels quels. Aucun environnement n'a joué de
-- brouillon (PROD vérifiée vierge de 16w le 2026-08-28) ; si cela devait arriver, la
-- remise en état tient en une ligne :
--   UPDATE crm_task_assignee SET assigned_at = NULL, assigned_by = NULL
--    WHERE (task_id, user_id) IN (SELECT id, owner FROM crm_task WHERE owner IS NOT NULL);
-- à n'exécuter QUE sur une base n'ayant jamais servi (elle effacerait sinon la provenance
-- des assignations écrites depuis par api.save_crm_task).
-- Ordre requis : APRÈS 8z (`migration_crm_module.sql` : crm_task, api.user_can_assign_crm,
-- api.user_can_write_crm, api.list_crm_tasks, api.list_object_crm, api.save_crm_task).
-- NON foldé dans `schema_unified.sql` : les corps référencent des fonctions de 8z.
\set ON_ERROR_STOP on

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. PROVENANCE DU CRÉATEUR
-- ═══════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.crm_task ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_task_created_by_fkey' AND conrelid = 'public.crm_task'::regclass
  ) THEN
    ALTER TABLE public.crm_task
      ADD CONSTRAINT crm_task_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END$$;

COMMENT ON COLUMN public.crm_task.created_by IS
  'Créateur de la tâche (auth.users). Posé UNE FOIS à l''INSERT par api.save_crm_task et '
  'jamais modifiable par un payload d''UPDATE. NULL = créateur inconnu : lignes antérieures '
  'à 16w (jamais backfillées — voir §A de migration_crm_task_multi_assignee_notifications.sql) '
  'ou tâches nées du trigger incident_report. Le créateur N''EST PAS un assigné.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. ASSIGNATION MULTIPLE
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_task_assignee (
  task_id     uuid        NOT NULL REFERENCES public.crm_task(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  assigned_by uuid                 REFERENCES auth.users(id)      ON DELETE SET NULL,
  -- NULLABLE à dessein : NULL = « date d'assignation inconnue » (ligne antérieure à 16w dont
  -- la base ne prouve pas que `owner` n'a pas bougé — voir §A). Le défaut couvre toutes les
  -- lignes écrites par api.save_crm_task, qui ne renseigne jamais la colonne explicitement.
  assigned_at timestamptz          DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

COMMENT ON TABLE public.crm_task_assignee IS
  'Assignation MULTIPLE d''une tâche CRM (16w). SOURCE DE VÉRITÉ de « qui doit faire la '
  'tâche » ; crm_task.owner n''est plus qu''une valeur de compatibilité de déploiement. '
  'Écrite UNIQUEMENT par api.save_crm_task (réconcile non destructif, §B). Aucun accès '
  'PostgREST direct : RLS + REVOKE.';
COMMENT ON COLUMN public.crm_task_assignee.assigned_by IS
  'Qui a posé cette assignation. NULL = inconnu (lignes backfillées depuis crm_task.owner, '
  'ou écriture hors contexte HTTP où auth.uid() est NULL).';
COMMENT ON COLUMN public.crm_task_assignee.assigned_at IS
  'Quand l''assignation a été posée. NULL = inconnu : ligne backfillée depuis crm_task.owner '
  'sur une tâche dont la base ne prouve pas que `owner` n''a pas changé depuis l''insertion. '
  'Ne JAMAIS y écrire une date approchée — c''est une colonne de provenance (§A).';

-- « Mes tâches » interroge par personne : l'index commence donc par user_id (la PK
-- (task_id,user_id) ne sert que le sens inverse).
CREATE INDEX IF NOT EXISTS idx_crm_task_assignee_user
  ON public.crm_task_assignee (user_id, task_id);

-- Backfill : une ligne par owner non nul, SANS provenance — ni qui, ni quand (§A).
--
-- La règle vit dans une FONCTION NOMMÉE, et non en ligne, pour une seule raison : c'est la
-- seule forme que la garde puisse réellement éprouver. Un test qui recopierait l'INSERT
-- vérifierait sa propre copie — saboter la migration ne le ferait pas rougir (constaté :
-- 5 sabotages du backfill passaient au vert). Le test fabrique donc ses témoins puis appelle
-- CETTE fonction ; toute dérive du corps se voit.
--
-- Les deux colonnes de provenance sont posées EXPLICITEMENT à NULL : `assigned_at` porte un
-- DEFAULT `now()` qui, par simple omission de la colonne, daterait toute la reprise du jour
-- du déploiement. ON CONFLICT DO NOTHING : une ligne déjà présente appartient à
-- `api.save_crm_task` et garde sa provenance — le backfill ne réécrit jamais rien.
CREATE OR REPLACE FUNCTION internal.crm_backfill_assignees_from_owner()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'internal'
AS $function$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.crm_task_assignee (task_id, user_id, assigned_by, assigned_at)
  SELECT ct.id, ct.owner, NULL, NULL
  FROM public.crm_task ct
  WHERE ct.owner IS NOT NULL
  ON CONFLICT (task_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION internal.crm_backfill_assignees_from_owner() IS
  'Reprise des assignations depuis crm_task.owner (16w) : une ligne par owner non nul, SANS '
  'provenance (assigned_by et assigned_at à NULL — voir §A). Idempotente. Nommée pour que '
  'tests/test_crm_task_multi_assignee.sql éprouve LA règle et non une copie.';

-- Interne : jamais appelable depuis le navigateur.
REVOKE ALL ON FUNCTION internal.crm_backfill_assignees_from_owner() FROM PUBLIC, anon, authenticated;

SELECT internal.crm_backfill_assignees_from_owner();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATIONS APPLICATIVES PERSISTANTES
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_notification (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  kind         text        NOT NULL,
  task_id      uuid                 REFERENCES public.crm_task(id) ON DELETE CASCADE,
  created_by   uuid                 REFERENCES auth.users(id)     ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- `kind` est fail-closed : une espèce non déclarée doit faire ÉCHOUER l'écriture, jamais
-- atterrir en base et rester invisible côté lecture. Ajouter une espèce = étendre ce CHECK
-- dans une migration (et le rendu correspondant côté front).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_app_notification_kind' AND conrelid = 'public.app_notification'::regclass
  ) THEN
    ALTER TABLE public.app_notification
      ADD CONSTRAINT chk_app_notification_kind CHECK (kind IN ('crm_task_assigned'));
  END IF;
END$$;

COMMENT ON TABLE public.app_notification IS
  'Notifications applicatives persistantes (16w). `recipient_id` EST la frontière de '
  'sécurité : aucune décision d''autorisation ne se lit dans `payload`. `payload` ne '
  'contient JAMAIS de nom de personne — tout libellé est joint à la lecture depuis '
  'app_user_profile, pour rester dans la portée de l''effacement RGPD (§C). Aucun accès '
  'PostgREST direct ni Realtime : RLS + REVOKE, lecture par RPC seulement.';

CREATE INDEX IF NOT EXISTS idx_app_notification_inbox
  ON public.app_notification (recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notification_task
  ON public.app_notification (task_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. RLS — modèle CRM : RLS ON, familles PAR COMMANDE réservées service_role/admin, tout
--    passe par les RPCs DEFINER. `auth.role()` en forme enveloppée (§39, garde CI
--    test_rls_initplan_broad_sweep). REVOKE en défense supplémentaire : le schéma public
--    est exposé à PostgREST, une table sans grant y est inatteignable.
-- ═══════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.crm_task_assignee ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notification  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_crm_task_assignee ON public.crm_task_assignee;
DROP POLICY IF EXISTS admin_ins_crm_task_assignee  ON public.crm_task_assignee;
DROP POLICY IF EXISTS admin_upd_crm_task_assignee  ON public.crm_task_assignee;
DROP POLICY IF EXISTS admin_del_crm_task_assignee  ON public.crm_task_assignee;

CREATE POLICY admin_read_crm_task_assignee ON public.crm_task_assignee FOR SELECT
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_ins_crm_task_assignee ON public.crm_task_assignee FOR INSERT
  WITH CHECK ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_upd_crm_task_assignee ON public.crm_task_assignee FOR UPDATE
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']))
  WITH CHECK ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_del_crm_task_assignee ON public.crm_task_assignee FOR DELETE
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));

DROP POLICY IF EXISTS admin_read_app_notification ON public.app_notification;
DROP POLICY IF EXISTS admin_ins_app_notification  ON public.app_notification;
DROP POLICY IF EXISTS admin_upd_app_notification  ON public.app_notification;
DROP POLICY IF EXISTS admin_del_app_notification  ON public.app_notification;

CREATE POLICY admin_read_app_notification ON public.app_notification FOR SELECT
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_ins_app_notification ON public.app_notification FOR INSERT
  WITH CHECK ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_upd_app_notification ON public.app_notification FOR UPDATE
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']))
  WITH CHECK ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_del_app_notification ON public.app_notification FOR DELETE
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));

REVOKE ALL ON TABLE public.crm_task_assignee FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.app_notification  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.crm_task_assignee TO service_role;
GRANT ALL ON TABLE public.app_notification  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. HELPER INTERNE — libellé d'un utilisateur, source UNIQUE
--    Même repli que api.list_crm_assignees : un profil anonymisé (RGPD) ou absent ne doit
--    pas produire une ligne sans nom dans le kanban.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.crm_user_label(p_user uuid, p_display_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_user IS NULL THEN NULL
           ELSE COALESCE(NULLIF(btrim(p_display_name), ''), 'Utilisateur ' || left(p_user::text, 8))
         END;
$$;
REVOKE ALL ON FUNCTION api.crm_user_label(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.crm_user_label(uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION api.crm_user_label(uuid, text) IS
  'Libellé affichable d''un utilisateur : display_name, à défaut « Utilisateur xxxxxxxx ». '
  'Source unique du repli — les sérialiseurs de tâche et de notification l''appellent tous.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. api.save_crm_task — contrat `assignee_ids`
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.save_crm_task(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  v_owner uuid := NULLIF(p_payload->>'owner','')::uuid;
  v_related_interaction_id uuid := NULLIF(p_payload->>'related_interaction_id','')::uuid;
  v_rel_object text;
  v_existing_object text;
  v_status crm_task_status;
  v_priority crm_task_priority;
  v_title text := NULLIF(btrim(COALESCE(p_payload->>'title','')),'');
  v_actor uuid := auth.uid();
  -- Assignation (16w)
  v_has_assignees boolean := p_payload ? 'assignee_ids';
  v_requested uuid[];          -- ensemble demandé, dédoublonné, trié
  v_new_assignees uuid[];      -- entrants SEULS (diff calculé AVANT toute écriture, §B)
  v_compat_owner uuid;         -- crm_task.owner de compatibilité = 1er uuid trié
  v_u uuid;
BEGIN
  -- ---- Résolution + validation de l'ensemble demandé (avant toute écriture) ------------
  IF v_has_assignees THEN
    IF jsonb_typeof(p_payload->'assignee_ids') <> 'array' THEN
      RAISE EXCEPTION 'assignee_ids doit être un tableau JSON d''uuid'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      SELECT array_agg(DISTINCT t.txt::uuid ORDER BY t.txt::uuid)
        INTO v_requested
      FROM jsonb_array_elements_text(p_payload->'assignee_ids') AS t(txt)
      WHERE btrim(t.txt) <> '';
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'assignee_ids contient une valeur qui n''est pas un uuid'
        USING ERRCODE = '22023';
    END;
    -- Un ensemble d'assignation VIDE est un refus explicite, jamais un « pas de changement » :
    -- une tâche sans personne responsable ne se crée pas par omission silencieuse.
    IF COALESCE(array_length(v_requested, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Une tâche doit avoir au moins une personne assignée'
        USING ERRCODE = '22023';
    END IF;
  ELSIF p_payload ? 'owner' THEN
    -- Contrat HÉRITÉ : un `owner` seul vaut un ensemble d'exactement une personne.
    -- `owner` présent mais vide/null = ensemble vide explicite ⇒ même refus que ci-dessus
    -- (une tâche a toujours au moins une personne responsable). Aucun appelant du dépôt
    -- ne désassigne ainsi ; l'ancien corps posait alors owner = NULL en silence.
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Une tâche doit avoir au moins une personne assignée'
        USING ERRCODE = '22023';
    END IF;
    v_requested := ARRAY[v_owner];
  END IF;

  -- Validation d'appartenance sur les DEUX chemins (assignee_ids ET owner hérité) : la
  -- garde ne doit pas dépendre de la forme du payload.
  IF v_requested IS NOT NULL THEN
    FOREACH v_u IN ARRAY v_requested LOOP
      IF NOT api.user_can_assign_crm(v_u) THEN
        RAISE EXCEPTION 'Assignataire hors de votre organisation: %', v_u
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  v_compat_owner := (SELECT u FROM unnest(COALESCE(v_requested, ARRAY[]::uuid[])) u ORDER BY u LIMIT 1);

  -- ══════════════════════════════ BRANCHE UPDATE ══════════════════════════════
  IF v_id IS NOT NULL THEN
    -- Verrou de la ligne tâche : sérialise deux réconciles concurrents (sans lui, deux
    -- éditions simultanées peuvent perdre ou dupliquer des assignations).
    SELECT object_id INTO v_existing_object FROM crm_task WHERE id = v_id FOR UPDATE;
    IF v_existing_object IS NULL THEN
      RAISE EXCEPTION 'crm_task inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm(v_existing_object) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    IF v_object_id IS NOT NULL AND v_object_id <> v_existing_object
       AND NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    IF p_payload ? 'actor_id' AND v_actor_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor_id) THEN
        RAISE EXCEPTION 'acteur inconnu: %', v_actor_id USING ERRCODE = 'P0002';
      END IF;
      IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF p_payload ? 'related_interaction_id' AND v_related_interaction_id IS NOT NULL THEN
      SELECT object_id INTO v_rel_object FROM crm_interaction WHERE id = v_related_interaction_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'interaction liée inconnue: %', v_related_interaction_id USING ERRCODE = 'P0002';
      END IF;
      IF v_rel_object IS DISTINCT FROM COALESCE(v_object_id, v_existing_object) THEN
        RAISE EXCEPTION 'interaction liée d''un autre établissement' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- Le diff est calculé AVANT le moindre write (§B (b)) : sans cela, un ré-save à
    -- ensemble constant re-notifierait toute l'équipe.
    IF v_requested IS NOT NULL THEN
      SELECT array_agg(u.u ORDER BY u.u) INTO v_new_assignees
      FROM unnest(v_requested) AS u(u)
      WHERE NOT EXISTS (
        SELECT 1 FROM crm_task_assignee a WHERE a.task_id = v_id AND a.user_id = u.u
      );
    END IF;

    -- UNE seule écriture sur crm_task (le trigger d'audit et updated_at ne doivent tirer
    -- qu'une fois). `created_by` est ABSENT de la liste : la provenance est immuable, même
    -- si le payload porte la clé.
    UPDATE crm_task SET
      object_id   = COALESCE(v_object_id, object_id),
      actor_id    = CASE WHEN p_payload ? 'actor_id' THEN v_actor_id ELSE actor_id END,
      owner       = CASE WHEN v_requested IS NOT NULL THEN v_compat_owner ELSE owner END,
      title       = COALESCE(v_title, title),
      description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description','') ELSE description END,
      status      = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_task_status ELSE status END,
      priority    = CASE WHEN p_payload ? 'priority' THEN (p_payload->>'priority')::crm_task_priority ELSE priority END,
      due_at      = CASE WHEN p_payload ? 'due_at' THEN NULLIF(p_payload->>'due_at','')::timestamptz ELSE due_at END,
      related_interaction_id = CASE WHEN p_payload ? 'related_interaction_id' THEN v_related_interaction_id ELSE related_interaction_id END,
      updated_at  = NOW()
    WHERE id = v_id;

    -- Réconcile non destructif (§B) : UPSERT d'abord, suppression du reliquat EN DERNIER.
    -- Ni `assignee_ids` ni `owner` dans le payload ⇒ v_requested NULL ⇒ on NE TOUCHE PAS
    -- aux assignations (c'est le cas du drag & drop kanban, qui n'envoie que le statut).
    IF v_requested IS NOT NULL THEN
      INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
      SELECT v_id, u.u, v_actor FROM unnest(v_requested) AS u(u)
      ON CONFLICT (task_id, user_id) DO NOTHING;

      DELETE FROM crm_task_assignee
      WHERE task_id = v_id AND user_id <> ALL (v_requested);

      PERFORM api.notify_task_assignees(v_id, v_new_assignees, v_actor);
    END IF;

    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- ══════════════════════════════ BRANCHE INSERT ══════════════════════════════
  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object_id requis' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor_id) THEN
      RAISE EXCEPTION 'acteur inconnu: %', v_actor_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_related_interaction_id IS NOT NULL THEN
    SELECT object_id INTO v_rel_object FROM crm_interaction WHERE id = v_related_interaction_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'interaction liée inconnue: %', v_related_interaction_id USING ERRCODE = 'P0002';
    END IF;
    IF v_rel_object IS DISTINCT FROM v_object_id THEN
      RAISE EXCEPTION 'interaction liée d''un autre établissement' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Aucune clé d'assignation ⇒ le saisisseur. Un appel hors contexte HTTP (auth.uid() NULL,
  -- ex. service_role en psql) laisse la tâche SANS assigné plutôt que d'en inventer un.
  IF v_requested IS NULL AND v_actor IS NOT NULL THEN
    v_requested := ARRAY[v_actor];
    v_compat_owner := v_actor;
  END IF;

  v_id := gen_random_uuid();
  v_status := COALESCE(NULLIF(p_payload->>'status',''),'todo')::crm_task_status;
  v_priority := COALESCE(NULLIF(p_payload->>'priority',''),'medium')::crm_task_priority;
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, due_at,
                        owner, related_interaction_id, created_by)
  VALUES (v_id, v_object_id, v_actor_id, v_title,
          NULLIF(p_payload->>'description',''),
          v_status, v_priority,
          NULLIF(p_payload->>'due_at','')::timestamptz,
          v_compat_owner, v_related_interaction_id, v_actor);

  IF v_requested IS NOT NULL THEN
    INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
    SELECT v_id, u.u, v_actor FROM unnest(v_requested) AS u(u)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    -- À la création, TOUS les assignés sont des entrants.
    PERFORM api.notify_task_assignees(v_id, v_requested, v_actor);
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$function$;

-- Notification des SEULS entrants. Isolée pour n'avoir qu'une définition de la règle
-- produit « on ne se notifie pas soi-même ».
-- `IS DISTINCT FROM` est OBLIGATOIRE : `<> v_actor` vaut NULL quand v_actor est NULL
-- (appel hors contexte HTTP) et n'écarterait alors AUCUNE ligne… mais n'en garderait
-- aucune non plus — le filtre deviendrait vide et personne ne serait notifié.
CREATE OR REPLACE FUNCTION api.notify_task_assignees(
  p_task_id uuid, p_new_assignees uuid[], p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_task_id IS NULL OR COALESCE(array_length(p_new_assignees, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  INSERT INTO app_notification (recipient_id, kind, task_id, created_by)
  SELECT u.u, 'crm_task_assigned', p_task_id, p_actor
  FROM unnest(p_new_assignees) AS u(u)
  WHERE u.u IS DISTINCT FROM p_actor;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Fonction d'écriture interne : jamais appelable depuis le navigateur.
REVOKE ALL ON FUNCTION api.notify_task_assignees(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.notify_task_assignees(uuid, uuid[], uuid) TO service_role;

COMMENT ON FUNCTION api.notify_task_assignees(uuid, uuid[], uuid) IS
  'Crée une notification crm_task_assigned par NOUVEL assigné, en excluant l''auteur de '
  'l''action (règle produit : on ne se notifie pas de sa propre auto-assignation). '
  'Appelée UNIQUEMENT depuis api.save_crm_task, dans la même transaction que le save.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 7. LECTURES DE TÂCHE — clés `assignees[]`, `created_by_id`, `created_by_name`
--    `owner_id`/`owner_name` sont CONSERVÉS le temps du déploiement (un front antérieur
--    les lit encore). Le nouveau front ne doit plus s'en servir.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.list_crm_tasks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_scope text[];
  v_items jsonb;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0 THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', ct.id, 'object_id', ct.object_id, 'object_name', o.name,
      'actor_id', ct.actor_id, 'actor_name', act.display_name, -- rattachement acteur (rectif PO)
      'title', ct.title, 'description', ct.description,
      'status', ct.status, 'priority', ct.priority,
      'due_at', ct.due_at, 'created_at', ct.created_at,
      -- owner_id/owner_name : contrat HÉRITÉ conservé pour la fenêtre de déploiement
      -- (16w). Valeur de compatibilité = 1er assigné par uuid croissant. Le front ≥16w
      -- lit `assignees`, jamais ces deux clés.
      'owner_id', ct.owner, 'owner_name', p.display_name,
      -- 16w — assignation multiple. Ordre STABLE : nom affiché insensible à la casse puis
      -- uuid (deux homonymes ne peuvent pas permuter d'un appel à l'autre). Jamais NULL.
      'assignees', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'user_id', a.user_id,
                 'display_name', api.crm_user_label(a.user_id, ap.display_name))
               ORDER BY lower(api.crm_user_label(a.user_id, ap.display_name)), a.user_id)
        FROM crm_task_assignee a
        LEFT JOIN app_user_profile ap ON ap.id = a.user_id
        WHERE a.task_id = ct.id), '[]'::jsonb),
      -- 16w — provenance. NULL assumé = créateur inconnu (§A) ; le front affiche
      -- « Créateur inconnu », il ne devine JAMAIS un nom depuis les assignés.
      'created_by_id', ct.created_by,
      'created_by_name', api.crm_user_label(ct.created_by, cp.display_name),
      'related_interaction_id', ct.related_interaction_id,
      'related_interaction_subject', ri.subject,
      'related_interaction_status', ri.status
    ) AS item
    FROM crm_task ct
    JOIN object o ON o.id = ct.object_id
    LEFT JOIN actor act ON act.id = ct.actor_id
    LEFT JOIN app_user_profile p ON p.id = ct.owner
    LEFT JOIN app_user_profile cp ON cp.id = ct.created_by
    LEFT JOIN crm_interaction ri ON ri.id = ct.related_interaction_id
    WHERE (v_scope IS NULL OR ct.object_id = ANY(v_scope))
    ORDER BY ct.due_at ASC NULLS LAST, ct.created_at DESC
  ) q;

  RETURN v_items;
END;
$function$;

CREATE OR REPLACE FUNCTION api.list_object_crm(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_interactions jsonb;
  v_tasks jsonb;
  v_topics jsonb;
  v_actors jsonb;
BEGIN
  IF p_object_id IS NULL OR NOT api.user_can_read_crm(p_object_id) THEN
    RAISE EXCEPTION 'CRM non autorisé pour cet objet' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_interactions
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'interaction_type', ci.interaction_type, 'direction', ci.direction,
      'status', ci.status, 'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at, 'resolved_at', ci.resolved_at,
      'actor_id', ci.actor_id, 'actor_name', a.display_name,
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source,
      'interlocutor_email', ci.extra->>'interlocuteur_email',
      'replies', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'interaction_type', r.interaction_type, 'body', r.body,
          'occurred_at', r.occurred_at, 'created_at', r.created_at,
          'sentiment_code', rs.code, 'sentiment_name', rs.name,
          'owner_name', rp.display_name, 'interlocutor_email', r.extra->>'interlocuteur_email',
          'source', r.source
        ) ORDER BY r.occurred_at ASC NULLS LAST, r.id ASC)
        FROM crm_interaction r
        LEFT JOIN ref_code_crm_sentiment rs ON rs.id = r.request_sentiment_id
        LEFT JOIN app_user_profile rp ON rp.id = r.owner
        WHERE r.parent_interaction_id = ci.id
      ), '[]'::jsonb)
    ) AS item
    FROM crm_interaction ci
    LEFT JOIN actor a ON a.id = ci.actor_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE ci.object_id = p_object_id
      AND ci.parent_interaction_id IS NULL
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
  ) qi;

  -- 16w — MÊME contrat de tâche que list_crm_tasks (une seule forme de tâche dans l'API).
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_tasks
  FROM (
    SELECT jsonb_build_object(
      'id', ct.id, 'title', ct.title, 'status', ct.status,
      'priority', ct.priority, 'due_at', ct.due_at,
      'actor_id', ct.actor_id, 'actor_name', act.display_name,
      'assignees', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'user_id', a2.user_id,
                 'display_name', api.crm_user_label(a2.user_id, ap.display_name))
               ORDER BY lower(api.crm_user_label(a2.user_id, ap.display_name)), a2.user_id)
        FROM crm_task_assignee a2
        LEFT JOIN app_user_profile ap ON ap.id = a2.user_id
        WHERE a2.task_id = ct.id), '[]'::jsonb),
      'created_by_id', ct.created_by,
      'created_by_name', api.crm_user_label(ct.created_by, cp.display_name),
      'related_interaction_id', ct.related_interaction_id,
      'related_interaction_subject', ri2.subject,
      'related_interaction_status', ri2.status
    ) AS item
    FROM crm_task ct
    LEFT JOIN actor act ON act.id = ct.actor_id
    LEFT JOIN app_user_profile cp ON cp.id = ct.created_by
    LEFT JOIN crm_interaction ri2 ON ri2.id = ct.related_interaction_id
    WHERE ct.object_id = p_object_id
    ORDER BY ct.due_at ASC NULLS LAST
  ) qt;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_topics
  FROM (
    SELECT jsonb_build_object('code', g.code, 'name', g.name, 'count', g.n) AS item
    FROM (
      SELECT t.code, t.name, count(*) AS n
      FROM crm_interaction ci
      JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
      WHERE ci.object_id = p_object_id
      GROUP BY t.code, t.name
    ) g
    ORDER BY g.n DESC
  ) qg;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'actor_id', ar.actor_id, 'display_name', a.display_name, 'photo_url', a.photo_url,
           'role_code', r.code, 'role_name', r.name, 'is_primary', ar.is_primary)
         ORDER BY ar.is_primary DESC NULLS LAST, a.display_name), '[]'::jsonb)
  INTO v_actors
  FROM actor_object_role ar
  JOIN actor a ON a.id = ar.actor_id
  JOIN ref_actor_role r ON r.id = ar.role_id
  WHERE ar.object_id = p_object_id;

  RETURN jsonb_build_object('interactions', v_interactions, 'tasks', v_tasks,
                            'topics', v_topics, 'actors', v_actors);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 8. RPCs NOTIFICATIONS — le destinataire est TOUJOURS auth.uid(), jamais un paramètre.
--    Un id inconnu et un id appartenant à autrui produisent la MÊME réponse : aucune de
--    ces fonctions ne permet de tester l'existence d'une notification d'un tiers.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.list_my_notifications(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_unread integer;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  END IF;

  -- Le plus récent d'abord — l'ORDER BY de l'agrégat est le SEUL qui compte (celui de la
  -- sous-requête ne sert qu'au LIMIT).
  SELECT COALESCE(jsonb_agg(item ORDER BY ord DESC, tie DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT n.created_at AS ord, n.id AS tie, jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'created_at', n.created_at,
      'read_at', n.read_at,
      'task_id', n.task_id,
      'task_title', ct.title,
      'object_id', ct.object_id,
      'object_name', o.name,
      'created_by_id', n.created_by,
      -- Nom JOINT à la lecture (jamais recopié dans payload) : l'effacement RGPD du profil
      -- suffit alors à neutraliser le libellé (§C).
      'created_by_name', api.crm_user_label(n.created_by, cp.display_name),
      'payload', n.payload
    ) AS item
    FROM app_notification n
    LEFT JOIN crm_task ct ON ct.id = n.task_id
    LEFT JOIN object o ON o.id = ct.object_id
    LEFT JOIN app_user_profile cp ON cp.id = n.created_by
    WHERE n.recipient_id = v_me
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit
  ) q;

  SELECT count(*) INTO v_unread
  FROM app_notification n WHERE n.recipient_id = v_me AND n.read_at IS NULL;

  RETURN jsonb_build_object('items', v_items, 'unread_count', v_unread);
END;
$function$;

-- Un brouillon antérieur de 16w exposait `api.count_my_unread_notifications` : la retirer
-- explicitement, sinon elle SURVIT à une ré-application (rien ne supprime une fonction qu'on
-- a cessé d'écrire) et reste exécutable par `authenticated`.
DROP FUNCTION IF EXISTS api.count_my_unread_notifications();

-- Pas de RPC de comptage séparé : `list_my_notifications` rend DÉJÀ `unread_count`, calculé
-- sur TOUTES les non-lues (indépendant de `p_limit`), donc la pastille reste exacte. Un
-- compteur interrogé seul était une fausse économie : une CARDINALITÉ ne dit pas quelles
-- notifications composent la boîte — lire une ancienne pendant qu'une neuve arrive laisse le
-- compte identique, et l'arrivée passait inaperçue. Le front observe donc la liste.

CREATE OR REPLACE FUNCTION api.mark_notification_read(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_n integer := 0;
BEGIN
  IF v_me IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;
  UPDATE app_notification
     SET read_at = now()
   WHERE id = p_id AND recipient_id = v_me AND read_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Id inconnu et id d'autrui rendent tous deux 0 : aucune sonde d'existence possible.
  RETURN jsonb_build_object('updated', v_n);
END;
$function$;

CREATE OR REPLACE FUNCTION api.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_n integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;
  UPDATE app_notification SET read_at = now()
   WHERE recipient_id = v_me AND read_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_n);
END;
$function$;

-- REVOKE FROM PUBLIC obligatoire sur toute fonction DEFINER neuve (PostgreSQL accorde
-- EXECUTE à PUBLIC par défaut, et un GRANT ciblé ne le retire pas).
REVOKE ALL ON FUNCTION api.list_my_notifications(integer)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.mark_notification_read(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.mark_all_notifications_read()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_notifications(integer)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.mark_notification_read(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.mark_all_notifications_read()   TO authenticated, service_role;

COMMENT ON FUNCTION api.list_my_notifications(integer) IS
  'Boîte de réception de l''appelant UNIQUEMENT (recipient_id = auth.uid(), jamais un '
  'paramètre). Renvoie {items[], unread_count}. Anon ⇒ boîte vide.';

COMMIT;

-- PostgREST doit recharger son cache de schéma : 4 fonctions api.* neuves.
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 17i — Tâches CRM : outbox e-mail d'assignation + pièces jointes.
-- Spec : docs/superpowers/specs/2026-08-31-crm-task-email-description-attachments-design.md
--
-- 1. app_notification devient un OUTBOX e-mail (email_claimed_at / email_sent_at /
--    email_error / email_attempts). Le drainage est fait par le serveur Next (relais SMTP
--    autorisé par IP du VPS : ni Edge Function ni trigger DB ne peuvent envoyer). Claim
--    TTL 10 min : un crash entre claim et envoi re-rend la ligne réclamable — un e-mail
--    n'est jamais perdu, un doublon n'est possible QUE dans cette fenêtre de panne
--    (assumé). Cinq échecs d'envoi et la ligne SORT de la file : sans cette borne, une
--    seule adresse durablement inenvoyable rebouche la file à chaque drain, à jamais.
--    L'arriéré antérieur à 17i est TERMINÉ par un backfill : on ne réveille pas des
--    assignations anciennes le jour du déploiement.
-- 2. api.user_can_write_crm_task : LE prédicat d'écriture d'une tâche, factorisé —
--    même règle que api.save_crm_task (user_can_write_crm sur l'object de la tâche).
-- 3. crm_task_document : pièces jointes d'une tâche (bucket privé actor-documents,
--    ref_document access_scope crm_private). RLS service_role only, comme actor_document.
-- 4. api.list_crm_tasks émet documents[] par tâche.
-- Idempotente. APRÈS 16z (redéploie list_crm_tasks) et après toute migration ultérieure
-- qui la toucherait. NOTIFY pgrst requis (fonctions api.* nouvelles/modifiées).
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Outbox e-mail ────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_notification ADD COLUMN IF NOT EXISTS email_claimed_at timestamptz;
ALTER TABLE public.app_notification ADD COLUMN IF NOT EXISTS email_sent_at   timestamptz;
ALTER TABLE public.app_notification ADD COLUMN IF NOT EXISTS email_error     text;
ALTER TABLE public.app_notification ADD COLUMN IF NOT EXISTS email_attempts  int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.app_notification.email_claimed_at IS
  'Réclamation de drainage en cours (TTL 10 min). NULL ou périmée = réclamable.';
COMMENT ON COLUMN public.app_notification.email_sent_at IS
  'Envoi e-mail confirmé (ou ligne terminée sans envoi possible — voir email_error).';
COMMENT ON COLUMN public.app_notification.email_error IS
  'Dernière erreur d''envoi. Diagnostic seulement : ne bloque jamais une re-réclamation.';
COMMENT ON COLUMN public.app_notification.email_attempts IS
  'Nombre d''échecs d''envoi acquittés. À 5, la ligne SORT de la file (plus jamais '
  'réclamée) et reste diagnosticable par email_error + email_attempts.';

-- ── L'ARRIÉRÉ ANTÉRIEUR À 17i NE DOIT PAS REPARTIR ─────────────────────────────────────
-- `ADD COLUMN email_sent_at` fait naître TOUTES les lignes historiques à NULL, c'est-à-dire
-- réclamables : sans ce backfill, le premier drain e-maillerait des assignations déjà
-- anciennes. Une assignation vieille de plusieurs jours n'a rien à faire dans la boîte de
-- son destinataire le jour du déploiement — elle a déjà été vue dans l'interface, et
-- l'e-mail est un RAPPEL de l'événement, pas son archive. Le comportement ne doit pas non
-- plus dépendre du délai qui sépare l'écriture de cette migration de son application :
-- l'arriéré mesuré aujourd'hui est d'UNE ligne, il grossira jusqu'au déploiement.
-- Les lignes sont TERMINÉES (email_sent_at posé) et non supprimées : la marque
-- `backfill_pre_17i` dit explicitement pourquoi aucun e-mail n'est parti pour elles.
-- ⚠ REJEU : cette migration est idempotente au sens DDL, mais ce backfill ne l'est pas au
-- sens métier — le REJOUER sur une base vivante terminerait tout ce qui attend à cet
-- instant dans la file (au pire quelques minutes d'e-mails en attente, la file étant
-- drainée à chaque assignation). Ne pas rejouer 17i sur une base vivante sans le savoir.
UPDATE app_notification SET email_sent_at = now(), email_error = 'backfill_pre_17i'
WHERE kind = 'crm_task_assigned' AND email_sent_at IS NULL;

-- Index de parcours du drain. Il porte les TROIS prédicats du claim, `kind` compris :
-- `app_notification` est explicitement GÉNÉRIQUE (16z — une espèce de plus = un CHECK de
-- plus, pas une table de plus). Le jour où une seconde espèce non e-mailée y sera écrite,
-- rien ne la terminera jamais — le drain ne réclame que `crm_task_assigned` — et ses lignes
-- s'accumuleraient À DEMEURE en tête du parcours, devant celles qui doivent réellement
-- partir. Borner l'index sur `kind` le restreint exactement à la file qu'il sert : il reste
-- de la taille de l'arriéré d'envoi, jamais de celle de l'historique des autres espèces.
--
-- Il est LÂCHÉ avant d'être créé, et ce DROP n'est pas une précaution de style :
-- l'idempotence d'un index à PRÉDICAT n'est pas celle d'une table. `IF NOT EXISTS` ne
-- compare que le NOM ; sur un environnement portant déjà la première rédaction de cet index
-- (parcours borné au seul `email_sent_at IS NULL`), le CREATE serait un NO-OP SILENCIEUX et
-- l'index NON BORNÉ survivrait — c'est-à-dire exactement l'accumulation que la borne `kind`
-- existe pour empêcher, conservée par la migration censée la fermer, et sans qu'aucune
-- sortie de DDL ne le signale. Rejouer un DROP + CREATE coûte une reconstruction d'index ;
-- taire une définition périmée coûte la panne qu'on croyait corrigée. Le même raisonnement
-- vaut pour la borne `email_attempts` ajoutée ci-dessous : une ligne épuisée quitte la file,
-- l'index doit la laisser sortir aussi, sinon il regrossit de tout ce qui ne partira jamais.
DROP INDEX IF EXISTS public.idx_app_notification_unmailed;
CREATE INDEX IF NOT EXISTS idx_app_notification_unmailed
  ON public.app_notification (created_at)
  WHERE email_sent_at IS NULL AND kind = 'crm_task_assigned' AND email_attempts < 5;

-- Réclame jusqu'à p_limit notifications à e-mailer et retourne TOUT le contenu du message,
-- dérivé en DB (aucune donnée client n'entre jamais dans un e-mail). SKIP LOCKED + fenêtre
-- TTL : deux drains concurrents ne prennent jamais la même ligne. Une ligne dont le
-- destinataire n'a pas d'e-mail est TERMINÉE ici même (email_sent_at + email_error) :
-- elle ne doit pas boucher la file en boucle claim/échec.
--
-- `email_attempts < 5` FERME LA MÊME CLASSE DE PANNE POUR L'AUTRE MOITIÉ DU PROBLÈME.
-- Le bras `no_recipient_email` ci-dessous ne couvre que l'adresse ABSENTE ou VIDE ; il ne
-- dit rien de l'adresse syntaxiquement valide dont la boîte refuse DÉFINITIVEMENT (compte
-- fermé, domaine en rejet). Cette ligne-là échoue, l'acquittement en échec lève son claim,
-- elle redevient réclamable — et comme le parcours est `ORDER BY n.created_at`, elle reste
-- en TÊTE : elle consomme un des 20 créneaux de CHAQUE drain, à jamais. Vingt lignes de ce
-- type et la file ne se draine plus du tout, alors que rien n'est cassé nulle part. La
-- dissymétrie était donc : file protégée contre l'adresse manquante, grande ouverte à
-- l'envoi qui échoue.
-- Une ligne qui a épuisé ses 5 tentatives SORT de la file : elle n'est plus jamais
-- réclamée, elle n'est NI supprimée NI marquée envoyée (`email_sent_at` reste NULL, ce qui
-- dit la vérité : aucun e-mail n'est parti), et elle reste diagnosticable par le couple
-- `email_error` + `email_attempts`. La relancer est un geste EXPLICITE d'exploitation
-- (`UPDATE … SET email_attempts = 0`), jamais un effet de bord du drain.
-- 5 et pas 1 : les échecs SMTP transitoires (relais saturé, coupure réseau du VPS) sont la
-- majorité des échecs réels, et abandonner au premier perdrait des e-mails parfaitement
-- envoyables. 5 et pas 50 : au-delà, la ligne bouche la file assez longtemps pour que le
-- symptôme redevienne celui qu'on ferme ici.
CREATE OR REPLACE FUNCTION api.claim_unmailed_notifications(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  WITH claimable AS (
    SELECT n.id
    FROM app_notification n
    WHERE n.kind = 'crm_task_assigned'
      AND n.email_sent_at IS NULL
      AND n.email_attempts < 5
      AND (n.email_claimed_at IS NULL OR n.email_claimed_at < now() - interval '10 minutes')
    ORDER BY n.created_at
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE app_notification n SET email_claimed_at = now()
    FROM claimable c WHERE n.id = c.id
    RETURNING n.id, n.recipient_id, n.task_id, n.created_by, n.created_at
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'notification_id', cl.id,
           -- NULLIF sur l'adresse VIDE : `''` n'est pas une adresse, mais seul NULL déclenche
           -- la terminaison `no_recipient_email` plus bas. Rendue telle quelle, une chaîne
           -- vide partirait au drain, échouerait au relais à chaque ping et reviendrait
           -- réclamable après chaque TTL — exactement le bouchage de file en boucle
           -- claim/échec que ce bras existe pour empêcher.
           'recipient_email', NULLIF(u.email, ''),
           -- Libellés JOINTS à la lecture (jamais stockés) : effacement RGPD respecté.
           'recipient_name', api.crm_user_label(cl.recipient_id, rp.display_name),
           'task_title', ct.title,
           'object_name', o.name,
           'due_at', ct.due_at,
           'assigner_name', api.crm_user_label(cl.created_by, ap.display_name)
         ) ORDER BY cl.created_at, cl.id), '[]'::jsonb)
  INTO v_rows
  FROM claimed cl
  LEFT JOIN auth.users u        ON u.id  = cl.recipient_id
  LEFT JOIN app_user_profile rp ON rp.id = cl.recipient_id
  LEFT JOIN crm_task ct         ON ct.id = cl.task_id
  LEFT JOIN object o            ON o.id  = ct.object_id
  LEFT JOIN app_user_profile ap ON ap.id = cl.created_by;

  -- Destinataire sans e-mail : terminée, pas retournée.
  UPDATE app_notification n
  SET email_sent_at = now(), email_error = 'no_recipient_email'
  WHERE n.id IN (
    SELECT (item->>'notification_id')::uuid
    FROM jsonb_array_elements(v_rows) item
    WHERE item->>'recipient_email' IS NULL
  );

  RETURN COALESCE((
    SELECT jsonb_agg(item)
    FROM jsonb_array_elements(v_rows) item
    WHERE item->>'recipient_email' IS NOT NULL
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION api.claim_unmailed_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.claim_unmailed_notifications(integer) TO service_role;
COMMENT ON FUNCTION api.claim_unmailed_notifications(integer) IS
  'Outbox e-mail (17i) : réclame les notifications crm_task_assigned non e-mailées '
  '(TTL 10 min, SKIP LOCKED) et retourne le contenu du message dérivé en DB. '
  'Appelée UNIQUEMENT par la route Next /api/crm/notify-drain en service_role.';

-- Acquittement du drain. p_failed = [{"id","error"}] : erreur stampée, compteur de
-- tentatives INCRÉMENTÉ, claim levé — re-réclamable au prochain ping TANT QUE le compteur
-- n'a pas atteint 5 (voir la borne du claim : c'est l'incrément d'ici qui la rend
-- atteignable ; sans lui la borne serait décorative et la file resterait bouchable à
-- l'infini par une seule adresse durablement inenvoyable).
-- Les deux bras sont bornés à `kind = 'crm_task_assigned'`,
-- la MÊME espèce que le claim : un identifiant étranger porté par un acquittement ne doit
-- pas pouvoir terminer une notification d'une autre espèce, que ce drain n'a jamais eue à
-- envoyer (sans exposition aujourd'hui — service_role seul — mais la garde coûte un ET).
--
-- La garde `email_sent_at IS NULL` NE COUVRE PAS LES DEUX BRAS DE LA MÊME FAÇON :
--  • SUCCÈS : couverture intégrale — une ligne déjà terminée n'est jamais réécrite, un
--    acquittement tardif est un no-op (v_n = 0).
--  • ÉCHEC : elle n'écarte que les lignes DÉJÀ acquittées en succès. Cas NON COUVERT,
--    assumé : un drain calé au-delà des 10 min de TTL acquitte en échec une ligne qu'un
--    second drain a entre-temps re-réclamée et réellement envoyée mais pas encore
--    acquittée — email_sent_at y est encore NULL, l'échec passe, remet email_claimed_at à
--    NULL, et un TROISIÈME envoi devient possible. Le fermer demanderait un jeton de claim
--    comparé à l'acquittement ; on ne le pose pas parce que c'est le MÊME arbitrage que la
--    fenêtre de panne du claim (perdre un e-mail est pire qu'en envoyer deux), pas un
--    défaut neuf.
CREATE OR REPLACE FUNCTION api.mark_notifications_emailed(p_sent uuid[], p_failed jsonb DEFAULT '[]'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  UPDATE app_notification SET email_sent_at = now(), email_error = NULL
  WHERE id = ANY(COALESCE(p_sent, ARRAY[]::uuid[]))
    AND kind = 'crm_task_assigned' AND email_sent_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE app_notification n
  SET email_error = f.err, email_claimed_at = NULL, email_attempts = n.email_attempts + 1
  FROM (
    SELECT (item->>'id')::uuid AS id, COALESCE(item->>'error', 'send_failed') AS err
    FROM jsonb_array_elements(COALESCE(p_failed, '[]'::jsonb)) item
    WHERE item->>'id' IS NOT NULL
  ) f
  WHERE n.id = f.id AND n.kind = 'crm_task_assigned' AND n.email_sent_at IS NULL;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) TO service_role;
COMMENT ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) IS
  'Acquittement du drain e-mail (17i). Succès = email_sent_at ; échec = email_error + '
  'email_attempts+1 + claim levé (re-réclamable jusqu''à 5 tentatives). Service_role only.';

-- ── 2. Prédicat d'écriture d'une tâche ─────────────────────────────────────────────────
-- MÊME règle que api.save_crm_task (user_can_write_crm sur l'object de la tâche),
-- factorisée pour les routes documents. Tâche inconnue ⇒ false, jamais d'erreur.
CREATE OR REPLACE FUNCTION api.user_can_write_crm_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $$
  SELECT COALESCE(
    (SELECT api.user_can_write_crm(ct.object_id) FROM crm_task ct WHERE ct.id = p_task_id),
    false);
$$;

REVOKE ALL ON FUNCTION api.user_can_write_crm_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_write_crm_task(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION api.user_can_write_crm_task(uuid) IS
  'true si l''appelant peut écrire la tâche (même prédicat que save_crm_task : '
  'user_can_write_crm sur son object). Gate des routes /api/task-document (17i).';

-- ── 3. Pièces jointes de tâche ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_task_document (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES public.crm_task(id)     ON DELETE CASCADE,
  document_id uuid        NOT NULL REFERENCES public.ref_document(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  created_by  uuid                 REFERENCES auth.users(id)          ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, document_id)
);

COMMENT ON TABLE public.crm_task_document IS
  'Pièces jointes d''une tâche CRM (17i). Fichier dans le bucket privé actor-documents '
  '(chemin tasks/{task_id}/…), ref_document access_scope crm_private. Aucun accès '
  'PostgREST direct : écrit par les routes Next /api/task-document en service_role, '
  'lu par api.list_crm_tasks.';

CREATE INDEX IF NOT EXISTS idx_crm_task_document_task
  ON public.crm_task_document (task_id, created_at);

ALTER TABLE public.crm_task_document ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_crm_task_document ON public.crm_task_document;
DROP POLICY IF EXISTS admin_ins_crm_task_document  ON public.crm_task_document;
DROP POLICY IF EXISTS admin_upd_crm_task_document  ON public.crm_task_document;
DROP POLICY IF EXISTS admin_del_crm_task_document  ON public.crm_task_document;

CREATE POLICY admin_read_crm_task_document ON public.crm_task_document FOR SELECT
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_ins_crm_task_document ON public.crm_task_document FOR INSERT
  WITH CHECK ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_upd_crm_task_document ON public.crm_task_document FOR UPDATE
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']))
  WITH CHECK ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
CREATE POLICY admin_del_crm_task_document ON public.crm_task_document FOR DELETE
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));

REVOKE ALL ON TABLE public.crm_task_document FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.crm_task_document TO service_role;

-- ── 4. list_crm_tasks : clé documents[] ────────────────────────────────────────────────
-- COPIE INTÉGRALE du corps canonique 16z (migration_crm_task_multi_assignee_notifications
-- .sql, fonction vérifiée par md5 prosrc↔fichier avant écriture) + la seule clé
-- `documents`, ajoutée après related_interaction_status. Rien d'autre n'est touché : cette
-- fonction est REDÉPLOYÉE, pas réécrite — toute divergence introduite ici écraserait
-- silencieusement 16z.
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
      -- (16z). Valeur de compatibilité = 1er assigné par uuid croissant. Le front ≥16z
      -- lit `assignees`, jamais ces deux clés.
      'owner_id', ct.owner, 'owner_name', p.display_name,
      -- 16z — assignation multiple. Ordre STABLE : nom affiché insensible à la casse puis
      -- uuid (deux homonymes ne peuvent pas permuter d'un appel à l'autre). Jamais NULL.
      'assignees', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'user_id', a.user_id,
                 'display_name', api.crm_user_label(a.user_id, ap.display_name))
               ORDER BY lower(api.crm_user_label(a.user_id, ap.display_name)), a.user_id)
        FROM crm_task_assignee a
        LEFT JOIN app_user_profile ap ON ap.id = a.user_id
        WHERE a.task_id = ct.id), '[]'::jsonb),
      -- 16z — provenance. NULL assumé = créateur inconnu (§A) ; le front affiche
      -- « Créateur inconnu », il ne devine JAMAIS un nom depuis les assignés.
      'created_by_id', ct.created_by,
      'created_by_name', api.crm_user_label(ct.created_by, cp.display_name),
      'related_interaction_id', ct.related_interaction_id,
      'related_interaction_subject', ri.subject,
      'related_interaction_status', ri.status,
      -- 17i — pièces jointes. `[]` jamais null : le front itère, il ne teste pas la
      -- nullité. `id` EST le document_id (la clé que manipulent les routes
      -- /api/task-document et le lien de téléchargement), JAMAIS l'id de la ligne de
      -- liaison : exposer celui-ci obligerait le front à un aller-retour de plus pour
      -- retrouver le fichier, et deux identifiants pour une même pièce jointe finissent
      -- toujours par être confondus. Ordre STABLE (created_at puis id) : deux pièces
      -- déposées dans la même transaction ne peuvent pas permuter d'un appel à l'autre.
      -- `size_bytes` est CASTÉ SOUS GARDE. `ref_document.extra` est un jsonb LIBRE, partagé
      -- avec tous les autres flux documentaires : rien n'y contraint le type de cette clé,
      -- et cette lecture ne peut pas se reposer sur la discipline d'écritures qu'elle ne
      -- contrôle pas. Un cast nu ferait lever `invalid input syntax for type bigint` — non
      -- pas sur la pièce jointe fautive, mais sur api.list_crm_tasks() TOUT ENTIÈRE : UNE
      -- ligne malformée écrite par n'importe quel autre flux abattrait le kanban CRM de
      -- TOUS les utilisateurs du périmètre. Une taille illisible vaut donc `null` (le front
      -- affiche la pièce sans son poids), jamais une panne. La BORNE DE LONGUEUR fait partie
      -- de la garde : `^\d+$` seul laisserait passer « 99999999999999999999 », que `::bigint`
      -- refuserait ensuite en 22003 `value out of range` — au MÊME endroit, avec le MÊME
      -- rayon d'action et la MÊME classe de panne que celle qu'on vient de fermer, à un
      -- chiffre près. `{1,18}` la ferme PAR CONSTRUCTION et non par confiance : 18 chiffres
      -- valent au plus 999 999 999 999 999 999, strictement inférieur au maximum d'un bigint.
      -- Une taille à 19 chiffres ou plus est illisible au même titre qu'un mot : `null`.
      'documents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', d.document_id,
                 'title', d.title,
                 'mime_type', rd.extra->>'mime_type',
                 'size_bytes', CASE WHEN rd.extra->>'size_bytes' ~ '^\d{1,18}$'
                                    THEN (rd.extra->>'size_bytes')::bigint END,
                 'created_at', d.created_at)
               ORDER BY d.created_at, d.id)
        FROM crm_task_document d
        JOIN ref_document rd ON rd.id = d.document_id
        WHERE d.task_id = ct.id), '[]'::jsonb)
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

-- Les droits de 16z sont réaffirmés : CREATE OR REPLACE les conserve, mais un rejeu sur
-- base fraîche où la fonction n'existait pas repartirait du défaut EXECUTE TO PUBLIC.
REVOKE ALL ON FUNCTION api.list_crm_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_tasks() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

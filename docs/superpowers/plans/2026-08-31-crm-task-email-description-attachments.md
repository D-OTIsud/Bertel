# Tâches CRM — e-mail d'assignation, description, pièces jointes : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** À l'assignation d'une tâche CRM, l'assigné reçoit un e-mail (en plus de la notification in-app) ; les tâches gagnent une description saisissable (création + édition) et des pièces jointes (sur tâche existante).

**Architecture :** `app_notification` devient un outbox e-mail drainé par une route Next (`/api/crm/notify-drain`) — le relais SMTP Google n'accepte que l'IP du VPS, donc tout envoi part du serveur Next, jamais de Supabase. Le modal de tâche passe en double mode création/édition. Les pièces jointes clonent le pattern documents d'acteur (bucket privé `actor-documents` + `ref_document` + table de lien + routes Next).

**Tech stack :** Next.js App Router (routes nodejs), Supabase (RPC `api.*` SECURITY DEFINER, service_role), nodemailer, React Query, Jest + RTL.

**Spec :** `docs/superpowers/specs/2026-08-31-crm-task-email-description-attachments-design.md`

## Global Constraints

- Worktree : `C:\Users\dphil\Bertel3.0\.claude\worktrees\crm-task-assignment-email-7ad8e9` — tout se passe ici, branche `claude/crm-task-assignment-email-7ad8e9`.
- **Aucun `client.from('crm_...')` ni `from('app_notification')` côté front** : tables CRM/notification en RLS service_role only, tout passe par RPC `api.*` DEFINER ou routes Next service_role.
- Commits : conventionnels (`feat:`/`fix:`/`test:`/`docs:`), **SANS trailer co-author**, un commit par incrément vérifié vert.
- Commentaires code et libellés UI en **français**, style des fichiers voisins (commentaires denses expliquant le POURQUOI).
- Tests front : `npm run test:run -- <chemin>` (jamais `npm test` = watch). Typecheck : `npm run typecheck`. Les deux depuis `bertel-tourism-ui/`.
- Routes Next testées avec `/** @jest-environment node */` + mocks de `@/lib/supabase-server` et `@supabase/supabase-js` (pattern `src/app/api/admin/invite/route.test.ts`).
- Parsing défensif partout (pattern `services/crm.ts` : une ligne malformée est ignorée, jamais fatale).
- SQL : migration idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE`), RLS ON + REVOKE anon/authenticated sur les tables neuves, RPC outbox réservés service_role. La validation SQL se fait en transaction annulée sur la base LIVE via MCP Supabase (`execute_sql`, `BEGIN; … ; ROLLBACK;`) — **le déploiement réel n'a lieu qu'à la Task 10**.
- Ne PAS modifier `migration_crm_task_multi_assignee_notifications.sql` ni `api_views_functions.sql` : la nouvelle migration porte ses propres `CREATE OR REPLACE`.

---

### Task 0 : Préparer le worktree

**Files :** aucun (setup).

Le worktree n'a **pas** de `node_modules` (vérifié). Recette mémoire « worktree node_modules junction ».

- [ ] **Step 1 : Junction node_modules**

Depuis un cmd Windows (ou PowerShell avec `cmd /c`) :

```bash
cmd /c mklink /J "C:\Users\dphil\Bertel3.0\.claude\worktrees\crm-task-assignment-email-7ad8e9\bertel-tourism-ui\node_modules" "C:\Users\dphil\Bertel3.0\bertel-tourism-ui\node_modules"
```

Attendu : `Junction created for …`.

- [ ] **Step 2 : Baseline verte**

```bash
cd bertel-tourism-ui && npm run typecheck
```

Attendu : exit 0. Puis un test rapide pour prouver que jest tourne :

```bash
npm run test:run -- src/services/notifications.test.ts
```

Attendu : PASS. Si l'un des deux échoue, corriger l'environnement AVANT toute tâche (rien committer).

---

### Task 1 : Migration SQL — outbox e-mail, prédicat tâche, table documents, `list_crm_tasks.documents`

**Files :**
- Create : `Base de donnée DLL et API/migration_crm_task_email_documents.sql`
- Create : `Base de donnée DLL et API/tests/test_crm_task_email_documents.sql`
- Modify : `Base de donnée DLL et API/ci_fresh_apply.sql` (enregistrement en FIN de fichier)

**Interfaces (produit — consommées par Tasks 5, 7, 8, 9) :**
- `api.claim_unmailed_notifications(p_limit integer DEFAULT 20) RETURNS jsonb` — service_role only. Tableau JSON : `[{notification_id, recipient_email, recipient_name, task_title, object_name, due_at, assigner_name}]`. Les lignes sans e-mail destinataire sont terminées (`email_sent_at` + `email_error='no_recipient_email'`) et exclues du retour.
- `api.mark_notifications_emailed(p_sent uuid[], p_failed jsonb DEFAULT '[]') RETURNS integer` — service_role only. `p_failed` = `[{"id": "<uuid>", "error": "<texte>"}]`.
- `api.user_can_write_crm_task(p_task_id uuid) RETURNS boolean` — authenticated.
- Table `public.crm_task_document(id, task_id, document_id, title, created_by, created_at)`.
- `api.list_crm_tasks()` : chaque item gagne `documents: [{id, title, mime_type, size_bytes, created_at}]` (`[]` jamais null ; `id` = `document_id`).

- [ ] **Step 1 : Vérifier la source canonique de `list_crm_tasks`**

La nouvelle migration REDÉPLOIE `api.list_crm_tasks` : il faut partir du corps le PLUS RÉCENT (leçon lot-corrections : md5 prosrc↔fichier avant patch).

```bash
grep -ln "FUNCTION api.list_crm_tasks" "Base de donnée DLL et API"/*.sql
```

Attendu aujourd'hui : `migration_crm_task_multi_assignee_notifications.sql` seul (16z, lignes 555-614). Si un fichier POSTÉRIEUR dans l'ordre de `ci_fresh_apply.sql` la définit aussi, c'est LUI la base. Puis comparer au LIVE via MCP Supabase `execute_sql` :

```sql
SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'api' AND p.proname = 'list_crm_tasks';
```

et confronter au md5 du corps du fichier retenu (extraire le bloc `AS $function$…$function$` et le hasher). **Si drift : STOP, signaler au PO avant d'écrire** — ne jamais écraser un corps live inconnu.

- [ ] **Step 2 : Écrire la migration**

Créer `Base de donnée DLL et API/migration_crm_task_email_documents.sql`. Contenu complet (les `…` du bloc `list_crm_tasks` désignent la COPIE INTÉGRALE du corps canonique vérifié au Step 1, avec la seule addition de la clé `documents`) :

```sql
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 17i — Tâches CRM : outbox e-mail d'assignation + pièces jointes.
-- Spec : docs/superpowers/specs/2026-08-31-crm-task-email-description-attachments-design.md
--
-- 1. app_notification devient un OUTBOX e-mail (email_claimed_at / email_sent_at /
--    email_error). Le drainage est fait par le serveur Next (relais SMTP autorisé par IP
--    du VPS : ni Edge Function ni trigger DB ne peuvent envoyer). Claim TTL 10 min :
--    un crash entre claim et envoi re-rend la ligne réclamable — un e-mail n'est jamais
--    perdu, un doublon n'est possible QUE dans cette fenêtre de panne (assumé).
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

COMMENT ON COLUMN public.app_notification.email_claimed_at IS
  'Réclamation de drainage en cours (TTL 10 min). NULL ou périmée = réclamable.';
COMMENT ON COLUMN public.app_notification.email_sent_at IS
  'Envoi e-mail confirmé (ou ligne terminée sans envoi possible — voir email_error).';
COMMENT ON COLUMN public.app_notification.email_error IS
  'Dernière erreur d''envoi. Diagnostic seulement : ne bloque jamais une re-réclamation.';

-- Le drainage ne balaie que les non-envoyées : index partiel, coût nul à vide.
CREATE INDEX IF NOT EXISTS idx_app_notification_unmailed
  ON public.app_notification (created_at) WHERE email_sent_at IS NULL;

-- Réclame jusqu'à p_limit notifications à e-mailer et retourne TOUT le contenu du message,
-- dérivé en DB (aucune donnée client n'entre jamais dans un e-mail). SKIP LOCKED + fenêtre
-- TTL : deux drains concurrents ne prennent jamais la même ligne. Une ligne dont le
-- destinataire n'a pas d'e-mail est TERMINÉE ici même (email_sent_at + email_error) :
-- elle ne doit pas boucher la file en boucle claim/échec.
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
           'recipient_email', u.email,
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

-- Acquittement du drain. p_failed = [{"id","error"}] : erreur stampée, claim levé —
-- re-réclamable au prochain ping. email_sent_at IS NULL en garde : un acquittement
-- tardif ne réécrit jamais une ligne déjà terminée.
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
  WHERE id = ANY(COALESCE(p_sent, ARRAY[]::uuid[])) AND email_sent_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE app_notification n
  SET email_error = f.err, email_claimed_at = NULL
  FROM (
    SELECT (item->>'id')::uuid AS id, COALESCE(item->>'error', 'send_failed') AS err
    FROM jsonb_array_elements(COALESCE(p_failed, '[]'::jsonb)) item
    WHERE item->>'id' IS NOT NULL
  ) f
  WHERE n.id = f.id AND n.email_sent_at IS NULL;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) TO service_role;
COMMENT ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) IS
  'Acquittement du drain e-mail (17i). Succès = email_sent_at ; échec = email_error + '
  'claim levé (re-réclamable). Service_role only.';

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
-- COPIE INTÉGRALE du corps canonique (16z, vérifié par md5 au déploiement) + la clé
-- `documents` ajoutée après related_interaction_status. `[]` jamais null.
CREATE OR REPLACE FUNCTION api.list_crm_tasks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
-- … corps 16z intégral, avec dans le jsonb_build_object, après
--     'related_interaction_status', ri.status,
-- l'ajout :
--     ,'documents', COALESCE((
--        SELECT jsonb_agg(jsonb_build_object(
--                 'id', d.document_id,
--                 'title', d.title,
--                 'mime_type', rd.extra->>'mime_type',
--                 'size_bytes', (rd.extra->>'size_bytes')::bigint,
--                 'created_at', d.created_at)
--               ORDER BY d.created_at, d.id)
--        FROM crm_task_document d
--        JOIN ref_document rd ON rd.id = d.document_id
--        WHERE d.task_id = ct.id), '[]'::jsonb)
$function$;

NOTIFY pgrst, 'reload schema';
```

**Attention au Step 2** : le bloc `list_crm_tasks` ci-dessus est un GABARIT — dans le fichier réel, recopier le corps ENTIER de 16z (déclarations, scope, SELECT, ORDER BY) et insérer la clé `documents` à l'endroit indiqué. Aucun `…` ne doit subsister dans le fichier livré.

- [ ] **Step 3 : Écrire le test SQL (rouge attendu contre la base actuelle)**

Créer `Base de donnée DLL et API/tests/test_crm_task_email_documents.sql`. Structure : en-tête de manifeste (pattern `test_crm_task_multi_assignee.sql`), `BEGIN;` … `ROLLBACK;`, un seul `DO $$ … $$`. **Fixture : recopier le bloc fixture de `test_crm_task_multi_assignee.sql` lignes 222-261** (rôle publisher, permission `write_crm_notes`, users A/B/C/D avec e-mails `crm17i_*@test.local`, ORG A/B, objets, memberships, permissions) en renommant les préfixes `16z` → `17i` et en déclarant les mêmes variables. Puis les blocs :

```sql
-- A) STRUCTURE
ASSERT (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='app_notification'
          AND column_name IN ('email_claimed_at','email_sent_at','email_error')) = 3,
  'A1: colonnes outbox manquantes';
ASSERT to_regclass('public.crm_task_document') IS NOT NULL, 'A2: crm_task_document absente';
ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.crm_task_document'::regclass),
  'A3: RLS OFF sur crm_task_document';
ASSERT NOT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='crm_task_document'
    AND grantee IN ('anon','authenticated')),
  'A4: grant anon/authenticated interdit sur crm_task_document';
ASSERT to_regprocedure('api.claim_unmailed_notifications(integer)') IS NOT NULL, 'A5';
ASSERT to_regprocedure('api.mark_notifications_emailed(uuid[],jsonb)') IS NOT NULL, 'A6';
ASSERT to_regprocedure('api.user_can_write_crm_task(uuid)') IS NOT NULL, 'A7';

-- B) CLAIM / MARK — persona userA crée une tâche assignée à userC ⇒ 1 notification.
--    (set_config jwt userA + SET LOCAL ROLE authenticated, comme 16z ; puis RESET ROLE
--    pour agir en service : les RPC outbox sont réservés service_role/definer.)
-- B1: claim retourne LA ligne, avec e-mail + libellés dérivés.
--     v_rows := api.claim_unmailed_notifications(20);
--     ASSERT jsonb_array_length(v_rows) = 1 ; recipient_email = 'crm17i_c@test.local' ;
--     task_title / object_name / assigner_name non nuls.
-- B2: re-claim immédiat ⇒ [] (la ligne est réclamée, TTL non expiré).
-- B3: mark p_sent=[id] ⇒ email_sent_at NOT NULL, email_error NULL ; claim ⇒ [].
-- B4: nouvelle notification (userA ré-assigne la tâche à userD) ; claim ⇒ 1 ligne ;
--     mark p_failed=[{id, 'smtp boom'}] ⇒ email_error='smtp boom', email_claimed_at NULL,
--     email_sent_at NULL ; claim ⇒ LA MÊME ligne revient (re-réclamable immédiatement).
-- B5: destinataire sans e-mail — UPDATE auth.users SET email=NULL WHERE id=v_userD ;
--     (re)mettre la notification en attente ; claim ⇒ [] ET la ligne est terminée :
--     email_sent_at NOT NULL, email_error='no_recipient_email'.
-- B6: en persona authenticated, EXECUTE api.claim_unmailed_notifications DOIT échouer
--     (insufficient_privilege) — garde du REVOKE.

-- C) PRÉDICAT user_can_write_crm_task
-- C1: persona userA (write_crm_notes, ORG A) ⇒ true sur la tâche de l'objet A.
-- C2: persona userB (ORG B) ⇒ false sur la même tâche.
-- C3: uuid inconnu ⇒ false (jamais d'erreur).

-- D) DOCUMENTS dans list_crm_tasks
-- D1: en service : INSERT ref_document (url='storage://actor-documents/tasks/x',
--     storage_bucket='actor-documents', storage_path='tasks/<task>/t.pdf',
--     access_scope='crm_private', extra='{"mime_type":"application/pdf","size_bytes":1234}')
--     + INSERT crm_task_document (task_id=v_t, document_id, title='Devis.pdf').
--     Persona userA : list_crm_tasks ⇒ l'item de v_t porte documents[0].title='Devis.pdf',
--     mime_type='application/pdf', size_bytes=1234, id=document_id.
-- D2: une tâche sans document ⇒ 'documents' présent ET = [] (jamais null).
```

Écrire chaque bloc B/C/D en PL/pgSQL complet sur le modèle des blocs C/E de `test_crm_task_multi_assignee.sql` (mêmes idiomes : `PERFORM set_config('request.jwt.claims', …)`, `SET LOCAL ROLE authenticated`, `RESET ROLE`, `ASSERT … , 'message'`).

- [ ] **Step 4 : Rouge — le test échoue contre la base actuelle**

Via MCP Supabase `execute_sql`, envoyer : `BEGIN;` + contenu de `test_crm_task_email_documents.sql` (sans ses propres BEGIN/ROLLBACK s'ils enveloppent déjà) + `ROLLBACK;`.

Attendu : **échec au bloc A** (`A1: colonnes outbox manquantes`) — la base ne porte pas encore 17i. Un test qui passerait ici serait un test qui ne teste rien.

- [ ] **Step 5 : Vert transactionnel — migration + test dans UNE transaction annulée**

Via MCP `execute_sql` : `BEGIN;` + contenu INTÉGRAL de `migration_crm_task_email_documents.sql` (SANS le `NOTIFY pgrst` final, hors transaction de toute façon) + contenu du test + `ROLLBACK;`.

Attendu : aucun ASSERT ne lève, la transaction se termine sur ROLLBACK. La base live reste INTACTE (vérifier : re-jouer le Step 4 ⇒ toujours rouge).

- [ ] **Step 6 : Sabotage de garde (leçon 17g : une garde qu'on n'a pas sabotée n'est pas une garde)**

Rejouer le Step 5 avec DEUX sabotages successifs, chacun devant faire ROUGIR le test :
1. Dans la copie envoyée de la migration, remplacer `interval '10 minutes'` par `interval '0 minutes'` ⇒ B2 doit échouer (le re-claim rend la ligne).
2. Retirer le bloc `UPDATE … no_recipient_email` du claim ⇒ B5 doit échouer.

Attendu : rouge aux deux sabotages. Restaurer la version saine, re-jouer Step 5 ⇒ vert.

- [ ] **Step 7 : Enregistrer dans `ci_fresh_apply.sql`**

À la FIN du fichier (après l'entrée 17g/17h la plus récente), ajouter :

```sql
\echo '== 17i    migration_crm_task_email_documents.sql  (Outbox e-mail d assignation sur app_notification (email_claimed_at/email_sent_at/email_error, claim TTL 10 min SKIP LOCKED, contenu du message 100 % derive en DB, ligne sans e-mail destinataire terminee no_recipient_email) + api.mark_notifications_emailed (succes/echec, echec re-reclamable) — RPC service_role only, draines par la route Next /api/crm/notify-drain (relais SMTP autorise par IP du VPS : jamais d Edge Function). api.user_can_write_crm_task = prédicat d ecriture de tache factorise (meme regle que save_crm_task). Table crm_task_document (pieces jointes, bucket prive actor-documents, RLS service_role only, zero grant anon/authenticated). list_crm_tasks emet documents[] par tache ([] jamais null). APRES 16z (redeploie list_crm_tasks). NOTIFY pgrst requis) =='
\ir migration_crm_task_email_documents.sql
```

- [ ] **Step 8 : Commit**

```bash
git add "Base de donnée DLL et API/migration_crm_task_email_documents.sql" "Base de donnée DLL et API/tests/test_crm_task_email_documents.sql" "Base de donnée DLL et API/ci_fresh_apply.sql"
git commit -m "feat(sql): outbox e-mail d'assignation + crm_task_document + documents[] dans list_crm_tasks (17i, valide en transaction annulee, non deploye)"
```

---

### Task 2 : Description à la création (`CrmTaskModal`)

**Files :**
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaskModal.tsx`
- Create : `bertel-tourism-ui/src/features/crm/CrmTaskModal.test.tsx`

**Interfaces :**
- Consomme : `saveCrmTask({description})` (existant — clé absente = pas de description).
- Produit : champ « Description » (textarea, `aria-label="Description de la tâche"`) — la Task 3 le pré-remplira en édition.

- [ ] **Step 1 : Test rouge**

Créer `CrmTaskModal.test.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTaskModal } from './CrmTaskModal';

jest.mock('../../services/crm', () => ({
  listCrmAssignees: jest.fn().mockResolvedValue([
    { userId: 'u-moi', displayName: 'Moi Même' },
    { userId: 'u-col', displayName: 'Collègue Un' },
  ]),
  saveCrmTask: jest.fn().mockResolvedValue('t-1'),
}));
jest.mock('../../store/session-store', () => ({
  useSessionStore: (selector: (s: { userId: string; demoMode: boolean }) => unknown) =>
    selector({ userId: 'u-moi', demoMode: false }),
}));

import { saveCrmTask } from '../../services/crm';
const mockedSave = jest.mocked(saveCrmTask);

function renderModal(props: Partial<React.ComponentProps<typeof CrmTaskModal>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmTaskModal
        picker="select"
        objectOptions={[{ objectId: 'OBJ1', objectName: 'Hôtel Test' }]}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('CrmTaskModal — description', () => {
  beforeEach(() => mockedSave.mockClear());

  it('envoie la description saisie à la création', async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText('Titre de la tâche'), 'Rappeler le client');
    await userEvent.type(screen.getByLabelText('Description de la tâche'), 'Voir le devis n°42');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedSave.mock.calls[0][0]).toMatchObject({ description: 'Voir le devis n°42' });
  });

  it("n'envoie PAS la clé description quand le champ est vide (création)", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText('Titre de la tâche'), 'Sans description');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedSave.mock.calls[0][0]).not.toHaveProperty('description');
  });
});
```

- [ ] **Step 2 : Rouge**

```bash
npm run test:run -- src/features/crm/CrmTaskModal.test.tsx
```

Attendu : FAIL — `Unable to find a label with the text of: Description de la tâche`.

- [ ] **Step 3 : Implémentation**

Dans `CrmTaskModal.tsx` : ajouter l'état après `title` :

```tsx
const [description, setDescription] = useState('');
```

Le champ, entre Titre et Établissement :

```tsx
<label className="crm-field">
  Description
  <textarea
    aria-label="Description de la tâche"
    placeholder="Décrire la tâche (optionnel)"
    rows={3}
    value={description}
    onChange={(event) => setDescription(event.target.value)}
  />
</label>
```

Dans `createMutation.mutationFn`, ajouter au payload de `saveCrmTask` :

```tsx
// Clé ABSENTE quand vide à la création : ne rien écrire ≠ écrire un effacement.
...(description.trim() ? { description: description.trim() } : {}),
```

- [ ] **Step 4 : Vert + typecheck**

```bash
npm run test:run -- src/features/crm/CrmTaskModal.test.tsx && npm run typecheck
```

Attendu : PASS / exit 0.

- [ ] **Step 5 : Commit**

```bash
git add bertel-tourism-ui/src/features/crm/CrmTaskModal.tsx bertel-tourism-ui/src/features/crm/CrmTaskModal.test.tsx
git commit -m "feat(crm): champ description a la creation de tache"
```

---

### Task 3 : Modal double mode (édition) + crayon sur la carte kanban

**Files :**
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaskModal.tsx`
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaskModal.test.tsx`
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaches.tsx`
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaches.test.tsx`
- Modify : `bertel-tourism-ui/src/services/crm.ts` (branche démo de `saveCrmTask`)

**Interfaces :**
- Produit : `CrmTaskModal` accepte `task?: CrmTask` — mode édition : pré-rempli, établissement en lecture seule, soumet `saveCrmTask({id, title, description, dueAt, assigneeIds})` (description TOUJOURS envoyée, `''` = effacement serveur via NULLIF). La Task 9 accrochera la section documents à ce mode.
- Consomme : `CrmTask` de `types/domain` (dont `assignees[]`), `saveCrmTask` (update partiel par id, existant).

- [ ] **Step 1 : Tests rouges (modal)**

Ajouter à `CrmTaskModal.test.tsx` (le `taskFixture` inclut TOUTES les clés de `CrmTask` ; `documents: []` n'existe pas encore — l'ajouter en Task 7, ici l'objet est typé par ce que `CrmTask` exige aujourd'hui) :

```tsx
const taskFixture = {
  id: 't-9', objectId: 'OBJ1', objectName: 'Hôtel Test',
  actorId: null, actorName: null,
  title: 'Titre initial', description: 'Description initiale',
  status: 'todo' as const, priority: 'medium' as const,
  dueAt: '2026-09-15T00:00:00+00:00', createdAt: '2026-08-01T00:00:00+00:00',
  assignees: [{ userId: 'u-col', displayName: 'Collègue Un' }],
  createdById: 'u-moi', createdByName: 'Moi Même',
  ownerId: null, ownerName: null,
  relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null,
};

describe('CrmTaskModal — édition', () => {
  beforeEach(() => mockedSave.mockClear());

  it('pré-remplit titre, description, échéance, assignés ; établissement en lecture seule', async () => {
    renderModal({ task: taskFixture, objectOptions: [] });
    expect(screen.getByLabelText('Titre de la tâche')).toHaveValue('Titre initial');
    expect(screen.getByLabelText('Description de la tâche')).toHaveValue('Description initiale');
    expect(screen.getByLabelText('Échéance')).toHaveValue('2026-09-15');
    expect(screen.getByText('Hôtel Test')).toBeInTheDocument(); // static, pas un picker
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it("soumet id + description (y compris vidée → '')", async () => {
    renderModal({ task: taskFixture, objectOptions: [] });
    await userEvent.clear(screen.getByLabelText('Description de la tâche'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedSave.mock.calls[0][0]).toMatchObject({
      id: 't-9', title: 'Titre initial', description: '', assigneeIds: ['u-col'],
    });
    expect(mockedSave.mock.calls[0][0]).not.toHaveProperty('objectId'); // jamais de déplacement
  });
});
```

- [ ] **Step 2 : Rouge**

```bash
npm run test:run -- src/features/crm/CrmTaskModal.test.tsx
```

Attendu : FAIL (prop `task` inconnue / valeurs non pré-remplies).

- [ ] **Step 3 : Implémentation modal**

Dans `CrmTaskModal.tsx` :

1. Props : ajouter `task?: CrmTask;` (import `type { CrmTask }` depuis `../../types/domain`), avec docstring : « Mode ÉDITION : tâche existante pré-remplie, établissement verrouillé (le serveur accepterait un déplacement mais on ne l'offre pas), soumission par `saveCrmTask({id,…})` — la description est TOUJOURS envoyée (`''` = effacement, NULLIF serveur). »
2. Initialisations :

```tsx
const [title, setTitle] = useState(task?.title ?? '');
const [description, setDescription] = useState(task?.description ?? '');
const [objectId, setObjectId] = useState(() => {
  if (task) return task.objectId;
  if (fixedObject) return fixedObject.objectId;
  return picker === 'select' && objectOptions.length === 1 ? objectOptions[0].objectId : '';
});
const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.slice(0, 10) : '');
const [pickedAssignees, setPickedAssignees] = useState<string[] | null>(
  task ? task.assignees.map((assignee) => assignee.userId) : null,
);
```

3. Mutation :

```tsx
mutationFn: () => {
  if (task) {
    return saveCrmTask({
      id: task.id,
      title: title.trim(),
      // TOUJOURS envoyée en édition : '' = effacement explicite (NULLIF serveur).
      description: description.trim(),
      dueAt: dueAt || null,
      assigneeIds: selectedAssignees,
    });
  }
  /* branche création existante inchangée (avec la clé description conditionnelle) */
},
```

4. `canSubmit` : `resolvedObject` requis SEULEMENT en création :

```tsx
const canSubmit =
  Boolean(title.trim()) &&
  (Boolean(task) || Boolean(resolvedObject)) &&
  selectedAssignees.length > 0 &&
  !createMutation.isPending;
```

5. Rendu : titre `task ? 'Modifier la tâche' : …existant…` ; bouton `task ? 'Enregistrer' : 'Créer'` ; champ Établissement — étendre la branche statique :

```tsx
{task || fixedObject ? (
  <span className="crm-field__static">{task ? task.objectName : fixedObject!.objectName}</span>
) : ( /* SearchSelect existant */ )}
```

- [ ] **Step 4 : Vert modal**

```bash
npm run test:run -- src/features/crm/CrmTaskModal.test.tsx
```

- [ ] **Step 5 : Test rouge kanban (crayon)**

Dans `CrmTaches.test.tsx`, ajouter au describe existant (réutiliser le harness de rendu du fichier — QueryClientProvider + mocks services déjà en place) :

```tsx
it('ouvre le modal d’édition pré-rempli depuis le bouton crayon de la carte', async () => {
  renderTaches(); // helper existant du fichier
  const edit = await screen.findByRole('button', { name: /Modifier « .+ »/ });
  await userEvent.click(edit);
  expect(await screen.findByRole('heading', { name: 'Modifier la tâche' })).toBeInTheDocument();
});
```

(Adapter `renderTaches`/le nom du helper à ce que le fichier utilise réellement ; le `name` du heading correspond au titre du `CrmModal`.)

- [ ] **Step 6 : Implémentation kanban**

Dans `CrmTaches.tsx` :

1. Import `Pencil` depuis lucide-react.
2. État : `const [editTaskId, setEditTaskId] = useState<string | null>(null);` et dérivation APRÈS `tasks` :

```tsx
// L'id et non l'objet : après invalidation, le modal reçoit la tâche FRAÎCHE (documents
// à jour en Task 9) sans réinitialiser la saisie en cours (les useState ne rejouent pas).
const editTask = editTaskId ? tasks.find((task) => task.id === editTaskId) ?? null : null;
```

3. Dans `ticket__actions`, AVANT les boutons de statut :

```tsx
<button
  type="button"
  className="crm-btn sm"
  aria-label={`Modifier « ${task.title} »`}
  disabled={!canWrite}
  title={canWrite ? undefined : CRM_READ_ONLY_REASON}
  onClick={() => setEditTaskId(task.id)}
>
  <Pencil size={12} aria-hidden />
</button>
```

4. Montage, à côté du modal de création :

```tsx
{editTask && canWrite && (
  <CrmTaskModal
    task={editTask}
    picker="datalist"
    objectOptions={[]}
    onClose={() => setEditTaskId(null)}
    onSaved={() => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] })}
  />
)}
```

5. Branche démo de `saveCrmTask` (`services/crm.ts`) — refléter l'édition comme le move :

```tsx
if (input.id) {
  const task = mockCrmTasks.find((t) => t.id === input.id);
  if (task) {
    if (input.status) task.status = input.status;
    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description || null;
    if (input.dueAt !== undefined) task.dueAt = input.dueAt;
  }
}
```

- [ ] **Step 7 : Vert complet + typecheck**

```bash
npm run test:run -- src/features/crm/CrmTaskModal.test.tsx src/features/crm/CrmTaches.test.tsx src/services/crm.test.ts && npm run typecheck
```

- [ ] **Step 8 : Commit**

```bash
git add bertel-tourism-ui/src/features/crm/CrmTaskModal.tsx bertel-tourism-ui/src/features/crm/CrmTaskModal.test.tsx bertel-tourism-ui/src/features/crm/CrmTaches.tsx bertel-tourism-ui/src/features/crm/CrmTaches.test.tsx bertel-tourism-ui/src/services/crm.ts
git commit -m "feat(crm): edition de tache (modal double mode + crayon kanban)"
```

---

### Task 4 : Template e-mail `TaskAssignedEmail`

**Files :**
- Create : `bertel-tourism-ui/src/emails/TaskAssignedEmail.ts`
- Create : `bertel-tourism-ui/src/emails/TaskAssignedEmail.test.ts`

**Interfaces (produit — consommé par Task 5) :**

```ts
export interface TaskAssignedEmailData {
  taskTitle: string;
  objectName: string;
  dueAt: string | null;        // ISO ; null = pas d'échéance
  assignerName: string | null; // null = assignateur inconnu
  appUrl: string;              // lien absolu vers /crm
}
export function taskAssignedEmailSubject(data: TaskAssignedEmailData): string;
export function renderTaskAssignedEmailHtml(data: TaskAssignedEmailData): string;
```

- [ ] **Step 1 : Test rouge**

```ts
import { renderTaskAssignedEmailHtml, taskAssignedEmailSubject } from './TaskAssignedEmail';

const base = {
  taskTitle: 'Rappeler le client',
  objectName: 'Hôtel des Palmes',
  dueAt: '2026-09-15T00:00:00+00:00',
  assignerName: 'Marie Payet',
  appUrl: 'https://app.example.re/crm',
};

describe('TaskAssignedEmail', () => {
  it('sujet = Nouvelle tâche : {titre} — {établissement}', () => {
    expect(taskAssignedEmailSubject(base)).toBe('Nouvelle tâche : Rappeler le client — Hôtel des Palmes');
  });

  it('corps : titre, établissement, échéance formatée, assignateur, lien /crm', () => {
    const html = renderTaskAssignedEmailHtml(base);
    expect(html).toContain('Rappeler le client');
    expect(html).toContain('Hôtel des Palmes');
    expect(html).toContain('15/09/2026');
    expect(html).toContain('Marie Payet');
    expect(html).toContain('https://app.example.re/crm');
  });

  it('échappe le HTML injecté et affiche les replis (— / équipe)', () => {
    const html = renderTaskAssignedEmailHtml({
      ...base, taskTitle: '<b>xss</b>', dueAt: null, assignerName: null,
    });
    expect(html).not.toContain('<b>xss</b>');
    expect(html).toContain('&lt;b&gt;xss&lt;/b&gt;');
    expect(html).toContain('Sans échéance');
    expect(html).toContain('votre équipe');
  });
});
```

- [ ] **Step 2 : Rouge**

```bash
npm run test:run -- src/emails/TaskAssignedEmail.test.ts
```

Attendu : FAIL (module inexistant).

- [ ] **Step 3 : Implémentation**

`src/emails/TaskAssignedEmail.ts` — même doctrine que `ListEmail.tsx` (HTML tableaux, styles 100 % inline, ≤ 640px, `escapeHtml` sur TOUTE donnée) :

```ts
// TaskAssignedEmail — e-mail « une tâche vous a été confiée » (drainé par
// /api/crm/notify-drain). Même doctrine que ListEmail : HTML basé tableaux, styles
// inline, escapeHtml sur toute donnée dérivée de la DB. AUCUNE donnée client n'entre
// jamais ici : tout vient de api.claim_unmailed_notifications.
import { escapeHtml } from '@/lib/safe-output';

export interface TaskAssignedEmailData {
  taskTitle: string;
  objectName: string;
  dueAt: string | null;
  assignerName: string | null;
  appUrl: string;
}

export function taskAssignedEmailSubject(data: TaskAssignedEmailData): string {
  return `Nouvelle tâche : ${data.taskTitle} — ${data.objectName}`;
}

function formatDueDate(iso: string | null): string {
  if (!iso) return 'Sans échéance';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sans échéance';
  return date.toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' });
}

export function renderTaskAssignedEmailHtml(data: TaskAssignedEmailData): string {
  const assigner = data.assignerName
    ? `Confiée par ${escapeHtml(data.assignerName)}`
    : 'Confiée par votre équipe';
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f5f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:22px 26px 8px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0e7a6f;">Nouvelle tâche</div>
    <div style="font-size:20px;font-weight:800;color:#2d2a2a;margin-top:6px;">${escapeHtml(data.taskTitle)}</div>
    <div style="font-size:14px;color:#5b5754;margin-top:4px;">${escapeHtml(data.objectName)}</div>
  </td></tr>
  <tr><td style="padding:10px 26px 0;">
    <div style="font-size:13px;color:#5b5754;">Échéance : <strong style="color:#2d2a2a;">${escapeHtml(formatDueDate(data.dueAt))}</strong></div>
    <div style="font-size:13px;color:#5b5754;margin-top:4px;">${assigner}</div>
  </td></tr>
  <tr><td style="padding:20px 26px 26px;">
    <a href="${escapeHtml(data.appUrl)}" style="display:inline-block;background:#0e7a6f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 20px;">Voir mes tâches</a>
    <div style="font-size:11px;color:#8a857f;margin-top:14px;">Vous recevez cet e-mail parce qu'une tâche vous a été attribuée dans le CRM.</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
```

- [ ] **Step 4 : Vert + typecheck**

```bash
npm run test:run -- src/emails/TaskAssignedEmail.test.ts && npm run typecheck
```

- [ ] **Step 5 : Commit**

```bash
git add bertel-tourism-ui/src/emails/TaskAssignedEmail.ts bertel-tourism-ui/src/emails/TaskAssignedEmail.test.ts
git commit -m "feat(crm): template e-mail d'assignation de tache"
```

---

### Task 5 : `sendMail` générique + route `/api/crm/notify-drain`

**Files :**
- Modify : `bertel-tourism-ui/src/lib/mail.server.ts`
- Create : `bertel-tourism-ui/src/app/api/crm/notify-drain/route.ts`
- Create : `bertel-tourism-ui/src/app/api/crm/notify-drain/route.test.ts`

**Interfaces :**
- Consomme : `api.claim_unmailed_notifications` / `api.mark_notifications_emailed` (Task 1), `renderTaskAssignedEmailHtml` / `taskAssignedEmailSubject` (Task 4), `readSmtpConfig` (`@/lib/env.server`, existant).
- Produit : `sendMail(opts: {to; subject; html}): Promise<void>` (alias conservé `sendListEmail`) ; `POST /api/crm/notify-drain` → `{sent: number, failed: number}` (200), 401 sans Bearer valide, 503 `smtp_not_configured` SANS claim, 500 `claim_failed`.

- [ ] **Step 1 : Généraliser le helper mail**

Dans `mail.server.ts` : renommer la fonction en `sendMail` (docstring : « Envoi d'un e-mail métier — listes, notifications CRM… ») et conserver la compat :

```ts
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> { /* corps existant inchangé */ }
/** Alias historique (routes listes) — même fonction. */
export const sendListEmail = sendMail;
```

- [ ] **Step 2 : Test rouge de la route**

`route.test.ts` (pattern `admin/invite/route.test.ts`) :

```ts
/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/mail.server', () => ({
  sendMail: jest.fn(),
  MailNotConfiguredError: class MailNotConfiguredError extends Error {},
}));
jest.mock('@/lib/env.server', () => ({ readSmtpConfig: jest.fn() }));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { sendMail } from '@/lib/mail.server';
import { readSmtpConfig } from '@/lib/env.server';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedSend = jest.mocked(sendMail);
const mockedSmtp = jest.mocked(readSmtpConfig);

const smtpOk = { host: 'smtp', port: 587, secure: false, user: null, pass: null, fromName: 'Bertel', fromEmail: 'no-reply@x' };

function req(headers: Record<string, string>): never {
  return {
    headers: new Headers(headers),
    nextUrl: { origin: 'https://app.test' },
  } as never;
}

function serverWith(rpc: jest.Mock) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    schema: () => ({ rpc }),
  } as never;
}

const row = (id: string, email: string | null = 'dest@x.re') => ({
  notification_id: id, recipient_email: email, recipient_name: 'Dest',
  task_title: 'Tâche', object_name: 'Hôtel', due_at: null, assigner_name: 'Chef',
});

describe('POST /api/crm/notify-drain', () => {
  beforeEach(() => { jest.clearAllMocks(); mockedSmtp.mockReturnValue(smtpOk as never); });

  it('401 sans Bearer', async () => {
    mockedServer.mockReturnValue(serverWith(jest.fn()));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it('503 SMTP absent — et ne réclame RIEN (le TTL ne doit pas être consommé pour rien)', async () => {
    mockedSmtp.mockReturnValue(null);
    const rpc = jest.fn();
    mockedServer.mockReturnValue(serverWith(rpc));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('draine : claim → envoi par ligne → acquittement p_sent', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [row('n-1'), row('n-2')], error: null }) // claim
      .mockResolvedValueOnce({ data: 2, error: null });                      // mark
    mockedServer.mockReturnValue(serverWith(rpc));
    mockedSend.mockResolvedValue();
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: 2, failed: 0 });
    expect(mockedSend).toHaveBeenCalledTimes(2);
    expect(mockedSend.mock.calls[0][0].to).toBe('dest@x.re');
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_notifications_emailed',
      { p_sent: ['n-1', 'n-2'], p_failed: [] });
  });

  it('un envoi qui échoue part en p_failed avec son message', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [row('n-1'), row('n-2')], error: null })
      .mockResolvedValueOnce({ data: 1, error: null });
    mockedServer.mockReturnValue(serverWith(rpc));
    mockedSend.mockResolvedValueOnce().mockRejectedValueOnce(new Error('smtp boom'));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    await expect(res.json()).resolves.toEqual({ sent: 1, failed: 1 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_notifications_emailed',
      { p_sent: ['n-1'], p_failed: [{ id: 'n-2', error: 'smtp boom' }] });
  });

  it('file vide : 200 {sent:0,failed:0} sans acquittement', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: [], error: null });
    mockedServer.mockReturnValue(serverWith(rpc));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    await expect(res.json()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3 : Rouge**

```bash
npm run test:run -- src/app/api/crm/notify-drain/route.test.ts
```

- [ ] **Step 4 : Implémentation route**

`src/app/api/crm/notify-drain/route.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { sendMail } from '@/lib/mail.server';
import { readSmtpConfig } from '@/lib/env.server';
import {
  renderTaskAssignedEmailHtml,
  taskAssignedEmailSubject,
  type TaskAssignedEmailData,
} from '@/emails/TaskAssignedEmail';

// Drainage de l'outbox e-mail d'assignation (17i). N'importe quel utilisateur CONNECTÉ
// peut pinger : le corps de requête est IGNORÉ — la route ne fait que déclencher l'envoi
// de messages dont destinataires et contenu sont 100 % dérivés en DB par
// api.claim_unmailed_notifications (⇒ pas de vecteur spam/relais). SMTP absent ⇒ 503
// SANS réclamer : consommer le TTL sans pouvoir envoyer retarderait le vrai drain.
export const runtime = 'nodejs';

type Rec = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nstr = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (!readSmtpConfig()) return NextResponse.json({ error: 'smtp_not_configured' }, { status: 503 });

  const { data, error } = await server.schema('api').rpc('claim_unmailed_notifications', { p_limit: 20 });
  if (error) return NextResponse.json({ error: 'claim_failed', detail: error.message }, { status: 500 });

  const rows = Array.isArray(data) ? data : [];
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || req.nextUrl.origin;
  const sent: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Envois séquentiels : volumes faibles, et le relais n'aime pas les rafales.
  for (const raw of rows) {
    const row = (raw ?? {}) as Rec;
    const id = str(row.notification_id);
    const to = str(row.recipient_email);
    // Ligne malformée ou sans e-mail (le claim les termine normalement lui-même) :
    // on la SAUTE — le claim la re-traitera, jamais de boucle d'erreur ici.
    if (!id || !to) continue;
    const emailData: TaskAssignedEmailData = {
      taskTitle: str(row.task_title) || 'Tâche',
      objectName: str(row.object_name) || 'Établissement',
      dueAt: nstr(row.due_at),
      assignerName: nstr(row.assigner_name),
      appUrl: `${origin}/crm`,
    };
    try {
      await sendMail({
        to,
        subject: taskAssignedEmailSubject(emailData),
        html: renderTaskAssignedEmailHtml(emailData),
      });
      sent.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : 'send_failed' });
    }
  }

  if (sent.length > 0 || failed.length > 0) {
    await server.schema('api').rpc('mark_notifications_emailed', { p_sent: sent, p_failed: failed });
  }
  return NextResponse.json({ sent: sent.length, failed: failed.length });
}
```

- [ ] **Step 5 : Vert + non-régression listes + typecheck**

```bash
npm run test:run -- src/app/api/crm/notify-drain/route.test.ts src/app/api/lists && npm run typecheck
```

(La suite `lists` prouve que l'alias `sendListEmail` n'a rien cassé.)

- [ ] **Step 6 : Commit**

```bash
git add bertel-tourism-ui/src/lib/mail.server.ts bertel-tourism-ui/src/app/api/crm/notify-drain
git commit -m "feat(crm): route de drainage de l'outbox e-mail d'assignation"
```

---

### Task 6 : Ping fire-and-forget après assignation

**Files :**
- Modify : `bertel-tourism-ui/src/services/crm.ts`
- Modify : `bertel-tourism-ui/src/services/crm.test.ts`

**Interfaces :**
- Consomme : `POST /api/crm/notify-drain` (Task 5), `getSupabaseClient` (existant).
- Produit : après un `saveCrmTask` réussi **dont l'input portait `assigneeIds`**, un `fetch` fire-and-forget (échec avalé). Jamais en mode démo (le chemin démo sort avant).

- [ ] **Step 1 : Test rouge**

Dans `crm.test.ts`, ajouter (adapter les noms des mocks au harness EXISTANT du fichier — il mocke déjà `../lib/supabase` ; étendre ce mock avec `getSupabaseClient` si absent) :

```ts
describe('saveCrmTask — ping notify-drain', () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    fetchMock.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
    // getSupabaseClient().auth.getSession() → un access_token de test.
    // (via le mock module ../lib/supabase du fichier)
  });

  it('ping le drain après un save AVEC assigneeIds', async () => {
    // arranger le mock rpc pour rendre { id: 't-1' }
    await saveCrmTask({ objectId: 'OBJ1', title: 'T', assigneeIds: ['u-col'] });
    await new Promise((resolve) => setTimeout(resolve, 0)); // laisse partir le void
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/notify-drain', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer .+/) }),
    }));
  });

  it('NE ping PAS un save sans assigneeIds (drag & drop statut seul)', async () => {
    await saveCrmTask({ id: 't-1', status: 'done' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Rouge**

```bash
npm run test:run -- src/services/crm.test.ts
```

- [ ] **Step 3 : Implémentation**

Dans `crm.ts`, sous `saveCrmTask` :

```ts
/**
 * Ping fire-and-forget du drain e-mail (17i). L'échec est AVALÉ à dessein : la
 * notification reste dans l'outbox et le prochain ping (de n'importe qui) la ramasse —
 * un e-mail n'est jamais perdu, et l'écriture de la tâche n'attend jamais le SMTP.
 */
async function pingNotifyDrain(): Promise<void> {
  try {
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/crm/notify-drain', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // fire-and-forget : rien à faire, l'outbox rattrape.
  }
}
```

Et dans `saveCrmTask`, juste avant le `return id;` final (APRÈS le succès RPC — donc jamais en démo ni sur erreur) :

```ts
// Une écriture d'assignation vient peut-être de créer des notifications : on déclenche
// le drain. Clé `assigneeIds` absente (drag & drop) = aucune assignation possible = pas
// de ping. Le drain traite TOUTE la file, pas seulement cette tâche (filet de rattrapage).
if (input.assigneeIds !== undefined) void pingNotifyDrain();
```

- [ ] **Step 4 : Vert + typecheck**

```bash
npm run test:run -- src/services/crm.test.ts && npm run typecheck
```

- [ ] **Step 5 : Commit**

```bash
git add bertel-tourism-ui/src/services/crm.ts bertel-tourism-ui/src/services/crm.test.ts
git commit -m "feat(crm): ping fire-and-forget du drain e-mail apres assignation"
```

---

### Task 7 : Types + parsing `documents[]` + service `task-documents`

**Files :**
- Modify : `bertel-tourism-ui/src/types/domain.ts`
- Modify : `bertel-tourism-ui/src/services/crm.ts` + `crm.test.ts`
- Modify : `bertel-tourism-ui/src/data/mock.ts` (chaque tâche mock gagne `documents: []`)
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaskModal.test.tsx` (`taskFixture` gagne `documents: []`)
- Create : `bertel-tourism-ui/src/services/task-documents.ts`

**Interfaces (produit — consommé par Tasks 8, 9) :**

```ts
// types/domain.ts
export interface CrmTaskDocument {
  id: string;                 // = crm_task_document.document_id (sert aux routes url/delete)
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
}
// CrmTask gagne : documents: CrmTaskDocument[];

// services/task-documents.ts
export async function uploadTaskDocument(input: { taskId: string; file: File; accessToken: string }): Promise<{ documentId: string; title: string }>;
export async function getTaskDocumentUrl(input: { taskId: string; documentId: string; accessToken: string }): Promise<string>;
export async function deleteTaskDocument(input: { taskId: string; documentId: string; accessToken: string }): Promise<void>;
```

- [ ] **Step 1 : Test rouge parsing**

Dans `crm.test.ts` :

```ts
describe('parseCrmTask — documents', () => {
  it('parse les documents et ignore les entrées sans id', () => {
    const task = parseCrmTask({
      id: 't-1', object_id: 'OBJ1', object_name: 'Hôtel', title: 'T',
      documents: [
        { id: 'd-1', title: 'Devis.pdf', mime_type: 'application/pdf', size_bytes: 1234, created_at: '2026-08-31T00:00:00Z' },
        { title: 'sans-id-ignoré' },
        'malformé',
      ],
    });
    expect(task.documents).toEqual([
      { id: 'd-1', title: 'Devis.pdf', mimeType: 'application/pdf', sizeBytes: 1234, createdAt: '2026-08-31T00:00:00Z' },
    ]);
  });

  it('clé absente ou malformée ⇒ []', () => {
    expect(parseCrmTask({ id: 't-1' }).documents).toEqual([]);
    expect(parseCrmTask({ id: 't-1', documents: 'nope' }).documents).toEqual([]);
  });
});
```

- [ ] **Step 2 : Rouge**

```bash
npm run test:run -- src/services/crm.test.ts
```

- [ ] **Step 3 : Implémentation**

1. `types/domain.ts` : ajouter `CrmTaskDocument` (docstring : « Pièce jointe d'une tâche (17i). `id` = document_id — c'est LUI que consomment les routes /api/task-document. ») et `documents: CrmTaskDocument[];` dans `CrmTask` (jamais null).
2. `services/crm.ts` :

```ts
/** `documents` (17i) — tolérant : absent/null/malformé ⇒ []. Une entrée sans id est ignorée. */
export function parseCrmTaskDocuments(value: unknown): CrmTaskDocument[] {
  if (!Array.isArray(value)) return [];
  const documents: CrmTaskDocument[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const record = row as GenericRecord;
    const id = readNullableString(record.id);
    if (!id) continue;
    documents.push({
      id,
      title: readString(record.title),
      mimeType: readNullableString(record.mime_type),
      sizeBytes: typeof record.size_bytes === 'number' ? record.size_bytes : null,
      createdAt: readNullableString(record.created_at),
    });
  }
  return documents;
}
```

et dans `parseCrmTask` : `documents: parseCrmTaskDocuments(record.documents),` (import type `CrmTaskDocument`).
3. `data/mock.ts` : ajouter `documents: []` à chaque tâche de `mockCrmTasks` ; `CrmTaskModal.test.tsx` : ajouter `documents: []` au `taskFixture` (le typecheck l'exige).
4. `services/task-documents.ts` — clone exact d'`actor-documents.ts` avec les endpoints `/api/task-document` :

```ts
import { apiError } from './api-error';

export interface TaskDocumentActionInput {
  taskId: string;
  documentId: string;
  accessToken: string;
}

export async function uploadTaskDocument(input: {
  taskId: string;
  file: File;
  accessToken: string;
}): Promise<{ documentId: string; title: string }> {
  const body = new FormData();
  body.append('task_id', input.taskId);
  body.append('file', input.file);
  const response = await fetch('/api/task-document', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body,
  });
  return readResponse(response);
}

export async function getTaskDocumentUrl(input: TaskDocumentActionInput): Promise<string> {
  const response = await fetch('/api/task-document/url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: input.taskId, documentId: input.documentId }),
  });
  const payload = await readResponse<{ url: string }>(response);
  return payload.url;
}

export async function deleteTaskDocument(input: TaskDocumentActionInput): Promise<void> {
  const response = await fetch('/api/task-document', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: input.taskId, documentId: input.documentId }),
  });
  await readResponse(response);
}

/** Helper mutualisé (même recette qu'actor-documents) : le corriger corrige les trois. */
async function readResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await apiError(response);
  }
  return await response.json() as T;
}
```

- [ ] **Step 4 : Vert + typecheck (toute l'app compile avec le champ neuf)**

```bash
npm run test:run -- src/services/crm.test.ts src/features/crm/CrmTaskModal.test.tsx && npm run typecheck
```

- [ ] **Step 5 : Commit**

```bash
git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/services/crm.ts bertel-tourism-ui/src/services/crm.test.ts bertel-tourism-ui/src/data/mock.ts bertel-tourism-ui/src/features/crm/CrmTaskModal.test.tsx bertel-tourism-ui/src/services/task-documents.ts
git commit -m "feat(crm): documents[] dans le contrat de tache + service task-documents"
```

---

### Task 8 : Routes `/api/task-document` (upload, URL signée, delete)

**Files :**
- Create : `bertel-tourism-ui/src/app/api/task-document/route.ts`
- Create : `bertel-tourism-ui/src/app/api/task-document/url/route.ts`
- Create : `bertel-tourism-ui/src/app/api/task-document/route.test.ts`

**Interfaces :**
- Consomme : `api.user_can_write_crm_task` (Task 1), `processActorDocumentBuffer` (import depuis `../actor-document/process-actor-document` — pipeline partagé, PAS de copie), bucket `actor-documents`, tables `ref_document` + `crm_task_document`.
- Produit : `POST` multipart `{task_id, file}` → 201 `{documentId, title}` ; `POST /url` `{taskId, documentId}` → `{url}` (signée 60 s) ; `DELETE` `{taskId, documentId}` → `{deleted: true}`. 403 si `user_can_write_crm_task` ≠ true. Rollback en cascade sur échec partiel (même recette qu'actor-document).

- [ ] **Step 1 : Test rouge**

`route.test.ts` :

```ts
/** @jest-environment node */
import { POST, DELETE } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../actor-document/process-actor-document', () => ({
  processActorDocumentBuffer: jest.fn().mockResolvedValue({
    buffer: Buffer.from('pdf'), mimeType: 'application/pdf', extension: 'pdf',
  }),
}));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const TASK_ID = '11111111-2222-3333-4444-555555555555';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

function callerCan(can: boolean) {
  mockedCreate.mockReturnValue({
    schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: can, error: null }) }),
  } as never);
}

function baseServer(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    ...overrides,
  } as never;
}

function multipartReq(taskId: string) {
  const form = new FormData();
  form.append('task_id', taskId);
  form.append('file', new File([Buffer.from('%PDF-x')], 'Devis.pdf', { type: 'application/pdf' }));
  return {
    headers: new Headers({ authorization: 'Bearer jwt' }),
    formData: async () => form,
  } as never;
}

describe('/api/task-document', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 quand user_can_write_crm_task est faux', async () => {
    mockedServer.mockReturnValue(baseServer());
    callerCan(false);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(403);
  });

  it('upload heureux : storage + ref_document + crm_task_document → 201', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const insertDoc = jest.fn().mockReturnValue({
      select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: DOC_ID }, error: null }) }),
    });
    const insertLink = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ upload, remove: jest.fn() }) },
      from: (table: string) => (table === 'ref_document' ? { insert: insertDoc } : { insert: insertLink }),
    }));
    callerCan(true);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ documentId: DOC_ID, title: 'Devis.pdf' });
    expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^tasks/${TASK_ID}/`));
    expect(insertLink.mock.calls[0][0]).toMatchObject({ task_id: TASK_ID, document_id: DOC_ID, created_by: 'u-1' });
  });

  it('échec du lien ⇒ rollback ref_document + storage, 500', async () => {
    const removed = jest.fn();
    const delDoc = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ upload: jest.fn().mockResolvedValue({ error: null }), remove: removed }) },
      from: (table: string) => (table === 'ref_document'
        ? {
            insert: jest.fn().mockReturnValue({
              select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: DOC_ID }, error: null }) }),
            }),
            delete: delDoc,
          }
        : { insert: jest.fn().mockResolvedValue({ error: { message: 'boom' } }) }),
    }));
    callerCan(true);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(500);
    expect(delDoc).toHaveBeenCalled();
    expect(removed).toHaveBeenCalled();
  });

  it('DELETE supprime storage puis ref_document (le lien tombe par cascade FK)', async () => {
    const removed = jest.fn().mockResolvedValue({ error: null });
    const maybeLink = jest.fn().mockResolvedValue({ data: { document_id: DOC_ID }, error: null });
    const maybeDoc = jest.fn().mockResolvedValue({
      data: { storage_bucket: 'actor-documents', storage_path: `tasks/${TASK_ID}/x.pdf` }, error: null,
    });
    const delDoc = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ remove: removed }) },
      from: (table: string) => (table === 'crm_task_document'
        ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: maybeLink }) }) }) }
        : { select: () => ({ eq: () => ({ maybeSingle: maybeDoc }) }), delete: delDoc }),
    }));
    callerCan(true);
    const res = await DELETE({
      headers: new Headers({ authorization: 'Bearer jwt' }),
      json: async () => ({ taskId: TASK_ID, documentId: DOC_ID }),
    } as never);
    expect(res.status).toBe(200);
    expect(removed).toHaveBeenCalledWith([`tasks/${TASK_ID}/x.pdf`]);
    expect(delDoc).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Rouge**

```bash
npm run test:run -- src/app/api/task-document/route.test.ts
```

- [ ] **Step 3 : Implémentation**

`route.ts` — même squelette qu'`actor-document/route.ts` (fonctions `bearer`, `callerClient`, `authenticated` recopiées à l'identique — elles sont module-locales là-bas) avec :

```ts
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { MediaProcessingError } from '../media/upload/process-image';
import { processActorDocumentBuffer } from '../actor-document/process-actor-document';

// Pièces jointes de TÂCHE CRM (17i) — clone du modèle actor-document : Bearer → getUser,
// autorisation par RPC DEFINER « en tant qu'appelant » (jamais la service key), fichier
// dans le bucket privé actor-documents sous tasks/{taskId}/, ref_document crm_private,
// lien crm_task_document, rollback en cascade sur échec partiel. Le gate est le prédicat
// d'ÉCRITURE (user_can_write_crm_task) pour les trois verbes : toutes les surfaces
// documents vivent derrière le modal d'édition, lui-même gated écriture.
const PRIVATE_BUCKET = 'actor-documents';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';
```

`authorizeTask` :

```ts
async function authorizeTask(jwt: string, taskId: string): Promise<boolean> {
  const { data, error } = await callerClient(jwt).schema('api').rpc(
    'user_can_write_crm_task', { p_task_id: taskId });
  return !error && data === true;
}
```

`POST` : lire `task_id` + `file` du multipart (shapes : `UUID_SHAPE.test(taskId)`, `file instanceof File`), gate `authorizeTask`, `processActorDocumentBuffer`, chemin `tasks/${taskId}/${randomUUID()}.${processed.extension}`, upload bucket `PRIVATE_BUCKET`, insert `ref_document` (`url: storage://…`, `title: file.name.trim() || 'Document de tâche'`, `storage_bucket`, `storage_path`, `access_scope: 'crm_private'`, `extra: { mime_type, size_bytes }`), insert `crm_task_document` (`task_id`, `document_id`, `title`, `created_by: auth.userId`) ; rollback : échec `ref_document` ⇒ remove storage ; échec lien ⇒ delete `ref_document` + remove storage ; gestion `MediaProcessingError` (413/415/400) identique à actor-document.

`DELETE` : body `{taskId, documentId}` (shapes), gate `authorizeTask`, vérifier le lien dans `crm_task_document` (404 sinon), lire `ref_document.storage_bucket/storage_path`, `storage.remove`, `ref_document.delete` (le lien tombe par FK CASCADE), `{deleted: true}`.

`url/route.ts` — clone d'`actor-document/url/route.ts` : body `{taskId, documentId}`, gate `user_can_write_crm_task` en tant qu'appelant, lien vérifié dans `crm_task_document`, `createSignedUrl(path, 60)` → `{url}`.

- [ ] **Step 4 : Vert + typecheck**

```bash
npm run test:run -- src/app/api/task-document/route.test.ts && npm run typecheck
```

- [ ] **Step 5 : Commit**

```bash
git add bertel-tourism-ui/src/app/api/task-document
git commit -m "feat(crm): routes upload/url/suppression des pieces jointes de tache"
```

---

### Task 9 : UI pièces jointes (modal d'édition) + badge trombone kanban

**Files :**
- Create : `bertel-tourism-ui/src/hooks/useSupabaseAccessToken.ts`
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaskModal.tsx` + `CrmTaskModal.test.tsx`
- Modify : `bertel-tourism-ui/src/features/crm/CrmTaches.tsx` + `CrmTaches.test.tsx`

**Interfaces :**
- Consomme : `uploadTaskDocument` / `getTaskDocumentUrl` / `deleteTaskDocument` (Task 7), `task.documents` (Task 7), routes (Task 8).
- Produit : section « Pièces jointes » dans le modal en mode ÉDITION (liste + Ouvrir + Supprimer + Ajouter) ; en création, la phrase « Enregistrez la tâche pour joindre des documents. » ; badge `pill-mini` trombone + compteur sur la carte kanban.

- [ ] **Step 1 : Hook token**

`src/hooks/useSupabaseAccessToken.ts` (même recette que le hook local de `CrmActorDocuments` — dupliqué là-bas volontairement pour ne pas toucher un fichier hors périmètre) :

```ts
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

/** Access token de la session (pour les routes Next à Bearer). null = pas encore lu / invité. */
export function useSupabaseAccessToken(): string | null {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const client = getSupabaseClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      if (alive) setAccessToken(data.session?.access_token ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  return accessToken;
}
```

- [ ] **Step 2 : Tests rouges**

Dans `CrmTaskModal.test.tsx` (mocker le service et le hook) :

```tsx
jest.mock('../../services/task-documents', () => ({
  uploadTaskDocument: jest.fn().mockResolvedValue({ documentId: 'd-2', title: 'Nouveau.pdf' }),
  getTaskDocumentUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
  deleteTaskDocument: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../hooks/useSupabaseAccessToken', () => ({
  useSupabaseAccessToken: () => 'token-test',
}));
import { deleteTaskDocument, uploadTaskDocument } from '../../services/task-documents';

describe('CrmTaskModal — pièces jointes', () => {
  const taskWithDoc = {
    ...taskFixture,
    documents: [{ id: 'd-1', title: 'Devis.pdf', mimeType: 'application/pdf', sizeBytes: 1234, createdAt: null }],
  };

  it('création : pas de section documents, un mot l’explique', () => {
    renderModal();
    expect(screen.queryByText('Pièces jointes')).not.toBeInTheDocument();
    expect(screen.getByText('Enregistrez la tâche pour joindre des documents.')).toBeInTheDocument();
  });

  it('édition : liste les documents et supprime avec confirmation', async () => {
    const onSaved = jest.fn();
    window.confirm = jest.fn().mockReturnValue(true);
    renderModal({ task: taskWithDoc, objectOptions: [], onSaved });
    expect(screen.getByText('Devis.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' }));
    await waitFor(() => expect(jest.mocked(deleteTaskDocument)).toHaveBeenCalledWith({
      taskId: 't-9', documentId: 'd-1', accessToken: 'token-test',
    }));
    expect(onSaved).toHaveBeenCalled(); // invalide crm-tasks SANS fermer le modal
  });

  it('édition : upload un fichier choisi', async () => {
    const onSaved = jest.fn();
    renderModal({ task: taskWithDoc, objectOptions: [], onSaved });
    const file = new File(['x'], 'Nouveau.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Ajouter un document'), file);
    await waitFor(() => expect(jest.mocked(uploadTaskDocument)).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't-9', accessToken: 'token-test' }),
    ));
    expect(onSaved).toHaveBeenCalled();
  });
});
```

Dans `CrmTaches.test.tsx` : le harness du fichier fournit des tâches mockées — donner `documents` à l'une d'elles et :

```tsx
it('affiche le badge trombone quand la tâche a des pièces jointes', async () => {
  renderTaches(); // avec une tâche dont documents.length === 2
  expect(await screen.findByTitle('2 pièce(s) jointe(s)')).toBeInTheDocument();
});
```

- [ ] **Step 3 : Rouge**

```bash
npm run test:run -- src/features/crm/CrmTaskModal.test.tsx src/features/crm/CrmTaches.test.tsx
```

- [ ] **Step 4 : Implémentation modal**

Dans `CrmTaskModal.tsx` :

1. Imports : `useRef`, `useSupabaseAccessToken`, `deleteTaskDocument, getTaskDocumentUrl, uploadTaskDocument` ; `Paperclip, Trash2, ExternalLink, Upload` de lucide-react au besoin.
2. Sous la description, la section (rendue SEULEMENT si `task`) :

```tsx
{task ? (
  <div className="crm-field">
    Pièces jointes
    <ul className="crm-doc-list">
      {task.documents.map((doc) => (
        <li key={doc.id} className="crm-doc-list__row">
          <span className="crm-doc-list__title">{doc.title}</span>
          <button type="button" className="crm-btn sm" aria-label={`Ouvrir « ${doc.title} »`}
            disabled={!accessToken || documentPending}
            onClick={() => openMutation.mutate(doc.id)}>
            Ouvrir
          </button>
          <button type="button" className="crm-btn sm" aria-label={`Supprimer « ${doc.title} »`}
            disabled={!accessToken || documentPending}
            onClick={() => {
              if (window.confirm(`Supprimer « ${doc.title} » ? Le fichier sera définitivement effacé.`)) {
                deleteMutation.mutate(doc.id);
              }
            }}>
            Supprimer
          </button>
        </li>
      ))}
      {task.documents.length === 0 && <li className="crm-field__hint">Aucune pièce jointe.</li>}
    </ul>
    <input
      ref={fileInputRef}
      type="file"
      aria-label="Ajouter un document"
      accept="application/pdf,image/*"
      style={{ display: 'none' }}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) uploadMutation.mutate(file);
      }}
    />
    <button type="button" className="crm-btn sm" disabled={!accessToken || documentPending}
      onClick={() => fileInputRef.current?.click()}>
      Ajouter un document
    </button>
    {documentError && <div className="inline-alert" role="alert">{documentError}</div>}
  </div>
) : (
  <p className="crm-field__hint">Enregistrez la tâche pour joindre des documents.</p>
)}
```

3. La plomberie (dans le corps du composant ; les trois mutations appellent `onSaved()` — invalidation SANS fermeture) :

```tsx
const accessToken = useSupabaseAccessToken();
const fileInputRef = useRef<HTMLInputElement>(null);

const uploadMutation = useMutation({
  mutationFn: (file: File) => uploadTaskDocument({ taskId: task!.id, file, accessToken: accessToken! }),
  onSuccess: () => onSaved(),
});
const deleteMutation = useMutation({
  mutationFn: (documentId: string) => deleteTaskDocument({ taskId: task!.id, documentId, accessToken: accessToken! }),
  onSuccess: () => onSaved(),
});
const openMutation = useMutation({
  mutationFn: (documentId: string) => getTaskDocumentUrl({ taskId: task!.id, documentId, accessToken: accessToken! }),
  onSuccess: (url) => window.open(url, '_blank', 'noopener'),
});
const documentPending = uploadMutation.isPending || deleteMutation.isPending || openMutation.isPending;
const documentError =
  (uploadMutation.error as Error | null)?.message ??
  (deleteMutation.error as Error | null)?.message ??
  (openMutation.error as Error | null)?.message ?? null;
```

(CSS : `crm-doc-list`/`crm-doc-list__row` en flex simple — ajouter 6 lignes dans la feuille CSS où vivent les `crm-field`, en suivant les tokens existants ; sinon réutiliser les classes utilitaires du fichier.)

- [ ] **Step 5 : Badge trombone kanban**

Dans `CrmTaches.tsx`, import `Paperclip`, et dans `ticket__meta` après le badge interaction liée :

```tsx
{task.documents.length > 0 && (
  <span className="pill-mini" title={`${task.documents.length} pièce(s) jointe(s)`}>
    <Paperclip size={11} aria-hidden /> {task.documents.length}
  </span>
)}
```

- [ ] **Step 6 : Vert complet + typecheck**

```bash
npm run test:run -- src/features/crm && npm run typecheck
```

- [ ] **Step 7 : Commit**

```bash
git add bertel-tourism-ui/src/hooks/useSupabaseAccessToken.ts bertel-tourism-ui/src/features/crm
git commit -m "feat(crm): pieces jointes dans le modal d'edition + badge trombone kanban"
```

---

### Task 10 : Déploiement SQL live + recette de bout en bout

**Files :** aucun nouveau (MCP Supabase + vérifs). Modify éventuel : `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée 17i, même format que 17g/17h).

⚠️ **Écriture sur la base de PRODUCTION — obtenir le GO explicite du PO avant ce task.**

- [ ] **Step 1 : Pré-vol**

Re-jouer le Step 5 de la Task 1 (migration + test en transaction annulée) — attendu vert. Re-vérifier le md5 live de `list_crm_tasks` = md5 du corps de base utilisé (personne n'a redéployé entre-temps).

- [ ] **Step 2 : Appliquer**

Via MCP Supabase `apply_migration` (name `crm_task_email_documents`), contenu = le fichier intégral. Puis `execute_sql` : `NOTIFY pgrst, 'reload schema';`

- [ ] **Step 3 : Vérifier live**

1. `execute_sql` : `BEGIN;` + test SQL + `ROLLBACK;` → tous les ASSERT passent contre la base MIGRÉE.
2. md5 après : `md5(prosrc)` de `list_crm_tasks`, `claim_unmailed_notifications`, `mark_notifications_emailed`, `user_can_write_crm_task` = md5 des corps du fichier (recette lot-corrections).
3. `SELECT count(*) FROM app_notification WHERE email_sent_at IS NULL;` — les notifications HISTORIQUES (antérieures à 17i) sont dans la file : décision assumée = les laisser partir au premier drain ? **NON** : les terminer pour ne pas spammer des assignations vieilles de plusieurs jours :

```sql
UPDATE app_notification
SET email_sent_at = now(), email_error = 'backfill_17i_never_mailed'
WHERE email_sent_at IS NULL AND created_at < now();
```

(À exécuter UNE fois, juste après l'apply, AVANT tout déploiement front — c'est le front qui pingue le drain.)

- [ ] **Step 4 : Runbook**

Ajouter l'entrée 17i à `docs/SQL_ROLLOUT_RUNBOOK.md` (date, fichier, NOTIFY pgrst, l'UPDATE de backfill du Step 3, vérifs md5). Commit :

```bash
git add docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "docs(sql): runbook 17i outbox e-mail + pieces jointes de tache"
```

- [ ] **Step 5 : Recette front (avec le PO, après déploiement du front)**

1. Créer une tâche assignée à un collègue → il reçoit la notification in-app ET l'e-mail (sujet « Nouvelle tâche : … — … », lien /crm) ; `app_notification.email_sent_at` posé.
2. S'auto-assigner une tâche → AUCUN e-mail.
3. Drag & drop d'une carte → aucun ping, aucune notification.
4. Éditer une tâche : description modifiée visible sur la carte ; ajouter un PDF → badge trombone ; « Ouvrir » → le fichier ; « Supprimer » → disparaît.
5. `SELECT email_error, count(*) FROM app_notification GROUP BY 1;` — pas d'erreurs inattendues.

---

## Self-review (fait à l'écriture)

- **Couverture spec** : Volet 1 (Tasks 1, 4, 5, 6, 10), Volet 2 (Tasks 2, 3), Volet 3 (Tasks 1, 7, 8, 9). Sécurité : REVOKE testés (SQL B6/A4), route drain sans corps interprété (test « corps ignoré » implicite : la route ne lit jamais `req.json()`), gate write sur les 3 routes documents. Hors périmètre spec respecté (pas de cron, pas d'opt-out, pas d'upload à la création).
- **Ajout vs spec, assumé** : Step 3 de la Task 10 termine les notifications historiques pour que le premier drain ne rejoue pas le passé — conséquence directe du choix outbox, à valider avec le PO au moment du GO.
- **Types cohérents** : `CrmTaskDocument.id = document_id` partout (routes url/delete le consomment tel quel) ; `documents: []` ajouté aux mocks et fixtures dès la Task 7 (le typecheck casse sinon) ; `taskFixture` de la Task 3 sans `documents` (le type ne l'exige pas encore à ce moment-là).
- **Placeholders** : le seul bloc volontairement non recopié est le corps 16z de `list_crm_tasks` (gabarit commenté, consigne explicite de copie intégrale + garde md5 avant/après) et la fixture SQL (consigne de copie lignes 222-261 du test 16z) — les deux pointent une source exacte, pas un « TBD ».

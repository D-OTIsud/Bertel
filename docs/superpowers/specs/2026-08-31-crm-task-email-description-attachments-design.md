# Tâches CRM — e-mail d'assignation, description, pièces jointes

**Date** : 2026-08-31 · **Statut** : validé PO (conversation) · **Périmètre** : module CRM (`/crm`, onglet Tâches + fiche acteur + vue établissement)

Trois volets livrables indépendamment, dans cet ordre : description (petit), e-mail (moyen), pièces jointes (moyen). Décisions PO : e-mail **immédiat** (pas de digest), **pas d'opt-out** utilisateur pour l'instant, pièces jointes **dans ce chantier** mais uploadables **seulement sur une tâche existante** (modal d'édition), description **modifiable après création**.

---

## Contexte — ce qui existe déjà (ne pas reconstruire)

| Brique | État |
|---|---|
| Notification in-app | `app_notification` (16w), insérée par `api.notify_task_assignees` appelée par `api.save_crm_task` dans la même transaction — **une ligne par NOUVEL assigné**, auteur exclu (`IS DISTINCT FROM p_actor`), sur création (ligne ~507) ET sur mise à jour (ligne ~450, entrants seulement). |
| Envoi d'e-mail | `bertel-tourism-ui/src/lib/mail.server.ts` — nodemailer, relais SMTP Google **autorisé par IP du VPS** (`readSmtpConfig`, STARTTLS requis). ⚠️ Contrainte structurante : l'e-mail DOIT partir du serveur Next (Coolify) — jamais d'une Edge Function Supabase ni d'un trigger DB direct. |
| `crm_task.description` | Colonne existante, `api.save_crm_task` l'accepte déjà (`payload->>'description'`), `saveCrmTask` (front) la transmet déjà, la carte kanban l'**affiche** déjà (`CrmTaches.tsx:258`). Seule la SAISIE manque. |
| Mise à jour partielle | `saveCrmTask({id, …})` : clé présente = écrite, absente = inchangée. Le modal d'édition réutilise ce contrat tel quel. |
| Documents (pattern) | `/api/actor-document` : Bearer → `getUser`, autorisation par RPC (`user_can_write_crm_actor`), upload bucket privé `actor-documents`, ligne `ref_document` (`access_scope='crm_private'`) + table de lien, rollback en cascade en cas d'échec partiel. À cloner pour les tâches. |
| Libellés utilisateur | `app_user_profile.display_name` via `api.crm_user_label` — jamais recopié dans un payload (effacement RGPD = libellé neutralisé). E-mails : `auth.users.email` (accessible aux fonctions DEFINER, `search_path` inclut `auth`). |
| URL de base | `NEXT_PUBLIC_APP_URL` avec repli `req.nextUrl.origin` (pattern `/api/lists/send`). |

---

## Volet 1 — Description (création + édition)

### Création
Ajouter un `textarea` « Description » (optionnel) dans `CrmTaskModal`, entre Titre et Établissement. Transmis via `saveCrmTask({description: value.trim() || null})` — clé envoyée seulement si non vide à la création. Zéro SQL.

### Édition — `CrmTaskModal` passe en double mode
- Nouvelle prop optionnelle `task` (la `CrmTask` complète). Présente ⇒ mode édition : titre « Modifier la tâche », bouton « Enregistrer », champs pré-remplis (titre, description, échéance, assignés), **établissement en lecture seule** (`crm-field__static`, comme `fixedObject` — le serveur ne re-valide pas un déplacement d'établissement et on ne l'offre pas).
- Soumission : `saveCrmTask({id, title, description, dueAt, assigneeIds})`. `description: ''` → envoyée `null` (effacement explicite). `assigneeIds` toujours envoyé (ensemble exact réconcilié serveur) ; la garde « au moins une personne » s'applique comme à la création.
- Ouverture : bouton crayon (`Pencil`, `crm-btn sm`) sur la carte kanban, dans `ticket__actions`, gated `canWrite` (désactivé + `CRM_READ_ONLY_REASON` sinon). `stopPropagation` pour ne pas déclencher le DnD.
- Effet de bord assumé : ajouter un assigné en édition notifie (et e-maile, volet 2) les **entrants seulement** — logique serveur existante, rien à faire.

### Affichage
La carte kanban affiche déjà la description. Pas d'autre surface à toucher.

---

## Volet 2 — E-mail d'assignation (immédiat)

### Architecture : outbox drainé par le serveur Next
`app_notification` devient l'outbox e-mail. Aucun contenu ni destinataire ne vient du client : la route ne fait que **déclencher un drainage**, tout est dérivé en DB.

### SQL (nouvelle migration `migration_crm_task_email_description_documents.sql`)
Colonnes sur `app_notification` :
- `email_claimed_at timestamptz` — réclamation en cours (TTL) ;
- `email_sent_at timestamptz` — envoi confirmé ;
- `email_error text` — dernière erreur d'envoi (diagnostic, n'empêche pas la re-réclamation).

Index partiel `(created_at) WHERE email_sent_at IS NULL` pour que le drainage ne coûte rien quand tout est envoyé.

Deux RPCs **service_role uniquement** (REVOKE PUBLIC/anon/authenticated, comme `notify_task_assignees`) :

1. `api.claim_unmailed_notifications(p_limit int DEFAULT 20) RETURNS jsonb`
   - `UPDATE … SET email_claimed_at = now() WHERE kind = 'crm_task_assigned' AND email_sent_at IS NULL AND (email_claimed_at IS NULL OR email_claimed_at < now() - interval '10 minutes') … RETURNING` (sous-requête `FOR UPDATE SKIP LOCKED` + `LIMIT p_limit`).
   - Retourne par ligne : `notification_id`, `recipient_email` + `recipient_name` (join `auth.users` + `app_user_profile`/`crm_user_label`), `task_title`, `object_name`, `due_at`, `assigner_name` (`crm_user_label(created_by, …)`).
   - Une ligne dont le destinataire n'a **pas d'e-mail** (compte supprimé) est marquée `email_sent_at = now()` + `email_error = 'no_recipient_email'` directement — elle ne doit pas boucher la file.
   - Garanties : claim TTL 10 min ⇒ un crash du serveur entre claim et envoi re-rend la ligne réclamable (e-mail jamais perdu ; doublon possible uniquement dans cette fenêtre de panne — assumé). Deux pings concurrents ne prennent jamais la même ligne (`SKIP LOCKED` + fenêtre TTL).

2. `api.mark_notifications_emailed(p_sent uuid[], p_failed jsonb DEFAULT '[]') RETURNS integer`
   - `p_sent` → `email_sent_at = now()`, `email_error = NULL`.
   - `p_failed` = `[{id, error}]` → `email_error` renseigné, `email_claimed_at = NULL` (re-réclamable immédiatement au prochain ping).

### Route Next `POST /api/crm/notify-drain`
- **Auth** : Bearer vérifié via `getUser` (pattern `authenticated()` d'`/api/actor-document`). N'importe quel utilisateur connecté peut pinger : le corps de requête est **ignoré**, la route ne peut qu'accélérer l'envoi d'e-mails dont le contenu est 100 % serveur ⇒ pas de vecteur de spam/relais.
- **Flux** : client service_role → `claim_unmailed_notifications` → pour chaque ligne, envoi via le helper nodemailer (généralisation de `sendListEmail` en `sendMail`, `sendListEmail` conservé en alias) → `mark_notifications_emailed`. Envois séquentiels (volumes faibles), réponse `{sent, failed}`.
- **SMTP non configuré** (`MailNotConfiguredError`) : répondre 503 **sans réclamer** (ne pas consommer le TTL pour rien) — les notifications restent en attente, comportement identique au partage de liste.

### Contenu de l'e-mail
- Sujet : `Nouvelle tâche : {titre} — {établissement}`.
- Corps HTML sobre (même famille visuelle que l'e-mail de partage de liste) : titre, établissement, échéance (`—` si absente), « Confiée par {assigner_name} », bouton/lien vers `{NEXT_PUBLIC_APP_URL||origin}/crm` (pas de deep-link par tâche : l'onglet Tâches est la cible).
- Expéditeur : config SMTP existante (`SMTP_FROM_NAME`/`SMTP_FROM_EMAIL`).

### Front (déclencheur)
Après un `saveCrmTask` réussi **dont le payload contenait `assigneeIds`** : `void fetch('/api/crm/notify-drain', {method:'POST', headers:{Authorization: Bearer}})` — fire-and-forget (échec silencieux : la ligne reste en outbox et le prochain ping la ramasse). Point d'accrochage unique dans `services/crm.ts` (fin de `saveCrmTask`), pas dans chaque composant. Aucun ping en mode démo.

### Cas limites
- Auto-assignation : aucune ligne outbox n'existe (exclue à l'insertion) ⇒ aucun e-mail. Cohérent avec l'in-app.
- Assignation par un client tiers (SQL direct, autre front) : la ligne attend le prochain ping de n'importe quel utilisateur. Un cron de balayage pourra s'ajouter plus tard **hors périmètre**.
- Le drainage traite TOUTES les lignes en attente, pas seulement celles de la tâche qui vient d'être sauvée — c'est le filet de rattrapage intégré.

---

## Volet 3 — Pièces jointes

### Modèle : clone du pattern documents d'acteur
- **Table de lien** `crm_task_document` : `id uuid PK`, `task_id → crm_task ON DELETE CASCADE`, `document_id → ref_document`, `title text`, `created_by uuid`, `created_at`. RLS : service_role seul (comme `actor_document` — tout passe par les routes/RPCs).
- **Stockage** : bucket privé `actor-documents` réutilisé, chemin `tasks/{taskId}/{uuid}.{ext}` ; `ref_document` avec `access_scope='crm_private'`, `storage_bucket`, `storage_path`, `extra` (mime, taille). Pipeline de traitement de fichier réutilisé (`processActorDocumentBuffer` — mêmes types acceptés, extrait/généralisé si besoin sans en changer le comportement).
- **Autorisation** : nouveau RPC `api.user_can_write_crm_task(p_task_id uuid) RETURNS boolean` (DEFINER, `authenticated`) — **même prédicat que `api.save_crm_task`** sur la tâche existante (périmètre ORG de l'objet + `write_crm_notes`/rang admin/superuser), factorisé pour n'avoir qu'une définition. En v1 les TROIS routes (upload, URL signée, delete) utilisent ce même prédicat d'écriture : toutes les surfaces documents vivent derrière le modal d'édition, lui-même gated écriture — un prédicat de lecture séparé n'existera que si une surface de lecture seule apparaît.

### Routes Next `/api/task-document`
Clonées d'`/api/actor-document` :
- `POST` (multipart `task_id` + `file`) : auth Bearer → `user_can_write_crm_task` → process → upload → `ref_document` → `crm_task_document`, rollback en cascade sur échec partiel. Retour `{documentId, title}`.
- `POST /api/task-document/url` : URL signée courte durée sur le bucket privé.
- `DELETE` : supprime lien + `ref_document` + fichier storage.

### Lecture
`api.list_crm_tasks` (et la lecture de tâche de la fiche acteur si elle est distincte) émet `documents: [{id, title, size_bytes, mime_type, created_at}]` par tâche (join léger ; tableau vide si aucun).

### UI
- **Modal d'édition uniquement** : section « Pièces jointes » sous la description — liste (titre, taille, ouvrir via URL signée, supprimer avec confirmation), bouton « Ajouter un document » (input file). Invalidation des queries tâches après upload/suppression.
- **Création** : une ligne de texte « Enregistrez la tâche pour joindre des documents. » (pas d'upload différé/queue en v1).
- **Carte kanban** : badge trombone (`Paperclip`) + compteur quand `documents.length > 0`, dans `ticket__meta` ; clic = ouvre le modal d'édition (même gating que le crayon).
- L'e-mail d'assignation ne joint **jamais** les fichiers (lien vers l'app seulement).

---

## Sécurité (résumé)
- Drain : contenu/destinataires 100 % dérivés DB ; RPCs outbox service_role only ; route sans corps interprété ; pas de relais ouvert.
- Documents : bucket privé + URL signées courtes ; autorisation par RPC DEFINER au même prédicat que l'écriture de tâche ; ids validés par shape (UUID) ; rollback storage/DB en cascade.
- Rien de nouveau n'est lisible en PostgREST direct (`app_notification`, `crm_task_document` restent service_role/RPC only).

## Tests
- **SQL** (pattern `test_crm_task_multi_assignee.sql`) : claim/TTL/SKIP LOCKED (deux claims concurrents ne partagent aucune ligne), destinataire sans e-mail marqué sans boucher la file, `mark_notifications_emailed` (sent + failed), `user_can_write_crm_task` (membre OK / hors ORG refusé / lecteur seul refusé), `list_crm_tasks.documents`.
- **RTL** : `CrmTaskModal` double mode (pré-remplissage, description vidée → `null`, établissement verrouillé, garde assignés), crayon/trombone sur la carte (gating lecture seule), ping fire-and-forget après save avec assignés (et PAS en démo).
- **Routes** (pattern `route.test.ts`) : notify-drain (401 sans Bearer, 503 SMTP absent sans claim, happy path avec transport mocké, marquage failed) ; task-document (403 hors droit, rollback sur échec DB).
- **Garde de non-régression** : sabotage d'au moins une garde par volet avant de la déclarer testée (leçon 17g).

## Déploiement
1. Migration SQL (colonnes + RPCs + table + prédicat) — additive, ordre libre vis-à-vis du front.
2. Front + routes (description, modal édition, drain, documents).
3. Env : rien de nouveau (SMTP + `NEXT_PUBLIC_APP_URL` existent).
4. Manifest + runbook + fresh-apply CI comme d'habitude ; commits par volet.

## Hors périmètre (explicite)
Digest, opt-out par utilisateur, cron de balayage serveur, deep-link par tâche, upload à la création, pièces jointes dans l'e-mail, notification d'autres événements (échéance proche, changement de statut).

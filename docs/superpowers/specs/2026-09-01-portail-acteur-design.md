# Portail acteur — fiches en libre remplissage, vérifiées par les éditeurs

Date : 2026-09-01 · Statut : **validé par le PO** (7 décisions actées ci-dessous) · Branche : `claude/actor-sheet-interface-spec-26b57f`

## 1. Objectif

Ouvrir à chaque **acteur** (prestataire, personne physique du CRM) un accès à l'application,
confiné à une interface dédiée où il ne voit **que les fiches des objets auxquels il est
associé**, peut les remplir, et où **chaque soumission crée une tâche de vérification**
assignée aux éditeurs de l'organisation. Rien de ce que saisit un acteur n'atteint la fiche
canonique avant validation par un éditeur.

## 2. Décisions actées (PO, 2026-09-01)

| # | Décision | Choix |
|---|----------|-------|
| D1 | Accès acteur | Compte invité par e-mail ; la gestion du compte se fait **depuis la fiche prestataire du CRM**, pas via /team |
| D2 | Modèle d'écriture | **Retenu jusqu'à validation** : tout passe par la modération (`pending_change`), rien en canonique avant approbation |
| D3 | Assignation de la tâche | **Tous les éditeurs de l'org** publisher (multi-assignée §218) |
| D4 | Périmètre de la fiche | **Éditeur complet, sections masquables** |
| D5 | Niveau du masquage | **Par org ET par type** (matrice org × type × section) |
| D6 | Déclencheur de la tâche | **« Soumettre » explicite** — une tâche par soumission, brouillon libre avant |
| D7 | Chemin d'écriture directe existant (`api.is_object_owner`) | **Fermé pour les personas acteur** ; conservé pour les équipes internes |
| D8 | Architecture d'identité | **Approche A** : rôle `actor` + activation de `app_user_profile.actor_id` comme lien explicite |
| D9 | Granularité de validation (PO, 2026-09-01) | Le vérificateur valide **l'ensemble de la soumission en une action** OU **changement par changement** (mélange approbations/rejets → statut `partial`) |

## 3. État des lieux (recon 2026-09-01, 6 sous-systèmes)

Ce qui existe déjà et se réutilise tel quel ou presque :

- **Pont acteur↔user** : `api.user_actor_ids()` (e-mail JWT → `actor_channel` kind `email`)
  est LIVE et alimente ~40 policies de lecture via `api.current_user_extended_object_ids()`
  (bras 1a = liens `actor_object_role` directs, 1b = fiches des ORG où l'acteur a un rôle).
- **Colonne dormante** : `app_user_profile.actor_id` (FK `actor`, index unique partiel
  `uq_app_user_profile_actor_id`) existe, documentée, **zéro consommateur** — l'ancre
  explicite idéale (`schema_unified.sql` L6317-6327).
- **Fork contributeur (§122)** : `planSaveBatch(…, canWriteCanonicalDirect=false)` +
  `buildContributorSubmission` + `api.submit_pending_change` routent déjà chaque module
  modifié vers la modération, avec l'enveloppe `metadata {rpc, section, manual_apply,
  field, before, after}`.
- **Modération (§120)** : `pending_change` + `api.list/approve/reject_pending_change`,
  approbation = re-dispatch d'un writer **whitelisté** (8 writers uniformes
  `(p_object_id, p_payload)`), UI `ModerationPage` + badge Sidebar. NB : la table est
  vide en prod à ce jour — le portail en sera le premier vrai producteur.
- **Tâches CRM (§218/16z/17c/17m)** : `crm_task` + `crm_task_assignee` (multi-assignée,
  réconciliation non destructive) + `app_notification` (kind CHECK fail-closed) + outbox
  e-mail (`claim_unmailed_notifications` / `mark_notifications_emailed` /
  `POST /api/crm/notify-drain`, SMTP côté Next uniquement).
- **Précédent DB-event → tâche** : `api.create_crm_artifacts_from_incident()` insère
  `crm_interaction` + `crm_task` directement, sans passer par `save_crm_task`.
- **Précédents de surface hors shell** : `/l/[token]`, `/login`, `/set-password`,
  `AuthShell` (chrome hors app avec branding), `SessionScreen`.
- **Invitation** : `POST /api/admin/invite` → `inviteUserByEmail(redirectTo=/set-password)`
  → upsert `app_user_profile` ; `/set-password` gère invitation ET récupération.

Trous identifiés que cette spec ferme :

- `api.is_object_owner` (lien `is_primary=TRUE` + e-mail correspondant) donne AUJOURD'HUI
  l'écriture canonique complète (`api.user_can_write_object_canonical`, ~23 policies +
  `internal.workspace_assert_can_write_object`) sans org, sans permission → contredit D2.
- `useBootstrapSession` **brique** tout compte sans rôle ∈ {owner, super_admin,
  tourism_agent} (`setSessionError`).
- Aucune création de tâche à la soumission ; aucune notification approve/reject ; aucun
  RPC « mes soumissions » côté soumetteur ; aucune liste des éditeurs éligibles d'un objet.
- Bras 1b + absence de filtre `valid_from`/`valid_to`/`visibility` : un acteur lirait
  toutes les fiches (y compris brouillons) des ORG où il a un rôle, et un lien expiré
  donnerait encore accès.

## 4. Architecture

### 4.1 Identité et confinement

**Rôle.** 4e valeur `actor` dans le CHECK de `app_user_profile.role`. Un compte portail =
`auth.users` + `app_user_profile {role:'actor', actor_id:<uuid>}`. `actor_id` est posé à
l'invitation et devient la **source de vérité** du lien compte↔acteur pour le portail. Le
pont e-mail `api.user_actor_ids()` reste inchangé pour les personas non-acteur (aucun
changement de comportement pour l'existant).

**Nouveaux helpers DB** (tous `STABLE`, fail-closed, pattern `search_path` se terminant par
`pg_temp` pour les DEFINER) :

```sql
api.is_actor_persona() → boolean
  -- app_user_profile.role = 'actor' pour auth.uid() ; COALESCE(…, FALSE)

api.current_user_actor_id() → uuid
  -- app_user_profile.actor_id pour auth.uid() ; NULL sinon

api.current_user_portal_object_ids() → SETOF text   -- SECURITY DEFINER
  -- SELECT aor.object_id
  --   FROM actor_object_role aor JOIN object o ON o.id = aor.object_id
  --  WHERE aor.actor_id = api.current_user_actor_id()
  --    AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
  --    AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
  --    AND o.object_type <> 'ORG'
```

Notes de périmètre :
- **Pas de bras 1b** : un acteur ne voit pas les autres fiches de l'ORG.
- **Liens expirés exclus** (contrairement au bras 1a actuel qui les ignore).
- **ORG exclu** : l'éditeur ne supporte pas le type ORG (panneau explicite existant).
- La colonne `visibility` du lien n'entre PAS dans le prédicat d'accès (elle gouverne la
  *diffusion* du lien, pas les droits — cohérent avec la doctrine `is_public`).

**Lecture (RLS).** `api.current_user_extended_object_ids()` reçoit un branchement de tête :

```sql
IF api.is_actor_persona() THEN
  RETURN QUERY SELECT * FROM api.current_user_portal_object_ids();
END IF;
-- puis les 5 bras existants, inchangés
```

`api.can_read_extended()` reçoit le MÊME branchement — les deux formulations doivent rester
équivalentes byte-à-byte ; `tests/test_read_gate_setbased.sql` est étendu avec un cas
persona acteur. Effet : les ~40 policies de lecture enfants scoppent automatiquement
l'acteur à ses seules fiches, brouillons compris (il doit pouvoir remplir une fiche non
publiée).

**Écriture (D7).** `api.is_object_owner()` reçoit `AND NOT api.is_actor_persona()` dans le
bras acteur (les bras service_role/superuser sont inchangés). Conséquences en cascade,
toutes voulues : `api.user_can_write_object_canonical` → FALSE pour un acteur → les 23
policies d'écriture, `internal.workspace_assert_can_write_object` et tous les
`save_object_*` refusent → la sonde `owner` de `api.get_object_workspace_permissions`
devient FALSE → l'éditeur front bascule mécaniquement en `contributorMode` (aucun forçage
front nécessaire, mais on force quand même côté portail, ceinture + bretelles).

**Front.** `UserRole` passe à 4 valeurs (`src/types/domain.ts`), `normalizeRole()` accepte
`actor` (`useBootstrapSession`), `getDefaultAppPath('actor') = '/espace'`
(`src/lib/auth-routing.ts`). Doubles gardes de layout : `(main)/layout.tsx` redirige
`role==='actor'` vers `/espace` ; `(portal)/layout.tsx` redirige tout non-acteur vers `/`.
`nav-items.ts` inchangé (aucune entrée ne liste `actor`, la nav back-office ne monte
jamais). `isSafeInternalPath` : pour un acteur, le `?from=` post-login est restreint au
préfixe `/espace` (allowlist portail). Comme toujours dans ce dépôt, ces gardes sont de
l'ergonomie — la sécurité réelle est DB.

### 4.2 Modèle de données (une migration, vague « 18a » — re-vérifier le dernier numéro de vague au moment du déploiement, cf. doctrine api-db-audit)

```sql
-- 1) Persona
ALTER TABLE app_user_profile DROP CONSTRAINT app_user_profile_role_check;
ALTER TABLE app_user_profile ADD CONSTRAINT app_user_profile_role_check
  CHECK (role IN ('owner','super_admin','tourism_agent','actor'));

-- 2) Soumissions (groupe les pending_change d'un « Soumettre »)
CREATE TABLE fiche_submission (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id     text NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES actor(id) ON DELETE SET NULL,
  submitted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,                      -- message de l'acteur pour l'office
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','partial')),
  task_id       uuid REFERENCES crm_task(id) ON DELETE SET NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
-- RLS : service_role/admin uniquement (même régime que pending_change) ; accès via RPC.
-- Index : (object_id, status), (submitted_by, submitted_at DESC)
-- Partial unique : UNE seule soumission ouverte par fiche
CREATE UNIQUE INDEX uq_fiche_submission_open
  ON fiche_submission(object_id) WHERE status = 'pending';

-- 3) Rattachement des changements
ALTER TABLE pending_change ADD COLUMN submission_id uuid
  REFERENCES fiche_submission(id) ON DELETE SET NULL;
CREATE INDEX idx_pending_change_submission ON pending_change(submission_id)
  WHERE submission_id IS NOT NULL;

-- 4) Matrice de visibilité org × type × section
CREATE TABLE org_actor_section_visibility (
  org_object_id text NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  object_type   text NOT NULL,             -- code type (HOT, RES, LOI, …)
  section_id    text NOT NULL,             -- numéro de section éditeur ('01'…'22')
  is_visible    boolean NOT NULL DEFAULT TRUE,
  PRIMARY KEY (org_object_id, object_type, section_id)
);
-- RLS : SELECT membres actifs de l'ORG ; pas de write policy (RPC rang ≥ 30 uniquement).

-- 5) Notifications : nouveau kind
ALTER TABLE app_notification DROP CONSTRAINT chk_app_notification_kind;
ALTER TABLE app_notification ADD CONSTRAINT chk_app_notification_kind
  CHECK (kind IN ('crm_task_assigned','fiche_submission_reviewed'));
```

**Sémantique de la matrice.** Absence de ligne = **visible** (défaut ouvert), sauf pour le
**plancher dur** ci-dessous, codé en dur côté serveur ET côté front, non paramétrable :

> Sections **jamais** montrées ni acceptées d'un acteur, quelle que soit la config :
> 18 Juridique, 19 Suivi prestataire (notes privées), 21 Publication, 22 Identifiants
> externes, bloc CRM, outils (versions, archivage, import/export), et les modules
> READONLY existants (`sync-identifiers`, `provider-follow-up`, `distribution`,
> `provider`).

### 4.3 RPCs nouveaux (SECURITY DEFINER, `REVOKE FROM PUBLIC, anon`, grant `authenticated`)

**`api.list_object_verifier_ids(p_object_id text) → SETOF uuid`**
Les « éditeurs » au sens D3 : membres **actifs** (`user_org_membership`) d'une ORG
**publisher** de l'objet (`object_org_link` + `ref_org_role.code='publisher'`) dont le rôle
métier confère `validate_changes` via `org_role_permission` (§227), **plus** les porteurs
d'un grant individuel `user_permission(validate_changes)` membres de cette ORG. Les
superusers plateforme ne sont PAS inclus (ils voient tout de toute façon).
**Repli si vide** : membres actifs porteurs d'un rang admin (`user_org_admin_role`) de
l'ORG publisher ; si toujours vide, la tâche est créée **non assignée** (précédent :
tâches incident) et le cas est signalé dans le retour du RPC de soumission.

**`api.get_actor_section_visibility(p_org_object_id text, p_object_type text) → jsonb`**
Lit la matrice (lignes existantes + défauts). Pour l'écran de paramétrage /settings ;
appelable par les membres actifs de l'ORG.

**`api.get_portal_section_visibility(p_object_id text) → jsonb`**
Variante portail : résout l'ORG publisher et le type depuis la fiche, puis lit la matrice.
Appelable par la persona acteur pour une fiche de son périmètre (42501 sinon). C'est elle
que consomme l'éditeur en mode portail.

**`api.rpc_set_actor_section_visibility(p_org_object_id, p_object_type, p_section_id, p_visible) → void`**
Écriture de la matrice, gate rang admin ≥ 30 sur l'ORG (même régime que
`rpc_set_role_permission`). Refuse les sections du plancher dur (22023).

**`api.submit_actor_fiche(p_object_id text, p_changes jsonb, p_note text DEFAULT NULL) → jsonb`**
Le cœur du chantier. Transactionnel. `p_changes` = tableau d'enveloppes contributeur
(exactement la forme produite par `buildContributorSubmission` : `{target_table,
target_pk, action, payload, metadata{rpc, section, manual_apply, field, before, after}}`).

Gates, dans l'ordre :
1. `auth.uid()` non nul + `api.is_actor_persona()` (42501 sinon) ;
2. `p_object_id ∈ api.current_user_portal_object_ids()` (42501) ;
3. pas de soumission `pending` existante pour cette fiche (23505 → message clair
   « Une vérification est déjà en cours pour cette fiche ») ;
4. `p_changes` non vide, ≤ 40 éléments, chaque `metadata.section` ∈ sections visibles
   (matrice + plancher dur) — sinon 22023 en nommant la section refusée ;
5. `metadata.rpc` de chaque élément soit NULL soit membre de la whitelist §120 (aucun
   nom de writer arbitraire ne doit entrer en base).

Effets, dans la même transaction :
1. INSERT `fiche_submission` (note, actor_id = `current_user_actor_id()`) ;
2. INSERT N `pending_change` (mêmes colonnes que `submit_pending_change`, +
   `submission_id`) — le trigger existant flippe `object.is_editing` ;
3. INSERT 1 `crm_task` **direct** (précédent : trigger incident — `save_crm_task` est
   inutilisable par un acteur et ses gates ne doivent pas être élargis) :
   `title = 'Vérifier la fiche « <nom> »'`, `description = note + liste des sections`,
   `status='todo'`, `priority='medium'`, `object_id`, `actor_id`,
   `created_by = auth.uid()`, `extra = {kind:'fiche_verification', submission_id}` ;
4. INSERT `crm_task_assignee` pour chaque uuid de `list_object_verifier_ids()` ;
5. PERFORM `api.notify_task_assignees(task_id, assignee_ids, auth.uid())` — réutilise le
   kind `crm_task_assigned` existant, l'inbox, l'outbox et le template e-mail
   `TaskAssignedEmail` **sans nouveau kind côté éditeurs** (appel DEFINER→DEFINER : les
   grants sont vérifiés contre le propriétaire de la fonction, pas l'appelant) ;
6. RETURN `{submission_id, task_id, change_count, assignee_count}` —
   `assignee_count = 0` fait afficher un avertissement côté client (et est loggé).

**`api.list_my_submissions() → jsonb`**
Auto-scopé `submitted_by = auth.uid()` (jamais de paramètre destinataire — doctrine
notifications). Retourne les soumissions + par changement : section, statut,
`review_note`, reviewer_label (via `app_user_profile`, jamais de PII copiée).

**`api.list_my_portal_fiches() → jsonb`**
Liste légère pour l'accueil du portail : `{id, name, type, status, updated_at,
open_submission {id, submitted_at} | null, last_resolved {status, resolved_at} | null}`.
Persona acteur uniquement.

**`api.get_my_actor_profile() → jsonb`**
Le profil de l'acteur lié (`display_name`, `photo_url`, canaux e-mail/téléphone **de son
propre actor_id** uniquement). Nécessaire car la policy SELECT d'`actor_channel` est
inerte pour `authenticated` (bras `actor_id = auth.uid()` documenté mort). Lecture seule
en v1 (l'édition de ses propres coordonnées = hors périmètre, cf. §9).

> **Invariant PII** : ce RPC est scoppé à `current_user_actor_id()` strict — il n'ajoute
> PAS une 5e formulation du périmètre PII de `api.can_read_actor_contacts` (dont le
> COMMENT liste les 4 formulations à faire évoluer ensemble). Aucune de ces 4 n'est
> modifiée par ce chantier ; un test le verrouille (§8).

### 4.3 bis — Validation côté éditeurs : tout OU partie (D9)

Le vérificateur dispose des deux granularités :

- **Partie** : les RPCs existants `api.approve_pending_change` / `api.reject_pending_change`
  restent le chemin unitaire — chaque changement s'approuve ou se rejette indépendamment,
  un mélange produit le statut `partial` (cf. 4.4).
- **Ensemble** : deux nouveaux RPCs de soumission entière (mêmes gates que l'unitaire :
  `api.user_can_moderate_object`, FOR UPDATE, refus si la soumission n'est plus `pending`).

**Trou existant fermé au passage.** `api.approve_pending_change` REFUSE aujourd'hui tout
changement `manual_apply` (`metadata->>'rpc'` NULL → 22023) : un module non
auto-applicable ne peut jamais être marqué approuvé et resterait `pending` pour toujours —
ce qui bloquerait la résolution de TOUTE soumission (4.4) puisque ~22/29 modules sont
`manual_apply`. La migration ajoute donc un paramètre au RPC unitaire :

```sql
api.approve_pending_change(p_id uuid, p_review_note text DEFAULT NULL,
                           p_applied_manually boolean DEFAULT FALSE) → jsonb
-- rpc whitelisté           → re-dispatch comme aujourd'hui (p_applied_manually ignoré)
-- rpc NULL / manual_apply  → exige p_applied_manually = TRUE : le modérateur atteste
--                            avoir reporté la modification à la main dans l'éditeur ;
--                            la ligne passe 'approved' (pas 'applied'), reviewed_by/at
--                            posés, AUCUN re-dispatch. Sinon 22023 (comportement actuel).
```

La distinction `applied` (re-dispatch machine) / `approved` (attesté manuel) existe déjà
dans le CHECK de `pending_change.status` — elle devient enfin porteuse de sens. Signature
étendue par DEFAULT : les appels existants sont inchangés.

**`api.approve_fiche_submission(p_submission_id uuid, p_review_note text DEFAULT NULL, p_include_manual boolean DEFAULT FALSE) → jsonb`**
« Tout approuver ». Transactionnel : itère les `pending_change` encore `pending` de la
soumission dans un ordre stable ; les auto-applicables sont re-dispatchés (writer
whitelisté, AS THE CALLER — le modérateur doit passer le gate canonique du writer,
défense en profondeur inchangée) ; les `manual_apply` ne sont inclus que si
`p_include_manual = TRUE` (même attestation que ci-dessus), sinon ils restent `pending`
et le retour l'indique. **Tout ou rien** : si un writer échoue, la transaction entière
est annulée (aucune soumission à moitié appliquée). Retour :
`{applied_count, approved_manual_count, skipped_manual_count, submission_status}`.

**`api.reject_fiche_submission(p_submission_id uuid, p_review_note text) → jsonb`**
« Tout rejeter ». Note obligatoire (même règle que l'unitaire), appliquée à chaque
changement encore `pending`. Les changements déjà traités unitairement ne sont pas
touchés (on peut donc approuver 2 sections puis rejeter le reste en une action →
statut `partial`).

La résolution (4.4) reste inchangée : elle est déclenchée par le trigger sur
`pending_change.status`, donc les chemins unitaire et groupé convergent sans code
supplémentaire.

### 4.4 Résolution d'une soumission (trigger)

`AFTER UPDATE OF status ON pending_change` (quand `submission_id IS NOT NULL`) →
`internal.resolve_fiche_submission(submission_id)` :

- S'il reste ≥ 1 `pending` dans la soumission → rien.
- Sinon : `fiche_submission.status` = `approved` (tout `applied`/`approved`), `rejected`
  (tout `rejected`), `partial` (mélange) ; `resolved_at = now()` ;
- la `crm_task` liée passe `done` (si pas déjà `canceled`) ;
- INSERT `app_notification {kind:'fiche_submission_reviewed', recipient_id: submitted_by,
  task_id, payload:{submission_id, outcome}}` — payload sans nom de personne (doctrine
  RGPD) ;
- l'e-mail de retour à l'acteur part par l'outbox existante (cf. 4.6).

Chemin trigger = fonctionne quel que soit le chemin d'approbation (RPC modération,
correction manuelle service_role, futur bulk).

### 4.5 Frontend

**Arborescence.**

```
src/app/(portal)/espace/page.tsx              — accueil « Vos fiches »
src/app/(portal)/espace/fiches/[objectId]/page.tsx — la fiche en remplissage
src/app/(portal)/layout.tsx                   — garde persona + PortalShell
src/components/portal/PortalShell.tsx         — chrome dérivé d'AuthShell (logo, nom
                                                de l'acteur, déconnexion, footer légal)
src/services/portal.ts                        — submitActorFiche, listMyPortalFiches,
                                                listMySubmissions, getActorSectionVisibility
```

**Accueil.** `list_my_portal_fiches` → cartes (maquette écran 1) : nom, type, badge d'état
(À compléter / Vérification en cours / À jour), complétude. La complétude réutilise
`computeOverallCompletion` et exige le workspace complet : elle est chargée
**paresseusement par carte** (`usePrefetchObjectWorkspace`), plafonnée aux 10 premières
fiches ; au-delà, la carte affiche l'état sans pourcentage (les acteurs réels ont 1-5
fiches).

**Fiche.** Réutilisation d'`ObjectEditPage` via une prop `surface: 'portal'` (défaut
`'backoffice'`) :
- `contributorMode` forcé (`canWriteCanonicalDirect=false`) — redondant avec D7 côté DB,
  volontairement ;
- sections rendues = `getRegisteredSections(archetype)` ∩ matrice de visibilité ∩
  complément du plancher dur ;
- topbar : ni publication, ni statut, ni versions, ni import/export, ni presence-roster
  complet — seuls restent « Brouillon local enregistré » et **« Soumettre pour
  vérification »** ;
- bandeau permanent « Vos modifications seront vérifiées par l'office avant d'être
  publiées » ;
- si une soumission est `pending` : bouton désactivé « Vérification en cours » (l'acteur
  peut continuer à éditer son brouillon local) ;
- **brouillon localStorage** par fiche (`portal-draft:<objectId>`, versionné par
  `updated_at` du workspace ; jeté si la fiche canonique a bougé depuis, avec bannière
  d'explication). `useUnsavedDraftGuard` reste actif en complément.

**Soumission.** Modal (maquette écran 2 bas) : récap des sections modifiées + message
facultatif → `planSaveBatch` (mode contributeur) construit les enveloppes via
`buildContributorSubmission`, puis UN appel `submitActorFiche(objectId, changes, note)`
au lieu des N `submitPendingChange`. Succès → toast + retour accueil + purge du
brouillon local. Échec → rien n'est partiellement soumis (transaction).

**Suivi.** Sur l'accueil et dans la fiche : état de la dernière soumission
(`list_my_submissions`), motif de rejet visible par section (`review_note`).

**Côté back-office.**
- `CrmActorFiche` : bloc « Accès portail » (maquette écran 3) — état (aucun / invité /
  actif / dernière connexion), actions Inviter / Renvoyer / Révoquer.
- `SettingsPage` : sous-section « Portail acteurs » (rang ≥ 30) — matrice sections
  visibles par type, par ORG, plancher dur affiché verrouillé.
- `NotificationDrawer` + `services/notifications.ts` : rendu du kind
  `fiche_submission_reviewed` (pour les acteurs) ; le kind `crm_task_assigned` existant
  couvre déjà les éditeurs.
- `CrmTaches` : les tâches `extra.kind='fiche_verification'` reçoivent un chip
  « Vérification de fiche » et un lien « Ouvrir la modération »
  (`/moderation?object=<id>`). `ModerationPage` accepte le paramètre `?object=` en
  pré-filtre (elle sait déjà filtrer par objet côté RPC).
- `ModerationPage` — **vue groupée par soumission (D9)** : les lignes portant un
  `submission_id` sont regroupées sous un en-tête de soumission (fiche, acteur, date,
  message) avec les actions **« Tout approuver »** (`approve_fiche_submission` ;
  case à cocher « inclure les sections reportées manuellement » → `p_include_manual`)
  et **« Tout rejeter »** (`reject_fiche_submission`, motif obligatoire), en plus des
  boutons unitaires existants sur chaque ligne. Sur une ligne `manual_apply`, le bouton
  Approuver ouvre une confirmation « J'ai reporté cette modification dans l'éditeur »
  → `p_applied_manually=TRUE`. Les lignes sans `submission_id` (contributeurs internes
  §122) gardent l'affichage plat actuel.

### 4.6 Invitation / révocation (routes Next, service-role)

`POST /api/crm/actor-access` avec `{action: 'invite'|'resend'|'revoke', actorId, email?}`.

Autorisation (pattern `_document-auth.ts`) : Bearer JWT → `getUser` → client anon porteur
du JWT → `api.user_can_write_crm_actor(actorId)` **en tant qu'appelant**. Pas d'exigence
de rang plateforme : c'est un acte CRM, pas un acte d'administration d'équipe.

- **invite** : l'e-mail doit être un canal `email` existant de CET acteur (le trigger
  d'unicité globale garantit qu'il ne pointe pas ailleurs). Refus 409 si un compte
  `auth.users` existe déjà avec cet e-mail et que son profil n'est PAS
  `{role:'actor', actor_id: <ce même acteur>}` (on n'écrase jamais un compte staff).
  Sinon : `inviteUserByEmail(email, {redirectTo: ${origin}/set-password})` + upsert
  `app_user_profile {id, role:'actor', actor_id}`.
- **resend** : même règle que la route admin existante — suppression + re-invitation
  uniquement si `last_sign_in_at IS NULL`.
- **revoke** : uniquement si le profil cible est `role='actor'` ET `actor_id` = l'acteur
  visé (garde anti-suppression de staff, vérifiée serveur). Supprime le compte
  `auth.users` (cascade `app_user_profile`). L'acteur CRM, ses liens et ses soumissions
  passées restent intacts (`submitted_by` → NULL via ON DELETE SET NULL, historique
  conservé).

`/set-password` est réutilisé tel quel ; sa redirection finale `router.replace('/')`
aboutit chez `src/app/page.tsx` qui route par rôle → `/espace`. Le domaine `redirectTo`
est déjà dans l'allowlist Supabase (même origine que les invitations staff).

### 4.7 E-mails

- **Éditeurs (soumission)** : réutilisation intégrale du kind `crm_task_assigned` →
  outbox → `TaskAssignedEmail` (titre de tâche « Vérifier la fiche « X » » est
  auto-porteur). Zéro changement de drain pour ce sens.
- **Acteur (résolution)** : nouveau kind `fiche_submission_reviewed` →
  - étendre le filtre `kind` de `claim_unmailed_notifications`, de l'ack et de l'index
    partiel `idx_app_notification_unmailed` (les 3 ensemble, sinon la file fuit) ;
  - la charge du claim pour ce kind : e-mail du destinataire, nom de la fiche, issue
    (approuvée / refusée / partielle), note de revue ;
  - nouveau template `src/emails/SubmissionReviewedEmail.ts` (même facture que
    `TaskAssignedEmail`) ;
  - drain inchangé dans son mécanisme (`/api/crm/notify-drain`, SMTP côté Next,
    5 tentatives max). Le ping du drain est déclenché par `approve/reject` côté client
    modération (fire-and-forget, comme `saveCrmTask` aujourd'hui) ; le cron/rattrapage
    éventuel reste le même qu'aujourd'hui.

## 5. Parcours complets

1. **Ouverture d'accès** : l'éditeur ouvre la fiche prestataire CRM → « Accès portail »
   → Inviter → l'acteur reçoit l'e-mail → `/set-password` → `/` → `/espace`.
2. **Remplissage** : l'acteur ouvre une fiche → sections visibles selon matrice →
   brouillon local → « Soumettre pour vérification » + message → transaction : soumission
   + N pending_change + tâche multi-assignée + notifications + e-mails éditeurs.
3. **Vérification** : chaque éditeur voit la tâche (kanban, inbox, e-mail) → « Ouvrir la
   modération » → diffs avant/après → approuve (7 modules auto-appliqués) ou rejette
   (motif obligatoire). Dernier changement traité → soumission résolue, tâche `done`,
   acteur notifié (inbox + e-mail).
4. **Suivi acteur** : badge d'état par fiche, détail par section avec motifs de rejet ;
   il peut re-soumettre dès que la soumission précédente est résolue.
5. **Révocation** : bloc CRM → Révoquer → compte supprimé, données CRM intactes.

## 6. Sécurité — invariants vérifiés

| Invariant | Traitement |
|---|---|
| `is_object_owner` fermé aux acteurs (D7) | test SQL : persona acteur + lien primaire → `user_can_write_object_canonical` = FALSE |
| Équivalence `extended_object_ids` ↔ `can_read_extended` | branchement ajouté aux DEUX + extension de `tests/test_read_gate_setbased.sql` |
| 4 formulations PII (`can_read_actor_contacts`) inchangées | test : persona acteur → `can_read_actor_contacts` FALSE, `search_actors` 42501 (via `current_user_can_edit_objects` FALSE), `export_actor_contacts` vide |
| Pas de kind e-mail orphelin | claim + ack + index partiel étendus dans la même migration |
| `COALESCE(…, FALSE)` sur toute sonde 3-états (doctrine §204) | `is_actor_persona`, sondes portail |
| Aucune écriture directe PostgREST sur `fiche_submission` / matrice | RLS admin-only + interdiction `client.from()` (commentaire d'en-tête de service, comme `moderation.ts`) |
| `submit_actor_fiche` refuse les sections masquées ET le plancher dur | vérif serveur sur `metadata.section` — le masquage front n'est pas la barrière |
| Pas de writer arbitraire en base | `metadata.rpc` validé contre la whitelist §120 dès la soumission |
| Anti-spam | index unique partiel « une soumission ouverte par fiche » + plafond 40 changements/soumission |
| E-mail bridge non élargi | la persona acteur passe par `actor_id`, jamais par correspondance e-mail ; confirmé par test (compte acteur avec e-mail d'un AUTRE acteur → périmètre = celui de son `actor_id` seul) |
| RGPD | payloads de notification sans nom ; l'effacement RGPD d'un acteur supprime aussi son compte portail (extension du chemin d'effacement existant : si un `app_user_profile.actor_id` pointe l'acteur effacé → suppression du compte auth) |

## 7. Cas limites

- **Aucun éditeur éligible** (org sans `validate_changes`) : repli rangs admin ; sinon
  tâche non assignée + `assignee_count=0` remonté au client et loggé. La soumission
  n'échoue jamais pour ça.
- **Acteur lié à des fiches de plusieurs ORG** : le portail fonctionne par fiche ; la
  matrice de visibilité et les vérificateurs sont résolus par l'ORG publisher de CHAQUE
  fiche. (Un acteur n'a pas d'ORG « active » — il n'a pas de `user_org_membership`.)
- **Lien qui expire pendant une soumission ouverte** : la fiche disparaît du portail ;
  la soumission suit son cours normal côté éditeurs.
- **Fiche supprimée** : `fiche_submission` et `pending_change` cascadent (FK existants).
- **Compte staff dont l'e-mail est aussi un canal acteur** : rien ne change pour lui
  (pont e-mail intact pour les non-acteurs) ; l'invitation portail sur cet e-mail est
  refusée en 409.
- **Acteur sans canal e-mail** : bouton Inviter désactivé avec explication (ajouter
  d'abord un e-mail au canal).
- **Deux personnes partagent une boîte** : impossible côté acteurs (unicité globale des
  e-mails d'acteur, trigger existant).
- **`object.is_editing`** : flippé par toute soumission (trigger existant) — assumé ;
  c'est le signal « fiche en cours de traitement » existant.
- **Brouillon local vs fiche modifiée entre-temps** : brouillon versionné par
  `updated_at` ; en cas de divergence, brouillon écarté avec bannière (pas de merge
  silencieux).
- **Approbation partielle** : statut `partial`, notification détaillée par section.
- **`list_pending_changes` enrichi** : la vue groupée a besoin de `submission_id`, du
  message de soumission et d'un label acteur par ligne — le RPC est étendu de ces
  colonnes (jointure `fiche_submission`), NULL pour les propositions hors soumission.
- **22/29 modules non auto-applicables** (whitelist §120 à 7 writers) : assumé en v1 —
  le vérificateur reporte à la main puis **atteste** (`p_applied_manually`, cf. 4.3 bis) ;
  la ligne passe `approved` et la soumission peut se résoudre. L'extension de la
  whitelist reste le chantier de suite n°1 (§9).

## 8. Plan de test

**SQL** (`Base de donnée DLL et API/tests/test_actor_portal.sql`, gabarit des tests
existants, + gate CI fresh-apply) :
- A. persona : CHECK role, `is_actor_persona`, `current_user_actor_id` ;
- B. périmètre : liens valides/expirés/ORG/1b fermé ; équivalence set/point étendue ;
- C. D7 : lien primaire + persona acteur → toutes les sondes d'écriture FALSE, un
  `save_object_*` échoue en 42501 ;
- D. `submit_actor_fiche` : nominal (compte des lignes créées, assignés, notifications),
  refus section masquée, refus plancher dur, refus double soumission, refus writer
  hors whitelist, refus non-acteur, refus hors périmètre ;
- E. `list_object_verifier_ids` : matrice §227, grant individuel, repli admin, vide ;
- F. résolution : approve/reject/mixte → statut, tâche `done`, notification acteur ;
- F2. D9 : `approve_pending_change(p_applied_manually)` — refus sans attestation sur
  manual_apply (comportement actuel préservé), `approved` avec ; `approve_fiche_submission`
  — nominal, `p_include_manual` FALSE laisse les manuels `pending`, rollback complet si un
  writer échoue, gate modérateur ; `reject_fiche_submission` — note obligatoire, ne touche
  pas les lignes déjà traitées, mixte unitaire+groupé → `partial` ;
- G. invariants PII (§6) ;
- H. matrice de visibilité : défauts, écriture rang ≥ 30, refus plancher dur ;
- I. régression : pour un `tourism_agent`, `extended_object_ids` byte-identique à avant.

**Front (RTL/jest)** : routage par rôle (les 2 layouts), filtrage des sections (matrice +
plancher), désactivation du bouton en soumission ouverte, modal de soumission → payload
`submitActorFiche` conforme aux enveloppes contributeur, bloc « Accès portail » (états +
409), rendu du nouveau kind de notification, brouillon localStorage (restauration +
invalidation).

**E2E (parcours 1-3 de §5)** sur environnement de dev avec données réelles (doctrine
« prefer real DB data »).

## 9. Hors périmètre v1 (chantiers de suite, par ordre de valeur)

1. **Extension de la whitelist d'auto-application** : écrire des writers uniformes
   `(p_object_id, p_payload)` pour les sections les plus soumises par les acteurs
   (descriptions, contacts, médias, tarifs) et les ajouter à `v_allowed` — c'est ce qui
   transformera la vérification en un clic.
2. Édition par l'acteur de ses propres coordonnées (`actor_channel`) avec re-modération.
3. Branding par ORG du portail (`get_org_branding` existe, aucun consommateur runtime).
4. Realtime sur l'inbox de notifications (aujourd'hui poll 30 s).
5. Digest e-mail hebdo « fiches à compléter » vers les acteurs.
6. Magic-link / OTP en plus du mot de passe.

## 10. Livraison

- **Une migration** `migration_actor_portal.sql` (idempotente, gardes d'état préalable
  comme 17i) + entrée manifest + section runbook (`docs/SQL_ROLLOUT_RUNBOOK.md`, vague
  après la dernière — re-grep avant de figer le numéro) + mise à jour des DEUX README +
  `ci_fresh_apply.sql`.
- md5 `prosrc`↔fichier avant/après pour chaque fonction amendée
  (`current_user_extended_object_ids`, `can_read_extended`, `is_object_owner`) —
  doctrine lot-corrections.
- Front en commits par tranche fonctionnelle (persona/routing → portail lecture →
  soumission → CRM accès → settings matrice), chaque tranche vérifiée avant commit.
- Ordre de déploiement : migration d'abord (inerte tant qu'aucun compte `actor`
  n'existe), front ensuite — le rôle `actor` n'est attribuable que par la nouvelle
  route, donc aucun état intermédiaire dangereux.

## 11. Références

- Recon 6 sous-systèmes (2026-09-01) : actor-model, auth-roles, editor, moderation,
  crm-tasks, shell-routing — scratchpad de session.
- Fichiers pivots : `rls_policies.sql` (helpers), `migration_moderation_rpcs.sql` (§120),
  `migration_crm_task_multi_assignee_notifications.sql` (16z),
  `migration_crm_assignee_eligibility.sql` (17c), `migration_role_permission_matrix.sql`
  (17i/§227), `migration_permission_write_paths.sql` (`is_object_owner`),
  `src/features/object-editor/contributor-proposal.ts`,
  `src/features/object-editor/useEditorSave.ts`, `src/views/ModerationPage.tsx`,
  `src/features/crm/CrmActorFiche.tsx`, `src/components/auth/AuthShell.tsx`,
  `src/app/api/admin/invite/route.ts`, `src/app/api/_document-auth.ts`.

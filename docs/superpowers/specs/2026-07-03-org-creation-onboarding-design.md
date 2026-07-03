# Création d'organisation (ORG), onboarding & branding par ORG — Design

**Date :** 2026-07-03
**Statut :** validé PO (périmètre + gouvernance actés en session)
**Plan :** `docs/superpowers/plans/2026-07-03-org-creation-onboarding.md`

## 1. Problème

Aucune surface de l'app ne permet de créer une organisation. La seule ORG existante
(« OTI du Sud ») a été seedée en SQL (`seeds_data.sql:1068`). Le dialog de création B1
exclut volontairement le type ORG, l'éditeur n'a pas d'archétype ORG, et la voie générique
`api.rpc_create_object` produirait un objet `draft` **impubliable** (`rpc_publish_object`
exige une ORG *publisher* sur l'objet — une ORG n'en a pas). Par ailleurs plusieurs
hypothèses mono-org tiennent l'app : `/team` cible l'ORG de session ou, pour un superadmin
sans membership, « la première ORG par created_at » (`getDefaultOrgId()`), et le branding
(`app_branding_settings`) est un singleton plateforme.

## 2. Décisions PO (actées en session, 2026-07-03)

1. **Périmètre = onboarding complet** : le superadmin crée l'ORG **et** invite son premier
   admin dans la foulée ; l'ORG est immédiatement autonome. Inclut le minimum multi-org :
   `/team` (section Équipe de /settings) sait cibler une ORG choisie.
2. **Branding par ORG** : chaque ORG a son thème/logo, résolu **après connexion** selon le
   membership de l'utilisateur.
3. **Gouvernance branding** : superadmin (toute ORG) + admin de l'ORG (la sienne, rang
   `org_admin` = 30).
4. **Avant connexion** : `/login` et `/set-password` gardent le **branding plateforme**
   (singleton actuel, `get_public_branding` inchangé).

## 3. Architecture

### Lot 1 — Onboarding ORG (livrable seul)

**Backend** (`migration_org_onboarding.sql`, autonome, listée au runbook + manifest CI) :

- `api.rpc_create_org(p_name, p_region_code DEFAULT 'RUN', p_access_scope DEFAULT 'own_objects_only')`
  → `SECURITY DEFINER`, **superuser-only** (`api.is_platform_superuser()`), même modèle que
  `rpc_delete_object` (l'autre acte plateforme). En une transaction :
  - `INSERT object (type ORG, status 'published', published_at = NOW())` — l'INSERT direct
    en `published` est licite : `trg_guard_object_status_change` est `BEFORE UPDATE OF status`
    (il ne gate pas l'INSERT), et `trg_manage_object_published_at` gère le *passage* à
    published ⇒ on pose `published_at` explicitement. Une ORG doit naître publiée : la
    lisibilité RLS de ses membres (memberships, /team, branding) en dépend, et l'Explorer
    exclut le type ORG de toute façon.
  - id généré par `trg_before_insert_object_generate_id` (format `ORGRUN…`).
  - `INSERT org_config (org_object_id, access_scope)`.
  - Gardes : `NO_AUTH_CONTEXT` (auth.uid() requis), `FORBIDDEN` (non-superuser),
    `MISSING_REQUIRED_FIELD` (nom vide), `INVALID_ACCESS_SCOPE`, `DUPLICATE_ORG`
    (nom identique casse-insensible + même région parmi les objets ORG).
- `api.rpc_list_orgs()` → DEFINER superuser-only : liste des ORG avec
  `access_scope` + `member_count` (memberships actifs) en une requête set-based
  (la liste alimente le module admin ET le sélecteur /team du superadmin).

**Frontend :**

- Service `src/services/orgs.ts` : `listOrgs()`, `createOrg(input)`.
- Module « Organisations » dans la console admin `/settings` (groupe Plateforme,
  gated `role === 'super_admin'` comme referentiels/ai/partner-keys) :
  - `OrgsPanel` : tableau des ORG (nom, statut, périmètre d'accès, membres, créée le)
    + CTA « Nouvelle organisation » + action par ligne « Gérer l'équipe »
    (`/settings?section=team&org={id}`).
  - `CreateOrgDialog` (Modal maison, 2 étapes) : ① nom / région / périmètre d'accès →
    `rpc_create_org` ; ② invitation du premier admin (optionnelle, skippable) : e-mail +
    rôle métier → chaîne existante `inviteUser` (route `/api/admin/invite`, déjà
    superuser-armée) + `upsertMembership` + `setAdminRole(membership, 'org_admin')` +
    préréglage de permissions. Les bras superuser (rang 999) des RPCs d'équipe existent déjà.
- `/team` (TeamAdminPage) : pour un superadmin, **sélecteur d'ORG** alimenté par
  `listOrgs()` (initialisé par `?org=` s'il est présent, sinon l'ORG de session, sinon la
  première) ; remplace le fallback aveugle `getDefaultOrgId()`. Les membres non-superadmin
  gardent leur ORG de session, sans sélecteur.

### Lot 2 — Branding par ORG (s'appuie sur le lot 1)

**Backend** (`migration_org_branding.sql`, autonome, runbook + manifest CI) :

- Table `org_branding_settings` : `org_object_id TEXT PK REFERENCES object(id) ON DELETE
  CASCADE` (+ trigger type-ORG, modèle `check_org_config_org_type`), champs identité tous
  **NULLABLE** : `brand_name`, `logo_storage_path/public_url/mime_type`, 5 couleurs (CHECK
  regex `#RRGGBB` quand non NULL), `extra JSONB`. **Pas de `marker_styles`** (les pins
  carte sont des PNGs statiques — per-org différé). RLS : lecture `TO authenticated
  USING (true)` (pas d'`auth.*()` nu — garde CI §39/§146) ; **aucune policy d'écriture
  directe** (écritures = RPC DEFINER uniquement).
- `api.user_can_manage_org_branding(p_org)` : superuser OU membership actif + rôle admin
  actif rang ≥ 30 dans **cette** ORG.
- `api.get_org_branding(p_org)` (gated) : ligne brute (NULL = hérite) + payload résolu.
- `api.upsert_org_branding(p_org, …mêmes champs…, p_clear_logo, p_reset)` (gated) ;
  `p_reset = TRUE` supprime la ligne (retour complet au thème plateforme).
- `api.get_app_branding()` **modifiée** : résout l'ORG de l'appelant
  (`api.current_user_org_id()` — l'invariant « un seul membership actif par user » rend la
  résolution non ambiguë) puis **COALESCE champ par champ** ligne ORG → singleton
  plateforme ; `markerStyles` toujours plateforme ; clé `orgObjectId` ajoutée au payload.
  **Signature et forme inchangées ⇒ zéro changement du pipeline d'application du thème
  côté front.** `get_public_branding` inchangée (login = plateforme).

**Frontend :**

- Route `/api/branding/logo/upload` étendue : champ `orgObjectId` optionnel → autorisation
  AS THE CALLER via `user_can_manage_org_branding` ; chemin `org/{orgId}/…` dans le bucket
  `branding-assets`. Invariant single-writer conservé (aucune écriture Storage directe client).
- `branding.ts` : `getOrgBranding(orgId)`, `saveOrgBranding(orgId, input)`.
- UI : `OrgBrandingDialog` (nom de marque, logo, 5 couleurs ; champ vide = hérite du
  thème plateforme, aperçu résolu affiché ; « Revenir au thème plateforme » = reset) —
  réutilisé par (a) l'action « Branding » du tableau Organisations (superadmin) et (b) une
  nouvelle section « Apparence de l'organisation » dans le groupe « Mon organisation » de
  /settings, gated rang admin ≥ 30, bornée à l'ORG de session. Après save : invalidation
  des queries `['branding','authenticated']` (pattern existant).

## 4. Hors périmètre (différés, à consigner au journal)

- Marker styles par ORG (pins statiques = chantier régénération).
- Login brandé par URL/sous-domaine (`get_public_branding(p_org)` anon).
- Switcher multi-org global de session (au-delà du ciblage /team + branding).
- Archétype ORG dans l'éditeur de fiche (une ORG ne s'édite pas comme une fiche).
- Suppression/archivage d'ORG depuis l'UI (FK RESTRICT + `rpc_delete_object` rejette ORG).

## 5. Invariants respectés

- Création d'ORG = **une seule voie**, `api.rpc_create_org` (jamais `rpc_create_object`,
  jamais le dialog B1 — qui continue d'exclure ORG). Proposition CLAUDE.md incluse au plan.
- Policies neuves : formes wrappées/`TO role` (garde CI `test_rls_initplan_broad_sweep`).
- Storage : single-writer via route service-role autorisée AS THE CALLER (CLAUDE.md §59/§166).
- Déploiement : migrations autonomes **listées au runbook + `ci_fresh_apply.sql`** avec
  tests SQL comportementaux (gate fresh-apply) ; jamais de DDL live-only.
- Journal : nouveau § dans `lot1_mapping_decisions.md` + lignes différés WORKFLOW.md.

## 6. Tests

- SQL : `tests/test_org_onboarding.sql` (création superuser OK → published + org_config +
  format id ; non-superuser refusé ; doublon refusé ; scope invalide refusé ; list_orgs
  gated) ; `tests/test_org_branding.sql` (résolution par champ, gates d'écriture croisés
  org A/org B, anon exclu, `get_public_branding` inchangée). Les deux branchés au manifest.
- Front : Jest (services orgs/branding params + parsing, validation CreateOrgDialog,
  sélecteur TeamAdminPage, gating settings-nav) + `npm run typecheck`.

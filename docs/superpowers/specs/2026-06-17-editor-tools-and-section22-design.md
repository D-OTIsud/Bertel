# Éditeur plein-écran — CTA §22 + outils (historique, import/export, archiver)

> Spec de design — 2026-06-17. Couvre 4 features sur la page `/objects/[id]/edit`.
> Décidé avec le PO : périmètre global d'abord, puis implémentation incrémentale.
> Décision log de référence : `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`.

## 1. Contexte & état actuel

La page éditée a un groupe **OUTILS** déjà présent dans la nav de gauche
([`EditorNav.tsx:18-23`](../../../bertel-tourism-ui/src/features/object-editor/shell/EditorNav.tsx)),
codé en dur comme 4 entrées `disabled: true` / `title="Bientôt disponible"` :
`Versions / historique` (badge `v12` factice), `Import / export`, `Dupliquer la fiche`, `Archiver`.

Le §22 **« Identifiants externes & synchronisation »**
([`SectionSync.tsx`](../../../bertel-tourism-ui/src/features/object-editor/sections/SectionSync.tsx))
affiche un CTA `+ Lier un nouvel identifiant externe` et un bouton ✎ par ligne, tous `disabled`.

### Réalité backend (vérifiée)
| Élément | État |
|---|---|
| `object_external_id` (table) | Existe ; admin-only (familles `admin_*` par commande) ; **aucune RPC d'écriture** ; colonnes : `object_id`, `organization_object_id`, `source_system`, `external_id`, `last_synced_at`. |
| `object_version` (table) | Partitionnée par mois ; **snapshot JSONB complet de la ligne `object`** (`to_jsonb(object)`), capté par le trigger `save_object_version()` sur INSERT/UPDATE/DELETE (les changements cache-only sont ignorés). Colonnes : `version_number`, `data`, `created_at`, `created_by`, `change_type`, `change_reason`. Index `(object_id, created_at DESC)`. **Aucune RPC de lecture.** |
| Archiver | `api.rpc_set_object_status(p_object_id, p_status)` **existe** + hook `useSetObjectStatusMutation` + déjà exposé en §21 Publication. |
| Dupliquer | **Aucune RPC.** (Feature retirée — voir §2.) |
| Import / export | **Aucun backend.** |

### Helpers d'autorisation réutilisés (vérifiés)
- `api.is_platform_superuser()` — superuser plateforme.
- `api.current_user_admin_role_code()` — code de rôle admin ORG actif (NULL si aucun).
- `api.current_user_org_id()` — ORG active du user (dérive `organization_object_id`).
- `api.current_user_readable_object_ids()` — set lisible (published ∪ extended) pour l'authorize-once (§36).
- `api.user_can_write_object_canonical(text)` — gate d'écriture canonique.

## 2. Périmètre & décisions verrouillées

**4 features** (l'outil **« Dupliquer la fiche » est retiré** sur demande PO — il
recouvrait le chantier B1 « création d'objet » non bâti ; l'entrée nav sera supprimée) :

| # | Feature | Backend neuf ? | Décision PO |
|---|---|---|---|
| A | §22 — CTA identifiants externes fonctionnel | Oui (2 RPC) | Écriture **admin ORG / superuser uniquement** ; sources canoniques OTI/SU verrouillées. |
| B | Outil **Archiver** | Non | Réutilise `rpc_set_object_status` + `ConfirmDialog` ; bascule Archiver↔Restaurer. |
| C | Outil **Versions / historique** | Oui (2 RPC) | Timeline + diff **et restauration** (canonique uniquement, avec avertissement). |
| E | Outil **Import / export** | Non (front) | Export **JSON + CSV + PDF** ; Import = **fichier JSON round-trip** appliqué sur la fiche courante. Connecteurs live différés. |

**Ordre d'implémentation incrémental : B → A → C → E.**

## 3. Design par feature

### A · §22 — CTA identifiants externes

**Backend** — `migration_object_external_id_writes.sql` (SECURITY DEFINER, `search_path = public, api, internal`, UUID via `gen_random_uuid()` — invariant CLAUDE.md) :

- `api.rpc_upsert_object_external_id(p_object_id text, p_source_system text, p_external_id text, p_last_synced_at timestamptz default null) returns uuid`
  - Gate : `api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL`, sinon `RAISE EXCEPTION` (403-like).
  - Dérive `organization_object_id := api.current_user_org_id()` (le client ne choisit jamais l'org).
  - Refuse les **sources canoniques** : `upper(p_source_system) IN ('OTI','SU')` ou `lower(p_source_system) LIKE '%canonical%'` ⇒ exception.
  - `INSERT ... ON CONFLICT (object_id, organization_object_id, source_system) DO UPDATE SET external_id, last_synced_at, updated_at` (respecte `uq_object_external_id_object_org_source`).
- `api.rpc_delete_object_external_id(p_id uuid) returns void`
  - Même gate ; vérifie que la ligne appartient à `current_user_org_id()` et n'est pas canonique.
- Grants : `REVOKE ... FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role;`

**Frontend** — `SectionSync.tsx` + nouvelle modale + hooks :
- Si non-admin : CTA/✎ restent désactivés avec raison explicite (`Réservé aux administrateurs`).
- Si admin : CTA → `ExternalIdEditModal` (select source non-canonique [AT/AP/DT/custom] + champ identifiant) ; ✎ par ligne non verrouillée → édition/suppression.
- Le flag admin vient des `permissions` de la resource workspace si présent, sinon un petit helper `api`/colonne dédiée (à pin en planning — voir §6).
- Hooks : `useUpsertExternalIdMutation`, `useDeleteExternalIdMutation` (invalident `['object-workspace', id]`).
- Service : ajouts dans `services/object-workspace.ts` (callers RPC).

**Tests** : SQL (`test_object_external_id_writes.sql`) — gate admin, refus canonique, dérivation org, upsert/delete. Jest — rendu CTA admin vs non-admin, mapping modale.

### B · Outil « Archiver »

**Backend** : aucun.
**Frontend** :
- L'entrée OUTILS « Archiver » devient un bouton actif (rouge/danger) → `ConfirmDialog` → `useSetObjectStatusMutation('archived')`.
- Si `status === 'archived'` : libellé « Restaurer » → `rpc_set_object_status` vers `hidden`/`draft` (mirror de `computeStatusActions`).
- Désactivé avec raison si `!permissions.publication.canDirectWrite`.
- Réutilise `status-actions.ts` (`computeStatusActions`) pour la cible de restauration.

**Tests** : Jest — libellé Archiver↔Restaurer selon statut, désactivation sans droit, appel mutation.

### C · Outil « Versions / historique »

**Backend** — `migration_object_version_read_restore.sql` :

- `api.get_object_versions(p_object_id text, p_limit int default 50, p_offset int default 0) returns table(...)`
  - **Authorize-once** : `IF p_object_id NOT IN (SELECT api.current_user_readable_object_ids()) THEN RAISE ...` (la fn s'auto-autorise — DEFINER, PostgREST-exécutable, §36).
  - Retourne par version : `version_number`, `created_at`, `created_by_name` (résolu via `app_user_profile`), `change_type`, `change_reason`, et `changed_fields` (clés du `data` qui diffèrent de la version précédente — `LAG(data) OVER (ORDER BY version_number)`, en excluant les colonnes cache/`updated_at`/`current_version`).
- `api.get_object_version_snapshot(p_object_id text, p_version_number int) returns jsonb`
  - Même authorize-once ; retourne `data` (snapshot canonique) pour le diff détaillé d'une version.
- `api.rpc_restore_object_version(p_object_id text, p_version_number int) returns void`
  - Gate : `api.user_can_write_object_canonical(p_object_id)`.
  - Charge le snapshot, `UPDATE object SET ...` **uniquement** sur les colonnes canoniques inscriptibles ; **exclut** : `id`, `current_version`, `created_at/by`, `updated_at`, `is_editing`, toutes les colonnes `cached_*`, et **`status`** (le changement de statut passe par `rpc_publish_object`/`rpc_set_object_status` — `trg_guard_object_status_change`).
  - Le trigger `save_object_version` capte automatiquement une nouvelle version (l'historique est append-only ; restaurer = nouvelle version, pas de réécriture du passé).

**Frontend** :
- L'entrée OUTILS « Versions / historique » → `VersionHistoryModal` : liste timeline (vN · date · auteur · type), expand → diff des champs canoniques (avant/après via snapshot courant vs choisi).
- Bouton **« Restaurer cette version »** par ligne, avec avertissement clair : « restaure les champs principaux uniquement (pas les médias/tarifs/etc.) ; crée une nouvelle version ».
- Badge nav `v12` ⇒ vrai `current_version` (depuis la resource).
- Hooks : `useObjectVersionsQuery`, `useRestoreObjectVersionMutation` (invalide workspace + detail).

**Tests** : SQL (`test_object_version_read_restore.sql`) — authorize-once (scope), `changed_fields`, restore exclut `status`/caches/id, restore crée une nouvelle version. Jest — rendu timeline, diff, confirm restauration.

### E · Outil « Import / export »

**Export (frontend uniquement)** :
- `ImportExportModal` avec 3 actions :
  - **JSON** : sérialise la resource workspace chargée (`editor.draft` modules) en fichier téléchargeable (`{objectId}.json`).
  - **CSV** : sous-ensemble à plat (identité, localisation, contacts clés…) via une fonction pure `serializeObjectCsv`.
  - **PDF** : vue imprimable via `window.print()` (réutilise l'aperçu fiche ; ajouter un `@media print` minimal si besoin).
- Fonctions pures testables : `serializeObjectJson(draft)`, `serializeObjectCsv(draft)`.

**Import (frontend uniquement, sur la fiche courante)** :
- Upload d'un JSON **précédemment exporté** → `parseImportedObjectJson` (guard de forme) → patch des modules `editor.draft` (marque dirty) → l'utilisateur **revoit puis enregistre** via les chemins de sauvegarde existants.
- **Pas de création d'objet** (éviter la dépendance B1) : l'import applique sur la fiche ouverte, il ne crée pas une nouvelle fiche.
- Confirmation explicite avant d'écraser le brouillon courant.

**Tests** : Jest — round-trip `serialize→parse` idempotent, guard rejette un JSON malformé, patch marque les bons modules dirty.

## 4. Cross-cutting

- **`EditorNav`** : remplacer `TOOL_ITEMS` codé en dur par une prop `tools: ToolItem[]` (label, onClick, disabled, disabledReason→`title`, badge, danger). **Supprimer l'entrée « Dupliquer la fiche ».** Les handlers + l'état dynamique (compte de versions, libellé Archiver↔Restaurer) viennent de `ObjectEditPage`.
- **Nouvelles modales** : `ExternalIdEditModal`, `VersionHistoryModal`, `ImportExportModal` (style maison, pattern compact+modale conforme aux préférences PO). Archiver réutilise `ConfirmDialog`.
- **Déploiement (invariant CLAUDE.md)** : chaque migration neuve est ajoutée au manifeste/runbook (`docs/SQL_ROLLOUT_RUNBOOK.md`) avec un id de série (prochain id libre à confirmer, série 14) + repliée dans `schema_unified.sql`/`api_views_functions.sql`, avec un test CI. Une fresh DB doit reproduire le live.

## 5. Hors périmètre / différé

- **Dupliquer la fiche** — retiré (recouvre B1 création d'objet).
- **Connecteurs d'import live** (Apidae / DataTourisme / Airtable / Berta) — intégration lourde, spec dédiée ultérieure.
- **Import comme nouvelle fiche** — bloqué sur B1 (mint d'`object.id`).
- **Restauration des tables enfants** (médias, tarifs, ouvertures…) — un snapshot `object_version` ne couvre que le canonique ; restauration profonde non couverte.

## 6. Risques & détails à fixer en planning

1. **Flag « admin »** côté front pour §22 : la resource workspace expose-t-elle déjà un indicateur admin, ou faut-il une petite RPC/clé (`is_org_admin`) ? À vérifier avant d'implémenter A.
2. **Restauration & guard de statut** : confirmer que l'exclusion de `status` évite `trg_guard_object_status_change`.
3. **Résolution `created_by` → nom** : table `app_user_profile` (jointure dans `get_object_versions`).
4. **PDF** : pas de feuille de style print existante — `window.print()` de l'aperçu peut nécessiter un `@media print` minimal.
5. **CSV** : arrêter la liste exacte des colonnes à plat.
6. **Prochain id de manifeste SQL** (série 14) à confirmer dans le runbook.

## 7. Stratégie de vérification

- **SQL** : un fichier de test par migration (gates, verrous canoniques, authorize-once, exclusions de restauration) ; appliqué en transient + ROLLBACK puis live via MCP ; advisor clean.
- **Front** : TDD (fonctions pures d'abord — serializers, diff, reconcile), specs de section/modale, suite Jest complète verte + `tsc` + `next build`.
- **Manuel** : preview du parcours (CTA §22 admin, archiver/restaurer, ouvrir historique + restaurer, export JSON/CSV/PDF, import round-trip).

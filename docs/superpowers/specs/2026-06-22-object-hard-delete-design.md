# Suppression définitive d'une fiche (admin-only, irréversible) — Design

**Date** : 2026-06-22
**Décision log** : §108 (à confirmer libre au moment de la clôture)
**Manifest SQL** : step **14x** (prochain id libre ; confirmer contre `docs/SQL_ROLLOUT_RUNBOOK.md` au déploiement)
**Statut** : design validé par le PO (2026-06-22), prêt pour le plan d'implémentation

---

## 1. Problème

Une fiche (`object`) ne peut aujourd'hui qu'être **archivée** (`api.rpc_set_object_status` → statut `archived`).
Il n'existe **aucune voie de suppression définitive**. Le PO veut, pour les administrateurs, pouvoir
**supprimer complètement** une fiche — au-delà de l'archivage — **y compris les médias associés** (et tout
ce qui en dépend).

C'est aussi une lacune RGPD identifiée (« no erasure tooling » au niveau objet) : l'effacement RGPD existant
(`api.rpc_gdpr_erase_subject`) couvre des *sujets* (acteur, avis, contact…), pas la fiche établissement entière.

## 2. Décisions verrouillées (PO, 2026-06-22)

| Axe | Décision |
|-----|----------|
| **Qui** | **Superadmin plateforme uniquement** (`api.is_platform_superuser()`) — comme l'effacement RGPD. |
| **Garde-fou** | **Les deux** : la fiche doit d'abord être `archived`, **ET** l'admin doit retaper le nom exact de la fiche pour confirmer. |
| **Portée** | **Établissements uniquement** — les objets `object_type = 'ORG'` sont **rejetés** (FK RESTRICT sur adhésions/config ; suppression d'ORG = acte bien plus lourd, hors périmètre). |
| **Traçabilité** | **Journal immuable** qui **survit** à la suppression (qui, quand, id + nom + type + nb médias/documents). |

## 3. Approche

On **calque la voie déjà éprouvée** de l'effacement RGPD Art. 17 :
`api.rpc_gdpr_erase_subject` (DEFINER, gated `is_platform_superuser`) **+** la route
`src/app/api/rgpd/erase/route.ts` (qui exécute le RPC *en tant qu'appelant*, puis supprime les fichiers Storage
en service-role car `media.url` est une simple chaîne sans FK).

**Alternatives écartées** :
- *Suppression relationnelle* : s'appuyer sur les `ON DELETE CASCADE` **déjà en place** (~70 FK enfants, dont
  `object_relation` dans **les deux sens** `source_object_id`/`target_object_id`) plutôt que des `DELETE`
  table-par-table à maintenir. Vérifié : un `DELETE FROM object` nettoie l'intégralité des lignes object-keyed.
- *Nettoyage Storage* : **balayage synchrone dans la route** (comme RGPD, zéro orphelin immédiat) plutôt qu'un
  GC différé. Le GC périodique global bucket↔`media.url` reste un item différé séparé (inchangé).

### Comportement des FK à la suppression (vérifié dans `schema_unified.sql`)

- **Enfants object-keyed** (`media`, `object_description`, `object_relation` ×2, classifications, tags, ouvertures,
  tarifs, chambres, documents, etc.) : `ON DELETE CASCADE` → supprimés automatiquement.
- **Références `org_object_id` / `partner_object_id`** : `ON DELETE SET NULL` ou `CASCADE` → ne bloquent pas.
- **FK `RESTRICT`** rencontrées : ciblent exclusivement des objets **ORG** (`user_org_membership.org_object_id`,
  `org_config.org_object_id`, `…organization_object_id`). Comme les ORG sont **exclus du périmètre**, aucune
  `RESTRICT` ne s'applique à une fiche d'établissement. (Si jamais une telle FK bloquait, Postgres lève l'erreur
  et la transaction du RPC rollback proprement — comportement fail-safe acceptable.)

## 4. Composants

### Composant 1 — Migration SQL `migration_object_hard_delete.sql` (manifest 14x)

**a) Table `public.object_deletion_log`** (journal immuable, calquée sur `gdpr_erasure_log`)

Colonnes :
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `object_id text NOT NULL`
- `object_name text`
- `object_type text`
- `status_at_deletion text`
- `media_deleted_count int NOT NULL DEFAULT 0`
- `document_deleted_count int NOT NULL DEFAULT 0`
- `performed_by uuid` (= `auth.uid()`)
- `performed_at timestamptz NOT NULL DEFAULT now()`
- `report jsonb`

RLS : `ENABLE ROW LEVEL SECURITY` ; policy **read superuser-only**
`USING ((SELECT api.is_platform_superuser()))` (forme InitPlan §39) ;
`REVOKE ALL … FROM PUBLIC, anon` ; `GRANT SELECT … TO authenticated` ; `GRANT ALL … TO service_role`.
**Aucune** policy d'écriture : la table n'est alimentée que par le RPC DEFINER ci-dessous.
Pas de FK `object_id → object(id)` (volontaire : la ligne doit **survivre** à la suppression de l'objet).

**b) `api.rpc_delete_object(p_object_id text, p_confirm_name text) RETURNS jsonb`**
`LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth`

Étapes (toutes dans une seule transaction implicite) :
1. `v_caller := auth.uid()` ; si NULL → `RAISE EXCEPTION 'NO_AUTH_CONTEXT: …'`.
2. Si **NOT** `api.is_platform_superuser()` → `RAISE EXCEPTION 'FORBIDDEN: suppression réservée aux administrateurs plateforme'`.
3. `SELECT name, object_type, status INTO …` ; si `NOT FOUND` → `RAISE EXCEPTION 'NOT_FOUND: object % …'`.
4. Si `object_type = 'ORG'` → `RAISE EXCEPTION 'FORBIDDEN_ORG: les organisations ne peuvent pas être supprimées par cet outil'`.
5. Si `status <> 'archived'` → `RAISE EXCEPTION 'MUST_ARCHIVE_FIRST: archivez la fiche avant de la supprimer définitivement'`.
6. Si `btrim(p_confirm_name) <> btrim(v_name)` → `RAISE EXCEPTION 'NAME_MISMATCH: le nom de confirmation ne correspond pas'` (défense en profondeur ; l'UI l'exige déjà).
7. Collecte **avant** suppression :
   - `v_media text[]` := `array_agg(url)` depuis `media WHERE object_id = p_object_id AND url IS NOT NULL`
     (les lignes `media` sont object-keyed `ON DELETE CASCADE` — elles partiront avec l'objet ; on collecte juste les URLs Storage).
   - `v_docs text[]` := URLs des **documents orphelinés par CETTE suppression**. Les documents sont des lignes
     **partagées** `ref_document` (url `NOT NULL UNIQUE`), reliées via la table de lien `object_document`
     (`object_id` CASCADE, `document_id → ref_document` CASCADE). Au `DELETE` de l'objet, seul **le lien** part ;
     `ref_document` (et son fichier) **persiste**. On ne supprime donc que les `ref_document` qui ne seront plus
     liés à **aucun autre** objet :
     `SELECT rd.url FROM object_document od JOIN ref_document rd ON rd.id = od.document_id
      WHERE od.object_id = p_object_id
        AND NOT EXISTS (SELECT 1 FROM object_document od2 WHERE od2.document_id = od.document_id AND od2.object_id <> p_object_id)`.
8. `INSERT INTO object_deletion_log(...)` avec les compteurs (`coalesce(array_length(...,1),0)`) + un `report` jsonb succinct.
9. **Supprimer les `ref_document` orphelinés** collectés en (7) : `DELETE FROM ref_document WHERE id IN (<ids orphelins>)`
   — fait disparaître la ligne + (par CASCADE) le lien `object_document` correspondant. Les `ref_document` partagés
   restent intacts (leur seul lien vers cet objet partira via le CASCADE de l'étape 10).
10. `DELETE FROM object WHERE id = p_object_id` → CASCADE nettoie tous les enfants object-keyed (média, descriptions, relations ×2, tarifs, ouvertures, liens documents restants…).
11. `RETURN jsonb_build_object('object_id', p_object_id, 'object_name', v_name, 'media_to_delete', to_jsonb(coalesce(v_media,'{}')), 'documents_to_delete', to_jsonb(coalesce(v_docs,'{}')), 'deleted', true)`.

Grants : `REVOKE … FROM PUBLIC, anon` ; `GRANT EXECUTE … TO authenticated, service_role`.
**Invariant projet** : `gen_random_uuid()` (jamais `uuid_generate_v4()` sous search_path restreint).

**c) Déploiement / intégrité**
- **NE PAS plier dans `schema_unified.sql`** : la policy RLS référence `api.is_platform_superuser`, **définie dans
  `rls_policies.sql`** (appliqué APRÈS `schema_unified.sql`). Folder ici casserait la passe fresh-apply (fonction
  introuvable). On suit donc le modèle **`migration_gdpr_erasure.sql`** : migration autonome **listée dans le
  manifest + `docs/SQL_ROLLOUT_RUNBOOK.md` en ordre de dépendance** (après `rls_policies.sql`).
- Test CI `Base de donnée DLL et API/tests/test_object_hard_delete.sql`.

**Pré-requis à vérifier au plan** : `api.is_platform_superuser` doit être **appelable en RPC PostgREST** par
`authenticated` (aujourd'hui surtout utilisée dans les policies RLS). Si elle n'est pas `GRANT EXECUTE … TO authenticated`,
ajouter le grant (ou exposer un mince wrapper `api`) pour que le front puisse la sonder — voir Composant 3.

### Composant 2 — Route `src/app/api/objects/delete/route.ts` (miroir de `rgpd/erase`)

- Auth : JWT Bearer requis → `server.auth.getUser(jwt)` ; sinon 401.
- Body : `{ objectId: string, confirmName: string }` (valider présence/typage ; 400 sinon).
- **Étape 1** — exécuter `api.rpc_delete_object` **en tant qu'appelant** (client anon + `Authorization: Bearer <jwt>`),
  pour que la garde superuser s'applique côté serveur. Mapper l'erreur : motif d'autorisation (`FORBIDDEN`/superuser) → **403**,
  le reste (`MUST_ARCHIVE_FIRST`, `NAME_MISMATCH`, `NOT_FOUND`, `FORBIDDEN_ORG`) → **400**, en renvoyant le `detail`.
- **Étape 2** — en **service-role**, supprimer les fichiers rapportés :
  - `media_to_delete` → bucket `media`
  - `documents_to_delete` → bucket `documents`
  - réutiliser/factoriser `storagePathFromPublicUrl(url, bucket)` (paramétré par bucket) ; ignorer les URLs externes (path null).
  - Les erreurs Storage sont **rapportées** (`storageError`) mais **ne rollback pas** le DELETE relationnel
    (la suppression relationnelle est la source de vérité ; un fichier orphelin résiduel est rattrapable par le GC différé).
- Réponse : `{ ok: true, report, mediaDeleted: string[], documentsDeleted: string[], storageError: string|null }`.
- Test : `route.test.ts` (miroir de `rgpd/erase/route.test.ts`).

### Composant 3 — Éditeur (groupe OUTILS)

- **`features/object-editor/shell/editor-tools.ts`**
  - Ajouter `EditorToolKey 'delete'`.
  - `BuildEditorToolsInput` gagne `canHardDelete: boolean` (+ `status` déjà présent).
  - Le tool `delete` est **omis** si `!canHardDelete` (capacité superuser-only — non montrée aux non-admins).
  - S'il est montré et que `status !== 'archived'` → `disabled: true`,
    `disabledReason: "Archivez d'abord la fiche avant de pouvoir la supprimer définitivement."`, `danger: true`.
  - Libellé : « Supprimer définitivement ».
- **`services/object-workspace.ts` → `getObjectWorkspacePermissions`**
  - Ajouter au batch `Promise.allSettled` une sonde `apiClient.schema('api').rpc('is_platform_superuser')` (0-arg, comme `current_user_is_org_admin`).
  - Exposer `canHardDelete = directWrite || isPlatformSuperuser` dans `ObjectWorkspacePermissions` (le RPC reste la garde dure ; l'UI ne fait qu'afficher).
- **`features/object-editor/widgets/DeleteObjectModal.tsx`** (nouveau)
  - Affiche le nom de la fiche + un avertissement destructif listant ce qui disparaît
    (la fiche, ses médias/photos/vidéos, descriptions, relations entrantes et sortantes, tarifs, ouvertures, documents…) — **irréversible**.
  - Champ texte qui doit matcher **exactement** le nom (trim) pour activer le bouton rouge « Supprimer définitivement ».
  - Helper pur **`deleteConfirmEnabled(typed, name): boolean`** (trim des deux côtés) — testé unitairement.
  - À la confirmation : `POST /api/objects/delete` ; succès → toast + redirection vers `/objects` (l'explorer).
    Échec → afficher le `detail` dans la modale (sans fermer).
- **Branchement** dans le shell éditeur là où sont dispatchés `versions` / `import-export` / `archive`.

## 5. Gestion d'erreurs

- Le RPC lève des messages typés (`NO_AUTH_CONTEXT` / `FORBIDDEN` / `FORBIDDEN_ORG` / `MUST_ARCHIVE_FIRST` / `NAME_MISMATCH` / `NOT_FOUND`).
- La route mappe vers 401/403/400 et renvoie le `detail`.
- L'UI surface le `detail` dans la modale.
- La ligne de journal est écrite **dans la même transaction** que le `DELETE` : un effacement journalisé correspond
  toujours à un effacement réel (et réciproquement).
- Les échecs Storage n'invalident pas le `DELETE` (orphelin rattrapable).

## 6. Tests

**SQL — `test_object_hard_delete.sql`**
- non-superuser → `FORBIDDEN` ; superuser → passe.
- `object_type='ORG'` → `FORBIDDEN_ORG`.
- statut ≠ `archived` → `MUST_ARCHIVE_FIRST`.
- nom de confirmation erroné → `NAME_MISMATCH`.
- happy path : l'objet **et ses enfants** disparaissent (asserter ≥1 table enfant vidée), **1** ligne de journal écrite,
  le jsonb retourné contient les arrays `media_to_delete` / `documents_to_delete`.

**Frontend**
- `editor-tools` : visibilité (caché si non-superuser), `disabled` + raison si non-archivée, `danger`, libellé.
- `deleteConfirmEnabled` : faux tant que le texte ≠ nom (trim), vrai à l'égalité.
- `DeleteObjectModal` : bouton désactivé jusqu'au match ; appelle la route avec `{objectId, confirmName}` ; gère succès/échec.
- `route.test.ts` : 401 sans JWT, 403 sur garde superuser, 400 sur `MUST_ARCHIVE_FIRST`/`NAME_MISMATCH`,
  succès → sweep des **deux** buckets.

## 7. Hors périmètre (explicite)

- Le **drawer Explorer reste view-only** : la suppression vit **dans l'éditeur** (cohérent avec l'invariant
  « édition = route full-page ; le drawer navigue vers l'éditeur »).
- Pas de suppression d'**ORG** (organisations).
- Pas de **suppression en masse**.
- Pas de **corbeille / restauration** (le PO veut une vraie suppression irréversible).
- Le **GC global** des orphelins Storage (bucket ↔ `media.url`) reste l'item différé séparé existant.

## 8. Impacts documentation (à la clôture)

- `lot1_mapping_decisions.md` §108 (décision + manifest 14x).
- Proposer un nouvel **invariant CLAUDE.md** : « Suppression définitive d'une fiche = `api.rpc_delete_object`
  (superuser-only, établissements, archived requis, confirmation par nom) + route `/api/objects/delete` (sweep
  `media` + `documents`) ; journal immuable `object_deletion_log`. Toute nouvelle voie de suppression d'objet
  passe par ce RPC, jamais un `DELETE` direct. »
- Manifest + `SQL_ROLLOUT_RUNBOOK.md` mis à jour avec 14x (migration autonome, ordre de dépendance après `rls_policies.sql` ; **non foldée** dans `schema_unified.sql` — cf. §4.c).

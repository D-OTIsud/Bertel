# Listes & templates d'envoi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un conseiller OTI transforme une sélection (liste statique) ou un jeu de filtres Explorer (liste dynamique, ré-évaluée à chaque accès) en une liste curatée, imprimable / envoyable par email / partageable par lien public brandé OTI.

**Architecture:** 2 tables verrouillées (`object_list`, `object_list_item`) + accès 100 % via RPCs `SECURITY DEFINER` authorize-once (pattern CRM §61). Résolution dynamique = wrapper du leaf de filtre existant `api.get_filtered_object_ids` (published-only, borné) — zéro duplication du prédicat. Module frontend `/listes` (Manage → Compose → Render) + `OtiTemplate` isomorphe réutilisé par l'aperçu, la page publique SSR et le HTML email. 3 canaux : lien web (RPC anon token-gated), PDF/impression, email réel (route serveur autorisée en-tant-qu'appelant + SMTP).

**Tech Stack:** PostgreSQL (Supabase) ; Next.js (App Router) / React / TypeScript ; Zustand + TanStack Query ; supabase-js ; nodemailer (SMTP).

**Spec:** [docs/superpowers/specs/2026-07-01-listes-templates-envoi-design.md](../specs/2026-07-01-listes-templates-envoi-design.md)

## Global Constraints

- **`object.id` est TEXT** (ex. `'ORGRUN…'`, `'HEBRUN…'`) — jamais uuid. `object_list.org_object_id text`, `object_list_item.object_id text`, FK → `object(id)`.
- **DEFINER authorize-once** : toute lecture/écriture passe par des RPCs `SECURITY DEFINER` ; les tables `object_list*` sont RLS-ON sans policy membership app. Pattern = `migration_crm_module.sql`.
- **UUID en search_path restreint** : `gen_random_uuid()` uniquement (jamais `uuid_generate_v4()`) — invariant CLAUDE.md §29.
- **Pas de `FOR ALL`** sur les tables ; familles admin par-commande. `anon` doit pouvoir EXÉCUTER tout prédicat de policy lisible sur la table (P0.3).
- **Deploy integrity** : chaque migration foldée dans `schema_unified.sql` / `rls_policies.sql` / `api_views_functions.sql` ET listée au runbook `docs/SQL_ROLLOUT_RUNBOOK.md`. Fresh-apply gate doit rester vert.
- **Page publique** : objets `published` uniquement ; **aucune** PII destinataire ; token ≥128 bits ; réponse indifférenciée si token invalide/expiré/désactivé.
- **Helpers existants** : `api.current_user_org_id() → text`, `api.is_platform_superuser() → bool`, `api.current_user_admin_rank()` (admin ORG si NOT NULL), `api.user_has_permission(text)`, `api.get_filtered_object_ids(jsonb, object_type[], object_status[], text)`, `api.get_object_cards_batch(text[], text[])`.
- **Commits fréquents** : un commit par incrément vérifié (règle projet). Messages conventionnels FR, **sans** trailer co-author. Claude committe ses hunks sur `master` ; le PO push.
- **Vérification sans Docker** : appliquer le SQL en transaction transitoire via Supabase MCP `execute_sql` (+ ROLLBACK) pour prouver le comportement ; `apply_migration` pour le déploiement live après validation.

---

## Décomposition en phases (chaque phase = livraison testable)

| Phase | Livrable | Statut plan |
|---|---|---|
| **1. Socle DB** | Tables + RLS + helpers + RPCs propriétaires + résolveur + RPC public + tests SQL | **Détaillée ci-dessous** |
| 2. Module `/listes` | `OtiTemplate` isomorphe + Manage/Compose/Render + service RPC + types | Contrats ci-dessous → plan détaillé à l'attaque |
| 3. Accroches Explorer | `SelectionBar` « Créer une liste » + filtres « Liste dynamique » | Contrats ci-dessous |
| 4. Page publique | Route `/l/[token]` SSR anon | Contrats ci-dessous |
| 5. Canaux | Impression/PDF + route email SMTP `/api/lists/send` | Contrats ci-dessous |
| 6. Nav + polish + vérif | Sidebar, i18n, build/tsc/tests, persona/EXPLAIN, advisor | Contrats ci-dessous |

---

# PHASE 1 — Socle DB

**Fichiers :**
- Create: `Base de donnée DLL et API/migration_object_list.sql`
- Create: `Base de donnée DLL et API/tests/test_object_list.sql` (ou dossier tests existant)
- Modify (fold, après validation live): `schema_unified.sql`, `rls_policies.sql`, `api_views_functions.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`

**Interfaces produites (contrats consommés par Phases 2/4/5) :**
- `api.list_my_lists() → json` — grille : `[{id,name,name_en,kind,status,lang,recipient_label,item_count,cover_url,updated_at,type_breakdown:[{code,n}]}]`
- `api.get_list(p_list_id uuid) → json` — `{...métadonnées, items:[{object_id, position, note_fr, note_en, card:{…get_object_cards_batch}}], resolved_from:'items'|'filters'}`
- `api.create_list(p_kind text, p_name text, p_from_object_ids text[], p_filters jsonb, p_filters_url text) → uuid`
- `api.update_list(p_list_id uuid, p_patch jsonb) → json`
- `api.set_list_items(p_list_id uuid, p_items jsonb) → json` (`p_items = [{object_id,position,note_fr,note_en}]`)
- `api.delete_list(p_list_id uuid) → void`
- `api.share_list(p_list_id uuid, p_enable boolean, p_expires_at timestamptz) → json` (`{share_token, share_url_path:'/l/<token>', share_enabled, share_expires_at}`)
- `api.get_public_list_by_token(p_token text) → json` (anon ; published-only ; sans PII) ou `null`
- `api.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean, p_limit int) → SETOF text`
- Gate helpers : `api.user_can_read_list(p_list_id uuid) → bool`, `api.user_can_write_list(p_list_id uuid) → bool`

---

### Task 1.1 — Tables `object_list` + `object_list_item` (RLS ON, verrouillées)

**Files:** Create `Base de donnée DLL et API/migration_object_list.sql` (début).

- [ ] **Step 1 — DDL des tables** (idempotent, `IF NOT EXISTS`) :

```sql
-- migration_object_list.sql — Module « Listes & templates d'envoi »
-- Tables verrouillées ; accès via RPCs DEFINER authorize-once (pattern CRM §61).

CREATE TABLE IF NOT EXISTS object_list (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_object_id    text NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('static','dynamic')),
  name             text NOT NULL,
  name_en          text,
  recipient_label  text,
  intro_fr         text,
  intro_en         text,
  template         text NOT NULL DEFAULT 'carnet' CHECK (template IN ('carnet','grille','itineraire')),
  accent           text NOT NULL DEFAULT 'teal'   CHECK (accent   IN ('teal','green','gold','terra')),
  lang             text NOT NULL DEFAULT 'fr'      CHECK (lang     IN ('fr','en')),
  cover_url        text,
  show_map         boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'draft'   CHECK (status   IN ('draft','sent','shared')),
  filters          jsonb,
  filters_url      text,
  share_token      text,
  share_enabled    boolean NOT NULL DEFAULT false,
  share_expires_at timestamptz,
  last_sent_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_object_list_dynamic_has_filters CHECK (kind = 'static' OR filters IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_list_share_token
  ON object_list(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_list_org      ON object_list(org_object_id);
CREATE INDEX IF NOT EXISTS idx_object_list_creator  ON object_list(created_by);

CREATE TABLE IF NOT EXISTS object_list_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES object_list(id) ON DELETE CASCADE,
  object_id  text NOT NULL REFERENCES object(id)      ON DELETE CASCADE,
  position   int  NOT NULL,
  note_fr    text,
  note_en    text,
  UNIQUE (list_id, object_id)
);
CREATE INDEX IF NOT EXISTS idx_object_list_item_list ON object_list_item(list_id, position);

ALTER TABLE object_list      ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_list_item ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2 — Appliquer en transaction transitoire** (Supabase MCP `execute_sql`, sans commit final) et vérifier que les tables/contraintes existent. Expected: 2 tables, `chk_object_list_dynamic_has_filters` présent.

- [ ] **Step 3 — Commit** : `feat(sql): tables object_list + object_list_item (RLS on, verrouillées)`

---

### Task 1.2 — Helpers d'autorisation `user_can_read_list` / `user_can_write_list`

**Interfaces produced:** `api.user_can_read_list(uuid) → bool`, `api.user_can_write_list(uuid) → bool`.

- [ ] **Step 1 — Test d'abord** (`test_object_list.sql`, section helpers) : insérer une liste org A / créée par user X ; asserts attendus :
  - superuser ⇒ read & write TRUE ;
  - membre org A non-créateur non-admin ⇒ read TRUE, write FALSE ;
  - créateur ⇒ write TRUE ; admin org A ⇒ write TRUE ;
  - membre org B ⇒ read FALSE, write FALSE.
  (Le harness pose `request.jwt.claim.sub` / SET ROLE selon le pattern des tests existants ; à défaut, tests fonctionnels via RPC en Phase suivante.)

- [ ] **Step 2 — Implémentation** :

```sql
CREATE OR REPLACE FUNCTION api.user_can_read_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (SELECT 1 FROM object_list l
                 WHERE l.id = p_list_id
                   AND l.org_object_id = api.current_user_org_id());
$$;

CREATE OR REPLACE FUNCTION api.user_can_write_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (SELECT 1 FROM object_list l
                 WHERE l.id = p_list_id
                   AND l.org_object_id = api.current_user_org_id()
                   AND (l.created_by = auth.uid()
                        OR api.current_user_admin_rank() IS NOT NULL));
$$;

REVOKE ALL ON FUNCTION api.user_can_read_list(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_read_list(uuid)  TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_write_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_write_list(uuid) TO authenticated, service_role;
```

- [ ] **Step 3 — RLS policies par-commande** (defense-in-depth ; l'app passe par les DEFINER, mais on gate le PostgREST direct). Read = membre org ; pas d'écriture directe (writes via RPC service-path). Suivre la forme CRM :

```sql
CREATE POLICY read_object_list ON object_list FOR SELECT
  USING (api.user_can_read_list(id));
CREATE POLICY read_object_list_item ON object_list_item FOR SELECT
  USING (api.user_can_read_list(list_id));
-- Pas de policy INSERT/UPDATE/DELETE : writes réservés aux RPC DEFINER (owner = postgres).
```

- [ ] **Step 4 — Vérifier** en transaction transitoire (persona simulée si le harness le permet) puis **Commit** : `feat(sql): gates + RLS read policies object_list`

---

### Task 1.3 — Résolveur dynamique `resolve_list_object_ids`

**Interfaces produced:** `api.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean, p_limit int) → SETOF text`.

- [ ] **Step 1 — Test** : construire un `p_buckets` minimal `[{"types":["ORG"]...}]`… en pratique tester avec un filtre connu (ex. un bucket `HOT` sans filtre) ⇒ renvoie des ids publiés ; `p_published_only=true` ⇒ un objet `draft` matchant est ABSENT ; borne `p_limit=5` ⇒ ≤5 ids.

- [ ] **Step 2 — Implémentation** (wrapper du leaf existant, published-only, borné) :

```sql
CREATE OR REPLACE FUNCTION api.resolve_list_object_ids(
  p_buckets jsonb,
  p_published_only boolean DEFAULT true,
  p_limit int DEFAULT 200
) RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref AS $$
DECLARE
  b jsonb;
  v_status object_status[] := CASE WHEN p_published_only
                                   THEN ARRAY['published']::object_status[]
                                   ELSE NULL END;
  v_lim int := LEAST(GREATEST(COALESCE(p_limit,200),1),200);  -- ponytail: plafond 200, upgrade=pagination
BEGIN
  RETURN QUERY
  WITH ids AS (
    SELECT g.object_id, g.relevance, g.label_rank
    FROM jsonb_array_elements(COALESCE(p_buckets->'buckets', p_buckets, '[]'::jsonb)) AS b(elem)
    CROSS JOIN LATERAL api.get_filtered_object_ids(
      COALESCE(b.elem->'filters','{}'::jsonb),
      CASE WHEN b.elem ? 'types'
           THEN ARRAY(SELECT jsonb_array_elements_text(b.elem->'types'))::object_type[]
           ELSE NULL END,
      v_status,
      NULLIF(b.elem->>'search','')
    ) g
  )
  SELECT object_id FROM (
    SELECT DISTINCT ON (object_id) object_id, relevance, label_rank
    FROM ids
  ) d
  ORDER BY d.relevance DESC, d.label_rank, d.object_id
  LIMIT v_lim;
END;
$$;
REVOKE ALL ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int) TO authenticated, service_role;
```

- [ ] **Step 3 — Vérifier / Commit** : `feat(sql): resolve_list_object_ids (wrapper get_filtered_object_ids, published-only borné)`

---

### Task 1.4 — RPCs propriétaires CRUD (`create/get/update/set_items/delete/list_my_lists`)

**Interfaces produced:** voir bloc Interfaces Phase 1.

- [ ] **Step 1 — Tests fonctionnels** (`test_object_list.sql`) : en tant qu'auteur org A :
  - `create_list('static','L1', ARRAY['<id1>','<id2>'], NULL, NULL)` ⇒ uuid ; `get_list` renvoie 2 items ordonnés, `resolved_from='items'`.
  - `create_list('dynamic','L2', NULL, '<buckets>'::jsonb, '/explorer?...')` ⇒ uuid ; `get_list` renvoie items live-résolus published-only, `resolved_from='filters'`.
  - `set_list_items` reconcile (ajout/retrait/réordonnancement/notes) non-destructif.
  - `update_list` patch (name/intro/template/accent/lang/recipient/show_map/cover/status).
  - `delete_list` ⇒ cascade items.
  - `list_my_lists` ⇒ L1,L2 avec `item_count` + `type_breakdown`.
  - Membre org B ⇒ `get_list` RAISE/deny.

- [ ] **Step 2 — Implémentation** (chaque RPC `SECURITY DEFINER SET search_path=public,api,auth,internal...`; `create/update/set_items/delete` : `IF NOT api.user_can_write_list(...) THEN RAISE EXCEPTION 'FORBIDDEN'`; `create_list` pose `org_object_id := api.current_user_org_id()`, `created_by := auth.uid()`; static ⇒ insert items depuis `p_from_object_ids` avec position ordinale ; `get_list` : items = statique depuis `object_list_item` sinon `resolve_list_object_ids(filters, true, 200)`, cartes via `get_object_cards_batch`; grants REVOKE anon / GRANT authenticated). *Corps complets écrits en TDD à l'exécution.*

- [ ] **Step 3 — Vérifier chaque RPC (execute_sql transitoire) / Commit** : `feat(sql): RPCs CRUD object_list (create/get/update/set_items/delete/list_my_lists)`

---

### Task 1.5 — Partage `share_list` + RPC public `get_public_list_by_token`

- [ ] **Step 1 — Tests** :
  - `share_list(L1, true, NULL)` ⇒ token non nul, `share_enabled=true`, `status='shared'` ; URL `/l/<token>`.
  - `get_public_list_by_token(<token>)` (rôle **anon**) ⇒ liste + items **publiés uniquement**, **sans** `recipient_label`.
  - Token faux / `share_enabled=false` / `share_expires_at` passé ⇒ `null` (indifférencié).
  - Liste dynamique partagée ⇒ items live published-only.
  - Un item `object_list_item` pointant un objet **draft** ⇒ ABSENT de la sortie publique.

- [ ] **Step 2 — Implémentation** : `share_list` (write-gated ; `share_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')` si pgcrypto indispo ; sinon `encode(gen_random_bytes(24),'base64')`) ; `get_public_list_by_token` `SECURITY DEFINER`, **grant anon**, filtre `share_enabled AND (share_expires_at IS NULL OR share_expires_at > now())`, items published-only (statique : join `object` status='published' ; dynamique : `resolve_list_object_ids(filters,true,200)` puis cartes), **jamais** `recipient_label` dans la sortie.

- [ ] **Step 3 — Vérifier (anon persona) / Commit** : `feat(sql): share_list + get_public_list_by_token (anon, published-only, no PII)`

---

### Task 1.6 — Fold + runbook + fresh-apply

- [ ] **Step 1** — Folder les DDL/fonctions dans `schema_unified.sql`, `rls_policies.sql` (policies + grants), `api_views_functions.sql` (RPCs).
- [ ] **Step 2** — Ajouter la migration au manifeste `docs/SQL_ROLLOUT_RUNBOOK.md` (ordre de dépendance : après `object` + helpers).
- [ ] **Step 3** — Lancer/rejouer le fresh-apply gate (`ci_fresh_apply.sql`) → vert.
- [ ] **Step 4 — Commit** : `chore(sql): fold object_list dans schema_unified/rls_policies/api + runbook`

- [ ] **Step 5 — Déploiement live** : `apply_migration` (`migration_object_list`) sur le projet live ; `NOTIFY pgrst, 'reload schema'` ; advisor Supabase clean.

---

# PHASE 2 — Module `/listes` (frontend)  *(contrats — plan détaillé à l'attaque)*

**Files (Create):**
- `bertel-tourism-ui/src/app/(main)/listes/page.tsx` — entrée route (rôles `super_admin`, `tourism_agent`).
- `bertel-tourism-ui/src/features/lists/ListsPage.tsx` — routeur de vues (manage/compose/render).
- `.../features/lists/ListsManage.tsx`, `ListsCompose.tsx`, `RenderView.tsx`, `ComposeItem.tsx`.
- `.../features/lists/oti-template/OtiTemplate.tsx` (+ `TplCarnet/TplGrille/TplItineraire`, `ChannelFrame`) — **isomorphe** (aperçu, page publique SSR, email).
- `.../features/lists/lists.css` ou modules — porter le style en tokens maison.
- `bertel-tourism-ui/src/services/lists.ts` — wrappers RPC + types TS (`ObjectList`, `ObjectListItem`, `ListCard`, `PublicList`).
- `bertel-tourism-ui/src/hooks/useLists.ts` — TanStack Query (list_my_lists/get_list) + mutations.

**Interfaces consumed:** Phase 1 RPCs. **Produces:** `OtiTemplate` isomorphe, `listsService`.

**Tests:** rendu 3 templates FR/EN ; reducer compose (reorder/add/remove/notes) ; états manage (tabs statut) ; garde dynamique (items lecture seule + résumé filtres).

---

# PHASE 3 — Accroches Explorer  *(contrats)*

**Files (Modify):**
- `bertel-tourism-ui/src/components/explorer/SelectionBar.tsx` — bouton **« Créer une liste »** (`create_list('static', selectedObjectIds)`) → nav `/listes/{id}`; remplace le « Envoyer » désactivé.
- `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx` (ou `FiltersPanel.tsx`) — **« Enregistrer comme liste dynamique »** : sérialise les filtres courants en payload `buckets` (réutiliser `buildBucketRpcFilters` + `getEffectiveBackendTypesForBucket` par bucket sélectionné) + `filters_url` (`buildSearchParams`) → `create_list('dynamic', …)` → nav compose.

**Interfaces consumed:** `create_list`, store `explorer-store` (`selectedObjectIds`, filtres), `buildBucketRpcFilters`, `buildSearchParams`.

**Tests:** create-from-selection (payload = ids sélectionnés) ; create-from-filters (payload buckets = filtres actifs) ; sélection vide ⇒ action désactivée.

---

# PHASE 4 — Page publique  *(contrats)*

**Files (Create):**
- `bertel-tourism-ui/src/app/l/[token]/page.tsx` — **hors `(main)`**, pas d'auth ; SSR via `get_public_list_by_token` (client anon serveur) ; rend `OtiTemplate` (published-only, sans PII) ; 404 propre si `null`.
- `bertel-tourism-ui/src/app/l/[token]/layout.tsx` — layout public minimal (fonts/tokens, pas de rail/topbar).

**Tests:** token valide ⇒ page rendue ; token invalide/expiré ⇒ 404 ; aucune PII destinataire dans le HTML.

---

# PHASE 5 — Canaux  *(contrats)*

**Files:**
- Impression/PDF : feuille de style print + `window.print()` sur `RenderView` (canal PDF = format A4).
- Create `bertel-tourism-ui/src/app/api/lists/send/route.ts` — `POST` ; autorise **en-tant-qu'appelant** (client anon + JWT → `get_list` DEFINER, jamais la service key pour l'autorisation — pattern média §59) ; rend le HTML email depuis `OtiTemplate` ; envoie via **nodemailer** (creds `env.server`) ; pose `last_sent_at` + `status='sent'`. Sans creds ⇒ échec propre, lien/PDF intacts.
- `bertel-tourism-ui/src/lib/env.server.ts` — ajouter les vars SMTP (server-only).

**Tests:** send authorise l'appelant (403 si non autorisé) ; HTML email = published-only sans PII ; absence de creds ⇒ erreur explicite, pas de crash.

---

# PHASE 6 — Nav + polish + vérification  *(contrats)*

- `bertel-tourism-ui/src/components/layout/Sidebar.tsx` — entrée **« Listes »** (icône `ListChecks`), rôles `['super_admin','tourism_agent']`.
- i18n libellés module (FR au lancement ; clés préparées).
- Vérif finale : `next build`, `tsc --noEmit`, suites Jest vertes, persona/EXPLAIN sur les RPC live, advisor Supabase clean, fresh-apply vert.
- Mise à jour `lot1_mapping_decisions.md` (nouvelle section §) + `CLAUDE.md` (invariant module Listes) + MCP/mémoire.

---

## Self-Review (à compléter après rédaction détaillée de chaque phase)

- **Spec coverage** : §3 tables → T1.1 ; §4 RLS/sécurité → T1.2/T1.5 ; §5 résolveur → T1.3 ; §6 RPCs → T1.4/T1.5 ; §7 frontend → Ph2/3 ; §8 canaux → Ph5 ; page publique §4/§7 → Ph4 ; §9 RGPD → T1.5+Ph4 ; §10 tests → tests par tâche ; §11 deploy → T1.6.
- **Placeholders** : les corps complets des RPC Phase 1 (T1.4) et le détail Phases 2-6 sont écrits en TDD à l'exécution — contrats (signatures, gating, tests) figés ici.
- **Type consistency** : `object.id`/`object_id`/`org_object_id` = **text** partout ; `list_id`/`id` de liste = uuid ; `p_buckets` jsonb `{buckets:[{types,filters,search}]}` cohérent entre `create_list`, `resolve_list_object_ids`, `get_public_list_by_token`.

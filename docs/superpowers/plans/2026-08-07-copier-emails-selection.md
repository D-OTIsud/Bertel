# Copier la liste d'e-mails d'une sélection — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** donner à un conseiller OTI un bouton « E-mails » qui copie, en un clic, les adresses des prestataires d'une sélection Explorer ou d'une liste enregistrée.

**Architecture:** un RPC `SECURITY DEFINER` `api.list_selection_emails` autorise (éditeur), borne au périmètre `publisher`, applique la cascade prestataire→fiche et rend des lignes brutes ; tout le dédoublonnage et le formatage vivent dans deux fonctions pures côté client, consommées par une modale partagée entre la `SelectionBar` et `ListComposeView`. Le résolveur de listes dynamiques est scindé en un moteur `internal` (plafond 2 001) et un passe-plat `api` inchangé (plafond 200), pour ne pas élargir un RPC déjà exposé.

**Tech Stack:** PostgreSQL 17 / Supabase (schémas `api`, `internal`, `public`), PostgREST, Next.js App Router, React 19, TypeScript, Zustand, Jest + React Testing Library.

**Spec de référence :** `docs/superpowers/specs/2026-08-07-copier-emails-selection-design.md` — toute divergence entre ce plan et la spec est une erreur du plan.

## Global Constraints

- **Fichiers SQL** : les migrations vivent dans `Base de donnée DLL et API/`, les tests dans `Base de donnée DLL et API/tests/`. Toute migration doit être inscrite dans `docs/SQL_ROLLOUT_RUNBOOK.md` (manifeste ordonné) — une migration absente du manifeste fait diverger la base fraîche et rougir le gate CI `.github/workflows/sql-fresh-apply.yml`.
- **Idempotence** : `CREATE OR REPLACE`, `CREATE … IF NOT EXISTS`, `DROP POLICY IF EXISTS` — chaque migration doit pouvoir être rejouée.
- **Toute fonction `SECURITY DEFINER` neuve** commence par `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon;` — PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut et un `GRANT` ciblé ne le retire pas. Le `GRANT` qui suit dépend du schéma :
  - **RPC du schéma `api`** (appelée par l'application via PostgREST) → `GRANT EXECUTE … TO authenticated, service_role;`
  - **Helper du schéma `internal`** (jamais appelé de l'extérieur) → `REVOKE ALL … FROM PUBLIC, anon, authenticated;` puis `GRANT EXECUTE … TO service_role;` uniquement. Un helper `internal` joignable par `authenticated` n'est plus interne.
- **`search_path` restreint** sans `extensions` ⇒ `gen_random_uuid()`, jamais `uuid_generate_v4()`.
- **`api.current_user_can_edit_objects()` est à TROIS valeurs** (`NULL` hors contexte HTTP) ⇒ toujours `COALESCE(…, FALSE)` en position booléenne.
- **Codes d'erreur** : `42501` pour les refus d'autorisation, `PT400` / `PT404` / `PT413` pour les erreurs métier (PostgREST mappe `PTxyz` sur le statut HTTP `xyz` et expose le SQLSTATE dans `error.code`). Jamais de `RAISE EXCEPTION 'TEXTE'` nu — il produit `P0001` pour tous les cas.
- **Plafond** : 2 000 ids par appel ; au-delà, erreur explicite, **jamais** de troncature.
- **Commandes front** (depuis `bertel-tourism-ui/`) : `npm run test:run` (Jest, un passage), `npm run typecheck` (tsc). `npm run test` est en mode watch — ne pas l'utiliser dans un script.
- **Langue** : commentaires de code et libellés d'interface en français, comme le reste du dépôt.
- **Commits** : format conventionnel (`feat:`, `fix:`, `docs:`, `test:`), **sans** trailer de co-auteur. Committer par pathspec explicite.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `Base de donnée DLL et API/migration_list_resolver_internal.sql` | scinde le résolveur : moteur `internal` (2 001) + passe-plat `api` (200) | 1 |
| `Base de donnée DLL et API/tests/test_list_resolver_internal.sql` | garde : le contrat public reste plafonné, le moteur n'est pas joignable | 1 |
| `Base de donnée DLL et API/migration_selection_emails.sql` | le RPC `api.list_selection_emails` | 2 |
| `Base de donnée DLL et API/tests/test_selection_emails.sql` | garde non vacante du RPC (16 cas) | 2 |
| `docs/SQL_ROLLOUT_RUNBOOK.md` | entrées de manifeste E1 et E2 | 1, 2 |
| `bertel-tourism-ui/src/services/selection-emails.ts` | appel RPC + **deux fonctions pures** (dédoublonnage, formatage) | 3 |
| `bertel-tourism-ui/src/services/selection-emails.test.ts` | tests des fonctions pures | 3 |
| `bertel-tourism-ui/src/components/explorer/CopyEmailsModal.tsx` | la modale, seule surface d'affichage | 4 |
| `bertel-tourism-ui/src/components/explorer/CopyEmailsModal.test.tsx` | tests de la modale | 4 |
| `bertel-tourism-ui/src/components/explorer/SelectionBar.tsx` | point d'entrée 1 (bouton + montage de la modale) | 5 |
| `bertel-tourism-ui/src/views/ListComposeView.tsx` | point d'entrée 2 | 5 |
| `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` | §211 — décisions + différé §9 | 6 |
| `CLAUDE.md`, `.claude/WORKFLOW.md` | invariant + ligne de différé | 6 |

---

## Task 1: Scinder le résolveur de listes — moteur `internal`, passe-plat `api`

**Pourquoi d'abord :** la tâche 2 a besoin d'un résolveur capable de dépasser 200. Élargir le RPC `api` exposé est exclu (cf. spec §9) — il faut donc le moteur `internal` avant tout le reste.

**Files:**
- Create: `Base de donnée DLL et API/migration_list_resolver_internal.sql`
- Create: `Base de donnée DLL et API/tests/test_list_resolver_internal.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (nouvelle entrée `E1`, à placer **après** l'entrée `L1` `migration_object_list.sql`)
- Lire pour référence: `Base de donnée DLL et API/migration_object_list.sql:117-162` (le résolveur actuel, à déplacer)

**Interfaces:**
- Consomme : `api.get_filtered_object_ids(jsonb, object_type[], object_status[], text)` — existant, inchangé.
- Produit :
  - `internal.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean DEFAULT true, p_limit int DEFAULT 200) RETURNS SETOF text` — plafond interne **2001**, non joignable par PostgREST.
  - `api.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean DEFAULT true, p_limit int DEFAULT 200) RETURNS SETOF text` — signature et grants **inchangés**, replafonne à **200**.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `Base de donnée DLL et API/tests/test_list_resolver_internal.sql` :

```sql
-- test_list_resolver_internal.sql
-- Garde du découpage résolveur (§211, manifest E1).
--
-- NON VACUITÉ : on ne se contente pas de vérifier que les fonctions existent —
-- on crée 205 objets témoins publiés, on résout, et on COMPTE. Sans témoins
-- au-delà de 200, les deux plafonds rendraient le même nombre et le test
-- passerait quel que soit le code.
--
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_n int;
  -- FORCER LE CHEMIN VIF — le point délicat de ce test.
  -- api.get_filtered_object_ids lit internal.mv_filtered_objects dès que
  -- `use_mv` est vrai, et `use_mv` exige DEUX conditions : aucune clé de filtre
  -- « vive » ET (p_status IS NULL OR p_status <@ ARRAY['published']).
  -- Passer p_published_only=false donne p_status=NULL, ce qui laisse `use_mv`
  -- VRAI : les témoins insérés dans cette transaction seraient invisibles et le
  -- test passerait sur les données pré-existantes — vacuité parfaite.
  -- La seule façon fiable de basculer sur le chemin vif est une clé vive :
  -- `city_any`, comparée à immutable_unaccent(lower(object_location.city)) de
  -- la localisation principale, des DEUX côtés.
  v_buckets jsonb := '{"buckets":[{"filters":{"city_any":["Zzresolveur"]}}]}'::jsonb;
BEGIN
  -- ---------- Témoins : 205 fiches publiées dans une commune inventée ----------
  INSERT INTO object (id, object_type, name, status, published_at)
  SELECT 'RSLV' || lpad(g::text, 12, '0'), 'HLO', 'Resolveur ' || g, 'published', now()
  FROM generate_series(1, 205) g;

  INSERT INTO object_location (object_id, city, is_main_location)
  SELECT 'RSLV' || lpad(g::text, 12, '0'), 'Zzresolveur', true
  FROM generate_series(1, 205) g;

  -- A. Le MOTEUR interne rend les 205 — EXACTEMENT, pas « plus de 200 » : un
  -- compte exact prouve à la fois que le plafond est levé et que ce sont bien
  -- NOS témoins qui remontent (une commune inventée ⇒ 0 fiche pré-existante).
  SELECT count(*) INTO v_n
  FROM internal.resolve_list_object_ids(v_buckets, true, 2001);
  ASSERT v_n = 205,
    format('le moteur interne doit rendre les 205 témoins (obtenu %s) — si 0, le chemin MV a été pris', v_n);

  -- B. Le CONTRAT PUBLIC reste plafonné à 200, même si on demande 2001.
  SELECT count(*) INTO v_n
  FROM api.resolve_list_object_ids(v_buckets, true, 2001);
  ASSERT v_n = 200,
    format('api.resolve_list_object_ids doit rester plafonné à 200 (obtenu %s)', v_n);

  -- C. Le défaut du contrat public est inchangé.
  SELECT count(*) INTO v_n
  FROM api.resolve_list_object_ids(v_buckets, true);
  ASSERT v_n = 200,
    format('le défaut du contrat public doit rester 200 (obtenu %s)', v_n);
END $$;

-- D. Le moteur interne n'est pas exécutable par authenticated.
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT has_function_privilege('authenticated',
    'internal.resolve_list_object_ids(jsonb, boolean, int)', 'EXECUTE')
  INTO v_ok;
  ASSERT v_ok = FALSE,
    'internal.resolve_list_object_ids ne doit PAS être exécutable par authenticated';

  SELECT has_function_privilege('anon',
    'internal.resolve_list_object_ids(jsonb, boolean, int)', 'EXECUTE')
  INTO v_ok;
  ASSERT v_ok = FALSE,
    'internal.resolve_list_object_ids ne doit PAS être exécutable par anon';

  -- E. Le contrat public, lui, reste ouvert à authenticated (non-régression).
  SELECT has_function_privilege('authenticated',
    'api.resolve_list_object_ids(jsonb, boolean, int)', 'EXECUTE')
  INTO v_ok;
  ASSERT v_ok = TRUE,
    'api.resolve_list_object_ids doit rester exécutable par authenticated';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run:
```bash
psql "$DATABASE_URL" -f "Base de donnée DLL et API/tests/test_list_resolver_internal.sql"
```
Expected: FAIL — `ERROR: schema "internal" does not exist` ou `function internal.resolve_list_object_ids(...) does not exist`.

- [ ] **Step 3: Écrire la migration**

Créer `Base de donnée DLL et API/migration_list_resolver_internal.sql` :

```sql
-- migration_list_resolver_internal.sql
-- §211 — Scinde le résolveur de listes dynamiques en DEUX fonctions.
--
-- POURQUOI. api.resolve_list_object_ids est SECURITY DEFINER, exposée en RPC
-- PostgREST et GRANT EXECUTE … TO authenticated. Elle délègue à
-- api.get_filtered_object_ids, dont le chemin vif lit `FROM object o` SANS
-- intersection avec l'ensemble lisible : un utilisateur authentifié peut donc
-- l'appeler en direct avec p_published_only = false et obtenir des ids d'objets
-- hors de son périmètre. Cette exposition est PRÉ-EXISTANTE et plafonnée à 200
-- (cf. différé « resolve_list_object_ids non borné au lisible »). L'export
-- d'e-mails a besoin de résoudre jusqu'à 2 001 ids : relever le plafond du RPC
-- public multiplierait cette exposition par dix.
--
-- COMMENT. Le moteur passe en `internal` (plafond 2001, non joignable par
-- PostgREST) ; le RPC `api` devient un mince passe-plat qui REPLAFONNE à 200 —
-- signature, grants et comportement strictement inchangés pour les appelants
-- existants (api.list_effective_object_ids passe le littéral 200, donc get_list
-- et list_my_lists ne bougent pas).
--
-- Idempotent (CREATE OR REPLACE + CREATE SCHEMA IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS internal;

-- ---------- 1. Le moteur (interne, plafond 2001) ----------
-- Corps repris tel quel de api.resolve_list_object_ids (migration_object_list.sql
-- §4), à l'unique différence du plafond.
CREATE OR REPLACE FUNCTION internal.resolve_list_object_ids(
  p_buckets jsonb,
  p_published_only boolean DEFAULT true,
  p_limit int DEFAULT 200
) RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api AS $$
DECLARE
  v_arr jsonb := CASE
                   WHEN p_buckets IS NULL THEN '[]'::jsonb
                   WHEN jsonb_typeof(p_buckets) = 'array' THEN p_buckets
                   WHEN p_buckets ? 'buckets' THEN p_buckets->'buckets'
                   ELSE '[]'::jsonb
                 END;
  v_status object_status[] := CASE WHEN p_published_only
                                   THEN ARRAY['published']::object_status[]
                                   ELSE NULL END;
  -- ponytail: plafond 2001 = 2000 + 1, pour distinguer « exactement 2000 » de
  -- « plus de 2000 » chez l'appelant. Upgrade = pagination.
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 2001);
BEGIN
  RETURN QUERY
  WITH ids AS (
    SELECT g.object_id, g.relevance, g.label_rank
    FROM jsonb_array_elements(v_arr) AS b(elem)
    CROSS JOIN LATERAL api.get_filtered_object_ids(
      COALESCE(b.elem->'filters', '{}'::jsonb),
      CASE WHEN b.elem ? 'types' AND jsonb_typeof(b.elem->'types') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(b.elem->'types'))::object_type[]
           ELSE NULL END,
      v_status,
      NULLIF(b.elem->>'search','')
    ) g
  ),
  dedup AS (
    SELECT DISTINCT ON (object_id) object_id, relevance, label_rank
    FROM ids
    ORDER BY object_id, relevance DESC, label_rank
  )
  SELECT object_id FROM dedup
  ORDER BY relevance DESC, label_rank, object_id
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION internal.resolve_list_object_ids(jsonb, boolean, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.resolve_list_object_ids(jsonb, boolean, int)
  TO service_role;

COMMENT ON FUNCTION internal.resolve_list_object_ids(jsonb, boolean, int) IS
  'Moteur de résolution des listes dynamiques (plafond 2001). NON exposé : '
  'joignable uniquement depuis un SECURITY DEFINER qui a déjà appliqué sa propre '
  'garde. Le contrat public api.resolve_list_object_ids reste plafonné à 200. §211';

-- ---------- 2. Le contrat public (passe-plat, plafond 200 inchangé) ----------
-- Signature, grants et comportement identiques à avant : SEULE l'implémentation
-- change. NE PAS relever ce plafond (cf. bloc POURQUOI).
CREATE OR REPLACE FUNCTION api.resolve_list_object_ids(
  p_buckets jsonb,
  p_published_only boolean DEFAULT true,
  p_limit int DEFAULT 200
) RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal AS $$
  SELECT internal.resolve_list_object_ids(
    p_buckets,
    p_published_only,
    LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200)   -- ponytail: plafond public 200
  );
$$;

REVOKE ALL ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int)
  TO authenticated, service_role;
```

- [ ] **Step 4: Appliquer la migration puis relancer le test**

Run:
```bash
psql "$DATABASE_URL" -f "Base de donnée DLL et API/migration_list_resolver_internal.sql" && psql "$DATABASE_URL" -f "Base de donnée DLL et API/tests/test_list_resolver_internal.sql"
```
Expected: `CREATE SCHEMA` / `CREATE FUNCTION` / `REVOKE` / `GRANT` / `COMMENT`, puis le test se termine sur `ROLLBACK` sans aucune `ERROR`.

- [ ] **Step 5: Vérifier la non-régression du module Listes**

Run:
```bash
psql "$DATABASE_URL" -f "Base de donnée DLL et API/tests/test_object_list.sql"
```
Expected: aucun `ERROR` — `get_list` et `list_my_lists` doivent se comporter exactement comme avant.

- [ ] **Step 6: Inscrire la migration dans le manifeste EXÉCUTABLE**

⚠️ Le manifeste que la CI exécute réellement est **`Base de donnée DLL et API/ci_fresh_apply.sql`** (une suite de `\echo` + `\ir`). `docs/SQL_ROLLOUT_RUNBOOK.md` en est la documentation — modifier l'un sans l'autre laisse le gate vert sur une base qui ne contient pas la migration.

Dans `Base de donnée DLL et API/ci_fresh_apply.sql`, **immédiatement après** le bloc `== L1 migration_object_list.sql ==` :

```sql
\echo '== E1     migration_list_resolver_internal.sql  (§211 splits the dynamic-list resolver: internal.resolve_list_object_ids engine capped 2001, REVOKEd from anon/authenticated; api.resolve_list_object_ids becomes a pass-through re-capped at 200 — public contract, grants and behaviour unchanged. Needed by E2, which must resolve up to 2001 without widening an exposed DEFINER RPC. After L1) =='
\ir migration_list_resolver_internal.sql
```

- [ ] **Step 7: Documenter la migration au runbook**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, ajouter une entrée **immédiatement après** l'entrée `L1.` (`migration_object_list.sql`), en suivant le format des entrées voisines :

```markdown
E1. `migration_list_resolver_internal.sql` — **Scission du résolveur de listes dynamiques (§211)** (self-contained ; après `migration_object_list.sql` [L1], qui crée `api.resolve_list_object_ids`). **Pourquoi :** `api.resolve_list_object_ids` est `SECURITY DEFINER`, exposée en RPC PostgREST et `GRANT EXECUTE … TO authenticated` ; elle délègue à `api.get_filtered_object_ids`, dont le chemin vif lit `FROM object o` **sans intersection avec l'ensemble lisible** — un utilisateur authentifié peut donc obtenir jusqu'à 200 ids d'objets hors de son périmètre (exposition **pré-existante**, portée = des identifiants, pas de contenu ni de PII ; cf. différé). L'export d'e-mails (E2) doit résoudre jusqu'à 2 001 ids : relever le plafond du RPC public aurait multiplié cette exposition par dix. **Contenu :** le moteur est déplacé dans `internal.resolve_list_object_ids` (plafond **2001** = 2000+1 pour distinguer « exactement 2000 » de « plus de 2000 » ; `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`) ; `api.resolve_list_object_ids` devient un **passe-plat** qui replafonne à **200** — signature, grants et comportement strictement inchangés (`api.list_effective_object_ids` passe le littéral `200`, donc `get_list` et `list_my_lists` ne bougent pas). Idempotent (`CREATE SCHEMA IF NOT EXISTS`, `CREATE OR REPLACE`). Couvert par `tests/test_list_resolver_internal.sql` — garde **non vacante** : 205 fiches témoins, le moteur doit dépasser 200 ET le contrat public doit rester à 200, plus les privilèges des deux fonctions. Non-régression : `tests/test_object_list.sql`. Décision log §211.
```

- [ ] **Step 8: Commit**

```bash
git add "Base de donnée DLL et API/migration_list_resolver_internal.sql" "Base de donnée DLL et API/tests/test_list_resolver_internal.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "feat(sql §211): scinde le resolveur de listes — moteur internal a 2001, contrat public inchange a 200"
```

---

## Task 2: Le RPC `api.list_selection_emails`

**Files:**
- Create: `Base de donnée DLL et API/migration_selection_emails.sql`
- Create: `Base de donnée DLL et API/tests/test_selection_emails.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée `E2`, après `E1`)

**Interfaces:**
- Consomme : `internal.resolve_list_object_ids` (tâche 1) ; `api.current_user_can_edit_objects()`, `api.current_user_crm_object_ids()`, `api.is_platform_superuser()`, `api.user_can_read_list(uuid)` — tous existants.
- Produit : `api.list_selection_emails(p_object_ids text[] DEFAULT NULL, p_list_id uuid DEFAULT NULL) RETURNS json`, de forme
  `{requested_count:int, eligible_count:int, excluded_count:int, rows:[{object_id,email,source,ord}], missing:[{object_id,name}]}`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `Base de donnée DLL et API/tests/test_selection_emails.sql` :

```sql
-- test_selection_emails.sql
-- Garde permanente de l'export d'e-mails (§211, manifest E2).
--
-- NON VACUITÉ : chaque bloc crée des témoins et exécute le VRAI RPC.
--
-- HARNAIS DE CONTEXTE — le point le plus délicat de ce test, et la raison pour
-- laquelle un harnais naïf ne prouve RIEN :
--
-- 1) api.current_user_can_edit_objects() est à TROIS valeurs (sa chaîne de OR
--    passe par auth.role(), NULL hors contexte HTTP). Un test qui se
--    contenterait de `SET ROLE` n'emprunterait JAMAIS le bras éditeur et
--    n'assertrait que du vide.
-- 2) Mais un contexte {"role":"service_role"} ne vaut pas mieux pour la
--    GARANTIE CENTRALE : is_platform_superuser() y est TRUE, donc le bras
--    `OR api.is_platform_superuser()` court-circuite le périmètre D4 et le test
--    ne prouve rien sur l'isolation entre organisations.
--
-- On monte donc un VRAI ÉDITEUR NON-SUPERUSER :
--    auth.users(id)                              → auth.uid()
--    aucune ligne app_user_profile               → is_platform_superuser() FALSE
--    user_org_membership(is_active) + user_org_admin_role('org_admin')
--                                                → current_user_admin_role_code()
--                                                  non nul ⇒ can_edit TRUE
--    request.jwt.claims {"role":"authenticated","sub":"<uuid>"}
-- et deux ORG, pour que l'isolation soit éprouvée sur une fiche PUBLIÉE d'une
-- ORG étrangère — le cas exact que `readable_object_ids` laissait passer.
--
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_user       uuid := gen_random_uuid();
  v_memb       uuid;
  v_role_admin uuid;
  v_role_pub   uuid;
BEGIN
  SELECT id INTO v_role_admin FROM ref_org_admin_role WHERE code = 'org_admin';
  SELECT id INTO v_role_pub   FROM ref_org_role       WHERE code = 'publisher';
  ASSERT v_role_admin IS NOT NULL, 'ref_org_admin_role[org_admin] introuvable';
  ASSERT v_role_pub   IS NOT NULL, 'ref_org_role[publisher] introuvable';

  -- Deux ORG : la mienne et l'étrangère.
  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    ('ORGEML999999990A', 'ORG', 'ORG du testeur', 'published', now()),
    ('ORGEML999999990B', 'ORG', 'ORG etrangere',  'published', now());

  -- `id` est la SEULE colonne NOT NULL sans défaut de auth.users.
  INSERT INTO auth.users (id) VALUES (v_user);

  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
  VALUES (v_user, 'ORGEML999999990A', true)
  RETURNING id INTO v_memb;

  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
  VALUES (v_memb, v_role_admin, true);

  -- Le sub du JWT doit être CE user : on le mémorise pour les blocs suivants.
  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user)::text, true);

  -- Le harnais lui-même est asserté : sans cela, tout le reste serait vacant.
  ASSERT api.is_platform_superuser() = FALSE,
    'le témoin doit être NON-superuser, sinon le périmètre D4 est court-circuité';
  ASSERT COALESCE(api.current_user_can_edit_objects(), FALSE) = TRUE,
    'le témoin doit être éditeur, sinon tous les appels seraient refusés';
END $$;

DO $$
DECLARE
  v_res        json;
  v_kind_email uuid;
  v_role_op    uuid;
  v_role_pub   uuid;
  v_actor_a    uuid := gen_random_uuid();
  v_actor_exp  uuid := gen_random_uuid();
  v_actor_priv uuid := gen_random_uuid();
  v_actor_no   uuid := gen_random_uuid();
  v_emails     text[];
BEGIN
  SELECT id INTO v_kind_email FROM ref_code_contact_kind WHERE code = 'email';
  SELECT id INTO v_role_op    FROM ref_actor_role        WHERE code = 'operator';
  SELECT id INTO v_role_pub   FROM ref_org_role          WHERE code = 'publisher';
  ASSERT v_kind_email IS NOT NULL, 'ref_code_contact_kind[email] introuvable';
  ASSERT v_role_op    IS NOT NULL, 'ref_actor_role[operator] introuvable';

  -- ---------- Témoins ----------
  -- EML…01 acteur + e-mail propre → l'acteur gagne
  -- EML…02 e-mail propre seul     → repli
  -- EML…03 rien                   → missing
  -- EML…04 lien operator EXPIRÉ   → repli
  -- EML…05 lien visibility private→ repli
  -- EML…06 acteur refusant (consent FALSE) → repli
  -- EML…07 is_primary NULL vs TRUE→ le TRUE gagne
  -- EML…08 archived               → exclu (D9)
  -- EML…09 PUBLIÉE mais publisher = ORG ÉTRANGÈRE → hors périmètre (D4)
  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    ('EMLSEL9999999901', 'HLO', 'Emails acteur gagne',  'published', now()),
    ('EMLSEL9999999902', 'HLO', 'Emails repli fiche',   'published', now()),
    ('EMLSEL9999999903', 'HLO', 'Emails muette',        'published', now()),
    ('EMLSEL9999999904', 'HLO', 'Emails lien expire',   'published', now()),
    ('EMLSEL9999999905', 'HLO', 'Emails lien prive',    'published', now()),
    ('EMLSEL9999999906', 'HLO', 'Emails refus consent', 'published', now()),
    ('EMLSEL9999999907', 'HLO', 'Emails primary null',  'published', now()),
    ('EMLSEL9999999908', 'HLO', 'Emails archivee',      'archived',  now()),
    ('EMLSEL9999999909', 'HLO', 'Emails org etrangere', 'published', now());

  -- Publisher : 01→08 chez moi, 09 chez l'ORG étrangère.
  INSERT INTO object_org_link (object_id, org_object_id, role_id)
  SELECT o.id,
         CASE WHEN o.id = 'EMLSEL9999999909'
              THEN 'ORGEML999999990B' ELSE 'ORGEML999999990A' END,
         v_role_pub
  FROM object o WHERE o.id LIKE 'EMLSEL99999999%';

  INSERT INTO actor (id, display_name) VALUES
    (v_actor_a,    'Gerant A'),
    (v_actor_exp,  'Ancien gerant'),
    (v_actor_priv, 'Gerant prive'),
    (v_actor_no,   'Gerant refusant');

  INSERT INTO actor_channel (actor_id, kind_id, value, is_primary) VALUES
    (v_actor_a,    v_kind_email, 'gerant.a@example.test',    true),
    (v_actor_exp,  v_kind_email, 'ancien@example.test',      true),
    (v_actor_priv, v_kind_email, 'prive@example.test',       true),
    (v_actor_no,   v_kind_email, 'refusant@example.test',    true);

  INSERT INTO actor_object_role (actor_id, object_id, role_id, visibility, valid_to) VALUES
    (v_actor_a,    'EMLSEL9999999901', v_role_op, 'partners', NULL),
    (v_actor_exp,  'EMLSEL9999999904', v_role_op, 'partners', CURRENT_DATE - 1),
    (v_actor_priv, 'EMLSEL9999999905', v_role_op, 'private',  NULL),
    (v_actor_no,   'EMLSEL9999999906', v_role_op, 'partners', NULL);

  INSERT INTO actor_consent (actor_id, channel, consent_given)
  VALUES (v_actor_no, 'email', false);

  INSERT INTO contact_channel (object_id, kind_id, value, is_primary) VALUES
    ('EMLSEL9999999901', v_kind_email, 'fiche01@example.test', true),
    ('EMLSEL9999999902', v_kind_email, 'fiche02@example.test', true),
    ('EMLSEL9999999904', v_kind_email, 'fiche04@example.test', true),
    ('EMLSEL9999999905', v_kind_email, 'fiche05@example.test', true),
    ('EMLSEL9999999906', v_kind_email, 'fiche06@example.test', true),
    ('EMLSEL9999999908', v_kind_email, 'fiche08@example.test', true),
    ('EMLSEL9999999909', v_kind_email, 'etrangere09@example.test', true);

  -- 07 : le drapeau NULL ne doit PAS passer devant le TRUE (garde du NULLS LAST).
  INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position) VALUES
    ('EMLSEL9999999907', v_kind_email, 'secondaire07@example.test', NULL, 0),
    ('EMLSEL9999999907', v_kind_email, 'principal07@example.test',  true, 1);

  -- ---------- A. Cascade ----------
  v_res := api.list_selection_emails(ARRAY[
    'EMLSEL9999999901','EMLSEL9999999902','EMLSEL9999999903','EMLSEL9999999904',
    'EMLSEL9999999905','EMLSEL9999999906','EMLSEL9999999907','EMLSEL9999999908',
    'EMLSEL9999999909']);

  SELECT array_agg(r->>'email' ORDER BY (r->>'ord')::int)
    INTO v_emails
  FROM json_array_elements(v_res->'rows') r;

  ASSERT v_emails = ARRAY[
      'gerant.a@example.test',      -- 01 : l'acteur gagne
      'fiche02@example.test',       -- 02 : repli
      'fiche04@example.test',       -- 04 : lien expiré ignoré
      'fiche05@example.test',       -- 05 : lien private ignoré
      'fiche06@example.test',       -- 06 : refus de consentement ⇒ repli
      'principal07@example.test'],  -- 07 : is_primary TRUE devant NULL
    format('cascade inattendue : %s', v_emails);

  -- LA garantie centrale : une fiche PUBLIÉE d'une ORG étrangère n'apporte
  -- AUCUNE adresse, alors même qu'elle est parfaitement lisible.
  ASSERT NOT (v_emails @> ARRAY['etrangere09@example.test']),
    'FUITE : l e-mail d une fiche publiée d une ORG étrangère est sorti (D4)';

  -- 03 est muette ; 08 (archivée) et 09 (ORG étrangère) sont hors éligibles.
  ASSERT (v_res->'missing')::jsonb @> '[{"object_id":"EMLSEL9999999903"}]'::jsonb,
    'la fiche sans e-mail doit figurer dans missing';
  ASSERT NOT ((v_res->'missing')::jsonb @> '[{"object_id":"EMLSEL9999999908"}]'::jsonb),
    'une fiche archivée ne doit PAS figurer dans missing — elle est exclue (D9)';
  ASSERT NOT ((v_res->'missing')::jsonb @> '[{"object_id":"EMLSEL9999999909"}]'::jsonb),
    'une fiche hors périmètre ne doit PAS figurer dans missing — elle est comptée dans excluded_count';
  ASSERT (v_res->>'requested_count')::int = 9,
    'requested_count doit compter les ids demandés';
  ASSERT (v_res->>'eligible_count')::int = 7,
    'eligible_count doit écarter l archivée ET l ORG étrangère';
  ASSERT (v_res->>'excluded_count')::int = 2,
    'excluded_count doit valoir requested - eligible, et être RENDU (jamais absorbé)';

  -- ---------- B. Ids dupliqués : une seule ligne, ordre stable ----------
  v_res := api.list_selection_emails(ARRAY[
    'EMLSEL9999999902','EMLSEL9999999902','EMLSEL9999999901']);
  SELECT array_agg(r->>'email' ORDER BY (r->>'ord')::int) INTO v_emails
  FROM json_array_elements(v_res->'rows') r;
  ASSERT v_emails = ARRAY['fiche02@example.test','gerant.a@example.test'],
    format('les doublons doivent être réduits en conservant la PREMIÈRE ordinalité : %s', v_emails);

  -- ---------- C. Tableau vide = demande valide ----------
  v_res := api.list_selection_emails(ARRAY[]::text[]);
  ASSERT json_array_length(v_res->'rows') = 0, 'un tableau vide rend un résultat vide';
END $$;

-- ---------- D. Contrats d'erreur ----------
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    PERFORM api.list_selection_emails(NULL, NULL);
    ASSERT false, 'deux paramètres NULL doivent lever PT400';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT400', format('attendu PT400, obtenu %s', v_state);
  END;

  BEGIN
    PERFORM api.list_selection_emails(
      ARRAY(SELECT 'X' || lpad(g::text, 15, '0') FROM generate_series(1, 2001) g));
    ASSERT false, '2001 ids doivent lever PT413';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT413', format('attendu PT413, obtenu %s', v_state);
  END;

  BEGIN
    PERFORM api.list_selection_emails(ARRAY['EMLSEL9999999901'], gen_random_uuid());
    ASSERT false, 'fournir les DEUX paramètres doit lever PT400';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT400', format('attendu PT400, obtenu %s', v_state);
  END;

  -- Liste inexistante, appelée par un NON-superuser : c'est ici que l'ordre
  -- « charger PUIS autoriser » se prouve. Dans l'ordre inverse,
  -- api.user_can_read_list rendrait FALSE (pas d'EXISTS) et on obtiendrait 42501.
  BEGIN
    PERFORM api.list_selection_emails(NULL, gen_random_uuid());
    ASSERT false, 'une liste inexistante doit lever PT404';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT404',
      format('attendu PT404, obtenu %s — 42501 signale l ordre autoriser-puis-charger', v_state);
  END;
END $$;

-- ---------- G. Liste inexistante vue par un SUPERUSER ----------
-- L'autre moitié du piège : user_can_read_list rend TRUE pour un superuser sur
-- un id inexistant, donc l'ordre inverse laisserait passer une ligne NULL.
DO $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    PERFORM api.list_selection_emails(NULL, gen_random_uuid());
    ASSERT false, 'un superuser aussi doit obtenir PT404, pas une ligne NULL en aval';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT404', format('attendu PT404, obtenu %s', v_state);
  END;
  -- On rend la main au témoin non-superuser pour la suite.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated',
                      'sub', current_setting('test.user_id'))::text, true);
END $$;

-- ---------- H. Entrée par LISTE ----------
DO $$
DECLARE
  v_list_static  uuid;
  v_list_dynamic uuid;
  v_res          json;
  v_n            int;
  v_role_pub     uuid;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher';

  -- H1. Liste STATIQUE contenant une fiche archivée : elle doit être exclue (D9).
  INSERT INTO object_list (org_object_id, created_by, kind, name)
  VALUES ('ORGEML999999990A', current_setting('test.user_id')::uuid, 'static', 'Liste statique test')
  RETURNING id INTO v_list_static;

  INSERT INTO object_list_item (list_id, object_id, position) VALUES
    (v_list_static, 'EMLSEL9999999902', 1),
    (v_list_static, 'EMLSEL9999999908', 2);   -- archivée

  v_res := api.list_selection_emails(NULL, v_list_static);
  ASSERT json_array_length(v_res->'rows') = 1,
    'une liste statique portant une fiche archivée ne doit rendre que la vivante (D9)';
  ASSERT (v_res->'rows')::jsonb @> '[{"email":"fiche02@example.test"}]'::jsonb,
    'la fiche vivante de la liste statique doit sortir';

  -- H2. Liste DYNAMIQUE de plus de 200 membres : 205 témoins dans une commune
  -- inventée. `city_any` est une clé « vive » : sans elle, le résolveur lirait le
  -- MV et ne verrait aucun témoin transactionnel (le test serait vacant).
  INSERT INTO object (id, object_type, name, status, published_at)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'), 'HLO', 'Gros lot ' || g, 'published', now()
  FROM generate_series(1, 205) g;

  INSERT INTO object_location (object_id, city, is_main_location)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'), 'Zzgroslot', true
  FROM generate_series(1, 205) g;

  INSERT INTO object_org_link (object_id, org_object_id, role_id)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'), 'ORGEML999999990A', v_role_pub
  FROM generate_series(1, 205) g;

  INSERT INTO contact_channel (object_id, kind_id, value, is_primary)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'),
         (SELECT id FROM ref_code_contact_kind WHERE code = 'email'),
         'gros' || g || '@example.test', true
  FROM generate_series(1, 205) g;

  INSERT INTO object_list (org_object_id, created_by, kind, name, filters)
  VALUES ('ORGEML999999990A', current_setting('test.user_id')::uuid, 'dynamic',
          'Liste dynamique test',
          '{"buckets":[{"filters":{"city_any":["Zzgroslot"]}}]}'::jsonb)
  RETURNING id INTO v_list_dynamic;

  v_res := api.list_selection_emails(NULL, v_list_dynamic);
  ASSERT json_array_length(v_res->'rows') = 205,
    format('l export doit dépasser le plafond de 200 des listes (obtenu %s)',
           json_array_length(v_res->'rows'));

  -- H3. NON-RÉGRESSION : le module Listes, lui, reste à 200 sur la MÊME liste.
  SELECT count(*) INTO v_n
  FROM api.list_effective_object_ids(v_list_dynamic, true);
  ASSERT v_n = 200,
    format('le module Listes doit rester plafonné à 200 (obtenu %s)', v_n);
END $$;

-- ---------- I. Contexte LECTEUR : refus, pas ensemble vide ----------
DO $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000ff"}', true);
  ASSERT COALESCE(api.current_user_can_edit_objects(), FALSE) = FALSE,
    'le contexte lecteur du harnais doit donner can_edit=FALSE, sinon I ne prouve rien';
  BEGIN
    PERFORM api.list_selection_emails(ARRAY['EMLSEL9999999901']);
    ASSERT false, 'un lecteur doit être refusé, pas servi avec un ensemble vide';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = '42501', format('attendu 42501, obtenu %s', v_state);
  END;
END $$;

-- ---------- F. Privilèges ----------
DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT has_function_privilege('anon',
    'api.list_selection_emails(text[], uuid)', 'EXECUTE') INTO v_ok;
  ASSERT v_ok = FALSE, 'anon ne doit PAS pouvoir exécuter list_selection_emails';

  SELECT has_function_privilege('authenticated',
    'api.list_selection_emails(text[], uuid)', 'EXECUTE') INTO v_ok;
  ASSERT v_ok = TRUE, 'authenticated doit pouvoir exécuter list_selection_emails';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run:
```bash
psql "$DATABASE_URL" -f "Base de donnée DLL et API/tests/test_selection_emails.sql"
```
Expected: FAIL — `ERROR: function api.list_selection_emails(...) does not exist`.

- [ ] **Step 3: Écrire la migration**

Créer `Base de donnée DLL et API/migration_selection_emails.sql` :

```sql
-- migration_selection_emails.sql
-- §211 — Export de la liste d'e-mails d'une sélection (Explorer ou liste enregistrée).
--
-- Rend des lignes BRUTES : le dédoublonnage et le formatage vivent côté client,
-- de sorte que changer le séparateur dans la modale ne coûte aucun aller-retour.
--
-- Spec : docs/superpowers/specs/2026-08-07-copier-emails-selection-design.md
-- Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION api.list_selection_emails(
  p_object_ids text[] DEFAULT NULL,
  p_list_id    uuid   DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth AS $$
DECLARE
  v_list      object_list;
  v_ids       text[];          -- ids DÉDOUBLONNÉS, dans l'ordre de la sélection
  v_requested int;
  v_res       json;
BEGIN
  -- NOTE D'IMPLÉMENTATION — pas de TABLE TEMPORAIRE ici, volontairement :
  -- `CREATE TEMP TABLE … ON COMMIT DROP` dans une fonction `STABLE` échoue au
  -- SECOND appel de la même transaction (« relation already exists ») et casse en
  -- transaction read-only. L'ordre est porté par un tableau + `WITH ORDINALITY`.
  -- ---------- 1. Garde éditeur, FAIL-CLOSED ----------
  -- COALESCE obligatoire : la fonction est à TROIS valeurs et rend NULL hors
  -- contexte HTTP. Sans lui, `IF NOT NULL` ne prend pas la branche et la garde
  -- devient fail-OPEN.
  IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN_EMAIL_EXPORT';
  END IF;

  -- ---------- 2. Ensemble demandé ----------
  IF (p_object_ids IS NULL) = (p_list_id IS NULL) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_ARGUMENT';
  END IF;

  IF p_object_ids IS NOT NULL THEN
    -- Plafond vérifié AVANT unnest : un immense tableau de doublons ne doit pas
    -- être déplié pour être ensuite réduit.
    IF cardinality(p_object_ids) > 2000 THEN
      RAISE SQLSTATE 'PT413' USING MESSAGE = 'TOO_MANY_OBJECTS';
    END IF;
    -- Doublon ⇒ on garde la PREMIÈRE ordinalité, puis on ordonne par elle :
    -- c'est cet ordre-là, et lui seul, qui est le contrat de sortie.
    SELECT array_agg(d.id ORDER BY d.ord) INTO v_ids
    FROM (
      SELECT DISTINCT ON (u.id) u.id, u.ord
      FROM unnest(p_object_ids) WITH ORDINALITY AS u(id, ord)
      WHERE u.id IS NOT NULL AND btrim(u.id) <> ''
      ORDER BY u.id, u.ord
    ) d;
  ELSE
    -- Charger la ligne AVANT d'autoriser : api.user_can_read_list rend FALSE sur
    -- une liste supprimée (⇒ 42501 au lieu de PT404) et TRUE pour un superuser
    -- sur un UUID inexistant (⇒ ligne NULL). L'ordre inverse ment dans les deux
    -- sens. Compromis assumé : révèle l'existence d'une liste à qui ne peut pas
    -- la lire — acceptable, les ids sont des UUID v4 non énumérables.
    SELECT * INTO v_list FROM public.object_list WHERE id = p_list_id;
    IF NOT FOUND THEN
      RAISE SQLSTATE 'PT404' USING MESSAGE = 'LIST_NOT_FOUND';
    END IF;
    IF NOT COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
      RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN';
    END IF;

    IF v_list.kind = 'static' THEN
      -- LIMIT posé DANS la lecture : une liste statique n'a pas de plafond de
      -- composition, rien ne garantit qu'elle tienne en mémoire avant comptage.
      -- Départage sur object_id : `position` n'est pas unique par liste, et sans
      -- second critère l'ordre — donc la « première occurrence » du
      -- dédoublonnage client — dépendrait du plan choisi par PostgreSQL.
      SELECT array_agg(t.object_id ORDER BY t.position, t.object_id) INTO v_ids
      FROM (
        SELECT i.object_id, i.position
        FROM public.object_list_item i
        WHERE i.list_id = p_list_id
        ORDER BY i.position, i.object_id
        LIMIT 2001
      ) t;
    ELSE
      -- 2001 = 2000+1 : distingue « exactement 2000 » de « plus de 2000 ».
      -- published-only, fidèle à la sémantique du module Listes (get_list).
      SELECT array_agg(r.object_id ORDER BY r.ord) INTO v_ids
      FROM internal.resolve_list_object_ids(v_list.filters, TRUE, 2001)
        WITH ORDINALITY AS r(object_id, ord);
    END IF;

    IF COALESCE(cardinality(v_ids), 0) > 2000 THEN
      RAISE SQLSTATE 'PT413' USING MESSAGE = 'TOO_MANY_OBJECTS';
    END IF;
  END IF;

  v_ids       := COALESCE(v_ids, ARRAY[]::text[]);
  v_requested := cardinality(v_ids);

  -- ---------- 3. Périmètre + statut, AVANT toute lecture de contact ----------
  -- Périmètre = les fiches dont MON ORG est publisher (le périmètre du CRM, qui
  -- manipule les mêmes données de contact). `readable` ne conviendrait PAS :
  -- lire une fiche publiée d'une autre ORG ne donne pas droit à l'adresse
  -- personnelle de son gérant. La fonction est exécutable par PostgREST : on ne
  -- fait jamais confiance à la liste d'ids reçue.
  -- ---------- 4. Cascade + 5. Retour ----------
  WITH eligible AS (
    SELECT s.object_id, s.ord::int AS ord, o.name
    FROM unnest(v_ids) WITH ORDINALITY AS s(object_id, ord)
    JOIN public.object o ON o.id = s.object_id
    WHERE o.status NOT IN ('archived', 'hidden')
      AND (o.id IN (SELECT api.current_user_crm_object_ids())
           OR api.is_platform_superuser())
  ),
  resolved AS (
    SELECT
      e.object_id,
      e.ord,
      e.name,
      COALESCE(actor_mail.value, own_mail.value)                       AS email,
      CASE WHEN actor_mail.value IS NOT NULL THEN 'actor' ELSE 'object' END AS source
    FROM eligible e
    LEFT JOIN LATERAL (
      -- Bras PRESTATAIRE : rôle operator, visibilité public/partners (private
      -- exclu — un drapeau de visibilité se compose), lien temporellement valide,
      -- et refus de consentement honoré. NULLS LAST : is_primary est NULLABLE et
      -- `DESC` place les NULL EN PREMIER par défaut.
      SELECT ac.value
      FROM public.actor_object_role aor
      JOIN public.actor_channel ac        ON ac.actor_id = aor.actor_id
      JOIN public.ref_code_contact_kind k ON k.id = ac.kind_id AND k.code = 'email'
      JOIN public.ref_actor_role ar       ON ar.id = aor.role_id AND ar.code = 'operator'
      WHERE aor.object_id = e.object_id
        AND aor.visibility IN ('public', 'partners')
        AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
        AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
        AND NOT EXISTS (
          SELECT 1 FROM public.actor_consent ac2
          WHERE ac2.actor_id = aor.actor_id
            AND ac2.channel = 'email'
            AND ac2.consent_given = FALSE)
      ORDER BY aor.is_primary DESC NULLS LAST,
               ac.is_primary  DESC NULLS LAST,
               ac.position NULLS LAST, ac.created_at, ac.id
      LIMIT 1
    ) actor_mail ON TRUE
    LEFT JOIN LATERAL (
      -- Bras FICHE : adresse professionnelle publique de l'établissement.
      SELECT cc.value
      FROM public.contact_channel cc
      JOIN public.ref_code_contact_kind k ON k.id = cc.kind_id AND k.code = 'email'
      WHERE cc.object_id = e.object_id
      ORDER BY cc.is_primary DESC NULLS LAST,
               cc.position NULLS LAST, cc.created_at, cc.id
      LIMIT 1
    ) own_mail ON TRUE
  )
  SELECT json_build_object(
    'requested_count', v_requested,
    'eligible_count',  (SELECT count(*) FROM resolved),
    'excluded_count',  v_requested - (SELECT count(*) FROM resolved),
    'rows', COALESCE((
      SELECT json_agg(json_build_object(
               'object_id', r.object_id, 'email', r.email,
               'source', r.source, 'ord', r.ord) ORDER BY r.ord)
      FROM resolved r WHERE r.email IS NOT NULL), '[]'::json),
    'missing', COALESCE((
      SELECT json_agg(json_build_object(
               'object_id', r.object_id, 'name', r.name) ORDER BY r.ord)
      FROM resolved r WHERE r.email IS NULL), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION api.list_selection_emails(text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_selection_emails(text[], uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION api.list_selection_emails(text[], uuid) IS
  'Export des e-mails d''une sélection Explorer (p_object_ids) OU d''une liste '
  '(p_list_id). Authorize-once SECURITY DEFINER : garde éditeur (§205) puis '
  'périmètre ORG publisher (= périmètre CRM — `readable` ne suffit pas pour une '
  'donnée partners). Cascade prestataire operator → fiche. Rend des lignes brutes ; '
  'dédoublonnage et formatage côté client. §211';
```

- [ ] **Step 4: Appliquer la migration puis relancer le test**

Run:
```bash
psql "$DATABASE_URL" -f "Base de donnée DLL et API/migration_selection_emails.sql" && psql "$DATABASE_URL" -f "Base de donnée DLL et API/tests/test_selection_emails.sql"
```
Expected: `CREATE FUNCTION` / `REVOKE` / `GRANT` / `COMMENT`, puis le test se termine sur `ROLLBACK` sans aucune `ERROR`.

- [ ] **Step 5: Inscrire la migration dans le manifeste EXÉCUTABLE**

Dans `Base de donnée DLL et API/ci_fresh_apply.sql`, **immédiatement après** le bloc `== E1 ==` :

```sql
\echo '== E2     migration_selection_emails.sql  (§211 api.list_selection_emails: editor-gated + publisher-scoped bulk email export for an Explorer selection or a saved list; operator-actor -> object-contact cascade; needs E1 internal resolver, api_views current_user_can_edit_objects, rls_policies is_platform_superuser, CRM current_user_crm_object_ids) =='
\ir migration_selection_emails.sql
```

⚠️ Vérifier que le bloc CRM (`api.current_user_crm_object_ids`) est bien `\ir`é **avant** cette ligne dans `ci_fresh_apply.sql` — si ce n'est pas le cas, placer E2 après lui. Une base fraîche échouerait sinon à la création de la fonction.

- [ ] **Step 6: Documenter la migration au runbook**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, ajouter après l'entrée `E1.` :

```markdown
E2. `migration_selection_emails.sql` — **Export de la liste d'e-mails d'une sélection (§211)** (self-contained ; après `migration_list_resolver_internal.sql` [E1] pour `internal.resolve_list_object_ids`, après `api_views_functions.sql` pour `api.current_user_can_edit_objects`, après `rls_policies.sql` pour `api.is_platform_superuser`, après le module CRM pour `api.current_user_crm_object_ids`). **Besoin :** écrire à un sous-ensemble de prestataires (toute la base, les hébergements, une zone) sans recomposer la liste à la main — un clic, le presse-papiers, on colle dans Gmail. **RPC** `api.list_selection_emails(p_object_ids text[] DEFAULT NULL, p_list_id uuid DEFAULT NULL) RETURNS json`, `SECURITY DEFINER`, entrées mutuellement exclusives. **Garde à deux étages** : (1) éditeur — `COALESCE(api.current_user_can_edit_objects(), FALSE)`, la fonction étant à TROIS valeurs, sans quoi la garde est fail-OPEN (§204) ; (2) périmètre — `api.current_user_crm_object_ids()` (fiches dont l'ORG est `publisher`) **et non** `current_user_readable_object_ids()` : lire une fiche publiée d'une autre ORG ne donne pas droit à l'e-mail `visibility='partners'` de son exploitant. `archived`/`hidden` exclus. **Cascade** prestataire → fiche : bras acteur = rôle `operator`, `visibility IN ('public','partners')` (private exclu — le drapeau se compose, §49), lien temporellement valide (`valid_from`/`valid_to`), refus de consentement honoré (`actor_consent(email, FALSE)` coupe le bras acteur ; le repli sur l'adresse pro de la fiche reste licite) ; bras fiche = `contact_channel[email]`. `NULLS LAST` **obligatoire** sur les `is_primary DESC` — la colonne est nullable et `DESC` place les NULL en premier. **Retour** `{requested_count, eligible_count, excluded_count, rows:[{object_id,email,source,ord}], missing:[{object_id,name}]}` — le périmètre écarté est **compté et rendu**, jamais absorbé : une fiche silencieusement retirée se lirait comme une fiche sans e-mail. Ordre **déterministe** de bout en bout (`unnest … WITH ORDINALITY`, `ORDER BY ord`, départages terminaux sur `ac.id`/`cc.id`). Plafond **2 000** ids (vérifié par `cardinality` AVANT `unnest`) ; résolution des listes dynamiques à **2 001** via le moteur `internal` pour distinguer « exactement 2000 » de « plus de 2000 » — jamais de troncature. **Codes d'erreur** `42501` (refus), `PT400`/`PT404`/`PT413` (PostgREST mappe `PTxyz` sur le statut HTTP `xyz` et expose le SQLSTATE) — un `RAISE EXCEPTION` nu rendrait les trois indiscernables sous `P0001`. Liste dynamique en `published`-only, fidèle à `get_list`. Idempotent (`CREATE OR REPLACE`). Couvert par `tests/test_selection_emails.sql` — garde **non vacante** : 8 fiches témoins couvrant les deux bras et les cinq exclusions, ids dupliqués, contrats d'erreur, contexte lecteur éprouvé par `request.jwt.claims` (jamais `SET ROLE` seul — sans JWT le bras éditeur n'est pas emprunté et le test n'asserte que du vide, §204), privilèges. État mesuré au 2026-08-07 : 842 fiches demandées → 840 éligibles → 821 résolues → **717 adresses distinctes** → 19 muettes. Décision log §211.
```

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/migration_selection_emails.sql" "Base de donnée DLL et API/tests/test_selection_emails.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "feat(sql §211): RPC list_selection_emails — cascade prestataire, perimetre publisher, ordre deterministe"
```

---

## Task 3: Le service front — appel RPC et deux fonctions pures

**Files:**
- Create: `bertel-tourism-ui/src/services/selection-emails.ts`
- Create: `bertel-tourism-ui/src/services/selection-emails.test.ts`
- Lire pour référence: `bertel-tourism-ui/src/services/lists.ts:262-274` (le patron d'appel RPC)

**Interfaces:**
- Consomme : `api.list_selection_emails` (tâche 2) ; `getApiClient` de `../lib/supabase`.
- Produit :
  - `type EmailSeparator = 'comma' | 'semicolon' | 'newline'`
  - `interface SelectionEmailRow { objectId: string; email: string; source: 'actor' | 'object'; ord: number }`
  - `interface SelectionEmailsResult { requestedCount: number; eligibleCount: number; excludedCount: number; rows: SelectionEmailRow[]; missing: Array<{ objectId: string; name: string }> }`
  - `fetchSelectionEmails(input: { objectIds: string[] } | { listId: string }): Promise<SelectionEmailsResult>`
  - `dedupeEmails(rows: SelectionEmailRow[]): string[]`
  - `formatEmailList(emails: string[], separator: EmailSeparator): string`
  - `SELECTION_EMAIL_ERROR_MESSAGES: Record<string, string>`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `bertel-tourism-ui/src/services/selection-emails.test.ts` :

```ts
import { dedupeEmails, formatEmailList, type SelectionEmailRow } from './selection-emails';

function row(ord: number, email: string, source: 'actor' | 'object' = 'object'): SelectionEmailRow {
  return { objectId: `obj-${ord}`, email, source, ord };
}

describe('dedupeEmails', () => {
  it('réduit deux fiches partageant une adresse à une seule sortie', () => {
    const out = dedupeEmails([row(1, 'a@x.test'), row(2, 'a@x.test'), row(3, 'b@x.test')]);
    expect(out).toEqual(['a@x.test', 'b@x.test']);
  });

  it('conserve l ordre `ord` du serveur, quel que soit l ordre du tableau reçu', () => {
    const out = dedupeEmails([row(3, 'c@x.test'), row(1, 'a@x.test'), row(2, 'b@x.test')]);
    expect(out).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
  });

  it('normalise la casse et les espaces avant de dédoublonner', () => {
    const out = dedupeEmails([row(1, '  A@X.test '), row(2, 'a@x.TEST')]);
    expect(out).toEqual(['a@x.test']);
  });

  it('écarte les valeurs vides sans planter', () => {
    const out = dedupeEmails([row(1, '   '), row(2, 'a@x.test')]);
    expect(out).toEqual(['a@x.test']);
  });
});

describe('formatEmailList', () => {
  const emails = ['a@x.test', 'b@x.test'];

  it('sépare par virgule et espace — le défaut attendu par Gmail', () => {
    expect(formatEmailList(emails, 'comma')).toBe('a@x.test, b@x.test');
  });

  it('sépare par point-virgule et espace', () => {
    expect(formatEmailList(emails, 'semicolon')).toBe('a@x.test; b@x.test');
  });

  it('sépare par retour ligne', () => {
    expect(formatEmailList(emails, 'newline')).toBe('a@x.test\nb@x.test');
  });

  it('rend une chaîne vide pour une liste vide', () => {
    expect(formatEmailList([], 'comma')).toBe('');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd bertel-tourism-ui && npm run test:run -- selection-emails`
Expected: FAIL — `Cannot find module './selection-emails'`.

- [ ] **Step 3: Écrire le service**

Créer `bertel-tourism-ui/src/services/selection-emails.ts` :

```ts
// Service « Copier les e-mails d'une sélection » (§211).
//
// Le RPC api.list_selection_emails rend des lignes BRUTES : le dédoublonnage et
// le formatage vivent ici, en fonctions PURES, pour que changer le séparateur
// dans la modale ne coûte aucun aller-retour serveur.
import { getApiClient } from '../lib/supabase';

export type EmailSeparator = 'comma' | 'semicolon' | 'newline';

export interface SelectionEmailRow {
  objectId: string;
  email: string;
  /** Provenance de l'adresse — sert à la ligne « X fiches via le prestataire ». */
  source: 'actor' | 'object';
  /** Rang serveur : l'ordre de la sélection, seul ordre déterministe. */
  ord: number;
}

export interface SelectionEmailsResult {
  requestedCount: number;
  eligibleCount: number;
  excludedCount: number;
  rows: SelectionEmailRow[];
  missing: Array<{ objectId: string; name: string }>;
}

/** Messages d'interface, indexés par `error.code` (le SQLSTATE) — jamais par le texte. */
export const SELECTION_EMAIL_ERROR_MESSAGES: Record<string, string> = {
  '42501': 'Réservé aux éditeurs.',
  PT413: 'Sélection trop large (plus de 2 000 fiches). Affinez le filtre, ou copiez en deux fois.',
  PT404: "Cette liste n'existe plus.",
  PT400: 'Une erreur technique empêche la copie.',
};

const SEPARATORS: Record<EmailSeparator, string> = {
  comma: ', ',
  semicolon: '; ',
  newline: '\n',
};

/**
 * Dédoublonne en conservant l'ordre `ord` défini par le serveur. Trier ici plutôt
 * que se fier à l'ordre du tableau reçu : c'est `ord` qui porte le contrat.
 */
export function dedupeEmails(rows: SelectionEmailRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...rows].sort((a, b) => a.ord - b.ord)) {
    const email = row.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function formatEmailList(emails: string[], separator: EmailSeparator): string {
  return emails.join(SEPARATORS[separator]);
}

export async function fetchSelectionEmails(
  input: { objectIds: string[] } | { listId: string },
): Promise<SelectionEmailsResult> {
  const client = getApiClient();
  if (!client) throw new Error('Client API indisponible.');

  const params =
    'listId' in input
      ? { p_object_ids: null, p_list_id: input.listId }
      : { p_object_ids: input.objectIds, p_list_id: null };

  const { data, error } = await client.schema('api').rpc('list_selection_emails', params);
  if (error) {
    // On propage le SQLSTATE : la modale branche dessus, jamais sur le message.
    const wrapped = new Error(error.message || 'Export des e-mails impossible.');
    (wrapped as Error & { code?: string }).code = error.code;
    throw wrapped;
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rawMissing = Array.isArray(payload.missing) ? payload.missing : [];

  return {
    requestedCount: Number(payload.requested_count ?? 0),
    eligibleCount: Number(payload.eligible_count ?? 0),
    excludedCount: Number(payload.excluded_count ?? 0),
    rows: rawRows.map((entry) => {
      const r = entry as Record<string, unknown>;
      return {
        objectId: String(r.object_id ?? ''),
        email: String(r.email ?? ''),
        source: r.source === 'actor' ? 'actor' : 'object',
        ord: Number(r.ord ?? 0),
      };
    }),
    missing: rawMissing.map((entry) => {
      const m = entry as Record<string, unknown>;
      return { objectId: String(m.object_id ?? ''), name: String(m.name ?? '') };
    }),
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd bertel-tourism-ui && npm run test:run -- selection-emails`
Expected: PASS — 8 tests.

- [ ] **Step 5: Vérifier les types**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: aucune sortie (0 erreur).

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/services/selection-emails.ts bertel-tourism-ui/src/services/selection-emails.test.ts
git commit -m "feat(§211): service selection-emails — appel RPC et fonctions pures de dedoublonnage/formatage"
```

---

## Task 4: La modale `CopyEmailsModal`

**Files:**
- Create: `bertel-tourism-ui/src/components/explorer/CopyEmailsModal.tsx`
- Create: `bertel-tourism-ui/src/components/explorer/CopyEmailsModal.test.tsx`
- Lire pour référence: `bertel-tourism-ui/src/components/common/Modal.tsx` (props `open` / `onOpenChange` / `title` — **ne pas** faire `if (!open) return null` avant de rendre le Modal, l'animation de sortie ne jouerait jamais)

**Interfaces:**
- Consomme : `fetchSelectionEmails`, `dedupeEmails`, `formatEmailList`, `SELECTION_EMAIL_ERROR_MESSAGES`, `SelectionEmailsResult` (tâche 3) ; `Modal` de `../common/Modal`.
- Produit : `CopyEmailsModal({ objectIds, listId, open, onOpenChange }: { objectIds?: string[]; listId?: string; open: boolean; onOpenChange: (open: boolean) => void })`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `bertel-tourism-ui/src/components/explorer/CopyEmailsModal.test.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyEmailsModal } from './CopyEmailsModal';
import { fetchSelectionEmails } from '@/services/selection-emails';

jest.mock('@/services/selection-emails', () => ({
  ...jest.requireActual('@/services/selection-emails'),
  fetchSelectionEmails: jest.fn(),
}));

const mockFetch = fetchSelectionEmails as jest.MockedFunction<typeof fetchSelectionEmails>;

// Cohérence obligatoire du faux : eligibleCount = rows.length + missing.length
// (3 + 1 = 4), et excludedCount = requestedCount - eligibleCount (5 - 4 = 1).
// Un faux incohérent rendrait les assertions de compteurs ininterprétables.
const RESULT = {
  requestedCount: 5,
  eligibleCount: 4,
  excludedCount: 1,
  rows: [
    { objectId: 'o1', email: 'a@x.test', source: 'actor' as const, ord: 1 },
    { objectId: 'o2', email: 'a@x.test', source: 'object' as const, ord: 2 },
    { objectId: 'o3', email: 'b@x.test', source: 'object' as const, ord: 3 },
  ],
  missing: [{ objectId: 'o4', name: 'Fiche sans e-mail' }],
};

function setClipboard(impl: () => Promise<void>) {
  Object.assign(navigator, { clipboard: { writeText: jest.fn(impl) } });
}

describe('CopyEmailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClipboard(() => Promise.resolve());
  });

  it('annonce les compteurs, dont la mention « sur N » quand des fiches sont écartées', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1', 'o2', 'o3', 'o4']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/4 fiches éligibles sur 5/)).toBeInTheDocument();
    expect(screen.getByText(/2 adresses/)).toBeInTheDocument();
    expect(screen.getByText(/1 sans e-mail/)).toBeInTheDocument();
  });

  it('propose de réessayer sur une erreur non métier (réseau)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    mockFetch.mockResolvedValueOnce(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText('Chargement impossible.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText(/4 fiches éligibles sur 5/)).toBeInTheDocument();
  });

  it('ne propose PAS de réessayer sur un refus d autorisation', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('x'), { code: '42501' }));
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    await screen.findByText('Réservé aux éditeurs.');
    expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull();
  });

  it('exprime la répartition en FICHES, pas en adresses', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText(/1 fiche résolue via le prestataire, 2 via la fiche/),
    ).toBeInTheDocument();
  });

  it('rend les adresses dédoublonnées et recompose au changement de séparateur', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    const zone = (await screen.findByLabelText(/Adresses à copier/)) as HTMLTextAreaElement;
    expect(zone.value).toBe('a@x.test, b@x.test');

    await userEvent.click(screen.getByRole('button', { name: 'Point-virgule' }));
    expect(zone.value).toBe('a@x.test; b@x.test');
  });

  it('rappelle d utiliser le champ Cci', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);
    expect(await screen.findByText(/champ Cci/)).toBeInTheDocument();
  });

  it('ne bascule sur « Copié » qu APRÈS résolution du presse-papiers', async () => {
    mockFetch.mockResolvedValue(RESULT);
    let release: () => void = () => {};
    setClipboard(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Copier$/ }));
    expect(screen.queryByRole('button', { name: /Copié/ })).toBeNull();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Copié/ })).toBeInTheDocument());
  });

  it('affiche un message dédié quand le navigateur refuse la copie', async () => {
    mockFetch.mockResolvedValue(RESULT);
    setClipboard(() => Promise.reject(new Error('denied')));
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Copier$/ }));
    expect(await screen.findByText(/Copie refusée par le navigateur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copié/ })).toBeNull();
  });

  it('traduit le refus serveur en « Réservé aux éditeurs »', async () => {
    const err = Object.assign(new Error('FORBIDDEN_EMAIL_EXPORT'), { code: '42501' });
    mockFetch.mockRejectedValue(err);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText('Réservé aux éditeurs.')).toBeInTheDocument();
  });

  it('traduit PT413 en message de sélection trop large', async () => {
    const err = Object.assign(new Error('TOO_MANY_OBJECTS'), { code: 'PT413' });
    mockFetch.mockRejectedValue(err);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/Sélection trop large/)).toBeInTheDocument();
  });

  it('ignore la réponse d un chargement obsolète après fermeture puis réouverture', async () => {
    let resolveFirst: (value: typeof RESULT) => void = () => {};
    mockFetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ...RESULT, eligibleCount: 99, excludedCount: 0, requestedCount: 99 });

    const { rerender } = render(
      <CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />,
    );
    rerender(<CopyEmailsModal objectIds={['o1']} open={false} onOpenChange={jest.fn()} />);
    rerender(<CopyEmailsModal objectIds={['o2']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/99 fiches éligibles/)).toBeInTheDocument();
    resolveFirst(RESULT);
    await waitFor(() => expect(screen.getByText(/99 fiches éligibles/)).toBeInTheDocument());
    expect(screen.queryByText(/3 fiches éligibles/)).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd bertel-tourism-ui && npm run test:run -- CopyEmailsModal`
Expected: FAIL — `Cannot find module './CopyEmailsModal'`.

- [ ] **Step 3: Écrire la modale**

Créer `bertel-tourism-ui/src/components/explorer/CopyEmailsModal.tsx` :

```tsx
'use client';

// Modale « Copier les e-mails » (§211) — partagée par la SelectionBar de l'Exploreur
// et la page d'une liste.
//
// Elle existe parce qu'une copie silencieuse mentirait trois fois : elle tairait
// le périmètre écarté, le dédoublonnage (821 fiches → 717 adresses sur le corpus
// réel) et les fiches muettes. Les quatre chiffres sont donc annoncés, le texte
// exact est montré avant d'être copié, et les fiches sans adresse sont listées
// en lien — l'outil devient une boucle de qualité de données.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  dedupeEmails,
  fetchSelectionEmails,
  formatEmailList,
  SELECTION_EMAIL_ERROR_MESSAGES,
  type EmailSeparator,
  type SelectionEmailsResult,
} from '@/services/selection-emails';

const SEPARATOR_LABELS: Array<{ value: EmailSeparator; label: string }> = [
  { value: 'comma', label: 'Virgule' },
  { value: 'semicolon', label: 'Point-virgule' },
  { value: 'newline', label: 'Une par ligne' },
];

type CopyState = 'idle' | 'copying' | 'copied' | 'refused';

interface Props {
  objectIds?: string[];
  listId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyEmailsModal({ objectIds, listId, open, onOpenChange }: Props) {
  const [result, setResult] = useState<SelectionEmailsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Une erreur métier (refus, liste absente, trop large) ne se réessaie pas :
   *  seul l'aléa réseau mérite un bouton. */
  const [retryable, setRetryable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [separator, setSeparator] = useState<EmailSeparator>('comma');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  // Jeton de requête : une fermeture/réouverture rapide ne doit pas laisser la
  // réponse du premier chargement écraser l'état du second.
  const requestToken = useRef(0);

  // `objectIds` est un tableau : son identité change à CHAQUE rendu du parent.
  // Le mettre en dépendance d'effet boucle à l'infini — on passe par une clé
  // scalaire qui résume la demande, et l'input est mémoïsé sur elle.
  const key = listId ?? (objectIds ?? []).join(',');
  const input = useMemo(
    () => (listId ? { listId } : { objectIds: objectIds ?? [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume listId + objectIds
    [key],
  );

  useEffect(() => {
    if (!open) return;
    const token = ++requestToken.current;
    setResult(null);
    setErrorMessage(null);
    setRetryable(false);
    setCopyState('idle');

    fetchSelectionEmails(input)
      .then((res) => {
        if (requestToken.current !== token) return;
        setResult(res);
      })
      .catch((err: unknown) => {
        if (requestToken.current !== token) return;
        const code = (err as { code?: string } | null)?.code;
        const known = code ? SELECTION_EMAIL_ERROR_MESSAGES[code] : undefined;
        setErrorMessage(known ?? 'Chargement impossible.');
        setRetryable(!known);
      });
  }, [open, input, attempt]);

  const emails = useMemo(() => dedupeEmails(result?.rows ?? []), [result]);
  const text = useMemo(() => formatEmailList(emails, separator), [emails, separator]);

  const viaActor = (result?.rows ?? []).filter((row) => row.source === 'actor').length;
  const viaObject = (result?.rows ?? []).length - viaActor;

  async function handleCopy() {
    if (copyState === 'copying' || emails.length === 0) return;
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Jamais de « Copié » sur un presse-papiers vide : on le dit, et le
      // textarea reste sélectionnable pour un Ctrl+C manuel.
      setCopyState('refused');
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Copier les e-mails">
      {errorMessage ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-ink/70">{errorMessage}</p>
          {retryable && (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold text-ink/80 hover:bg-ink/5"
            >
              Réessayer
            </button>
          )}
        </div>
      ) : !result ? (
        <p className="text-[13px] text-ink/60">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-ink">
            {result.excludedCount > 0
              ? `${result.eligibleCount} fiches éligibles sur ${result.requestedCount}`
              : `${result.eligibleCount} fiches`}
            {' · '}
            {emails.length} adresses
            {' · '}
            {result.missing.length} sans e-mail
          </p>

          <p className="text-[12px] text-ink/60">
            {viaActor} fiche{viaActor > 1 ? 's' : ''} résolue{viaActor > 1 ? 's' : ''} via le
            prestataire, {viaObject} via la fiche
          </p>

          <p className="rounded-lg bg-orange/10 px-3 py-2 text-[12px] text-ink/80">
            Collez ces adresses dans le champ Cci, pour ne pas les divulguer aux autres
            destinataires.
          </p>

          <div className="flex gap-1" role="group" aria-label="Séparateur">
            {SEPARATOR_LABELS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSeparator(option.value)}
                className={
                  separator === option.value
                    ? 'rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-semibold text-white'
                    : 'rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold text-ink/70'
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            aria-label="Adresses à copier"
            readOnly
            value={text}
            rows={6}
            className="w-full rounded-lg border p-2 font-mono text-[12px]"
          />

          {result.missing.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold text-ink/70">
                {result.missing.length} fiche{result.missing.length > 1 ? 's' : ''} sans e-mail
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {result.missing.map((item) => (
                  <li key={item.objectId}>
                    <Link
                      href={`/objects/${item.objectId}/edit`}
                      className="text-[12px] text-orange hover:underline"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {copyState === 'refused' && (
            <p className="text-[12px] text-red-600">
              Copie refusée par le navigateur — sélectionnez le texte ci-dessus et faites Ctrl+C.
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={emails.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {copyState === 'copied' ? (
              <>
                <Check className="h-4 w-4" /> Copié
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copier
              </>
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd bertel-tourism-ui && npm run test:run -- CopyEmailsModal`
Expected: PASS — 11 tests.

Si un test échoue sur la signature du `Modal` (prop `title` ou rendu des enfants), relire `src/components/common/Modal.tsx` et aligner l'appel — **ne pas** modifier le `Modal`, qui est partagé.

- [ ] **Step 5: Vérifier les types**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: aucune sortie.

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/components/explorer/CopyEmailsModal.tsx bertel-tourism-ui/src/components/explorer/CopyEmailsModal.test.tsx
git commit -m "feat(§211): modale Copier les e-mails — compteurs honnetes, separateur, etat presse-papiers"
```

---

## Task 5: Brancher les deux points d'entrée

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/SelectionBar.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/SelectionBar.test.tsx`
- Modify: `bertel-tourism-ui/src/views/ListComposeView.tsx` (barre d'en-tête, à côté du bouton « Imprimer », vers la ligne 305)
- Create: `bertel-tourism-ui/src/views/ListComposeView.emails.test.tsx`

**Interfaces:**
- Consomme : `CopyEmailsModal` (tâche 4) ; `useSessionStore(state => state.canEditObjects)` — le drapeau existe déjà (`src/store/session-store.ts:37`).
- Produit : rien de réutilisable ; c'est le câblage final.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `bertel-tourism-ui/src/components/explorer/SelectionBar.test.tsx`, dans le `describe` existant :

```tsx
  it('un éditeur avec sélection voit le bouton E-mails', () => {
    useSessionStore.setState({ canEditObjects: true });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.getByRole('button', { name: /E-mails/ })).toBeInTheDocument();
  });

  it('un lecteur seul ne voit PAS le bouton E-mails, même avec une sélection', () => {
    useSessionStore.setState({ canEditObjects: false });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.queryByRole('button', { name: /E-mails/ })).toBeNull();
  });
```

Ajouter en tête du fichier :

```tsx
import { useSessionStore } from '../../store/session-store';
```

et dans le `beforeEach` existant :

```tsx
    useSessionStore.setState({ canEditObjects: true });
```

Créer `bertel-tourism-ui/src/views/ListComposeView.emails.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { ListComposeEmailsButton } from './ListComposeView';
import { useSessionStore } from '../store/session-store';

jest.mock('@/services/selection-emails', () => ({
  ...jest.requireActual('@/services/selection-emails'),
  fetchSelectionEmails: jest.fn(() => new Promise(() => {})),
}));

describe('ListComposeView — bouton E-mails', () => {
  it('un éditeur voit le bouton', () => {
    useSessionStore.setState({ canEditObjects: true });
    render(<ListComposeEmailsButton listId="list-1" />);
    expect(screen.getByRole('button', { name: /E-mails/ })).toBeInTheDocument();
  });

  it('un lecteur seul ne voit PAS le bouton', () => {
    useSessionStore.setState({ canEditObjects: false });
    render(<ListComposeEmailsButton listId="list-1" />);
    expect(screen.queryByRole('button', { name: /E-mails/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd bertel-tourism-ui && npm run test:run -- SelectionBar ListComposeView.emails`
Expected: FAIL — bouton absent, et `ListComposeEmailsButton` non exporté.

- [ ] **Step 3: Brancher la `SelectionBar`**

Dans `bertel-tourism-ui/src/components/explorer/SelectionBar.tsx` :

Ajouter aux imports (`lucide-react` et les composants) :

```tsx
import { Download, ListPlus, Mail, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { CopyEmailsModal } from './CopyEmailsModal';
```

Dans le corps du composant, après les `useState` existants :

```tsx
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const [emailsOpen, setEmailsOpen] = useState(false);
```

Dans le bloc `{!empty && (<>…</>)}`, juste après le bouton « CSV » :

```tsx
          {/* Réservé aux éditeurs : l'adresse du prestataire est une donnée
              `partners`, non publique. Le masquage est du confort — la vraie
              garde est celle du RPC (§211). */}
          {canEditObjects && (
            <button
              type="button"
              onClick={() => setEmailsOpen(true)}
              title="Copier la liste des e-mails des fiches sélectionnées"
              className={enabledAction}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              E-mails
            </button>
          )}
```

Et, juste avant le portail d'impression en fin de JSX :

```tsx
      <CopyEmailsModal
        objectIds={selectedObjectIds}
        open={emailsOpen}
        onOpenChange={setEmailsOpen}
      />
```

- [ ] **Step 4: Brancher `ListComposeView`**

Dans `bertel-tourism-ui/src/views/ListComposeView.tsx` :

Ajouter **le seul import manquant** :

```tsx
import { CopyEmailsModal } from '@/components/explorer/CopyEmailsModal';
```

⚠️ `useSessionStore` est **déjà importé** dans ce fichier (ligne 18) — ne pas ajouter un second import, TypeScript le refuserait.

Ajouter, **au niveau du module** (hors du composant principal, pour être testable isolément) :

```tsx
/**
 * Bouton « E-mails » de la barre d'en-tête. Passe le `listId`, JAMAIS les ids
 * résolus par la page : une liste dynamique est plafonnée à 200 côté page, et
 * l'export doit pouvoir en résoudre 2 000 (§211).
 */
export function ListComposeEmailsButton({ listId }: { listId: string }) {
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const [open, setOpen] = useState(false);
  if (!canEditObjects) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5"
      >
        <Mail className="h-4 w-4" /> E-mails
      </button>
      <CopyEmailsModal listId={listId} open={open} onOpenChange={setOpen} />
    </>
  );
}
```

Dans la barre d'en-tête, juste après le bouton « Imprimer » (vers la ligne 305) :

```tsx
          <ListComposeEmailsButton listId={detail.id} />
```

Vérifier que `Mail` et `useState` sont bien dans les imports du fichier (`Mail` y est déjà, ligne 11).

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `cd bertel-tourism-ui && npm run test:run -- SelectionBar ListComposeView.emails`
Expected: PASS.

- [ ] **Step 6: Lancer la suite complète et le typecheck**

Run: `cd bertel-tourism-ui && npm run test:run && npm run typecheck`
Expected: toutes les suites vertes, 0 erreur de type. Une régression sur `SelectionBar.test.tsx` signifie que le `beforeEach` ne pose pas `canEditObjects` — corriger le test, pas le composant.

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/components/explorer/SelectionBar.tsx bertel-tourism-ui/src/components/explorer/SelectionBar.test.tsx bertel-tourism-ui/src/views/ListComposeView.tsx bertel-tourism-ui/src/views/ListComposeView.emails.test.tsx
git commit -m "feat(§211): bouton E-mails dans la barre de selection et sur la page d'une liste"
```

---

## Task 6: Documentation — journal de décisions, invariant, différé

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (ajouter `## §211` à la fin)
- Modify: `CLAUDE.md` (nouvelle section d'invariant)
- Modify: `.claude/WORKFLOW.md` (une ligne dans le tableau des différés)

**Interfaces:** aucune — documentation.

- [ ] **Step 1: Vérifier le numéro de section**

Run: `grep -o "^## §[0-9]*" bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md | tail -1`
Expected: `## §210`. Si un autre numéro sort, utiliser le suivant partout dans ce plan (le numéro n'est pas réservé ; une session parallèle a pu le prendre).

- [ ] **Step 2: Écrire l'entrée du journal**

Ajouter à la fin de `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` :

```markdown
## §211 — Copier la liste d'e-mails d'une sélection (Exploreur + Listes)

**Date** : 2026-08-07 · **Spec** : `docs/superpowers/specs/2026-08-07-copier-emails-selection-design.md` · **Plan** : `docs/superpowers/plans/2026-08-07-copier-emails-selection.md` · **Manifest** : E1 + E2

**Besoin.** Écrire à un sous-ensemble de prestataires (toute la base, les hébergements, une zone)
sans recomposer la liste d'adresses à la main : un clic, le presse-papiers, on colle dans Gmail.

**Ce qui existait déjà et n'a PAS été rebâti.** La « sélection dynamique enregistrable » est le
module Listes : `kind='static'` (membres figés) et `kind='dynamic'` (filtres Explorer en jsonb,
ré-résolus live). Le manque était l'extraction des e-mails, pas le mécanisme de sélection.

**Entonnoir mesuré (2026-08-07), cascade exécutée bout en bout :** 842 fiches published+draft →
**840 éligibles** (périmètre publisher) → **821 résolues** → **717 adresses distinctes** →
**19 muettes**. L'écart 821→717 vient des propriétaires multi-établissements.
⚠️ Une *union des deux sources* donne 811 — c'est **faux** pour la cascade. Toute reprise de ces
chiffres doit re-mesurer l'entonnoir complet.

**Décisions.**
- **D1 cascade prestataire → fiche.** Rejeté : prestataire seul (perd 66 fiches) ; union (écrit
  deux fois au même établissement).
- **D2 deux surfaces, un composant** : `SelectionBar` + `/listes/[id]`. Rejeté : une entrée
  « copier les N résultats filtrés » — « Sélection » coche déjà tout le filtre.
- **D3 modale de contrôle**, adresses nues (décision PO), séparateur au choix, phrase Cci. Une
  copie silencieuse tairait le périmètre écarté, le dédoublonnage et les fiches muettes.
- **D4 périmètre = `api.current_user_crm_object_ids()`** (ORG publisher), **pas**
  `readable_object_ids` : en multi-ORG, lire une fiche publiée d'une autre ORG ne donne pas droit
  à l'e-mail `partners` de son exploitant. Rejeté : créer un 3ᵉ helper de périmètre.
  Le périmètre écarté est **compté et rendu**, jamais absorbé.
- **D5 garde `canEditObjects`**, dans le RPC — le masquage du bouton n'est pas la garde.
- **D6 validité `valid_from`/`valid_to`** — prospective (0 lien expiré en base), retenue parce
  que gratuite.
- **D7 refus de consentement honoré dès maintenant** (`actor_consent(email, FALSE)` coupe le bras
  acteur). Rejeté : « rouvrir à la première ligne » (vigilance non garantie) et le test tripwire
  (rougit sur une donnée légitime, sera désarmé). Le repli sur l'adresse pro de la fiche reste
  licite.
- **D8 résolveur scindé** : `api.resolve_list_object_ids` est `DEFINER` + `GRANT authenticated` et
  **replafonne elle-même à 200** — passer 2 000 rendait 200, donc une liste dynamique « toute la
  base » aurait envoyé à 200 prestataires en affichant un compte crédible. Moteur déplacé en
  `internal` (2001 = 2000+1 pour distinguer « exactement 2000 » de « plus de 2000 ») ; contrat
  public inchangé. Liste dynamique **published-only**, fidèle à `get_list`.
- **D9 `archived`/`hidden` exclus**, y compris via une vieille liste statique.

**Arbitrages PO ouverts.** (1) Liste dynamique en `published`-only : les exploitants de fiches en
brouillon ne sont joignables que par la voie Exploreur. (2) Les **2 fiches sans lien `publisher`**
sont hors périmètre — défaut de données à corriger côté fiches, pas une raison d'élargir la garde.

**Différé ouvert par cette passe** : `api.resolve_list_object_ids` non borné au lisible (cf.
`.claude/WORKFLOW.md`) — pré-existant, portée = des identifiants, pas de contenu ni de PII ; §211
s'est contenté de ne pas l'aggraver.
```

- [ ] **Step 3: Proposer l'invariant dans CLAUDE.md**

Ajouter à `CLAUDE.md`, après la section « Une colonne de catalogue qu'aucune voie de lecture n'émet est une colonne MORTE » :

```markdown
### Extraire des coordonnées EN LOT n'est pas la même autorisation que les lire (§211)
Le périmètre de lecture (`api.current_user_readable_object_ids()` = publié ∪ étendu) **n'autorise
pas** l'extraction en masse d'une donnée non publique. Lire une fiche publiée d'une autre ORG ne
donne aucun droit sur l'e-mail `visibility='partners'` de son exploitant. Tout RPC qui exporte des
coordonnées pour un ENSEMBLE d'objets se borne au périmètre `api.current_user_crm_object_ids()`
(les fiches dont l'ORG de l'appelant est `publisher` — déjà le périmètre du CRM, qui manipule les
mêmes données), superuser excepté. Corollaires :
- **Ne jamais élargir un RPC déjà exposé pour servir un besoin interne.** `api.resolve_list_object_ids`
  est `DEFINER` + `GRANT … TO authenticated` : relever son plafond aurait multiplié par dix une
  exposition existante. Le moteur va dans `internal` (REVOKE anon/authenticated), le contrat public
  garde son plafond. Un appelant privilégié n'est pas une raison d'ouvrir la porte publique.
- **Un périmètre écarté se COMPTE et se REND** (`requested_count`/`eligible_count`/`excluded_count`),
  jamais absorbé : une fiche silencieusement retirée d'un export se lit comme une fiche sans donnée —
  deux causes différentes, deux actions correctives différentes.
- **`is_primary` est NULLABLE** dans `contact_channel`, `actor_channel` et `actor_object_role`, et
  `ORDER BY … DESC` place les `NULL` **en premier** : sans `NULLS LAST`, un drapeau non renseigné
  passe devant le canal explicitement principal.
- **Un lien daté est une garde**, pas une décoration : `actor_object_role.valid_from/valid_to` doivent
  être filtrés, sinon on écrit à l'ancien exploitant.
- **Un refus explicite se code, une promesse de vigilance ne se code pas** : `actor_consent
  (channel='email', consent_given=FALSE)` coupe le bras acteur dès maintenant, alors même que la
  table est vide. Un `NOT EXISTS` vacant est correct pour toujours ; un test qui rougit à l'arrivée
  d'une donnée légitime sera désarmé au premier passage.
- **Un `RAISE EXCEPTION 'TEXTE'` nu produit `P0001` pour tous les cas** : le front n'a plus que le
  texte pour brancher. Utiliser `RAISE SQLSTATE 'PTxyz' USING MESSAGE = '…'` (PostgREST mappe `PTxyz`
  sur le statut HTTP `xyz` et expose le SQLSTATE dans `error.code`), `42501` pour les refus.
- **Charger la ligne AVANT d'autoriser** quand le prédicat d'autorisation est un `EXISTS` : il rend
  `FALSE` sur une ligne supprimée (⇒ « interdit » au lieu de « introuvable ») et `TRUE` pour un
  superuser sur un id inexistant (⇒ ligne NULL en aval).
Voir `lot1_mapping_decisions.md` §211 et `docs/superpowers/specs/2026-08-07-copier-emails-selection-design.md`.
```

- [ ] **Step 4: Inscrire le différé**

Ajouter une ligne au tableau « Deferred items tracker » de `.claude/WORKFLOW.md` :

```markdown
| **`api.resolve_list_object_ids` non borné au lisible** (§211) — `DEFINER` + `GRANT … TO authenticated`, délègue à `get_filtered_object_ids` dont le chemin vif lit `FROM object o` sans intersection lisible ⇒ un authentifié obtient jusqu'à 200 ids d'objets hors périmètre avec `p_published_only=false`. Portée : des identifiants, **pas** de contenu ni de PII (RLS gate toujours la lecture des données) | Pré-existant, découvert en instruisant §211 qui s'est contenté de **ne pas l'aggraver** (moteur haute capacité en `internal`). Refermer le RPC = ajouter l'intersection lisible à une fonction du module Listes en production, dont l'effet sur `get_list`/`list_my_lists` doit être mesuré | Passe dédiée ; correctif pressenti = `AND object_id IN (SELECT api.current_user_readable_object_ids())` dans le passe-plat public |
```

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md CLAUDE.md .claude/WORKFLOW.md
git commit -m "docs(§211): journal de decisions, invariant extraction en lot, differe resolve_list_object_ids"
```

---

## Task 7: Déploiement live — ÉTAPE MANUELLE, NE PAS AUTOMATISER

**Cette tâche écrit sur la base de PRODUCTION de l'OTI. Un agent ne l'exécute pas de sa propre initiative : il s'arrête ici et demande explicitement le feu vert.**

- [ ] **Step 1: Demander le feu vert**

Présenter au PO : les deux fichiers de migration, le fait que `E1` modifie une fonction du module Listes déjà en production (comportement inchangé, prouvé par `test_object_list.sql`), et le fait que `E2` est purement additif.

- [ ] **Step 2: Appliquer E1 puis vérifier**

Appliquer `migration_list_resolver_internal.sql` via le MCP Supabase (`apply_migration`, nom `list_resolver_internal_211`), puis exécuter `tests/test_list_resolver_internal.sql` **et** `tests/test_object_list.sql` en live (transactionnels, `ROLLBACK`).

- [ ] **Step 3: Appliquer E2 puis vérifier**

Appliquer `migration_selection_emails.sql` (`apply_migration`, nom `selection_emails_211`), puis exécuter `tests/test_selection_emails.sql` en live.

- [ ] **Step 4: Recharger le schéma PostgREST**

Run: `NOTIFY pgrst, 'reload schema';`
Sans quoi le nouveau RPC reste invisible à l'application.

- [ ] **Step 5: Vérifier les chiffres réels**

Exécuter `api.list_selection_emails` sur l'ensemble du corpus publié et confirmer l'ordre de grandeur attendu : ~840 éligibles, ~821 résolues, ~717 adresses distinctes, ~19 muettes. Un écart important signale une divergence entre la cascade codée et la cascade mesurée en conception.

- [ ] **Step 6: Vérifier les advisors**

Lancer `get_advisors(type='security')` : les WARN `security_definer_function_executable` sur `api.list_selection_emails` sont **attendus** (classe §36). Toute autre alerte neuve est à traiter.

---

## Ce que ce plan ne fait pas

- Envoi d'e-mail depuis l'application — le geste reste « copier → coller dans Gmail ».
- Journalisation CRM de l'export.
- Fermeture du RPC `api.resolve_list_object_ids` (différé, tâche 6 step 4).
- Pagination au-delà de 2 000 fiches — le plafond lève `PT413`.

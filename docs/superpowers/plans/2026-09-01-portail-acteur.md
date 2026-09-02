# Portail acteur : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ouvrir aux acteurs (prestataires) un portail dédié `/espace` où chacun ne voit que les fiches de ses objets, les remplit via l'éditeur existant en mode contributeur forcé, et où chaque « Soumettre » crée transactionnellement une soumission + une tâche CRM de vérification multi-assignée aux éditeurs — avec validation totale ou partielle côté modération (D9).

**Architecture :** Une seule migration SQL (« 18a ») porte tout le socle : persona `actor` (4e valeur du CHECK), activation de `app_user_profile.actor_id`, portée de lecture dédiée branchée dans `current_user_extended_object_ids()`, fermeture de `is_object_owner` pour les acteurs (D7), tables `fiche_submission` + `org_actor_module_visibility`, RPC transactionnel `submit_actor_fiche`, RPCs de validation groupée/attestée (D9), trigger de résolution, extension outbox e-mail. Le front ajoute un groupe de routes `(portal)` hors AppShell, **une interface portail dédiée et simplifiée** (révision D10 du 2026-09-02 : liste de rubriques par fiche, un petit formulaire par rubrique, un seul geste d'envoi — elle réutilise la couche d'état de l'éditeur `useObjectEditorState` + `buildContributorSubmission`, JAMAIS sa présentation), la gestion d'accès depuis la fiche prestataire CRM, et la vue groupée par soumission dans ModerationPage.

**Tech stack :** Next.js App Router (client-side, zustand, TanStack Query, Jest+RTL), Supabase (RPC `api.*` SECURITY DEFINER, RLS service_role-only sur les tables sensibles, routes Next service-role), nodemailer (outbox drainée).

**Spec :** `docs/superpowers/specs/2026-09-01-portail-acteur-design.md` (D1→D9 actées PO).

## Global Constraints

- Worktree : `C:\Users\dphil\Bertel3.0\.claude\worktrees\actor-sheet-interface-spec-26b57f`, branche `claude/actor-sheet-interface-spec-26b57f`. Tout se passe ici ; ne jamais `cd` vers le dépôt principal.
- Commits : conventionnels (`feat:`/`fix:`/`test:`/`docs:`), **SANS trailer co-author**, un commit par incrément vérifié vert. Messages en français.
- Commentaires code et libellés UI en **français**, style des fichiers voisins (commentaires denses expliquant le POURQUOI, jamais le « quoi »).
- Tests front : `npm run test:run -- <chemin>` (jamais `npm test` = watch). Typecheck : `npm run typecheck`. Les deux depuis `bertel-tourism-ui/`.
- **Aucun `client.from(...)` côté front** sur `pending_change`, `fiche_submission`, `crm_*`, `app_notification`, `org_actor_module_visibility` : RLS service_role-only, tout passe par RPC `api.*` DEFINER ou routes Next service-role.
- SQL : migration idempotente (`CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP POLICY IF EXISTS`), toute fonction DEFINER avec `SET search_path` se terminant par `pg_temp` quand elle lit des tables (§208/R2.1), toute sonde 3-états `COALESCE(…, FALSE)` (§204). Grants : `REVOKE … FROM PUBLIC, anon` puis `GRANT … TO authenticated, service_role`.
- **Validation SQL pendant le dev** : chaque bloc SQL se valide contre la base LIVE via MCP Supabase (`mcp__supabase__execute_sql`) en transaction annulée — coller le contenu en remplaçant le `COMMIT;` final par `ROLLBACK;`. **Le déploiement réel n'a lieu qu'à la Task 9** (via `mcp__supabase__apply_migration`).
- Les tests SQL suivent le gabarit maison : en-tête « Prouve … » avec blocs lettrés, `\set ON_ERROR_STOP on`, `BEGIN; DO $$ … END$$; ROLLBACK;`, fixtures à plage dédiée (ici **13xx** : `ORGRUN9999991301`, uuids `…001301`+), personas via `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`, vérifications d'état sous `RESET ROLE`. Modèle : `tests/test_moderation_rpcs.sql`.
- Ne PAS modifier `rls_policies.sql`, `schema_unified.sql`, `migration_moderation_rpcs.sql`, `migration_crm_task_email_documents.sql` : la nouvelle migration porte ses propres `CREATE OR REPLACE` (pattern 17m). Exception unique : les fichiers de packaging (README, runbook, ci_fresh_apply) en Task 9.
- md5 de prudence : avant de re-déployer une fonction existante modifiée (`current_user_extended_object_ids`, `is_object_owner`, `approve_pending_change`, `list_pending_changes`, `claim_unmailed_notifications`, `mark_notifications_emailed`, `list_crm_tasks`, `rpc_gdpr_erase_subject`), vérifier via MCP que son `prosrc` live correspond au fichier source cité, sinon STOP et signaler (doctrine lot-corrections : le plan se trompe, la base fait foi).

---

### Task 0 : Préparer le worktree

**Files :** aucun (setup).

Le worktree n'a **pas** de `node_modules` (vérifié le 2026-09-01). Recette mémoire « worktree node_modules junction ».

- [ ] **Step 1 : Junction node_modules**

```bash
cmd /c mklink /J "C:\Users\dphil\Bertel3.0\.claude\worktrees\actor-sheet-interface-spec-26b57f\bertel-tourism-ui\node_modules" "C:\Users\dphil\Bertel3.0\bertel-tourism-ui\node_modules"
```

Attendu : `Junction created for …`.

- [ ] **Step 2 : Baseline verte**

```bash
cd bertel-tourism-ui && npm run typecheck
```

Attendu : exit 0. Puis un échantillon de tests pour valider l'environnement jest :

```bash
cd bertel-tourism-ui && npm run test:run -- src/views/ModerationPage.test.tsx
```

Attendu : PASS.

- [ ] **Step 3 : Vérifier l'état live des fonctions à re-déployer**

Via `mcp__supabase__execute_sql` :

```sql
SELECT proname, md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'api' AND proname IN
 ('current_user_extended_object_ids','is_object_owner','approve_pending_change',
  'list_pending_changes','claim_unmailed_notifications','mark_notifications_emailed',
  'list_crm_tasks','rpc_gdpr_erase_subject','user_actor_ids')
ORDER BY proname;
```

Noter les md5 dans un fichier de travail (scratchpad). Ils serviront de référence « avant » ; après le déploiement (Task 9) on re-relève pour prouver que seules les fonctions visées ont bougé.

---

### Task 1 : Migration — persona `actor` + portée portail (SQL)

**Files :**
- Create: `Base de donnée DLL et API/migration_actor_portal.sql`
- Create: `Base de donnée DLL et API/tests/test_actor_portal.sql`

**Interfaces :**
- Produces: `api.is_actor_persona() → boolean`, `api.current_user_actor_id() → uuid`, `api.current_user_portal_object_ids() → SETOF text`, CHECK `app_user_profile.role` étendu à `'actor'`. Les Tasks 2-8 ajoutent leurs sections DANS ce même fichier de migration (sections numérotées) et leurs blocs DANS ce même fichier de test.

- [ ] **Step 1 : Écrire le test (blocs A + B), le lancer ROUGE**

Créer `Base de donnée DLL et API/tests/test_actor_portal.sql` :

```sql
-- test_actor_portal.sql
-- Prouve migration_actor_portal.sql (manifeste 18a, spec 2026-09-01-portail-acteur-design.md) :
--   (A) PERSONA — le CHECK app_user_profile.role accepte 'actor' (et garde NULL + les 3 valeurs
--       historiques) ; api.is_actor_persona() rend TRUE pour un profil 'actor', FALSE pour un
--       tourism_agent, FALSE hors contexte HTTP (COALESCE §204) ; api.current_user_actor_id()
--       rend l'actor_id du profil, NULL sinon.
--   (B) PORTÉE — api.current_user_portal_object_ids() : lien valide ⇒ objet présent ; lien
--       expiré (valid_to hier) ⇒ absent ; lien futur (valid_from demain) ⇒ absent ; objet ORG
--       ⇒ absent ; et SURTOUT le pont e-mail ne joue PAS (un acteur persona dont l'e-mail
--       matche un AUTRE acteur ne voit pas les objets de cet autre acteur). Pour la persona
--       acteur, current_user_extended_object_ids() ≡ portal_object_ids (bras 1b fermé : le
--       rôle d'acteur sur une ORG ne donne PLUS les fiches de l'ORG). Pour un tourism_agent,
--       les 5 bras historiques sont inchangés (régression bloc I, Task 8).
-- Blocs C..I ajoutés par les tasks suivantes du même chantier.
-- Contre une base sans la migration : échec immédiat (fonctions absentes) — rouge attendu (TDD).
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste). Plage de fixtures dédiée 13xx.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA    text := 'ORGRUN9999991301';
  v_objA    text := 'HOTRUN9999991311'; -- lien acteur valide
  v_objB    text := 'HOTRUN9999991312'; -- lien expiré
  v_objC    text := 'HOTRUN9999991313'; -- lien futur
  v_objD    text := 'HOTRUN9999991314'; -- fiche de l'ORG (bras 1b) — ne doit PAS être visible
  v_actor1  uuid := '00000000-0000-4000-a000-000000001321'; -- l'acteur du portail
  v_actor2  uuid := '00000000-0000-4000-a000-000000001322'; -- un AUTRE acteur (piège e-mail)
  v_user    uuid := '00000000-0000-4000-a000-000000001301'; -- compte portail (role actor)
  v_agent   uuid := '00000000-0000-4000-a000-000000001302'; -- témoin tourism_agent
  v_role_op uuid;
  v_pub     uuid;
  v_email_kind uuid;
BEGIN
  -- ---------- (A) CHECK + helpers ----------
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'portal_actor_1301@test.local'), (v_agent, 'portal_agent_1302@test.local')
    ON CONFLICT (id) DO NOTHING;
  -- Le CHECK doit accepter 'actor' — c'est le cœur de la migration : rouge avant elle.
  INSERT INTO app_user_profile (id, role) VALUES (v_user, 'actor')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO app_user_profile (id, role) VALUES (v_agent, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- Fixture objets / acteurs / liens (owner, RLS bypass) ----------
  SELECT id INTO v_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_role_op FROM ref_actor_role WHERE code = 'operator' LIMIT 1;
  IF v_role_op IS NULL THEN RAISE EXCEPTION 'fixture: ref_actor_role[operator] manquant'; END IF;
  SELECT id INTO v_email_kind FROM ref_code_contact_kind WHERE code = 'email' LIMIT 1;
  IF v_email_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_contact_kind[email] manquant'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG portail test', 'published'),
    (v_objA, 'HOT', 'Hôtel lien valide', 'draft'),
    (v_objB, 'HOT', 'Hôtel lien expiré', 'published'),
    (v_objC, 'HOT', 'Hôtel lien futur', 'published'),
    (v_objD, 'HOT', 'Hôtel de l''ORG', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub), (v_objB, v_orgA, v_pub), (v_objC, v_orgA, v_pub), (v_objD, v_orgA, v_pub)
    ON CONFLICT DO NOTHING;

  INSERT INTO actor (id, display_name) VALUES
    (v_actor1, 'Acteur Portail 1301'), (v_actor2, 'Acteur Piège 1302')
    ON CONFLICT (id) DO NOTHING;
  -- Piège du pont e-mail : l'e-mail du COMPTE portail est enregistré comme canal de
  -- l'AUTRE acteur. Sous le pont historique (user_actor_ids), ce compte verrait les
  -- objets de v_actor2 ; sous la portée portail (actor_id explicite), il ne doit PAS.
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor2, v_email_kind, 'portal_actor_1301@test.local')
    ON CONFLICT DO NOTHING;

  -- Le lien explicite compte↔acteur (la source de vérité du portail).
  UPDATE app_user_profile SET actor_id = v_actor1 WHERE id = v_user;

  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to) VALUES
    (v_actor1, v_objA, v_role_op, TRUE,  NULL,                        NULL),
    (v_actor1, v_objB, v_role_op, FALSE, NULL,                        CURRENT_DATE - 1),
    (v_actor1, v_objC, v_role_op, FALSE, CURRENT_DATE + 1,            NULL),
    (v_actor1, v_orgA, v_role_op, FALSE, NULL,                        NULL), -- rôle sur l'ORG (bras 1b)
    (v_actor2, v_objD, v_role_op, TRUE,  NULL,                        NULL)  -- objet de l'acteur piège
    ON CONFLICT DO NOTHING;

  -- ---------- (A) suite : helpers sous la persona acteur ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_actor_persona() = TRUE,  'A: is_actor_persona doit être TRUE pour role=actor';
    ASSERT api.current_user_actor_id() = v_actor1, 'A: current_user_actor_id doit rendre l''actor_id du profil';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_actor_persona() = FALSE, 'A: is_actor_persona doit être FALSE pour un tourism_agent';
    ASSERT api.current_user_actor_id() IS NULL, 'A: current_user_actor_id NULL sans lien';
  RESET ROLE;

  -- Hors contexte HTTP : fail-closed, jamais NULL (§204).
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT api.is_actor_persona() = FALSE, 'A: is_actor_persona hors HTTP doit être FALSE (COALESCE)';

  -- ---------- (B) portée portail ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objA),
           'B: lien valide ⇒ objet dans la portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objB),
           'B: lien EXPIRÉ ⇒ hors portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objC),
           'B: lien FUTUR ⇒ hors portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_orgA),
           'B: un objet ORG n''entre jamais dans la portée portail';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objD),
           'B: le pont e-mail ne joue PAS — l''objet de l''acteur homonyme d''e-mail est hors portée';
    -- Le branchement : pour la persona acteur, la fonction ÉTENDUE ≡ la portée portail.
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objD),
           'B: extended (persona acteur) ne doit PAS emprunter le pont e-mail';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objB),
           'B: extended (persona acteur) exclut les liens expirés';
    ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objA),
           'B: extended (persona acteur) contient la fiche liée — y compris en DRAFT';
    -- La lecture RLS suit : la fiche draft liée est lisible, celle du piège non.
    ASSERT (SELECT count(*) FROM object WHERE id = v_objA) = 1,
           'B: la policy object laisse lire la fiche draft liée';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objD) = 0,
           'B: la policy object ne fuit pas la fiche draft de l''acteur piège';
  RESET ROLE;

  RAISE NOTICE 'test_actor_portal blocs A-B OK';
END$$;
ROLLBACK;
```

- [ ] **Step 2 : Lancer le test — vérifier qu'il est ROUGE**

Via `mcp__supabase__execute_sql`, coller le contenu du `DO $$` (sans le `\set`, avec `BEGIN;`/`ROLLBACK;`).
Attendu : erreur sur l'INSERT `role='actor'` (violation du CHECK) — c'est le rouge TDD.

- [ ] **Step 3 : Écrire la section 1 de la migration**

Créer `Base de donnée DLL et API/migration_actor_portal.sql` :

```sql
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 18a — Portail acteur : persona, portée, soumissions vérifiées, validation D9.
-- Spec : docs/superpowers/specs/2026-09-01-portail-acteur-design.md
-- ⚠ Le créneau « 18a » est PROVISOIRE : re-grep docs/SQL_ROLLOUT_RUNBOOK.md ET
-- ci_fresh_apply.sql au moment du packaging (Task 9) — un chantier concurrent peut
-- avoir occupé le créneau (précédent : 17m renuméroté).
--
-- CE QUE FAIT CETTE MIGRATION (sections numérotées, une par task du plan) :
--  1. Persona `actor` (CHECK app_user_profile.role) + helpers is_actor_persona /
--     current_user_actor_id / current_user_portal_object_ids + branchement de la portée
--     dans current_user_extended_object_ids (bras 1b fermé, liens expirés exclus,
--     pont e-mail ignoré pour cette persona). can_read_extended délègue déjà à la
--     fonction ensembliste : UNE seule fonction à brancher, l'équivalence tient seule.
--  2. D7 — is_object_owner ferme l'écriture canonique aux personas acteur.
--  3. DDL — fiche_submission, pending_change.submission_id, org_actor_module_visibility,
--     kind 'fiche_submission_reviewed' (CHECK + index outbox élargis).
--  4. Vérificateurs + visibilité (list_object_verifier_ids, get/set visibility).
--  5. submit_actor_fiche (transactionnel : soumission + N pending_change + tâche
--     multi-assignée + notifications kind crm_task_assigned réutilisé).
--  6. Lectures acteur (list_my_portal_fiches, list_my_submissions, get_my_actor_profile).
--  7. D9 — approve_pending_change(p_applied_manually) ferme le trou « manual_apply
--     jamais approuvable » ; approve/reject_fiche_submission ; list_pending_changes
--     enrichi (submission_id, note, acteur, manual_apply).
--  8. Résolution (trigger), notification acteur, outbox élargie, list_crm_tasks émet
--     extra, RGPD (délie le compte portail).
--
-- Idempotente. NON foldée dans schema_unified.sql (pattern 17i/17m).
-- NOTIFY pgrst requis (fonctions api.* nouvelles/modifiées) — fait en fin de fichier.
-- Dépend de : rls_policies.sql, migration_permission_write_paths.sql,
--   migration_moderation_rpcs.sql, migration_crm_task_multi_assignee_notifications.sql,
--   migration_crm_task_email_documents.sql, migration_role_permission_matrix.sql (17i :
--   org_role_permission), migration_actor_links_editor.sql.
-- Couverte par tests/test_actor_portal.sql.
-- ═══════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Persona `actor` + portée portail.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Le CHECK gagne la valeur 'actor'. On préserve l'arm IS NULL (profil sans rôle =
-- session bricolée côté front, mais des lignes NULL existent légitimement en base).
ALTER TABLE public.app_user_profile DROP CONSTRAINT IF EXISTS app_user_profile_role_check;
ALTER TABLE public.app_user_profile ADD CONSTRAINT app_user_profile_role_check
  CHECK (role IS NULL OR role IN ('owner', 'super_admin', 'tourism_agent', 'actor'));

-- 1.2 La persona. COALESCE(…, FALSE) : auth.uid() est NULL hors HTTP (psql, pooler) —
-- sans lui la sonde rendrait NULL et chaque consommateur `IF NOT …` deviendrait
-- FAIL-OPEN (doctrine §204, même motif que user_can_assign_crm).
CREATE OR REPLACE FUNCTION api.is_actor_persona()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.role = 'actor' FROM app_user_profile p WHERE p.id = (SELECT auth.uid())),
    FALSE);
$$;

-- 1.3 Le lien explicite compte↔acteur (D8) : app_user_profile.actor_id, colonne dormante
-- depuis sa migration d'origine, devient LA source de vérité du portail. Le pont e-mail
-- (api.user_actor_ids) reste intact pour les personas non-acteur.
CREATE OR REPLACE FUNCTION api.current_user_actor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT p.actor_id FROM app_user_profile p WHERE p.id = (SELECT auth.uid());
$$;

-- 1.4 La portée portail : les fiches où MON acteur (actor_id explicite, jamais l'e-mail)
-- tient un lien NON expiré, hors objets ORG (l'éditeur ne les supporte pas).
-- `visibility` du lien n'entre PAS dans le prédicat : elle gouverne la DIFFUSION du
-- lien, pas les droits (doctrine is_public).
CREATE OR REPLACE FUNCTION api.current_user_portal_object_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
-- §208/R2.1 : pg_temp EXPLICITEMENT EN DERNIER (cette feuille décide de la lecture).
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
  SELECT aor.object_id
  FROM actor_object_role aor
  JOIN object o ON o.id = aor.object_id
  WHERE aor.actor_id = api.current_user_actor_id()
    AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
    AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
    AND o.object_type <> 'ORG';
$$;
REVOKE EXECUTE ON FUNCTION api.current_user_portal_object_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_portal_object_ids() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.is_actor_persona()        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.is_actor_persona()        TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.current_user_actor_id()   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_actor_id()   TO authenticated, service_role;

-- 1.5 Branchement de tête dans la fonction ensembliste. Pour la persona acteur, la
-- portée étendue EST la portée portail — le pont e-mail (bras 1a/1b) est ignoré :
-- il accorderait les fiches d'un homonyme d'e-mail et TOUTES les fiches de l'ORG.
-- api.can_read_extended délègue déjà à cette fonction (« one source of truth », voir
-- son en-tête dans rls_policies.sql) : le branchement se propage seul aux ~40 policies
-- de lecture. Les 5 bras historiques sont recopiés BYTE-À-BYTE depuis rls_policies.sql
-- (L149-180) — ne pas les « améliorer » ici.
CREATE OR REPLACE FUNCTION api.current_user_extended_object_ids()
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
BEGIN
  IF api.is_actor_persona() THEN
    RETURN QUERY SELECT * FROM api.current_user_portal_object_ids();
    RETURN;
  END IF;
  RETURN QUERY
  -- Chemin 1a : un acteur du user a un rôle directement sur l'objet
  SELECT aor.object_id FROM actor_object_role aor
  WHERE aor.actor_id IN (SELECT api.user_actor_ids())
  UNION
  -- Chemin 1b : un acteur du user a un rôle sur l'ORG publicatrice de l'objet
  SELECT ool.object_id FROM object_org_link ool
  WHERE ool.org_object_id IN (
    SELECT aor.object_id FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT api.user_actor_ids())
  )
  UNION
  -- Chemin 2A : l'objet EST l'ORG du user (membership actif)
  SELECT uom.org_object_id FROM user_org_membership uom
  WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
  UNION
  -- Chemin 2B : objet rattaché à l'ORG du user (tous rôles, publiés ou non)
  SELECT ool.object_id FROM user_org_membership uom
  JOIN object_org_link ool ON ool.org_object_id = uom.org_object_id
  WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
  UNION
  -- Chemin 2C : périmètre externe publié (org_config.access_scope = 'all_published')
  SELECT o.id FROM object o
  WHERE o.status = 'published'
    AND EXISTS (
      SELECT 1 FROM user_org_membership uom
      JOIN org_config oc ON oc.org_object_id = uom.org_object_id
      WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
        AND oc.access_scope = 'all_published'
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION api.current_user_extended_object_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.current_user_extended_object_ids() TO anon, authenticated, service_role;

COMMENT ON FUNCTION api.is_actor_persona() IS
  '18a portail acteur — TRUE si le profil courant est role=actor. Fail-closed (§204).';
COMMENT ON FUNCTION api.current_user_actor_id() IS
  '18a portail acteur — actor_id EXPLICITE du compte (app_user_profile.actor_id, posé à l''invitation). Jamais le pont e-mail.';
COMMENT ON FUNCTION api.current_user_portal_object_ids() IS
  '18a portail acteur — fiches du portail : liens actor_object_role NON expirés de MON actor_id, hors ORG.';

COMMIT;
```

- [ ] **Step 4 : Valider migration + test en transaction annulée**

Via `mcp__supabase__execute_sql` : coller le contenu de la migration en remplaçant `COMMIT;` par rien, puis à la suite le corps du test (le `DO $$` du Step 1), puis `ROLLBACK;`. Le tout dans UN appel.
Attendu : `test_actor_portal blocs A-B OK` dans les NOTICE, aucun ASSERT en échec, et rien de persisté (vérifier ensuite `SELECT count(*) FROM app_user_profile WHERE role='actor';` → 0).

- [ ] **Step 5 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): portail acteur — persona actor + portée portail (18a §1)"
```

---

### Task 2 : Migration — D7, fermeture de l'écriture canonique aux acteurs (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (ajouter la section 2)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (ajouter le bloc C)

**Interfaces :**
- Consumes: `api.is_actor_persona()` (Task 1).
- Produces: `api.is_object_owner(p_object_id text)` re-déployée — un acteur persona n'obtient JAMAIS l'écriture canonique, même avec un lien `is_primary=TRUE`. Cascade automatique : `user_can_write_object_canonical` → 23 policies d'écriture → `internal.workspace_assert_can_write_object` → sonde `owner` de `get_object_workspace_permissions` → `contributorMode` forcé côté front.

- [ ] **Step 1 : Ajouter le bloc C au test, le lancer ROUGE**

Dans `tests/test_actor_portal.sql`, après le bloc B (avant le `RAISE NOTICE` final), ajouter — et mettre à jour l'en-tête du fichier avec la ligne « (C) D7 … » :

```sql
  -- ---------- (C) D7 : lien primaire + persona acteur ⇒ AUCUNE écriture canonique ----------
  -- v_actor1 tient is_primary=TRUE sur v_objA (fixture bloc B). Avant la migration,
  -- is_object_owner rendait TRUE ⇒ écriture canonique complète sans org ni permission.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objA) = FALSE,
           'C: is_object_owner doit être FALSE pour une persona acteur (D7)';
    ASSERT api.user_can_write_object_canonical(v_objA) = FALSE,
           'C: user_can_write_object_canonical doit suivre (aucun autre bras ne s''ouvre)';
  RESET ROLE;
  -- Témoin : un tourism_agent dont l'e-mail matche un canal d'acteur à lien primaire
  -- GARDE le chemin historique (D7 ne ferme QUE la persona acteur).
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor1, v_email_kind, 'portal_agent_1302@test.local')
    ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objA) = TRUE,
           'C: le chemin owner HISTORIQUE reste ouvert pour un non-acteur (équipes internes)';
  RESET ROLE;
```

Validation MCP (migration Task 1 + test) : le bloc C doit échouer sur `C: is_object_owner doit être FALSE…` — rouge attendu.

- [ ] **Step 2 : Ajouter la section 2 à la migration**

Dans `migration_actor_portal.sql`, avant `COMMIT;` :

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. D7 — l'écriture canonique se ferme aux personas acteur.
--    Avant : e-mail correspondant + actor_object_role.is_primary=TRUE ⇒ écriture
--    canonique COMPLÈTE (objet + 23 tables enfant + tous les save_object_*), sans ORG,
--    sans rôle, sans permission. Contradictoire avec D2 (« retenu jusqu'à validation »).
--    Le bras service_role/superuser est inchangé ; les équipes internes qui empruntent
--    le chemin owner historique (non-acteurs) le gardent. Corps recopié depuis
--    rls_policies.sql L211-222, seul l'AND NOT est ajouté.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.is_object_owner(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, api, auth AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM actor_object_role aor
      WHERE aor.actor_id IN (SELECT * FROM api.user_actor_ids())
        AND aor.object_id = p_object_id
        AND aor.is_primary = TRUE
    )
    -- D7 (18a) : une persona acteur ne tient JAMAIS l'écriture canonique par son lien.
    AND NOT api.is_actor_persona()
  )
  OR auth.role() IN ('service_role','admin')
  OR api.is_platform_superuser();
$$;
COMMENT ON FUNCTION api.is_object_owner(p_object_id text) IS
  '18a/D7 — owner historique (lien primaire via pont e-mail) FERMÉ aux personas actor ; intact pour le reste.';
```

- [ ] **Step 3 : Re-valider en transaction annulée (MCP)**

Attendu : blocs A-C verts, NOTICE finale, ROLLBACK propre.

- [ ] **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): D7 — écriture canonique fermée aux personas acteur (18a §2)"
```

---

### Task 3 : Migration — DDL soumissions, visibilité, kind de notification (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (section 3)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (bloc D1 — assertions DDL)

**Interfaces :**
- Produces: table `fiche_submission` (une ligne par « Soumettre », UNE seule `pending` par fiche), colonne `pending_change.submission_id`, table `org_actor_module_visibility` (masquage org × type × **module**), CHECK `app_notification.kind` élargi à `'fiche_submission_reviewed'`, index outbox élargi. Les Tasks 4-8 consomment ces objets.

**Décision de conception (héritée de la spec, précisée ici)** : la matrice de visibilité est clé par **module d'éditeur** (`module_id`, les 29 ids de `MODULE_KEY_MAP` : `descriptions`, `contacts`, `media`…), pas par numéro de section. Motif : `metadata.section` des enveloppes contributeur porte le module id — l'application serveur n'a alors AUCUN mapping front à dupliquer en SQL. L'UI de paramétrage (Task 19) groupe les modules par section via le mapping front existant (`MODULE_SECTION_NUMS` de `save-issues.ts`).

- [ ] **Step 1 : Ajouter le bloc D1 au test, le lancer ROUGE**

Dans `tests/test_actor_portal.sql` (toujours dans le même `DO $$`, après le bloc C). DECLARE additionnel : `v_denied boolean;`

```sql
  -- ---------- (D1) DDL : tables + contraintes clés ----------
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='fiche_submission'),
         'D1: la table fiche_submission doit exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pending_change' AND column_name='submission_id'),
         'D1: pending_change.submission_id doit exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='org_actor_module_visibility'),
         'D1: la table org_actor_module_visibility doit exister';
  -- Le CHECK des notifications accepte la nouvelle espèce (fail-closed avant migration).
  ASSERT (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conname='chk_app_notification_kind') LIKE '%fiche_submission_reviewed%',
         'D1: chk_app_notification_kind doit inclure fiche_submission_reviewed';
  -- Une seule soumission ouverte par fiche (index partiel unique).
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_fiche_submission_open'),
         'D1: index unique partiel uq_fiche_submission_open manquant';
  -- RLS + REVOKE : un authenticated n'a même pas le SELECT sur la table (permission
  -- denied attendu, PAS « zéro ligne » — le REVOKE frappe avant la policy).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM count(*) FROM fiche_submission;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission doit être inaccessible en PostgREST direct (REVOKE)';
  RESET ROLE;
```

Validation MCP : rouge sur `D1: la table fiche_submission doit exister`.

- [ ] **Step 2 : Ajouter la section 3 à la migration**

Avant `COMMIT;` :

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DDL — soumissions, visibilité par module, nouvelle espèce de notification.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 fiche_submission : UNE ligne par « Soumettre » (D6). Regroupe les N pending_change
-- d'un même geste, porte le message de l'acteur, le statut agrégé et la tâche liée.
CREATE TABLE IF NOT EXISTS public.fiche_submission (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id     text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES public.actor(id) ON DELETE SET NULL,
  submitted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'partial')),
  task_id       uuid REFERENCES public.crm_task(id) ON DELETE SET NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fiche_submission_object ON public.fiche_submission (object_id, status);
CREATE INDEX IF NOT EXISTS idx_fiche_submission_actor  ON public.fiche_submission (submitted_by, submitted_at DESC);
-- Anti-spam structurel (D6) : UNE seule soumission ouverte par fiche. Le RPC de soumission
-- (section 5) rend un message propre ; cet index est la garde de dernier ressort (course).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiche_submission_open
  ON public.fiche_submission (object_id) WHERE status = 'pending';

-- 3.2 Rattachement des changements à leur soumission. SET NULL : la résolution d'une
-- soumission ne doit jamais empêcher la purge d'une ligne pending_change isolée.
ALTER TABLE public.pending_change ADD COLUMN IF NOT EXISTS submission_id uuid
  REFERENCES public.fiche_submission(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pending_change_submission
  ON public.pending_change (submission_id) WHERE submission_id IS NOT NULL;

-- 3.3 Masquage org × type × MODULE (D4/D5). Absence de ligne = visible (défaut ouvert) ;
-- le PLANCHER DUR (modules jamais montrés aux acteurs) est codé dans les fonctions,
-- pas dans cette table — il n'est PAS paramétrable.
CREATE TABLE IF NOT EXISTS public.org_actor_module_visibility (
  org_object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  object_type   text NOT NULL,
  module_id     text NOT NULL,
  is_visible    boolean NOT NULL DEFAULT TRUE,
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_object_id, object_type, module_id)
);

-- 3.4 RLS : fiche_submission et la matrice suivent le régime pending_change/crm_* —
-- service_role/admin uniquement, tout accès via RPC DEFINER.
ALTER TABLE public.fiche_submission            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_actor_module_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_fiche_submission ON public.fiche_submission;
CREATE POLICY admin_fiche_submission ON public.fiche_submission FOR ALL
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
DROP POLICY IF EXISTS admin_org_actor_module_visibility ON public.org_actor_module_visibility;
CREATE POLICY admin_org_actor_module_visibility ON public.org_actor_module_visibility FOR ALL
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));

REVOKE ALL ON TABLE public.fiche_submission            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.org_actor_module_visibility FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fiche_submission            TO service_role;
GRANT ALL ON TABLE public.org_actor_module_visibility TO service_role;

-- 3.5 Nouvelle espèce de notification : le retour à l'ACTEUR quand sa soumission est
-- résolue. Côté éditeurs on RÉUTILISE 'crm_task_assigned' (la tâche EST assignée) —
-- zéro nouvelle espèce dans ce sens.
ALTER TABLE public.app_notification DROP CONSTRAINT IF EXISTS chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind
  CHECK (kind IN ('crm_task_assigned', 'fiche_submission_reviewed'));

-- 3.6 L'index outbox suit le CHECK — les 3 pièces (CHECK, index, claim/ack section 8)
-- s'élargissent ENSEMBLE, sinon la file fuit (invariant spec §6).
DROP INDEX IF EXISTS public.idx_app_notification_unmailed;
CREATE INDEX IF NOT EXISTS idx_app_notification_unmailed
  ON public.app_notification (created_at)
  WHERE email_sent_at IS NULL
    AND kind IN ('crm_task_assigned', 'fiche_submission_reviewed')
    AND email_attempts < 5;

COMMENT ON TABLE public.fiche_submission IS
  '18a — un « Soumettre » du portail acteur : groupe N pending_change, porte le message, le statut agrégé et la tâche de vérification.';
COMMENT ON TABLE public.org_actor_module_visibility IS
  '18a — masquage org × type × module de l''éditeur portail. Absence de ligne = visible. Le plancher dur est dans les fonctions.';
```

- [ ] **Step 3 : Re-valider en transaction annulée (MCP)** — blocs A-D1 verts.

- [ ] **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): tables fiche_submission + visibilité modules + kind reviewed (18a §3)"
```

---

### Task 4 : Migration — vérificateurs + visibilité (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (section 4)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (blocs E + H)

**Interfaces :**
- Consumes: tables Task 3 ; `org_role_permission` (17i), `user_permission`, `user_org_admin_role`.
- Produces:
  - `api.list_object_verifier_ids(p_object_id text) → SETOF uuid` — les éditeurs à assigner (D3) : membres actifs d'une ORG publisher de l'objet dont le rôle métier confère `validate_changes` (matrice 17i) ∪ porteurs d'un grant individuel ; **repli** : rangs admin de l'ORG ; peut rendre vide.
  - `api.get_actor_section_visibility(p_org_object_id text, p_object_type text) → jsonb` — `{masked_modules: text[], floor_modules: text[]}` pour l'écran /settings (membres actifs de l'ORG).
  - `api.get_portal_section_visibility(p_object_id text) → jsonb` — même forme, résolue depuis la fiche, pour la persona acteur (fiche de sa portée) ET pour les membres de l'ORG.
  - `api.rpc_set_actor_section_visibility(p_org_object_id text, p_object_type text, p_module_id text, p_visible boolean) → jsonb` — écriture, rang admin ≥ 30 sur l'ORG, refuse le plancher dur (22023).
  - Constante partagée : fonction `api.actor_portal_floor_modules() → text[]` = `ARRAY['legal','provider-follow-up','publication','sync-identifiers','distribution','provider']` (18 Juridique, 19 Suivi prestataire, 21 Publication, 22 Identifiants externes + modules READONLY jamais éditables).

- [ ] **Step 1 : Ajouter les blocs E et H au test, lancer ROUGE**

Dans le même `DO $$`, ajouter d'abord aux DECLARE :

```sql
  v_editor  uuid := '00000000-0000-4000-a000-000000001303'; -- rôle métier editor (matrice)
  v_viewer  uuid := '00000000-0000-4000-a000-000000001304'; -- viewer sans permission
  v_granted uuid := '00000000-0000-4000-a000-000000001305'; -- grant individuel validate_changes
  v_orgadm  uuid := '00000000-0000-4000-a000-000000001306'; -- rang admin sans validate_changes (repli)
  v_role_editor uuid;
  v_role_viewer uuid;
  v_perm_validate uuid;
  v_adm_role uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid;
  v_vis jsonb;
```

(`v_denied` est déjà déclaré depuis la Task 3.)

Puis après le bloc D1 :

```sql
  -- ---------- Fixture équipe éditrice (owner, RLS bypass) ----------
  SELECT id INTO v_perm_validate FROM ref_permission WHERE code='validate_changes' LIMIT 1;
  IF v_perm_validate IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[validate_changes] manquant'; END IF;
  SELECT id INTO v_role_editor FROM ref_org_business_role WHERE code='editor' LIMIT 1;
  SELECT id INTO v_role_viewer FROM ref_org_business_role WHERE code='viewer' LIMIT 1;
  IF v_role_editor IS NULL OR v_role_viewer IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_business_role manquant'; END IF;
  SELECT id INTO v_adm_role FROM ref_org_admin_role WHERE rank >= 30 LIMIT 1;
  IF v_adm_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_admin_role rang>=30 manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_editor, 'portal_editor_1303@test.local'), (v_viewer, 'portal_viewer_1304@test.local'),
    (v_granted, 'portal_granted_1305@test.local'), (v_orgadm, 'portal_orgadm_1306@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_editor, 'tourism_agent'), (v_viewer, 'tourism_agent'),
    (v_granted, 'tourism_agent'), (v_orgadm, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (id, user_id, org_object_id, is_active) VALUES
    (gen_random_uuid(), v_editor, v_orgA, TRUE),
    (gen_random_uuid(), v_viewer, v_orgA, TRUE),
    (gen_random_uuid(), v_granted, v_orgA, TRUE),
    (gen_random_uuid(), v_orgadm, v_orgA, TRUE)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_m1 FROM user_org_membership WHERE user_id=v_editor AND org_object_id=v_orgA;
  SELECT id INTO v_m2 FROM user_org_membership WHERE user_id=v_viewer AND org_object_id=v_orgA;
  SELECT id INTO v_m3 FROM user_org_membership WHERE user_id=v_granted AND org_object_id=v_orgA;
  SELECT id INTO v_m4 FROM user_org_membership WHERE user_id=v_orgadm AND org_object_id=v_orgA;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES
    (v_m1, v_role_editor, TRUE), (v_m2, v_role_viewer, TRUE), (v_m3, v_role_viewer, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES (v_m4, v_adm_role, TRUE)
    ON CONFLICT DO NOTHING;
  -- La matrice 17i : le rôle editor de CETTE ORG confère validate_changes.
  INSERT INTO org_role_permission (org_object_id, role_id, permission_id, is_active) VALUES
    (v_orgA, v_role_editor, v_perm_validate, TRUE)
    ON CONFLICT (org_object_id, role_id, permission_id) DO UPDATE SET is_active = TRUE;
  -- Le grant individuel (exception).
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES
    (v_granted, v_perm_validate, TRUE)
    ON CONFLICT (user_id, permission_id) DO UPDATE SET is_active = TRUE;

  -- ---------- (E) list_object_verifier_ids ----------
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_editor),
         'E: le rôle métier editor (matrice 17i) est vérificateur';
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_granted),
         'E: le grant individuel validate_changes est vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_viewer),
         'E: un viewer sans permission n''est PAS vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: le rang admin seul n''entre pas TANT QUE des vérificateurs existent';
  -- Repli : on éteint la matrice et le grant ⇒ les rangs admin prennent le relais.
  UPDATE org_role_permission SET is_active = FALSE
   WHERE org_object_id = v_orgA AND permission_id = v_perm_validate;
  UPDATE user_permission SET is_active = FALSE
   WHERE user_id = v_granted AND permission_id = v_perm_validate;
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: repli — sans validate_changes actif, les rangs admin de l''ORG sont assignés';
  -- Restauration pour les blocs suivants.
  UPDATE org_role_permission SET is_active = TRUE
   WHERE org_object_id = v_orgA AND permission_id = v_perm_validate;
  UPDATE user_permission SET is_active = TRUE
   WHERE user_id = v_granted AND permission_id = v_perm_validate;

  -- ---------- (H) visibilité : défauts, plancher, écriture gated ----------
  -- Défaut ouvert : sans ligne, seul le plancher masque.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_portal_section_visibility(v_objA);
    ASSERT (v_vis->'floor_modules') ? 'legal',
           'H: le plancher dur contient legal (§18)';
    ASSERT NOT ((v_vis->'masked_modules') ? 'descriptions'),
           'H: sans config, descriptions est visible (défaut ouvert)';
    -- Hors portée ⇒ refus.
    v_denied := false;
    BEGIN PERFORM api.get_portal_section_visibility(v_objD);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: get_portal_section_visibility hors portée doit lever 42501';
  RESET ROLE;
  -- Écriture : rang ≥ 30 requis ; plancher refusé.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'descriptions', FALSE);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: un éditeur sans rang >= 30 ne règle pas la matrice';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_orgadm, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'descriptions', FALSE);
    v_denied := false;
    BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'legal', TRUE);
    EXCEPTION WHEN others THEN v_denied := true; END;
    ASSERT v_denied, 'H: le plancher dur n''est PAS paramétrable (même pour l''ouvrir)';
  RESET ROLE;
  -- Le masquage configuré remonte côté portail.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_portal_section_visibility(v_objA);
    ASSERT (v_vis->'masked_modules') ? 'descriptions',
           'H: le masquage org×type configuré remonte dans la vue portail';
  RESET ROLE;
```

Validation MCP : rouge sur le bloc E (`list_object_verifier_ids` absente).

- [ ] **Step 2 : Ajouter la section 4 à la migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vérificateurs (D3) + visibilité des modules (D4/D5).
-- ─────────────────────────────────────────────────────────────────────────────

-- 4.1 Le plancher dur : modules JAMAIS montrés/acceptés côté acteur, quelle que soit la
-- config. §18 Juridique (legal), §19 Suivi prestataire (provider-follow-up = notes
-- privées), §21 Publication (publication), §22 Identifiants externes (sync-identifiers),
-- plus les modules READONLY de l'éditeur (distribution, provider). Ajout 2026-09-02 :
-- relationships (son writer auto save_object_relations réécrit object_org_link ET
-- actor_object_role — le périmètre même de l'acteur), places (save_object_places
-- supprime les médias des sous-lieux absents du payload), media (aucun chemin
-- d'upload ni d'application pour un acteur, D11). Fonction plutôt que table : non
-- paramétrable PAR CONSTRUCTION.
CREATE OR REPLACE FUNCTION api.actor_portal_floor_modules()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['legal','provider-follow-up','publication','sync-identifiers','distribution','provider',
               'relationships','places','media'];
$$;

-- 4.2 Les vérificateurs d'une fiche (D3) : membres ACTIFS d'une ORG publisher de l'objet
-- tenant validate_changes — par la matrice de rôle (17i) OU par grant individuel.
-- REPLI : si personne, les rangs admin de l'ORG. Peut rendre VIDE (la soumission
-- n'échoue pas pour ça — la tâche part non assignée, signalée au client).
-- Les superusers plateforme ne sont PAS inclus : ils voient tout de toute façon,
-- les assigner d'office noierait leur « mes tâches ».
CREATE OR REPLACE FUNCTION api.list_object_verifier_ids(p_object_id text)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH pub_orgs AS (
    SELECT ool.org_object_id
    FROM object_org_link ool
    JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
    WHERE ool.object_id = p_object_id
  ), perm AS (
    SELECT id FROM ref_permission WHERE code = 'validate_changes' AND is_active LIMIT 1
  ), members AS (
    SELECT uom.id AS membership_id, uom.user_id, uom.org_object_id
    FROM user_org_membership uom
    JOIN pub_orgs p ON p.org_object_id = uom.org_object_id
    WHERE uom.is_active
  )
  SELECT DISTINCT m.user_id FROM members m
  JOIN user_org_business_role ubr ON ubr.membership_id = m.membership_id AND ubr.is_active
  JOIN org_role_permission orp
    ON orp.org_object_id = m.org_object_id
   AND orp.role_id = ubr.role_id AND orp.is_active
  JOIN perm ON perm.id = orp.permission_id
  UNION
  SELECT DISTINCT m.user_id FROM members m
  JOIN user_permission up ON up.user_id = m.user_id AND up.is_active
  JOIN perm ON perm.id = up.permission_id;

  IF NOT FOUND THEN
    -- Repli : rangs admin de l'ORG publisher.
    RETURN QUERY
    SELECT DISTINCT uom.user_id
    FROM object_org_link ool
    JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
    JOIN user_org_membership uom ON uom.org_object_id = ool.org_object_id AND uom.is_active
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active
    WHERE ool.object_id = p_object_id;
  END IF;
END;
$$;

-- 4.3 Lecture de la matrice pour /settings (org + type explicites). Membres actifs de
-- l'ORG uniquement (même périmètre que la policy SELECT d'org_role_permission).
CREATE OR REPLACE FUNCTION api.get_actor_section_visibility(p_org_object_id text, p_object_type text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_org_membership uom
    WHERE uom.user_id = (SELECT auth.uid()) AND uom.org_object_id = p_org_object_id AND uom.is_active
  ) AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'Réservé aux membres de l''organisation' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'floor_modules', to_jsonb(api.actor_portal_floor_modules()),
    'masked_modules', COALESCE((
      SELECT jsonb_agg(v.module_id ORDER BY v.module_id)
      FROM org_actor_module_visibility v
      WHERE v.org_object_id = p_org_object_id AND v.object_type = p_object_type
        AND v.is_visible = FALSE), '[]'::jsonb));
END;
$$;

-- 4.4 Variante portail : résout l'ORG publisher (primaire d'abord) et le type depuis la
-- fiche. Autorisée : persona acteur pour une fiche de SA portée, membres de l'ORG,
-- superuser. C'est elle que consomme l'éditeur en mode portail (front ET section 5).
CREATE OR REPLACE FUNCTION api.get_portal_section_visibility(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_org  text;
  v_type text;
BEGIN
  IF NOT (
    (api.is_actor_persona()
      AND p_object_id IN (SELECT api.current_user_portal_object_ids()))
    OR api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_org_link ool
      JOIN user_org_membership uom ON uom.org_object_id = ool.org_object_id AND uom.is_active
      WHERE ool.object_id = p_object_id AND uom.user_id = (SELECT auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;

  SELECT o.object_type INTO v_type FROM object o WHERE o.id = p_object_id;
  SELECT ool.org_object_id INTO v_org
  FROM object_org_link ool
  JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
  WHERE ool.object_id = p_object_id
  ORDER BY ool.is_primary DESC NULLS LAST, ool.org_object_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'floor_modules', to_jsonb(api.actor_portal_floor_modules()),
    'masked_modules', COALESCE((
      SELECT jsonb_agg(v.module_id ORDER BY v.module_id)
      FROM org_actor_module_visibility v
      WHERE v.org_object_id = v_org AND v.object_type = v_type
        AND v.is_visible = FALSE), '[]'::jsonb));
END;
$$;

-- 4.5 Écriture de la matrice : rang admin ≥ 30 sur l'ORG (même seuil que
-- rpc_set_role_permission). Refuse le plancher dur — même pour le RE-rendre visible :
-- une ligne « legal visible » en base serait un mensonge, la fonction l'ignorerait.
CREATE OR REPLACE FUNCTION api.rpc_set_actor_section_visibility(
  p_org_object_id text, p_object_type text, p_module_id text, p_visible boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  IF p_module_id = ANY (api.actor_portal_floor_modules()) THEN
    RAISE EXCEPTION 'Le module % appartient au plancher non paramétrable', p_module_id
      USING ERRCODE = '22023';
  END IF;
  IF NOT (api.is_platform_superuser() OR EXISTS (
    SELECT 1 FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active
    JOIN ref_org_admin_role rar ON rar.id = uar.role_id AND rar.rank >= 30
    WHERE uom.user_id = (SELECT auth.uid())
      AND uom.org_object_id = p_org_object_id AND uom.is_active
  )) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs d''organisation (rang >= 30)'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO org_actor_module_visibility (org_object_id, object_type, module_id, is_visible, updated_by)
  VALUES (p_org_object_id, p_object_type, p_module_id, p_visible, (SELECT auth.uid()))
  ON CONFLICT (org_object_id, object_type, module_id)
  DO UPDATE SET is_visible = EXCLUDED.is_visible, updated_by = EXCLUDED.updated_by, updated_at = now();

  RETURN jsonb_build_object('org_object_id', p_org_object_id, 'object_type', p_object_type,
                            'module_id', p_module_id, 'is_visible', p_visible);
END;
$$;

REVOKE ALL ON FUNCTION api.actor_portal_floor_modules()                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_object_verifier_ids(text)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_actor_section_visibility(text, text)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_portal_section_visibility(text)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.rpc_set_actor_section_visibility(text, text, text, boolean)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.actor_portal_floor_modules()                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_object_verifier_ids(text)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_actor_section_visibility(text, text)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_portal_section_visibility(text)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_set_actor_section_visibility(text, text, text, boolean) TO authenticated, service_role;
```

- [ ] **Step 3 : Re-valider en transaction annulée (MCP)** — blocs A-H verts.

- [ ] **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): vérificateurs + matrice de visibilité par module (18a §4)"
```

---

### Task 5 : Migration — `api.submit_actor_fiche` (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (section 5)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (bloc D2)

**Interfaces :**
- Consumes: Tasks 1-4 ; `api.notify_task_assignees` (16z, service_role-only — l'appel DEFINER→DEFINER passe : les grants s'évaluent contre le propriétaire de la fonction appelante) ; whitelist §120.
- Produces: `api.submit_actor_fiche(p_object_id text, p_changes jsonb, p_note text DEFAULT NULL) → jsonb {submission_id, task_id, change_count, assignee_count}`. `p_changes` = tableau d'enveloppes contributeur `[{target_table, target_pk, action, payload, metadata:{rpc, section, manual_apply, field, before, after}}]` — EXACTEMENT la forme produite par `buildContributorSubmission` (le front la réutilise verbatim, Task 14).

- [ ] **Step 1 : Ajouter le bloc D2 au test, lancer ROUGE**

DECLARE additionnels :

```sql
  v_sub jsonb;
  v_changes jsonb;
  v_task uuid;
  v_subid uuid;
```

Après le bloc H :

```sql
  -- ---------- (D2) submit_actor_fiche ----------
  v_changes := jsonb_build_array(
    jsonb_build_object(
      'target_table', 'object_description', 'target_pk', NULL, 'action', 'update',
      'payload', jsonb_build_object('chapo', 'Nouveau chapo'),
      'metadata', jsonb_build_object('rpc', NULL, 'section', 'contacts', 'manual_apply', true,
                                     'field', 'Contacts', 'before', 'a', 'after', 'b')),
    jsonb_build_object(
      'target_table', 'opening_period', 'target_pk', NULL, 'action', 'update',
      'payload', jsonb_build_object('periods', '[]'::jsonb),
      'metadata', jsonb_build_object('rpc', 'save_object_openings', 'section', 'openings',
                                     'manual_apply', false, 'field', 'Horaires', 'before', 'x', 'after', 'y')));

  -- Refus : non-acteur.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, v_changes, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un non-acteur';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- Refus : hors portée.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objD, v_changes, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse une fiche hors portée';
  -- Refus : module du plancher dur.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object_legal','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc',NULL,'section','legal','manual_apply',true,
                                     'field','Juridique','before','','after',''))), NULL);
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un module du plancher dur';
  -- Refus : module masqué par la matrice (descriptions masqué au bloc H).
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object_description','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc',NULL,'section','descriptions','manual_apply',true,
                                     'field','Descriptions','before','','after',''))), NULL);
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un module masqué par la matrice';
  -- Refus : writer hors whitelist §120.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc','rpc_delete_object','section','contacts','manual_apply',false,
                                     'field','x','before','','after',''))), NULL);
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un writer hors whitelist (anti-escalade dès l''entrée)';

  -- Nominal.
  v_sub := api.submit_actor_fiche(v_objA, v_changes, 'Tarifs de saison mis à jour');
  v_subid := (v_sub->>'submission_id')::uuid;
  v_task  := (v_sub->>'task_id')::uuid;
  ASSERT (v_sub->>'change_count')::int = 2, 'D2: 2 changements enregistrés';
  ASSERT (v_sub->>'assignee_count')::int >= 2, 'D2: editor + granted assignés (>= 2)';
  RESET ROLE;
  -- État en base (owner, RLS bypass).
  ASSERT (SELECT status FROM fiche_submission WHERE id = v_subid) = 'pending',
         'D2: la soumission est pending';
  ASSERT (SELECT note FROM fiche_submission WHERE id = v_subid) = 'Tarifs de saison mis à jour',
         'D2: la note de l''acteur est portée';
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subid AND status='pending') = 2,
         'D2: les pending_change portent submission_id';
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = TRUE,
         'D2: le trigger is_editing a tourné';
  ASSERT (SELECT count(*) FROM crm_task WHERE id = v_task) = 1, 'D2: la tâche existe';
  ASSERT (SELECT title FROM crm_task WHERE id = v_task) LIKE 'Vérifier la fiche%',
         'D2: titre de tâche auto-porteur';
  ASSERT (SELECT (extra->>'kind') FROM crm_task WHERE id = v_task) = 'fiche_verification',
         'D2: la tâche est typée via extra.kind';
  ASSERT (SELECT (extra->>'submission_id')::uuid FROM crm_task WHERE id = v_task) = v_subid,
         'D2: la tâche pointe la soumission';
  ASSERT EXISTS (SELECT 1 FROM crm_task_assignee WHERE task_id = v_task AND user_id = v_editor),
         'D2: l''éditeur est assigné';
  ASSERT EXISTS (SELECT 1 FROM app_notification WHERE task_id = v_task AND recipient_id = v_editor
                   AND kind = 'crm_task_assigned'),
         'D2: la notification crm_task_assigned est créée (rail e-mail existant)';
  -- Anti-spam : une soumission ouverte ⇒ refus de la suivante.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, v_changes, NULL);
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'D2: une vérification déjà en cours refuse une nouvelle soumission';
  RESET ROLE;
```

Validation MCP : rouge (`submit_actor_fiche` absente).

- [ ] **Step 2 : Ajouter la section 5 à la migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. submit_actor_fiche — LE geste « Soumettre pour vérification » (D2/D3/D6).
--    Transactionnel : soumission + N pending_change + tâche multi-assignée +
--    notifications. La tâche est insérée DIRECTEMENT (précédent : trigger incident) —
--    api.save_crm_task est inutilisable par un acteur et ses gates ne doivent pas
--    s'élargir. L'appel api.notify_task_assignees passe en DEFINER→DEFINER (les
--    EXECUTE se vérifient contre le propriétaire, pas l'appelant).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.submit_actor_fiche(
  p_object_id text,
  p_changes   jsonb,
  p_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_masked    text[];
  v_floor     text[] := api.actor_portal_floor_modules();
  -- Même whitelist que approve_pending_change (§120) : un nom de writer interdit ne doit
  -- même pas ENTRER en base.
  v_allowed   text[] := ARRAY[
    'save_object_commercial','save_object_workspace_sustainability','save_object_workspace_tags',
    'save_object_itinerary_nested','save_object_openings','save_object_places',
    'save_object_rooms','save_object_relations'];
  v_change    jsonb;
  v_section   text;
  v_rpc       text;
  v_action    text;
  v_count     int := 0;
  v_sub_id    uuid;
  v_task_id   uuid;
  v_name      text;
  v_sections  text[] := ARRAY[]::text[];
  v_assignees uuid[];
BEGIN
  IF v_uid IS NULL OR NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  IF p_object_id IS NULL OR p_object_id NOT IN (SELECT api.current_user_portal_object_ids()) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) = 0 OR jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'p_changes doit être un tableau de 1 à 40 changements' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fiche_submission fs
              WHERE fs.object_id = p_object_id AND fs.status = 'pending') THEN
    -- PT409 (PostgREST ⇒ HTTP 409, SQLSTATE exposé dans error.code) et PAS 23505 : le front
    -- traduit 23505 en « Cette valeur existe déjà (doublon). » (db-error-message.ts) et
    -- mapDatabaseError applique le SQLSTATE AVANT le message — le prestataire lirait « doublon ».
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END IF;

  v_actor := api.current_user_actor_id();
  v_masked := ARRAY(SELECT jsonb_array_elements_text(
    api.get_portal_section_visibility(p_object_id)->'masked_modules'));

  -- Validation de CHAQUE enveloppe avant la moindre écriture.
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_section := v_change->'metadata'->>'section';
    v_rpc     := v_change->'metadata'->>'rpc';
    v_action  := v_change->>'action';
    IF v_section IS NULL OR btrim(v_section) = '' THEN
      RAISE EXCEPTION 'metadata.section requis sur chaque changement' USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_floor) THEN
      RAISE EXCEPTION 'La section « % » n''est pas ouverte aux acteurs', v_section USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_masked) THEN
      RAISE EXCEPTION 'La section « % » est masquée par votre organisation', v_section USING ERRCODE = '22023';
    END IF;
    IF v_rpc IS NOT NULL AND NOT (v_rpc = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Writer non autorisé: %', v_rpc USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_action, '') NOT IN ('insert','update','delete') THEN
      RAISE EXCEPTION 'action invalide: %', v_action USING ERRCODE = '22023';
    END IF;
    IF v_change->'payload' IS NULL OR (v_change->>'target_table') IS NULL
       OR btrim(v_change->>'target_table') = '' THEN
      RAISE EXCEPTION 'payload et target_table requis' USING ERRCODE = '22023';
    END IF;
    v_sections := array_append(v_sections, v_change->'metadata'->>'field');
  END LOOP;

  -- La soumission.
  INSERT INTO fiche_submission (object_id, actor_id, submitted_by, note)
  VALUES (p_object_id, v_actor, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_sub_id;

  -- Les changements (mêmes colonnes que submit_pending_change + submission_id ;
  -- le trigger after-insert flippe object.is_editing).
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                                submitted_by, status, metadata, submission_id)
    VALUES (p_object_id, v_change->>'target_table', v_change->>'target_pk',
            v_change->>'action', v_change->'payload', v_uid, 'pending',
            v_change->'metadata', v_sub_id);
    v_count := v_count + 1;
  END LOOP;

  -- La tâche de vérification, typée par extra (crm_task n'a pas de colonne kind).
  SELECT o.name INTO v_name FROM object o WHERE o.id = p_object_id;
  v_task_id := gen_random_uuid();
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, created_by, extra)
  VALUES (v_task_id, p_object_id, v_actor,
          'Vérifier la fiche « ' || COALESCE(v_name, p_object_id) || ' »',
          COALESCE('Message du prestataire : ' || NULLIF(btrim(COALESCE(p_note, '')), '') || E'\n', '')
            || 'Sections modifiées : ' || array_to_string(v_sections, ', '),
          'todo', 'medium', v_uid,
          jsonb_build_object('kind', 'fiche_verification', 'submission_id', v_sub_id));
  UPDATE fiche_submission SET task_id = v_task_id WHERE id = v_sub_id;

  -- Assignation multi (D3) + notifications (kind crm_task_assigned réutilisé — l'outbox
  -- e-mail existante part sans aucun nouveau rail).
  v_assignees := ARRAY(SELECT api.list_object_verifier_ids(p_object_id));
  IF COALESCE(array_length(v_assignees, 1), 0) > 0 THEN
    INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
    SELECT v_task_id, u.u, v_uid FROM unnest(v_assignees) AS u(u)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    -- owner de compat = plus petit uuid (même règle que save_crm_task).
    UPDATE crm_task SET owner = (SELECT min(u.u) FROM unnest(v_assignees) u(u)) WHERE id = v_task_id;
    PERFORM api.notify_task_assignees(v_task_id, v_assignees, v_uid);
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id, 'task_id', v_task_id,
    'change_count', v_count,
    'assignee_count', COALESCE(array_length(v_assignees, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION api.submit_actor_fiche(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.submit_actor_fiche(text, jsonb, text) TO authenticated, service_role;
COMMENT ON FUNCTION api.submit_actor_fiche(text, jsonb, text) IS
  '18a — « Soumettre pour vérification » du portail : soumission + N pending_change + tâche multi-assignée + notifications, en UNE transaction.';
```

- [ ] **Step 3 : Re-valider (MCP, transaction annulée)** — blocs A-H + D2 verts.

- [ ] **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): submit_actor_fiche transactionnel (18a §5)"
```

---

### Task 6 : Migration — lectures côté acteur (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (section 6)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (bloc G)

**Interfaces :**
- Produces:
  - `api.list_my_portal_fiches() → jsonb` — `[{id, name, object_type, status, updated_at, open_submission:{id, submitted_at}|null, last_resolved:{status, resolved_at}|null, office_email, office_phone}]`, persona acteur uniquement, portée portail. `office_email` / `office_phone` (révision 2026-09-02, D11) = premiers canaux PUBLICS de l'ORG publisher (primaire d'abord ; `phone` avant `mobile`), NULL sinon — ils alimentent les DEUX replis du portail : « envoyez vos photos à l'office » et « signaler une erreur » quand c'est la seule saisie (un `mailto:` échoue en silence sur un téléphone sans application de courrier).
  - `api.list_my_submissions(p_limit int DEFAULT 20, p_object_id text DEFAULT NULL) → jsonb` — auto-scopé `submitted_by = auth.uid()` (jamais de paramètre destinataire) : `[{id, object_id, object_name, note, status, submitted_at, resolved_at, changes:[{id, section, field, status, review_note, reviewer_label}]}]`. `section` (révision 2026-09-02) = `metadata->>'section'`, le module id — la clé STABLE qui ancre l'état d'une rubrique côté portail (`field` est un libellé, il peut changer).
  - `api.get_my_actor_profile() → jsonb` — `{id, display_name, photo_url, channels:[{kind, value, is_primary}]}` du SEUL `current_user_actor_id()` (la policy SELECT d'actor_channel est inerte pour authenticated — c'est LE chemin de lecture). Lecture seule v1.

- [ ] **Step 1 : Ajouter le bloc G au test, lancer ROUGE**

```sql
  -- ---------- (G) lectures acteur + invariants PII ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    -- list_my_portal_fiches : la fiche liée y est, avec la soumission ouverte du bloc D2.
    ASSERT EXISTS (
      SELECT 1 FROM jsonb_array_elements(api.list_my_portal_fiches()) f
      WHERE f->>'id' = v_objA AND (f->'open_submission'->>'id')::uuid = v_subid),
      'G: list_my_portal_fiches émet la fiche et sa soumission ouverte';
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(api.list_my_portal_fiches()) f WHERE f->>'id' = v_objD),
      'G: list_my_portal_fiches ne fuit pas hors portée';
    -- list_my_submissions : la soumission du bloc D2, avec ses 2 changements.
    ASSERT (SELECT jsonb_array_length((SELECT jsonb_agg(s) FROM jsonb_array_elements(api.list_my_submissions(20)) s
             WHERE (s->>'id')::uuid = v_subid))) = 1,
      'G: list_my_submissions rend ma soumission';
    ASSERT (SELECT jsonb_array_length(s->'changes') FROM jsonb_array_elements(api.list_my_submissions(20)) s
             WHERE (s->>'id')::uuid = v_subid) = 2,
      'G: la soumission liste ses 2 changements';
    -- get_my_actor_profile : mon acteur, PAS l'homonyme d'e-mail.
    ASSERT (api.get_my_actor_profile()->>'id')::uuid = v_actor1,
      'G: get_my_actor_profile rend l''acteur du lien explicite';
    -- Invariants PII (spec §6) : la persona acteur ne passe AUCUN gate interne.
    ASSERT COALESCE(api.current_user_can_edit_objects(), FALSE) = FALSE,
      'G: current_user_can_edit_objects FALSE pour un acteur';
    ASSERT api.can_read_actor_contacts(v_objA) = FALSE,
      'G: can_read_actor_contacts FALSE pour un acteur (aucune 5e formulation PII)';
    v_denied := false;
    BEGIN PERFORM api.search_actors('mar');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'G: search_actors refuse un acteur (42501)';
  RESET ROLE;
  -- Un non-acteur ne lit rien via les RPCs « my » (périmètre vide, pas d'erreur).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.list_my_portal_fiches();
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'G: list_my_portal_fiches refuse un non-acteur';
  RESET ROLE;
```

- [ ] **Step 2 : Ajouter la section 6 à la migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Lectures côté acteur. Auto-scopées : jamais de paramètre « pour qui » —
--    le destinataire est TOUJOURS auth.uid() (doctrine notifications).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.list_my_portal_fiches()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  IF NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'object_type', o.object_type,
      'status', o.status, 'updated_at', o.updated_at,
      'open_submission', (
        SELECT jsonb_build_object('id', fs.id, 'submitted_at', fs.submitted_at)
        FROM fiche_submission fs
        WHERE fs.object_id = o.id AND fs.status = 'pending'
        ORDER BY fs.submitted_at DESC LIMIT 1),
      'last_resolved', (
        SELECT jsonb_build_object('status', fs.status, 'resolved_at', fs.resolved_at)
        FROM fiche_submission fs
        WHERE fs.object_id = o.id AND fs.status <> 'pending'
        ORDER BY fs.resolved_at DESC NULLS LAST LIMIT 1),
      -- D11 : les coordonnées PUBLIQUES de l'office publisher, pour les deux replis du
      -- portail (« envoyez vos photos » et « signaler une erreur » quand c'est la seule
      -- saisie). Canaux is_public uniquement (jamais un canal interne), primaire d'abord.
      -- Un `mailto:` échoue en silence sur un téléphone sans application de courrier :
      -- le téléphone n'est pas décoratif, il est le second chemin.
      'office_email', (
        SELECT cc.value
        FROM object_org_link ool
        JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
        JOIN contact_channel cc ON cc.object_id = ool.org_object_id
        JOIN ref_code_contact_kind ck ON ck.id = cc.kind_id AND ck.code = 'email'
        WHERE ool.object_id = o.id AND COALESCE(cc.is_public, TRUE) AND cc.value <> ''
        ORDER BY ool.is_primary DESC NULLS LAST, cc.is_primary DESC NULLS LAST, cc.position NULLS LAST
        LIMIT 1),
      'office_phone', (
        SELECT cc.value
        FROM object_org_link ool
        JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
        JOIN contact_channel cc ON cc.object_id = ool.org_object_id
        JOIN ref_code_contact_kind ck ON ck.id = cc.kind_id AND ck.code IN ('phone', 'mobile')
        WHERE ool.object_id = o.id AND COALESCE(cc.is_public, TRUE) AND cc.value <> ''
        -- Même ordre que l'e-mail, puis 'phone' avant 'mobile' (un fixe d'office est le
        -- numéro affiché ; le mobile n'est qu'un repli).
        ORDER BY ool.is_primary DESC NULLS LAST, cc.is_primary DESC NULLS LAST,
                 (ck.code = 'phone') DESC, cc.position NULLS LAST
        LIMIT 1)
    ) ORDER BY o.name)
    FROM object o
    WHERE o.id IN (SELECT api.current_user_portal_object_ids())
  ), '[]'::jsonb);
END;
$$;

-- p_object_id (révision 2026-09-02) : SANS filtre, un acteur multi-fiches peut voir la
-- soumission ouverte de CETTE fiche sortir de la page (plafond 100, toutes fiches) ⇒
-- rubriques « en vérification » muettes sans erreur. Le portail passe toujours l'id.
CREATE OR REPLACE FUNCTION api.list_my_submissions(p_limit int DEFAULT 20, p_object_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  IF NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(sub ORDER BY sub->>'submitted_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', fs.id, 'object_id', fs.object_id, 'object_name', o.name,
        'note', fs.note, 'status', fs.status,
        'submitted_at', fs.submitted_at, 'resolved_at', fs.resolved_at,
        'changes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', pc.id,
            -- Le module id (clé stable, ancre l'état de la rubrique côté portail) ET le
            -- libellé lisible (D12 : field est la projection en clair de l'enveloppe).
            'section', pc.metadata->>'section',
            'field', pc.metadata->>'field',
            'status', pc.status,
            'review_note', pc.review_note,
            -- Libellé joint à la lecture, jamais stocké (RGPD).
            'reviewer_label', CASE WHEN pc.reviewed_by IS NULL THEN NULL
              ELSE COALESCE(rp.display_name, 'Utilisateur ' || left(pc.reviewed_by::text, 8)) END
          ) ORDER BY pc.submitted_at, pc.id)
          FROM pending_change pc
          LEFT JOIN app_user_profile rp ON rp.id = pc.reviewed_by
          WHERE pc.submission_id = fs.id), '[]'::jsonb)
      ) AS sub
      FROM fiche_submission fs
      LEFT JOIN object o ON o.id = fs.object_id
      WHERE fs.submitted_by = (SELECT auth.uid())
        AND (p_object_id IS NULL OR fs.object_id = p_object_id)
      ORDER BY fs.submitted_at DESC
      LIMIT v_limit
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION api.get_my_actor_profile()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := api.current_user_actor_id();
BEGIN
  IF NOT api.is_actor_persona() OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  -- Scopé STRICTEMENT à current_user_actor_id() : ce RPC n'ajoute PAS une 5e formulation
  -- au périmètre PII de can_read_actor_contacts (invariant spec §6) — il ne lit qu'UN
  -- acteur, LE MIEN, jamais un paramètre.
  RETURN (
    SELECT jsonb_build_object(
      'id', a.id, 'display_name', a.display_name, 'photo_url', a.photo_url,
      'channels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', ck.code, 'value', ac.value, 'is_primary', ac.is_primary)
          ORDER BY ck.code, ac.position NULLS LAST)
        FROM actor_channel ac
        JOIN ref_code_contact_kind ck ON ck.id = ac.kind_id
        WHERE ac.actor_id = a.id), '[]'::jsonb))
    FROM actor a WHERE a.id = v_actor);
END;
$$;

REVOKE ALL ON FUNCTION api.list_my_portal_fiches()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_my_submissions(int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_my_actor_profile()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_portal_fiches()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_my_submissions(int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_my_actor_profile()    TO authenticated, service_role;
```

- [ ] **Step 3 : Re-valider (MCP)** — tous blocs verts. **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): lectures portail acteur — fiches, soumissions, profil (18a §6)"
```

---

### Task 7 : Migration — D9, validation totale ou partielle (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (section 7)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (bloc F2)

**Interfaces :**
- Consumes: soumission du bloc D2 (v_subid : 1 changement manual_apply `contacts` + 1 auto `openings`).
- Produces:
  - `api.approve_pending_change(p_id uuid, p_review_note text DEFAULT NULL, p_applied_manually boolean DEFAULT FALSE)` — NOUVELLE signature (DROP de l'ancienne à 2 params). rpc whitelisté → re-dispatch inchangé ; rpc NULL → exige `p_applied_manually=TRUE` (attestation), ligne passe `approved` (pas `applied`), AUCUN re-dispatch. Ferme le trou « manual_apply jamais approuvable ».
  - `api.approve_fiche_submission(p_submission_id uuid, p_review_note text DEFAULT NULL, p_include_manual boolean DEFAULT FALSE) → jsonb {applied_count, approved_manual_count, skipped_manual_count, submission_status}` — tout-ou-rien.
  - `api.reject_fiche_submission(p_submission_id uuid, p_review_note text) → jsonb` — note obligatoire, ne touche que les `pending`.
  - `api.list_pending_changes` — DROP + CREATE (le type de retour change) : colonnes ajoutées `submission_id uuid`, `submission_note text`, `actor_label text`, `manual_apply boolean`.

**⚠ Pièges signalés au développeur :**
1. `CREATE OR REPLACE` ne peut PAS changer un type de retour ni ajouter un paramètre : il faut `DROP FUNCTION api.approve_pending_change(uuid, text);` et `DROP FUNCTION api.list_pending_changes(text, text, int, int);` AVANT les CREATE, puis re-poser les REVOKE/GRANT (un DROP les efface).
2. L'ancien appel front `approve_pending_change(p_id, p_review_note)` continue de résoudre sur la nouvelle signature (paramètre DEFAULT) — aucune rupture de compat.
3. La résolution de soumission (statut agrégé, tâche done, notification) est le travail du TRIGGER (Task 8) — les fonctions D9 ne font QUE traiter les pending_change ; ne pas dupliquer la logique ici.

- [ ] **Step 1 : Ajouter le bloc F2 au test, lancer ROUGE**

DECLARE additionnels : `v_pc_manual uuid; v_pc_auto uuid; v_res2 jsonb;`

```sql
  -- ---------- (F2) D9 : unitaire attesté + groupé ----------
  SELECT id INTO v_pc_manual FROM pending_change
   WHERE submission_id = v_subid AND (metadata->>'manual_apply')::boolean = true;
  SELECT id INTO v_pc_auto FROM pending_change
   WHERE submission_id = v_subid AND metadata->>'rpc' = 'save_object_openings';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Sans attestation, un manual_apply reste refusé (comportement §120 préservé).
    v_denied := false;
    BEGIN PERFORM api.approve_pending_change(v_pc_manual, NULL);
    EXCEPTION WHEN others THEN v_denied := true; END;
    ASSERT v_denied, 'F2: approve sans attestation refuse un manual_apply';
    -- Avec attestation : approved, aucun re-dispatch.
    v_res2 := api.approve_pending_change(v_pc_manual, 'Reporté à la main', TRUE);
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_manual) = 'approved',
         'F2: manual_apply atteste ⇒ approved (pas applied)';
  ASSERT (SELECT applied_at FROM pending_change WHERE id = v_pc_manual) IS NULL,
         'F2: pas d''applied_at sur une approbation attestée';
  -- list_pending_changes émet les colonnes de soumission.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (
      SELECT 1 FROM api.list_pending_changes('pending', v_objA, 50, 0) lp
      WHERE lp.submission_id = v_subid AND lp.manual_apply = FALSE
        AND lp.submission_note = 'Tarifs de saison mis à jour'),
      'F2: list_pending_changes émet submission_id/note/manual_apply';
    -- Rejet groupé : ne touche que les pending restants (l''attesté reste approved).
    v_res2 := api.reject_fiche_submission(v_subid, 'Le reste est à revoir');
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_auto) = 'rejected',
         'F2: reject_fiche_submission rejette les pending restants';
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_manual) = 'approved',
         'F2: reject groupé ne touche PAS les lignes déjà traitées';
  -- (Le statut agrégé « partial » et la tâche done sont prouvés au bloc F, Task 8.)

  -- approve_fiche_submission : nouvelle soumission dédiée (auto seul), approbation groupée.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_sub := api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','opening_period','target_pk',NULL,'action','update',
      'payload', jsonb_build_object('periods', '[]'::jsonb),
      'metadata', jsonb_build_object('rpc','save_object_openings','section','openings',
                                     'manual_apply',false,'field','Horaires','before','x','after','z'))), NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_res2 := api.approve_fiche_submission((v_sub->>'submission_id')::uuid, 'OK', FALSE);
    ASSERT (v_res2->>'applied_count')::int = 1, 'F2: approbation groupée applique l''auto-dispatch';
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change
           WHERE submission_id = (v_sub->>'submission_id')::uuid) = 'applied',
         'F2: le changement auto est applied après le groupé';
```

Note : `v_editor` doit pouvoir passer la garde du writer re-dispatché (`save_object_openings` exige l'écriture canonique) — ajouter à la fixture du bloc E le grant individuel `edit_canonical_when_publisher` à `v_editor` (même motif que test_moderation_rpcs) :

```sql
  -- (dans la fixture équipe, après v_perm_validate)
  INSERT INTO user_permission (user_id, permission_id, is_active)
  SELECT v_editor, id, TRUE FROM ref_permission WHERE code = 'edit_canonical_when_publisher'
  ON CONFLICT (user_id, permission_id) DO UPDATE SET is_active = TRUE;
```

- [ ] **Step 2 : Ajouter la section 7 à la migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 7. D9 — valider TOUT ou PARTIE.
-- 7.1 approve_pending_change gagne l'attestation manuelle. DROP requis : on ajoute un
--     paramètre (OR REPLACE ne sait pas). Corps = celui de §120 + la branche attestée.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS api.approve_pending_change(uuid, text);
CREATE FUNCTION api.approve_pending_change(
  p_id                uuid,
  p_review_note       text    DEFAULT NULL,
  p_applied_manually  boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_row pending_change%ROWTYPE;
  v_rpc text;
  v_allowed text[] := ARRAY[
    'save_object_commercial',
    'save_object_workspace_sustainability',
    'save_object_workspace_tags',
    'save_object_itinerary_nested',
    'save_object_openings',
    'save_object_places',
    'save_object_rooms',
    'save_object_relations'
  ];
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable: %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà résolue (statut=%)', v_row.status USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_moderate_object(v_row.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  v_rpc := v_row.metadata->>'rpc';

  IF v_rpc IS NULL THEN
    -- 18a/D9 : un changement manual_apply devient APPROUVABLE — à condition que le
    -- modérateur ATTESTE l'avoir reporté à la main dans l'éditeur. Avant : rpc NULL ⇒
    -- refus inconditionnel ⇒ la ligne restait « pending » à vie et bloquait la
    -- résolution de toute soumission (~22/29 modules concernés).
    IF NOT COALESCE(p_applied_manually, FALSE) THEN
      RAISE EXCEPTION 'RPC de re-dispatch absent ou non autorisé: (null)' USING ERRCODE = '22023';
    END IF;
    UPDATE pending_change
       SET status      = 'approved',   -- approved ≠ applied : attesté humain, pas machine
           reviewed_by = auth.uid(),
           reviewed_at = v_now,
           review_note = p_review_note,
           updated_at  = v_now
     WHERE id = p_id;
    RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'approved', 'reviewed_at', v_now);
  END IF;

  IF NOT (v_rpc = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'RPC de re-dispatch absent ou non autorisé: %', v_rpc USING ERRCODE = '22023';
  END IF;

  -- Re-dispatch vers le writer structuré (signature uniforme (p_object_id, p_payload)).
  -- %I quote l'identifiant ; le nom est en outre whitelisté ci-dessus. AS THE CALLER.
  EXECUTE format('SELECT api.%I($1, $2)', v_rpc) USING v_row.object_id, v_row.payload;

  UPDATE pending_change
     SET status      = 'applied',
         reviewed_by = auth.uid(),
         reviewed_at = v_now,
         applied_at  = v_now,
         review_note = p_review_note,
         updated_at  = v_now
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'applied', 'applied_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION api.approve_pending_change(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.approve_pending_change(uuid, text, boolean) TO authenticated, service_role;
COMMENT ON FUNCTION api.approve_pending_change(uuid, text, boolean) IS
  'P2.1 §120 + 18a/D9 — approuve : re-dispatch whitelisté, OU approbation ATTESTÉE (p_applied_manually) d''un manual_apply.';

-- 7.2 Approbation / rejet d'une SOUMISSION entière. Tout-ou-rien : un writer qui échoue
--     annule tout (l'exception remonte, la transaction du RPC est atomique).
CREATE OR REPLACE FUNCTION api.approve_fiche_submission(
  p_submission_id  uuid,
  p_review_note    text    DEFAULT NULL,
  p_include_manual boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_sub fiche_submission%ROWTYPE;
  v_pc  RECORD;
  v_applied int := 0;
  v_manual  int := 0;
  v_skipped int := 0;
BEGIN
  SELECT * INTO v_sub FROM fiche_submission WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable: %', p_submission_id USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT api.user_can_moderate_object(v_sub.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  FOR v_pc IN
    SELECT id, (metadata->>'rpc') AS rpc FROM pending_change
    WHERE submission_id = p_submission_id AND status = 'pending'
    ORDER BY submitted_at, id
  LOOP
    IF v_pc.rpc IS NULL AND NOT COALESCE(p_include_manual, FALSE) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;  -- reste pending : le modérateur le traitera unitairement
    END IF;
    PERFORM api.approve_pending_change(v_pc.id, p_review_note, v_pc.rpc IS NULL);
    IF v_pc.rpc IS NULL THEN v_manual := v_manual + 1; ELSE v_applied := v_applied + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_count', v_applied, 'approved_manual_count', v_manual,
    'skipped_manual_count', v_skipped,
    'submission_status', (SELECT status FROM fiche_submission WHERE id = p_submission_id));
END;
$$;

CREATE OR REPLACE FUNCTION api.reject_fiche_submission(
  p_submission_id uuid,
  p_review_note   text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_sub fiche_submission%ROWTYPE;
  v_pc  RECORD;
  v_n   int := 0;
BEGIN
  IF p_review_note IS NULL OR btrim(p_review_note) = '' THEN
    RAISE EXCEPTION 'Un motif de refus est obligatoire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_sub FROM fiche_submission WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable: %', p_submission_id USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT api.user_can_moderate_object(v_sub.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;
  FOR v_pc IN
    SELECT id FROM pending_change
    WHERE submission_id = p_submission_id AND status = 'pending'
    ORDER BY submitted_at, id
  LOOP
    PERFORM api.reject_pending_change(v_pc.id, p_review_note);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('rejected_count', v_n,
    'submission_status', (SELECT status FROM fiche_submission WHERE id = p_submission_id));
END;
$$;

REVOKE ALL ON FUNCTION api.approve_fiche_submission(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.reject_fiche_submission(uuid, text)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.approve_fiche_submission(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.reject_fiche_submission(uuid, text)           TO authenticated, service_role;

-- 7.3 list_pending_changes émet les colonnes de soumission (vue groupée). DROP requis :
--     le type de retour change. Corps = §120 + 4 colonnes + 2 jointures.
DROP FUNCTION IF EXISTS api.list_pending_changes(text, text, int, int);
CREATE FUNCTION api.list_pending_changes(
  p_status    text DEFAULT 'pending',
  p_object_id text DEFAULT NULL,
  p_limit     int  DEFAULT 50,
  p_offset    int  DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  object_id      text,
  object_name    text,
  target_table   text,
  target_pk      text,
  action         text,
  status         text,
  field_label    text,
  before_value   text,
  after_value    text,
  submitted_by   uuid,
  submitter_label text,
  submitted_at   timestamptz,
  reviewed_by    uuid,
  reviewer_label text,
  reviewed_at    timestamptz,
  review_note    text,
  applied_at     timestamptz,
  submission_id  uuid,
  submission_note text,
  actor_label    text,
  manual_apply   boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_is_super boolean := api.is_platform_superuser();
  v_scope    text[]  := ARRAY(SELECT api.current_user_crm_object_ids());
  v_can_validate boolean := api.user_has_permission('validate_changes');
  v_limit    int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset   int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  SELECT
    pc.id, pc.object_id, o.name, pc.target_table, pc.target_pk, pc.action, pc.status,
    pc.metadata->>'field'  AS field_label,
    pc.metadata->>'before' AS before_value,
    pc.metadata->>'after'  AS after_value,
    pc.submitted_by,
    COALESCE(sp.display_name, 'Utilisateur ' || left(pc.submitted_by::text, 8)) AS submitter_label,
    pc.submitted_at,
    pc.reviewed_by,
    CASE WHEN pc.reviewed_by IS NULL THEN NULL
         ELSE COALESCE(rp.display_name, 'Utilisateur ' || left(pc.reviewed_by::text, 8)) END AS reviewer_label,
    pc.reviewed_at, pc.review_note, pc.applied_at,
    -- 18a/D9 : le groupage par soumission + le libellé acteur (joint à la lecture, RGPD).
    pc.submission_id,
    fs.note AS submission_note,
    a.display_name AS actor_label,
    COALESCE((pc.metadata->>'manual_apply')::boolean, pc.metadata->>'rpc' IS NULL) AS manual_apply
  FROM pending_change pc
  LEFT JOIN object o            ON o.id = pc.object_id
  LEFT JOIN app_user_profile sp ON sp.id = pc.submitted_by
  LEFT JOIN app_user_profile rp ON rp.id = pc.reviewed_by
  LEFT JOIN fiche_submission fs ON fs.id = pc.submission_id
  LEFT JOIN actor a             ON a.id = fs.actor_id
  WHERE (p_status IS NULL OR pc.status = p_status)
    AND (p_object_id IS NULL OR pc.object_id = p_object_id)
    AND (
      v_is_super
      OR (v_can_validate AND pc.object_id IS NOT NULL AND pc.object_id = ANY(v_scope))
    )
  ORDER BY pc.submitted_at DESC, pc.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;
REVOKE ALL ON FUNCTION api.list_pending_changes(text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_pending_changes(text, text, int, int) TO authenticated, service_role;
```

- [ ] **Step 3 : Re-valider (MCP)** — note : au bloc F2, les statuts agrégés de `fiche_submission` restent `pending` tant que la Task 8 (trigger) n'est pas écrite — c'est ATTENDU, le bloc F2 ne les teste pas. **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): D9 — validation totale ou partielle + attestation manual_apply (18a §7)"
```

---

### Task 8 : Migration — résolution, notification acteur, outbox, RGPD, régression (SQL)

**Files :**
- Modify: `Base de donnée DLL et API/migration_actor_portal.sql` (section 8 + NOTIFY final)
- Modify: `Base de donnée DLL et API/tests/test_actor_portal.sql` (blocs F + I)

**Interfaces :**
- Produces:
  - Trigger `trg_fiche_submission_resolve` (AFTER UPDATE OF status ON pending_change) → `internal.resolve_fiche_submission(uuid)` : quand plus aucun `pending` dans la soumission → statut agrégé (`approved` si tout `applied`/`approved`, `rejected` si tout `rejected`, sinon `partial`), `resolved_at`, tâche liée → `done` (sauf `canceled`), notification `fiche_submission_reviewed` à `submitted_by` (payload `{submission_id, outcome}` — AUCUN nom, RGPD).
  - `api.claim_unmailed_notifications` re-déployée : kind IN (les 2), émet `kind` + pour la nouvelle espèce `outcome` + `submission_note` (= review_note agrégée non — juste outcome + object) ; `api.mark_notifications_emailed` re-déployée (kind IN les 2).
  - `api.list_crm_tasks` re-déployée : émet la clé `extra` (jsonb brut) — le front en tire `extra.kind === 'fiche_verification'` (chip Task 19). **⚠ ORDRE** : cette redéfinition doit rester APRÈS 17m dans tout manifeste (17m est la version canonique actuelle ; copier le corps live vérifié au Step 0 et ajouter UNIQUEMENT `'extra', ct.extra` dans le jsonb_build_object).
  - `api.rpc_gdpr_erase_subject` re-déployée : la branche `actor` délie le compte portail (`app_user_profile.actor_id → NULL`) et reporte l'id du compte auth à supprimer via l'API Admin (même doctrine que la branche `user`). Copier le corps live vérifié, ajouter le bloc dans les DEUX modes (anonymize + delete).

- [ ] **Step 1 : Ajouter les blocs F et I au test, lancer ROUGE**

```sql
  -- ---------- (F) résolution + notification acteur ----------
  -- La soumission v_subid a fini au bloc F2 avec 1 approved + 1 rejected ⇒ partial.
  ASSERT (SELECT status FROM fiche_submission WHERE id = v_subid) = 'partial',
         'F: mélange approved+rejected ⇒ statut partial';
  ASSERT (SELECT resolved_at FROM fiche_submission WHERE id = v_subid) IS NOT NULL,
         'F: resolved_at posé';
  ASSERT (SELECT status FROM crm_task WHERE id = v_task) = 'done',
         'F: la tâche de vérification passe done à la résolution';
  ASSERT EXISTS (SELECT 1 FROM app_notification
                  WHERE recipient_id = v_user AND kind = 'fiche_submission_reviewed'
                    AND (payload->>'submission_id')::uuid = v_subid
                    AND payload->>'outcome' = 'partial'),
         'F: l''acteur reçoit la notification de résolution (payload sans nom)';
  -- La 2e soumission (approuvée en groupé au F2) est approved.
  ASSERT (SELECT status FROM fiche_submission WHERE id = (v_sub->>'submission_id')::uuid) = 'approved',
         'F: tout applied ⇒ approved';
  -- is_editing retombe (plus aucun pending sur v_objA).
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = FALSE,
         'F: is_editing retombe à FALSE une fois tout résolu';
  -- L'outbox voit la nouvelle espèce (kind émis par le claim).
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(api.claim_unmailed_notifications(50)) n
    WHERE n->>'kind' = 'fiche_submission_reviewed'
      AND (n->>'submission_id')::uuid = v_subid),
    'F: claim_unmailed_notifications émet la notification acteur avec kind + submission_id';

  -- ---------- (I) régression : personas historiques inchangées ----------
  -- Le témoin tourism_agent garde EXACTEMENT ses 5 bras (spot-check sur 1b : son e-mail
  -- matche v_actor1 qui tient un rôle sur v_orgA ⇒ il voit les fiches de l'ORG).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objD),
           'I: bras 1b intact pour un non-acteur (fiches de l''ORG via rôle acteur)';
    ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objB),
           'I: pas de filtre valid_to pour un non-acteur (bras 1a historique)';
  RESET ROLE;
```

- [ ] **Step 2 : Ajouter la section 8 à la migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Résolution des soumissions + retour à l'acteur + outbox + RGPD.
-- ─────────────────────────────────────────────────────────────────────────────

-- 8.1 Résolution : appelée par TRIGGER sur pending_change — elle tourne donc quel que
-- soit le chemin de traitement (unitaire, groupé, correctif service_role).
CREATE SCHEMA IF NOT EXISTS internal;
CREATE OR REPLACE FUNCTION internal.resolve_fiche_submission(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, internal, auth, pg_temp
AS $$
DECLARE
  v_sub fiche_submission%ROWTYPE;
  v_pending  int;
  v_applied  int;
  v_rejected int;
  v_status   text;
BEGIN
  SELECT * INTO v_sub FROM fiche_submission WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_sub.status <> 'pending' THEN RETURN; END IF;

  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status IN ('applied', 'approved')),
         count(*) FILTER (WHERE status = 'rejected')
    INTO v_pending, v_applied, v_rejected
  FROM pending_change WHERE submission_id = p_submission_id;

  IF v_pending > 0 THEN RETURN; END IF;

  v_status := CASE
    WHEN v_rejected = 0 THEN 'approved'
    WHEN v_applied  = 0 THEN 'rejected'
    ELSE 'partial' END;

  UPDATE fiche_submission
     SET status = v_status, resolved_at = now()
   WHERE id = p_submission_id;

  -- La tâche de vérification est close (sauf annulée à la main entre-temps).
  IF v_sub.task_id IS NOT NULL THEN
    UPDATE crm_task SET status = 'done', updated_at = now()
     WHERE id = v_sub.task_id AND status <> 'canceled';
  END IF;

  -- Retour à l'acteur. Payload SANS nom de personne (effacement RGPD : libellés joints
  -- à la lecture). submitted_by NULL (compte révoqué) ⇒ pas de notification.
  IF v_sub.submitted_by IS NOT NULL THEN
    INSERT INTO app_notification (recipient_id, kind, task_id, created_by, payload)
    VALUES (v_sub.submitted_by, 'fiche_submission_reviewed', v_sub.task_id, NULL,
            jsonb_build_object('submission_id', p_submission_id, 'outcome', v_status,
                               'object_id', v_sub.object_id));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fiche_submission_after_review()
RETURNS trigger
SET search_path = pg_catalog, public, api, internal, auth
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.submission_id IS NOT NULL AND NEW.status <> 'pending' THEN
    PERFORM internal.resolve_fiche_submission(NEW.submission_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_fiche_submission_resolve ON public.pending_change;
CREATE TRIGGER trg_fiche_submission_resolve
  AFTER UPDATE OF status ON public.pending_change
  FOR EACH ROW EXECUTE FUNCTION public.fiche_submission_after_review();
REVOKE ALL ON FUNCTION internal.resolve_fiche_submission(uuid) FROM PUBLIC, anon, authenticated;
```

Puis, dans la MÊME section, les 3 re-déploiements « copie du corps live + delta minimal » (méthode identique pour chacun) :

- **8.2 `api.claim_unmailed_notifications`** : partir du corps extrait de `migration_crm_task_email_documents.sql` (L112-174). Deltas EXACTS : (a) `WHERE n.kind = 'crm_task_assigned'` devient `WHERE n.kind IN ('crm_task_assigned','fiche_submission_reviewed')` ; (b) dans le `jsonb_build_object` du claim, ajouter `'kind', n2.kind` (il faut ajouter `n.kind` au RETURNING du CTE `claimed`), `'outcome', (n2.payload->>'outcome')`, `'submission_id', (n2.payload->>'submission_id')` ; (c) la jointure `crm_task`/`object` sert les DEUX kinds (task_id est posé sur les deux). (d) le bras « no_recipient_email » est inchangé.
- **8.3 `api.mark_notifications_emailed`** : deltas : les deux `AND kind = 'crm_task_assigned'` deviennent `AND kind IN ('crm_task_assigned','fiche_submission_reviewed')`.
- **8.4 `api.list_crm_tasks`** : partir du corps LIVE (17m, vérifié md5 au Task 0), ajouter `'extra', ct.extra,` dans le jsonb de sortie. Rien d'autre.
- **8.5 `api.rpc_gdpr_erase_subject`** : partir du corps LIVE, et dans la branche `p_subject_kind = 'actor'` (les DEUX modes), insérer AVANT le `PERFORM audit.redact_subject('actor', …)` :

```sql
    -- 18a — délier le compte portail : l'accès tombe immédiatement (la portée passe par
    -- actor_id). Le compte auth lui-même se supprime via l'API Admin (même doctrine que
    -- la branche 'user') — l'id est reporté pour l'opérateur RGPD.
    UPDATE app_user_profile SET actor_id = NULL WHERE actor_id = v_actor
    RETURNING id INTO v_portal_user;
    IF v_portal_user IS NOT NULL THEN
      v_report := v_report || jsonb_build_object('portal_user_id', v_portal_user,
        'portal_note', 'Compte portail délié. Supprimer auth.users via l''API Admin (action Révoquer de la fiche CRM).');
    END IF;
```

avec `v_portal_user UUID;` ajouté aux DECLARE.

Enfin, tout en bas du fichier (après COMMIT) :

```sql
-- PostgREST doit recharger le schéma (fonctions api.* nouvelles/modifiées).
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3 : Re-valider (MCP)** — TOUS les blocs A→I verts, NOTICE finale, ROLLBACK. Vérifier ensuite qu'aucun résidu ne persiste (`SELECT count(*) FROM fiche_submission;` → 0).

- [ ] **Step 4 : Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_portal.sql" "Base de donnée DLL et API/tests/test_actor_portal.sql"
git commit -m "feat(sql): résolution des soumissions + outbox + RGPD (18a §8)"
```

---

### Task 9 : Packaging + déploiement de la migration

**Files :**
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (nouvelle section `## 18a` + entrée manifeste)
- Modify: `Base de donnée DLL et API/README.md` (entrée dans l'ordre de déploiement)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (\echo + \ir migration + test)
- Modify: `.github/workflows/sql-fresh-apply.yml` (step psql du test — même gabarit que les steps existants)

- [ ] **Step 1 : Vérifier le créneau et les prérequis du manifeste**

```bash
grep -n "^## 1[78]" docs/SQL_ROLLOUT_RUNBOOK.md | tail -5
grep -n "role_permission_matrix\|crm_write_requires_permission" "Base de donnée DLL et API/ci_fresh_apply.sql"
```

Deux cas :
- Si `migration_role_permission_matrix.sql` (17i) est ABSENTE de `ci_fresh_apply.sql` (état constaté le 2026-09-01) : **STOP partiel** — notre migration dépend d'`org_role_permission`. Ajouter d'abord les 4 fichiers §227 (`migration_role_permission_matrix.sql`, `migration_crm_write_requires_permission.sql`, `migration_list_write_creator_only.sql`, `migration_list_create_superuser_only.sql`) à `ci_fresh_apply.sql` juste avant notre entrée, avec leurs `\echo` 17i→17l, et le signaler dans le message de commit (dette de packaging du chantier §227, constatée ici). ⚠ La garde pré-vol de 17i (`org_permission` doit être vide) passe sur une base neuve (0 ligne).
- Si un chantier concurrent occupe 18a : prendre le créneau suivant et renommer partout (fichier de migration inclus — l'en-tête l'annonce).

- [ ] **Step 2 : ci_fresh_apply.sql — ajouter à la fin (avant le bloc MV refresh)**

```sql
\echo '== 18a    migration_actor_portal.sql  (portail acteur : persona actor, portee dediee, D7, fiche_submission + tache de verification multi-assignee, D9 validation totale/partielle, outbox elargie ; NOTIFY pgrst requis, fait par le fichier) =='
\ir migration_actor_portal.sql

\echo '== 18a-test portail acteur, prouve ROUGE avant application (blocs A-I) =='
\ir tests/test_actor_portal.sql
```

- [ ] **Step 3 : Workflow CI — ajouter le step de test** (même gabarit que « Read-gate set-based test ») :

```yaml
      - name: Actor portal test (persona, portee, D7, submit, D9, resolution)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_actor_portal.sql"
```

- [ ] **Step 4 : Runbook — section `## 18a`** (gabarit 17l : titre, fichier, quoi/pourquoi en 5-10 lignes, tableau de sabotage rempli APRÈS application, sous-section Front) + entrée dans le manifeste ordonné (après 17m) : `18a. \`migration_actor_portal.sql\` — **Portail acteur (spec docs/superpowers/specs/2026-09-01-portail-acteur-design.md)** (APRÈS 17i — org_role_permission — et APRÈS 17m — list_crm_tasks est redéployée ici avec la clé extra ; idempotente ; NOTIFY pgrst fait par le fichier).` README : ajouter la ligne `\i migration_actor_portal.sql` en fin d'ordre avec le même commentaire court.

- [ ] **Step 5 : DÉPLOIEMENT LIVE**

Via `mcp__supabase__apply_migration` avec `name: 'actor_portal'` et le contenu INTÉGRAL de `migration_actor_portal.sql`. Puis :
1. Rejouer le TEST complet en transaction annulée (`execute_sql`, BEGIN…ROLLBACK) contre la base désormais migrée : tous blocs verts.
2. Re-relever les md5 du Task 0 Step 3 : seules les fonctions listées ont changé.
3. Sabotage minimal documenté au runbook : un `tourism_agent` réel inchangé (spot-check `current_user_extended_object_ids` sur un compte connu), `SELECT count(*) FROM app_user_profile WHERE role='actor'` → 0 (la migration est inerte tant qu'aucun compte acteur n'existe).

- [ ] **Step 6 : Commit**

```bash
git add "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "Base de donnée DLL et API/README.md" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "docs(sql): manifeste + runbook + CI pour 18a portail acteur — APPLIQUÉE LIVE"
```

---

### Task 10 : Front — persona `actor` : types, bootstrap, routage

**Files :**
- Modify: `bertel-tourism-ui/src/types/domain.ts:1`
- Modify: `bertel-tourism-ui/src/hooks/useBootstrapSession.ts` (normalizeRole + court-circuit des sondes + messages `setGuest` sans « Google », Step 2 bis)
- Modify: `bertel-tourism-ui/src/lib/auth-routing.ts`
- Modify: `bertel-tourism-ui/src/app/(main)/layout.tsx`
- Modify: `bertel-tourism-ui/src/utils/user-role-label.ts` (`actor` → « Prestataire » ; `Record<UserRole, string>` strict casse la compilation sinon)
- Modify (Step 2 bis) : `bertel-tourism-ui/src/views/SetPasswordPage.tsx`, `bertel-tourism-ui/src/views/LoginPage.tsx`, et leurs wrappers `bertel-tourism-ui/src/app/set-password/page.tsx` + `bertel-tourism-ui/src/app/login/page.tsx` (boundary `<Suspense>` exigé par `useSearchParams`)
- Test: `bertel-tourism-ui/src/lib/auth-routing.test.ts`, `bertel-tourism-ui/src/views/SetPasswordPage.test.tsx`, `bertel-tourism-ui/src/views/LoginPage.test.tsx` (créer ceux qui n'existent pas — vérifier avec `ls`)

**Interfaces :**
- Produces: `UserRole` = `'super_admin' | 'tourism_agent' | 'owner' | 'actor'` ; `getDefaultAppPath('actor') === '/espace'` ; `getPostLoginPath('actor', from)` n'accepte un `from` que préfixé `/espace` ; le layout `(main)` renvoie tout acteur vers `/espace`. Tasks 11-14 en dépendent.

- [ ] **Step 1 : Écrire le test de routage, lancer ROUGE**

`src/lib/auth-routing.test.ts` :

```ts
import { getDefaultAppPath, getPostLoginPath } from './auth-routing';

describe('auth-routing — persona actor (portail)', () => {
  it("envoie l'acteur vers /espace par défaut", () => {
    expect(getDefaultAppPath('actor')).toBe('/espace');
  });
  it("n'accepte un ?from= acteur QUE sous /espace (allowlist portail)", () => {
    expect(getPostLoginPath('actor', '/espace/fiches/HOT123')).toBe('/espace/fiches/HOT123');
    // Un from back-office ne doit jamais faire atterrir un acteur hors portail.
    expect(getPostLoginPath('actor', '/crm')).toBe('/espace');
    expect(getPostLoginPath('actor', '//evil.example')).toBe('/espace');
  });
  it('ne change rien pour les personas historiques', () => {
    expect(getDefaultAppPath('owner')).toBe('/dashboard');
    expect(getDefaultAppPath('tourism_agent')).toBe('/explorer');
    expect(getPostLoginPath('tourism_agent', '/crm')).toBe('/crm');
  });
});
```

```bash
cd bertel-tourism-ui && npm run test:run -- src/lib/auth-routing.test.ts
```

Attendu : FAIL — `'actor'` n'est pas assignable à `UserRole` (erreur TS) ou `/explorer` ≠ `/espace`.

- [ ] **Step 2 : Implémenter**

`src/types/domain.ts:1` :

```ts
export type UserRole = 'super_admin' | 'tourism_agent' | 'owner' | 'actor';
```

`src/lib/auth-routing.ts` — remplacer `getDefaultAppPath` et `getPostLoginPath` :

```ts
export function getDefaultAppPath(role: UserRole | null): string {
  // Persona acteur (18a) : le portail est TOUT son périmètre.
  if (role === 'actor') return '/espace';
  return role === 'owner' ? '/dashboard' : '/explorer';
}

export function getPostLoginPath(role: UserRole | null, from: string | null | undefined): string {
  if (role === 'actor') {
    // Allowlist portail : un ?from= back-office (ou hostile) ne fait jamais sortir un
    // acteur du portail — le double gate des layouts le rattraperait, mais l'URL de
    // destination ne doit même pas être tentée.
    return isSafeInternalPath(from) && from.startsWith('/espace') ? from : '/espace';
  }
  return isSafeInternalPath(from) ? from : getDefaultAppPath(role);
}
```

`src/hooks/useBootstrapSession.ts` — 2 modifications :

(a) `normalizeRole` :

```ts
function normalizeRole(value: unknown): UserRole | null {
  return value === 'super_admin' || value === 'tourism_agent' || value === 'owner' || value === 'actor'
    ? value
    : null;
}
```

(b) juste APRÈS le bloc `if (!role) { … }`, court-circuiter les 5 sondes back-office pour la persona acteur (elles rendraient toutes false/null au prix de 5 allers-retours) :

```ts
      // Persona acteur (18a) : aucune des sondes back-office ne s'applique — on hydrate
      // directement avec les valeurs neutres au lieu de payer 5 RPCs qui rendraient
      // false/null. Le portail fait ses propres lectures (list_my_portal_fiches…).
      if (role === 'actor') {
        hydrateFromAuth({
          role,
          userId: user.id,
          email: String(user.email ?? ''),
          userName,
          avatar: initialsFromName(userName),
          avatarUrl: typeof profile?.avatar_url === 'string' && profile.avatar_url.length > 0 ? profile.avatar_url : null,
          langPrefs,
          canEditObjects: false,
          canCreateObjects: false,
          orgId: null,
          orgName: null,
          adminRank: null,
          adminRoleCode: null,
        });
        return;
      }
```

(placer ce bloc après le calcul de `userName`/`langPrefs`, avant `const canEditObjects = await fetchCanEditObjects();`).

`src/app/(main)/layout.tsx` — remplacer le corps par :

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { AppShell } from '@/components/layout/AppShell';
import { getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (status === 'guest') {
      router.replace(getLoginPath(pathname));
      return;
    }
    // 18a — un acteur n'entre JAMAIS dans le back-office : renvoi systématique vers son
    // portail (ergonomie ; la vraie barrière reste RLS/RPC côté DB).
    if (status === 'ready' && role === 'actor') {
      router.replace('/espace');
    }
  }, [status, role, router, pathname]);

  if (status === 'guest') {
    return null; // redirecting
  }
  if (status === 'ready' && role === 'actor') {
    return null; // redirecting vers /espace
  }
  if (status !== 'ready') {
    return <SessionScreen />;
  }
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 2 bis (révision 2026-09-02) : premier contact en mots de prestataire**

Le premier écran qu'un prestataire voit est `/set-password` (lien d'invitation), puis `/login` — deux pages partagées avec le personnel dont la copie est staff (« Bienvenue dans l’équipe », « Enregistrer et accéder à la plateforme », bouton Google qui, pour un compte invité sans profil pré-existant, finit sur un `SessionScreen` brické). Signal = query `?espace=1` (posé par la route d'invitation acteur, Task 15) ; lecture via `useSearchParams` sous un `<Suspense>` dans les wrappers `app/set-password/page.tsx` et `app/login/page.tsx` (vérifier qu'ils n'en ont pas déjà un).

- `SetPasswordPage` : si `espace=1` → h2 « Bienvenue », p « Choisissez un mot de passe pour accéder à votre fiche. », bouton « C’est parti », lien mort « Ce lien ne fonctionne plus. Demandez à votre office de tourisme de vous renvoyer une invitation. » ; sinon copie inchangée.
- `LoginPage` : si `espace=1` OU `from` préfixé `/espace` → sous-titre « Connectez-vous pour mettre à jour votre fiche. », **pas** de séparateur ni de bouton « Continuer avec Google » ; sinon inchangé.
- `useBootstrapSession` / `setGuest` : remplacer les deux messages « Reconnectez-vous avec Google » / « Connectez-vous avec Google pour acceder a la plateforme. » par « Vous êtes déconnecté. » / « Connectez-vous pour accéder à votre espace. » (ils s'affichent à TOUT le monde, pas seulement aux comptes Google).
- Test RTL : `SetPasswordPage` avec `?espace=1` rend « C’est parti » ; `LoginPage` avec `?espace=1` ne rend pas « Continuer avec Google ».

- [ ] **Step 3 : Vérifier**

```bash
cd bertel-tourism-ui && npm run test:run -- src/lib/auth-routing.test.ts src/views/SetPasswordPage.test.tsx src/views/LoginPage.test.tsx && npm run typecheck
```

Attendu : PASS + exit 0. Si le typecheck révèle des switch exhaustifs sur `UserRole` cassés ailleurs (ex. `user-role-label`), compléter le cas `actor` avec le libellé `'Prestataire'`.

- [ ] **Step 4 : Commit**

```bash
git add src/types/domain.ts src/lib/auth-routing.ts src/hooks/useBootstrapSession.ts "src/app/(main)/layout.tsx" src/utils/user-role-label.ts src/lib/auth-routing.test.ts
git commit -m "feat(front): persona actor — types, bootstrap, routage portail"
# Step 2 bis dans SON commit (copie de premier contact — surface différente) :
git add src/views/SetPasswordPage.tsx src/views/LoginPage.tsx src/app/set-password/page.tsx src/app/login/page.tsx src/views/SetPasswordPage.test.tsx src/views/LoginPage.test.tsx
git commit -m "feat(front): premier contact prestataire — copie invitation et connexion sans Google"
```

(Depuis `bertel-tourism-ui/` ; adapter les chemins `git add` si lancé depuis la racine.)

---

### Task 11 : Front — service portail

**Files :**
- Create: `bertel-tourism-ui/src/services/portal.ts`
- Test: `bertel-tourism-ui/src/services/portal.test.ts`

**Interfaces :**
- Consumes: RPCs Task 5-6 ; `SubmitPendingChangeInput` de `services/moderation.ts` (l'enveloppe contributeur).
- Produces (consommé par Tasks 12-14) :

```ts
export interface PortalFiche { id: string; name: string; objectType: string; status: string;
  updatedAt: string | null; openSubmission: { id: string; submittedAt: string } | null;
  lastResolved: { status: string; resolvedAt: string | null } | null;
  officeEmail: string | null; officePhone: string | null; }   // révision 2026-09-02 (D11) — replis photos + signalement
export interface MySubmissionChange { id: string; section: string | null; field: string; status: string;
  reviewNote: string | null; reviewerLabel: string | null; }   // section = module id (révision 2026-09-02)
export interface MySubmission { id: string; objectId: string; objectName: string;
  note: string | null; status: string; submittedAt: string; resolvedAt: string | null;
  changes: MySubmissionChange[]; }
export interface PortalVisibility { floorModules: string[]; maskedModules: string[]; }
export async function listMyPortalFiches(): Promise<PortalFiche[]>
export async function listMySubmissions(limit?: number, objectId?: string | null): Promise<MySubmission[]>
export async function getPortalSectionVisibility(objectId: string): Promise<PortalVisibility>
export async function submitActorFiche(objectId: string, changes: SubmitPendingChangeInput[], note: string | null):
  Promise<{ submissionId: string; taskId: string; changeCount: number; assigneeCount: number }>
```

- [ ] **Step 1 : Écrire le test, lancer ROUGE**

`src/services/portal.test.ts` (mêmes conventions que `moderation.test.ts` : mocker `getApiClient`) :

```ts
import { getApiClient } from '../lib/supabase';
import { listMyPortalFiches, listMySubmissions, submitActorFiche, getPortalSectionVisibility } from './portal';

jest.mock('../lib/supabase');
const mockRpc = jest.fn();
(getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc: mockRpc }) });

beforeEach(() => { mockRpc.mockReset(); });

describe('services/portal', () => {
  it('parse les fiches du portail (défensif : ligne malformée ignorée)', async () => {
    mockRpc.mockResolvedValue({ data: [
      { id: 'HOT1', name: 'Villa', object_type: 'HOT', status: 'published', updated_at: '2026-09-01',
        open_submission: { id: 's1', submitted_at: '2026-08-28' }, last_resolved: null,
        office_email: 'contact@oti.re', office_phone: '0262 00 00 00' },
      { pas_un_id: true },
    ], error: null });
    const fiches = await listMyPortalFiches();
    expect(fiches).toHaveLength(1);
    expect(fiches[0]).toMatchObject({ id: 'HOT1', openSubmission: { id: 's1' }, officeEmail: 'contact@oti.re', officePhone: '0262 00 00 00' });
  });

  it('rend null les coordonnées d’office absentes (cas de la prod au 2026-09-02)', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'HOT1', name: 'Villa', object_type: 'HOT', status: 'published' }], error: null });
    await expect(listMyPortalFiches()).resolves.toMatchObject([{ officeEmail: null, officePhone: null }]);
    expect(mockRpc).toHaveBeenCalledWith('list_my_portal_fiches', {});
  });

  it('soumet les enveloppes contributeur telles quelles', async () => {
    mockRpc.mockResolvedValue({ data: { submission_id: 's1', task_id: 't1', change_count: 1, assignee_count: 2 }, error: null });
    const res = await submitActorFiche('HOT1', [{ objectId: 'HOT1', targetTable: 'object_description',
      targetPk: null, action: 'update', payload: {}, metadata: { rpc: null, section: 'descriptions',
      manual_apply: true, field: 'Descriptions', before: 'a', after: 'b' } }], 'Bonjour');
    expect(res).toEqual({ submissionId: 's1', taskId: 't1', changeCount: 1, assigneeCount: 2 });
    expect(mockRpc).toHaveBeenCalledWith('submit_actor_fiche', {
      p_object_id: 'HOT1',
      p_changes: [{ target_table: 'object_description', target_pk: null, action: 'update',
        payload: {}, metadata: { rpc: null, section: 'descriptions', manual_apply: true,
        field: 'Descriptions', before: 'a', after: 'b' } }],
      p_note: 'Bonjour',
    });
  });

  it('borne les soumissions à la fiche ouverte (acteur multi-fiches)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await listMySubmissions(20, 'HOT1');
    expect(mockRpc).toHaveBeenCalledWith('list_my_submissions', { p_limit: 20, p_object_id: 'HOT1' });
  });

  it('normalise la visibilité', async () => {
    mockRpc.mockResolvedValue({ data: { floor_modules: ['legal'], masked_modules: ['descriptions'] }, error: null });
    await expect(getPortalSectionVisibility('HOT1')).resolves.toEqual({
      floorModules: ['legal'], maskedModules: ['descriptions'] });
  });
});
```

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/portal.test.ts
```

Attendu : FAIL (module absent).

- [ ] **Step 2 : Implémenter `src/services/portal.ts`**

```ts
// Service du portail acteur (18a) — toutes les lectures/écritures passent par les RPCs
// api.* DEFINER auto-scopés (le destinataire est TOUJOURS auth.uid(), jamais un
// paramètre). fiche_submission et org_actor_module_visibility sont RLS service_role
// only : ne jamais ajouter de client.from(...) ici.
//
// La soumission transporte les enveloppes contributeur EXACTES de
// buildContributorSubmission (P1.3) — le serveur revalide sections/plancher/whitelist.
import { getApiClient } from '../lib/supabase';
import { mapDatabaseError } from './api-error';
import type { SubmitPendingChangeInput } from './moderation';

type GenericRecord = Record<string, unknown>;

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function requireApiClient() {
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configuré.');
  }
  return client;
}

export interface PortalFiche {
  id: string;
  name: string;
  objectType: string;
  status: string;
  updatedAt: string | null;
  openSubmission: { id: string; submittedAt: string } | null;
  lastResolved: { status: string; resolvedAt: string | null } | null;
  /** Coordonnées PUBLIQUES de l'office publisher (D11 : replis « envoyez vos photos » et
   *  « signaler une erreur »), null si l'ORG n'en a pas — c'est le cas des 2 ORG de prod
   *  au 2026-09-02, d'où le prérequis de recette (Task 20 Step 0). */
  officeEmail: string | null;
  officePhone: string | null;
}

export async function listMyPortalFiches(): Promise<PortalFiche[]> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('list_my_portal_fiches', {});
  if (error) throw mapDatabaseError(error, 'Vos fiches sont indisponibles.');
  if (!Array.isArray(data)) return [];
  const fiches: PortalFiche[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const record = row as GenericRecord;
    const id = readNullableString(record.id);
    if (!id) continue; // parsing défensif : une ligne abîmée ne vide pas l'accueil
    const open = record.open_submission as GenericRecord | null;
    const resolved = record.last_resolved as GenericRecord | null;
    fiches.push({
      id,
      name: readString(record.name),
      objectType: readString(record.object_type),
      status: readString(record.status, 'draft'),
      updatedAt: readNullableString(record.updated_at),
      openSubmission: open && readNullableString(open.id)
        ? { id: readString(open.id), submittedAt: readString(open.submitted_at) }
        : null,
      lastResolved: resolved && readNullableString(resolved.status)
        ? { status: readString(resolved.status), resolvedAt: readNullableString(resolved.resolved_at) }
        : null,
      officeEmail: readNullableString(record.office_email),
      officePhone: readNullableString(record.office_phone),
    });
  }
  return fiches;
}

export interface MySubmissionChange {
  id: string;
  /** Module id (metadata.section) — la clé stable qui ancre l'état d'une rubrique. */
  section: string | null;
  field: string;
  status: string;
  reviewNote: string | null;
  reviewerLabel: string | null;
}
export interface MySubmission {
  id: string;
  objectId: string;
  objectName: string;
  note: string | null;
  status: string;
  submittedAt: string;
  resolvedAt: string | null;
  changes: MySubmissionChange[];
}

export async function listMySubmissions(limit = 20, objectId: string | null = null): Promise<MySubmission[]> {
  const client = requireApiClient();
  // objectId : la fiche ouverte passe TOUJOURS son id — sans filtre, un acteur multi-fiches
  // peut voir la soumission ouverte de cette fiche sortir de la page (rubriques muettes).
  const { data, error } = await client.schema('api').rpc('list_my_submissions', { p_limit: limit, p_object_id: objectId });
  if (error) throw mapDatabaseError(error, 'Vos soumissions sont indisponibles.');
  if (!Array.isArray(data)) return [];
  const submissions: MySubmission[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const record = row as GenericRecord;
    const id = readNullableString(record.id);
    if (!id) continue;
    const changes: MySubmissionChange[] = Array.isArray(record.changes)
      ? (record.changes as unknown[]).flatMap((c) => {
          if (!c || typeof c !== 'object') return [];
          const change = c as GenericRecord;
          const changeId = readNullableString(change.id);
          if (!changeId) return [];
          return [{
            id: changeId,
            section: readNullableString(change.section),
            field: readString(change.field),
            status: readString(change.status, 'pending'),
            reviewNote: readNullableString(change.review_note),
            reviewerLabel: readNullableString(change.reviewer_label),
          }];
        })
      : [];
    submissions.push({
      id,
      objectId: readString(record.object_id),
      objectName: readString(record.object_name),
      note: readNullableString(record.note),
      status: readString(record.status, 'pending'),
      submittedAt: readString(record.submitted_at),
      resolvedAt: readNullableString(record.resolved_at),
      changes,
    });
  }
  return submissions;
}

export interface PortalVisibility {
  floorModules: string[];
  maskedModules: string[];
}

export async function getPortalSectionVisibility(objectId: string): Promise<PortalVisibility> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('get_portal_section_visibility', {
    p_object_id: objectId,
  });
  if (error) throw mapDatabaseError(error, 'Visibilité des sections indisponible.');
  const record = (data ?? {}) as GenericRecord;
  const toList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return { floorModules: toList(record.floor_modules), maskedModules: toList(record.masked_modules) };
}

export interface SubmitActorFicheResult {
  submissionId: string;
  taskId: string;
  changeCount: number;
  assigneeCount: number;
}

export async function submitActorFiche(
  objectId: string,
  changes: SubmitPendingChangeInput[],
  note: string | null,
): Promise<SubmitActorFicheResult> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('submit_actor_fiche', {
    p_object_id: objectId,
    // L'enveloppe voyage en snake_case côté SQL — objectId est porté par p_object_id.
    p_changes: changes.map((change) => ({
      target_table: change.targetTable,
      target_pk: change.targetPk ?? null,
      action: change.action,
      payload: change.payload,
      metadata: change.metadata ?? null,
    })),
    p_note: note,
  });
  if (error) throw mapDatabaseError(error, 'Soumission impossible.');
  const record = (data ?? {}) as GenericRecord;
  const submissionId = readNullableString(record.submission_id);
  if (!submissionId) throw new Error('Réponse RPC sans submission_id');
  return {
    submissionId,
    taskId: readString(record.task_id),
    changeCount: typeof record.change_count === 'number' ? record.change_count : 0,
    assigneeCount: typeof record.assignee_count === 'number' ? record.assignee_count : 0,
  };
}
```

- [ ] **Step 3 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/portal.test.ts && npm run typecheck
git add src/services/portal.ts src/services/portal.test.ts
git commit -m "feat(front): service du portail acteur (fiches, soumissions, visibilité, submit)"
```

---

### Task 12 : Front — shell et accueil du portail `/espace`

> **Révision 2026-09-02 (UI simplifiée, D10).** Les Tasks 12 à 14 remplacent intégralement leur version du 2026-09-01. Le portail n'est PLUS une variante d'`ObjectEditPage` : c'est une interface dédiée, en une colonne, pensée pour des prestataires peu à l'aise avec l'informatique — une liste de **rubriques** par fiche, une rubrique = un petit formulaire, un seul geste d'envoi. Elle réutilise la **couche d'état** de l'éditeur (`useObjectEditorState`, `buildContributorSubmission`) et rien de sa présentation (les primitives de l'éditeur sont scopées `.object-editor` et taillées back-office 13 px). Vocabulaire portail : `docs/superpowers/specs/2026-09-01-portail-acteur-design.md` §4.5.

**Files :**
- Create: `bertel-tourism-ui/src/app/(portal)/layout.tsx` (composant SERVEUR : `metadata` + `viewport`)
- Create: `bertel-tourism-ui/src/components/portal/PortalGate.tsx` (la garde cliente)
- Create: `bertel-tourism-ui/src/app/(portal)/espace/page.tsx`
- Create: `bertel-tourism-ui/src/components/portal/PortalShell.tsx`
- Create: `bertel-tourism-ui/src/views/PortalHomePage.tsx`
- Modify: `bertel-tourism-ui/src/styles.css` (UN bloc `.portal-*`, ~80 lignes, motif de scoping `.help-app`)
- Test: `bertel-tourism-ui/src/views/PortalHomePage.test.tsx`

**Interfaces :**
- Consumes: `listMyPortalFiches` (Task 11 : émet désormais `officeEmail`), `useThemeStore` (brandName, logoUrl), `useSessionStore` (userName, status, role), `signOut()` de `services/auth.ts`.
- Produces: routes `/espace` ; `PortalShell` réutilisé par la fiche (Task 14) ; classes `.portal-*`.

**Règles d'interface (valables pour TOUT le portail, Tasks 12-14) :**
- Une colonne, `max-width: 640px`, padding 16 px ; jamais de rail, d'onglets, de table, de glisser-déposer.
- Cibles ≥ 48 px : sous `.portal-shell`, `.primary-button` / `.ghost-button` passent à `min-height: 48px; font-size: 1.05rem`, pleine largeur ≤ 640 px ; les `input/select/textarea` gardent la règle globale (≈ 48 px) avec `font-size: 1.05rem` (évite le zoom iOS). **Ne jamais modifier les règles globales** : tout est scopé `.portal-shell`.
- Cartes sur `--surface` + 1 px `--line` + `--shadow-s` + `var(--radius-md)` (jamais `--surface-2` : le branding par ORG ne le surcharge pas). Teinte translucide UNIQUEMENT en `rgb(var(--theme-primary-rgb) / α)` (garde `styles.guard.test.ts`).
- Cases et boutons radio = `<label class="portal-choice">` enveloppant un `<input>` natif (`accent-color: var(--teal)`), état coché via `:has(:checked)` (fond `rgb(var(--theme-primary-rgb) / 0.08)` + bordure `--teal` + icône lucide `Check`), `:focus-visible` explicite (l'anneau global `:where()` est masqué par le radius).
- Un état n'est JAMAIS porté par la couleur seule : chaque `.badge` = icône lucide `aria-hidden` + texte.
- Zéro jargon à l'écran (liste noire spec §4.5) ; l'institution s'appelle « l'office » / « votre office de tourisme » ; verbes d'abord sur les boutons ; vouvoiement.
- Pas de composant de l'éditeur (`Field`, `Input`, `.btn`, `.edit-top`, `.contributor-banner`, `Fs`…), pas de shadcn `Dialog`/`Sheet`, pas de `.text-input`/`.form-error` (n'existent pas). Erreur de champ = `<p class="field-error" role="alert" id=…>` sous le contrôle + `aria-invalid` + `aria-describedby`.
- `SkeletonBlock` n'a PAS de prop `lines` : chargement = `PageSkeleton variant="list"` (accueil) / `variant="form"` (fiche).

- [ ] **Step 1 : Test ROUGE**

`src/views/PortalHomePage.test.tsx` (conventions Sidebar.test : `useSessionStore.setState`, mock du service ; `next/navigation` mocké) :

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalHomePage } from './PortalHomePage';
import { useSessionStore } from '../store/session-store';
import * as portal from '../services/portal';

jest.mock('../services/portal');
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace }) }));
const mocked = portal as jest.Mocked<typeof portal>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PortalHomePage /></QueryClientProvider>);
}
const fiche = (over: Partial<portal.PortalFiche>): portal.PortalFiche => ({
  id: 'HOT1', name: 'Villa Vanille', objectType: 'HOT', status: 'published', updatedAt: null,
  openSubmission: null, lastResolved: null, officeEmail: 'contact@oti.re', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ status: 'ready', role: 'actor', userId: 'u1', userName: 'Marie Payet', demoMode: false } as never);
});

describe('PortalHomePage', () => {
  it('liste les fiches avec un état en mots (jamais la couleur seule)', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({ openSubmission: { id: 's1', submittedAt: '2026-08-28T00:00:00Z' } }),
      fiche({ id: 'ASC2', name: 'Kayak Sud', objectType: 'ASC', lastResolved: { status: 'rejected', resolvedAt: '2026-08-21T00:00:00Z' } }),
    ]);
    renderPage();
    expect(await screen.findByText('Villa Vanille')).toBeInTheDocument();
    expect(screen.getByText('Envoyé — en vérification')).toBeInTheDocument();
    expect(screen.getByText('À reprendre')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bonjour Marie');
  });
  it('ouvre directement la fiche quand il n’y en a qu’une', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([fiche({})]);
    renderPage();
    await screen.findByText(/Ouverture de votre fiche/);
    expect(replace).toHaveBeenCalledWith('/espace/fiches/HOT1');
  });
  it('état vide honnête, sans badge « Bientôt »', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Aucune fiche n’est encore reliée/)).toBeInTheDocument();
    expect(screen.queryByText('Bientôt')).not.toBeInTheDocument();
  });
});
```

```bash
cd bertel-tourism-ui && npm run test:run -- src/views/PortalHomePage.test.tsx
```

- [ ] **Step 2 : Implémenter les 4 fichiers + le bloc CSS**

`src/app/(portal)/layout.tsx` — composant SERVEUR (un layout client ne peut exporter ni `metadata` ni `viewport`) : le titre d'onglet du portail et `viewportFit: 'cover'`, sans lequel `env(safe-area-inset-bottom)` vaut 0 sur iPhone et la barre d'envoi se colle sous la barre système :

```tsx
import type { Metadata, Viewport } from 'next';
import { PortalGate } from '@/components/portal/PortalGate';

export const metadata: Metadata = { title: 'Espace prestataire' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate>{children}</PortalGate>;
}
```

`src/components/portal/PortalGate.tsx` — la garde cliente, gabarit du gate `(main)` avec `PortalShell` à la place d'`AppShell` :

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { PortalShell } from '@/components/portal/PortalShell';
import { getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export function PortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (status === 'guest') {
      router.replace(getLoginPath(pathname));
      return;
    }
    // Miroir du gate (main) : seul un acteur entre au portail. Un membre d'équipe qui
    // tape /espace retourne à son back-office (ergonomie ; RLS reste la barrière). Le
    // refus des personas owner/super_admin est aussi ce qui empêche les permissions de
    // basculer en direct-write dans les savers du back-office atteints par URL.
    if (status === 'ready' && role !== 'actor') {
      router.replace('/');
    }
  }, [status, role, router, pathname]);

  if (status === 'guest') return null;
  if (status === 'ready' && role !== 'actor') return null;
  if (status !== 'ready') return <SessionScreen />;
  return <PortalShell>{children}</PortalShell>;
}
```

`src/components/portal/PortalShell.tsx` :

```tsx
'use client';

// Chrome du portail acteur (18a, D10) — délibérément MINIMAL : barre haute collante
// (logo + nom de marque + « Espace prestataire », prénom, « Se déconnecter »), colonne
// unique, pied légal. AUCUNE nav back-office, aucune cloche (v1 = e-mail + badges),
// aucun ⌘K. La déconnexion passe par services/auth.signOut() : l'événement SIGNED_OUT
// remet la session en invité et le layout redirige — jamais de router.replace ici.
import { LogOut } from 'lucide-react';
import { signOut } from '../../services/auth';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { useToast } from '../../hooks/useToast';
import { clearAllPortalDrafts } from '../../features/portal/usePortalDraft';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const userName = useSessionStore((state) => state.userName);
  const userId = useSessionStore((state) => state.userId);
  const toast = useToast();

  async function handleSignOut() {
    try {
      // La purge des brouillons suit une déconnexion RÉUSSIE : en cas d'échec réseau,
      // le prestataire reste connecté et doit retrouver son travail non envoyé.
      await signOut();
      if (userId) clearAllPortalDrafts(userId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'La déconnexion a échoué. Réessayez.');
    }
  }

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#portal-main">Aller au contenu</a>
      <header className="portal-shell__bar">
        <div className="portal-shell__brand">
          {logoUrl ? <img src={logoUrl} alt="" width={32} height={32} /> : null}
          <span className="portal-shell__brand-text">
            <span className="portal-shell__brand-name">{brandName}</span>
            <span className="eyebrow">Espace prestataire</span>
          </span>
        </div>
        <div className="portal-shell__user">
          <span className="portal-shell__user-name">{userName}</span>
          <button type="button" className="ghost-button" onClick={() => void handleSignOut()}>
            <LogOut size={16} aria-hidden /> Se déconnecter
          </button>
        </div>
      </header>
      <main id="portal-main" className="portal-shell__main">{children}</main>
      <footer className="auth-legal">
        <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">Confidentialité</a>
        <span className="auth-legal__sep" aria-hidden="true">·</span>
        <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">Conditions d’utilisation</a>
      </footer>
    </div>
  );
}
```

`src/views/PortalHomePage.tsx` :

```tsx
'use client';

// Accueil du portail acteur (18a, D10) : une carte par fiche avec son état EN MOTS.
// Cas majoritaire (1 fiche) : on ouvre directement la fiche, l'accueil n'est vu qu'avec
// 2 fiches ou plus. Aucun chargement de workspace ici (~85 requêtes par fiche) : l'état
// vient de list_my_portal_fiches seul ; la complétude se lit dans la fiche.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronRight, Clock, Pencil } from 'lucide-react';
import { listMyPortalFiches, type PortalFiche } from '../services/portal';
import { EmptyState } from '../components/common/EmptyState';
import { PageSkeleton } from '../components/common/PageSkeleton';
import { TYPE_LABEL } from '../features/object-editor/archetypes';
import { useSessionStore } from '../store/session-store';
import { hasPortalDraft } from '../features/portal/usePortalDraft';

export function ficheBadge(fiche: PortalFiche, hasDraft: boolean): { label: string; className: string; Icon: typeof Check } {
  if (fiche.openSubmission) return { label: 'Envoyé — en vérification', className: 'badge--info', Icon: Clock };
  if (fiche.lastResolved && fiche.lastResolved.status !== 'approved') return { label: 'À reprendre', className: 'badge--danger', Icon: AlertTriangle };
  if (hasDraft) return { label: 'Modifications à envoyer', className: 'badge--warn', Icon: Pencil };
  return { label: 'À jour', className: 'badge--ok', Icon: Check };
}

function firstName(userName: string): string {
  const first = userName.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 && !first.includes('@') ? first : '';
}

export function PortalHomePage() {
  const router = useRouter();
  const userName = useSessionStore((state) => state.userName);
  const userId = useSessionStore((state) => state.userId);
  const fichesQuery = useQuery({ queryKey: ['portal-fiches'], queryFn: listMyPortalFiches });
  const fiches = fichesQuery.data ?? [];
  const single = fiches.length === 1 ? fiches[0] : null;

  useEffect(() => {
    if (single) router.replace(`/espace/fiches/${single.id}`);
  }, [single, router]);

  if (fichesQuery.isLoading) return <PageSkeleton variant="list" />;
  if (fichesQuery.isError) {
    return (
      <EmptyState mode="error" title="Nous n’avons pas pu charger vos fiches."
        description="Vérifiez votre connexion, puis réessayez."
        action={{ label: 'Réessayer', onClick: () => fichesQuery.refetch() }} />
    );
  }
  if (single) return <p className="muted">Ouverture de votre fiche…</p>;

  const prenom = firstName(userName);
  return (
    <section className="portal-home">
      <h1 className="portal-h1">{prenom ? `Bonjour ${prenom},` : 'Bonjour,'}</h1>
      <p className="portal-lead">Voici vos fiches. Ouvrez une fiche pour la compléter ou la mettre à jour.</p>
      {fiches.length === 0 ? (
        <EmptyState mode="no-data" title="Aucune fiche n’est encore reliée à votre compte"
          description="Votre office de tourisme relie vos fiches à votre compte. Contactez-le si vous pensez qu’il manque une fiche." />
      ) : (
        <ul className="portal-fiches">
          {fiches.map((fiche) => {
            const badge = ficheBadge(fiche, hasPortalDraft(userId, fiche.id));
            return (
              <li key={fiche.id}>
                <Link className="portal-card portal-fiche" href={`/espace/fiches/${fiche.id}`}>
                  <span className="portal-fiche__body">
                    <span className="portal-fiche__name">{fiche.name}</span>
                    <span className="muted">{TYPE_LABEL[fiche.objectType] ?? fiche.objectType}</span>
                  </span>
                  <span className={`badge ${badge.className}`}><badge.Icon size={14} aria-hidden /> {badge.label}</span>
                  <ChevronRight size={20} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

(`TYPE_LABEL` : vérifier son export et sa forme dans `archetypes.ts` ; sinon utiliser `getArchetypeMeta(type)?.label`.)

`src/app/(portal)/espace/page.tsx` :

```tsx
'use client';

import { Suspense } from 'react';
import { PortalHomePage } from '@/views/PortalHomePage';

export default function EspacePage() {
  return (
    <Suspense fallback={null}>
      <PortalHomePage />
    </Suspense>
  );
}
```

Bloc CSS à ajouter dans `src/styles.css` (à la fin, après le bloc `.help-*`) — squelette, à compléter dans la Task 14 pour les rubriques :

```css
/* ---- Portail acteur (18a, D10) — UNE colonne, grands contrôles, tokens maison.
   Tout est scopé .portal-shell : ne pas toucher aux règles globales. ---- */
.portal-shell { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.portal-shell__bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; min-height: 56px; padding: 8px 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
/* Marque = logo + un bloc DEUX LIGNES (nom au-dessus, « Espace prestataire » en eyebrow),
   comme la maquette ; le nom se tronque plutôt que de pousser le bouton hors écran. */
.portal-shell__brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.portal-shell__brand img { width: 32px; height: 32px; border-radius: 8px; flex: none; }
.portal-shell__brand-text { display: grid; min-width: 0; }
.portal-shell__brand-name { font-family: var(--font-display), sans-serif; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.portal-shell__brand-text .eyebrow { font-size: .62rem; line-height: 1.2; }
.portal-shell__user { display: flex; align-items: center; gap: 10px; }
.portal-shell__main { flex: 1; width: 100%; max-width: 640px; margin: 0 auto; padding: 20px 16px 120px; }
.portal-shell .primary-button, .portal-shell .ghost-button { min-height: 48px; font-size: 1.05rem; border-radius: var(--radius-sm); }
.portal-shell input, .portal-shell select, .portal-shell textarea { font-size: 1.05rem; }
/* Le kit maison est taillé back-office : .badge 12 px, label .8rem, hint .78rem — relevés ICI seulement. */
.portal-shell .badge, .portal-modal .badge { font-size: .9rem; padding: 5px 10px; }
.portal-shell .auth-field > label, .portal-modal .auth-field > label { font-size: 1rem; }
.portal-shell .auth-field__hint, .portal-modal .auth-field__hint { font-size: .95rem; }
/* `Modal` fait un createPortal vers document.body : ses descendants ne sont PAS sous
   .portal-shell. Le contrat de taille est donc dupliqué sous .portal-modal (className
   passée aux Modal/ConfirmDialog du portail) — sans quoi la fenêtre d'envoi garderait
   les dimensions back-office (~36 px, 13 px). */
.portal-modal .primary-button, .portal-modal .ghost-button { min-height: 48px; font-size: 1.05rem; border-radius: var(--radius-sm); }
.portal-modal input, .portal-modal select, .portal-modal textarea { font-size: 1.05rem; }
/* WCAG 2.4.11 : la barre d'envoi collante ne doit jamais couvrir un champ focalisé — le
   conteneur de défilement hors AppShell est <html>, pas <main>. */
html:has(.portal-shell) { scroll-padding-bottom: calc(140px + env(safe-area-inset-bottom)); }
.portal-h1 { font-family: var(--font-display), sans-serif; font-size: 1.5rem; font-weight: 700; margin: 0 0 6px; text-wrap: balance; }
.portal-lead { margin: 0 0 20px; color: var(--ink-2); font-size: 1.05rem; }
.portal-card { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-s); }
.portal-fiches { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.portal-fiche { display: flex; align-items: center; gap: 12px; padding: 16px; min-height: 72px; color: inherit; text-decoration: none; }
.portal-fiche__body { display: grid; gap: 2px; min-width: 0; flex: 1; }
.portal-fiche__name { font-size: 1.1rem; font-weight: 700; }
.portal-fiche:focus-visible, .portal-choice:focus-within, .portal-task__link:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
@media (max-width: 640px) {
  .portal-shell__user-name { display: none; }
  .portal-shell .primary-button, .portal-shell .ghost-button { width: 100%; }
}
```

- [ ] **Step 3 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/views/PortalHomePage.test.tsx src/styles.guard.test.ts && npm run typecheck
git add "src/app/(portal)" src/components/portal src/views/PortalHomePage.tsx src/views/PortalHomePage.test.tsx src/styles.css
git commit -m "feat(front): portail /espace — shell dédié + accueil des fiches en mots"
```

---

### Task 13 : Front — registre des rubriques + liaisons pures (le cœur de la fiche simplifiée)

**Files :**
- Create: `bertel-tourism-ui/src/features/portal/portal-rubrics.ts`
- Create: `bertel-tourism-ui/src/features/portal/portal-bindings.ts`
- Create: `bertel-tourism-ui/src/features/portal/portal-change-summary.ts`
- Create: `bertel-tourism-ui/src/features/portal/portal-visibility.ts`
- Test: `bertel-tourism-ui/src/features/portal/portal-rubrics.test.ts`, `portal-bindings.test.ts`, `portal-change-summary.test.ts`

**Interfaces :**
- Consumes: `ObjectWorkspaceModules` + types de tranche (`services/object-workspace-parser.ts`), `MODULE_KEY_MAP` (`editor-state.ts`), `ArchetypeCode` (`archetypes.ts`), helpers purs existants : `updateTranslatableField`/`readTranslatableField` (`sections/descriptions-field.ts`), `createContactDraft`/`reconcileContactPrimary` (`sections/contacts-edit.ts`), `OPENING_WEEKDAYS`/`createPeriodDraft`/`addClosedWeekday`/`validatePeriodDraft` (`sections/opening-period-edit.ts`), `createPricingDraft`/`validatePricingDraft` (`sections/pricing-row.ts`), `filterEstablishmentAmenityGroups`/`mergeEstablishmentAmenitySelection` (`services/object-workspace.ts`), `buildContributorSubmission` (`contributor-proposal.ts`).
- Produces (consommé par Task 14) :

```ts
// portal-visibility.ts
export function isModuleSubmittable(module: WorkspaceModuleId, masked: string[], floor: string[]): boolean

// portal-rubrics.ts
export type PortalRubricId = 'contacts' | 'presentation' | 'hours' | 'amenities' | 'welcome' | 'pricing' | 'activity';
export interface PortalRubric {
  id: PortalRubricId;
  module: WorkspaceModuleId;              // UNE rubrique = UN module = UNE enveloppe
  title: string;                          // libellé portail (jamais MODULE_LABEL, jargon)
  archetypes: ArchetypeCode[];            // où la rubrique s'applique
  isFilled(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): boolean;
  summary(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): string; // 1 ligne sous le titre
}
export const PORTAL_RUBRICS: readonly PortalRubric[];
export type RubricState = 'todo' | 'filled' | 'dirty' | 'pending' | 'rejected' | 'unavailable';
export function buildPortalRubrics(input: {
  archetype: ArchetypeCode; draft: ObjectWorkspaceModules; dirty: Partial<Record<WorkspaceModuleId, boolean>>;
  masked: string[]; floor: string[]; pendingModules: Set<WorkspaceModuleId>; rejectedModules: Set<WorkspaceModuleId>;
}): Array<PortalRubric & { state: RubricState; readOnlyReason: string | null }>
export const PORTAL_AMENITY_CODES: Record<ArchetypeCode, string[]>;   // ≤ 12 codes curés — À VALIDER PO
export const PORTAL_PRICE_UNIT: Partial<Record<ArchetypeCode, string>>; // HEB par_nuit, RES par_couvert, VIS/ASC par_personne — À VALIDER PO
export const PORTAL_HEADLINE_METRIC: Partial<Record<ArchetypeCode, 'max_capacity' | 'seats'>>;

// portal-bindings.ts — updaters PURS : chaque fonction rend une NOUVELLE tranche complète
export function setPresentation(d: ObjectWorkspaceDescriptionsModule, chapo: string, description: string): ObjectWorkspaceDescriptionsModule
export function upsertPublicContact(c: ObjectWorkspaceContactsModule, kind: 'phone' | 'mobile' | 'email' | 'website', value: string): ObjectWorkspaceContactsModule
export function readPublicContact(c: ObjectWorkspaceContactsModule, kind: 'phone' | 'mobile' | 'email' | 'website'): string
// clé = code OPENING_WEEKDAYS. fixedHours=false ⇒ « ouvert sans horaires fixes » : la
// tranche porte la sentinelle [{start:'',end:''}] (voir Step 3), JAMAIS slots vides —
// un jour ouvert sans créneau serait relu FERMÉ.
export type WeekHours = Record<string, { open: boolean; fixedHours: boolean; slots: { start: string; end: string }[] }>;
export function readWeekHours(o: ObjectWorkspaceOpeningsModule): { hours: WeekHours; readOnlyReason: string | null }
export function setWeekHours(o: ObjectWorkspaceOpeningsModule, hours: WeekHours): ObjectWorkspaceOpeningsModule
export function setAmenities(c: ObjectWorkspaceCharacteristicsModule, checked: string[], visibleOptionCodes: Set<string>): ObjectWorkspaceCharacteristicsModule
export function setPayments(c: ObjectWorkspaceCharacteristicsModule, codes: string[]): ObjectWorkspaceCharacteristicsModule
export function setHeadlineCapacity(cp: ObjectWorkspaceCapacityPoliciesModule, metricCode: 'max_capacity' | 'seats', value: string): ObjectWorkspaceCapacityPoliciesModule
export function setPetPolicy(cp: ObjectWorkspaceCapacityPoliciesModule, accepted: boolean | null, conditions: string): ObjectWorkspaceCapacityPoliciesModule
export function setStayPolicy(cp: ObjectWorkspaceCapacityPoliciesModule, patch: { checkInFrom?: string; checkOutUntil?: string; conditions?: string }): ObjectWorkspaceCapacityPoliciesModule
export function setStartingPrice(p: ObjectWorkspacePricingModule, input: { free: boolean; amount: string; amountMax: string; unitCode: string }): ObjectWorkspacePricingModule
export function setActivityBasics(a: ObjectWorkspaceActivityModule, patch: Partial<Pick<ObjectWorkspaceActivityModule, 'durationMin' | 'minParticipants' | 'maxParticipants' | 'minAge'>>): ObjectWorkspaceActivityModule

// portal-change-summary.ts — D12 : projection LISIBLE d'une modification (une ligne par champ)
export function describePortalChange(module: WorkspaceModuleId, baseline: ObjectWorkspaceModules, draft: ObjectWorkspaceModules): { field: string; before: string; after: string }
```

**Pourquoi des updaters purs, testés par SABOTAGE.** Tous les writers côté office sont « remplace tout » (delete-all + reinsert ou réconciliation par id, cf. §214) : une tranche reconstruite depuis ce que l'écran affiche EFFACE le reste à la validation. Chaque updater doit donc spreader la tranche courante et ne toucher que la ligne visée ; chaque test comporte une assertion « ce qui n'est pas affiché survit byte-à-byte » et est vérifié rouge en retirant le spread.

- [ ] **Step 1 : Tests ROUGES (les trois fichiers)**

`portal-bindings.test.ts` — un `describe` par updater ; gabarit pour les trois cas les plus piégeux :

```ts
import { setPresentation, upsertPublicContact, readWeekHours, setWeekHours, setAmenities, setPetPolicy } from './portal-bindings';
import type { ObjectWorkspaceContactsModule, ObjectWorkspaceOpeningsModule } from '../../services/object-workspace-parser';

describe('setPresentation', () => {
  const base = { localLanguage: 'fr', activeLanguage: 'fr', availableLanguages: ['fr', 'en'], places: [], orgOverlay: null,
    object: { recordId: 'r1', scope: 'object', placeId: null, label: '', visibility: 'public',
      chapo: { baseValue: 'Ancien', values: { fr: 'Ancien', en: 'Old' } },
      description: { baseValue: 'Texte', values: { fr: 'Texte' } },
      adaptedDescription: { baseValue: 'PMR', values: {} }, mobileDescription: { baseValue: '', values: {} }, editorialDescription: { baseValue: '', values: {} } } } as never;
  it('écrit baseValue ET values.fr (jamais baseValue seul : values.fr masquerait la saisie)', () => {
    const next = setPresentation(base, 'Nouveau', 'Texte');
    expect(next.object.chapo.baseValue).toBe('Nouveau');
    expect(next.object.chapo.values.fr).toBe('Nouveau');
    expect(next.object.chapo.values.en).toBe('Old');            // autre langue intacte
    expect(next.object.adaptedDescription).toEqual(base.object.adaptedDescription); // champ non affiché intact
    expect(next.orgOverlay).toBe(base.orgOverlay);
  });
});

describe('upsertPublicContact', () => {
  const contacts: ObjectWorkspaceContactsModule = {
    kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }, { id: 'k2', code: 'email', label: 'E-mail' }, { id: 'k3', code: 'fax', label: 'Fax' }],
    roleOptions: [], webKindOptions: [], relatedActorContactsCount: 0, relatedOrganizationContactsCount: 0, webItems: [{ id: 'w1' } as never],
    objectItems: [
      { id: 'c1', kindId: 'k1', kindCode: 'phone', kindLabel: 'Téléphone', roleId: '', roleCode: '', roleLabel: '', value: '0262 00 00 00', isPublic: true, isPrimary: true, position: '1' },
      { id: 'c3', kindId: 'k3', kindCode: 'fax', kindLabel: 'Fax', roleId: '', roleCode: '', roleLabel: '', value: '0262 11 11 11', isPublic: false, isPrimary: false, position: '2' },
    ] as never,
  } as never;
  it('modifie EN PLACE la ligne publique existante et garde les autres lignes', () => {
    const next = upsertPublicContact(contacts, 'phone', '0692 00 00 00');
    expect(next.objectItems.find((i) => i.id === 'c1')?.value).toBe('0692 00 00 00');
    expect(next.objectItems.find((i) => i.id === 'c3')).toEqual(contacts.objectItems[1]); // fax interne intact
    expect(next.webItems).toBe(contacts.webItems);
  });
  it('crée une ligne publique du bon genre quand elle manque (kind résolu depuis kindOptions)', () => {
    const next = upsertPublicContact(contacts, 'email', 'contact@villa.re');
    const row = next.objectItems.find((i) => i.kindCode === 'email');
    expect(row).toMatchObject({ kindId: 'k2', kindLabel: 'E-mail', isPublic: true, value: 'contact@villa.re' });
  });
  it('vider la valeur retire la ligne (le saver supprime les ids absents)', () => {
    expect(upsertPublicContact(contacts, 'phone', '').objectItems.some((i) => i.id === 'c1')).toBe(false);
  });
  it('ne rend PAS le genre absent du catalogue', () => {
    expect(() => upsertPublicContact({ ...contacts, kindOptions: [] }, 'website', 'www.x.re')).toThrow(/catalogue/);
  });
});

describe('setWeekHours', () => {
  const period = (over: object) => ({ recordId: 'p1', order: '1', bucket: 'current', label: '', seasonTypeCode: '', startDate: '', endDate: '',
    allYears: true, recurrence: 'always', isClosure: false, closedDays: [],
    weekdays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((code) => ({ code, label: code, slots: [] })), ...over });
  const closure = period({ recordId: 'p9', isClosure: true, recurrence: 'fixed', startDate: '2026-12-24', endDate: '2026-12-26' });
  it('n’édite que la période ouverte unique et garde les fermetures', () => {
    const o = { periods: [period({}), closure], periodTypeOptions: [], unavailableReason: null } as unknown as ObjectWorkspaceOpeningsModule;
    const next = setWeekHours(o, { monday: { open: true, fixedHours: true, slots: [{ start: '09:00', end: '12:00' }] }, tuesday: { open: false, fixedHours: false, slots: [] } } as never);
    expect(next.periods[1]).toBe(o.periods[1]);                            // fermeture intacte (même référence)
    expect(next.periods[0].weekdays.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '09:00', end: '12:00' }]);
    expect(next.periods[0].closedDays).toContain('tuesday');
  });
  it('crée une période « always » quand il n’y en a aucune', () => {
    const o = { periods: [], periodTypeOptions: [], unavailableReason: null } as unknown as ObjectWorkspaceOpeningsModule;
    expect(setWeekHours(o, {} as never).periods[0]).toMatchObject({ recurrence: 'always', label: 'Horaires habituels' });
  });
  it('est en LECTURE SEULE avec 2 périodes ouvertes (saisonnier : géré par l’office)', () => {
    const o = { periods: [period({}), period({ recordId: 'p2', recurrence: 'cyclic', startDate: '2026-07-01', endDate: '2026-08-31' })], periodTypeOptions: [], unavailableReason: null } as unknown as ObjectWorkspaceOpeningsModule;
    expect(readWeekHours(o).readOnlyReason).toMatch(/saison/);
  });
  it('« ouvert sans horaires fixes » = sentinelle créneau vide, JAMAIS slots vides', () => {
    const o = { periods: [period({})], periodTypeOptions: [], unavailableReason: null } as unknown as ObjectWorkspaceOpeningsModule;
    const next = setWeekHours(o, { monday: { open: true, fixedHours: false, slots: [] } } as never);
    // slots: [] ferait omettre le jour par buildOpeningsPayload ⇒ relu FERMÉ (§214-class).
    expect(next.periods[0].weekdays.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '', end: '' }]);
    expect(next.periods[0].closedDays).not.toContain('monday');
    // Et le retour de lecture reconnaît l'état sans le confondre avec « fermé ».
    expect(readWeekHours(next).hours.monday).toMatchObject({ open: true, fixedHours: false });
  });
});

describe('setAmenities / setPetPolicy', () => {
  it('garde les codes non affichés (PMR) via mergeEstablishmentAmenitySelection', () => {
    const c = { selectedAmenityCodes: ['acc_guide_dog_welcome', 'wifi'], selectedPaymentCodes: [], selectedLanguages: [{ code: 'fr' }], selectedEnvironmentCodes: ['calm'] } as never;
    const next = setAmenities(c, ['parking'], new Set(['wifi', 'parking']));
    expect(next.selectedAmenityCodes.sort()).toEqual(['acc_guide_dog_welcome', 'parking']);
    expect(next.selectedLanguages).toBe(c.selectedLanguages);
  });
  it('animaux : « je préfère ne pas répondre » = null, jamais false', () => {
    const cp = { petPolicy: { accepted: true, conditions: 'x' }, capacityItems: [], groupPolicy: {}, stayPolicy: {} } as never;
    expect(setPetPolicy(cp, null, '').petPolicy).toEqual({ accepted: null, conditions: '' });
  });
});
```

`portal-rubrics.test.ts` :

```ts
import { buildPortalRubrics, PORTAL_RUBRICS } from './portal-rubrics';

const floor = ['legal', 'provider-follow-up', 'publication', 'sync-identifiers', 'distribution', 'provider', 'relationships', 'places', 'media'];
const draft = (over: object) => ({
  contacts: { objectItems: [], unavailableReason: null }, descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } },
  openings: { periods: [], unavailableReason: null }, characteristics: { selectedAmenityCodes: [], selectedPaymentCodes: [], amenityGroups: [], paymentOptions: [], unavailableReason: null },
  capacityPolicies: { capacityItems: [], metricOptions: [{ code: 'max_capacity', id: 'm1', label: 'Capacité max.' }], petPolicy: { accepted: null, conditions: '' }, stayPolicy: {}, unavailableReason: null },
  pricing: { prices: [], unavailableReason: null }, activity: { durationMin: '', unavailableReason: null }, ...over,
}) as never;

describe('buildPortalRubrics', () => {
  it('HEB : pas de rubrique Horaires (463/469 HLO sans période — question différée PO), rubriques dans l’ordre', () => {
    const ids = buildPortalRubrics({ archetype: 'HEB', draft: draft({}), dirty: {}, masked: [], floor, pendingModules: new Set(), rejectedModules: new Set() }).map((r) => r.id);
    expect(ids).toEqual(['contacts', 'presentation', 'amenities', 'welcome', 'pricing']);
  });
  it('un module masqué par l’office retire sa rubrique ; un module dégradé la rend « unavailable » (jamais soumis)', () => {
    const rubrics = buildPortalRubrics({ archetype: 'RES', draft: draft({ pricing: { prices: [], unavailableReason: 'x' } }), dirty: {}, masked: ['descriptions'], floor, pendingModules: new Set(), rejectedModules: new Set() });
    expect(rubrics.some((r) => r.id === 'presentation')).toBe(false);
    expect(rubrics.find((r) => r.id === 'pricing')?.state).toBe('unavailable');
  });
  // Une correction RENVOYÉE prime sur le refus qui l'a provoquée : le module est dans les
  // DEUX ensembles (refusé par la dernière soumission résolue, en attente dans la nouvelle).
  // Afficher « À reprendre » inviterait à un geste que le verrou « une vérification ouverte »
  // refuse. D'où : unavailable > pending > rejected > dirty > filled > todo.
  it('priorité des états : pending PRIME sur rejected (corrigé puis renvoyé)', () => {
    const r = buildPortalRubrics({ archetype: 'RES', draft: draft({}), dirty: { contacts: true }, masked: [], floor, pendingModules: new Set(['contacts']), rejectedModules: new Set(['contacts']) });
    expect(r.find((x) => x.id === 'contacts')?.state).toBe('pending');
  });
  it('refusé et NON renvoyé reste « À reprendre »', () => {
    const r = buildPortalRubrics({ archetype: 'RES', draft: draft({}), dirty: {}, masked: [], floor, pendingModules: new Set(), rejectedModules: new Set(['contacts']) });
    expect(r.find((x) => x.id === 'contacts')?.state).toBe('rejected');
  });
  it('chaque rubrique porte un module hors plancher et un titre sans jargon', () => {
    for (const rubric of PORTAL_RUBRICS) {
      expect(floor).not.toContain(rubric.module);
      expect(rubric.title).not.toMatch(/module|section|canonique|modération|soumission/i);
    }
  });
});
```

`portal-change-summary.test.ts` :

```ts
import { describePortalChange } from './portal-change-summary';

it('contacts : une ligne par coordonnée changée, en clair', () => {
  const base = { contacts: { objectItems: [{ id: 'c1', kindCode: 'phone', value: '0262 00', isPublic: true }] } } as never;
  const next = { contacts: { objectItems: [{ id: 'c1', kindCode: 'phone', value: '0692 00', isPublic: true }, { id: 'c2', kindCode: 'email', value: 'a@b.re', isPublic: true }] } } as never;
  expect(describePortalChange('contacts', base, next)).toEqual({
    field: 'Vos coordonnées', before: 'Téléphone : 0262 00', after: 'Téléphone : 0692 00\nE-mail : a@b.re' });
});
it('borne les textes longs à 4000 caractères comme l’enveloppe d’origine', () => {
  const long = 'x'.repeat(5000);
  const base = { descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } } } as never;
  const next = { descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: long, values: { fr: long } } } } } as never;
  expect(describePortalChange('descriptions', base, next).after.length).toBeLessThanOrEqual(4000);
});
```

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/portal
```

Attendu : FAIL (modules absents).

- [ ] **Step 2 : Implémenter `portal-visibility.ts`**

```ts
// Ergonomie seulement : le serveur (submit_actor_fiche) revalide chaque enveloppe contre
// plancher + matrice (22023). On filtre AVANT de bâtir les enveloppes pour ne jamais
// montrer une rubrique que l'office a masquée.
import type { WorkspaceModuleId } from '../../services/object-workspace';

export function isModuleSubmittable(module: WorkspaceModuleId, maskedModules: string[], floorModules: string[]): boolean {
  return !maskedModules.includes(module) && !floorModules.includes(module);
}
```

- [ ] **Step 3 : Implémenter `portal-bindings.ts`**

Points d'implémentation (le test guide ; ouvrir les types dans `object-workspace-parser.ts` avant d'écrire) :

- `setPresentation` : `updateTranslatableField(field, 'fr', 'fr', value)` sur `object.chapo` et `object.description` — langue FORCÉE à `'fr'` dans les deux arguments (un compte à préférence EN écrirait ailleurs que la colonne FR) ; spread de `d`, `d.object` ; ne jamais stripper le Markdown (texte simple = Markdown valide).
- `upsertPublicContact` : cible = première ligne `objectItems` dont `kindCode.toLowerCase() === kind` (pour `'phone'`, accepter aussi `'mobile'` en repli à la LECTURE, mais créer en `'phone'`) ; existante → `{ ...row, value }` ; absente et valeur non vide → `createContactDraft(kindOptions, objectItems.length === 0)` puis `{ ...draft, id: \`draft-contact-${kind}-${Date.now()}\`, kindId, kindCode, kindLabel (depuis kindOptions par code, sinon throw 'genre absent du catalogue'), isPublic: true, isPrimary: aucune autre ligne de ce genre }` puis `reconcileContactPrimary(next, id)` ; valeur vidée → ligne retirée. `webItems` jamais touché.
- `readWeekHours` / `setWeekHours` : période cible = l'UNIQUE période `isClosure === false` ; 0 période → `createPeriodDraft(periods.length)` + `{ recurrence: 'always', label: 'Horaires habituels', startDate: '', endDate: '' }` ajoutée ; ≥ 2 → `readOnlyReason = 'Vos horaires changent selon la saison. L’office les gère pour vous.'` et `setWeekHours` rend `o` inchangé. **Quatre pièges vérifiés sur le code, chacun avec son test de sabotage :**
  1. **La sentinelle « ouvert sans horaires fixes »** : le parser émet `slots: [{ start: '', end: '' }]` pour un jour ouvert sans créneau (`object-workspace-parser.ts:2511-2514`) et `buildOpeningsPayload` (`object-workspace.ts:4852-4868`) le rend `closed:false, time_frames:[]`. **Ne jamais filtrer un créneau vide** : un `slots.filter(s => s.start && s.end)` fermerait, en un clic d'approbation, tout restaurant « sur rendez-vous ». D'où le champ `fixedHours` de `WeekHours` : `{ open: true, fixedHours: false }` ⇒ `slots: [{ start: '', end: '' }]` (jamais `[]`, qui vaut « fermé ») ; `readWeekHours` le rend `false` quand le seul créneau est vide ; on ne retire que les créneaux À MOITIÉ remplis (erreur affichée avant).
  2. **Les jours absents** : `period.weekdays` ne contient QUE les jours présents en base (un jour fermé est ABSENT, pas `slots: []`). Cocher un jour absent → INSÉRER `{ code, label (depuis OPENING_WEEKDAYS), slots }` ; laisser absent un jour absent non coché (sinon la période devient JSON-dirty sans changement réel) ; un jour inchangé garde la MÊME référence d'objet.
  3. **Symétrie de `closedDays`** : jour décoché → `slots: []` + `addClosedWeekday` ; jour recoché → retiré de `closedDays` (sinon état contradictoire et enveloppe fantôme après un aller-retour de case).
  4. **≥ 3 créneaux sur un jour** (0 cas aujourd'hui, rien ne l'interdit demain) : la rubrique passe en lecture seule pour ce jour (« Cet horaire est géré par l’office ») plutôt que de jeter un créneau non affiché.
  `validatePeriodDraft` passe toujours en `'always'`. Fermetures et autres périodes : mêmes références.
- `setAmenities` : `mergeEstablishmentAmenitySelection(c.selectedAmenityCodes, checked, visibleOptionCodes)` ; `setPayments` : `Array.from(new Set(codes))`. `selectedLanguages`/`selectedEnvironmentCodes` intacts.
- `setHeadlineCapacity` : ligne `capacityItems` par `metricCode` (UNIQUE object_id+metric_id) modifiée en place (`value: String`), sinon créée depuis `metricOptions` (`metricId`, `metricLabel`, `unit`, `effectiveFrom: ''`, `effectiveTo: ''`) ; valeur vide → ligne retirée ; si le code n'est pas dans `metricOptions` → throw (la rubrique ne rend pas le champ).
- `setPetPolicy` : `{ accepted, conditions: accepted === true ? conditions : '' }` — `null` reste `null`.
- `setStayPolicy` : spread `stayPolicy` ; `checkInUntil` non touché si absent du patch.
- `setStartingPrice` : cible = première ligne `indicationCode === 'principal'` (préférer `kindCode === 'adulte'`) ; absente → `createPricingDraft(p)` + kind `'adulte'` (ou `'gratuit'` si `free`) résolu depuis `priceKindOptions`, `indicationCode: 'principal'`, unit résolue depuis `priceUnitOptions` par `unitCode` (sinon première option), `currency: 'EUR'` ; `free` → `kindCode 'gratuit'`, `amount: '0'`, `amountMax: ''` ; virgule normalisée en point ; `validatePricingDraft` appelé par l'écran. `discounts`/`promotions`/autres lignes intacts.
- `setActivityBasics` : spread + patch (les 4 clés existent bien dans `ObjectWorkspaceActivityModule` : `durationMin`, `minParticipants`, `maxParticipants`, `minAge`, toutes `string` — vérifié le 2026-09-02).

- [ ] **Step 4 : Implémenter `portal-rubrics.ts`**

```ts
// Registre des rubriques du portail (18a, D10). C'est une ALLOWLIST : un module absent
// d'ici n'est jamais rendu ni soumis, quelle que soit la matrice. Une rubrique = un
// module = une enveloppe (contrat submit_actor_fiche). Titres en français courant,
// JAMAIS MODULE_LABEL (« Descriptions & langues parlées » est du jargon back-office).
export const PORTAL_RUBRICS: readonly PortalRubric[] = [
  { id: 'contacts', module: 'contacts', title: 'Vos coordonnées', archetypes: ['HEB', 'RES', 'ASC', 'VIS', 'SRV'],
    isFilled: (d) => d.contacts.objectItems.some((i) => i.isPublic && i.value.trim() && ['phone', 'mobile', 'email'].includes(i.kindCode.toLowerCase())),
    summary: (d) => [readPublicContact(d.contacts, 'phone'), readPublicContact(d.contacts, 'email')].filter(Boolean).join(' · ') },
  { id: 'presentation', module: 'descriptions', title: 'Présentez votre établissement', archetypes: ['HEB', 'RES', 'ASC', 'VIS', 'SRV'],
    isFilled: (d) => Boolean(readTranslatableField(d.descriptions.object.chapo, 'fr', 'fr').trim() && readTranslatableField(d.descriptions.object.description, 'fr', 'fr').trim()),
    summary: (d) => readTranslatableField(d.descriptions.object.chapo, 'fr', 'fr') },
  // HEB exclu en v1 : 463/469 HLO n'ont aucune période — leur demander des horaires
  // les pousserait à en inventer (question « ouvert toute l'année / fermetures » différée PO).
  { id: 'hours', module: 'openings', title: 'Vos horaires', archetypes: ['RES', 'ASC', 'VIS', 'SRV'], isFilled: …, summary: … },
  { id: 'amenities', module: 'characteristics', title: 'Équipements et moyens de paiement', archetypes: ['HEB', 'RES', 'ASC', 'VIS', 'SRV'], isFilled: …, summary: … },
  { id: 'welcome', module: 'capacity-policies', title: 'Capacité et animaux', archetypes: ['HEB', 'RES'], isFilled: …, summary: … },
  { id: 'pricing', module: 'pricing', title: 'Vos tarifs', archetypes: ['HEB', 'RES', 'ASC', 'VIS'], isFilled: …, summary: … },
  { id: 'activity', module: 'activity', title: 'Votre activité', archetypes: ['ASC'], isFilled: …, summary: … },
];
```

`buildPortalRubrics` : filtre `archetypes.includes(archetype)` → `isModuleSubmittable(module, masked, floor)` (sinon ABSENTE) → état : `unavailableReason` posé sur la tranche ⇒ `'unavailable'` (+ `readOnlyReason: 'Cette rubrique n’est pas disponible pour le moment. Contactez l’office si vous devez la modifier.'`) — garde `'unavailableReason' in slice && slice.unavailableReason != null` : les tranches `contacts` et `descriptions` n'ont PAS ce champ ; sinon `pendingModules.has` ⇒ `'pending'` ; `rejectedModules.has` ⇒ `'rejected'` ; `dirty[module]` ⇒ `'dirty'` ; `isFilled` ⇒ `'filled'` ; sinon `'todo'`. **`pending` AVANT `rejected`** : après une correction renvoyée, le module appartient aux deux ensembles (refusé par la dernière soumission résolue, en attente dans la nouvelle) et « À reprendre » inviterait à un geste que le verrou « une vérification ouverte par fiche » refuse. Équivalent accepté : retirer de `rejectedModules` tout module présent dans la soumission ouverte, au calcul des ensembles (Step 3). Pour `hours`, `readWeekHours(...).readOnlyReason` devient le `readOnlyReason` de la rubrique (état `filled`, non éditable).

`PORTAL_AMENITY_CODES` : ≤ 12 codes par archétype, **placeholder à valider PO** — proposer depuis `ref_amenity` (seeds, 163 codes scope object/both) les codes les plus fréquents par famille (wifi, parking, piscine, climatisation, terrasse ; accès PMR exclu car famille `accessibility`) ; un code absent du catalogue chargé n'est pas rendu (filtré au runtime, jamais d'erreur). ⚠ **`visite_libre` / `visite_guidee` / `audioguide` N'EXISTENT PAS dans `ref_amenity`** (ni seeds ni prod, vérifié le 2026-09-02 — seul `taxonomy_loi` porte `visite_guidee` ; `VISIT_MODE_CODES` de `editor-completion.ts` et les 3 toggles de `BlockVIS` écrivent des codes hors catalogue) : pour VIS, choisir des codes RÉELS ou faire seeder ces 3 codes (décision PO, à trancher avant la rubrique VIS). `PORTAL_PRICE_UNIT` : `{ HEB: 'par_nuit', RES: 'par_personne', VIS: 'par_personne', ASC: 'par_personne' }` — **à valider PO** (« par couvert » est du vocabulaire métier ; le visiteur lit « par personne »). `PORTAL_HEADLINE_METRIC` : `{ HEB: 'max_capacity', RES: 'seats' }`.

- [ ] **Step 5 : Implémenter `portal-change-summary.ts` (D12)**

```ts
// D12 — l'office lit metadata.field/before/after (list_pending_changes) ; l'enveloppe
// d'origine y met JSON.stringify de la tranche ENTIÈRE (catalogues inclus) capé à 4000
// caractères : diffWords rend un seul bloc illisible. Le portail SURCHARGE ces trois clés
// présentationnelles par une projection en clair, une ligne par champ — et rien d'autre :
// section, rpc, manual_apply, payload restent byte-identiques (le serveur ne valide
// qu'eux). Même plafond 4000 que l'enveloppe.
const MAX = 4000;
export function describePortalChange(module, baseline, draft): { field: string; before: string; after: string } {
  const rubric = PORTAL_RUBRICS.find((r) => r.module === module);
  const project = PROJECTIONS[module]; // contacts → lignes « Téléphone : … » ; descriptions → « Accroche : … » / « Présentation : … » ; openings → « Lundi : 09:00–12:00, 14:00–18:00 » ; characteristics → « Équipements : a, b » / « Paiement : … » ; capacity-policies → « Capacité max. : 4 personnes » / « Animaux : oui (petits chiens) » / « Arrivée : 16:00 · Départ : 10:00 » ; pricing → « À partir de 45 € par nuit » ; activity → « Durée : 120 min · 2 à 8 personnes · dès 6 ans »
  const before = project(baseline).join('\n').slice(0, MAX);
  const after = project(draft).join('\n').slice(0, MAX);
  return { field: rubric?.title ?? module, before, after };
}
```

- [ ] **Step 6 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/portal && npm run typecheck
git add src/features/portal
git commit -m "feat(front): portail — registre des rubriques, liaisons pures et diff lisible (D10/D12)"
```

Sabotage obligatoire avant commit (à rapporter dans le message de PR) : retirer le spread dans `upsertPublicContact` → le test « garde les autres lignes » DOIT rougir ; retirer `mergeEstablishmentAmenitySelection` → « garde les codes non affichés » DOIT rougir ; forcer `'fr'` → `localLanguage` dans `setPresentation` → aucun test ne rougit ⇒ AJOUTER un test avec `localLanguage: 'en'` qui exige `values.fr` écrit.

---

### Task 14 : Front — la fiche : liste de rubriques, formulaires, envoi, brouillon local

**Files :**
- Create: `bertel-tourism-ui/src/app/(portal)/espace/fiches/[objectId]/page.tsx`
- Create: `bertel-tourism-ui/src/features/portal/PortalFichePage.tsx` (chargement + garde de type + montage sous `key={objectId}`)
- Create: `bertel-tourism-ui/src/features/portal/PortalFicheHub.tsx` (liste des rubriques + « Pour compléter » + « Vérifiez ces informations » + retours de l'office)
- Create: `bertel-tourism-ui/src/features/portal/PortalRubricScreen.tsx` (chrome commun d'une rubrique : retour, h1, formulaire, Valider)
- Create: `bertel-tourism-ui/src/features/portal/rubrics/{ContactsRubric,PresentationRubric,HoursRubric,AmenitiesRubric,WelcomeRubric,PricingRubric,ActivityRubric,PhotosRubric}.tsx`
- Create: `bertel-tourism-ui/src/features/portal/PortalSendBar.tsx`, `PortalSendModal.tsx`
- Create: `bertel-tourism-ui/src/features/portal/usePortalDraft.ts` (brouillon localStorage — version du 2026-09-01 reprise, clé préfixée par `userId`)
- Modify: `bertel-tourism-ui/src/styles.css` (suite du bloc `.portal-*`)
- Test: `bertel-tourism-ui/src/features/portal/usePortalDraft.test.ts`, `PortalFicheHub.test.tsx`, `rubrics/ContactsRubric.test.tsx`, `PortalSendModal.test.tsx`

**Interfaces :**
- Consumes: `loadObjectWorkspace(queryClient, objectId, ['fr'])` / `useObjectWorkspaceQuery` (`hooks/useExplorerQueries.ts` — **langPrefs forcé à `['fr']`** pour que `descriptions.localLanguage === 'fr'`), `useObjectEditorState(objectId, modules)` (`draft`, `baseline`, `dirtySections`, `isDirty`, `replaceModule`, `resetModule`, `commitModules`), `getArchetypeMeta` ; Task 13 (`buildPortalRubrics`, updaters, `describePortalChange`, `isModuleSubmittable`) ; Task 11 (`getPortalSectionVisibility`, `listMySubmissions` — émet désormais `section` par changement —, `submitActorFiche`) ; `buildContributorSubmission`, `MODULE_KEY_MAP` ; `Modal`, `ConfirmDialog`, `EmptyState`, `PageSkeleton`, `useToast`. **JAMAIS `useUnsavedDraftGuard`** : il appelle `window.confirm` natif avec le message STAFF « Vous avez des modifications non publiées. Publiez la fiche… », pousse une entrée d'historique et intercepte tout lien dont la query diffère — avec `?rubrique=` il se déclencherait à chaque retour au hub. Le brouillon local est le filet ; aucune boîte bloquante à la sortie de la page.
- Produces: route `/espace/fiches/[objectId]` ; **une seule page** qui affiche le hub OU une rubrique selon `?rubrique=<id>` (navigation DOUCE uniquement : `<Link href={{ query: { rubrique } }} scroll={false}>` ou `router.push('?rubrique=…')` — une entrée d'historique par rubrique pour que le bouton Retour du téléphone ramène au hub ; **jamais un `<a href>` nu**, qui est une navigation complète dans l'App Router et remonte la page ; `useSearchParams` sous un `<Suspense>` dans le wrapper de route. La page ne se démonte JAMAIS entre deux rubriques : l'état éditeur est init-once et le brouillon vit en mémoire — à VÉRIFIER sur Next 16 en recette : changer `?rubrique=` ne doit pas remonter `PortalFicheEditor`).

**Écrans (maquette : `docs/superpowers/specs/2026-09-01-portail-acteur-design.md` §4.5, artefact « Espace prestataire ») :**

1. **Hub** — `<a>← Vos fiches</a>` (uniquement si ≥ 2 fiches) ; `h1.portal-h1` = nom de la fiche (`tabIndex={-1}`, reçoit le focus à chaque retour) ; ligne muted « {Type} · {Commune} » ; `.notice` permanent « Ce que vous modifiez ici est vérifié par l’office avant d’être publié. » ; si envoi en cours : `.notice--warn` « Envoyé le {date}. L’office vérifie vos modifications. Vous pouvez continuer à préparer d’autres changements. » ; si retours : carte `.panel-card--warning` « Retours de l’office » (une ligne par changement refusé : titre de rubrique + « refusé : « {review_note} » » + lien « Corriger ») ; carte « Pour compléter votre fiche » (boutons 48 px, un par rubrique `todo`, + « Ajoutez des photos ({n} sur {cible}) » qui ouvre Photos) ou ligne « Votre fiche est complète. Merci ! » ; `<ol class="portal-tasks">` : une ligne ≥ 64 px par rubrique = `<Link href={{ query: { rubrique: r.id } }} scroll={false}>` (navigation douce — jamais un `<a href>` nu, cf. « Produces » ci-dessus) titre (1.05 rem/700) + résumé 1 ligne (`summary`, `--ink-3`, tronqué) + `.badge` d'état + chevron ; états : `todo` « À faire » (`--warn`, `Circle`) · `filled` « Rempli » (`--ok`, `Check`) · `dirty` « Modifié — à envoyer » (`--info`, `Pencil`) · `pending` « Envoyé — en vérification » (`--muted`, `Clock`) · `rejected` « À reprendre » (`--danger`, `AlertTriangle`) · `unavailable` « Indisponible pour le moment » (`--muted`, ligne non cliquable) ; puis la pseudo-rubrique **Photos** (lecture seule) et la carte **« Vérifiez ces informations »** (Nom / Type de fiche / Adresse / Téléphone publié en lecture seule + bouton « Signaler une erreur » → textarea « Dites-nous ce qui est faux » dont le texte part préfixé « Erreur signalée : » dans le message d'envoi). **Jamais une impasse** : `submit_actor_fiche` exige ≥ 1 modification, donc si le signalement est la SEULE chose saisie, la carte le dit (« Ce message partira avec votre prochain envoi. Pour prévenir l’office tout de suite : ») et affiche l'e-mail et le téléphone publics de l'office (`officeEmail` / `officePhone` de `PortalFiche`, Task 6 + Task 11) avec `mailto:`/`tel:` — si les deux sont NULL, « Contactez votre office de tourisme. » ; le texte est conservé **dans le brouillon local** (clé `note`, Step 2 §5 : il peut être la SEULE saisie et un envoi sans modification est refusé — il ne peut donc pas vivre dans un état d'écran).
2. **Écran de rubrique** (`PortalRubricScreen`) — lien « ← Retour à la fiche » (44 px) ; `h1` = titre de la rubrique (focus) ; une phrase d'aide ; le formulaire (≤ 6 contrôles, labels visibles au-dessus, aide sous le label, erreur sous le champ) ; « Valider » (`.primary-button`, pleine largeur) + « Retour sans changer » (`.ghost-button`) ; ligne muted « Rien n’est envoyé pour l’instant. Vous enverrez tout depuis la page de la fiche. » ; si la rubrique est `pending` ou `rejected` : `.notice` « Vous avez envoyé une mise à jour de cette rubrique le {date}. Elle apparaîtra ici une fois vérifiée par l’office. » **suivie de ce qui a été envoyé** (« Vous aviez indiqué : Téléphone : 0692… »), lu dans l'instantané local `portal-sent:<userId>:<objectId>` écrit à l'envoi (Step 2) — sans lui, après un rechargement les champs montrent les valeurs PUBLIÉES et le prestataire re-saisit de mémoire, puis bute sur « vérification en cours » ; si `readOnlyReason` : le formulaire est remplacé par la phrase. **Le formulaire a un état local** initialisé depuis `editor.draft` et resynchronisé PENDANT LE RENDU quand `?rubrique` change (motif §212 : `if (key !== prevKey) { setPrevKey(key); setForm(read(draft)); }`) ; « Valider » = validation → `editor.replaceModule(MODULE_KEY_MAP[module], updater(...))` → retour hub (focus h1). Quitter avec un formulaire modifié non validé (« Retour sans changer » ou lien de retour) → `ConfirmDialog` titre « Quitter sans valider ? », message « Vos changements dans cette rubrique ne seront pas gardés. », **cancel = « Rester »** (c'est ce que reçoivent Échap et le clic hors fenêtre — `ConfirmDialog` mappe les deux sur `onCancel` : la sortie sûre doit être le cancel), **confirm tone=danger = « Quitter sans garder »**. Jamais l'inverse (« Ne pas garder » en cancel jetterait la saisie sur Échap).
3. **Barre d'envoi** (`PortalSendBar`, `position: sticky; bottom: 0`, `--surface`, ombre haute, `padding-bottom: env(safe-area-inset-bottom)`) — visible dès qu'au moins une rubrique est `dirty` : « {n} rubrique(s) modifiée(s) · enregistrées sur cet appareil » + « Envoyer à l’office » (`.primary-button` 48 px) + « Annuler mes modifications » (`.ghost-button` → `ConfirmDialog` tone danger « Effacer » / « Garder » → `editor.resetModule` par module dirty + `clearPortalDraft`). Envoi en cours côté office : bouton `aria-disabled="true"` (reste focalisable, motif D10) + phrase « Vérification en cours — vous pourrez envoyer vos nouveaux changements quand l’office aura terminé. ». Hors ligne : `OfflineBanner` global + bouton `aria-disabled` + « Pas de connexion. Vos modifications sont conservées ici. ».
4. **Fenêtre d'envoi** (`PortalSendModal`, `Modal` maison, reste montée) — ⚠ **`Modal` fait un `createPortal(…, document.body)`** (`Modal.tsx:157,188`) : la fenêtre n'est donc PAS descendante de `.portal-shell` et **aucune** règle `.portal-shell …` ne l'atteint (boutons 48 px, champs 1.05 rem). Lui passer `className="portal-modal"` et dupliquer le contrat de taille sous ce sélecteur (`.portal-modal .primary-button/.ghost-button { min-height: 48px; font-size: 1.05rem }`, `.portal-modal textarea { font-size: 1.05rem }`, `.portal-modal .badge { font-size: .9rem }`) — même chose pour tout `ConfirmDialog` du portail (`.portal-modal` via sa prop `className` si elle existe, sinon envelopper le contenu). Titre « Envoyer à l’office » ; « Vous envoyez : » + liste des titres de rubriques modifiées, avec pour chacune la mention « appliquée dès validation » (modules auto : `openings`, `characteristics`) ou « l’office la reportera » (les autres) ; textarea « Un message pour l’office (facultatif) » (pré-rempli par le signalement d'erreur) + aide « Par exemple : « Nouveaux horaires d’été » ou « Le numéro a changé ». » ; pied « Pas maintenant » / « Envoyer » (busy « Envoi… », `aria-busy`) ; chaque ligne de rubrique porte un bouton `.ghost-button` « Retirer de l’envoi » (`editor.resetModule` + mise à jour du brouillon) ; erreur DANS la fenêtre (`role="alert"`) : générique « Nous n’avons pas pu envoyer vos modifications. Vérifiez votre connexion et réessayez. Rien n’est perdu. » ; déjà un envoi en cours (`error.code === 'PT409'`, Task 5 — ajouter le libellé à `API_ERROR_LABELS`/`SQLSTATE_LABELS` de `api-error.ts`) « L’office est déjà en train de vérifier cette fiche. Vous pourrez envoyer ces changements quand la vérification sera terminée. » ; `22023` « Une rubrique n’est plus modifiable depuis ici (l’office l’a fermée). Retirez-la de l’envoi, puis réessayez. ». L'état de la note se resynchronise à l'ouverture (jamais `useState(() => …)` figé, §212).
5. **Après envoi** — la fenêtre se ferme ; le hub rend en tête une carte `.panel-card.motion-success` (icône `CheckCircle`, `h2` « Merci ! Vos modifications ont été envoyées à l’office. », `p` « L’office les vérifie, en général sous quelques jours. Vous recevrez un e-mail quand ce sera fait. », bouton « Retour à vos fiches » si ≥ 2 fiches) et reçoit le focus ; les rubriques envoyées passent `pending` ; la barre disparaît. Pas de toast (il couvrirait la barre haute sur mobile).
6. **Photos** (`PhotosRubric`, lecture seule, D11) — grille 2 colonnes des photos (`media.objectItems` type photo : `img alt={title || 'Photo n'}`, légende texte « Photo principale » sur `isMain`) ; carte `.notice` avec `Mail` : « Pour l’instant, les photos sont ajoutées par l’office. Envoyez-lui vos plus belles photos (JPG ou PNG) et il les publiera pour vous. » + bouton `.primary-button` « Envoyer mes photos par e-mail » = `mailto:{officeEmail}?subject=Photos — {nom}` + bouton « Copier l’adresse e-mail » **avec libellé visible** (`CopyButton` est icône seule : lui ajouter une prop `label` ou l'envelopper — un `mailto:` échoue en silence sur un téléphone sans application de courrier) ; si `officeEmail` absent : phrase « Contactez votre office de tourisme. » ; « (les photos de votre téléphone conviennent) » sous « JPG ou PNG » ; vide « Aucune photo pour l’instant. ». ⚠ En production le 2026-09-02, **aucune des 2 ORG n'a de canal e-mail public** : saisir les canaux de l'ORG publisher est un prérequis de recette (Task 20). ; **aucun bouton d'ajout** (la route `/api/media/upload` refuse la persona acteur en 403 — D7).

- [ ] **Step 1 : Tests ROUGES**

`usePortalDraft.test.ts` — reprendre les 4 cas du 2026-09-01 (écrit/relit, jette si l'empreinte a changé, clear, empreinte stable) avec les signatures du Step 2 : `readPortalDraft(userId, objectId, serverModules)` → `{ draft, note, savedAt } | null` / `writePortalDraft(userId, objectId, serverModules, dirtySlices, note)` / `clearPortalDraft(userId, objectId)` / `hasPortalDraft(userId, objectId)` (clé `portal-draft:<userId>:<objectId>` — un appareil partagé ne doit jamais rejouer le brouillon d'un autre compte), plus : `clearAllPortalDrafts(userId)` purge toutes les clés du compte ; une note SEULE (aucune tranche sale) survit à un rechargement ; le brouillon survit à `commitModules` (empreinte serveur, Step 2 §1) ; un échec de `signOut` laisse le brouillon intact (Step 2 §4).

`PortalFicheHub.test.tsx` (RTL ; mocks `services/portal` + un `draft` de test ; monter `PortalFicheHub` avec un `editor` factice `{ draft, baseline, dirtySections, replaceModule: jest.fn(), … }`) :

```tsx
it('rend une ligne par rubrique de l’archétype avec un état en mots', () => { /* HEB : 5 rubriques, « À faire » / « Rempli » */ });
it('« Pour compléter votre fiche » ne liste que les rubriques À faire, plus les photos sous l’objectif', () => {});
it('la barre d’envoi n’apparaît qu’avec une rubrique modifiée et compte les rubriques', () => {});
it('envoi en cours : bouton aria-disabled + phrase visible, les rubriques restent ouvrables', () => {});
it('retours de l’office : une ligne par changement refusé avec la note et un lien Corriger vers ?rubrique=', () => {});
it('type non pris en charge (ITI/FMA/ORG) : panneau « Cette fiche est gérée par l’office » et aucune rubrique', () => {});
```

`rubrics/ContactsRubric.test.tsx` :

```tsx
it('Valider écrit la tranche complète via replaceModule (fax interne conservé) puis revient au hub', () => {});
it('un e-mail invalide affiche l’erreur sous le champ, aria-invalid, et NE valide PAS', () => {});
it('changer de rubrique resynchronise le formulaire (pas de valeurs de la rubrique précédente — §212)', () => {});
```

`PortalSendModal.test.tsx` :

```tsx
it('liste les rubriques modifiées avec leur régime (appliquée dès validation / l’office la reportera)', () => {});
it('Envoyer construit UNE enveloppe par module dirty via buildContributorSubmission, surcharge field/before/after (D12) et appelle submitActorFiche UNE fois', () => {
  // asserter que metadata.section / rpc / manual_apply / payload sont ceux de buildContributorSubmission (byte-identiques)
});
it('erreur serveur « déjà en cours » → phrase dédiée dans la fenêtre, brouillon intact', () => {});
```

- [ ] **Step 2 : `usePortalDraft.ts`** — reprendre la version du 2026-09-01 (empreinte djb2, debounce 800 ms, restauration au montage, `draftDiscarded`) avec les changements de signature ci-dessus et **trois corrections** (revue du 2026-09-02) :
  1. **L'empreinte se calcule sur les modules SERVEUR** (`resource.modules` du cache React Query), **jamais sur `editor.baseline`** : `editor.commitModules` réécrit la baseline avec les valeurs ENVOYÉES alors que la fiche ne change qu'à l'approbation ; un brouillon écrit pendant la vérification serait donc stocké sous une empreinte qu'un rechargement ne reproduit jamais ⇒ écarté avec la bannière mensongère « mise à jour par l’office ». Test : « après commitModules puis rechargement, le brouillon est retrouvé ».
  2. **Empreinte et contenu sans catalogues** : hacher `stripCatalogOptions(modules)` (`io/object-io-serialize.ts`) — sinon un code ajouté au catalogue par l'office change l'empreinte de TOUS les brouillons ; et ne stocker que les tranches DIRTY (les 29 tranches avec catalogues dépassent vite le quota localStorage partagé entre fiches). `try/catch` sur chaque lecture/écriture.
  3. **Instantané envoyé** `portal-sent:<userId>:<objectId>` = `{ submittedAt, lines: Record<module, string[]> }` écrit à l'envoi depuis `describePortalChange(...).after` — lu par la notice de rubrique `pending`/`rejected` (« Vous aviez indiqué : … ») ; purgé quand `lastResolved` est postérieur à `submittedAt` et au sign-out.
  4. **La purge suit une déconnexion RÉUSSIE, jamais l'inverse.** `PortalShell.handleSignOut` capture `userId`, `await signOut()`, et n'appelle `clearAllPortalDrafts(userId)` (brouillons ET instantanés) **qu'après** — une coupure réseau détruirait sinon tout le travail non envoyé d'un prestataire qui reste connecté. (Variante équivalente : purger dans la transition `SIGNED_OUT` confirmée.) Test : « `signOut` rejette ⇒ le brouillon est toujours là ».
  5. **Le message à l'office fait partie du brouillon.** Le hub promet que le texte de « Signaler une erreur » survit quand aucune rubrique n'est modifiée (`submit_actor_fiche` refuse un envoi sans changement) : il ne peut donc pas vivre dans un état React. Les signatures portent une note :
     `writePortalDraft(userId, objectId, serverModules, dirtySlices, note)` / `readPortalDraft(userId, objectId, serverModules) → { draft, note, savedAt } | null` ; la note est écrite même quand aucune tranche n'est sale (le brouillon existe alors avec `draft: {}`), elle pré-remplit la fenêtre d'envoi, et n'est effacée que par un envoi réussi ou un abandon explicite (« Annuler mes modifications » l'inclut, en le disant dans la confirmation). Tests : écriture/relecture d'une note sans tranche sale ; note conservée à travers un rechargement ; note écartée avec le brouillon quand l'empreinte a changé ; note purgée après un envoi réussi.

- [ ] **Step 3 : `PortalFichePage.tsx` + route**

```tsx
// Route : copier EXACTEMENT la lecture des params du wrapper back-office
// (main)/objects/[objectId]/edit/page.tsx (params est une Promise : `use(params)`).
export default function PortalFicheRoute({ params }: { params: Promise<{ objectId: string }> }) {
  const { objectId } = use(params);
  return <Suspense fallback={null}><PortalFichePage objectId={objectId} /></Suspense>;
}
```

`PortalFichePage` : `useObjectWorkspaceQuery(objectId)` **avec langPrefs `['fr']`** (vérifier la signature dans `useExplorerQueries.ts` : si le hook lit `langPrefs` depuis la session, appeler `loadObjectWorkspace(queryClient, objectId, ['fr'])` via `useQuery` avec la clé `['object-workspace', objectId, ['fr']]`) + `useQuery(['portal-visibility', objectId], () => getPortalSectionVisibility(objectId))` + `useQuery({ queryKey: ['portal-submissions', objectId], queryFn: () => listMySubmissions(20, objectId) })` (**la clé ET l'appel portent l'id** : sans le paramètre, la soumission ouverte de CETTE fiche peut sortir des 20 lignes d'un acteur multi-fiches ; sans l'id dans la clé, une fiche rendrait l'historique d'une autre. L'invalidation reste par préfixe `['portal-submissions']`) + le cache `['portal-fiches']` (pour `openSubmission`, `officeEmail`, nombre de fiches). Chargement → `PageSkeleton variant="form"` + « Nous préparons votre fiche… » ; erreur → `EmptyState mode="error"` « Nous n’avons pas pu ouvrir votre fiche. » + Réessayer ; `getArchetypeMeta(resource.type) === null` → panneau « Cette fiche est gérée par l’office. Contactez-le pour la modifier. ». Sinon `<PortalFicheEditor key={objectId} … />` qui appelle `useObjectEditorState(objectId, resource.modules)` et lit `useSearchParams().get('rubrique')`.

Calcul des ensembles pour `buildPortalRubrics` : `pendingModules` = modules des changements `status === 'pending'` de la soumission ouverte (`listMySubmissions` → `changes[].section`, clé additive Task 6/11) ; `rejectedModules` = changements `status === 'rejected'` de la DERNIÈRE soumission résolue de cette fiche, **moins** ceux déjà présents dans `pendingModules` (une correction renvoyée n'est plus « à reprendre » — cf. la priorité des états, Step 4 de la Task 13).

- [ ] **Step 4 : `PortalFicheHub.tsx`, `PortalRubricScreen.tsx`, les 8 rubriques, `PortalSendBar`, `PortalSendModal`**

Formulaires (contrôles natifs uniquement : `type=tel|email|url|time|number`, `inputmode`, `autocomplete`) :

| Rubrique | Contrôles | Updater |
|---|---|---|
| Vos coordonnées | Téléphone (`tel`), E-mail (`email`), Site internet (`url`, facultatif, aide « Exemple : www.exemple.re ») | `upsertPublicContact` ×3 (mobile = repli lecture du téléphone) |
| Présentez votre établissement | « En une phrase » (`textarea` 2 lignes, 160 max, compteur `aria-live`), « Présentez votre établissement » (`textarea` 8 lignes, 2000 max ; avertissement doux < 120 car.) | `setPresentation` |
| Vos horaires | **deux écrans dans la rubrique** (jamais une grille 7 × 5 sur un téléphone) : (1) « Quels jours êtes-vous ouvert ? » = 7 cases `.portal-choice` + raccourcis « Tous les jours » / « Du lundi au vendredi » / « Le week-end » → « Suivant » ; (2) « À quelles heures ? » = 3 radios « Les mêmes heures tous les jours ouverts » (une paire `time` « de … à … » + « Ajouter une pause (fermeture le midi) ») / « Ça dépend du jour » (une carte par jour ouvert) / « Sans horaires fixes (sur rendez-vous) » (⇒ `fixedHours: false` ⇒ sentinelle `[{start:'',end:''}]`, jamais `slots: []` qui serait relu FERMÉ — voir Task 13) ; erreur « Indiquez une heure de fin après l’heure de début. » ; « Valider » ramène au hub | `setWeekHours` (lecture seule si `readOnlyReason`) |
| Équipements et moyens de paiement | `fieldset` « Ce que vous proposez » = cases `.portal-choice` sur `PORTAL_AMENITY_CODES[archetype]` ∩ catalogue chargé ; disclosure `.help-qa` « Voir tous les équipements » (familles restantes, `filterEstablishmentAmenityGroups`) ; `fieldset` « Moyens de paiement acceptés » = toutes `paymentOptions` | `setAmenities(…, visibleOptionCodes = tous les codes rendus)` + `setPayments` |
| Capacité et animaux | « Combien de personnes pouvez-vous accueillir au maximum ? » (`number`, suffixe « personnes » ; RES : « Combien de couverts au maximum ? ») ; `fieldset` « Acceptez-vous les animaux ? » = 3 radios `.portal-choice` « Oui » / « Non » / « Je préfère ne pas l’indiquer » + « Sous quelles conditions ? (facultatif) » si Oui ; HEB : « Arrivée à partir de » / « Départ avant » (`time`) | `setHeadlineCapacity`, `setPetPolicy`, `setStayPolicy` |
| Vos tarifs | VIS/ASC : case « L’accès est gratuit » ; « À partir de » (`number`, `inputmode=decimal`, suffixe « € par nuit / par couvert / par personne ») ; « Jusqu’à (facultatif) » ; liste muted « Autres tarifs déjà enregistrés par l’office » (`summarizePricingLine`) | `setStartingPrice` + `validatePricingDraft` |
| Votre activité | « Durée » (`number` + `select` minutes/heures → minutes), « Nombre de personnes : minimum / maximum », « Âge minimum » (`number`, suffixe « ans ») ; erreur « Le maximum doit être supérieur ou égal au minimum. » | `setActivityBasics` |
| Vos photos | lecture seule (voir écran 6) | — |

Envoi (`PortalSendModal.handleSend`) :

```ts
const submittable = rubrics.filter((r) => r.state === 'dirty').map((r) => r.module);   // déjà filtré matrice + plancher + unavailable
const envelopes = submittable.map((module) => {
  const base = buildContributorSubmission(objectId, module, editor.baseline, editor.draft); // contrat : section/rpc/manual_apply/payload intacts
  const readable = describePortalChange(module, editor.baseline, editor.draft);              // D12 : 3 clés présentationnelles
  return { ...base, metadata: { ...base.metadata, ...readable } };
});
const result = await submitActorFiche(objectId, envelopes, note);   // UN appel ; échec = rien n'est parti
editor.commitModules(submittable.map((m) => MODULE_KEY_MAP[m]));
clearPortalDraft(userId, objectId);
queryClient.setQueryData(['portal-fiches'], (old) => …openSubmission optimiste depuis result.submissionId…);
void queryClient.invalidateQueries({ queryKey: ['portal-fiches'] });
void queryClient.invalidateQueries({ queryKey: ['portal-submissions'] });
```

Jamais `useEditorSave.save` (N appels non transactionnels), jamais de saver direct, jamais `client.from(...)`.

CSS (suite du bloc `.portal-*`) : `.portal-tasks` (liste sans puces, lignes séparées par `--line`, `.portal-task__link` flex ≥ 64 px), `.portal-choice` (label flex, ≥ 56 px, padding 12px 16px, bordure `--line`, radius `--radius-sm`, `:has(:checked)` fond `rgb(var(--theme-primary-rgb) / 0.08)` + bordure `--teal`), `.portal-week` (lignes jour), `.portal-sendbar` (`position: sticky; bottom: 0` — jamais `fixed`, qui saute avec le clavier iOS —, `--surface`, `box-shadow: var(--shadow-m)`, `padding: 12px 16px calc(12px + env(safe-area-inset-bottom))` ; aucun ancêtre de `.portal-shell` ne doit porter `overflow: hidden|auto`, sinon le sticky ne colle pas), `.portal-progress` (piste 8 px, recette `.crm-backlog__track`, `aria-hidden` — le texte « 3 rubriques sur 6 renseignées » porte la valeur), `.portal-gallery` (grille 2 colonnes, `aspect-ratio: 4/3`).

- [ ] **Step 5 : Vérifier**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/portal src/views/PortalHomePage.test.tsx src/styles.guard.test.ts && npm run typecheck
```

Puis recette manuelle en dev (préférence « real DB data ») : `preview_start`, compte de test acteur (provisoirement en SQL live : `UPDATE app_user_profile SET role='actor', actor_id=<uuid test> WHERE id=<compte jetable>`), parcourir /espace → fiche → 2 rubriques → Envoyer → « Merci ! » → recharger (rubriques « Envoyé — en vérification ») ; **sur un téléphone réel** (ou l'émulation 375 px) : aucune barre horizontale, cibles ≥ 48 px, clavier numérique sur les champs nombre/tel ; PUIS remettre le compte dans son état d'origine.

- [ ] **Step 6 : Commits (une tranche par commit, chacune verte)**

```bash
git add src/features/portal/usePortalDraft.ts src/features/portal/usePortalDraft.test.ts src/components/portal/PortalShell.tsx
git commit -m "feat(front): portail — brouillon local par compte et par fiche"
git add "src/app/(portal)/espace/fiches" src/features/portal/PortalFichePage.tsx src/features/portal/PortalFicheHub.tsx src/features/portal/PortalFicheHub.test.tsx src/styles.css
git commit -m "feat(front): portail — page fiche en liste de rubriques (hub)"
git add src/features/portal/PortalRubricScreen.tsx src/features/portal/rubrics
git commit -m "feat(front): portail — formulaires de rubrique (coordonnées, présentation, horaires, équipements, accueil, tarifs, activité, photos)"
git add src/features/portal/PortalSendBar.tsx src/features/portal/PortalSendModal.tsx src/features/portal/PortalSendModal.test.tsx
git commit -m "feat(front): portail — envoi à l'office en un geste, retours et confirmation"
```

---

### Task 15 : Front — route d'accès portail `/api/crm/actor-access`

**Files :**
- Create: `bertel-tourism-ui/src/app/api/crm/actor-access/route.ts`
- Test: `bertel-tourism-ui/src/app/api/crm/actor-access/route.test.ts`

**Interfaces :**
- Consumes: `authenticated`, `callerClient` de `src/app/api/_document-auth.ts` ; `api.user_can_write_crm_actor` (gate CRM, PAS le rang plateforme — c'est un acte CRM, D1).
- Produces: `POST /api/crm/actor-access` avec body `{action: 'status'|'invite'|'resend'|'revoke', actorId: string, email?: string}` :
  - `status` → `{account: null}` ou `{account: {userId, email, invitedAt, lastSignInAt}}`
  - `invite` → 201 `{userId}` ; 409 `{error:'email_taken_by_staff'}` si l'e-mail appartient à un compte non-acteur ou lié à un AUTRE acteur ; 422 si l'e-mail n'est pas un canal `email` de CET acteur.
  - `resend` → même règle que la route admin : suppression + ré-invitation UNIQUEMENT si `last_sign_in_at` null.
  - `revoke` → 200 ; refuse (409) si le compte cible n'est pas `{role:'actor', actor_id: actorId}` (jamais de suppression de staff).

- [ ] **Step 1 : Test ROUGE** — `route.test.ts` avec `/** @jest-environment node */`, pattern du dépôt (`src/app/api/admin/invite/route.test.ts` : mocker `@/lib/supabase-server` et `@supabase/supabase-js`). Cas à couvrir :

```ts
/** @jest-environment node */
// Cas : 401 sans Bearer ; 403 si user_can_write_crm_actor rend false ; 422 e-mail hors
// canaux de l'acteur ; 409 e-mail d'un compte staff ; invite nominal → inviteUserByEmail
// appelé avec redirectTo /set-password + upsert app_user_profile {role:'actor', actor_id} ;
// revoke refuse un profil non-acteur ; revoke nominal → deleteUser.
```

Écrire les 7 cas en s'appuyant sur le gabarit du test de la route admin (mocks `getServerSupabaseClient` → objet avec `auth.getUser`, `auth.admin.{inviteUserByEmail,listUsers,deleteUser,getUserById}`, `from(...).select/eq/upsert` chaînés ; mock `createClient` pour le callerClient → `schema('api').rpc` renvoyant `{data:true}`). Lancer :

```bash
cd bertel-tourism-ui && npm run test:run -- src/app/api/crm/actor-access/route.test.ts
```

- [ ] **Step 2 : Implémenter `route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { authenticated, callerClient, UUID_SHAPE } from '../../_document-auth';

export const runtime = 'nodejs';

// Accès portail d'un acteur (18a/D1) — géré depuis la fiche prestataire CRM, PAS depuis
// l'administration d'équipe : le gate est api.user_can_write_crm_actor (en tant
// qu'appelant), pas le rang plateforme. Le client service_role ne sert QU'APRÈS ce gate.
//
// Invariants :
//  - l'e-mail invité DOIT être un canal `email` de CET acteur (l'unicité globale des
//    e-mails d'acteur garantit qu'il ne pointe pas ailleurs) ;
//  - on n'écrase JAMAIS un compte existant qui n'est pas {role:'actor', actor_id:CET
--    acteur} — un staff dont l'e-mail traîne dans actor_channel reste intouchable ;
//  - revoke ne supprime QUE ce même profil exact (garde anti-suppression de staff).

type Body = { action?: unknown; actorId?: unknown; email?: unknown };

async function actorEmailChannels(server: NonNullable<ReturnType<typeof import('@/lib/supabase-server').getServerSupabaseClient>>, actorId: string): Promise<string[]> {
  const { data: kind } = await server.from('ref_code_contact_kind').select('id').eq('code', 'email').limit(1).maybeSingle();
  if (!kind?.id) return [];
  const { data } = await server.from('actor_channel').select('value').eq('actor_id', actorId).eq('kind_id', kind.id);
  return (data ?? []).map((row) => String(row.value ?? '').trim().toLowerCase()).filter(Boolean);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const { server, jwt } = auth;

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const action = typeof body.action === 'string' ? body.action : '';
  const actorId = typeof body.actorId === 'string' ? body.actorId : '';
  if (!UUID_SHAPE.test(actorId)) return NextResponse.json({ error: 'invalid_actor' }, { status: 422 });
  if (!['status', 'invite', 'resend', 'revoke'].includes(action)) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 422 });
  }

  // LE gate — évalué EN TANT QUE L'APPELANT (anon + JWT), jamais avec la service key.
  const { data: canWrite, error: gateErr } = await callerClient(jwt)
    .schema('api').rpc('user_can_write_crm_actor', { p_actor_id: actorId });
  if (gateErr || canWrite !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Le compte portail éventuellement déjà lié à CET acteur.
  const { data: linked } = await server
    .from('app_user_profile').select('id, role').eq('actor_id', actorId).limit(1).maybeSingle();

  if (action === 'status') {
    if (!linked) return NextResponse.json({ account: null });
    const { data: user } = await server.auth.admin.getUserById(linked.id);
    return NextResponse.json({ account: {
      userId: linked.id,
      email: user?.user?.email ?? null,
      invitedAt: user?.user?.created_at ?? null,
      lastSignInAt: user?.user?.last_sign_in_at ?? null,
    } });
  }

  if (action === 'revoke') {
    if (!linked || linked.role !== 'actor') {
      return NextResponse.json({ error: 'no_portal_account' }, { status: 409 });
    }
    const { error: delErr } = await server.auth.admin.deleteUser(linked.id);
    if (delErr) return NextResponse.json({ error: 'revoke_failed', detail: delErr.message }, { status: 500 });
    return NextResponse.json({ revoked: true });
  }

  // invite / resend
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  }
  const channels = await actorEmailChannels(server, actorId);
  if (!channels.includes(email)) {
    return NextResponse.json({ error: 'email_not_actor_channel' }, { status: 422 });
  }

  // Un compte existe déjà avec cet e-mail ? Il n'est ré-invitable QUE s'il est LE compte
  // portail de CET acteur ET ne s'est jamais connecté (même règle que la route admin).
  const { data: list } = await server.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    const isThisActorAccount = linked?.id === existing.id && linked?.role === 'actor';
    if (!isThisActorAccount) {
      return NextResponse.json({ error: 'email_taken_by_staff' }, { status: 409 });
    }
    if (action !== 'resend') {
      return NextResponse.json({ error: 'already_invited' }, { status: 409 });
    }
    if (existing.last_sign_in_at) {
      return NextResponse.json({ error: 'already_active' }, { status: 409 });
    }
    const { error: delErr } = await server.auth.admin.deleteUser(existing.id);
    if (delErr) return NextResponse.json({ error: 'resend_failed', detail: delErr.message }, { status: 500 });
  }

  const origin = (req.headers.get('origin') ?? new URL(req.url).origin).replace(/\/$/, '');
  const { data: created, error: createErr } = await server.auth.admin.inviteUserByEmail(email, {
    // ?espace=1 : la page /set-password bascule en copie « prestataire » (Task 10 Step 2 bis).
    // ⚠ Vérifier dans le Dashboard Supabase (Auth → URL configuration) que l'allowlist accepte
    // la query string (motif `…/set-password*`) — sinon Supabase retombe sur le Site URL.
    redirectTo: `${origin}/set-password?espace=1`,
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: 'create_failed', detail: createErr?.message ?? 'no_user' }, { status: 500 });
  }
  // Le profil PORTAIL : role actor + le lien explicite. C'est CE couple qui confine le
  // compte (routage front) et fonde sa portée (RLS via current_user_actor_id).
  const { error: upsertErr } = await server.from('app_user_profile')
    .upsert({ id: created.user.id, role: 'actor', actor_id: actorId }, { onConflict: 'id' });
  if (upsertErr) {
    // Compte auth créé mais profil raté ⇒ rollback du compte (sinon compte sans rôle = bricked).
    await server.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: 'profile_failed', detail: upsertErr.message }, { status: 500 });
  }
  return NextResponse.json({ userId: created.user.id }, { status: 201 });
}
```

⚠ Corriger la coquille de commentaire (`--` → `//`) à la ligne « acteur} — un staff… » lors de la transcription.

- [ ] **Step 3 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/app/api/crm/actor-access/route.test.ts && npm run typecheck
git add src/app/api/crm/actor-access
git commit -m "feat(api): accès portail acteur — invite/resend/revoke/status gérés depuis le CRM"
```

---

### Task 16 : Front — bloc « Accès portail » dans la fiche prestataire CRM

**Files :**
- Create: `bertel-tourism-ui/src/features/crm/CrmActorPortalAccess.tsx`
- Create: `bertel-tourism-ui/src/services/actor-access.ts`
- Modify: `bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx` (monter la carte dans le rail)
- Test: `bertel-tourism-ui/src/features/crm/CrmActorPortalAccess.test.tsx`

- [ ] **Step 1 : Service `actor-access.ts`** (fetch wrapper, pattern `pingNotifyDrain` pour le Bearer) :

```ts
// Client de /api/crm/actor-access (18a/D1). Le Bearer vient de la session Supabase —
// même mécanique que pingNotifyDrain (services/crm.ts).
import { getSupabaseClient } from '../lib/supabase';

export interface PortalAccount {
  userId: string;
  email: string | null;
  invitedAt: string | null;
  lastSignInAt: string | null;
}

async function callActorAccess(body: Record<string, unknown>): Promise<Response> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');
  return fetch('/api/crm/actor-access', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ERROR_MESSAGES: Record<string, string> = {
  email_not_actor_channel: "Cet e-mail n'est pas un canal de l'acteur — ajoutez-le d'abord à ses coordonnées.",
  email_taken_by_staff: 'Cet e-mail appartient déjà à un compte interne — invitation impossible.',
  already_invited: 'Un compte portail existe déjà pour cet acteur.',
  already_active: 'Ce compte s’est déjà connecté — rien à renvoyer.',
  no_portal_account: 'Aucun compte portail à révoquer.',
  forbidden: 'Vous n’avez pas le droit d’écriture CRM sur cet acteur.',
};

async function unwrap<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(ERROR_MESSAGES[payload.error ?? ''] ?? `Échec (${response.status}).`);
  }
  return payload;
}

export async function getPortalAccessStatus(actorId: string): Promise<PortalAccount | null> {
  const res = await unwrap<{ account: PortalAccount | null }>(await callActorAccess({ action: 'status', actorId }));
  return res.account;
}
export async function invitePortalAccess(actorId: string, email: string): Promise<void> {
  await unwrap(await callActorAccess({ action: 'invite', actorId, email }));
}
export async function resendPortalAccess(actorId: string, email: string): Promise<void> {
  await unwrap(await callActorAccess({ action: 'resend', actorId, email }));
}
export async function revokePortalAccess(actorId: string): Promise<void> {
  await unwrap(await callActorAccess({ action: 'revoke', actorId }));
}
```

- [ ] **Step 2 : Test RTL ROUGE** de la carte (`CrmActorPortalAccess.test.tsx`) : mock du service ; cas — (1) aucun compte → bouton « Inviter » actif si un canal e-mail existe, désactivé avec raison sinon ; (2) compte actif → e-mail + badge « Actif » + « Révoquer » ouvre une confirmation (`ConfirmDialog`) puis appelle `revokePortalAccess` ; (3) invité jamais connecté → « Renvoyer l'invitation » ; (4) `canWrite=false` → boutons désactivés avec `CRM_READ_ONLY_REASON`.

- [ ] **Step 3 : Implémenter `CrmActorPortalAccess.tsx`**

```tsx
'use client';

// Carte « Accès portail » de la fiche prestataire (18a/D1, maquette écran 3). Rail droit
// de CrmActorFiche, sous la carte acteur. Toute action passe par /api/crm/actor-access
// (gate serveur user_can_write_crm_actor) ; canWrite ici n'est que du no-write-trap.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import {
  getPortalAccessStatus, invitePortalAccess, resendPortalAccess, revokePortalAccess,
} from '../../services/actor-access';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { CRM_READ_ONLY_REASON, formatShort } from './crm-view-utils';

export function CrmActorPortalAccess({
  actorId, canWrite, emailChannels,
}: {
  actorId: string;
  canWrite: boolean;
  /** Valeurs des canaux e-mail de l'acteur (fournies par la fiche — déjà chargées). */
  emailChannels: string[];
}) {
  const queryClient = useQueryClient();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ['crm-actor-portal-access', actorId],
    queryFn: () => getPortalAccessStatus(actorId),
  });
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['crm-actor-portal-access', actorId] });
  }
  const invite = useMutation({
    mutationFn: () => invitePortalAccess(actorId, emailChannels[0]),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec.'),
  });
  const resend = useMutation({
    mutationFn: () => resendPortalAccess(actorId, statusQuery.data?.email ?? emailChannels[0]),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec.'),
  });
  const revoke = useMutation({
    mutationFn: () => revokePortalAccess(actorId),
    onSuccess: () => { setActionError(null); setConfirmRevoke(false); refresh(); },
    onError: (error) => { setConfirmRevoke(false); setActionError(error instanceof Error ? error.message : 'Échec.'); },
  });

  const account = statusQuery.data ?? null;
  const noEmailReason = emailChannels.length === 0
    ? 'Ajoutez d’abord un e-mail aux coordonnées de l’acteur.' : null;

  return (
    <div className="rcard" role="group" aria-label="Accès portail">
      <h4><KeyRound size={13} aria-hidden /> Accès portail</h4>
      {statusQuery.isLoading ? (
        <p className="crm-rail__empty">Chargement…</p>
      ) : account ? (
        <>
          <p className="portal-access__line">
            <span>{account.email ?? '—'}</span>
            <span className={`pill-mini ${account.lastSignInAt ? 'principal' : ''}`}>
              {account.lastSignInAt ? 'Actif' : 'Invité'}
            </span>
          </p>
          <p className="crm-rail__empty">
            {account.lastSignInAt
              ? `Dernière connexion ${formatShort(account.lastSignInAt)}`
              : `Invité ${account.invitedAt ? formatShort(account.invitedAt) : ''} · jamais connecté`}
          </p>
          <div className="inline-actions">
            {!account.lastSignInAt && (
              <button type="button" className="crm-btn sm" disabled={!canWrite || resend.isPending}
                title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                onClick={() => resend.mutate()}>
                Renvoyer l’invitation
              </button>
            )}
            <button type="button" className="crm-btn sm danger" disabled={!canWrite || revoke.isPending}
              title={canWrite ? undefined : CRM_READ_ONLY_REASON}
              onClick={() => setConfirmRevoke(true)}>
              Révoquer
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="crm-rail__empty">Cet acteur n’a pas encore accès au portail.</p>
          <button type="button" className="crm-btn sm" disabled={!canWrite || !!noEmailReason || invite.isPending}
            title={!canWrite ? CRM_READ_ONLY_REASON : noEmailReason ?? undefined}
            onClick={() => invite.mutate()}>
            Inviter ({emailChannels[0] ?? 'aucun e-mail'})
          </button>
        </>
      )}
      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      <ConfirmDialog
        open={confirmRevoke}
        title="Révoquer l’accès portail"
        message="Le compte de connexion sera supprimé. L’acteur, ses fiches et l’historique de ses soumissions restent intacts."
        confirmLabel="Révoquer"
        cancelLabel="Annuler"
        busy={revoke.isPending}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
```

⚠ Vérifier l'API réelle de `ConfirmDialog` du dossier `components/common` (props exactes) avant transcription — copier l'usage de `ModerationPage.tsx`.

- [ ] **Step 4 : Monter dans `CrmActorFiche.tsx`** — dans le rail droit (`<aside className="crm-actor-grid__side …">`), juste APRÈS `<CrmActorCard …/>` (toujours visible, comme la carte acteur — hors de la région repliable) :

```tsx
          <CrmActorPortalAccess
            actorId={actorId}
            canWrite={canWrite}
            emailChannels={channels.filter((c) => c.kindCode === 'email').map((c) => c.value)}
          />
```

⚠ Ouvrir le type des `channels` du snapshot (`listActorCrm`) pour les noms exacts de champs (`kindCode` / `kind_code` / `kind`) — utiliser ce qui existe.

- [ ] **Step 5 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/crm/CrmActorPortalAccess.test.tsx && npm run typecheck
git add src/features/crm src/services/actor-access.ts
git commit -m "feat(front): bloc Accès portail sur la fiche prestataire CRM"
```

---

### Task 17 : Front — modération : vue groupée par soumission + D9

**Files :**
- Modify: `bertel-tourism-ui/src/services/moderation.ts` (+ types domain)
- Modify: `bertel-tourism-ui/src/types/domain.ts` (PendingChangeItem + champs)
- Modify: `bertel-tourism-ui/src/views/ModerationPage.tsx`
- Test: `bertel-tourism-ui/src/views/ModerationPage.test.tsx` (étendre)

**Interfaces :**
- Consumes: RPCs D9 (Task 7).
- Produces:
  - `PendingChangeItem` gagne `submissionId?: string | null`, `submissionNote?: string | null`, `actorLabel?: string | null`, `manualApply?: boolean`.
  - `approvePendingChange(id, reviewNote, appliedManually = false)` (3e arg → `p_applied_manually`).
  - `approveFicheSubmission(submissionId, reviewNote, includeManual)` / `rejectFicheSubmission(submissionId, reviewNote)`.
  - ModerationPage : lignes AVEC `submissionId` groupées sous un en-tête de soumission (acteur, note, « Tout approuver » avec case « inclure les sections reportées manuellement », « Tout rejeter » motif obligatoire) ; sur une ligne `manualApply`, Approuver ouvre une confirmation « Je l'ai reportée dans l'éditeur » → `appliedManually=true`. Lignes sans soumission : affichage plat inchangé.

- [ ] **Step 1 : Étendre les tests, ROUGE.** Ajouter à `ModerationPage.test.tsx` :

```tsx
  const SUB_ITEMS: PendingChangeItem[] = [
    { ...ITEM, id: 'pc-a', submissionId: 'sub-1', submissionNote: 'Tarifs à jour',
      actorLabel: 'Marie Payet', manualApply: true, field: 'Contacts' },
    { ...ITEM, id: 'pc-b', submissionId: 'sub-1', actorLabel: 'Marie Payet',
      manualApply: false, field: 'Horaires' },
  ];

  it('D9 : groupe par soumission avec Tout approuver / Tout rejeter', async () => {
    mock.listPendingChanges.mockResolvedValue(SUB_ITEMS);
    renderPage();
    expect(await screen.findByText(/Marie Payet/)).toBeInTheDocument();
    expect(screen.getByText(/Tarifs à jour/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver la soumission/ });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-1', null, false));
  });

  it('D9 : approbation unitaire d’un manual_apply exige l’attestation', async () => {
    mock.listPendingChanges.mockResolvedValue([SUB_ITEMS[0]]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Approuver$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver la suggestion/ });
    // La confirmation d'un manual_apply porte l'attestation explicite.
    expect(dialog).toHaveTextContent(/reportée dans l.éditeur/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(mock.approvePendingChange).toHaveBeenCalledWith('pc-a', null, true));
  });
```

et déclarer `mock.approveFicheSubmission` / `mock.rejectFicheSubmission` dans le `beforeEach` (ils n'existent pas encore → rouge TS).

- [ ] **Step 2 : Implémenter.**

`types/domain.ts` — ajouter à `PendingChangeItem` :

```ts
  // 18a/D9 — groupage par soumission du portail acteur (null pour les propositions internes §122).
  submissionId?: string | null;
  submissionNote?: string | null;
  actorLabel?: string | null;
  manualApply?: boolean;
```

`services/moderation.ts` — dans `parsePendingChange`, ajouter :

```ts
    submissionId: readNullableString(row.submission_id),
    submissionNote: readNullableString(row.submission_note),
    actorLabel: readNullableString(row.actor_label),
    manualApply: row.manual_apply === true,
```

remplacer `approvePendingChange` et ajouter les deux RPCs groupés :

```ts
export async function approvePendingChange(
  id: string,
  reviewNote: string | null = null,
  appliedManually = false,
): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('approve_pending_change', {
    p_id: id,
    p_review_note: reviewNote,
    p_applied_manually: appliedManually,
  });
  if (error) {
    throw mapDatabaseError(error, 'Approbation impossible.');
  }
}

export async function approveFicheSubmission(
  submissionId: string,
  reviewNote: string | null = null,
  includeManual = false,
): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('approve_fiche_submission', {
    p_submission_id: submissionId,
    p_review_note: reviewNote,
    p_include_manual: includeManual,
  });
  if (error) {
    throw mapDatabaseError(error, 'Approbation de la soumission impossible.');
  }
}

export async function rejectFicheSubmission(submissionId: string, reviewNote: string): Promise<void> {
  if (!reviewNote || reviewNote.trim().length === 0) {
    throw new Error('Un motif de refus est obligatoire.');
  }
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('reject_fiche_submission', {
    p_submission_id: submissionId,
    p_review_note: reviewNote,
  });
  if (error) {
    throw mapDatabaseError(error, 'Refus de la soumission impossible.');
  }
}
```

(Re-exporter les deux nouvelles fonctions depuis `services/rpc.ts` comme les existantes — chercher la ligne `export … from './moderation'` et compléter.)

`ModerationPage.tsx` — restructurer le rendu :
1. Grouper : `const groups = groupBySubmission(items)` — helper local qui rend `{submissions: Array<{id, note, actorLabel, objectName, items}>, loose: PendingChangeItem[]}` (préserver l'ordre serveur).
2. Chaque groupe = un panneau : en-tête (`objectName`, `actorLabel`, note, date) + boutons « Tout approuver » / « Tout rejeter » (visibles seulement si ≥1 item pending) + la liste de ses `split-card` existantes.
3. « Tout approuver » → `ConfirmDialog` titre « Approuver la soumission » avec case à cocher (state local `includeManual`) libellée « Inclure les sections à reporter manuellement (j'atteste les avoir reportées) » → `approveFicheSubmission(id, null, includeManual)`.
4. « Tout rejeter » → même modal motif que l'unitaire, cible la soumission → `rejectFicheSubmission(id, note)`.
5. Unitaire : le `ConfirmDialog` d'approbation existant gagne, quand `item.manualApply`, le texte « Cette section n'est pas applicable automatiquement : confirmez que vous l'avez reportée dans l'éditeur. » et appelle `approvePendingChange(id, null, true)` ; sinon comportement inchangé (`…, null, false` — le 3e paramètre a un défaut, l'appel existant `approvePendingChange(id, null)` reste valide, l'assertion du vieux test `toHaveBeenCalledWith('pc-1', null)` doit être mise à jour en `('pc-1', null, false)` SEULEMENT si l'implémentation passe l'argument explicitement — sinon la laisser).
6. Invalidation : les mutations groupées invalident `['pending-changes']` ET `['crm-tasks']` (la tâche passe done via le trigger).

- [ ] **Step 3 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/views/ModerationPage.test.tsx src/services/moderation.test.ts && npm run typecheck
git add src/views/ModerationPage.tsx src/services/moderation.ts src/services/rpc.ts src/types/domain.ts src/views/ModerationPage.test.tsx
git commit -m "feat(front): modération groupée par soumission + attestation manuelle (D9)"
```

---

### Task 18 : Front — notifications acteur + e-mail de résolution + drain

**Files :**
- Modify: `bertel-tourism-ui/src/services/notifications.ts` (kind union + payload)
- Modify: `bertel-tourism-ui/src/components/layout/NotificationDrawer.tsx` (libellé + navigation par kind — le drawer reste back-office ; **pas de cloche dans le portail en v1**, révision 2026-09-02 : le retour vers le prestataire = e-mail + badges de l'accueil)
- Create: `bertel-tourism-ui/src/emails/SubmissionReviewedEmail.ts`
- Modify: `bertel-tourism-ui/src/app/api/crm/notify-drain/route.ts` (branche par kind)
- Test: `bertel-tourism-ui/src/emails/SubmissionReviewedEmail.test.ts` + extension du test du drain s'il existe (`ls src/app/api/crm/notify-drain/*.test.ts`)

- [ ] **Step 1 : Tests ROUGE.** `SubmissionReviewedEmail.test.ts` :

```ts
import { renderSubmissionReviewedEmailHtml, submissionReviewedEmailSubject } from './SubmissionReviewedEmail';

describe('SubmissionReviewedEmail', () => {
  const data = { objectName: 'Villa Vanille', outcome: 'approved' as const, recipientName: 'Marie', appUrl: 'https://app/espace' };
  it('sujet + issue en français', () => {
    expect(submissionReviewedEmailSubject(data)).toContain('Villa Vanille');
    expect(renderSubmissionReviewedEmailHtml(data)).toContain('validées');
  });
  it('échappe les données DB', () => {
    expect(renderSubmissionReviewedEmailHtml({ ...data, objectName: '<img>' })).not.toContain('<img>');
  });
  it('salutation impersonnelle si nom absent', () => {
    expect(renderSubmissionReviewedEmailHtml({ ...data, recipientName: null })).toContain('Bonjour,');
  });
});
```

- [ ] **Step 2 : Implémenter.**

`notifications.ts` :

```ts
export type AppNotificationKind = 'crm_task_assigned' | 'fiche_submission_reviewed';
```

et dans `parseAppNotification`, remplacer le fallback de kind par une validation stricte + porter le payload :

```ts
  const kind = readString(record.kind);
  if (kind !== 'crm_task_assigned' && kind !== 'fiche_submission_reviewed') return null;
```

(+ champs `outcome: readNullableString(record.outcome)` et `submissionId: readNullableString(record.submission_id)` si `list_my_notifications` les émet — VÉRIFIER le corps du RPC live ; s'il n'émet pas le payload, ajouter au Step 2 de la Task 8 les clés `outcome`/`submission_id` dans `api.list_my_notifications` — même méthode « corps live + delta » — et re-déployer via `execute_sql`).

`NotificationDrawer.tsx` :

```ts
export function notificationLabel(notification: AppNotification): string {
  if (notification.kind === 'fiche_submission_reviewed') {
    const outcomes: Record<string, string> = {
      approved: 'validées', rejected: 'refusées', partial: 'en partie validées',
    };
    return `Vos modifications de « ${notification.objectName ?? 'votre fiche'} » ont été ${outcomes[notification.outcome ?? ''] ?? 'vérifiées'}`;
  }
  const who = notification.createdByName ?? 'Quelqu’un';
  const title = notification.taskTitle ?? 'une tâche';
  return `${who} vous a assigné « ${title} »`;
}
```

et dans `openTask`, brancher la destination :

```ts
    if (notification.kind === 'fiche_submission_reviewed') {
      router.push('/espace');
      return;
    }
```

(Révision 2026-09-02 : AUCUNE cloche ni `NotificationDrawer` dans `PortalShell` — `useNotificationInbox` toaste « Nouvelle tâche assignée » pour tout kind et `openTask` pousse `/crm?tab=taches` ; le prestataire reçoit l'e-mail ci-dessous et voit l'état sur `/espace`. Le branchement `openTask → /espace` reste utile pour un membre d'équipe qui serait aussi acteur.)

`SubmissionReviewedEmail.ts` — même facture que `TaskAssignedEmail.ts` (tableaux, styles inline, `escapeHtml`, salutation gardée par `trim()`) avec :

```ts
export interface SubmissionReviewedEmailData {
  objectName: string;
  outcome: 'approved' | 'rejected' | 'partial';
  recipientName: string | null;
  appUrl: string; // lien absolu vers /espace
}
export function submissionReviewedEmailSubject(data: SubmissionReviewedEmailData): string {
  const outcomes = { approved: 'validées', rejected: 'refusées', partial: 'en partie validées' } as const;
  return `Vos modifications ont été ${outcomes[data.outcome]} — ${data.objectName}`;
}
```

corps : bandeau « Fiche vérifiée », l'issue en clair, CTA « Ouvrir mon espace » vers `appUrl`, mention « détail et motifs dans votre espace » (les motifs de refus ne partent PAS par e-mail — ils se lisent authentifié).

`notify-drain/route.ts` — dans la boucle d'envoi, brancher sur `row.kind` :

```ts
    const kind = str(row.kind) || 'crm_task_assigned';
    try {
      if (kind === 'fiche_submission_reviewed') {
        const outcome = str(row.outcome);
        const reviewData: SubmissionReviewedEmailData = {
          objectName: str(row.object_name) || 'Votre fiche',
          outcome: outcome === 'rejected' || outcome === 'partial' ? outcome : 'approved',
          recipientName: nstr(row.recipient_name),
          appUrl: `${origin}/espace`,
        };
        await sendMail({ to, subject: submissionReviewedEmailSubject(reviewData),
          html: renderSubmissionReviewedEmailHtml(reviewData) });
      } else {
        …(bloc TaskAssignedEmail existant inchangé)…
      }
      sent.push(id);
    } catch (err) { … }
```

- [ ] **Step 3 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/emails/SubmissionReviewedEmail.test.ts src/services/notifications.test.ts && npm run typecheck
git add src/emails src/services/notifications.ts src/components/layout/NotificationDrawer.tsx src/app/api/crm/notify-drain
git commit -m "feat(front): notification + e-mail de résolution vers l'acteur"
```

(Si `src/services/notifications.test.ts` n'existe pas, créer un test minimal du parse du nouveau kind.)

---

### Task 19 : Front — chip kanban + réglage de la matrice dans /settings

**Files :**
- Modify: `bertel-tourism-ui/src/services/crm.ts` (parse `extra`)
- Modify: `bertel-tourism-ui/src/types/domain.ts` (CrmTask.extra)
- Modify: `bertel-tourism-ui/src/features/crm/CrmTaches.tsx` (chip + lien modération)
- Create: `bertel-tourism-ui/src/features/orgs/ActorSectionVisibilityForm.tsx`
- Create: `bertel-tourism-ui/src/services/actor-visibility.ts`
- Modify: `bertel-tourism-ui/src/views/settings-nav.ts` + `bertel-tourism-ui/src/views/SettingsPage.tsx`
- Test: `bertel-tourism-ui/src/features/orgs/ActorSectionVisibilityForm.test.tsx`

- [ ] **Step 1 : Chip kanban.** `types/domain.ts` : ajouter `extra?: Record<string, unknown> | null;` à `CrmTask`. `services/crm.ts` (`parseCrmTask`) : `extra: (record.extra && typeof record.extra === 'object') ? record.extra as Record<string, unknown> : null,`. `CrmTaches.tsx` (`renderTicket`, à côté du badge interaction liée) :

```tsx
          {task.extra?.kind === 'fiche_verification' && (
            <button
              type="button"
              className="pill-mini"
              title="Soumission du portail acteur — ouvrir la modération"
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/moderation?object=${encodeURIComponent(task.objectId)}`);
              }}
            >
              Vérification de fiche
            </button>
          )}
```

(`useRouter` est peut-être déjà importé — vérifier ; sinon l'ajouter.) Côté `/moderation`, lire `?object=` : dans `ModerationPage.tsx`, initialiser un state `objectFilter` depuis `useSearchParams()` et le passer en 2e argument de `listPendingChanges(status, objectFilter)` (le RPC le supporte déjà). ⚠ `useSearchParams` exige un boundary `<Suspense>` — le wrapper de route `(main)/moderation/page.tsx` en a peut-être déjà un ; vérifier.

- [ ] **Step 2 : Service + formulaire matrice.** `actor-visibility.ts` : wrappers `getActorSectionVisibility(orgId, objectType)` → RPC `get_actor_section_visibility`, `setActorSectionVisibility(orgId, objectType, moduleId, visible)` → RPC `rpc_set_actor_section_visibility` (pattern portal.ts). `ActorSectionVisibilityForm.tsx` (révision 2026-09-02) : sélecteur de type d'objet (liste des codes types — réutiliser la source qu'emploie l'Explorer, chercher `OBJECT_TYPE` dans `src/utils/facets.ts` ou `src/config/`) ; puis **la liste des rubriques du portail** pour l'archétype de ce type (`PORTAL_RUBRICS` de `features/portal/portal-rubrics.ts`, filtrée par `archetypes` — ce sont les SEULES rubriques qu'un prestataire peut voir, inutile de lister 22 sections), un interrupteur par rubrique (clé = son `module`), la rubrique Photos affichée verrouillée « Lecture seule (v1) », et une ligne verrouillée « Gestion interne (juridique, publication, suivi, identifiants, relations, sous-lieux, photos) : jamais visible par les prestataires ». Chaque bascule appelle `setActorSectionVisibility` et invalide la query. Test RTL : rendu des interrupteurs par rubrique, plancher verrouillé, bascule → appel service avec le module id.

- [ ] **Step 3 : Settings.** `settings-nav.ts` : dans `buildOrgGroup`, ajouter

```ts
  if (options.canManageActorPortal) sections.push({ id: 'actor-portal', label: 'Portail acteurs', icon: KeyRound, isNew: true });
```

(+ `canManageActorPortal?: boolean` dans `SettingsNavOptions`, import `KeyRound` de lucide). `SettingsPage.tsx` : `const canManageActorPortal = (adminRank ?? 0) >= 30 && !!orgId;` (même calcul que le branding), l'ajouter aux `settingsNavOptions`, et monter le pane :

```tsx
      {activeSection === 'actor-portal' && canManageActorPortal && orgId && (
        <article className="panel-card">
          <section className="settings-pane">
            <div className="settings-pane__head">
              <div>
                <h2>Portail acteurs</h2>
                <p className="muted">Choisissez les rubriques que les prestataires peuvent remplir, par type de fiche. Les informations de gestion restent toujours internes.</p>
              </div>
            </div>
            <ActorSectionVisibilityForm orgId={orgId} />
          </section>
        </article>
      )}
```

- [ ] **Step 4 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/orgs/ActorSectionVisibilityForm.test.tsx && npm run typecheck
git add src/features/crm src/features/orgs src/services/crm.ts src/services/actor-visibility.ts src/types/domain.ts src/views/settings-nav.ts src/views/SettingsPage.tsx src/views/ModerationPage.tsx
git commit -m "feat(front): chip vérification de fiche + réglage du portail acteurs (/settings)"
```

---

### Task 20 : Vérification finale + E2E manuel + documentation

**Files :**
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (tableau de sabotage 18a complété)
- Modify: `CLAUDE.md` du repo SI un invariant nouveau mérite d'y vivre (le plancher dur, la règle « approve attesté »)

- [ ] **Step 0 : Prérequis de mise en service (révision 2026-09-02) — AUCUNE invitation de prestataire avant que les six soient verts**

1. **18a déployée avec `p_applied_manually` (Task 7)** : 5 des 7 rubriques sont `manual_apply` et l'`approve_pending_change` déployé aujourd'hui refuse `rpc NULL` (22023) — un envoi contenant coordonnées/présentation/tarifs/capacité/activité ne pourrait JAMAIS se résoudre et bloquerait la fiche pour toujours (une seule vérification ouverte).
2. **Task 10 fusionnée** (rôle `actor` accepté par `normalizeRole`, `USER_ROLE_LABELS_FR`, routage) — sinon tout compte acteur bricke sur `SessionScreen`.
3. **17i-17l dans `ci_fresh_apply.sql` ET en prod** (re-routage §1.5 de `current_user_extended_object_ids`) — sinon les 25 lectures d'enrichissement reviennent vides et les rubriques disparaissent. **Preuve de parité** : charger la MÊME fiche en acteur et en superuser et asserter l'égalité byte-à-byte de `draft.openings` / `draft.characteristics` / `draft.capacityPolicies` (`unavailableReason` null) — une lecture partielle + un writer « remplace tout » effacerait le reste à l'approbation.
4. **Leg `canonical_description` sur le chemin RÉEL** : `getObjectResource` appelle `api.get_object_with_deep_data` d'abord (§213) — vérifier avec un JWT acteur que la présentation existante arrive dans `descriptions.object`, sinon la rubrique montre des champs vides et un report manuel effacerait le texte.
5. **Canaux publics de l'ORG publisher saisis** (e-mail + téléphone) — en prod, 0/2 ORG en ont : sans eux, « Envoyer mes photos » et « Signaler une erreur » n'ont pas de repli.
6. **Chaque vérificateur de `list_object_verifier_ids` a aussi l'écriture canonique** (`edit_canonical_when_publisher` via sa matrice de rôle) — sinon les rubriques auto (horaires, équipements) échouent en 42501 au re-dispatch AS THE CALLER et « un clic » est faux pour lui.

Et une contrainte produit à consigner : **une seule vérification ouverte par fiche bloque le prestataire jusqu'à la réponse de l'office** — l'OTI s'engage sur un délai (proposition : 5 jours ouvrés, copie « en général sous une semaine ») et surveille l'âge des vérifications en attente.

- [ ] **Step 1 : Suites complètes**

```bash
cd bertel-tourism-ui && npm run typecheck && npm run test:run
```

Attendu : 0 erreur TS, toutes suites vertes (⚠ mémoire « jest worktree imbriqué » : si des suites doublées apparaissent, filtrer avec un motif positionnel, jamais `--testPathIgnorePatterns`).

- [ ] **Step 2 : Test SQL complet contre la base migrée** (`execute_sql`, BEGIN…ROLLBACK) : blocs A→I verts.

- [ ] **Step 3 : Parcours E2E manuel sur données réelles** (doctrine « prefer real DB data », navigateur intégré) :
1. Choisir un acteur de test réel avec canal e-mail ; depuis la fiche prestataire CRM : Inviter → vérifier l'e-mail reçu → `/set-password` → atterrissage `/espace` (une seule fiche ⇒ ouverture directe de la fiche).
2. Vérifier le confinement : taper `/crm`, `/explorer`, `/moderation` à la main → renvoi `/espace` ; appeler `list_crm_tasks` en tant qu'acteur (console réseau) → `[]`.
3. **Sur un téléphone réel** (ou émulation 375 px) : ouvrir « Vos coordonnées » → changer le téléphone → Valider ; ouvrir « Vos horaires » (RES) ou « Accueil » (HEB) → Valider ; la barre « 2 rubriques modifiées » apparaît → « Envoyer à l'office » → fenêtre (régime par rubrique visible) → Envoyer → carte « Merci ! » ; recharger : rubriques « Envoyé — en vérification », barre inactive avec la phrase. Côté éditeur : tâche dans le kanban (chip), notification cloche, e-mail reçu ; `/moderation` : groupe de soumission visible **avec un diff lisible** (« Téléphone : … → … », D12).
4. Approuver l'auto-dispatch (horaires), attester le manuel (coordonnées) → soumission résolue, tâche done, e-mail acteur ; `/espace` : « À jour ». Puis rejeter une rubrique sur un second envoi → « À reprendre » + carte « Retours de l'office » avec le motif et « Corriger ».
5. Révoquer l'accès → connexion refusée, acteur CRM intact.
6. Nettoyer les données de test (soumissions/tâche créées) OU les conserver comme premières données réelles si le PO valide.

- [ ] **Step 4 : Compléter le runbook** (tableau de sabotage 18a avec les résultats du Step 3) + commit final

```bash
git add docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "docs(sql): runbook 18a — parcours de sabotage complété"
```

---

## Self-review du plan (fait à l'écriture — points de vigilance pour l'exécutant)

1. **Couverture spec** : D1→D12 tous portés (D1: T15-16 ; D2: T2+T5 ; D3: T4-5 ; D4/D5: T3-4+T13+T19 ; D6: T3+T5+T14 ; D7: T2 ; D8: T1+T10 ; D9: T7+T17 ; **D10: T12-14 ; D11: T6 (`office_email`) + T14 (Photos lecture seule) ; D12: T13 (`describePortalChange`) + T14 (envoi)**). Hors périmètre v1 (spec §9) : rien ici n'implémente le téléversement de photos, l'édition des coordonnées par l'acteur, le branding par ORG du portail, le realtime, ni l'extension de la whitelist — c'est voulu.
2. **Types cohérents** : `SubmitPendingChangeInput` (camelCase, service moderation) est traduit en snake_case UNE fois, dans `submitActorFiche` (T11) — `buildContributorSubmission` reste intact ; le portail ne surcharge que `metadata.field/before/after` (D12) et un test épingle que `section/rpc/manual_apply/payload` restent byte-identiques. `ObjectEditPage` n'est PAS modifié par ce chantier (révision 2026-09-02). Les 3 nouveaux champs de `PendingChangeItem` sont optionnels (compat mocks démo).
3. **Points à VÉRIFIER sur pièce à l'exécution** (signalés dans leurs tasks) : la lecture des `params` du wrapper de route éditeur (T14) ; la signature de `useObjectWorkspaceQuery`/`loadObjectWorkspace` pour forcer `langPrefs ['fr']` (T14) ; l'export de `TYPE_LABEL` (T12) ; les formes exactes des tranches `contacts`/`openings`/`capacityPolicies`/`pricing` dans `object-workspace-parser.ts` (T13 — les tests sont écrits `as never`, les implémentations doivent lire les vrais types) ; la forme des `channels` de `listActorCrm` (T16) ; l'API exacte de `ConfirmDialog`/`Modal` (T16-17). Dans chaque cas : copier l'existant, le plan donne l'intention et le squelette.
5. **Décisions PO en attente, encapsulées dans des constantes** (le code n'attend pas) : `PORTAL_AMENITY_CODES` (≤ 12 équipements par type), `PORTAL_PRICE_UNIT` (par_nuit / par_couvert / par_personne), D11 (photos) et D12 (diff lisible) — les changer ne touche qu'une constante ou un `describePortalChange`.
4. **Pièges DB rappelés dans les tasks** : DROP obligatoire pour changer une signature/type de retour (T7) ; re-poser les GRANT après DROP (T7) ; kind CHECK + index + claim/ack élargis ENSEMBLE (T3+T8) ; §227 possiblement absent de ci_fresh_apply (T9 Step 1) ; créneau 18a à re-vérifier (T9).

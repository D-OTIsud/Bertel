# Portail acteur : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ouvrir aux acteurs (prestataires) un portail dédié `/espace` où chacun ne voit que les fiches de ses objets, les remplit via l'éditeur existant en mode contributeur forcé, et où chaque « Soumettre » crée transactionnellement une soumission + une tâche CRM de vérification multi-assignée aux éditeurs — avec validation totale ou partielle côté modération (D9).

**Architecture :** Une seule migration SQL (« 18a ») porte tout le socle : persona `actor` (4e valeur du CHECK), activation de `app_user_profile.actor_id`, portée de lecture dédiée branchée dans `current_user_extended_object_ids()`, fermeture de `is_object_owner` pour les acteurs (D7), tables `fiche_submission` + `org_actor_module_visibility`, RPC transactionnel `submit_actor_fiche`, RPCs de validation groupée/attestée (D9), trigger de résolution, extension outbox e-mail. Le front ajoute un groupe de routes `(portal)` hors AppShell, une variante `surface='portal'` d'`ObjectEditPage`, la gestion d'accès depuis la fiche prestataire CRM, et la vue groupée par soumission dans ModerationPage.

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
-- plus les modules READONLY de l'éditeur (distribution, provider). Fonction plutôt que
-- table : non paramétrable PAR CONSTRUCTION.
CREATE OR REPLACE FUNCTION api.actor_portal_floor_modules()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['legal','provider-follow-up','publication','sync-identifiers','distribution','provider'];
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
    RAISE EXCEPTION 'Une vérification est déjà en cours pour cette fiche' USING ERRCODE = '23505';
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
  - `api.list_my_portal_fiches() → jsonb` — `[{id, name, object_type, status, updated_at, open_submission:{id, submitted_at}|null, last_resolved:{status, resolved_at}|null}]`, persona acteur uniquement, portée portail.
  - `api.list_my_submissions(p_limit int DEFAULT 20) → jsonb` — auto-scopé `submitted_by = auth.uid()` (jamais de paramètre destinataire) : `[{id, object_id, object_name, note, status, submitted_at, resolved_at, changes:[{id, field, status, review_note, reviewer_label}]}]`.
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
        ORDER BY fs.resolved_at DESC NULLS LAST LIMIT 1)
    ) ORDER BY o.name)
    FROM object o
    WHERE o.id IN (SELECT api.current_user_portal_object_ids())
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION api.list_my_submissions(p_limit int DEFAULT 20)
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
REVOKE ALL ON FUNCTION api.list_my_submissions(int)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_my_actor_profile()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_portal_fiches()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_my_submissions(int)  TO authenticated, service_role;
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
- Modify: `bertel-tourism-ui/src/hooks/useBootstrapSession.ts` (normalizeRole + court-circuit des sondes)
- Modify: `bertel-tourism-ui/src/lib/auth-routing.ts`
- Modify: `bertel-tourism-ui/src/app/(main)/layout.tsx`
- Test: `bertel-tourism-ui/src/lib/auth-routing.test.ts` (créer s'il n'existe pas — vérifier avec `ls src/lib/auth-routing.test.ts`)

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

- [ ] **Step 3 : Vérifier**

```bash
cd bertel-tourism-ui && npm run test:run -- src/lib/auth-routing.test.ts && npm run typecheck
```

Attendu : PASS + exit 0. Si le typecheck révèle des switch exhaustifs sur `UserRole` cassés ailleurs (ex. `user-role-label`), compléter le cas `actor` avec le libellé `'Prestataire'`.

- [ ] **Step 4 : Commit**

```bash
git add src/types/domain.ts src/lib/auth-routing.ts src/hooks/useBootstrapSession.ts "src/app/(main)/layout.tsx" src/lib/auth-routing.test.ts
git commit -m "feat(front): persona actor — types, bootstrap, routage portail"
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
  lastResolved: { status: string; resolvedAt: string | null } | null; }
export interface MySubmissionChange { id: string; field: string; status: string;
  reviewNote: string | null; reviewerLabel: string | null; }
export interface MySubmission { id: string; objectId: string; objectName: string;
  note: string | null; status: string; submittedAt: string; resolvedAt: string | null;
  changes: MySubmissionChange[]; }
export interface PortalVisibility { floorModules: string[]; maskedModules: string[]; }
export async function listMyPortalFiches(): Promise<PortalFiche[]>
export async function listMySubmissions(limit?: number): Promise<MySubmission[]>
export async function getPortalSectionVisibility(objectId: string): Promise<PortalVisibility>
export async function submitActorFiche(objectId: string, changes: SubmitPendingChangeInput[], note: string | null):
  Promise<{ submissionId: string; taskId: string; changeCount: number; assigneeCount: number }>
```

- [ ] **Step 1 : Écrire le test, lancer ROUGE**

`src/services/portal.test.ts` (mêmes conventions que `moderation.test.ts` : mocker `getApiClient`) :

```ts
import { getApiClient } from '../lib/supabase';
import { listMyPortalFiches, submitActorFiche, getPortalSectionVisibility } from './portal';

jest.mock('../lib/supabase');
const mockRpc = jest.fn();
(getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc: mockRpc }) });

beforeEach(() => { mockRpc.mockReset(); });

describe('services/portal', () => {
  it('parse les fiches du portail (défensif : ligne malformée ignorée)', async () => {
    mockRpc.mockResolvedValue({ data: [
      { id: 'HOT1', name: 'Villa', object_type: 'HOT', status: 'published', updated_at: '2026-09-01',
        open_submission: { id: 's1', submitted_at: '2026-08-28' }, last_resolved: null },
      { pas_un_id: true },
    ], error: null });
    const fiches = await listMyPortalFiches();
    expect(fiches).toHaveLength(1);
    expect(fiches[0]).toMatchObject({ id: 'HOT1', openSubmission: { id: 's1' } });
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
    });
  }
  return fiches;
}

export interface MySubmissionChange {
  id: string;
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

export async function listMySubmissions(limit = 20): Promise<MySubmission[]> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('list_my_submissions', { p_limit: limit });
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

**Files :**
- Create: `bertel-tourism-ui/src/app/(portal)/layout.tsx`
- Create: `bertel-tourism-ui/src/app/(portal)/espace/page.tsx`
- Create: `bertel-tourism-ui/src/components/portal/PortalShell.tsx`
- Create: `bertel-tourism-ui/src/views/PortalHomePage.tsx`
- Test: `bertel-tourism-ui/src/views/PortalHomePage.test.tsx`

**Interfaces :**
- Consumes: `listMyPortalFiches`, `listMySubmissions` (Task 11) ; `useThemeStore` (branding) ; `useSessionStore`.
- Produces: routes `/espace` (accueil) ; `PortalShell` réutilisé par la fiche (Task 13).

- [ ] **Step 1 : Test ROUGE**

`src/views/PortalHomePage.test.tsx` (conventions Sidebar.test : `useSessionStore.setState`, mock du service) :

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalHomePage } from './PortalHomePage';
import { useSessionStore } from '../store/session-store';
import * as portal from '../services/portal';

jest.mock('../services/portal');
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
const mocked = portal as jest.Mocked<typeof portal>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PortalHomePage /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ status: 'ready', role: 'actor', userId: 'u1', userName: 'Marie Payet', demoMode: false } as never);
  mocked.listMySubmissions.mockResolvedValue([]);
});

describe('PortalHomePage', () => {
  it('affiche les fiches avec leur état', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([
      { id: 'HOT1', name: 'Villa Vanille', objectType: 'HOT', status: 'published', updatedAt: null,
        openSubmission: { id: 's1', submittedAt: '2026-08-28T00:00:00Z' }, lastResolved: null },
      { id: 'HOT2', name: 'Kayak Sud', objectType: 'ASC', status: 'published', updatedAt: null,
        openSubmission: null, lastResolved: { status: 'approved', resolvedAt: '2026-08-21T00:00:00Z' } },
    ]);
    renderPage();
    expect(await screen.findByText('Villa Vanille')).toBeInTheDocument();
    expect(screen.getByText(/Vérification en cours/)).toBeInTheDocument();
    expect(screen.getByText('Kayak Sud')).toBeInTheDocument();
    expect(screen.getByText(/À jour/)).toBeInTheDocument();
  });
  it('état vide honnête', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Aucune fiche/)).toBeInTheDocument();
  });
});
```

```bash
cd bertel-tourism-ui && npm run test:run -- src/views/PortalHomePage.test.tsx
```

- [ ] **Step 2 : Implémenter les 4 fichiers**

`src/app/(portal)/layout.tsx` (gabarit du gate `(main)`, PortalShell à la place d'AppShell) :

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { PortalShell } from '@/components/portal/PortalShell';
import { getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
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
    // tape /espace retourne à son back-office (ergonomie ; RLS reste la barrière).
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

// Chrome du portail acteur (18a) — délibérément MINIMAL : logo + nom de marque (thème
// runtime, comme AuthShell), nom du prestataire, déconnexion, pied légal. AUCUNE nav
// back-office (pas d'AppShell, pas de ⌘K, pas de tiroirs) : le portail EST le périmètre.
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const userName = useSessionStore((state) => state.userName);

  async function signOut() {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="portal-shell">
      <header className="portal-shell__bar">
        <div className="portal-shell__brand">
          {logoUrl ? <img src={logoUrl} alt="" /> : null}
          <span>{brandName} · Espace prestataire</span>
        </div>
        <div className="portal-shell__user">
          <span>{userName}</span>
          <button type="button" className="ghost-button" onClick={() => void signOut()} aria-label="Se déconnecter">
            <LogOut size={14} aria-hidden /> Déconnexion
          </button>
        </div>
      </header>
      <main className="portal-shell__main">{children}</main>
      <footer className="auth-legal">
        <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">Confidentialité</a>
        <span className="auth-legal__sep" aria-hidden="true">·</span>
        <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">Conditions d’utilisation</a>
      </footer>
    </div>
  );
}
```

Styles : ajouter dans `src/styles.css` un petit bloc `.portal-shell` (header sticky, max-width 960px pour le main, marges) — s'inspirer des classes `.auth-*` existantes ; PAS de nouveau fichier CSS.

`src/views/PortalHomePage.tsx` :

```tsx
'use client';

// Accueil du portail acteur (18a, maquette écran 1) : les fiches du prestataire avec
// leur état de vérification. La complétude est chargée PARESSEUSEMENT par carte
// (usePrefetchObjectWorkspace au survol) — jamais en rafale : le workspace coûte cher.
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { listMyPortalFiches, listMySubmissions, type PortalFiche } from '../services/portal';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonBlock } from '../components/common/SkeletonBlock';

function ficheBadge(fiche: PortalFiche): { label: string; className: string } {
  if (fiche.openSubmission) return { label: 'Vérification en cours', className: 'badge--info' };
  if (fiche.lastResolved?.status === 'rejected') return { label: 'À reprendre', className: 'badge--warn' };
  if (fiche.lastResolved) return { label: 'À jour', className: 'badge--ok' };
  return { label: 'À compléter', className: 'badge--warn' };
}

export function PortalHomePage() {
  const router = useRouter();
  const fichesQuery = useQuery({ queryKey: ['portal-fiches'], queryFn: listMyPortalFiches });
  const submissionsQuery = useQuery({ queryKey: ['portal-submissions'], queryFn: () => listMySubmissions(10) });

  if (fichesQuery.isLoading) return <SkeletonBlock lines={4} />;
  if (fichesQuery.isError) {
    return (
      <EmptyState mode="error" title="Vos fiches sont indisponibles"
        description={(fichesQuery.error as Error).message}
        action={{ label: 'Réessayer', onClick: () => fichesQuery.refetch() }} />
    );
  }
  const fiches = fichesQuery.data ?? [];
  const rejected = (submissionsQuery.data ?? []).filter((s) => s.status === 'rejected' || s.status === 'partial');

  return (
    <section className="portal-home">
      <h1>Vos fiches</h1>
      <p className="muted">
        Complétez vos informations, elles seront vérifiées par l’office avant publication.
      </p>
      {fiches.length === 0 ? (
        <EmptyState mode="coming-soon" title="Aucune fiche liée à votre compte"
          description="Contactez votre office de tourisme pour rattacher vos établissements." />
      ) : (
        <ul className="portal-home__list">
          {fiches.map((fiche) => {
            const badge = ficheBadge(fiche);
            return (
              <li key={fiche.id}>
                <button type="button" className="portal-fiche-card"
                  onClick={() => router.push(`/espace/fiches/${fiche.id}`)}>
                  <span className="portal-fiche-card__name">{fiche.name}</span>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                  <ChevronRight size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rejected.length > 0 && (
        <div className="portal-home__notes">
          <h2>Retours de l’office</h2>
          {rejected.map((submission) => (
            <article key={submission.id} className="panel-card">
              <strong>{submission.objectName}</strong>
              <ul>
                {submission.changes.filter((c) => c.reviewNote).map((change) => (
                  <li key={change.id}>{change.field} — {change.reviewNote}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

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

- [ ] **Step 3 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/views/PortalHomePage.test.tsx && npm run typecheck
git add "src/app/(portal)" src/components/portal src/views/PortalHomePage.tsx src/views/PortalHomePage.test.tsx src/styles.css
git commit -m "feat(front): portail /espace — shell dédié + accueil des fiches"
```

---

### Task 13 : Front — l'éditeur en mode portail

**Files :**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`
- Create: `bertel-tourism-ui/src/features/object-editor/portal-visibility.ts`
- Create: `bertel-tourism-ui/src/features/object-editor/shell/PortalTopbar.tsx`
- Create: `bertel-tourism-ui/src/app/(portal)/espace/fiches/[objectId]/page.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/portal-visibility.test.ts`

**Interfaces :**
- Consumes: `getPortalSectionVisibility` (Task 11) ; `MODULE_SECTION_NUMS` de `save-issues.ts` (ouvrir le fichier pour confirmer sa forme exacte avant d'écrire l'helper — c'est le mapping module → numéro de section de l'éditeur) ; `getRegisteredSections`, `MODE_ESSENTIAL`.
- Produces: `ObjectEditPage` accepte `surface?: 'backoffice' | 'portal'` (défaut `'backoffice'`, AUCUN changement de comportement back-office) ; helper `portalVisibleSectionNums(maskedModules, floorModules) → Set<string>` et `isModuleSubmittable(module, masked, floor) → boolean`.

- [ ] **Step 1 : Test de l'helper, ROUGE**

`portal-visibility.test.ts` :

```ts
import { portalVisibleSectionNums, isModuleSubmittable } from './portal-visibility';

describe('portal-visibility', () => {
  const floor = ['legal', 'provider-follow-up', 'publication', 'sync-identifiers', 'distribution', 'provider'];
  it('le plancher masque les sections Gestion (18/19/21/22)', () => {
    const visible = portalVisibleSectionNums([], floor);
    expect(visible.has('18')).toBe(false);
    expect(visible.has('19')).toBe(false);
    expect(visible.has('21')).toBe(false);
    expect(visible.has('22')).toBe(false);
    expect(visible.has('01')).toBe(true);
    expect(visible.has('04')).toBe(true);
  });
  it('un module masqué par la matrice retire sa section quand elle n’a plus de module visible', () => {
    const visible = portalVisibleSectionNums(['descriptions'], floor);
    expect(visible.has('04')).toBe(false);
  });
  it('isModuleSubmittable reflète plancher + matrice', () => {
    expect(isModuleSubmittable('descriptions', [], floor)).toBe(true);
    expect(isModuleSubmittable('descriptions', ['descriptions'], floor)).toBe(false);
    expect(isModuleSubmittable('legal', [], floor)).toBe(false);
  });
});
```

Note : le test « sa section » suppose que `descriptions` est le seul module de la section 04 — VÉRIFIER dans `MODULE_SECTION_NUMS` au moment d'écrire ; si la section 04 porte d'autres modules, adapter le test à un module réellement seul dans sa section.

- [ ] **Step 2 : Implémenter `portal-visibility.ts`**

```ts
// Visibilité des sections en mode portail (18a). La matrice serveur est par MODULE ;
// l'éditeur rend par SECTION. Le pont est MODULE_SECTION_NUMS (save-issues.ts) — la
// même table qui relie déjà erreurs de save et navigation. Une section reste visible
// tant qu'AU MOINS UN de ses modules l'est ; un module est soumis seulement s'il n'est
// ni au plancher ni masqué (le serveur revalide : ceci est de l'ergonomie).
import { MODULE_SECTION_NUMS } from './save-issues';
import type { WorkspaceModuleId } from '../../services/object-workspace';

function sectionsOf(module: WorkspaceModuleId): string[] {
  const value = MODULE_SECTION_NUMS[module];
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

export function isModuleSubmittable(
  module: WorkspaceModuleId,
  maskedModules: string[],
  floorModules: string[],
): boolean {
  return !maskedModules.includes(module) && !floorModules.includes(module);
}

export function portalVisibleSectionNums(
  maskedModules: string[],
  floorModules: string[],
): Set<string> {
  const visible = new Set<string>();
  (Object.keys(MODULE_SECTION_NUMS) as WorkspaceModuleId[]).forEach((module) => {
    if (!isModuleSubmittable(module, maskedModules, floorModules)) return;
    sectionsOf(module).forEach((num) => visible.add(num));
  });
  return visible;
}
```

(Si `MODULE_SECTION_NUMS` a une autre forme — p. ex. `Record<module, string>` strict — simplifier `sectionsOf` en conséquence ; le test guide.)

- [ ] **Step 3 : `PortalTopbar.tsx`**

```tsx
'use client';

// Barre du mode portail : PAS de publication, PAS de statut, PAS d'outils — seulement
// le retour, l'état du brouillon local et « Soumettre pour vérification » (D6).
import { ArrowLeft, Loader2 } from 'lucide-react';

interface PortalTopbarProps {
  objectName: string;
  dirtyCount: number;
  draftSavedAt: string | null;
  submitting: boolean;
  submitDisabledReason: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

export function PortalTopbar({
  objectName, dirtyCount, draftSavedAt, submitting, submitDisabledReason, onBack, onSubmit,
}: PortalTopbarProps) {
  const disabled = submitting || dirtyCount === 0 || submitDisabledReason !== null;
  return (
    <div className="edit-top portal-topbar">
      <button type="button" className="btn sm" onClick={onBack}>
        <ArrowLeft size={13} aria-hidden /> Vos fiches
      </button>
      <strong className="portal-topbar__name">{objectName}</strong>
      <span className="portal-topbar__draft muted">
        {draftSavedAt ? 'Brouillon local enregistré' : dirtyCount > 0 ? 'Modifications non soumises' : ''}
      </span>
      <button
        type="button"
        className="btn primary"
        disabled={disabled}
        title={submitDisabledReason ?? undefined}
        onClick={onSubmit}
      >
        {submitting ? (<><Loader2 size={13} className="motion-spin" aria-hidden /> Soumission…</>)
          : submitDisabledReason ?? 'Soumettre pour vérification'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4 : Brancher `surface` dans `ObjectEditPage.tsx`**

Modifications précises (le back-office ne change PAS de comportement — chaque branchement est conditionné) :

1. Signatures :

```tsx
export function ObjectEditPage({ objectId, surface = 'backoffice' }: { objectId: string; surface?: 'backoffice' | 'portal' }) {
```

et propager `surface` à `EditorReady` (`<EditorReady resource={data} objectId={objectId} meta={meta} surface={surface} />`, prop ajoutée à sa signature).

2. Dans `EditorReady`, après `const contributorMode = !canWriteCanonicalDirect;` :

```tsx
  const isPortal = surface === 'portal';
  // 18a — visibilité des sections en mode portail (plancher + matrice org×type).
  const visibilityQuery = useQuery({
    queryKey: ['portal-visibility', objectId],
    queryFn: () => getPortalSectionVisibility(objectId),
    enabled: isPortal,
    staleTime: 5 * 60 * 1000,
  });
  const maskedModules = visibilityQuery.data?.maskedModules ?? [];
  const floorModules = visibilityQuery.data?.floorModules ?? [];
  const visibleNums = useMemo(
    () => (isPortal ? portalVisibleSectionNums(maskedModules, floorModules) : null),
    [isPortal, maskedModules, floorModules],
  );
```

(imports : `useQuery` de `@tanstack/react-query`, `getPortalSectionVisibility` de `../../services/portal`, `portalVisibleSectionNums` du nouveau module.)

3. Filtrage des sections et de la nav — remplacer les deux memos :

```tsx
  const groups = useMemo(() => {
    const all = makeSections(meta.archetype);
    if (!visibleNums) return all;
    return all
      .map((group) => ({ ...group, items: group.items.filter((item) => visibleNums.has(item.num)) }))
      .filter((group) => group.items.length > 0);
  }, [meta.archetype, visibleNums]);
  const sections = useMemo(() => {
    const all = getRegisteredSections(meta.archetype);
    return visibleNums ? all.filter((section) => visibleNums.has(section.num)) : all;
  }, [meta.archetype, visibleNums]);
```

4. JSX : quand `isPortal`, remplacer `<EditorTopbar …/>` par `<PortalTopbar …/>` (les handlers viennent de la Task 14), passer `tools={[]}` à `EditorNav`, garder le bandeau contributeur avec un texte portail :

```tsx
      {contributorMode && (
        <div className="contributor-banner" role="note">
          {isPortal ? (
            <>Vos modifications seront <strong>vérifiées par l’office</strong> avant d’être publiées.</>
          ) : (
            <><strong>Mode contributeur</strong> — vos modifications ne s’appliquent pas directement :
            elles sont soumises à la modération de l’organisation avant publication.</>
          )}
        </div>
      )}
```

5. Route portail `src/app/(portal)/espace/fiches/[objectId]/page.tsx` (copier la forme du wrapper back-office `(main)/objects/[objectId]/edit/page.tsx`, en passant `surface="portal"`) :

```tsx
'use client';

import { use } from 'react';
import { ObjectEditPage } from '@/features/object-editor/ObjectEditPage';

export default function PortalFichePage({ params }: { params: Promise<{ objectId: string }> }) {
  const { objectId } = use(params);
  return <ObjectEditPage objectId={objectId} surface="portal" />;
}
```

⚠ Ouvrir d'abord `(main)/objects/[objectId]/edit/page.tsx` et répliquer EXACTEMENT sa façon de lire `params` (App Router : selon la version, `params` est un objet direct ou une Promise — copier l'existant, ne pas inventer).

- [ ] **Step 5 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/portal-visibility.test.ts && npm run typecheck
git add src/features/object-editor "src/app/(portal)"
git commit -m "feat(front): éditeur en mode portail — sections filtrées, topbar dédiée"
```

---

### Task 14 : Front — brouillon local + modal de soumission

**Files :**
- Create: `bertel-tourism-ui/src/features/object-editor/usePortalDraft.ts`
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/PortalSubmitModal.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` (handlers portail)
- Test: `bertel-tourism-ui/src/features/object-editor/usePortalDraft.test.ts`

**Interfaces :**
- Consumes: `editor` (`useObjectEditorState` : `draft`, `baseline`, `dirtySections`, `replaceModule`, `commitModules`) ; `buildContributorSubmission` ; `submitActorFiche` ; `isModuleSubmittable` ; `listMyPortalFiches` (état soumission ouverte — déjà dans le cache `['portal-fiches']`).
- Produces: brouillon localStorage par fiche (`portal-draft:<objectId>`) ; modal récap + message ; soumission en UN appel RPC.

- [ ] **Step 1 : Test du brouillon, ROUGE**

`usePortalDraft.test.ts` :

```ts
import { readPortalDraft, writePortalDraft, clearPortalDraft, baselineFingerprint } from './usePortalDraft';

describe('portal draft (localStorage)', () => {
  beforeEach(() => localStorage.clear());
  const baseline = { generalInfo: { name: 'Villa' } } as never;

  it('écrit puis relit un brouillon compatible', () => {
    writePortalDraft('HOT1', baseline, { descriptions: { chapo: 'x' } } as never);
    const draft = readPortalDraft('HOT1', baseline);
    expect(draft).toMatchObject({ descriptions: { chapo: 'x' } });
  });
  it('JETTE le brouillon si la fiche canonique a bougé (empreinte différente)', () => {
    writePortalDraft('HOT1', baseline, { descriptions: { chapo: 'x' } } as never);
    const moved = { generalInfo: { name: 'Villa Vanille' } } as never;
    expect(readPortalDraft('HOT1', moved)).toBeNull();
  });
  it('clear supprime', () => {
    writePortalDraft('HOT1', baseline, {} as never);
    clearPortalDraft('HOT1');
    expect(readPortalDraft('HOT1', baseline)).toBeNull();
  });
  it('empreinte stable', () => {
    expect(baselineFingerprint(baseline)).toBe(baselineFingerprint({ generalInfo: { name: 'Villa' } } as never));
  });
});
```

- [ ] **Step 2 : Implémenter `usePortalDraft.ts`**

```ts
// Brouillon LOCAL du portail (18a) : l'acteur ne peut rien écrire côté serveur avant
// « Soumettre » (D2/D6) — sans persistance locale, fermer l'onglet perdrait sa saisie.
// localStorage par fiche, versionné par une EMPREINTE de la baseline : si la fiche
// canonique a bougé depuis (approbation, édition interne), le brouillon est JETÉ avec
// bannière — jamais de merge silencieux (spec §7).
import { useEffect, useRef, useState } from 'react';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

const KEY_PREFIX = 'portal-draft:';
const DEBOUNCE_MS = 800;

/** Empreinte bon marché et stable de la baseline (djb2 sur le JSON). */
export function baselineFingerprint(baseline: ObjectWorkspaceModules): string {
  const text = JSON.stringify(baseline);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

interface StoredDraft {
  fingerprint: string;
  savedAt: string;
  draft: ObjectWorkspaceModules;
}

export function readPortalDraft(
  objectId: string,
  baseline: ObjectWorkspaceModules,
): ObjectWorkspaceModules | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + objectId);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft;
    if (stored.fingerprint !== baselineFingerprint(baseline)) {
      localStorage.removeItem(KEY_PREFIX + objectId);
      return null;
    }
    return stored.draft;
  } catch {
    return null; // stockage indisponible ou corrompu : on repart de la fiche serveur
  }
}

export function writePortalDraft(
  objectId: string,
  baseline: ObjectWorkspaceModules,
  draft: ObjectWorkspaceModules,
): void {
  try {
    const stored: StoredDraft = {
      fingerprint: baselineFingerprint(baseline),
      savedAt: new Date().toISOString(),
      draft,
    };
    localStorage.setItem(KEY_PREFIX + objectId, JSON.stringify(stored));
  } catch {
    // quota plein / stockage bloqué : le brouillon vit en mémoire, tant pis pour la reprise
  }
}

export function clearPortalDraft(objectId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + objectId);
  } catch {
    // rien à faire
  }
}

/**
 * Persistance automatique (débouncée) + restauration au montage. `restore` doit
 * réinjecter le brouillon dans l'éditeur (replaceModule par module) — fourni par
 * l'appelant pour ne pas coupler ce hook à la forme d'ObjectEditorState.
 */
export function usePortalDraft(
  objectId: string,
  baseline: ObjectWorkspaceModules,
  draft: ObjectWorkspaceModules,
  isDirty: boolean,
  restore: (saved: ObjectWorkspaceModules) => void,
): { draftSavedAt: string | null; draftDiscarded: boolean } {
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftDiscarded, setDraftDiscarded] = useState(false);
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(KEY_PREFIX + objectId);
      if (!raw) return;
      const saved = readPortalDraft(objectId, baseline);
      if (saved) {
        restore(saved);
        setDraftSavedAt((JSON.parse(raw) as StoredDraft).savedAt);
      } else {
        setDraftDiscarded(true); // il y AVAIT un brouillon, la fiche a bougé : on le dit
      }
    } catch {
      // stockage indisponible : rien à restaurer
    }
  }, [objectId, baseline, restore]);

  useEffect(() => {
    if (!isDirty) return undefined;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writePortalDraft(objectId, baseline, draft);
      setDraftSavedAt(new Date().toISOString());
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [objectId, baseline, draft, isDirty]);

  return { draftSavedAt, draftDiscarded };
}
```

- [ ] **Step 3 : `PortalSubmitModal.tsx`**

```tsx
'use client';

// Modal « Soumettre pour vérification » (D6, maquette écran 2 bas) : récap des sections
// modifiées + message facultatif pour l'office. La soumission part en UN RPC
// transactionnel — succès = tout est parti, échec = rien n'est parti.
import { useState } from 'react';
import { Modal } from '../../../components/common/Modal';

interface PortalSubmitModalProps {
  open: boolean;
  sectionLabels: string[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (note: string | null) => void;
}

export function PortalSubmitModal({ open, sectionLabels, submitting, error, onClose, onSubmit }: PortalSubmitModalProps) {
  const [note, setNote] = useState('');
  return (
    <Modal
      title="Soumettre pour vérification"
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      footer={
        <>
          <button type="button" className="ghost-button" onClick={onClose}>Annuler</button>
          <button type="button" className="primary-button" disabled={submitting}
            onClick={() => onSubmit(note.trim() === '' ? null : note.trim())}>
            {submitting ? 'Soumission…' : 'Soumettre'}
          </button>
        </>
      }
    >
      <p>
        {sectionLabels.length} section{sectionLabels.length > 1 ? 's' : ''} modifiée{sectionLabels.length > 1 ? 's' : ''} :{' '}
        <strong>{sectionLabels.join(', ')}</strong>.
      </p>
      <label htmlFor="portal-submit-note">Message pour l’office (facultatif)</label>
      <textarea id="portal-submit-note" rows={3} className="text-input" value={note}
        placeholder="Nouvelle saison, tarifs mis à jour" onChange={(event) => setNote(event.target.value)} />
      {error && <p role="alert" className="form-error">{error}</p>}
    </Modal>
  );
}
```

- [ ] **Step 4 : Câbler dans `EditorReady` (mode portail)**

Ajouter (après le bloc visibilité de la Task 13) :

```tsx
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const [portalSubmitting, setPortalSubmitting] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const restoreDraft = useCallback((saved: ObjectWorkspaceModules) => {
    (Object.keys(saved) as (keyof ObjectWorkspaceModules)[]).forEach((key) => {
      editor.replaceModule(key, saved[key]);
    });
  }, [editor]);
  const portalDraft = usePortalDraft(objectId, editor.baseline, editor.draft, editor.isDirty, restoreDraft);
  const openSubmissionBlocked = isPortal
    ? (queryClient.getQueryData<PortalFiche[]>(['portal-fiches']) ?? [])
        .some((fiche) => fiche.id === objectId && fiche.openSubmission)
    : false;

  const portalDirtyModules = useMemo(() => {
    if (!isPortal) return [] as WorkspaceModuleId[];
    return (Object.keys(editor.dirtySections) as WorkspaceModuleId[])
      .filter((module) => editor.dirtySections[module])
      .filter((module) => isModuleSubmittable(module, maskedModules, floorModules));
  }, [isPortal, editor.dirtySections, maskedModules, floorModules]);

  async function handlePortalSubmit(note: string | null) {
    setPortalSubmitting(true);
    setPortalError(null);
    try {
      const envelopes = portalDirtyModules.map((module) =>
        buildContributorSubmission(objectId, module, editor.baseline, editor.draft));
      await submitActorFiche(objectId, envelopes, note);
      editor.commitModules(portalDirtyModules.map((module) => MODULE_KEY_MAP[module]));
      clearPortalDraft(objectId);
      setPortalModalOpen(false);
      toast.success('Fiche soumise — l’office va la vérifier');
      void queryClient.invalidateQueries({ queryKey: ['portal-fiches'] });
      router.push('/espace');
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : 'Soumission impossible.');
    } finally {
      setPortalSubmitting(false);
    }
  }
```

(imports additionnels : `useCallback` ; `buildContributorSubmission` de `./contributor-proposal` ; `submitActorFiche`, `type PortalFiche` de `../../services/portal` ; `usePortalDraft`, `clearPortalDraft` ; `isModuleSubmittable`.)

Et dans le JSX portail (Task 13, point 4) :

```tsx
      {isPortal ? (
        <PortalTopbar
          objectName={resource.name}
          dirtyCount={portalDirtyModules.length}
          draftSavedAt={portalDraft.draftSavedAt}
          submitting={portalSubmitting}
          submitDisabledReason={openSubmissionBlocked ? 'Vérification en cours' : null}
          onBack={() => { if (confirmLeave()) router.push('/espace'); }}
          onSubmit={() => setPortalModalOpen(true)}
        />
      ) : (
        <EditorTopbar … (bloc existant inchangé) />
      )}
      {isPortal && portalDraft.draftDiscarded && (
        <div className="contributor-banner" role="note">
          Votre brouillon local a été écarté : la fiche a été modifiée entre-temps par l’office.
        </div>
      )}
      …
      {isPortal && (
        <PortalSubmitModal
          open={portalModalOpen}
          sectionLabels={portalDirtyModules.map((module) => moduleLabel(module))}
          submitting={portalSubmitting}
          error={portalError}
          onClose={() => setPortalModalOpen(false)}
          onSubmit={(note) => void handlePortalSubmit(note)}
        />
      )}
```

(`moduleLabel` s'importe de `./save-issues` — déjà utilisé par `contributor-proposal.ts`.)

- [ ] **Step 5 : Vérifier + Commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/usePortalDraft.test.ts && npm run typecheck
```

Puis vérification manuelle rapide en dev (préférence « real DB data ») : `preview_start` du serveur, se connecter avec un compte de test acteur (créé provisoirement en SQL live : `UPDATE app_user_profile SET role='actor', actor_id=<uuid test> WHERE id=<compte jetable>`), parcourir /espace → fiche → soumission, PUIS remettre le compte dans son état d'origine.

```bash
git add src/features/object-editor "src/app/(portal)"
git commit -m "feat(front): brouillon local + soumission pour vérification (portail)"
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
    redirectTo: `${origin}/set-password`,
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
- Modify: `bertel-tourism-ui/src/components/layout/NotificationDrawer.tsx` (libellé + navigation par kind)
- Modify: `bertel-tourism-ui/src/components/portal/PortalShell.tsx` (cloche + drawer)
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

`PortalShell.tsx` : ajouter la cloche (badge `useNotificationInbox().unreadCount`) et monter `<NotificationDrawer open={…} onOpenChange={…} />` — copier le montage d'AppShell (`ls`/ouvrir `AppShell.tsx` pour les props exactes).

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
git add src/emails src/services/notifications.ts src/components/layout/NotificationDrawer.tsx src/components/portal/PortalShell.tsx src/app/api/crm/notify-drain
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

- [ ] **Step 2 : Service + formulaire matrice.** `actor-visibility.ts` : wrappers `getActorSectionVisibility(orgId, objectType)` → RPC `get_actor_section_visibility`, `setActorSectionVisibility(orgId, objectType, moduleId, visible)` → RPC `rpc_set_actor_section_visibility` (pattern portal.ts). `ActorSectionVisibilityForm.tsx` : sélecteur de type d'objet (liste des codes types — réutiliser la source qu'emploie l'Explorer, chercher `OBJECT_TYPE` dans `src/utils/facets.ts` ou `src/config/`) ; puis la liste des sections de l'éditeur (via `makeSections` de l'archétype correspondant + `MODULE_SECTION_NUMS` inversé) avec un interrupteur par module, les modules du plancher affichés verrouillés (cadenas + titre « Non paramétrable »). Chaque bascule appelle `setActorSectionVisibility` et invalide la query. Test RTL : rendu des interrupteurs, plancher désactivé, bascule → appel service.

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
                <p className="muted">Choisissez les sections que les prestataires peuvent remplir, par type de fiche. Les sections de gestion restent toujours internes.</p>
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

- [ ] **Step 1 : Suites complètes**

```bash
cd bertel-tourism-ui && npm run typecheck && npm run test:run
```

Attendu : 0 erreur TS, toutes suites vertes (⚠ mémoire « jest worktree imbriqué » : si des suites doublées apparaissent, filtrer avec un motif positionnel, jamais `--testPathIgnorePatterns`).

- [ ] **Step 2 : Test SQL complet contre la base migrée** (`execute_sql`, BEGIN…ROLLBACK) : blocs A→I verts.

- [ ] **Step 3 : Parcours E2E manuel sur données réelles** (doctrine « prefer real DB data », navigateur intégré) :
1. Choisir un acteur de test réel avec canal e-mail ; depuis la fiche prestataire CRM : Inviter → vérifier l'e-mail reçu → `/set-password` → atterrissage `/espace`.
2. Vérifier le confinement : taper `/crm`, `/explorer`, `/moderation` à la main → renvoi `/espace` ; appeler `list_crm_tasks` en tant qu'acteur (console réseau) → `[]`.
3. Remplir 2 sections → Soumettre avec message → côté éditeur : tâche dans le kanban (chip), notification cloche, e-mail reçu ; `/moderation` : groupe de soumission visible.
4. Approuver l'auto-dispatch, attester le manuel → soumission résolue, tâche done, notification + e-mail acteur, badge « À jour » sur `/espace`.
5. Révoquer l'accès → connexion refusée, acteur CRM intact.
6. Nettoyer les données de test (soumissions/tâche créées) OU les conserver comme premières données réelles si le PO valide.

- [ ] **Step 4 : Compléter le runbook** (tableau de sabotage 18a avec les résultats du Step 3) + commit final

```bash
git add docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "docs(sql): runbook 18a — parcours de sabotage complété"
```

---

## Self-review du plan (fait à l'écriture — points de vigilance pour l'exécutant)

1. **Couverture spec** : D1→D9 tous portés (D1: T15-16 ; D2: T2+T5 ; D3: T4-5 ; D4/D5: T3-4+T13+T19 ; D6: T3+T5+T14 ; D7: T2 ; D8: T1+T10 ; D9: T7+T17). Hors périmètre v1 (spec §9) : rien ici n'implémente l'édition des coordonnées par l'acteur, le branding par ORG du portail, le realtime, ni l'extension de la whitelist — c'est voulu.
2. **Types cohérents** : `SubmitPendingChangeInput` (camelCase, service moderation) est traduit en snake_case UNE fois, dans `submitActorFiche` (T11) — `buildContributorSubmission` reste intact. `surface` n'existe que sur `ObjectEditPage`/`EditorReady`. Les 3 nouveaux champs de `PendingChangeItem` sont optionnels (compat mocks démo).
3. **Deux points à VÉRIFIER sur pièce à l'exécution** (signalés dans leurs tasks) : la forme exacte de `MODULE_SECTION_NUMS` (T13) et la lecture des `params` du wrapper de route éditeur (T13) ; la forme des `channels` de `listActorCrm` (T16) ; l'API exacte de `ConfirmDialog`/`Modal` (T16-17). Dans chaque cas : copier l'existant, le plan donne l'intention et le squelette.
4. **Pièges DB rappelés dans les tasks** : DROP obligatoire pour changer une signature/type de retour (T7) ; re-poser les GRANT après DROP (T7) ; kind CHECK + index + claim/ack élargis ENSEMBLE (T3+T8) ; §227 possiblement absent de ci_fresh_apply (T9 Step 1) ; créneau 18a à re-vérifier (T9).

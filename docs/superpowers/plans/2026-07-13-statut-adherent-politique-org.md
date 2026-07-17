# Statut d'adhérent — politique par ORG + résolveur dérivé : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un objet prestataire présent en base est adhérent de son OTI — statut **dérivé** (0 ligne `object_membership`), politique par ORG (`org_membership_policy`), résolveur unique, exposé au CRM et à l'API partenaire.

**Architecture:** Nouvelle table de politique (1 ligne/ORG, absence = mode `explicit` actuel) + deux résolveurs `SECURITY DEFINER` verrouillés (`api.org_adherent_object_ids` set-based, `api.resolve_object_membership` scalaire). `get_object_resource` remplace `current_membership` par la clé unique `membership` ; les écritures `object_membership` vers une ORG implicite sont interdites par trigger fail-closed ; le trigger `commercial_visibility` early-exit en mode implicite. CRM (annuaire + fiche acteur) et cartes liste partenaire consomment le résolveur.

**Tech Stack:** PostgreSQL/Supabase (migrations manifest + fresh-apply gate), Next.js/React/TanStack Query, Jest/RTL, PostgREST.

**Spec:** `docs/superpowers/specs/2026-07-13-statut-adherent-politique-org-design.md` (validée PO, feu vert 2026-07-13).

## Global Constraints

- **Allowlist (13 types)** : `HOT, HLO, CAMP, HPA, RVA, RES, LOI, ACT, ASC, COM, PRD, PSV, PCU`. Exclus : `ITI, PNA, FMA, VIL, SPU, ORG`.
- **Statuts objet** : `draft` + `published` = adhérent ; `archived` + `hidden` = non.
- **Rattachement implicite** : lien `object_org_link` rôle **`publisher`** uniquement.
- **`since`** : toujours timestamptz — implicite `object.created_at` ; explicite `starts_at::timestamp AT TIME ZONE 'UTC'` (jamais `::timestamptz`, dépendant du fuseau session) ; `starts_at` NULL → `created_at` de la ligne.
- **Isolation multi-ORG** : toute branche explicite impose `m.org_object_id = p_org_object_id`.
- **Jamais d'hybride** pour une même ORG ; le mode implicite ne lit JAMAIS `object_membership` et n'écrit JAMAIS `commercial_visibility`.
- **Clé de contrat unique `membership`** ; `current_membership` disparaît (synonyme accepté dans `v_fields` seulement).
- **Résolveurs** : `SECURITY DEFINER`, `SET search_path = public, api, auth`, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role` (ids `draft` ⇒ jamais exécutables en direct PostgREST).
- **Policies RLS** : forme §39 (`(select auth.*())` — ici aucun `auth.*()` nu n'est nécessaire), per-command (jamais `FOR ALL` — P0.3).
- **Pas d'ID d'ORG codé en dur** : résolution par identité stable (`object_type='ORG' AND name='OTI du Sud' AND region_code='RUN'`), assertion « exactement 1 ».
- **Deploy integrity** : migration inscrite au manifest (`docs/SQL_ROLLOUT_RUNBOOK.md`, step **16n**) + `ci_fresh_apply.sql` + test dans `.github/workflows/sql-fresh-apply.yml`.
- **FE** : `cd bertel-tourism-ui` avant `npx jest` / `npx tsc --noEmit` (devDeps ; le CWD Bash dérive — pin le `cd` dans chaque commande). Commits par PATHSPEC, stage+commit dans la même invocation, format conventionnel, PAS de trailer co-author.
- **Décision log** : nouvelle entrée `§185` (re-grep `^## §` dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` avant de figer — gotcha connu).
- **Zéro backfill** `object_membership` ; pas d'UI d'admin de la politique ; pas de filtre Explorer/KPI dashboard/badge drawer.

---

### Task 1: Audit préalable (lecture seule, AVANT toute politique)

**Files:**
- Create: `docs/research/adherent-audit-2026-07-13.md`

**Interfaces:**
- Produces: la liste des objets éligibles **sans lien publisher** vers l'OTI (consommée par Task 12 avant l'activation live), l'explication de l'objet `commercial_visibility='lapsed'`.

- [ ] **Step 1: Exécuter les requêtes d'audit (Supabase MCP `execute_sql`, AUCUNE écriture)**

```sql
-- A. Corpus par type × statut × éligibilité (attendu ≈ 846 objets)
SELECT o.object_type::text AS type, o.status::text,
       (o.object_type::text = ANY(ARRAY['HOT','HLO','CAMP','HPA','RVA','RES','LOI','ACT','ASC','COM','PRD','PSV','PCU'])) AS eligible,
       count(*)
FROM object o GROUP BY 1,2,3 ORDER BY 3 DESC, 1, 2;

-- B. Objets éligibles draft/published SANS lien publisher vers l'OTI du Sud (à corriger AVANT activation)
WITH oti AS (
  SELECT id FROM object WHERE object_type='ORG' AND name='OTI du Sud' AND region_code='RUN'
)
SELECT o.id, o.object_type::text, o.status::text, o.name
FROM object o
WHERE o.object_type::text = ANY(ARRAY['HOT','HLO','CAMP','HPA','RVA','RES','LOI','ACT','ASC','COM','PRD','PSV','PCU'])
  AND o.status IN ('draft','published')
  AND NOT EXISTS (
    SELECT 1 FROM object_org_link l
    JOIN ref_org_role r ON r.id = l.role_id AND r.code = 'publisher'
    JOIN oti ON oti.id = l.org_object_id
    WHERE l.object_id = o.id
  )
ORDER BY o.object_type, o.name;

-- C. L'unique objet commercial_visibility='lapsed' (résidu de test ?)
SELECT id, object_type::text, status::text, name, commercial_visibility, updated_at
FROM object WHERE commercial_visibility = 'lapsed';

-- D. Sanity : object_membership doit être vide (0 ligne attendue)
SELECT count(*) AS membership_rows FROM object_membership;
```

- [ ] **Step 2: Rédiger `docs/research/adherent-audit-2026-07-13.md`**

Structure : contexte (spec + règle), résultat A (tableau), résultat B (liste COMPLÈTE des ids sans lien publisher + proposition de correctif : `INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary) SELECT ..., 'publisher', NOT EXISTS(primary)` — à valider en Task 12), résultat C (identité de l'objet lapsed + recommandation : remettre `commercial_visibility='active'` si résidu de test, sinon documenter), résultat D. Conclusion : GO/NO-GO pour le seed de la politique.

- [ ] **Step 3: Commit**

```bash
git add "docs/research/adherent-audit-2026-07-13.md" && git commit -m "docs(research): audit préalable statut adhérent — corpus, liens publisher manquants, objet lapsed" -- "docs/research/adherent-audit-2026-07-13.md"
```

---

### Task 2: Migration SQL — table `org_membership_policy` + RLS + seed

**Files:**
- Create: `Base de donnée DLL et API/migration_org_membership_policy.sql`
- Test: `Base de donnée DLL et API/tests/test_org_membership_policy.sql` (créé en Task 5 ; cette task pose la migration)

**Interfaces:**
- Produces: table `public.org_membership_policy(org_object_id TEXT PK, mode TEXT, eligible_types object_type[], created_at, updated_at)` ; seed OTI du Sud en `implicit_by_presence` (13 types), résolu par identité stable.
- Consumes: `validate_org_object_type` / `update_updated_at_column` (schema_unified.sql), `api.user_can_manage_org_branding` (migration_org_branding.sql, manifest ORG2 — dépendance d'ordre).

- [ ] **Step 1: Écrire l'en-tête + la table + les triggers de garde**

```sql
-- migration_org_membership_policy.sql
-- §185 — Statut d'adhérent : politique par ORG + résolveurs dérivés.
-- Spec : docs/superpowers/specs/2026-07-13-statut-adherent-politique-org-design.md
-- Dépendances : schema_unified.sql (object, object_org_link, object_membership,
--   validate_org_object_type, update_updated_at_column), rls_policies.sql
--   (is_platform_superuser), migration_org_branding.sql (user_can_manage_org_branding — gate
--   d'écriture réutilisé), seeds_data.sql (ORG « OTI du Sud », ref_org_role publisher).
-- Manifest 16n (après ORG2 ; avant taxo/MV refresh). Self-contained, idempotent.
-- Invariant : l'adhésion se lit EXCLUSIVEMENT via api.resolve_object_membership /
-- api.org_adherent_object_ids — jamais object_membership en direct dans une nouvelle surface.

-- 1) Table de politique — 1 ligne par ORG ; ABSENCE de ligne = mode 'explicit' (comportement actuel).
CREATE TABLE IF NOT EXISTS public.org_membership_policy (
  org_object_id  TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('implicit_by_presence','explicit')),
  eligible_types object_type[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.org_membership_policy IS
'Politique d''adhésion par ORG (§185) : implicit_by_presence = un objet de type éligible, draft/published, lié publisher à l''ORG est adhérent (0 ligne object_membership) ; explicit = lignes object_membership (comportement historique). Absence de ligne = explicit.';

DROP TRIGGER IF EXISTS trg_validate_org_object_type_org_membership_policy ON org_membership_policy;
CREATE TRIGGER trg_validate_org_object_type_org_membership_policy
BEFORE INSERT OR UPDATE ON org_membership_policy
FOR EACH ROW EXECUTE FUNCTION validate_org_object_type('org_object_id');

DROP TRIGGER IF EXISTS update_org_membership_policy_updated_at ON org_membership_policy;
CREATE TRIGGER update_org_membership_policy_updated_at
BEFORE UPDATE ON org_membership_policy
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: RLS + grants (lecture publique patron `ref_*`, écriture gate branding §172, per-command)**

```sql
-- 2) RLS — lecture publique (configuration non sensible ; le FE lit le mode en direct PostgREST).
--    Écriture superuser plateforme OU admin d'ORG rang >= 30 : réutilise le gate branding §172
--    (api.user_can_manage_org_branding = "gère les réglages de CETTE ORG"), per-command (jamais FOR ALL — P0.3).
ALTER TABLE public.org_membership_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_org_membership_policy" ON public.org_membership_policy;
CREATE POLICY "read_org_membership_policy" ON public.org_membership_policy
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ins_org_membership_policy" ON public.org_membership_policy;
CREATE POLICY "admin_ins_org_membership_policy" ON public.org_membership_policy
  FOR INSERT WITH CHECK (api.user_can_manage_org_branding(org_object_id));
DROP POLICY IF EXISTS "admin_upd_org_membership_policy" ON public.org_membership_policy;
CREATE POLICY "admin_upd_org_membership_policy" ON public.org_membership_policy
  FOR UPDATE USING (api.user_can_manage_org_branding(org_object_id))
  WITH CHECK (api.user_can_manage_org_branding(org_object_id));
DROP POLICY IF EXISTS "admin_del_org_membership_policy" ON public.org_membership_policy;
CREATE POLICY "admin_del_org_membership_policy" ON public.org_membership_policy
  FOR DELETE USING (api.user_can_manage_org_branding(org_object_id));
GRANT SELECT ON public.org_membership_policy TO anon, authenticated;
GRANT ALL ON public.org_membership_policy TO service_role;
```

Note P0.3 : `anon` peut lire (policy `USING (true)`, aucune fonction à évaluer) ; le prédicat d'écriture n'est évalué que sur INSERT/UPDATE/DELETE par `authenticated` (qui a EXECUTE sur `user_can_manage_org_branding`) — pas de `FOR ALL` donc pas de pollution du SELECT.

- [ ] **Step 3: Seed par identité stable (fail-closed, aucun id en dur)**

```sql
-- 3) Seed — OTI du Sud en implicite (13 types). Résolution par identité stable :
--    en base vierge l'ORG est créée SANS id explicite (seeds_data.sql) ⇒ jamais d'ORGRUN… en dur.
DO $$
DECLARE
  v_org TEXT;
  v_n   INTEGER;
BEGIN
  SELECT count(*), min(id) INTO v_n, v_org
  FROM object
  WHERE object_type = 'ORG' AND name = 'OTI du Sud' AND region_code = 'RUN';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'org_membership_policy seed: attendu exactement 1 ORG « OTI du Sud » (RUN), trouvé %', v_n;
  END IF;
  INSERT INTO org_membership_policy (org_object_id, mode, eligible_types)
  VALUES (v_org, 'implicit_by_presence',
          ARRAY['HOT','HLO','CAMP','HPA','RVA','RES','LOI','ACT','ASC','COM','PRD','PSV','PCU']::object_type[])
  ON CONFLICT (org_object_id) DO UPDATE
    SET mode = EXCLUDED.mode, eligible_types = EXCLUDED.eligible_types;
END $$;
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_org_membership_policy.sql" && git commit -m "feat(sql): org_membership_policy — table de politique d'adhésion par ORG + RLS + seed OTI implicite (§185, 1/3)" -- "Base de donnée DLL et API/migration_org_membership_policy.sql"
```

---

### Task 3: Migration SQL — les deux résolveurs (verrouillés)

**Files:**
- Modify: `Base de donnée DLL et API/migration_org_membership_policy.sql` (append)

**Interfaces:**
- Produces: `api.org_adherent_object_ids(p_org_object_id text) RETURNS SETOF text` (mode-aware) et `api.resolve_object_membership(p_object_id text, p_org_object_id text) RETURNS jsonb` de forme `{is_member, since, mode, org_object_id, details}`. Consommés par Tasks 6, 7, 8.

- [ ] **Step 1: Append le résolveur set-based**

```sql
-- 4) Résolveur set-based (surfaces liste : CRM annuaire, agrégats). Mode-aware :
--    implicite = présence (lien PUBLISHER + type éligible + draft/published) ;
--    explicite (ou sans politique) = lignes object_membership courantes DE CETTE ORG
--    (isolation multi-ORG stricte), y compris les adhésions org-globales (object_id IS NULL)
--    rabattues sur les objets liés à l'ORG. Retourne des ids draft ⇒ REVOKE anon/authenticated.
CREATE OR REPLACE FUNCTION api.org_adherent_object_ids(p_org_object_id TEXT)
RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  -- Arm implicite
  SELECT o.id
  FROM org_membership_policy p
  JOIN object_org_link l ON l.org_object_id = p.org_object_id
  JOIN ref_org_role r    ON r.id = l.role_id AND r.code = 'publisher'
  JOIN object o          ON o.id = l.object_id
  WHERE p.org_object_id = p_org_object_id
    AND p.mode = 'implicit_by_presence'
    AND o.object_type = ANY(p.eligible_types)
    AND o.status IN ('draft','published')
  UNION
  -- Arm explicite, portée objet
  SELECT m.object_id
  FROM object_membership m
  WHERE m.org_object_id = p_org_object_id
    AND NOT EXISTS (SELECT 1 FROM org_membership_policy p2
                    WHERE p2.org_object_id = p_org_object_id AND p2.mode = 'implicit_by_presence')
    AND m.object_id IS NOT NULL
    AND m.status IN ('invoiced','paid')
    AND (m.starts_at IS NULL OR m.starts_at <= CURRENT_DATE)
    AND (m.ends_at IS NULL OR m.ends_at >= CURRENT_DATE)
  UNION
  -- Arm explicite, adhésion org-globale (object_id IS NULL) => tous les objets liés à l'ORG
  SELECT l.object_id
  FROM object_org_link l
  WHERE l.org_object_id = p_org_object_id
    AND NOT EXISTS (SELECT 1 FROM org_membership_policy p3
                    WHERE p3.org_object_id = p_org_object_id AND p3.mode = 'implicit_by_presence')
    AND EXISTS (SELECT 1 FROM object_membership m2
                WHERE m2.org_object_id = p_org_object_id
                  AND m2.object_id IS NULL
                  AND m2.status IN ('invoiced','paid')
                  AND (m2.starts_at IS NULL OR m2.starts_at <= CURRENT_DATE)
                  AND (m2.ends_at IS NULL OR m2.ends_at >= CURRENT_DATE));
$$;
```

- [ ] **Step 2: Append le résolveur scalaire**

```sql
-- 5) Résolveur scalaire (surfaces fiche). Forme UNIQUE du contrat :
--    { is_member, since (timestamptz ISO), mode, org_object_id, details }.
--    details = null en implicite ; en explicite l'objet campagne/palier/statut/dates (parité current_membership).
--    since explicite : starts_at::timestamp AT TIME ZONE 'UTC' (minuit UTC quel que soit le fuseau
--    de session — un cast ::timestamptz dépendrait du TimeZone) ; starts_at NULL => created_at de la ligne.
CREATE OR REPLACE FUNCTION api.resolve_object_membership(p_object_id TEXT, p_org_object_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_mode  TEXT;
  v_types object_type[];
  v_since TIMESTAMPTZ;
  v_row   RECORD;
BEGIN
  IF p_object_id IS NULL OR p_org_object_id IS NULL THEN
    RETURN jsonb_build_object('is_member', false, 'since', NULL, 'mode', NULL,
                              'org_object_id', p_org_object_id, 'details', NULL);
  END IF;

  SELECT p.mode, p.eligible_types INTO v_mode, v_types
  FROM org_membership_policy p WHERE p.org_object_id = p_org_object_id;

  IF v_mode = 'implicit_by_presence' THEN
    -- Présence = lien publisher + type éligible + draft/published. JAMAIS object_membership.
    SELECT o.created_at INTO v_since
    FROM object o
    JOIN object_org_link l ON l.object_id = o.id AND l.org_object_id = p_org_object_id
    JOIN ref_org_role r    ON r.id = l.role_id AND r.code = 'publisher'
    WHERE o.id = p_object_id
      AND o.object_type = ANY(v_types)
      AND o.status IN ('draft','published')
    LIMIT 1;
    RETURN jsonb_build_object('is_member', v_since IS NOT NULL, 'since', v_since,
                              'mode', 'implicit_by_presence', 'org_object_id', p_org_object_id,
                              'details', NULL);
  END IF;

  -- Mode explicite (ou sans politique) : parité de CLASSEMENT avec l'ancien current_membership
  -- (paid avant invoiced, portée objet avant org, ends_at DESC NULLS LAST, updated_at DESC, LIMIT 1)
  -- mais FILTRÉ sur l'ORG demandée — chaque branche impose m.org_object_id = p_org_object_id.
  SELECT m.id, m.campaign_id, camp.code AS campaign_code, camp.name AS campaign_name,
         m.tier_id, tier.code AS tier_code, tier.name AS tier_name,
         m.status, m.starts_at, m.ends_at, m.payment_date, m.metadata, m.updated_at, m.created_at
  INTO v_row
  FROM object_membership m
  LEFT JOIN ref_code_membership_campaign camp ON camp.id = m.campaign_id
  LEFT JOIN ref_code_membership_tier     tier ON tier.id = m.tier_id
  WHERE m.org_object_id = p_org_object_id
    AND (m.object_id = p_object_id
         OR (m.object_id IS NULL AND EXISTS (
               SELECT 1 FROM object_org_link l
               WHERE l.object_id = p_object_id AND l.org_object_id = p_org_object_id)))
    AND m.status IN ('invoiced','paid')
    AND (m.starts_at IS NULL OR m.starts_at <= CURRENT_DATE)
    AND (m.ends_at IS NULL OR m.ends_at >= CURRENT_DATE)
  ORDER BY
    CASE m.status WHEN 'paid' THEN 0 ELSE 1 END,
    m.object_id NULLS LAST,
    m.ends_at DESC NULLS LAST,
    m.updated_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('is_member', false, 'since', NULL,
                              'mode', COALESCE(v_mode, 'explicit'),
                              'org_object_id', p_org_object_id, 'details', NULL);
  END IF;

  v_since := COALESCE(v_row.starts_at::timestamp AT TIME ZONE 'UTC', v_row.created_at);
  RETURN jsonb_build_object(
    'is_member', true, 'since', v_since,
    'mode', COALESCE(v_mode, 'explicit'), 'org_object_id', p_org_object_id,
    'details', jsonb_build_object(
      'id', v_row.id,
      'campaign_id', v_row.campaign_id, 'campaign_code', v_row.campaign_code, 'campaign_name', v_row.campaign_name,
      'tier_id', v_row.tier_id, 'tier_code', v_row.tier_code, 'tier_name', v_row.tier_name,
      'status', v_row.status, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at,
      'payment_date', v_row.payment_date, 'metadata', v_row.metadata, 'updated_at', v_row.updated_at));
END;
$$;
```

- [ ] **Step 3: Append les verrous d'exécution**

```sql
-- 6) Verrouillage : jamais exécutables en direct PostgREST (org_adherent_object_ids expose des ids draft).
--    Consommés exclusivement DANS les RPCs DEFINER existants (get_object_resource, RPCs CRM, cards batch).
REVOKE ALL ON FUNCTION api.org_adherent_object_ids(text)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION api.org_adherent_object_ids(text)    TO service_role;
REVOKE ALL ON FUNCTION api.resolve_object_membership(text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION api.resolve_object_membership(text,text) TO service_role;
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_org_membership_policy.sql" && git commit -m "feat(sql): résolveurs adhésion org_adherent_object_ids + resolve_object_membership — mode-aware, isolés par ORG, DEFINER verrouillés (§185, 2/3)" -- "Base de donnée DLL et API/migration_org_membership_policy.sql"
```

---

### Task 4: Migration SQL — verrous `object_membership` (trigger fail-closed + early-exit visibilité)

**Files:**
- Modify: `Base de donnée DLL et API/migration_org_membership_policy.sql` (append)
- Modify: `Base de donnée DLL et API/schema_unified.sql:3027-3134` (fold du nouveau corps de `api.handle_membership_status_transition`)

**Interfaces:**
- Produces: `api.assert_membership_org_explicit()` + trigger `trg_assert_membership_org_explicit` sur `object_membership` ; `handle_membership_status_transition` early-exit implicite.

- [ ] **Step 1: Append le trigger fail-closed (patron `assert_facet_applicable`)**

```sql
-- 7) Écritures object_membership INTERDITES vers une ORG implicite — trigger fail-closed
--    (patron trg_assert_facet_applicable). Bloque TOUS les écrivains : PostgREST direct
--    (saver §17), RPC, service_role (le bypass RLS ne contourne pas les triggers).
CREATE OR REPLACE FUNCTION api.assert_membership_org_explicit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM org_membership_policy p
             WHERE p.org_object_id = NEW.org_object_id
               AND p.mode = 'implicit_by_presence') THEN
    RAISE EXCEPTION 'object_membership: l''ORG % est en adhésion implicite (org_membership_policy) — les lignes explicites sont interdites ; basculez la politique en mode explicit d''abord',
      NEW.org_object_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_assert_membership_org_explicit ON object_membership;
CREATE TRIGGER trg_assert_membership_org_explicit
BEFORE INSERT OR UPDATE ON object_membership
FOR EACH ROW EXECUTE FUNCTION api.assert_membership_org_explicit();
```

(DELETE volontairement non bloqué : purger des lignes résiduelles après bascule de mode doit rester possible.)

- [ ] **Step 2: Append le early-exit du trigger de visibilité (corps COMPLET)**

Reprendre le corps intégral actuel de `api.handle_membership_status_transition` (`schema_unified.sql:3027-3129`) et insérer en tête de `BEGIN` :

```sql
-- 8) Défense en profondeur : si une ligne préexiste à une bascule vers l'implicite,
--    le trigger de visibilité ne touche JAMAIS commercial_visibility pour une ORG implicite.
CREATE OR REPLACE FUNCTION api.handle_membership_status_transition()
RETURNS TRIGGER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  -- §185 early-exit : ORG en mode implicite => aucun pilotage de commercial_visibility.
  IF EXISTS (SELECT 1 FROM org_membership_policy p
             WHERE p.org_object_id = NEW.org_object_id
               AND p.mode = 'implicit_by_presence') THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'lapsed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  -- [… CORPS EXISTANT INCHANGÉ, lignes 3032-3126 de schema_unified.sql, recopié intégralement …]
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Règle « le plus récent porte le corps complet » : la migration recopie TOUT le corps (les deux branches lapsed/paid), pas un fragment.

- [ ] **Step 3: Folder le même corps dans `schema_unified.sql` (édition en place, lignes 3027-3129)**

Ajouter le même early-exit en tête du `BEGIN` du corps existant. ⚠ `schema_unified.sql` (step 1) s'exécute AVANT 16n : le corps référence `org_membership_policy` qui n'existe pas encore à ce stade — sans danger, les corps plpgsql se résolvent à l'EXÉCUTION, et rien n'écrit `object_membership` avant 16n dans le manifest. Commenter ce point dans le fold.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_org_membership_policy.sql" "Base de donnée DLL et API/schema_unified.sql" && git commit -m "feat(sql): verrous object_membership — trigger fail-closed ORG implicite + early-exit commercial_visibility (§185, 3/3)" -- "Base de donnée DLL et API/migration_org_membership_policy.sql" "Base de donnée DLL et API/schema_unified.sql"
```

---

### Task 5: Test SQL fresh-apply + câblage manifest/CI

**Files:**
- Create: `Base de donnée DLL et API/tests/test_org_membership_policy.sql`
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (step 16n avant `== taxo`)
- Modify: `.github/workflows/sql-fresh-apply.yml` (nouveau step de test avant `Stop Supabase`)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée 16n avant le step 14)

**Interfaces:**
- Consumes: tout Task 2-4. Le test suit le patron maison (`test_object_review_read_gate.sql`) : `\set ON_ERROR_STOP on; BEGIN; DO $$ … ASSERT … $$; ROLLBACK;`, fixtures sentinelles `*RUN99999918xx`, personas via `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE`.

- [ ] **Step 1: Écrire le test complet**

```sql
-- test_org_membership_policy.sql
-- Prouve §185 (migration_org_membership_policy.sql, 16n) :
--   * implicite : type éligible + draft/published + lien PUBLISHER => is_member TRUE, since = object.created_at ;
--     type exclu (ITI) / archived / hidden / lien contributor seul / objet non lié => FALSE
--   * explicite : parité de classement current_membership (paid>invoiced, objet>org, ends_at DESC NULLS LAST),
--     adhésions org-globales incluses, isolation multi-ORG (l'adhésion d'orgE ne fuit jamais vers orgI)
--   * since toujours timestamptz : explicite = starts_at à minuit UTC ; starts_at NULL => created_at ligne
--   * trigger fail-closed : INSERT object_membership vers l'ORG implicite => 23514
--   * early-exit visibilité : trigger guard désactivé, UPDATE status => commercial_visibility INCHANGÉ
--   * grants : anon/authenticated ne peuvent PAS exécuter les 2 résolveurs
--   * seed : la politique OTI existe, résolue par identité stable (0 id en dur ici non plus)
-- Contre une base sans 16n : le premier ASSERT structurel échoue -> rouge.
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgI   text := 'ORGRUN9999991801';  -- implicite
  v_orgE   text := 'ORGRUN9999991802';  -- explicite
  v_resI   text := 'RESRUN9999991811';  -- RES published, publisher orgI
  v_draftI text := 'RESRUN9999991812';  -- RES draft, publisher orgI
  v_archI  text := 'RESRUN9999991813';  -- RES archived, publisher orgI
  v_itiI   text := 'ITIRUN9999991814';  -- ITI published, publisher orgI (type exclu)
  v_contI  text := 'RESRUN9999991815';  -- RES published, lien CONTRIBUTOR seul vers orgI
  v_resE   text := 'RESRUN9999991816';  -- RES published, publisher orgE
  v_pub    uuid;
  v_contrib uuid;
  v_camp   uuid;
  v_tier   uuid;
  v_doc    jsonb;
  v_denied boolean;
  v_cv     text;
BEGIN
  -- ---------- Structurel ----------
  ASSERT to_regclass('public.org_membership_policy') IS NOT NULL,
         '16n non appliqué : org_membership_policy absente';
  ASSERT EXISTS (SELECT 1 FROM org_membership_policy p JOIN object o ON o.id = p.org_object_id
                 WHERE o.name = 'OTI du Sud' AND p.mode = 'implicit_by_presence'
                   AND cardinality(p.eligible_types) = 13),
         'seed OTI du Sud implicite (13 types) manquant';
  ASSERT NOT has_function_privilege('anon', 'api.org_adherent_object_ids(text)', 'EXECUTE'),
         'FUITE: anon peut exécuter org_adherent_object_ids (ids draft)';
  ASSERT NOT has_function_privilege('authenticated', 'api.org_adherent_object_ids(text)', 'EXECUTE'),
         'FUITE: authenticated peut exécuter org_adherent_object_ids';
  ASSERT NOT has_function_privilege('anon', 'api.resolve_object_membership(text,text)', 'EXECUTE'),
         'FUITE: anon peut exécuter resolve_object_membership';
  ASSERT NOT has_function_privilege('authenticated', 'api.resolve_object_membership(text,text)', 'EXECUTE'),
         'FUITE: authenticated peut exécuter resolve_object_membership';

  -- ---------- Fixture ----------
  SELECT id INTO v_pub     FROM ref_org_role WHERE code = 'publisher';
  SELECT id INTO v_contrib FROM ref_org_role WHERE code = 'contributor';
  IF v_pub IS NULL OR v_contrib IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role manquant'; END IF;
  SELECT id INTO v_camp FROM ref_code WHERE domain='membership_campaign' ORDER BY position LIMIT 1;
  SELECT id INTO v_tier FROM ref_code WHERE domain='membership_tier'     ORDER BY position LIMIT 1;
  IF v_camp IS NULL OR v_tier IS NULL THEN RAISE EXCEPTION 'fixture: vocabulaire membership manquant'; END IF;

  INSERT INTO object (id, object_type, name, status, created_at) VALUES
    (v_orgI,   'ORG', 'Org I (implicite)', 'published', now()),
    (v_orgE,   'ORG', 'Org E (explicite)', 'published', now()),
    (v_resI,   'RES', 'Resto I',   'published', '2026-05-01T09:24:21Z'),
    (v_draftI, 'RES', 'Draft I',   'draft',     now()),
    (v_archI,  'RES', 'Archived I','archived',  now()),
    (v_itiI,   'ITI', 'Iti I',     'published', now()),
    (v_contI,  'RES', 'Contrib I', 'published', now()),
    (v_resE,   'RES', 'Resto E',   'published', now());

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_resI,   v_orgI, v_pub), (v_draftI, v_orgI, v_pub), (v_archI, v_orgI, v_pub),
    (v_itiI,   v_orgI, v_pub), (v_contI,  v_orgI, v_contrib),
    (v_resE,   v_orgE, v_pub);

  INSERT INTO org_membership_policy (org_object_id, mode, eligible_types)
  VALUES (v_orgI, 'implicit_by_presence',
          ARRAY['HOT','HLO','CAMP','HPA','RVA','RES','LOI','ACT','ASC','COM','PRD','PSV','PCU']::object_type[]);
  -- orgE : PAS de ligne de politique = mode explicite par défaut.

  -- ---------- Mode implicite ----------
  v_doc := api.resolve_object_membership(v_resI, v_orgI);
  ASSERT (v_doc->>'is_member')::boolean, 'implicite: RES published+publisher doit être adhérent';
  ASSERT v_doc->>'mode' = 'implicit_by_presence', 'implicite: mode attendu';
  ASSERT (v_doc->>'since')::timestamptz = '2026-05-01T09:24:21Z'::timestamptz,
         'implicite: since = object.created_at';
  ASSERT v_doc->'details' = 'null'::jsonb, 'implicite: details doit être null';
  ASSERT (api.resolve_object_membership(v_draftI, v_orgI)->>'is_member')::boolean,
         'implicite: draft = adhérent';
  ASSERT NOT (api.resolve_object_membership(v_archI, v_orgI)->>'is_member')::boolean,
         'implicite: archived = non-adhérent';
  ASSERT NOT (api.resolve_object_membership(v_itiI, v_orgI)->>'is_member')::boolean,
         'implicite: ITI (type exclu) = non-adhérent';
  ASSERT NOT (api.resolve_object_membership(v_contI, v_orgI)->>'is_member')::boolean,
         'implicite: lien contributor seul = non-adhérent';
  ASSERT NOT (api.resolve_object_membership(v_resE, v_orgI)->>'is_member')::boolean,
         'implicite: objet non lié à cette ORG = non-adhérent';
  ASSERT (SELECT count(*) FROM api.org_adherent_object_ids(v_orgI)) = 2,
         'set-based implicite: exactement {resI, draftI}';

  -- ---------- Trigger fail-closed ----------
  v_denied := false;
  BEGIN
    INSERT INTO object_membership (org_object_id, object_id, campaign_id, tier_id, status)
    VALUES (v_orgI, v_resI, v_camp, v_tier, 'paid');
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'TROU: une ligne object_membership a été écrite vers une ORG implicite';

  -- ---------- Mode explicite : isolation + classement + org-global + since ----------
  INSERT INTO object_membership (org_object_id, object_id, campaign_id, tier_id, status, starts_at)
  VALUES (v_orgE, v_resE, v_camp, v_tier, 'invoiced', '2026-01-01');
  INSERT INTO object_membership (org_object_id, object_id, campaign_id, tier_id, status, starts_at)
  VALUES (v_orgE, v_resE, v_camp, v_tier, 'paid', '2026-02-01');
  v_doc := api.resolve_object_membership(v_resE, v_orgE);
  ASSERT (v_doc->>'is_member')::boolean AND v_doc->>'mode' = 'explicit',
         'explicite: adhésion courante attendue';
  ASSERT v_doc->'details'->>'status' = 'paid', 'explicite: paid doit primer sur invoiced';
  ASSERT (v_doc->>'since')::timestamptz = '2026-02-01T00:00:00Z'::timestamptz,
         'explicite: since = starts_at à minuit UTC (indépendant du fuseau de session)';
  -- Isolation multi-ORG : l'adhésion orgE ne fuit jamais vers une autre ORG
  ASSERT NOT (api.resolve_object_membership(v_resE, v_orgI)->>'is_member')::boolean,
         'ISOLATION: resolve(objet, orgI) retourne une adhésion orgE';
  -- Org-globale : une ligne object_id IS NULL d'orgE couvre les objets liés
  DELETE FROM object_membership WHERE org_object_id = v_orgE;
  INSERT INTO object_membership (org_object_id, object_id, campaign_id, tier_id, status)
  VALUES (v_orgE, NULL, v_camp, v_tier, 'paid');
  v_doc := api.resolve_object_membership(v_resE, v_orgE);
  ASSERT (v_doc->>'is_member')::boolean, 'explicite org-globale: objet lié doit être couvert';
  ASSERT (v_doc->>'since') IS NOT NULL, 'explicite org-globale sans starts_at: since = created_at ligne';
  ASSERT v_resE IN (SELECT api.org_adherent_object_ids(v_orgE)),
         'set-based explicite: arm org-globale manquant';

  -- ---------- Early-exit visibilité (défense en profondeur) ----------
  -- Ligne préexistante à une bascule vers l'implicite : on désactive le guard (superuser),
  -- on bascule orgE en implicite, puis un UPDATE de statut ne doit PAS toucher commercial_visibility.
  ALTER TABLE object_membership DISABLE TRIGGER trg_assert_membership_org_explicit;
  INSERT INTO org_membership_policy (org_object_id, mode, eligible_types)
  VALUES (v_orgE, 'implicit_by_presence', ARRAY['RES']::object_type[]);
  SELECT commercial_visibility INTO v_cv FROM object WHERE id = v_resE;
  UPDATE object_membership SET status = 'lapsed' WHERE org_object_id = v_orgE;
  ASSERT (SELECT commercial_visibility FROM object WHERE id = v_resE) IS NOT DISTINCT FROM v_cv,
         'EARLY-EXIT: le trigger de visibilité a écrit commercial_visibility pour une ORG implicite';
  ALTER TABLE object_membership ENABLE TRIGGER trg_assert_membership_org_explicit;

  RAISE NOTICE 'org_membership_policy assertions passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Câbler `ci_fresh_apply.sql`** — insérer AVANT le step `== taxo` :

```sql
\echo '== 16n    migration_org_membership_policy.sql  (§185 statut adhérent: politique par ORG org_membership_policy + résolveurs DEFINER verrouillés resolve_object_membership/org_adherent_object_ids + trigger fail-closed object_membership ORG implicite + early-exit commercial_visibility; seed OTI du Sud implicite 13 types par identité stable; dépend de ORG2 user_can_manage_org_branding) =='
\ir migration_org_membership_policy.sql
```

- [ ] **Step 3: Câbler le workflow CI** — dans `.github/workflows/sql-fresh-apply.yml`, avant `Stop Supabase` :

```yaml
      - name: "org membership policy test (16n §185 — implicite présence publisher/type/statut, isolation multi-ORG, org-globale, since UTC, trigger fail-closed 23514, early-exit visibilité, grants résolveurs)"
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_org_membership_policy.sql"
```

- [ ] **Step 4: Entrée runbook 16n** — dans `docs/SQL_ROLLOUT_RUNBOOK.md`, avant le step 14, une entrée un-paragraphe au format maison (voir 16m comme gabarit) : fichier, titre **Statut adhérent §185**, self-contained après ORG2, ce que fait la migration, « non foldé (dépend de user_can_manage_org_branding, ORG2) — SAUF handle_membership_status_transition foldé dans schema_unified.sql », statut live à compléter en Task 12, « Couvert par `tests/test_org_membership_policy.sql` ».

- [ ] **Step 5: Vérification locale sans Docker** — recette mémoire « apply transient + ROLLBACK via MCP » : sur la base cloud, `BEGIN; \ir équivalent (coller la migration) ; \i test ; ROLLBACK;` via `mcp__supabase__execute_sql` par blocs (la migration entière puis le corps du test DO $$…$$), et vérifier `assertions passed`. Ne PAS commit d'artefact de cette vérification.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/tests/test_org_membership_policy.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "docs/SQL_ROLLOUT_RUNBOOK.md" && git commit -m "test(sql): test_org_membership_policy + câblage manifest 16n/CI fresh-apply (§185)" -- "Base de donnée DLL et API/tests/test_org_membership_policy.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "docs/SQL_ROLLOUT_RUNBOOK.md"
```

---

### Task 6: `get_object_resource` — clé unique `membership` (remplace `current_membership`)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql:3776-3824` (bloc), `:2651` et `:2752` (listes de champs des helpers `resource_block_base`/`resource_block_misc`)

**Interfaces:**
- Consumes: `api.resolve_object_membership` (Task 3).
- Produces: clé `membership` = sortie du résolveur, ORG = éditrice principale (ordre déterministe). Consommée par Tasks 8-11 (FE) et l'API partenaire (héritage automatique — invariant §177).

- [ ] **Step 1: Remplacer le bloc `current_membership` (lignes 3776-3824) par**

```sql
  -- Adhésion (§185) — clé UNIQUE `membership` = api.resolve_object_membership, résolue contre
  -- l'ORG éditrice principale (lien publisher is_primary d'abord, sinon le plus ancien lien
  -- publisher, tie-break org_object_id ; aucun lien publisher => is_member:false/org:null).
  -- L'ancien nom `current_membership` reste accepté dans v_fields (synonyme transitoire,
  -- à retirer en fin de chantier) mais la clé émise est `membership`.
  IF v_fields IS NULL OR 'membership' = ANY(v_fields) OR 'current_membership' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'membership',
      api.resolve_object_membership(
        obj.id,
        (SELECT l.org_object_id
         FROM object_org_link l
         JOIN ref_org_role r ON r.id = l.role_id AND r.code = 'publisher'
         WHERE l.object_id = obj.id
         ORDER BY l.is_primary DESC NULLS LAST, l.created_at ASC, l.org_object_id ASC
         LIMIT 1)
      )
    );
  END IF;
```

- [ ] **Step 2: Renommer le token dans les 2 listes de champs** — lignes 2651 et 2752 : remplacer `'current_membership'` par `'membership'` (contexte ligne 2651 : `'created_at','updated_at','updated_at_source','published_at','commercial_visibility','current_membership'`).

- [ ] **Step 3: Ajouter les sondes RPC au test** — append dans le DO block de `tests/test_org_membership_policy.sql` (avant le `RAISE NOTICE`) :

```sql
  -- ---------- get_object_resource : clé membership (l'ancienne clé a disparu) ----------
  v_doc := (api.get_object_resource(v_resI)::jsonb);
  ASSERT v_doc ? 'membership', 'get_object_resource doit émettre la clé membership';
  ASSERT NOT (v_doc ? 'current_membership'), 'current_membership ne doit PLUS être émise';
  ASSERT (v_doc->'membership'->>'is_member')::boolean, 'resource: resI adhérent implicite';
  ASSERT v_doc->'membership'->>'org_object_id' = v_orgI, 'resource: ORG éditrice principale résolue';
  -- v_fields : les deux noms sélectionnent le bloc
  ASSERT (api.get_object_resource(v_resI, ARRAY['fr'], 'none',
          '{"fields":["current_membership"]}'::jsonb)::jsonb) ? 'membership',
         'v_fields: le synonyme current_membership doit sélectionner le bloc membership';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_org_membership_policy.sql" && git commit -m "feat(sql): get_object_resource émet membership (résolveur §185) — current_membership supprimée, synonyme v_fields transitoire" -- "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_org_membership_policy.sql"
```

---

### Task 7: Cartes liste — clé `membership` sur `get_object_cards_batch` (les DEUX copies)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql:2571-2619` (cards CTE)
- Modify: `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql` (copie DEFINER 8j — la forme LIVE ; ⚠ avertissement en tête du fichier source : toute modification du corps DOIT être miroitée ici)

**Interfaces:**
- Produces: chaque carte porte `membership` (même forme que la fiche — une seule forme partout ; le spec demandait un booléen minimal, on émet la forme complète du résolveur : additif, cohérent, ZÉRO deuxième forme). Consommé par la liste partenaire `view=card` ; l'Explorer ignore la clé (parseurs par clés connues).

- [ ] **Step 1: Dans le cards CTE (les deux fichiers), ajouter un LATERAL et la clé**

Après `FROM base b CROSS JOIN lang` ajouter :

```sql
    -- §185 : adhésion résolue contre l'ORG éditrice principale — par carte (pages <= 200,
    -- résolveur = probes PK, hot-path safe ; le set-based §35 vise les scans corpus entier).
    LEFT JOIN LATERAL (
      SELECT api.resolve_object_membership(
        b.id,
        (SELECT l.org_object_id
         FROM object_org_link l
         JOIN ref_org_role r ON r.id = l.role_id AND r.code = 'publisher'
         WHERE l.object_id = b.id
         ORDER BY l.is_primary DESC NULLS LAST, l.created_at ASC, l.org_object_id ASC
         LIMIT 1)
      ) AS doc
    ) membership ON TRUE
```

et dans le `jsonb_build_object` de la carte, après `'updated_at', b.updated_at` :

```sql
        ,'membership', membership.doc
```

⚠ `get_object_cards_batch` dans `api_views_functions.sql` est `LANGUAGE sql` SECURITY INVOKER ; la copie 8j est SECURITY DEFINER — ne toucher QUE le cards CTE, à l'identique dans les deux fichiers.

- [ ] **Step 2: Sonde de test** — append au DO block du test :

```sql
  -- ---------- cards batch : la carte porte membership ----------
  ASSERT ((api.get_object_cards_batch(ARRAY[v_resI])::jsonb)->0->'membership'->>'is_member')::boolean,
         'cards batch: la carte doit porter membership.is_member';
```

- [ ] **Step 3: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql" "Base de donnée DLL et API/tests/test_org_membership_policy.sql" && git commit -m "feat(sql): clé membership sur les cartes get_object_cards_batch (source + copie DEFINER 8j) §185" -- "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql" "Base de donnée DLL et API/tests/test_org_membership_policy.sql"
```

---

### Task 8: CRM SQL — `list_crm_directory` (+filtre) et `list_actor_crm`

**Files:**
- Modify: `Base de donnée DLL et API/migration_crm_module.sql:1011-1161` (list_crm_directory), `:1198-1210` (list_actor_crm v_objects), `:1617-1620` (grants)

**Interfaces:**
- Consumes: `api.org_adherent_object_ids` (Task 3), `api.current_user_org_id()`.
- Produces: signature `api.list_crm_directory(p_topic_code text, p_status text, p_from timestamptz, p_to timestamptz, p_is_adherent boolean DEFAULT NULL)` ; items annuaire : `objects[].is_adherent` + `objects[].is_eligible` (boolean|null), `adherent_count` + `eligible_count` (int|null) ; `list_actor_crm.objects[].is_adherent`/`is_eligible` idem. NULL partout quand `current_user_org_id()` est NULL (superuser sans ORG) — et le filtre est alors IGNORÉ.

- [ ] **Step 1: `list_crm_directory` — signature + variables**

En tête du fichier de la fonction : remplacer `DROP FUNCTION IF EXISTS api.list_crm_directory();` par

```sql
DROP FUNCTION IF EXISTS api.list_crm_directory();
DROP FUNCTION IF EXISTS api.list_crm_directory(text, text, timestamptz, timestamptz);
```

puis la nouvelle signature :

```sql
CREATE OR REPLACE FUNCTION api.list_crm_directory(
  p_topic_code text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_is_adherent boolean DEFAULT NULL
) RETURNS jsonb
```

et dans le DECLARE :

```sql
  -- §185 : adhésion résolue contre l'ORG active de l'utilisateur. NULL (superuser sans ORG)
  -- => statut indéterminé (is_adherent null partout) ET filtre p_is_adherent IGNORÉ.
  v_member_org  text := api.current_user_org_id();
  v_member_ids  text[];
  v_elig_types  object_type[];
```

après le bloc de validation des filtres :

```sql
  IF v_member_org IS NOT NULL THEN
    v_member_ids := ARRAY(SELECT api.org_adherent_object_ids(v_member_org));
    SELECT p.eligible_types INTO v_elig_types
    FROM org_membership_policy p WHERE p.org_object_id = v_member_org;
  END IF;
```

- [ ] **Step 2: `links` LATERAL — per-object flags + agrégats**

Remplacer le LATERAL `links` (lignes 1091-1102) par :

```sql
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
               'object_id', ar.object_id, 'object_name', o.name, 'object_type', o.object_type,
               'role_name', r.name, 'is_primary', ar.is_primary,
               -- §185 : null quand pas d'ORG active (indéterminé, PAS « non-adhérent »)
               'is_adherent', CASE WHEN v_member_org IS NULL THEN NULL
                                   ELSE (ar.object_id = ANY(COALESCE(v_member_ids, '{}'))) END,
               'is_eligible', CASE WHEN v_member_org IS NULL THEN NULL
                                   ELSE (v_elig_types IS NOT NULL AND o.object_type = ANY(v_elig_types)) END)
             ORDER BY ar.is_primary DESC NULLS LAST, o.name) AS objects,
             count(*) AS n,
             CASE WHEN v_member_org IS NULL THEN NULL
                  ELSE count(*) FILTER (WHERE ar.object_id = ANY(COALESCE(v_member_ids, '{}'))) END AS n_adherent,
             CASE WHEN v_member_org IS NULL THEN NULL
                  ELSE count(*) FILTER (WHERE v_elig_types IS NOT NULL AND o.object_type = ANY(v_elig_types)) END AS n_eligible
      FROM actor_object_role ar
      JOIN object o ON o.id = ar.object_id
      JOIN ref_actor_role r ON r.id = ar.role_id
      WHERE ar.actor_id = base.actor_id
        AND (v_scope IS NULL OR ar.object_id = ANY(v_scope))
    ) links ON TRUE
```

et dans le `jsonb_build_object` de l'item, après `'object_count', COALESCE(links.n, 0),` :

```sql
        'adherent_count', links.n_adherent,
        'eligible_count', links.n_eligible,
```

- [ ] **Step 3: Filtre serveur `p_is_adherent` (partition totale)**

Dans le WHERE du sous-select `base` (après la clause `v_filtered`), ajouter :

```sql
        -- §185 filtre adhérent : true = >=1 établissement adhérent ; false = aucun (y compris
        -- acteurs sans établissement). IGNORÉ sans ORG active (v_member_org NULL).
        AND (p_is_adherent IS NULL OR v_member_org IS NULL
             OR (p_is_adherent = EXISTS (
                   SELECT 1 FROM actor_object_role arf
                   WHERE arf.actor_id = a0.id
                     AND arf.object_id = ANY(COALESCE(v_member_ids, '{}'))
                     AND (v_scope IS NULL OR arf.object_id = ANY(v_scope)))))
```

- [ ] **Step 4: `list_actor_crm` — mêmes flags sur `v_objects`**

Dans le DECLARE ajouter `v_member_org text := api.current_user_org_id(); v_member_ids text[]; v_elig_types object_type[];` + le même IF de résolution qu'au Step 1 (après le gate 42501). Dans le `jsonb_build_object` du sous-select `qo` (ligne 1200-1203), après `'is_primary', ar.is_primary` :

```sql
      ,'is_adherent', CASE WHEN v_member_org IS NULL THEN NULL
                           ELSE (ar.object_id = ANY(COALESCE(v_member_ids, '{}'))) END
      ,'is_eligible', CASE WHEN v_member_org IS NULL THEN NULL
                           ELSE (v_elig_types IS NOT NULL AND o.object_type = ANY(v_elig_types)) END
```

- [ ] **Step 5: Grants (nouvelle signature) + NOTIFY**

Remplacer les lignes 1617-1618 par :

```sql
REVOKE ALL ON FUNCTION api.list_crm_directory(text, text, timestamptz, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_directory(text, text, timestamptz, timestamptz, boolean) TO authenticated, service_role;
```

(Changement de signature ⇒ au déploiement live : `NOTIFY pgrst, 'reload schema';` — Task 12.)

- [ ] **Step 6: Sondes de test** — append au DO block de `tests/test_org_membership_policy.sql` un persona CRM (fixture user membre d'orgI + acteur lié à `v_resI` et `v_itiI`, patron `test_object_review_read_gate.sql` : `auth.users` + `app_user_profile` + `user_org_membership` + `actor` + `actor_object_role`) :

```sql
  -- ---------- CRM : annuaire (persona membre orgI) ----------
  INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-a000-000000001851', 'adherent_u@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES ('00000000-0000-4000-a000-000000001851', 'tourism_agent') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES ('00000000-0000-4000-a000-000000001851', v_orgI, TRUE);
  INSERT INTO actor (id, display_name) VALUES ('00000000-0000-4000-b000-000000001852', 'Acteur Test 185');
  INSERT INTO actor_object_role (actor_id, object_id, role_id)
  SELECT '00000000-0000-4000-b000-000000001852', v_resI, id FROM ref_actor_role ORDER BY position LIMIT 1;
  INSERT INTO actor_object_role (actor_id, object_id, role_id)
  SELECT '00000000-0000-4000-b000-000000001852', v_itiI, id FROM ref_actor_role ORDER BY position LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-000000001851', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_doc := api.list_crm_directory();
    ASSERT (SELECT bool_or((item->>'adherent_count')::int = 1 AND (item->>'eligible_count')::int = 1)
            FROM jsonb_array_elements(v_doc) item
            WHERE item->>'actor_id' = '00000000-0000-4000-b000-000000001852'),
           'annuaire: adherent_count=1 (resI) / eligible_count=1 (ITI exclu de M)';
    ASSERT jsonb_array_length(api.list_crm_directory(NULL, NULL, NULL, NULL, false)) =
           jsonb_array_length(v_doc) - 1,
           'annuaire: filtre is_adherent=false doit exclure l''acteur adhérent';
    ASSERT (SELECT bool_and((obj->>'is_adherent') IS NOT NULL)
            FROM jsonb_array_elements(v_doc) item, jsonb_array_elements(item->'objects') obj
            WHERE item->>'actor_id' = '00000000-0000-4000-b000-000000001852'),
           'annuaire: is_adherent booléen (jamais null) pour un membre d''ORG';
  RESET ROLE;
```

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/migration_crm_module.sql" "Base de donnée DLL et API/tests/test_org_membership_policy.sql" && git commit -m "feat(sql): CRM — is_adherent/is_eligible par établissement + agrégats acteur + filtre serveur p_is_adherent (§185)" -- "Base de donnée DLL et API/migration_crm_module.sql" "Base de donnée DLL et API/tests/test_org_membership_policy.sql"
```

---

### Task 9: FE — parser workspace (module memberships, clé `membership`)

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts:860-891` (types), `:2875-2960` (parse), fixture `object-workspace-parser.test.ts:200-218`
- Test: `bertel-tourism-ui/src/services/object-workspace-parser.test.ts`

**Interfaces:**
- Produces (consommé par Tasks 10-11) :

```ts
export interface ObjectWorkspaceMembershipModule {
  campaignOptions: WorkspaceReferenceOption[];
  tierOptions: WorkspaceReferenceOption[];
  scopeOptions: ObjectWorkspaceMembershipScopeOption[];
  items: ObjectWorkspaceMembershipItem[];
  /** §185 — résolution portée par la clé `membership` de get_object_resource. */
  resolvedOrgObjectId: string | null;
  policyMode: 'implicit_by_presence' | 'explicit' | null;
  isMember: boolean | null;
  memberSince: string | null;
  unavailableReason: string | null;
}
```

- [ ] **Step 1: Écrire les tests (RED)** — dans `object-workspace-parser.test.ts`, remplacer la fixture `current_membership` par la nouvelle forme et ajouter :

```ts
it('parse la clé membership — implicite', () => {
  const resource = parseObjectWorkspaceResource({
    ...baseRawFixture,
    membership: {
      is_member: true, since: '2026-05-01T09:24:21+00:00',
      mode: 'implicit_by_presence', org_object_id: 'ORG0001', details: null,
    },
  }, detailFixture);
  expect(resource.memberships.policyMode).toBe('implicit_by_presence');
  expect(resource.memberships.isMember).toBe(true);
  expect(resource.memberships.memberSince).toBe('2026-05-01T09:24:21+00:00');
  expect(resource.memberships.resolvedOrgObjectId).toBe('ORG0001');
  expect(resource.memberships.items).toHaveLength(0); // implicite: jamais de lignes
});

it('parse la clé membership — explicite avec details => un item éditable', () => {
  const resource = parseObjectWorkspaceResource({
    ...baseRawFixture,
    membership: {
      is_member: true, since: '2026-02-01T00:00:00+00:00', mode: 'explicit', org_object_id: 'ORG0001',
      details: { id: 'm1', campaign_code: '2026', campaign_name: 'Campagne 2026',
                 tier_code: 'PREMIUM', tier_name: 'Premium', status: 'paid',
                 starts_at: '2026-02-01', ends_at: '2026-12-31' },
    },
  }, detailFixture);
  expect(resource.memberships.policyMode).toBe('explicit');
  expect(resource.memberships.items[0]?.campaignCode).toBe('2026');
  expect(resource.memberships.items[0]?.orgObjectId).toBe('ORG0001');
});

it('membership absent => module neutre (mode null)', () => {
  const resource = parseObjectWorkspaceResource(baseRawFixture, detailFixture);
  expect(resource.memberships.policyMode).toBeNull();
  expect(resource.memberships.isMember).toBeNull();
});
```

- [ ] **Step 2: Run (FAIL attendu)**

```
cd bertel-tourism-ui && npx jest src/services/object-workspace-parser.test.ts --silent
```

- [ ] **Step 3: Implémenter** — dans `parseWorkspaceMembershipModule` (2875-2960) : lire `raw.membership` (plus JAMAIS `raw.current_membership`) ; le fallback item unique se construit depuis `membership.details` (en injectant `org_object_id`/`object_id` du wrapper pour `parseWorkspaceMembershipItem`) ; renseigner les 4 nouveaux champs (types stricts, `null` par défaut) :

```ts
function parseWorkspaceMembershipModule(raw: Record<string, unknown>, detail: ObjectDetail): ObjectWorkspaceMembershipModule {
  const membership = readRecord(raw.membership);
  const details = readRecord(membership.details);
  const mode = readString(membership.mode) as 'implicit_by_presence' | 'explicit' | '';
  const rawMemberships = [...readArray(raw.memberships), ...readArray(raw.object_memberships)];
  const detailItem = Object.keys(details).length > 0
    ? [{ ...details, org_object_id: membership.org_object_id, object_id: detail.id }]
    : [];
  const combined = rawMemberships.length > 0 ? rawMemberships
    : mode === 'implicit_by_presence' ? [] : detailItem;
  const items = combined.map((record, index) => parseWorkspaceMembershipItem(record as GenericRecord, index, detail));
  // scopeOptions inchangé (dérivé des items) — la Task 10 les remplace par l'ORG résolue au chargement live.
  return {
    campaignOptions: /* inchangé */,
    tierOptions: /* inchangé */,
    scopeOptions: /* inchangé */,
    items,
    resolvedOrgObjectId: readString(membership.org_object_id) || null,
    policyMode: mode === 'implicit_by_presence' || mode === 'explicit' ? mode : null,
    isMember: typeof membership.is_member === 'boolean' ? membership.is_member : null,
    memberSince: readString(membership.since) || null,
    unavailableReason: null,
  };
}
```

- [ ] **Step 4: Run (PASS) + tsc**

```
cd bertel-tourism-ui && npx jest src/services/object-workspace-parser.test.ts --silent && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "bertel-tourism-ui/src/services/object-workspace-parser.ts" "bertel-tourism-ui/src/services/object-workspace-parser.test.ts" && git commit -m "feat(editor): parser workspace — clé membership (mode/isMember/since/ORG résolue), current_membership retirée (§185)" -- "bertel-tourism-ui/src/services/object-workspace-parser.ts" "bertel-tourism-ui/src/services/object-workspace-parser.test.ts"
```

---

### Task 10: FE — loader + saver §17 scopés à l'ORG résolue

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts:2013-2136` (loader), `:5741-5885` (saver)
- Test: `bertel-tourism-ui/src/services/object-workspace.memberships.test.ts` (create)

**Interfaces:**
- Consumes: `resolvedOrgObjectId` / `policyMode` du module (Task 9).
- Produces: **invariant saver** — charge/modifie/supprime UNIQUEMENT les lignes `org_object_id === resolvedOrgObjectId` ; refuse (throw) en mode implicite.

- [ ] **Step 1: Tests (RED)** — nouveau `object-workspace.memberships.test.ts` avec un mock Supabase chainable (patron des tests services existants) :

```ts
it('saver: refuse en mode implicite (garde miroir du trigger)', async () => {
  await expect(saveObjectWorkspaceMemberships('OBJ1', {
    ...moduleFixture, policyMode: 'implicit_by_presence', resolvedOrgObjectId: 'ORG1',
  })).rejects.toThrow(/implicite/i);
});

it('saver: ne supprime QUE les lignes de l’ORG résolue', async () => {
  // mock: object_membership contient m-orgA (ORG1) et m-orgB (ORG2) pour OBJ1 ;
  // le formulaire ne garde aucun item => seule m-orgA est supprimée.
  await saveObjectWorkspaceMemberships('OBJ1', {
    ...moduleFixture, policyMode: 'explicit', resolvedOrgObjectId: 'ORG1', items: [],
  });
  expect(deletedIds).toEqual(['m-orgA']);           // jamais m-orgB
  expect(selectFilters).toContainEqual({ column: 'org_object_id', value: 'ORG1' });
});

it('saver: rejette un item portant une autre ORG que l’ORG résolue', async () => {
  await expect(saveObjectWorkspaceMemberships('OBJ1', {
    ...moduleFixture, policyMode: 'explicit', resolvedOrgObjectId: 'ORG1',
    items: [{ ...itemFixture, orgObjectId: 'ORG2' }],
  })).rejects.toThrow(/Organisation d'adhesion invalide/);
});
```

- [ ] **Step 2: Run (FAIL)** — `cd bertel-tourism-ui && npx jest src/services/object-workspace.memberships.test.ts --silent`

- [ ] **Step 3: Implémenter le saver** — en tête de `saveObjectWorkspaceMemberships` :

```ts
  // §185 — garde miroir du trigger fail-closed (le trigger reste le verrou dur).
  if (input.policyMode === 'implicit_by_presence') {
    throw new Error('Adhésion implicite par présence pour cette organisation — aucune ligne explicite à enregistrer.');
  }
  const resolvedOrg = input.resolvedOrgObjectId;
  if (!resolvedOrg) {
    throw new Error("Aucune organisation éditrice principale résolue — impossible d'enregistrer les adhésions.");
  }
```

puis scoper : `allowedOrgIds` devient `new Set([resolvedOrg])` (supprimer le chargement `object_org_link` et l'arm ORG-self) ; le select des lignes objet ajoute `.eq('org_object_id', resolvedOrg)` ; le select org-global remplace `.in('org_object_id', Array.from(allowedOrgIds))` par `.eq('org_object_id', resolvedOrg)` ; `existingIds`/`idsToDelete` sont ainsi nativement scopés.

- [ ] **Step 4: Implémenter le loader** — dans `getObjectWorkspaceMembershipModule` : si `baseModule.policyMode === 'implicit_by_presence'` → return early `{ ...baseModule, items: [], scopeOptions: baseModule.resolvedOrgObjectId ? [{ orgObjectId: baseModule.resolvedOrgObjectId, label: <nom ORG via un select object>, isPrimary: true }] : [], unavailableReason: null }` (AUCUNE lecture `object_membership`). Sinon (explicite) : conserver la logique actuelle mais **scopée** — remplacer `scopeOrgIds` par `[baseModule.resolvedOrgObjectId]` (fallback : lien publisher primaire via `.select('org_object_id, is_primary, ref_org_role:role_id(code)')` filtré `code==='publisher'`, ordre `is_primary desc, created_at asc`), et les deux selects `object_membership` gagnent `.eq('org_object_id', resolvedOrg)`.

- [ ] **Step 5: Run (PASS) + tsc + suite services**

```
cd bertel-tourism-ui && npx jest src/services/object-workspace.memberships.test.ts src/services/object-workspace-parser.test.ts --silent && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add "bertel-tourism-ui/src/services/object-workspace.ts" "bertel-tourism-ui/src/services/object-workspace.memberships.test.ts" && git commit -m "feat(editor): loader+saver adhésions scopés à l'ORG éditrice principale, refus en mode implicite (§185)" -- "bertel-tourism-ui/src/services/object-workspace.ts" "bertel-tourism-ui/src/services/object-workspace.memberships.test.ts"
```

---

### Task 11: FE — §17 SectionAttachments : résumé lecture seule en implicite

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx:145-193`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx`

**Interfaces:**
- Consumes: `memberships.policyMode / isMember / memberSince` (Task 9), `ModuleUnavailableNotice` NON utilisé (résumé positif, pas un module indisponible).

- [ ] **Step 1: Tests (RED)** — dans `SectionAttachments.test.tsx` :

```tsx
it('mode implicite : résumé lecture seule, PAS de bouton « Ajouter une adhésion »', () => {
  renderSection({ memberships: { ...membershipsFixture,
    policyMode: 'implicit_by_presence', isMember: true,
    memberSince: '2026-05-01T09:24:21+00:00', resolvedOrgObjectId: 'ORG1', items: [] } });
  expect(screen.getByText(/Adhérent/)).toBeInTheDocument();
  expect(screen.getByText(/présence en base depuis/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ajouter une adhésion/ })).not.toBeInTheDocument();
});

it('mode implicite, objet non éligible : « Non adhérent », toujours pas d’authoring', () => {
  renderSection({ memberships: { ...membershipsFixture,
    policyMode: 'implicit_by_presence', isMember: false, memberSince: null, items: [] } });
  expect(screen.getByText(/Non adhérent/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ajouter une adhésion/ })).not.toBeInTheDocument();
});

it('mode explicite : UI actuelle inchangée (liste + bouton)', () => {
  renderSection({ memberships: { ...membershipsFixture, policyMode: 'explicit' } });
  expect(screen.getByRole('button', { name: /Ajouter une adhésion/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run (FAIL)** — `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAttachments.test.tsx --silent`

- [ ] **Step 3: Implémenter** — dans le bloc « Adhésions OTI » (lignes 145-191), brancher AVANT l'existant :

```tsx
      <div className="chip-group__label" style={{ marginTop: 14 }}>Adhésions OTI</div>
      {memberships.policyMode === 'implicit_by_presence' ? (
        // §185 — adhésion implicite par présence : résumé LECTURE SEULE, contrôles RETIRÉS
        // (pas de write-trap : le trigger fail-closed refuse toute ligne explicite côté base).
        <p role="note" style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 12px',
             padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-tint)',
             border: '1px solid var(--line-soft)' }}>
          {memberships.isMember ? (
            <>
              <strong>Adhérent</strong> — présence en base depuis{' '}
              {memberships.memberSince
                ? new Date(memberships.memberSince).toLocaleDateString('fr-FR')
                : 'une date inconnue'}
              . Adhésion implicite : tout établissement de cette organisation est adhérent tant que sa fiche existe.
            </>
          ) : (
            <>
              <strong>Non adhérent</strong> — ce type de fiche (ou son statut) n’entre pas dans la
              politique d’adhésion implicite de l’organisation.
            </>
          )}
        </p>
      ) : (
        <>
          {/* … BLOC EXISTANT INTÉGRAL (unavailableReason / liste / bouton / modal), lignes 146-191 … */}
        </>
      )}
```

Le `StatCard` « Adhésions actives » (`paidCount`) : en implicite, afficher `memberships.isMember ? 'Adhérent' : '—'` à la place du ratio.

- [ ] **Step 4: Run (PASS) + tsc** — `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAttachments.test.tsx --silent && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx" "bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx" && git commit -m "feat(editor): §17 résumé adhésion lecture seule en mode implicite — authoring campagne/palier retiré (§185)" -- "bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx" "bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx"
```

---

### Task 12: FE — drawer + detail-parser (clé `membership`)

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-detail-parser.ts:245` (KNOWN_TOP_LEVEL_KEYS), `bertel-tourism-ui/src/features/object-drawer/utils.ts:1241-1252` (parseMemberships)
- Test: `bertel-tourism-ui/src/services/object-detail-parser.test.ts`

**Interfaces:**
- Consumes: clé `membership` (Task 6). Le drawer n'affiche une mini-carte QUE pour une adhésion **explicite** (details non-null) — pas de badge implicite (spec §5).

- [ ] **Step 1: Tests (RED)** — dans `object-detail-parser.test.ts` :

```ts
it('membership explicite => une mini-carte adhésion drawer', () => {
  const detail = parseObjectDetail({ ...rawFixture,
    membership: { is_member: true, since: '2026-02-01T00:00:00+00:00', mode: 'explicit',
      org_object_id: 'ORG1', details: { id: 'm1', campaign_name: 'Campagne 2026',
      tier_name: 'Premium', status: 'paid', ends_at: '2026-12-31' } } });
  expect(detail.relations.memberships).toHaveLength(1);
  expect(detail.relations.memberships[0]?.name).toBe('Campagne 2026');
});

it('membership implicite => AUCUNE mini-carte (pas de badge drawer, spec §5)', () => {
  const detail = parseObjectDetail({ ...rawFixture,
    membership: { is_member: true, since: '2026-05-01T09:24:21+00:00',
      mode: 'implicit_by_presence', org_object_id: 'ORG1', details: null } });
  expect(detail.relations.memberships).toHaveLength(0);
});
```

- [ ] **Step 2: Run (FAIL)** — `cd bertel-tourism-ui && npx jest src/services/object-detail-parser.test.ts --silent`

- [ ] **Step 3: Implémenter** — `parseMemberships` (drawer utils) lit désormais la nouvelle clé (l'ancienne lecture `raw.memberships ?? raw.object_memberships` était MORTE sur live — jamais émise) :

```ts
export function parseMemberships(raw: Record<string, unknown>): MembershipItem[] {
  const membership = readRecord(raw.membership);
  const details = readRecord(membership.details);
  if (Object.keys(details).length === 0) return []; // implicite ou non-adhérent : pas de mini-carte
  return [{
    id: readString(details.id, 'membership-0'),
    name: readString(details.campaign_name, 'Adhesion'),
    tier: readString(details.tier_name, 'Standard'),
    status: readString(details.status, 'Statut inconnu'),
    invoiceStatus: readString(details.payment_date, 'Facture non renseignee'),
    visibilityImpact: readString(details.status) === 'paid' ? 'Visibilite active' : 'Suivi commercial interne',
    expiresAt: readString(details.ends_at, 'Echeance non renseignee'),
    campaign: readString(details.campaign_name),
  }];
}
```

Dans `object-detail-parser.ts` : remplacer `'current_membership'` par `'membership'` dans `KNOWN_TOP_LEVEL_KEYS` (garder aussi `'memberships'`/`'object_memberships'` — toujours tolérés en entrée).

- [ ] **Step 4: Run (PASS) + tsc + suites voisines** — `cd bertel-tourism-ui && npx jest src/services/object-detail-parser.test.ts src/features/object-drawer --silent && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "bertel-tourism-ui/src/services/object-detail-parser.ts" "bertel-tourism-ui/src/features/object-drawer/utils.ts" "bertel-tourism-ui/src/services/object-detail-parser.test.ts" && git commit -m "feat(drawer): mini-cartes adhésion depuis membership.details (explicite seulement) — lecture morte memberships[] remplacée (§185)" -- "bertel-tourism-ui/src/services/object-detail-parser.ts" "bertel-tourism-ui/src/features/object-drawer/utils.ts" "bertel-tourism-ui/src/services/object-detail-parser.test.ts"
```

---

### Task 13: FE — service CRM (filtres, types, parseurs)

**Files:**
- Modify: `bertel-tourism-ui/src/services/crm.ts:202-314`
- Test: `bertel-tourism-ui/src/services/crm.test.ts` (create si absent, sinon append)

**Interfaces:**
- Produces (consommé par Tasks 14-15) :

```ts
export interface CrmDirectoryFilters { topicCode?: string; status?: 'active' | 'done'; from?: string; to?: string;
  /** §185 — true = acteurs avec >=1 établissement adhérent ; false = aucun ; absent = pas de filtre. */
  isAdherent?: boolean; }
export interface CrmDirectoryObjectLink { objectId: string; objectName: string; objectType: string;
  roleName: string | null; isPrimary: boolean; isAdherent: boolean | null; isEligible: boolean | null; }
export interface CrmDirectoryEntry { /* existant + */ adherentCount: number | null; eligibleCount: number | null; }
// list_actor_crm : ActorCrmObjectLink étend CrmDirectoryObjectLink (roleCode) => hérite des 2 flags.
```

- [ ] **Step 1: Tests (RED)** — parseurs purs :

```ts
it('parseCrmDirectoryEntry lit adherent_count/eligible_count et les flags par objet', () => {
  const entry = parseCrmDirectoryEntry({ actor_id: 'a1', display_name: 'X',
    objects: [{ object_id: 'o1', object_name: 'Resto', object_type: 'RES',
                role_name: null, is_primary: true, is_adherent: true, is_eligible: true }],
    adherent_count: 1, eligible_count: 2 });
  expect(entry.adherentCount).toBe(1);
  expect(entry.eligibleCount).toBe(2);
  expect(entry.objects[0]?.isAdherent).toBe(true);
});

it('superuser sans ORG : null préservé (jamais coerce en false)', () => {
  const entry = parseCrmDirectoryEntry({ actor_id: 'a1', display_name: 'X',
    objects: [{ object_id: 'o1', object_name: 'Resto', object_type: 'RES',
                role_name: null, is_primary: true, is_adherent: null, is_eligible: null }],
    adherent_count: null, eligible_count: null });
  expect(entry.adherentCount).toBeNull();
  expect(entry.objects[0]?.isAdherent).toBeNull();
});
```

- [ ] **Step 2: Run (FAIL)** — `cd bertel-tourism-ui && npx jest src/services/crm.test.ts --silent`

- [ ] **Step 3: Implémenter** — `parseDirectoryObjectLink` : `isAdherent: typeof record.is_adherent === 'boolean' ? record.is_adherent : null` (idem `isEligible`) ; `parseCrmDirectoryEntry` : `adherentCount: typeof record.adherent_count === 'number' ? record.adherent_count : null` (idem eligible) ; `listCrmDirectory` : `p_is_adherent: filters.isAdherent ?? null` dans l'appel RPC.

- [ ] **Step 4: Run (PASS) + tsc** — `cd bertel-tourism-ui && npx jest src/services/crm.test.ts --silent && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "bertel-tourism-ui/src/services/crm.ts" "bertel-tourism-ui/src/services/crm.test.ts" && git commit -m "feat(crm): service annuaire — flags isAdherent/isEligible, agrégats acteur, filtre serveur p_is_adherent (§185)" -- "bertel-tourism-ui/src/services/crm.ts" "bertel-tourism-ui/src/services/crm.test.ts"
```

---

### Task 14: FE — CRM annuaire (badge, agrégat, filtre, superuser-null)

**Files:**
- Modify: `bertel-tourism-ui/src/features/crm/CrmFilterBar.tsx`, `bertel-tourism-ui/src/features/crm/CrmAnnuaire.tsx`, `bertel-tourism-ui/src/features/crm/CrmTimelineView.tsx` (fan-out onChange — la barre est partagée)
- Test: `bertel-tourism-ui/src/features/crm/CrmAnnuaire.test.tsx` (create)

**Interfaces:**
- Consumes: Task 13. `CrmFilterBar` gagne `adherent: AdherentItem`, `showAdherent: boolean`, et `onChange` fan-out le 4e champ.

- [ ] **Step 1: Tests (RED)** — `CrmAnnuaire.test.tsx` (mock `listCrmDirectory`) :

```tsx
it('badge « Adhérent » + agrégat N/M sur la ligne acteur', async () => {
  mockDirectory([entryWith({ adherentCount: 1, eligibleCount: 2,
    objects: [linkWith({ isAdherent: true })] })]);
  render(<CrmAnnuaire canWrite onOpenActor={jest.fn()} />);
  expect(await screen.findByText('Adhérent')).toBeInTheDocument();
  expect(screen.getByText('1/2 adhérents')).toBeInTheDocument();
});

it('segment de filtre Adhérents visible quand le signal existe', async () => {
  mockDirectory([entryWith({ adherentCount: 1, eligibleCount: 1 })]);
  render(<CrmAnnuaire canWrite onOpenActor={jest.fn()} />);
  expect(await screen.findByText('Adhérents')).toBeInTheDocument();
});

it('superuser sans ORG (signal null partout) : ni badge, ni agrégat, ni filtre', async () => {
  mockDirectory([entryWith({ adherentCount: null, eligibleCount: null,
    objects: [linkWith({ isAdherent: null })] })]);
  render(<CrmAnnuaire canWrite onOpenActor={jest.fn()} />);
  await screen.findByText(entryDisplayName);
  expect(screen.queryByText('Adhérent')).not.toBeInTheDocument();
  expect(screen.queryByText('Adhérents')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run (FAIL)** — `cd bertel-tourism-ui && npx jest src/features/crm/CrmAnnuaire.test.tsx --silent`

- [ ] **Step 3: Implémenter `CrmFilterBar`** — vocabulaire + prop optionnelle :

```ts
export const ADHERENT_ITEMS = ['Adhérents', 'Non-adhérents', 'Tous'] as const;
export type AdherentItem = (typeof ADHERENT_ITEMS)[number];
export const ADHERENT_DEFAULT: AdherentItem = 'Tous';
const ADHERENT_VALUES: Record<AdherentItem, boolean | undefined> = {
  'Adhérents': true, 'Non-adhérents': false, Tous: undefined };
export function adherentValueOf(item: AdherentItem): boolean | undefined { return ADHERENT_VALUES[item]; }
```

Props : `adherent: AdherentItem; showAdherent: boolean;` + `onChange` inclut `adherent` ; rendu : `{showAdherent && <Seg items={[...ADHERENT_ITEMS]} value={adherent} onChange={...} />}`. `CrmTimelineView` (autre hôte de la barre) passe `showAdherent={false}` + `adherent={ADHERENT_DEFAULT}` (fan-out inerte).

- [ ] **Step 4: Implémenter `CrmAnnuaire`** —
  - état `const [adherentItem, setAdherentItem] = useState<AdherentItem>(ADHERENT_DEFAULT);` ; `const isAdherent = adherentValueOf(adherentItem);` rejoint le memo `filters` + `hasFilters` + la queryKey.
  - signal : `const adherenceKnown = entries.length > 0 && entries.some((e) => e.adherentCount !== null);` → `showAdherent={adherenceKnown}` (masqué aussi à annuaire vide).
  - cellule établissements : sous le premier objet, `{first?.isAdherent && <span className="pill-mini principal">Adhérent</span>}` ; agrégat `{entry.eligibleCount != null && entry.eligibleCount > 0 && (<small>{entry.adherentCount ?? 0}/{entry.eligibleCount} adhérents</small>)}` (M = éligibles uniquement ; masqué à M=0 — spec §6).

- [ ] **Step 5: Run (PASS) + tsc + suites crm** — `cd bertel-tourism-ui && npx jest src/features/crm --silent && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add "bertel-tourism-ui/src/features/crm/CrmFilterBar.tsx" "bertel-tourism-ui/src/features/crm/CrmAnnuaire.tsx" "bertel-tourism-ui/src/features/crm/CrmTimelineView.tsx" "bertel-tourism-ui/src/features/crm/CrmAnnuaire.test.tsx" && git commit -m "feat(crm): annuaire — badge Adhérent, agrégat N/M éligibles, filtre serveur, statut null superuser sans ORG (§185)" -- "bertel-tourism-ui/src/features/crm/CrmFilterBar.tsx" "bertel-tourism-ui/src/features/crm/CrmAnnuaire.tsx" "bertel-tourism-ui/src/features/crm/CrmTimelineView.tsx" "bertel-tourism-ui/src/features/crm/CrmAnnuaire.test.tsx"
```

---

### Task 15: FE — fiche acteur (badge par établissement + agrégat)

**Files:**
- Modify: `bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx:529-555`
- Test: `bertel-tourism-ui/src/features/crm/CrmActorFiche.test.tsx` (append si existant, sinon create)

**Interfaces:**
- Consumes: `snapshot.objects[]` de `list_actor_crm` (flags Task 8, parsés Task 13 via `ActorCrmObjectLink`).

- [ ] **Step 1: Tests (RED)**

```tsx
it('badge « Adhérent » sur chaque établissement adhérent + agrégat sous le titre du rail', async () => {
  mockActorCrm({ objects: [
    objLink({ objectId: 'o1', isAdherent: true,  isEligible: true }),
    objLink({ objectId: 'o2', isAdherent: false, isEligible: true }),
    objLink({ objectId: 'o3', isAdherent: null,  isEligible: false }), // type non éligible
  ]});
  render(<CrmActorFiche actorId="a1" canWrite onBack={jest.fn()} onOpenObject={jest.fn()} />);
  expect(await screen.findByText('1 adhérent sur 2 éligibles')).toBeInTheDocument();
  expect(screen.getAllByText('Adhérent')).toHaveLength(1);
});

it('signal null (superuser sans ORG) : ni badge ni agrégat', async () => {
  mockActorCrm({ objects: [objLink({ isAdherent: null, isEligible: null })] });
  render(<CrmActorFiche actorId="a1" canWrite onBack={jest.fn()} onOpenObject={jest.fn()} />);
  await screen.findByText(/Établissements/);
  expect(screen.queryByText('Adhérent')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run (FAIL)** — `cd bertel-tourism-ui && npx jest src/features/crm/CrmActorFiche.test.tsx --silent`

- [ ] **Step 3: Implémenter** — dans la rcard « Établissements & rôles » :

```tsx
{(() => {
  const eligible = objects.filter((o) => o.isEligible === true);
  const adherent = eligible.filter((o) => o.isAdherent === true);
  return eligible.length > 0 ? (
    <p className="crm-rail__meta">{adherent.length} adhérent{adherent.length > 1 ? 's' : ''} sur {eligible.length} éligible{eligible.length > 1 ? 's' : ''}</p>
  ) : null;
})()}
```

et dans chaque `rel-row`, après le pill `principal` : `{object.isAdherent && <span className="pill-mini principal">Adhérent</span>}`.

- [ ] **Step 4: Run (PASS) + tsc** — `cd bertel-tourism-ui && npx jest src/features/crm --silent && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx" "bertel-tourism-ui/src/features/crm/CrmActorFiche.test.tsx" && git commit -m "feat(crm): fiche acteur — badge Adhérent par établissement + agrégat N adhérents / M éligibles (§185)" -- "bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx" "bertel-tourism-ui/src/features/crm/CrmActorFiche.test.tsx"
```

---

### Task 16: Contrat partenaire — les 3 surfaces docs

**Files:**
- Modify: `docs/guide-partenaires.md` (§3.1.1 + tableau des blocs :172-210), `docs/openapi.json` (schémas `ObjectResource` :978-993 + `CardItem` :890-977), `docs/Bertel_API_v3.postman_collection.json` (descriptions des requêtes Get Object Resource / List Object Resources)

**Interfaces:**
- Consumes: forme `membership` (Tasks 6-7). Aucune modification de route TS nécessaire — la fiche full et les cartes héritent de la clé automatiquement (invariant §177).

- [ ] **Step 1: guide-partenaires.md** — ajouter la ligne au tableau des blocs :

```markdown
| `membership` | Statut d'adhérent auprès de l'ORG éditrice principale : `{is_member, since, mode, org_object_id, details}` — `mode: "implicit_by_presence"` = adhésion par présence en base (OTI sans adhésion payante, `details: null`) ; `mode: "explicit"` = adhésion commerciale (campagne/palier dans `details`) | toujours (aussi sur les cartes de LISTE) |
```

et dans §3.1.1 (`view=full`), noter que la liste (mode carte comme full) porte `membership`.

- [ ] **Step 2: openapi.json** — dans `ObjectResource.properties` (après `published_at`) ET dans `CardItem.properties` :

```json
"membership": {
  "type": "object",
  "description": "Statut d'adhérent auprès de l'ORG éditrice principale. mode=implicit_by_presence : adhésion par présence en base (details null) ; mode=explicit : adhésion commerciale (campagne/palier dans details). since = ISO date-time (implicite : création de la fiche ; explicite : starts_at à minuit UTC).",
  "properties": {
    "is_member": { "type": "boolean" },
    "since": { "type": ["string", "null"], "format": "date-time" },
    "mode": { "type": ["string", "null"], "enum": ["implicit_by_presence", "explicit", null] },
    "org_object_id": { "type": ["string", "null"] },
    "details": { "type": ["object", "null"], "additionalProperties": true }
  }
}
```

- [ ] **Step 3: Postman** — dans les descriptions des requêtes `Get Object Resource` et `List Object Resources (Page)`, mentionner la clé `membership` (une phrase chacune ; les response bodies jouets ne sont pas refaits — hors périmètre).

- [ ] **Step 4: Vérifier la cohérence 3 surfaces** — grep `membership` dans les 3 fichiers : présent partout, `current_membership` nulle part.

```
grep -c "membership" docs/guide-partenaires.md docs/openapi.json "docs/Bertel_API_v3.postman_collection.json"
grep -rn "current_membership" docs/ (attendu: 0 hit hors specs/plans)
```

- [ ] **Step 5: Commit**

```bash
git add "docs/guide-partenaires.md" "docs/openapi.json" "docs/Bertel_API_v3.postman_collection.json" && git commit -m "docs(api): contrat membership sur fiche + cartes — guide, OpenAPI, Postman synchronisés (§185)" -- "docs/guide-partenaires.md" "docs/openapi.json" "docs/Bertel_API_v3.postman_collection.json"
```

---

### Task 17: Déploiement live + documentation de clôture

**Files:**
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (statut live de l'entrée 16n), `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée `§185` — re-grep le dernier `## §` d'abord), `CLAUDE.md` (invariant §10 de la spec), `.claude/WORKFLOW.md` (différés), mémoire auto.

**Interfaces:**
- Consumes: TOUT. Prérequis bloquant : audit Task 1 = GO (liens publisher corrigés).

- [ ] **Step 1: Corriger les rattachements manquants (résultat B de l'audit, si non vide)** — via MCP, transaction : `INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary) SELECT o.id, <oti>, <publisher_role_id>, NOT EXISTS (SELECT 1 FROM object_org_link l2 WHERE l2.object_id = o.id AND l2.is_primary) FROM (...liste auditée...) o ON CONFLICT DO NOTHING;` — puis re-run la requête B (attendu : 0 ligne). Traiter aussi l'objet `lapsed` (décision consignée dans l'audit).

- [ ] **Step 2: Appliquer la migration** — `mcp__supabase__apply_migration` nom `org_membership_policy_185` = contenu intégral de `migration_org_membership_policy.sql`.

- [ ] **Step 3: Appliquer les fonctions modifiées** — dans l'ordre : (a) corps `handle_membership_status_transition` (déjà dans la migration) ; (b) bloc `membership` de `get_object_resource` + les 2 listes de champs — via `.tmp_pgapply/apply_range.cjs` sur les plages modifiées d'`api_views_functions.sql` (recette §106) ; (c) `get_object_cards_batch` copie DEFINER (apply de `migration_cards_batch_authorize_definer.sql` re-jouable) ; (d) CRM : DROP 4-args + CREATE 5-args + `list_actor_crm` + grants (MCP migration `crm_adherent_185`).

- [ ] **Step 4: `NOTIFY pgrst, 'reload schema';`** (signature `list_crm_directory` changée).

- [ ] **Step 5: Vérifications live** (MCP + navigateur) :

```sql
SELECT api.resolve_object_membership(id, 'ORG…OTI') FROM object WHERE object_type='RES' AND status='published' LIMIT 1;  -- is_member true, mode implicit
SELECT count(*) FROM api.org_adherent_object_ids('ORG…OTI');  -- ≈ corpus éligible draft+published (comparer à l'audit A)
SELECT (api.get_object_resource(<id publié>)::jsonb) ? 'membership';  -- true ; ? 'current_membership' -- false
SELECT commercial_visibility, count(*) FROM object GROUP BY 1;  -- INCHANGÉ vs audit (845 active / statu quo lapsed)
```

Puis UI : /crm annuaire (badges + filtre + agrégats en tant que membre OTI ; rien en superuser sans ORG), éditeur §17 d'un objet OTI (résumé lecture seule), fiche partenaire `GET /api/public/objects/{id}` (clé `membership`). Suite FE complète : `cd bertel-tourism-ui && npx jest --silent && npx tsc --noEmit`.

- [ ] **Step 6: Documentation de clôture** — (a) runbook : compléter l'entrée 16n (« Live-applied <date> (MCP `org_membership_policy_185` + `crm_adherent_185` + apply_range …) ; vérifié : <résultats step 5> ») ; (b) decision log : entrée `§185` (règle verrouillée, allowlist, architecture résolveur, verrous, surfaces, différés : synonyme `v_fields` à retirer, UI d'admin de la politique, badge implicite drawer non retenu) ; (c) CLAUDE.md : ajouter l'invariant §10 de la spec (bloc « Adhésion = politique par ORG + résolveur unique ») ; (d) WORKFLOW.md : différés (retrait du synonyme `current_membership`, admin UI politique) ; (e) mémoire auto : nouveau fichier + ligne MEMORY.md.

- [ ] **Step 7: Commit final**

```bash
git add "docs/SQL_ROLLOUT_RUNBOOK.md" "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" "CLAUDE.md" ".claude/WORKFLOW.md" && git commit -m "docs: statut adhérent §185 — runbook 16n live, decision log, invariant CLAUDE.md, différés" -- "docs/SQL_ROLLOUT_RUNBOOK.md" "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" "CLAUDE.md" ".claude/WORKFLOW.md"
```

---

## Auto-revue du plan (exécutée)

- **Couverture spec** : §2 règle → T2/T3/T5 ; §3 table/RLS/seed → T2 ; §4 résolveurs+sécurité+verrous → T3/T4/T5 ; §5 clé unique + sweep consommateurs (parsers ET services chargement/sauvegarde) + §17 lecture seule + saver scopé → T6/T9/T10/T11/T12 ; §6 CRM (badge/agrégat/filtre/superuser-null) → T8/T13/T14/T15 ; §6 API partenaire → T6/T7/T16 ; §7 audit → T1/T17 ; §8 non-objectifs respectés (0 backfill, pas d'UI admin, pas d'Explorer/dashboard/drawer implicite) ; §9 tests/manifest → T5 + tests par task ; §10 invariant → T17.
- **Déviation documentée** : les cartes de liste émettent la forme `membership` COMPLÈTE (pas un booléen sec) — une seule forme de contrat partout, additif (T7, T16).
- **Types cohérents** : `resolvedOrgObjectId/policyMode/isMember/memberSince` définis T9, consommés T10/T11 ; `isAdherent/isEligible/adherentCount/eligibleCount` définis T13, consommés T14/T15 ; signature RPC 5-args unique (T8/T13).

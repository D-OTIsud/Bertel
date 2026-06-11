# Module CRM (P2.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher le module CRM sur les vraies données (3 175 interactions live) : RPCs lecture/écriture sur `crm_interaction`/`crm_task`, page `/crm` réelle (timeline + kanban persisté), §19 éditeur en données réelles avec authoring, et résorption de la dette d'import (sujets + sentiments en FK).

**Architecture:** RPC-only authorize-once + SECURITY DEFINER (§36) — les tables `crm_*` restent verrouillées (familles admin par commande), les PII ne sont jamais lisibles en PostgREST direct. Lecture = membres de l'ORG publisher (`api.current_user_crm_object_ids()`, set-based §35) ; écriture = `write_crm_notes` (déjà seedé) OU admin ORG OU superuser. Backfill : 20 sujets OTI fusionnés dans le domaine `demand_topic`, nouveau domaine `crm_sentiment` (partition dédiée) avec renommage `*_mood_id` → `*_sentiment_id`.

**Tech Stack:** PostgreSQL (Supabase, partitions LIST, RLS, plpgsql DEFINER) · Next.js/React + TanStack Query · Jest/RTL · MCP Supabase pour le déploiement live.

**Spec :** `docs/superpowers/specs/2026-06-11-crm-module-design.md` (6 décisions verrouillées).

**Références vérifiées (2026-06-11) :**
- Policies actuelles : `rls_policies.sql:1403-1409` (FOR ALL admin) ; drops housekeeping `rls_policies.sql:630-631`.
- Helpers existants : `api.user_has_permission` (`rls_policies.sql:2553`), `api.is_platform_superuser` (`rls_policies.sql:1823`), `api.current_user_admin_rank` (`rls_policies.sql:331` — rang admin actif max, NULL si aucun), `api.current_user_extended_object_ids` (`rls_policies.sql:140` — modèle du style set-based).
- `ref_org_role.code = 'publisher'` (fixture `tests/test_room_type_read_gate.sql`).
- `crm_task` indexé (`schema_unified.sql:4029-4031`) ; `crm_interaction` **sans aucun index**.
- Le runbook est à 8y ⇒ cette migration = **8z**. Le journal de décisions est à §57 ⇒ cette passe = **§58** (re-vérifier au moment de documenter).
- `/crm` est gardé par `isDemoOnlyModule('/crm')` (`src/utils/features.ts`) + `FeatureUnavailable` (`src/app/(main)/crm/page.tsx:34-35`) — le README ligne 50 est exact aujourd'hui ; il devra être mis à jour quand CRM sera branché.

---

## Phase A — Backend SQL

### Task 1: Migration `migration_crm_module.sql` — vocabulaires + backfill

**Files:**
- Create: `Base de donnée DLL et API/migration_crm_module.sql`

- [ ] **Step 1: Vérifier le pattern d'index unique des partitions FK-cibles**

Les FK existantes ciblent `ref_code_demand_topic(id)` : un index unique sur `(id)` doit exister sur la partition. Vérifier le pattern à reproduire pour la nouvelle partition :

```sql
-- via MCP execute_sql
SELECT indexdef FROM pg_indexes WHERE tablename IN ('ref_code_demand_topic','ref_code_mood') AND indexdef ILIKE '%(id)%';
```

Attendu : un `CREATE UNIQUE INDEX ... ON ... (id)` par partition (noter le nom exact pour mimer la convention). Si le mécanisme diffère (ex. contrainte UNIQUE), reproduire ce mécanisme-là dans le Step 2.

- [ ] **Step 2: Écrire la première moitié du fichier (partition sentiment, fusion sujets, retrait, renommages, backfills, index)**

```sql
-- migration_crm_module.sql
-- §58 — Module CRM (P2.2) : vocabulaires + backfill + helpers + RPCs + RLS par commande.
--
-- 1) DETTE D'IMPORT (lot1_crm_import_plan.md §4) : demand_topic_id / request_mood_id NULL
--    partout ; sujets résolus stockés dans extra.oti_demand_topic_id (1 344 lignes), humeurs
--    emoji brutes dans extra.humeur_raw (3 175 lignes). Cause : les 20 sujets OTI étaient
--    seedés sous le domaine 'crm_demand_topic_oti' (partition DEFAULT ref_code_other) alors
--    que la FK cible la partition ref_code_demand_topic ; et ref_code_mood est un vocabulaire
--    d'ENVIES TOURISTIQUES (aventure/détente/famille), pas de sentiment relationnel.
-- 2) FUSION SUJETS : les 20 codes OTI migrent vers domain='demand_topic' (row movement
--    automatique vers la bonne partition ; UUID stables ⇒ extra.oti_demand_topic_id reste
--    résoluble). Les 11 demand_topic génériques + les 22 demand_subtopic, JAMAIS référencés
--    (vérifié live 2026-06-11 : 0 object_taxonomy / 0 closure / 0 crm_interaction), sont
--    supprimés — une seule source de vérité (DO block fail-closed re-vérifie avant DELETE).
-- 3) SENTIMENT : nouveau domaine 'crm_sentiment' (partition dédiée), colonnes renommées
--    request_mood_id→request_sentiment_id / response_mood_id→response_sentiment_id (0
--    consommateur), FK re-pointées. Mapping : 😃 tres_positif · 🙂/ok positif ·
--    🤔 interrogatif · 😡 mecontent · 😭 tres_mecontent · 😨 inquiet. extra.humeur_raw
--    conservé (source préservée).
-- 4) ACCÈS (décisions spec 2026-06-11) : RPC-only authorize-once+DEFINER (§36) ; lecture =
--    membres ORG publisher (api.current_user_crm_object_ids, set-based §35) ; écriture =
--    write_crm_notes OU admin ORG OU superuser. Tables verrouillées : famille admin par
--    commande (§47), prédicat wrappé (select auth.role()) (§39). PII jamais en PostgREST
--    direct ⇒ flags advisor security_definer attendus (même classe que get_object_cards_batch).
--
-- PREREQUISITES : schema_unified.sql (tables crm_*), rls_policies.sql (user_has_permission,
-- is_platform_superuser, current_user_admin_rank), seeds_data.sql ÉDITÉ dans la même passe
-- (topics OTI seedés sous 'demand_topic' ; blocs génériques retirés) — sur un build fresh les
-- UPDATE/DELETE/backfills sont des no-op et l'état final est identique (gate fresh-apply).
-- Manifest step 8z. IDEMPOTENT (IF NOT EXISTS / IF EXISTS / ON CONFLICT / WHERE-guarded).
-- REVERSIBLE : renommages inverses + ré-INSERT des codes retirés (archivés dans ce fichier).
-- Couvert par tests/test_crm_module.sql.
BEGIN;

-- ---------- 1. Partition + seeds 'crm_sentiment' ----------
CREATE TABLE IF NOT EXISTS ref_code_crm_sentiment
  PARTITION OF ref_code FOR VALUES IN ('crm_sentiment');
-- FK-cible : même mécanisme d'unicité sur (id) que ref_code_demand_topic (cf. Step 1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_crm_sentiment_id ON ref_code_crm_sentiment(id);

INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('crm_sentiment','tres_positif',  'Très positif',  'Source import : 😃', 1),
 ('crm_sentiment','positif',       'Positif',       'Source import : 🙂 / ok', 2),
 ('crm_sentiment','interrogatif',  'Interrogatif',  'Source import : 🤔', 3),
 ('crm_sentiment','inquiet',       'Inquiet',       'Source import : 😨', 4),
 ('crm_sentiment','mecontent',     'Mécontent',     'Source import : 😡', 5),
 ('crm_sentiment','tres_mecontent','Très mécontent','Source import : 😭', 6)
ON CONFLICT DO NOTHING;

-- ---------- 2. Retrait fail-closed des 11 demand_topic génériques + 22 demand_subtopic ----------
DO $$
DECLARE
  v_refs bigint;
  c_generic_topics text[] := ARRAY['accessibilite','evenement','groupe','information',
    'logistique','marketing','partenariat','presse','reclamation','reservation','urgence'];
BEGIN
  SELECT count(*) INTO v_refs FROM (
    SELECT 1 FROM object_taxonomy ot
      WHERE ot.ref_code_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic')
    UNION ALL
    SELECT 1 FROM ref_code_taxonomy_closure c
      WHERE c.ancestor_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic')
         OR c.descendant_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic')
    UNION ALL
    SELECT 1 FROM crm_interaction ci
      WHERE ci.demand_topic_id IN (SELECT id FROM ref_code
        WHERE domain='demand_topic' AND code = ANY(c_generic_topics))
         OR ci.demand_subtopic_id IS NOT NULL
  ) refs;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'migration_crm_module: % référence(s) vers les codes demand_topic/subtopic à retirer — abandon (fail-closed)', v_refs;
  END IF;
  DELETE FROM ref_code WHERE domain='demand_topic' AND code = ANY(c_generic_topics);
  DELETE FROM ref_code WHERE domain='demand_subtopic';
END$$;

-- ---------- 3. Fusion : les 20 sujets OTI deviennent LE domaine demand_topic ----------
-- Row movement automatique ref_code_other → ref_code_demand_topic ; UUID stables.
UPDATE ref_code SET domain = 'demand_topic' WHERE domain = 'crm_demand_topic_oti';

-- ---------- 4. Renommage + re-pointage FK sentiment ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='request_mood_id') THEN
    ALTER TABLE crm_interaction RENAME COLUMN request_mood_id TO request_sentiment_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='response_mood_id') THEN
    ALTER TABLE crm_interaction RENAME COLUMN response_mood_id TO response_sentiment_id;
  END IF;
END$$;
ALTER TABLE crm_interaction DROP CONSTRAINT IF EXISTS crm_interaction_request_mood_id_fkey;
ALTER TABLE crm_interaction DROP CONSTRAINT IF EXISTS crm_interaction_response_mood_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_interaction_request_sentiment_id_fkey') THEN
    ALTER TABLE crm_interaction ADD CONSTRAINT crm_interaction_request_sentiment_id_fkey
      FOREIGN KEY (request_sentiment_id) REFERENCES ref_code_crm_sentiment(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_interaction_response_sentiment_id_fkey') THEN
    ALTER TABLE crm_interaction ADD CONSTRAINT crm_interaction_response_sentiment_id_fkey
      FOREIGN KEY (response_sentiment_id) REFERENCES ref_code_crm_sentiment(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ---------- 5. Backfills (idempotents : WHERE ... IS NULL) ----------
-- Sujets : ~1 344 lignes attendues (extra.oti_demand_topic_id posé par l'import).
UPDATE crm_interaction ci
SET demand_topic_id = rc.id
FROM ref_code_demand_topic rc
WHERE ci.demand_topic_id IS NULL
  AND NULLIF(ci.extra->>'oti_demand_topic_id','') IS NOT NULL
  AND rc.id = (ci.extra->>'oti_demand_topic_id')::uuid;

-- Sentiments : 3 175 lignes attendues (7 valeurs brutes, toutes couvertes).
UPDATE crm_interaction ci
SET request_sentiment_id = rc.id
FROM (VALUES
  ('😃','tres_positif'), ('🙂','positif'), ('ok','positif'),
  ('🤔','interrogatif'), ('😡','mecontent'), ('😭','tres_mecontent'), ('😨','inquiet')
) m(raw, code)
JOIN ref_code_crm_sentiment rc ON rc.code = m.code
WHERE ci.request_sentiment_id IS NULL
  AND ci.extra->>'humeur_raw' = m.raw;

-- ---------- 6. Index (crm_interaction n'en avait AUCUN) ----------
CREATE INDEX IF NOT EXISTS idx_crm_interaction_object_occurred
  ON crm_interaction(object_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_occurred
  ON crm_interaction(occurred_at DESC, id DESC); -- keyset timeline org-wide
```

(Le fichier continue Task 2 — ne pas fermer le `BEGIN;` ici, le `COMMIT;` arrive en fin de Task 3.)

- [ ] **Step 3: Commit**

```bash
git add "Base de donnée DLL et API/migration_crm_module.sql"
git commit -m "feat(db): §58 CRM — partition crm_sentiment, fusion sujets OTI, backfill topics/sentiments (WIP 1/3)"
```

### Task 2: Migration — helpers d'autorisation

**Files:**
- Modify: `Base de donnée DLL et API/migration_crm_module.sql` (suite du même fichier)

- [ ] **Step 1: Ajouter les 3 helpers + grants**

```sql
-- ---------- 7. Helpers d'autorisation (style current_user_extended_object_ids, §35) ----------
-- Périmètre CRM = objets dont une ORG du user (membership actif) est PUBLISHER.
-- Volontairement plus étroit que extended (pas d'arme acteur, pas d'arme all_published) :
-- le CRM est le pilotage interne de l'ORG publicatrice, pas un droit d'édition.
CREATE OR REPLACE FUNCTION api.current_user_crm_object_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT ool.object_id
  FROM user_org_membership uom
  JOIN object_org_link ool ON ool.org_object_id = uom.org_object_id
  JOIN ref_org_role r      ON r.id = ool.role_id AND r.code = 'publisher'
  WHERE uom.user_id = auth.uid()
    AND uom.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION api.user_can_read_crm(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR p_object_id IN (SELECT api.current_user_crm_object_ids());
$$;

-- Écriture : superuser OU (membre ORG publisher ET (permission write_crm_notes OU rôle
-- admin ORG actif — current_user_admin_rank() IS NOT NULL, cf. rls_policies.sql:331)).
CREATE OR REPLACE FUNCTION api.user_can_write_crm(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR (p_object_id IN (SELECT api.current_user_crm_object_ids())
          AND (api.user_has_permission('write_crm_notes')
               OR api.current_user_admin_rank() IS NOT NULL));
$$;

REVOKE ALL ON FUNCTION api.current_user_crm_object_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.current_user_crm_object_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_read_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_read_crm(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_write_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_write_crm(text) TO authenticated, service_role;
```

- [ ] **Step 2: Commit**

```bash
git add "Base de donnée DLL et API/migration_crm_module.sql"
git commit -m "feat(db): §58 CRM — helpers current_user_crm_object_ids / user_can_read_crm / user_can_write_crm (WIP 2/3)"
```

### Task 3: Migration — RPCs + RLS par commande

**Files:**
- Modify: `Base de donnée DLL et API/migration_crm_module.sql` (suite et fin)
- Modify: `Base de donnée DLL et API/rls_policies.sql:1403-1409` (source fixé en place) et `:630-631` (drops)

- [ ] **Step 1: Ajouter les 6 RPCs**

```sql
-- ---------- 8. RPCs (authorize-once + SECURITY DEFINER, §36 ; gen_random_uuid, §29) ----------
-- list_crm_timeline : timeline enrichie, org-wide ou mono-objet ; pagination keyset.
CREATE OR REPLACE FUNCTION api.list_crm_timeline(
  p_object_id text DEFAULT NULL,
  p_topic_code text DEFAULT NULL,
  p_interaction_type text DEFAULT NULL,
  p_sentiment_code text DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_scope text[];           -- NULL = superuser (pas de restriction)
  v_items jsonb;
  v_has_more boolean;
BEGIN
  -- Autorisation UNE FOIS (§36) : jamais confiance dans les ids du client.
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0 THEN
      RETURN jsonb_build_object('items', '[]'::jsonb, 'has_more', false);
    END IF;
    IF p_object_id IS NOT NULL AND NOT (p_object_id = ANY(v_scope)) THEN
      RAISE EXCEPTION 'CRM non autorisé pour cet objet' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'object_id', ci.object_id, 'object_name', o.name,
      'interaction_type', ci.interaction_type, 'direction', ci.direction, 'status', ci.status,
      'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at,
      'actor_id', ci.actor_id, 'actor_name', a.display_name,
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source
    ) AS item
    FROM crm_interaction ci
    JOIN object o                      ON o.id = ci.object_id
    LEFT JOIN actor a                  ON a.id = ci.actor_id
    LEFT JOIN ref_code_demand_topic t  ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p       ON p.id = ci.owner
    WHERE (v_scope IS NULL OR ci.object_id = ANY(v_scope))
      AND (p_object_id IS NULL OR ci.object_id = p_object_id)
      AND (p_topic_code IS NULL OR t.code = p_topic_code)
      AND (p_interaction_type IS NULL OR ci.interaction_type::text = p_interaction_type)
      AND (p_sentiment_code IS NULL OR s.code = p_sentiment_code)
      AND (p_before IS NULL OR ci.occurred_at < p_before)
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
    LIMIT v_limit
  ) q;

  SELECT EXISTS (
    SELECT 1 FROM crm_interaction ci
    LEFT JOIN ref_code_demand_topic t  ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    WHERE (v_scope IS NULL OR ci.object_id = ANY(v_scope))
      AND (p_object_id IS NULL OR ci.object_id = p_object_id)
      AND (p_topic_code IS NULL OR t.code = p_topic_code)
      AND (p_interaction_type IS NULL OR ci.interaction_type::text = p_interaction_type)
      AND (p_sentiment_code IS NULL OR s.code = p_sentiment_code)
      AND (p_before IS NULL OR ci.occurred_at < p_before)
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
    OFFSET v_limit LIMIT 1
  ) INTO v_has_more;

  RETURN jsonb_build_object('items', v_items, 'has_more', v_has_more);
END;
$$;

-- list_crm_tasks : kanban org-wide enrichi.
CREATE OR REPLACE FUNCTION api.list_crm_tasks()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_scope text[];
  v_items jsonb;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0 THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items FROM (
    SELECT jsonb_build_object(
      'id', ct.id, 'object_id', ct.object_id, 'object_name', o.name,
      'title', ct.title, 'description', ct.description,
      'status', ct.status, 'priority', ct.priority,
      'due_at', ct.due_at, 'created_at', ct.created_at,
      'owner_name', p.display_name,
      'related_interaction_subject', ri.subject
    ) AS item
    FROM crm_task ct
    JOIN object o                ON o.id = ct.object_id
    LEFT JOIN app_user_profile p ON p.id = ct.owner
    LEFT JOIN crm_interaction ri ON ri.id = ct.related_interaction_id
    WHERE (v_scope IS NULL OR ct.object_id = ANY(v_scope))
    ORDER BY ct.due_at ASC NULLS LAST, ct.created_at DESC
  ) q;
  RETURN v_items;
END;
$$;

-- save_crm_task : upsert (création / édition / déplacement de lane = status dans payload).
CREATE OR REPLACE FUNCTION api.save_crm_task(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_existing_object text;
  v_status crm_task_status := COALESCE(NULLIF(p_payload->>'status',''),'todo')::crm_task_status;
  v_priority crm_task_priority := COALESCE(NULLIF(p_payload->>'priority',''),'medium')::crm_task_priority;
  v_title text := NULLIF(btrim(COALESCE(p_payload->>'title','')),'');
BEGIN
  IF v_id IS NOT NULL THEN
    SELECT object_id INTO v_existing_object FROM crm_task WHERE id = v_id;
    IF v_existing_object IS NULL THEN
      RAISE EXCEPTION 'crm_task inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm(v_existing_object) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- Changement d'objet : autorisation requise sur la cible aussi.
    IF v_object_id IS NOT NULL AND v_object_id <> v_existing_object
       AND NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée sur l''objet cible' USING ERRCODE = '42501';
    END IF;
    UPDATE crm_task SET
      object_id   = COALESCE(v_object_id, object_id),
      title       = COALESCE(v_title, title),
      description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description','') ELSE description END,
      status      = CASE WHEN p_payload ? 'status' THEN v_status ELSE status END,
      priority    = CASE WHEN p_payload ? 'priority' THEN v_priority ELSE priority END,
      due_at      = CASE WHEN p_payload ? 'due_at' THEN NULLIF(p_payload->>'due_at','')::timestamptz ELSE due_at END,
      updated_at  = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object_id requis' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  v_id := gen_random_uuid();  -- §29 : jamais uuid_generate_v4() sous search_path restreint
  INSERT INTO crm_task (id, object_id, title, description, status, priority, due_at, owner)
  VALUES (v_id, v_object_id, v_title, NULLIF(p_payload->>'description',''),
          v_status, v_priority, NULLIF(p_payload->>'due_at','')::timestamptz, auth.uid());
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- list_object_crm : §19 éditeur — interactions + tâches + distribution sujets d'UN objet.
CREATE OR REPLACE FUNCTION api.list_object_crm(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  IF p_object_id IS NULL OR NOT api.user_can_read_crm(p_object_id) THEN
    RAISE EXCEPTION 'CRM non autorisé pour cet objet' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'interactions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ci.id, 'interaction_type', ci.interaction_type, 'direction', ci.direction,
        'status', ci.status, 'subject', ci.subject, 'body', ci.body,
        'occurred_at', ci.occurred_at, 'created_at', ci.created_at,
        'actor_name', a.display_name, 'topic_code', t.code, 'topic_name', t.name,
        'sentiment_code', s.code, 'sentiment_name', s.name, 'owner_name', p.display_name,
        'source', ci.source
      ) ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC), '[]'::jsonb)
      FROM crm_interaction ci
      LEFT JOIN actor a                  ON a.id = ci.actor_id
      LEFT JOIN ref_code_demand_topic t  ON t.id = ci.demand_topic_id
      LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
      LEFT JOIN app_user_profile p       ON p.id = ci.owner
      WHERE ci.object_id = p_object_id
    ),
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ct.id, 'title', ct.title, 'status', ct.status, 'priority', ct.priority,
        'due_at', ct.due_at
      ) ORDER BY ct.due_at ASC NULLS LAST), '[]'::jsonb)
      FROM crm_task ct WHERE ct.object_id = p_object_id
    ),
    'topics', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', q.code, 'name', q.name, 'count', q.n)
                                ORDER BY q.n DESC), '[]'::jsonb)
      FROM (
        SELECT t.code, t.name, count(*) AS n
        FROM crm_interaction ci
        JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
        WHERE ci.object_id = p_object_id
        GROUP BY t.code, t.name
      ) q
    )
  );
END;
$$;

-- save_crm_interaction : upsert ; le trigger auto_populate_interaction_subject complète subject.
CREATE OR REPLACE FUNCTION api.save_crm_interaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_existing_object text;
  v_topic_id uuid;
  v_sentiment_id uuid;
BEGIN
  IF NULLIF(p_payload->>'topic_code','') IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic WHERE code = p_payload->>'topic_code' AND is_active;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_payload->>'topic_code' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NULLIF(p_payload->>'sentiment_code','') IS NOT NULL THEN
    SELECT id INTO v_sentiment_id FROM ref_code_crm_sentiment WHERE code = p_payload->>'sentiment_code' AND is_active;
    IF v_sentiment_id IS NULL THEN
      RAISE EXCEPTION 'sentiment_code inconnu: %', p_payload->>'sentiment_code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT object_id INTO v_existing_object FROM crm_interaction WHERE id = v_id;
    IF v_existing_object IS NULL THEN
      RAISE EXCEPTION 'crm_interaction inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm(v_existing_object) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    UPDATE crm_interaction SET
      interaction_type     = CASE WHEN p_payload ? 'interaction_type' THEN (p_payload->>'interaction_type')::crm_interaction_type ELSE interaction_type END,
      direction            = CASE WHEN p_payload ? 'direction' THEN (p_payload->>'direction')::crm_direction ELSE direction END,
      status               = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_status ELSE status END,
      subject              = CASE WHEN p_payload ? 'subject' THEN NULLIF(p_payload->>'subject','') ELSE subject END,
      body                 = CASE WHEN p_payload ? 'body' THEN NULLIF(p_payload->>'body','') ELSE body END,
      occurred_at          = CASE WHEN p_payload ? 'occurred_at' THEN NULLIF(p_payload->>'occurred_at','')::timestamptz ELSE occurred_at END,
      actor_id             = CASE WHEN p_payload ? 'actor_id' THEN NULLIF(p_payload->>'actor_id','')::uuid ELSE actor_id END,
      demand_topic_id      = CASE WHEN p_payload ? 'topic_code' THEN v_topic_id ELSE demand_topic_id END,
      request_sentiment_id = CASE WHEN p_payload ? 'sentiment_code' THEN v_sentiment_id ELSE request_sentiment_id END,
      updated_at           = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object_id requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO crm_interaction (
    id, object_id, interaction_type, direction, status, subject, body,
    occurred_at, actor_id, demand_topic_id, request_sentiment_id, owner, source
  ) VALUES (
    v_id, v_object_id,
    COALESCE(NULLIF(p_payload->>'interaction_type',''),'note')::crm_interaction_type,
    COALESCE(NULLIF(p_payload->>'direction',''),'internal')::crm_direction,
    COALESCE(NULLIF(p_payload->>'status',''),'done')::crm_status,
    NULLIF(p_payload->>'subject',''), NULLIF(p_payload->>'body',''),
    COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, NOW()),
    NULLIF(p_payload->>'actor_id','')::uuid, v_topic_id, v_sentiment_id,
    auth.uid(), 'bertel_ui'
  );
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- delete_crm_interaction : corrections de saisie (historique métier, pas archive légale).
CREATE OR REPLACE FUNCTION api.delete_crm_interaction(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_object_id text;
BEGIN
  SELECT object_id INTO v_object_id FROM crm_interaction WHERE id = p_id;
  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'crm_interaction inconnue: %', p_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  DELETE FROM crm_interaction WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION api.list_crm_timeline(text, text, text, text, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_timeline(text, text, text, text, timestamptz, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_crm_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_tasks() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_task(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_task(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_object_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_object_crm(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_interaction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_interaction(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.delete_crm_interaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_crm_interaction(uuid) TO authenticated, service_role;
-- Le front interroge user_has_permission('write_crm_notes') pour le gating UI global.
GRANT EXECUTE ON FUNCTION api.user_has_permission(text) TO authenticated, service_role;
```

- [ ] **Step 2: Ajouter la conversion RLS par commande et le COMMIT final**

```sql
-- ---------- 9. RLS : FOR ALL admin → famille par commande (§47), prédicat wrappé (§39) ----------
-- Sémantique INCHANGÉE pour les rôles PostgREST : seuls service_role/admin lisent/écrivent en
-- direct (les triggers create_crm_artifacts_from_incident / log_publication_proof_interaction
-- ne tournaient déjà que sous ces rôles — pas de régression). Les agents OTI passent par les
-- RPCs DEFINER ci-dessus, qui bypassent RLS après auto-autorisation.
DROP POLICY IF EXISTS "admin_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_read_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_ins_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_upd_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_del_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_read_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_ins_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_upd_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_del_crm_task" ON crm_task;

CREATE POLICY "admin_read_crm_interaction" ON crm_interaction FOR SELECT
  USING ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_ins_crm_interaction" ON crm_interaction FOR INSERT
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_upd_crm_interaction" ON crm_interaction FOR UPDATE
  USING ((select auth.role()) IN ('service_role','admin'))
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_del_crm_interaction" ON crm_interaction FOR DELETE
  USING ((select auth.role()) IN ('service_role','admin'));

CREATE POLICY "admin_read_crm_task" ON crm_task FOR SELECT
  USING ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_ins_crm_task" ON crm_task FOR INSERT
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_upd_crm_task" ON crm_task FOR UPDATE
  USING ((select auth.role()) IN ('service_role','admin'))
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_del_crm_task" ON crm_task FOR DELETE
  USING ((select auth.role()) IN ('service_role','admin'));

COMMIT;
```

- [ ] **Step 3: Fixer `rls_policies.sql` en place (sinon une ré-application ressuscite le FOR ALL — caveat 8o)**

Dans `Base de donnée DLL et API/rls_policies.sql:1403-1409`, remplacer :

```sql
CREATE POLICY "admin_crm_interaction" ON crm_interaction
  FOR ALL USING (auth.role() IN ('service_role','admin'));
CREATE POLICY "admin_crm_task" ON crm_task
  FOR ALL USING (auth.role() IN ('service_role','admin'));
```

par le bloc par-commande du Step 2 (les 8 CREATE POLICY, mêmes noms), et ajouter aux drops housekeeping (`rls_policies.sql:630-631`) les 8 `DROP POLICY IF EXISTS` correspondants (en gardant les 2 drops du FOR ALL legacy).

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_crm_module.sql" "Base de donnée DLL et API/rls_policies.sql"
git commit -m "feat(db): §58 CRM — 6 RPCs DEFINER authorize-once + RLS crm_* par commande (3/3)"
```

### Task 4: Aligner `seeds_data.sql` (équivalence fresh == live)

**Files:**
- Modify: `Base de donnée DLL et API/seeds_data.sql:355-376` (bloc topics OTI) + blocs `demand_topic`/`demand_subtopic` génériques (localiser : `grep -n "'demand_topic'" seeds_data.sql`)

- [ ] **Step 1: Rebaser le bloc des 20 sujets OTI sur le domaine canonique**

Dans le bloc `seeds_data.sql:355-376`, remplacer `'crm_demand_topic_oti'` par `'demand_topic'` sur les 20 lignes (le INSERT garde son `ON CONFLICT DO NOTHING`).

- [ ] **Step 2: Supprimer les seeds génériques retirés**

Localiser et supprimer les blocs INSERT seedant les 11 `demand_topic` génériques (`accessibilite`, `evenement`, `groupe`, `information`, `logistique`, `marketing`, `partenariat`, `presse`, `reclamation`, `reservation`, `urgence`) et les 22 `demand_subtopic`. Sur un build fresh : seeds = état final directement ; la migration 8z est no-op dessus (gate fresh-apply le prouve).

- [ ] **Step 3: Commit**

```bash
git add "Base de donnée DLL et API/seeds_data.sql"
git commit -m "feat(db): §58 CRM — seeds demand_topic = les 20 sujets OTI (fresh == live)"
```

### Task 5: Test CI `tests/test_crm_module.sql`

**Files:**
- Create: `Base de donnée DLL et API/tests/test_crm_module.sql`

- [ ] **Step 1: Écrire le test (pattern `test_room_type_read_gate.sql` : `BEGIN; DO $$ … END$$; ROLLBACK;`)**

```sql
-- test_crm_module.sql
-- Prouve §58 (migration_crm_module.sql, 8z) :
-- A) VOCABULAIRES : domaine demand_topic = sujets OTI uniquement ; crm_demand_topic_oti vide ;
--    demand_subtopic vide ; partition crm_sentiment = 6 codes ; colonnes *_sentiment_id + FK.
-- B) ACCÈS : membre ORG publisher lit via RPC ; étranger lit zéro ; anon n'exécute pas ;
--    écriture refusée sans write_crm_notes, acceptée avec ; PostgREST direct refusé (RLS).
-- C) ÉCRITURE : save_crm_interaction résout topic/sentiment par code ; save_crm_task upsert + move.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990601';
  v_orgB   text := 'ORGRUN9999990602';
  v_objA   text := 'HOTRUN9999990611';
  v_userA  uuid := '00000000-0000-4000-a000-0000000000f1'; -- membre ORG A, AVEC write_crm_notes
  v_userB  uuid := '00000000-0000-4000-a000-0000000000f2'; -- membre ORG B (étranger à l'objet)
  v_userC  uuid := '00000000-0000-4000-a000-0000000000f3'; -- membre ORG A, SANS permission
  v_pub_role uuid;
  v_perm uuid;
  v_payload jsonb;
  v_int_id uuid;
  v_task_id uuid;
  v_denied boolean;
BEGIN
  -- ---------- A. Vocabulaires / backfill (état post-migration) ----------
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'crm_demand_topic_oti') = 0,
         'fusion: il reste des codes sous crm_demand_topic_oti';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'demand_topic') = 20,
         'fusion: demand_topic doit contenir exactement les 20 sujets OTI';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'demand_subtopic') = 0,
         'retrait: demand_subtopic doit être vide';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'crm_sentiment') = 6,
         'sentiment: 6 codes attendus';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='crm_interaction' AND column_name='request_sentiment_id'),
         'renommage: request_sentiment_id absent';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='crm_interaction' AND column_name='request_mood_id'),
         'renommage: request_mood_id ne doit plus exister';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_perm FROM ref_permission WHERE code = 'write_crm_notes' LIMIT 1;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'crm_a@test.local'), (v_userB, 'crm_b@test.local'), (v_userC, 'crm_c@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent'), (v_userC, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG A CRM test', 'published'),
    (v_orgB, 'ORG', 'ORG B CRM test', 'published'),
    (v_objA, 'HOT', 'Hôtel CRM test', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE), (v_userC, v_orgA, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES
    (v_userA, v_perm, TRUE)
    ON CONFLICT DO NOTHING;

  -- ---------- B/C. USER A (membre + permission) : écrit puis lit ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'object_id', v_objA, 'interaction_type', 'call', 'body', 'Appel de test',
      'topic_code', 'demande_de_visite', 'sentiment_code', 'positif'));
    v_int_id := (v_payload->>'id')::uuid;
    ASSERT v_int_id IS NOT NULL, 'save_crm_interaction: pas d''id retourné';

    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche de test', 'priority', 'high'));
    v_task_id := (v_payload->>'id')::uuid;
    v_payload := api.save_crm_task(jsonb_build_object('id', v_task_id, 'status', 'in_progress'));
    ASSERT (v_payload->>'id')::uuid = v_task_id, 'save_crm_task: move de lane échoué';

    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA)->'items') >= 1,
           'list_crm_timeline: le membre doit lire son interaction';
    ASSERT jsonb_array_length(api.list_object_crm(v_objA)->'interactions') >= 1,
           'list_object_crm: interactions vides pour le membre';
    ASSERT jsonb_array_length(api.list_object_crm(v_objA)->'topics') >= 1,
           'list_object_crm: distribution sujets vide';
    -- Défense en profondeur : le PostgREST direct reste refusé même pour le membre.
    ASSERT (SELECT count(*) FROM crm_interaction WHERE object_id = v_objA) = 0,
           'RLS: un membre ne doit PAS lire crm_interaction en direct (RPC-only)';
  RESET ROLE;

  -- ---------- USER C (membre SANS permission) : lit mais n'écrit pas ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userC, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA)->'items') >= 1,
           'lecture: le membre sans permission doit voir la timeline de son ORG';
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_interaction(jsonb_build_object('object_id', v_objA, 'body', 'refusé'));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'écriture: le membre sans write_crm_notes doit être refusé (42501)';
  RESET ROLE;

  -- ---------- USER B (autre ORG) : ne lit rien ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_crm_tasks()) = 0,
           'cross-ORG: l''étranger ne doit voir aucune tâche';
    v_denied := false;
    BEGIN
      PERFORM api.list_object_crm(v_objA);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'cross-ORG: list_object_crm doit refuser l''étranger (42501)';
  RESET ROLE;

  RAISE NOTICE 'CRM module §58 : vocabulaires, accès, écriture — assertions passées.';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Vérifier les colonnes des fixtures contre le schéma réel**

`object` (`id, object_type, name, status`), `user_permission` (`user_id, permission_id, is_active`), `object_org_link` (`object_id, org_object_id, role_id`) : confirmer chaque liste de colonnes NOT NULL via `schema_unified.sql` (le test `test_room_type_read_gate.sql` et `test_sp2_permission_behavior.sql` sont les références — copier leur forme exacte d'INSERT si elle diffère).

- [ ] **Step 3: Commit**

```bash
git add "Base de donnée DLL et API/tests/test_crm_module.sql"
git commit -m "test(db): §58 CRM — personas lecture/écriture/cross-ORG + assertions vocabulaires"
```

### Task 6: Déploiement live + vérification

- [ ] **Step 1: Appliquer la migration sur live via MCP**

`mcp__supabase__apply_migration` avec `name: "crm_module"` et le contenu intégral de `migration_crm_module.sql` (sans les `BEGIN;`/`COMMIT;` — le MCP applique transactionnellement), puis `mcp__supabase__execute_sql` : `NOTIFY pgrst, 'reload schema';`

- [ ] **Step 2: Vérifications live (comptages attendus)**

```sql
SELECT
  (SELECT count(*) FROM ref_code WHERE domain='demand_topic') AS topics,             -- = 20
  (SELECT count(*) FROM ref_code WHERE domain='crm_demand_topic_oti') AS old_domain, -- = 0
  (SELECT count(*) FROM ref_code WHERE domain='crm_sentiment') AS sentiments,        -- = 6
  (SELECT count(*) FROM crm_interaction WHERE demand_topic_id IS NOT NULL) AS topics_filled,      -- ≈ 1344
  (SELECT count(*) FROM crm_interaction WHERE request_sentiment_id IS NOT NULL) AS sent_filled;   -- = 3175
```

- [ ] **Step 3: Probe persona live (DO block du test, sections B/C) + advisor**

Exécuter le corps du DO block de `test_crm_module.sql` via `execute_sql` (dans une transaction qui ROLLBACK). Puis `mcp__supabase__get_advisors(type: security)` : les seuls nouveaux flags attendus = `security_definer` sur les 6 RPCs + 3 helpers (documentés §58, classe §36).

- [ ] **Step 4: EXPLAIN de la timeline (sanity perf)**

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM crm_interaction
WHERE object_id = ANY(ARRAY(SELECT api.current_user_crm_object_ids()))
ORDER BY occurred_at DESC NULLS LAST, id DESC LIMIT 50;
```

Attendu : usage de `idx_crm_interaction_occurred` ou `idx_crm_interaction_object_occurred`, < 50 ms.

---

## Phase B — Frontend : service + types

### Task 7: Types domaine + mocks réalignés

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts:285-292`
- Modify: `bertel-tourism-ui/src/data/mock.ts:373-382`

- [ ] **Step 1: Remplacer `CrmTask` et ajouter `CrmInteraction` dans `domain.ts`**

```typescript
export type CrmTaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled' | 'blocked';
export type CrmTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CrmTask {
  id: string;
  objectId: string;
  objectName: string;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  dueAt: string | null;
  ownerName: string | null;
  relatedInteractionSubject: string | null;
}

export interface CrmInteraction {
  id: string;
  objectId: string;
  objectName: string;
  interactionType: string;
  direction: string;
  status: string;
  subject: string;
  body: string | null;
  occurredAt: string | null;
  actorName: string | null;
  topicCode: string | null;
  topicName: string | null;
  sentimentCode: string | null;
  sentimentName: string | null;
  ownerName: string | null;
  source: string | null;
}

export interface CrmTimelinePage {
  items: CrmInteraction[];
  hasMore: boolean;
}
```

- [ ] **Step 2: Réaligner les mocks (`mock.ts:373-382`)**

```typescript
export const mockCrmTasks: CrmTask[] = [
  { id: 'task-1', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', title: 'Rappeler le directeur', description: null, status: 'todo', priority: 'high', dueAt: '2026-06-11T09:00:00Z', ownerName: 'Marie', relatedInteractionSubject: null },
  { id: 'task-2', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', title: 'Valider le contrat photo', description: null, status: 'in_progress', priority: 'medium', dueAt: '2026-06-12T09:00:00Z', ownerName: 'Jean', relatedInteractionSubject: null },
  { id: 'task-3', objectId: 'obj-3', objectName: 'Sentier des Trois Cascades', title: 'Confirmer les horaires d hiver', description: null, status: 'done', priority: 'low', dueAt: null, ownerName: 'Luc', relatedInteractionSubject: null },
];

export const mockCrmTimeline: CrmTimelinePage = {
  items: [
    { id: 'evt-1', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', interactionType: 'call', direction: 'outbound', status: 'done', subject: 'Appel de suivi', body: 'Besoin d une nouvelle photo facade.', occurredAt: '2026-06-11T11:12:00Z', actorName: 'M. Payet', topicCode: 'demande_visuelle', topicName: 'Demande visuelle', sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Marie', source: 'bertel_ui' },
    { id: 'evt-2', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', interactionType: 'email', direction: 'outbound', status: 'done', subject: 'Validation tarifs 2026', body: 'Mail envoye pour validation des tarifs 2026.', occurredAt: '2026-06-11T09:40:00Z', actorName: null, topicCode: 'modification_infos_bdd', topicName: 'Modification infos BDD', sentimentCode: null, sentimentName: null, ownerName: 'Luc', source: 'bertel_ui' },
  ],
  hasMore: false,
};
```

(`mockTimeline` est renommé `mockCrmTimeline` — mettre à jour ses imports : `rpc.ts`, et tout usage trouvé par `grep -rn "mockTimeline" src/`.)

- [ ] **Step 3: `npx tsc --noEmit` — les erreurs restantes pointent les consommateurs à migrer (CrmPage, rpc.ts) ; c'est attendu à ce stade. Commit.**

```bash
git add src/types/domain.ts src/data/mock.ts
git commit -m "feat(crm): types CrmTask/CrmInteraction alignés sur les enums DB + mocks réalignés"
```

### Task 8: Service `src/services/crm.ts` (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/services/crm.ts`
- Create: `bertel-tourism-ui/src/services/crm.test.ts`
- Modify: `bertel-tourism-ui/src/services/rpc.ts:446-462` (stubs délégués)

- [ ] **Step 1: Écrire les specs des parsers (échouent : module absent)**

```typescript
// src/services/crm.test.ts
import { parseCrmTask, parseCrmInteraction, parseCrmTimelinePage } from './crm';

describe('crm parsers', () => {
  it('parse une tâche RPC en CrmTask (snake_case → camelCase, enums DB)', () => {
    const task = parseCrmTask({
      id: 't1', object_id: 'HOT123', object_name: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      due_at: '2026-06-12T09:00:00Z', owner_name: 'Marie', related_interaction_subject: null,
    });
    expect(task).toEqual({
      id: 't1', objectId: 'HOT123', objectName: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      dueAt: '2026-06-12T09:00:00Z', ownerName: 'Marie', relatedInteractionSubject: null,
    });
  });

  it('borne un status inconnu sur todo (défense contre la dérive d enum)', () => {
    const task = parseCrmTask({ id: 't1', object_id: 'o', object_name: 'O', title: 'x', status: 'doing' });
    expect(task.status).toBe('todo');
  });

  it('parse une page timeline { items, has_more }', () => {
    const page = parseCrmTimelinePage({
      items: [{ id: 'i1', object_id: 'o1', object_name: 'Obj', interaction_type: 'note',
        direction: 'internal', status: 'done', subject: 'Note interne', body: 'corps',
        occurred_at: '2026-01-01T00:00:00Z', actor_name: 'A', topic_code: 'boutique',
        topic_name: 'Boutique', sentiment_code: 'positif', sentiment_name: 'Positif',
        owner_name: null, source: 'import_berta2_crm' }],
      has_more: true,
    });
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({ id: 'i1', objectId: 'o1', topicName: 'Boutique', sentimentCode: 'positif' });
  });

  it('rend une page vide sur payload nul/malformé', () => {
    expect(parseCrmTimelinePage(null)).toEqual({ items: [], hasMore: false });
  });
});
```

- [ ] **Step 2: `npx jest src/services/crm.test.ts` → FAIL (`Cannot find module './crm'`)**

- [ ] **Step 3: Implémenter `src/services/crm.ts`**

```typescript
// Service CRM (§58) — toutes les lectures/écritures passent par les RPCs api.* DEFINER
// (spec docs/superpowers/specs/2026-06-11-crm-module-design.md). Les tables crm_* ne sont
// PAS lisibles en PostgREST direct : ne jamais ajouter de client.from('crm_...') ici.
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mockCrmTasks, mockCrmTimeline } from '../data/mock';
import type { CrmInteraction, CrmTask, CrmTaskPriority, CrmTaskStatus, CrmTimelinePage } from '../types/domain';

const TASK_STATUSES: CrmTaskStatus[] = ['todo', 'in_progress', 'done', 'canceled', 'blocked'];
const TASK_PRIORITIES: CrmTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

type GenericRecord = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseCrmTask(record: GenericRecord): CrmTask {
  const status = readString(record.status) as CrmTaskStatus;
  const priority = readString(record.priority) as CrmTaskPriority;
  return {
    id: readString(record.id),
    objectId: readString(record.object_id),
    objectName: readString(record.object_name),
    title: readString(record.title),
    description: readNullableString(record.description),
    status: TASK_STATUSES.includes(status) ? status : 'todo',
    priority: TASK_PRIORITIES.includes(priority) ? priority : 'medium',
    dueAt: readNullableString(record.due_at),
    ownerName: readNullableString(record.owner_name),
    relatedInteractionSubject: readNullableString(record.related_interaction_subject),
  };
}

export function parseCrmInteraction(record: GenericRecord): CrmInteraction {
  return {
    id: readString(record.id),
    objectId: readString(record.object_id),
    objectName: readString(record.object_name),
    interactionType: readString(record.interaction_type) || 'note',
    direction: readString(record.direction) || 'internal',
    status: readString(record.status) || 'done',
    subject: readString(record.subject),
    body: readNullableString(record.body),
    occurredAt: readNullableString(record.occurred_at),
    actorName: readNullableString(record.actor_name),
    topicCode: readNullableString(record.topic_code),
    topicName: readNullableString(record.topic_name),
    sentimentCode: readNullableString(record.sentiment_code),
    sentimentName: readNullableString(record.sentiment_name),
    ownerName: readNullableString(record.owner_name),
    source: readNullableString(record.source),
  };
}

export function parseCrmTimelinePage(payload: unknown): CrmTimelinePage {
  if (!payload || typeof payload !== 'object') {
    return { items: [], hasMore: false };
  }
  const record = payload as GenericRecord;
  const items = Array.isArray(record.items)
    ? record.items.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmInteraction)
    : [];
  return { items, hasMore: record.has_more === true };
}

function requireCrmClient() {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configure. Activez explicitement le mode demo pour utiliser les donnees mock.');
  }
  return client;
}

export interface CrmTimelineFilters {
  objectId?: string;
  topicCode?: string;
  interactionType?: string;
  sentimentCode?: string;
  before?: string;
  limit?: number;
}

export async function listCrmTimeline(filters: CrmTimelineFilters = {}): Promise<CrmTimelinePage> {
  const client = requireCrmClient();
  if (!client) {
    return mockCrmTimeline;
  }
  const { data, error } = await client.schema('api').rpc('list_crm_timeline', {
    p_object_id: filters.objectId ?? null,
    p_topic_code: filters.topicCode ?? null,
    p_interaction_type: filters.interactionType ?? null,
    p_sentiment_code: filters.sentimentCode ?? null,
    p_before: filters.before ?? null,
    p_limit: filters.limit ?? 50,
  });
  if (error) {
    throw error;
  }
  return parseCrmTimelinePage(data);
}

export async function listCrmTasks(): Promise<CrmTask[]> {
  const client = requireCrmClient();
  if (!client) {
    return mockCrmTasks;
  }
  const { data, error } = await client.schema('api').rpc('list_crm_tasks');
  if (error) {
    throw error;
  }
  return Array.isArray(data)
    ? data.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmTask)
    : [];
}

export interface SaveCrmTaskInput {
  id?: string;
  objectId?: string;
  title?: string;
  description?: string | null;
  status?: CrmTaskStatus;
  priority?: CrmTaskPriority;
  dueAt?: string | null;
}

export async function saveCrmTask(input: SaveCrmTaskInput): Promise<string> {
  const client = requireCrmClient();
  if (!client) {
    return input.id ?? 'demo-task';
  }
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueAt !== undefined) payload.due_at = input.dueAt;
  const { data, error } = await client.schema('api').rpc('save_crm_task', { p_payload: payload });
  if (error) {
    throw error;
  }
  return readString((data as GenericRecord | null)?.id);
}

export interface SaveCrmInteractionInput {
  id?: string;
  objectId?: string;
  interactionType?: string;
  direction?: string;
  status?: string;
  subject?: string | null;
  body?: string | null;
  occurredAt?: string | null;
  topicCode?: string | null;
  sentimentCode?: string | null;
  actorId?: string | null;
}

export async function saveCrmInteraction(input: SaveCrmInteractionInput): Promise<string> {
  const client = requireCrmClient();
  if (!client) {
    return input.id ?? 'demo-interaction';
  }
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.interactionType !== undefined) payload.interaction_type = input.interactionType;
  if (input.direction !== undefined) payload.direction = input.direction;
  if (input.status !== undefined) payload.status = input.status;
  if (input.subject !== undefined) payload.subject = input.subject;
  if (input.body !== undefined) payload.body = input.body;
  if (input.occurredAt !== undefined) payload.occurred_at = input.occurredAt;
  if (input.topicCode !== undefined) payload.topic_code = input.topicCode;
  if (input.sentimentCode !== undefined) payload.sentiment_code = input.sentimentCode;
  if (input.actorId !== undefined) payload.actor_id = input.actorId;
  const { data, error } = await client.schema('api').rpc('save_crm_interaction', { p_payload: payload });
  if (error) {
    throw error;
  }
  return readString((data as GenericRecord | null)?.id);
}

export async function deleteCrmInteraction(id: string): Promise<void> {
  const client = requireCrmClient();
  if (!client) {
    return;
  }
  const { error } = await client.schema('api').rpc('delete_crm_interaction', { p_id: id });
  if (error) {
    throw error;
  }
}

export async function userCanWriteCrmNotes(): Promise<boolean> {
  const session = useSessionStore.getState();
  if (session.demoMode || session.role === 'owner' || session.role === 'super_admin') {
    return true;
  }
  const client = getApiClient();
  if (!client) {
    return false;
  }
  const { data, error } = await client.schema('api').rpc('user_has_permission', {
    p_permission_code: 'write_crm_notes',
  });
  if (error) {
    return false;
  }
  return data === true;
}
```

- [ ] **Step 4: `npx jest src/services/crm.test.ts` → PASS**

- [ ] **Step 5: Déléguer les stubs de `rpc.ts:452-462`** (conserver les exports pour les imports existants)

```typescript
// CRM (§58) : implémentations réelles dans services/crm.ts (RPC-only — voir la spec).
export { listCrmTasks, listCrmTimeline } from './crm';
```

(Supprimer les deux anciennes fonctions stub et l'import devenu inutile de `mockCrmTasks`/`mockTimeline` dans `rpc.ts` ; `listCrmTimeline` change de type de retour — le consommateur `CrmPage` est migré en Task 9.)

- [ ] **Step 6: `npx tsc --noEmit` (erreurs restantes attendues uniquement dans `CrmPage.tsx`) puis commit**

```bash
git add src/services/crm.ts src/services/crm.test.ts src/services/rpc.ts
git commit -m "feat(crm): service RPC-only (timeline keyset, tasks, save/delete) + parsers TDD"
```

---

## Phase C — Page `/crm`

### Task 9: `CrmPage` réelle (TDD)

**Files:**
- Modify: `bertel-tourism-ui/src/views/CrmPage.tsx` (réécriture)
- Create: `bertel-tourism-ui/src/views/CrmPage.test.tsx`
- Modify: `bertel-tourism-ui/src/utils/features.ts` (retirer `/crm` des modules demo-only)
- Modify: `README.md:50`

- [ ] **Step 1: Écrire les specs (échouent sur l'implémentation actuelle)**

```tsx
// src/views/CrmPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CrmPage from './CrmPage';
import * as crm from '../services/crm';
import { mockCrmTasks, mockCrmTimeline } from '../data/mock';

jest.mock('../services/crm');
jest.mock('../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [], announceTyping: jest.fn() }),
}));

const crmMock = crm as jest.Mocked<typeof crm>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  crmMock.listCrmTasks.mockResolvedValue(mockCrmTasks);
  crmMock.listCrmTimeline.mockResolvedValue(mockCrmTimeline);
  crmMock.userCanWriteCrmNotes.mockResolvedValue(true);
  crmMock.saveCrmTask.mockResolvedValue('task-1');
});

describe('CrmPage (§58 — données réelles)', () => {
  it('groupe les tâches sur les lanes de l enum DB (todo/in_progress/done)', async () => {
    renderPage();
    expect(await screen.findByText('Rappeler le directeur')).toBeInTheDocument();
    expect(screen.getByText('Valider le contrat photo')).toBeInTheDocument(); // in_progress
  });

  it('persiste un déplacement de lane via saveCrmTask', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /avancer/i }))[0]);
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-1', status: 'in_progress' }),
    );
  });

  it('désactive l écriture avec raison sans write_crm_notes (no-write-trap)', async () => {
    crmMock.userCanWriteCrmNotes.mockResolvedValue(false);
    renderPage();
    await screen.findByText('Rappeler le directeur');
    expect(screen.queryByRole('button', { name: /avancer/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });

  it('ne rend plus le bouton démo « Simuler une note »', async () => {
    renderPage();
    await screen.findByText('Rappeler le directeur');
    expect(screen.queryByText('Simuler une note')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: `npx jest src/views/CrmPage.test.tsx` → FAIL**

- [ ] **Step 3: Réécrire `CrmPage.tsx`**

Contrat précis (conserver la structure visuelle panel-card/kanban-grid existante) :

```tsx
"use client";

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusPill } from '../components/common/StatusPill';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import {
  listCrmTasks, listCrmTimeline, saveCrmTask, saveCrmInteraction, userCanWriteCrmNotes,
} from '../services/crm';
import type { CrmInteraction, CrmTask, CrmTaskStatus } from '../types/domain';

const LANES: CrmTaskStatus[] = ['todo', 'in_progress', 'done'];
const LANE_LABELS: Record<CrmTaskStatus, string> = {
  todo: 'A faire', in_progress: 'En cours', done: 'Termine', canceled: 'Annulee', blocked: 'Bloquee',
};
const NEXT_LANE: Partial<Record<CrmTaskStatus, CrmTaskStatus>> = { todo: 'in_progress', in_progress: 'done' };

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
}

export default function CrmPage() {
  const queryClient = useQueryClient();
  const [pages, setPages] = useState<CrmInteraction[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  const canWriteQuery = useQuery({ queryKey: ['crm-can-write'], queryFn: userCanWriteCrmNotes });
  const timelineQuery = useQuery({
    queryKey: ['crm-timeline', cursor],
    queryFn: () => listCrmTimeline({ before: cursor ?? undefined }),
  });
  const { peers, typingUsers } = usePresenceRoom('crm:tasks', { syncGlobalStatus: true });

  const canWrite = canWriteQuery.data === true;
  const tasks = tasksQuery.data ?? [];

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CrmTaskStatus }) => saveCrmTask({ id, status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] }),
  });

  const timelineItems = useMemo(() => {
    const seen = new Set<string>();
    const merged: CrmInteraction[] = [];
    for (const item of [...pages.flat(), ...(timelineQuery.data?.items ?? [])]) {
      if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
    }
    return merged;
  }, [pages, timelineQuery.data]);

  const grouped = LANES.map((lane) => ({ lane, items: tasks.filter((task) => task.status === lane) }));
  const activeTasks = tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress').length;

  function loadMore() {
    const current = timelineQuery.data;
    if (!current || !current.hasMore) return;
    const last = current.items[current.items.length - 1];
    if (!last?.occurredAt) return;
    setPages((prev) => [...prev, current.items]);
    setCursor(last.occurredAt);
  }

  function advance(task: CrmTask) {
    const next = NEXT_LANE[task.status];
    if (!next) return;
    moveMutation.mutate({ id: task.id, status: next });
  }

  if (tasksQuery.isLoading || timelineQuery.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement du CRM...</section>;
  }
  if (tasksQuery.isError || timelineQuery.isError) {
    return (
      <section className="panel-card panel-card--warning panel-card--wide m-4">
        {(tasksQuery.error as Error | null)?.message ?? (timelineQuery.error as Error | null)?.message}
      </section>
    );
  }

  return (
    <section className="page-grid crm-page p-4">
      <article className="hero-panel crm-hero">
        <div>
          <span className="eyebrow">CRM</span>
          <h2>Coordination terrain et relation prestataire</h2>
          <p>
            {peers.length} collaborateur(s) en ligne.
            {!canWrite && ' Lecture seule : la permission « Écrire des notes CRM » est requise pour saisir.'}
          </p>
        </div>
        <div className="crm-hero__stats">
          <article className="dashboard-metric-card"><span>Taches actives</span><strong>{activeTasks}</strong></article>
          <article className="dashboard-metric-card"><span>Interactions chargees</span><strong>{timelineItems.length}</strong></article>
          <article className="dashboard-metric-card"><span>Contributeurs</span><strong>{peers.length}</strong></article>
        </div>
      </article>

      <div className="crm-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Timeline</span>
              <h2>Flux de relation</h2>
            </div>
          </div>
          {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
          <div className="stack-list">
            {timelineItems.map((item) => (
              <article key={item.id} className="timeline-item">
                <strong>{item.subject}</strong>
                <p>{item.body ?? ''}</p>
                <span>
                  {item.objectName} · {item.topicName ?? 'Sans sujet'} · {item.sentimentName ?? '—'} · {formatWhen(item.occurredAt)}
                </span>
              </article>
            ))}
          </div>
          {timelineQuery.data?.hasMore && (
            <button type="button" className="ghost-button" onClick={loadMore}>Charger plus</button>
          )}
        </article>

        <article className="panel-card panel-card--wide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Pipeline</span>
              <h2>Kanban des taches</h2>
            </div>
            {!canWrite && <span className="pill-mini">Lecture seule</span>}
          </div>
          <div className="kanban-grid">
            {grouped.map((group) => (
              <section key={group.lane} className="kanban-column">
                <div className="kanban-column__header">
                  <h3>{LANE_LABELS[group.lane]}</h3>
                  <span>{group.items.length}</span>
                </div>
                {group.items.map((task) => (
                  <article key={task.id} className="kanban-card">
                    <div className="kanban-card__header">
                      <strong>{task.title}</strong>
                      <StatusPill tone={task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'orange' : 'neutral'}>
                        {LANE_LABELS[task.status]}
                      </StatusPill>
                    </div>
                    <p>{task.objectName}</p>
                    <small className="kanban-card__meta">{task.ownerName ?? '—'} · {formatWhen(task.dueAt)}</small>
                    {canWrite && NEXT_LANE[task.status] && (
                      <button type="button" className="ghost-button" onClick={() => advance(task)}>
                        Avancer
                      </button>
                    )}
                  </article>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export { CrmPage };
```

Note : la création de tâche/interaction depuis la page passe par un formulaire modal nécessitant un sélecteur d'objet — réutiliser le composant de recherche d'objets existant si l'Explorer en expose un ; sinon, première itération : champ de saisie d'`object_id` + `saveCrmInteraction`/`saveCrmTask` derrière `canWrite`. Garder ce formulaire dans un composant séparé `src/views/CrmCreateForm.tsx` si > 80 lignes.

- [ ] **Step 4: `npx jest src/views/CrmPage.test.tsx` → PASS**

- [ ] **Step 5: Débrancher le garde-fou demo-only + README**

Dans `src/utils/features.ts`, retirer `'/crm'` de la liste des modules demo-only (vérifier `src/utils/features.test.ts` et le mettre à jour). Dans `README.md:50`, remplacer :

```
Les modules CRM, moderation, audits et publications affichent maintenant une erreur explicite tant que leurs RPC dedies ne sont pas branches.
```

par :

```
Le module CRM est branche sur ses RPC dedies (api.list_crm_timeline / list_crm_tasks / save_crm_*). Les modules moderation, audits et publications affichent une erreur explicite tant que leurs RPC dedies ne sont pas branches.
```

- [ ] **Step 6: Suite complète + tsc, puis commit**

```bash
npx jest && npx tsc --noEmit
git add src/views/CrmPage.tsx src/views/CrmPage.test.tsx src/utils/features.ts src/utils/features.test.ts README.md
git commit -m "feat(crm): page /crm réelle — timeline keyset, kanban persisté, gating write_crm_notes"
```

---

## Phase D — Éditeur §19

### Task 10: Workspace — permission + enrichissement CRM

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts:609-613` (interface module) et `:2210-2237` (defaults)
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (permissions ~`:3164-3220` + composition des loaders, à côté de `getObjectWorkspaceRoomsModule` `:2275`)

- [ ] **Step 1: Étendre l'interface du module §19 dans le parser**

```typescript
export interface ObjectWorkspaceCrmInteractionItem {
  id: string;
  interactionType: string;
  subject: string;
  body: string | null;
  occurredAt: string | null;
  actorName: string | null;
  topicCode: string | null;
  topicName: string | null;
  sentimentCode: string | null;
  sentimentName: string | null;
  ownerName: string | null;
  source: string | null;
}

export interface ObjectWorkspaceCrmTopicCount {
  code: string;
  name: string;
  count: number;
}

export interface ObjectWorkspaceProviderFollowUpModule {
  notes: ObjectWorkspaceFollowUpNote[];
  interactions: ObjectWorkspaceCrmInteractionItem[];
  topics: ObjectWorkspaceCrmTopicCount[];
  interactionsUnavailableReason: string | null;
  tasksUnavailableReason: string | null;
}
```

Et dans `parseWorkspaceProviderFollowUpModule` (`:2228-2236`), retourner les nouveaux champs vides (le chargement réel est un enrichissement post-parse, pattern rooms) :

```typescript
  return {
    notes: [...notes].sort(/* tri existant inchangé */),
    interactions: [],
    topics: [],
    interactionsUnavailableReason: "Le live actuel n'expose pas encore les interactions CRM prestataire dans le workspace objet.",
    tasksUnavailableReason: "Le live actuel n'expose pas encore les taches CRM prestataire dans le workspace objet.",
  };
```

- [ ] **Step 2: Ajouter l'enrichissement dans `object-workspace.ts` (pattern `getObjectWorkspaceRoomsModule`)**

```typescript
async function getObjectWorkspaceCrmModule(
  objectId: string,
  baseModule: ObjectWorkspaceProviderFollowUpModule,
): Promise<ObjectWorkspaceProviderFollowUpModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }
  const client = getApiClient();
  if (!client) {
    return baseModule; // raisons par défaut déjà posées par le parser
  }
  const result = await client.schema('api').rpc('list_object_crm', { p_object_id: objectId });
  if (result.error) {
    // 42501 attendu pour un lecteur hors ORG publisher : module indisponible avec raison, jamais un throw.
    return {
      ...baseModule,
      interactionsUnavailableReason: 'Suivi CRM réservé aux membres de l’organisation publicatrice.',
      tasksUnavailableReason: 'Suivi CRM réservé aux membres de l’organisation publicatrice.',
    };
  }
  const payload = (result.data ?? {}) as Record<string, unknown>;
  const interactions = Array.isArray(payload.interactions)
    ? payload.interactions.map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: String(record.id ?? ''),
          interactionType: String(record.interaction_type ?? 'note'),
          subject: String(record.subject ?? ''),
          body: typeof record.body === 'string' ? record.body : null,
          occurredAt: typeof record.occurred_at === 'string' ? record.occurred_at : null,
          actorName: typeof record.actor_name === 'string' ? record.actor_name : null,
          topicCode: typeof record.topic_code === 'string' ? record.topic_code : null,
          topicName: typeof record.topic_name === 'string' ? record.topic_name : null,
          sentimentCode: typeof record.sentiment_code === 'string' ? record.sentiment_code : null,
          sentimentName: typeof record.sentiment_name === 'string' ? record.sentiment_name : null,
          ownerName: typeof record.owner_name === 'string' ? record.owner_name : null,
          source: typeof record.source === 'string' ? record.source : null,
        };
      })
    : [];
  const topics = Array.isArray(payload.topics)
    ? payload.topics.map((row) => {
        const record = row as Record<string, unknown>;
        return { code: String(record.code ?? ''), name: String(record.name ?? ''), count: Number(record.count ?? 0) };
      })
    : [];
  return { ...baseModule, interactions, topics, interactionsUnavailableReason: null, tasksUnavailableReason: null };
}
```

Brancher ce loader là où les autres enrichissements optionnels sont composés (chercher le call-site de `getObjectWorkspaceRoomsModule` dans `getObjectWorkspace` et ajouter l'appel en parallèle, même forme).

- [ ] **Step 3: Ajouter la permission CRM au batch de permissions (`getObjectWorkspacePermissions`, `:3164`)**

Ajouter `apiClient.schema('api').rpc('user_can_write_crm', { p_object_id: objectId })` au `Promise.allSettled` existant, en extraire `crmWrite` (même forme que `canonical`), et exposer dans le retour :

```typescript
crm: {
  canDirectWrite: directWrite || crmWrite,
  canPrepareProposal: false,
  canSubmitProposal: false,
  disabledReason: (directWrite || crmWrite) ? null
    : 'Permission « Écrire des notes CRM » requise (administration d’équipe).',
},
```

(Étendre le type `ObjectWorkspacePermissions` avec la clé `crm` — même `ObjectWorkspaceModuleAccess` que les autres modules.)

- [ ] **Step 4: `npx tsc --noEmit` puis commit**

```bash
git add src/services/object-workspace-parser.ts src/services/object-workspace.ts
git commit -m "feat(crm): workspace — enrichissement list_object_crm + permission crm (§19)"
```

### Task 11: `SectionCrm` réelle (TDD)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.tsx` (réécriture)
- Create: `bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.test.tsx`

- [ ] **Step 1: Écrire les specs (échouent)**

```tsx
// SectionCrm.test.tsx — §19 en données réelles (§58).
import { render, screen, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCrm } from './SectionCrm';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

function fixtureWithCrm() {
  const modules = fullModulesFixture();
  modules.providerFollowUp = {
    ...modules.providerFollowUp,
    interactions: [{
      id: 'i1', interactionType: 'call', subject: 'Demande de visite',
      body: 'RDV fixé au 12.', occurredAt: '2026-06-01T08:00:00Z', actorName: 'M. Payet',
      topicCode: 'demande_de_visite', topicName: 'Demande de visite',
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Marie', source: 'bertel_ui',
    }],
    topics: [{ code: 'demande_de_visite', name: 'Demande de visite', count: 1 }],
    interactionsUnavailableReason: null,
    tasksUnavailableReason: null,
  };
  return modules;
}

describe('SectionCrm — §19 données réelles', () => {
  it('rend le journal depuis les interactions réelles (sujet + sentiment résolus)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText('Demande de visite — 1')).toBeInTheDocument(); // chip distribution réelle
    expect(screen.getByText(/RDV fixé au 12/)).toBeInTheDocument();
    expect(screen.getByText('Positif')).toBeInTheDocument();
  });

  it('désactive l authoring avec raison sans permission crm (no-write-trap)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    const noCrm = {
      ...allowAll,
      crm: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Permission « Écrire des notes CRM » requise (administration d’équipe).' },
    };
    render(<SectionCrm editor={result.current} permissions={noCrm} objectId="o1" />);
    expect(screen.getByRole('button', { name: /nouvelle interaction/i })).toBeDisabled();
    expect(screen.getByText(/Écrire des notes CRM/)).toBeInTheDocument();
  });

  it('affiche la raison d indisponibilité quand le module n est pas chargé', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/n'expose pas encore les interactions CRM/)).toBeInTheDocument();
  });
});
```

(Si `allowAll` dans `section-fixture.test-utils` ne porte pas encore la clé `crm`, l'y ajouter : `crm: { canDirectWrite: true, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null }`.)

- [ ] **Step 2: `npx jest SectionCrm` → FAIL**

- [ ] **Step 3: Réécrire `SectionCrm.tsx`**

Contrat (remplace les mocks par les données réelles ; garde `Fs num="19"`) :
- Chips sujets = `followUp.topics` réels, libellé `« {name} — {count} »`, plus AUCUNE liste `CRM_TOPICS` en dur ni `index < 3`.
- StatCards recalculées : interactions / 12 mois (filtrer `occurredAt` < 365 j), dernier contact (max `occurredAt`), sujets distincts.
- Journal = `followUp.interactions` (sujet, type, sentiment **affiché** — le faux `Select` humeur en dur est supprimé ; l'édition du sentiment passe par le formulaire d'édition d'une interaction), auteur (`ownerName`), date.
- Boutons : « + Nouvelle interaction » ouvre un petit formulaire inline (type, sujet — select sur les topics réels + saisie libre du corps, sentiment) qui appelle `saveCrmInteraction({ objectId, ... })` puis recharge le module ; boutons ✎/× par ligne appellent `saveCrmInteraction({ id, ... })` / `deleteCrmInteraction(id)`. Le bouton « Programmer un appel » et « Créer un ticket » deviennent UN bouton « + Créer une tâche » appelant `saveCrmTask({ objectId, title, dueAt })` (les tâches de l'objet s'affichent sous le journal). Tous gated par `permissions.crm.canDirectWrite`, sinon `disabled` + `permissions.crm.disabledReason` affiché (invariant no-write-trap).
- `readOnly` = `Boolean(followUp.interactionsUnavailableReason) || !permissions.crm.canDirectWrite`.

- [ ] **Step 4: `npx jest SectionCrm` → PASS ; suite complète + tsc**

```bash
npx jest && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionCrm.tsx src/features/object-editor/sections/SectionCrm.test.tsx src/features/object-editor/sections/section-fixture.test-utils.tsx
git commit -m "feat(crm): §19 éditeur — journal/chips réels + authoring gated write_crm_notes"
```

---

## Phase E — Documentation & clôture

### Task 12: Runbook + manifeste + CI fresh-apply

**Files:**
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (nouvelle étape **8z** après 8y)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (ajouter l'application de la migration, même forme que 8v/8w)

- [ ] **Step 1: Entrée 8z (même format que 8v/8w)**

> **8z.** `migration_crm_module.sql` — **§58 module CRM (P2.2)** : résorbe la dette d'import CRM (`lot1_crm_import_plan.md` §4 — sujets dans `extra.oti_demand_topic_id`, humeurs emoji dans `extra.humeur_raw`) et ouvre l'accès agent. Fusion vocabulaire : les 20 sujets OTI migrent de `crm_demand_topic_oti` (partition DEFAULT) vers `demand_topic` (partition FK-cible) ; les 11 topics génériques + 22 subtopics jamais référencés sont retirés (DO block fail-closed) ; backfill `demand_topic_id` (~1 344) ; nouveau domaine/partition `crm_sentiment` (6 codes), colonnes `request/response_mood_id` RENOMMÉES `*_sentiment_id` + FK re-pointées (ref_code_mood = envies touristiques, contresens), backfill 3 175. Helpers `current_user_crm_object_ids` (set-based §35, ORG publisher) / `user_can_read_crm` / `user_can_write_crm` (write_crm_notes OU admin ORG OU superuser) + 6 RPCs DEFINER authorize-once (§36) : `list_crm_timeline` (keyset), `list_crm_tasks`, `save_crm_task`, `list_object_crm`, `save_crm_interaction`, `delete_crm_interaction` — PII jamais en PostgREST direct (flags advisor security_definer attendus). RLS : FOR ALL `admin_crm_*` → familles par commande (§47), prédicat wrappé (§39), sémantique inchangée ; **`rls_policies.sql` fixé en place** (pas de caveat incrémental). 2 index créés sur `crm_interaction` (aucun n'existait). `seeds_data.sql` édité dans la même passe (topics seedés sous `demand_topic`, blocs génériques retirés) ⇒ fresh == live. Après rls_policies (helpers SP-1/SP-2) ; AVANT seeds sur fresh (no-op data). Live-applied as MCP migration `crm_module`. Couvert par `tests/test_crm_module.sql`.

- [ ] **Step 2: Ajouter la migration à `ci_fresh_apply.sql`** (même mécanisme d'inclusion que les étapes 8v-8y — copier la forme exacte)

- [ ] **Step 3: Commit**

```bash
git add docs/SQL_ROLLOUT_RUNBOOK.md "Base de donnée DLL et API/ci_fresh_apply.sql"
git commit -m "docs(runbook): étape 8z migration_crm_module + gate fresh-apply"
```

### Task 13: Journal de décisions + tracker + CLAUDE.md

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée §58 — vérifier le prochain numéro libre)
- Modify: `.claude/WORKFLOW.md` (tracker)
- Modify: `CLAUDE.md` (proposition d'invariant)

- [ ] **Step 1: Entrée §58 dans le journal** — consigner : les 6 décisions de cadrage (périmètre, accès, backfill, architecture A, fusion sujets, domaine sentiment + renommage), le mapping emoji→code, les comptages avant/après, le choix « suppression d'interactions importées autorisée (historique métier) », et les différés (incident_report, actor_consent, response_sentiment_id, policy incident_report FOR ALL, création de tâche/interaction org-wide avec vrai sélecteur d'objet si la v1 est minimale).

- [ ] **Step 2: Tracker WORKFLOW.md** — marquer P2.2 ~~CRM~~ **DONE (§58)** dans la ligne MVP ; ajouter les différés ci-dessus avec raison + déblocage.

- [ ] **Step 3: Proposition CLAUDE.md** (sous « Business invariants ») :

> **CRM — accès et écriture.** Les données CRM (`crm_interaction`, `crm_task`) sont org-internes : lecture réservée aux membres de l'ORG **publisher** de l'objet (`api.current_user_crm_object_ids()`), écriture gated par `write_crm_notes` OU rôle admin ORG OU superuser (`api.user_can_write_crm`). Les tables restent verrouillées en PostgREST direct (familles admin par commande) — tout accès passe par les RPCs DEFINER authorize-once (§36) ; ne jamais ajouter de policy membership directe ni de `client.from('crm_*')` côté front. Vocabulaires : sujets = domaine `demand_topic` (les 20 codes OTI, ex-`crm_demand_topic_oti`) ; sentiment relationnel = domaine `crm_sentiment` (ne PAS réutiliser `mood`, qui est un vocabulaire d'envies touristiques). Établi par §58.

- [ ] **Step 4: Commit + rafraîchir la mémoire MCP** (après le journal, jamais avant — workflow CLAUDE.md)

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md .claude/WORKFLOW.md CLAUDE.md
git commit -m "docs: §58 CRM — journal de décisions, tracker, invariant CLAUDE.md"
```

### Task 14: Rafraîchissement des graphes + vérification finale

- [ ] **Step 1: `graphify update .`** (graphe code, AST-only)
- [ ] **Step 2: Rafraîchir db-graph** (schéma live modifié : suivre `tools/db-graph/README.md` — pipeline complet ou au minimum noter le drift dans le commit)
- [ ] **Step 3: Vérification de complétude (critères d'acceptation de la spec)** — dérouler les 7 critères de `2026-06-11-crm-module-design.md §5` un par un avec preuve (requête live, capture de test, sortie Jest/tsc). Ne déclarer terminé que si chacun passe ; sinon, lister ce qui reste.

---

## Auto-revue du plan (faite à l'écriture)

- **Couverture spec :** §3.1 helpers → Task 2 ; §3.2 RPCs → Task 3 ; §3.3 migration/backfill → Tasks 1, 4 ; §3.4 frontend → Tasks 7-11 ; §3.5 vérification/déploiement/docs → Tasks 5, 6, 12, 13, 14. Différés §4 → Task 13. ✓
- **Trous assumés (décisions d'implémentation locales, pas des placeholders) :** la forme exacte du formulaire de création org-wide (Task 9 Step 3, note) et le call-site précis de la composition des loaders (Task 10 Step 2) se découvrent dans le code au moment de l'édition — les contrats (entrées/sorties, gating) sont, eux, entièrement spécifiés.
- **Cohérence de types :** `user_can_write_crm(text)` (SQL) ↔ `rpc('user_can_write_crm', { p_object_id })` (Task 10) ; `list_object_crm` renvoie `interactions/tasks/topics` ↔ parser Task 10 ; enums `CrmTaskStatus` ↔ `crm_task_status` DB. ✓
- **Gotchas projet honorés :** `gen_random_uuid` (§29), set-based (§35), authorize-once (§36), `(select auth.role())` (§39), pas de FOR ALL (§47), colonnes externes qualifiées dans les sous-requêtes de policies (§55 — non applicable ici : prédicats sans corrélation), fresh==live (P0.1), no-write-trap (éditeur), pas de `COALESCE(jsonb_agg, '[]'::json)` mixte (leçon `get_media_for_web`). ✓

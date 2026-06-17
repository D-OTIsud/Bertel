# Plan d'implémentation — Périodes d'ouverture : récurrence explicite + cascade de priorité

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre des périodes d'ouverture cycliques (mois+jour, répétées chaque année), à dates fixes, ou « toute l'année », résolues par une cascade de priorité (fermetures > fixes > cyclique > base), sans chevauchement ambigu de même couche.

**Architecture:** On réutilise le triplet existant `opening_period(all_years, date_start, date_end)` — le moteur compare déjà en MM-JJ quand `all_years=TRUE` — augmenté d'**un seul booléen `is_closure`**. Le cyclique est stocké en **année-sentinelle 2000** (wrap → 2001). Le moteur de statut passe d'un « OU de toutes les périodes actives » à « la période active la plus spécifique gagne ». La validation anti-chevauchement vit côté front (UX) **et** dans le RPC d'écriture (garantie dure).

**Tech Stack:** PostgreSQL (Supabase) ; Next.js/React/TypeScript ; Jest ; tests SQL maison (`tests/*.sql`) ; fresh-apply gate CI.

**Spec source:** `docs/specs/2026-06-17-opening-periods-recurrence-design.md`

---

## Conventions partagées (verrouillées)

- `OPENING_CYCLIC_SENTINEL_YEAR = 2000` (bissextile). Cyclique non-wrap : début/fin en 2000. Cyclique wrap (MM-JJ début > MM-JJ fin, ex. déc.→fév.) : **fin en 2001** (respecte le `CHECK (date_end >= date_start)`).
- **Modes de récurrence** (dérivés du stockage) :
  - `always` (base) = `all_years=TRUE`, dates NULL, `is_closure=FALSE`
  - `cyclic` = `all_years=TRUE`, dates présentes, `is_closure=FALSE`
  - `fixed` = `all_years=FALSE`, dates présentes, `is_closure=FALSE`
  - une **fermeture** porte `is_closure=TRUE` (cyclique OU fixe selon « chaque année »)
- **Rang de priorité** : closure=4 > fixed=3 > cyclic=2 > always=1. À rang égal, **fenêtre la plus étroite gagne**.
- **Validation chevauchement** : interdit le croisement *partiel* de deux périodes de **même rang** (non-fermeture) ; **imbrication** (l'une contient l'autre) tolérée ; fermetures exclues du contrôle.

---

## File Structure

### Backend (`Base de donnée DLL et API/`)
- **Create:** `migration_opening_period_recurrence.sql` — colonne `is_closure`, helpers `opening_period_rank`/`opening_period_width`, validation `assert_no_period_overlap`, réécriture `refresh_open_status`, MAJ `save_object_openings` + `build_opening_period_json`.
- **Modify:** `schema_unified.sql` — table `opening_period` (+`is_closure`), fonctions ci-dessus (fold).
- **Modify:** `seeds_data.sql` (ou la source du seed `opening_period_type`) — retrait `year_round`.
- **Modify:** `docs/SQL_ROLLOUT_RUNBOOK.md` — ajout de l'étape de manifest.
- **Create test:** `tests/test_opening_recurrence.sql`.

### Frontend (`bertel-tourism-ui/src/`)
- **Create:** `features/object-editor/sections/opening-recurrence.ts` — fonctions pures (mapping récurrence ↔ stockage, sentinelle encode/decode, rank/width, overlap, conflicts, resolveActivePeriod).
- **Create test:** `features/object-editor/sections/opening-recurrence.test.ts`.
- **Modify:** `services/object-workspace-parser.ts` — type `ObjectWorkspaceOpeningPeriod` (+`recurrence`, `isClosure`), parser.
- **Modify:** `services/object-workspace.ts` — `saveObjectWorkspaceOpenings` (payload).
- **Modify:** `features/object-editor/sections/opening-period-edit.ts` — `createPeriodDraft`, `validatePeriodDraft`, retrait `OPENING_BUCKET_OPTIONS`.
- **Modify:** `features/object-editor/widgets/OpeningPeriodEditModal.tsx` — sélecteur récurrence, zone de dates adaptative, type optionnel, retrait bucket, validation chevauchement.
- **Modify:** `features/object-editor/sections/SectionOpenings.tsx` — liste de fermetures niveau objet + passage des périodes existantes au modal pour la validation.
- **Create:** `features/object-editor/widgets/ClosureEditModal.tsx` — ajout/édition d'une fermeture (date isolée ou plage + « chaque année »).
- **Modify:** `features/object-editor/sections/blocks/opening-period-meta.ts` — retrait usage `bucket`.
- **Modify:** `features/object-editor/sections/OpeningPeriodsEditor.tsx` — séparer fermetures, indiquer la couche.

> **Phasage** : Phase A (backend) est testable seule (SQL). Phase B (frontend) dépend du contrat de la Phase A (`is_closure`, année-sentinelle). Implémenter A puis B. Déployer ensemble.

---

# PHASE A — Backend (SQL)

## Task A1 : Migration — colonne `is_closure` + helpers rang/largeur

**Files:**
- Create: `Base de donnée DLL et API/migration_opening_period_recurrence.sql`
- Test: `tests/test_opening_recurrence.sql`

- [ ] **Step 1 — Écrire le test SQL (échoue : objets absents)**

Créer `tests/test_opening_recurrence.sql` :

```sql
-- test_opening_recurrence.sql — exécuter dans une transaction, ROLLBACK à la fin.
BEGIN;

-- A1: colonne is_closure présente, défaut false
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='opening_period' AND column_name='is_closure'
  ) THEN RAISE EXCEPTION 'A1 FAIL: opening_period.is_closure missing'; END IF;
END $$;

-- A1: rang de priorité
DO $$
BEGIN
  IF api.opening_period_rank(true,  NULL, NULL) <> 4 THEN RAISE EXCEPTION 'A1 FAIL: closure rank'; END IF; -- is_closure
  IF api.opening_period_rank(false, '2000-05-01'::date, '2000-09-30'::date) <> 2 THEN RAISE EXCEPTION 'A1 FAIL: cyclic rank'; END IF;
END $$;

ROLLBACK;
```

Note : `opening_period_rank(p_is_closure, p_all_years, p_date_start, p_date_end)` — le test ci-dessus appelle la forme à 3 args pour closure/cyclic ; ALIGNER la signature dans le test ET l'implémentation (Step 3). On fige la signature à **4 args** : `(p_is_closure boolean, p_all_years boolean, p_date_start date, p_date_end date)`.

Corriger le test pour la signature 4-args :

```sql
DO $$
BEGIN
  IF api.opening_period_rank(true,  true,  NULL, NULL) <> 4 THEN RAISE EXCEPTION 'A1 FAIL: closure rank'; END IF;
  IF api.opening_period_rank(false, false, '2025-01-15'::date, '2025-12-15'::date) <> 3 THEN RAISE EXCEPTION 'A1 FAIL: fixed rank'; END IF;
  IF api.opening_period_rank(false, true,  '2000-05-01'::date, '2000-09-30'::date) <> 2 THEN RAISE EXCEPTION 'A1 FAIL: cyclic rank'; END IF;
  IF api.opening_period_rank(false, true,  NULL, NULL) <> 1 THEN RAISE EXCEPTION 'A1 FAIL: base rank'; END IF;
END $$;
```

- [ ] **Step 2 — Exécuter le test (échoue)**

Run (MCP `mcp__supabase__execute_sql` ou psql) : coller le contenu de `tests/test_opening_recurrence.sql`.
Expected : FAIL « function api.opening_period_rank(...) does not exist » / « is_closure missing ».

- [ ] **Step 3 — Écrire la migration (colonne + helpers)**

Créer `Base de donnée DLL et API/migration_opening_period_recurrence.sql` :

```sql
-- =====================================================================
-- migration_opening_period_recurrence.sql  (manifest step 14j)
-- Périodes d'ouverture : récurrence explicite + cascade de priorité.
-- Additif, idempotent, réversible. Voir docs/specs/2026-06-17-opening-periods-recurrence-design.md
-- =====================================================================

-- 1) Couche "fermeture" : un seul booléen. Une fermeture (cyclique ou fixe)
--    surcharge toute période ouverte pour les dates qu'elle couvre.
ALTER TABLE public.opening_period
  ADD COLUMN IF NOT EXISTS is_closure BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_opening_period_is_closure
  ON public.opening_period (object_id) WHERE is_closure;

-- 2) Rang de priorité (closure 4 > fixe 3 > cyclique 2 > base 1).
CREATE OR REPLACE FUNCTION api.opening_period_rank(
  p_is_closure BOOLEAN,
  p_all_years  BOOLEAN,
  p_date_start DATE,
  p_date_end   DATE
)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
  SELECT CASE
    WHEN COALESCE(p_is_closure, FALSE) THEN 4
    WHEN COALESCE(p_all_years, FALSE) = FALSE AND (p_date_start IS NOT NULL OR p_date_end IS NOT NULL) THEN 3
    WHEN COALESCE(p_all_years, FALSE) = TRUE  AND (p_date_start IS NOT NULL OR p_date_end IS NOT NULL) THEN 2
    ELSE 1
  END;
$$;

-- 3) Largeur de fenêtre en jours (à rang égal, la plus étroite gagne).
--    Cyclique : durée MM-JJ avec wrap. Fixe : date_end - date_start. Base/sans dates : 100000 (∞).
CREATE OR REPLACE FUNCTION api.opening_period_width(
  p_all_years  BOOLEAN,
  p_date_start DATE,
  p_date_end   DATE
)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
  SELECT CASE
    WHEN p_date_start IS NULL OR p_date_end IS NULL THEN 100000
    WHEN COALESCE(p_all_years, FALSE) THEN
      -- jour-de-l'an approx. mois*31+jour (monotone) ; wrap → +372 (= 12*31)
      ((to_char(p_date_end,'MM')::int - 1) * 31 + to_char(p_date_end,'DD')::int)
      - ((to_char(p_date_start,'MM')::int - 1) * 31 + to_char(p_date_start,'DD')::int)
      + CASE WHEN to_char(p_date_end,'MMDD') < to_char(p_date_start,'MMDD') THEN 372 ELSE 0 END
    ELSE (p_date_end - p_date_start)
  END;
$$;
```

Note d'implémentation : la largeur cyclique utilise une approximation « mois×31+jour » (monotone, suffisante pour départager des fenêtres ; pas un compte de jours exact). Documenté volontairement.

- [ ] **Step 4 — Exécuter le test (passe pour A1)**

Run : ré-exécuter `tests/test_opening_recurrence.sql`.
Expected : les blocs A1 passent (pas d'exception). Les blocs des tâches suivantes échoueront encore — c'est attendu ; commenter temporairement les blocs A2+ ou les ajouter au fur et à mesure.

- [ ] **Step 5 — Commit**

```bash
git add "Base de donnée DLL et API/migration_opening_period_recurrence.sql" tests/test_opening_recurrence.sql
git commit -m "feat(opening): is_closure column + period rank/width helpers"
```

---

## Task A2 : Réécriture de `refresh_open_status` (résolution par priorité)

**Files:**
- Modify: `Base de donnée DLL et API/migration_opening_period_recurrence.sql` (ajouter la fonction)
- Test: `tests/test_opening_recurrence.sql` (ajouter le bloc A2)

- [ ] **Step 1 — Ajouter le test A2 (échoue : ancienne logique)**

Ajouter dans `tests/test_opening_recurrence.sql`, avant le ROLLBACK :

```sql
-- A2: une fermeture active aujourd'hui force cached_is_open_now = FALSE,
--     même si une base "toute l'année 24/7" dirait ouvert.
DO $$
DECLARE v_open boolean;
BEGIN
  INSERT INTO object (id, status, type, name, business_timezone)
  VALUES ('TEST_OPEN_0000001', 'published', 'HEB', 'Test', 'Indian/Reunion')
  ON CONFLICT (id) DO UPDATE SET status='published';

  -- base ouverte tous les jours 00:00-23:59
  WITH p AS (
    INSERT INTO opening_period (object_id, all_years, is_closure) VALUES ('TEST_OPEN_0000001', true, false) RETURNING id
  ), s AS (
    INSERT INTO opening_schedule (period_id, schedule_type_id)
    SELECT p.id, (SELECT id FROM ref_code_opening_schedule_type WHERE code='regular' LIMIT 1) FROM p RETURNING id, period_id
  ), tp AS (
    INSERT INTO opening_time_period (schedule_id, closed) SELECT s.id, false FROM s RETURNING id
  ), w AS (
    INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT tp.id, wd.id FROM tp CROSS JOIN ref_code_weekday wd RETURNING time_period_id
  )
  INSERT INTO opening_time_frame (time_period_id, start_time, end_time)
  SELECT DISTINCT time_period_id, '00:00'::time, '23:59'::time FROM w;

  -- fermeture couvrant aujourd'hui (fixe, jour même)
  INSERT INTO opening_period (object_id, all_years, is_closure, date_start, date_end)
  VALUES ('TEST_OPEN_0000001', false, true, CURRENT_DATE, CURRENT_DATE);

  PERFORM api.refresh_open_status();
  SELECT cached_is_open_now INTO v_open FROM object WHERE id='TEST_OPEN_0000001';
  IF v_open IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'A2 FAIL: closure did not force closed (got %)', v_open; END IF;
END $$;
```

- [ ] **Step 2 — Exécuter (échoue)**

Run : le bloc A2. Expected : FAIL `A2 FAIL: closure did not force closed` (l'ancienne fonction ignore `is_closure`).

- [ ] **Step 3 — Réécrire `refresh_open_status`**

Ajouter dans la migration (remplace la version de `schema_unified.sql`) :

```sql
-- 4) Moteur de statut : la période active la PLUS SPÉCIFIQUE gagne ; une fermeture active force fermé.
CREATE OR REPLACE FUNCTION api.refresh_open_status()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  WITH obj_now AS (
    SELECT o.id, ln.local_date, ln.local_time, ln.local_isodow
    FROM object o
    CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
    WHERE o.status = 'published'
  ),
  active AS (
    SELECT n.id AS object_id, n.local_time, n.local_isodow,
           p.id AS period_id, p.is_closure,
           api.opening_period_rank(p.is_closure, p.all_years, p.date_start, p.date_end) AS rank,
           api.opening_period_width(p.all_years, p.date_start, p.date_end) AS width
    FROM obj_now n
    JOIN opening_period p ON p.object_id = n.id
    WHERE api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, n.local_date)
  ),
  closed_today AS (
    SELECT DISTINCT object_id FROM active WHERE is_closure
  ),
  winner AS (
    SELECT DISTINCT ON (object_id) object_id, period_id, local_time, local_isodow
    FROM active
    WHERE NOT is_closure
    ORDER BY object_id, rank DESC, width ASC, period_id
  ),
  open_state AS (
    SELECT o.id,
      CASE
        WHEN EXISTS (SELECT 1 FROM closed_today c WHERE c.object_id = o.id) THEN FALSE
        ELSE COALESCE((
          SELECT
            EXISTS (
              SELECT 1
              FROM opening_schedule s
              JOIN opening_time_period tp ON tp.schedule_id = s.id
              JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
              JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
              JOIN opening_time_frame tf ON tf.time_period_id = tp.id
              WHERE s.period_id = w.period_id
                AND tp.closed = FALSE
                AND COALESCE(wd.dow_number, CASE wd.code
                  WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
                  WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
                  WHEN 'sunday' THEN 7 ELSE NULL END) = w.local_isodow
                AND (tf.start_time IS NULL OR tf.start_time <= w.local_time)
                AND (tf.end_time   IS NULL OR tf.end_time   >  w.local_time)
            )
            OR EXISTS (
              SELECT 1
              FROM opening_schedule s
              JOIN opening_time_period tp ON tp.schedule_id = s.id
              JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
              JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
              WHERE s.period_id = w.period_id
                AND tp.closed = FALSE
                AND COALESCE(wd.dow_number, CASE wd.code
                  WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
                  WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
                  WHEN 'sunday' THEN 7 ELSE NULL END) = w.local_isodow
                AND NOT EXISTS (SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id = tp.id)
            )
          FROM winner w WHERE w.object_id = o.id
        ), FALSE)
      END AS new_is_open_now
    FROM object o
    WHERE o.status = 'published'
  )
  UPDATE object o
  SET cached_is_open_now = s.new_is_open_now
  FROM open_state s
  WHERE o.id = s.id
    AND o.cached_is_open_now IS DISTINCT FROM s.new_is_open_now;
END;
$$;
```

- [ ] **Step 4 — Exécuter (passe)**

Run : bloc A2. Expected : pas d'exception (fermeture force fermé).

- [ ] **Step 5 — Vérifier la perf (set-based, pas de régression §37)**

Run :
```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT api.refresh_open_status();
```
Expected : pas de scan `pg_timezone_names` ; temps total raisonnable (objectif sous la seconde sur ~373 objets, cf. §37). Si un nœud par-ligne coûteux apparaît, hisser le `winner` en CTE matérialisée.

- [ ] **Step 6 — Commit**

```bash
git add "Base de donnée DLL et API/migration_opening_period_recurrence.sql" tests/test_opening_recurrence.sql
git commit -m "feat(opening): priority-resolved refresh_open_status (closure>fixed>cyclic>base)"
```

---

## Task A3 : Validation anti-chevauchement serveur + `save_object_openings`

**Files:**
- Modify: `Base de donnée DLL et API/migration_opening_period_recurrence.sql`
- Test: `tests/test_opening_recurrence.sql` (bloc A3)

- [ ] **Step 1 — Test A3 (échoue : pas de garde)**

Ajouter :

```sql
-- A3a: deux cycliques qui se croisent partiellement => rejet
DO $$
DECLARE v_err boolean := false;
BEGIN
  BEGIN
    PERFORM api.assert_no_period_overlap('[
      {"is_closure":false,"all_years":true,"date_start":"2000-05-01","date_end":"2000-09-30"},
      {"is_closure":false,"all_years":true,"date_start":"2000-08-01","date_end":"2000-10-31"}
    ]'::jsonb);
  EXCEPTION WHEN others THEN v_err := true;
  END;
  IF NOT v_err THEN RAISE EXCEPTION 'A3a FAIL: partial cyclic overlap not rejected'; END IF;
END $$;

-- A3b: imbrication (canicule dans haute saison) => accepté
DO $$
BEGIN
  PERFORM api.assert_no_period_overlap('[
    {"is_closure":false,"all_years":true,"date_start":"2000-05-01","date_end":"2000-09-30"},
    {"is_closure":false,"all_years":true,"date_start":"2000-08-01","date_end":"2000-08-15"}
  ]'::jsonb);
END $$;

-- A3c: deux fermetures qui se chevauchent => accepté (exclues du contrôle)
DO $$
BEGIN
  PERFORM api.assert_no_period_overlap('[
    {"is_closure":true,"all_years":false,"date_start":"2025-06-01","date_end":"2025-06-10"},
    {"is_closure":true,"all_years":false,"date_start":"2025-06-05","date_end":"2025-06-15"}
  ]'::jsonb);
END $$;
```

- [ ] **Step 2 — Exécuter (échoue)**

Expected : FAIL « function api.assert_no_period_overlap does not exist ».

- [ ] **Step 3 — Implémenter la validation + l'intégrer**

Ajouter dans la migration :

```sql
-- 5) Validation anti-chevauchement (même rang : croisement partiel interdit, imbrication tolérée).
--    Fermetures exclues, périodes sans dates ignorées. Miroir SQL EXACT de la fonction pure
--    TS `periodsPartialOverlap` (Task B1) : intersection ensembliste des jours couverts.
CREATE OR REPLACE FUNCTION api._covered_days(p_all_years boolean, p_s date, p_e date)
RETURNS int[]
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
  -- Cyclique (p_all_years=TRUE) : jour-de-l'an MM*31+JJ sur 1..372, wrap (>372) replié.
  -- Fixe : jours epoch (date - 2000-01-01). Même rang ⇒ même p_all_years des deux côtés.
  WITH bounds AS (
    SELECT
      CASE WHEN p_all_years THEN (to_char(p_s,'MM')::int-1)*31 + to_char(p_s,'DD')::int
           ELSE (p_s - DATE '2000-01-01') END AS lo,
      CASE WHEN p_all_years THEN (to_char(p_e,'MM')::int-1)*31 + to_char(p_e,'DD')::int
                  + CASE WHEN to_char(p_e,'MMDD') < to_char(p_s,'MMDD') THEN 372 ELSE 0 END
           ELSE (p_e - DATE '2000-01-01') END AS hi
  )
  SELECT array_agg(DISTINCT CASE WHEN p_all_years AND d > 372 THEN d - 372 ELSE d END)
  FROM bounds, generate_series(bounds.lo, bounds.hi) AS d;
$$;

CREATE OR REPLACE FUNCTION api.periods_partial_overlap(
  p_all_years boolean, a_s date, a_e date, b_s date, b_e date
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
DECLARE
  a_days int[] := api._covered_days(p_all_years, a_s, a_e);
  b_days int[] := api._covered_days(p_all_years, b_s, b_e);
  inter int;
BEGIN
  IF array_length(a_days,1) IS NULL OR array_length(b_days,1) IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO inter FROM unnest(a_days) AS d WHERE d = ANY (b_days);
  IF inter = 0 THEN RETURN false; END IF;                               -- disjointes
  IF inter = array_length(a_days,1) OR inter = array_length(b_days,1) THEN
    RETURN false;                                                       -- l'une contenue dans l'autre → tolérée
  END IF;
  RETURN true;                                                          -- croisement partiel
END;
$$;

CREATE OR REPLACE FUNCTION api.assert_no_period_overlap(p_periods jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api
AS $$
DECLARE
  r record;
BEGIN
  -- Self-join sur les périodes datées non-fermeture de même rang ; pas de table temp.
  FOR r IN
    WITH np AS (
      SELECT
        row_number() OVER () AS idx,
        api.opening_period_rank(false, COALESCE((e->>'all_years')::boolean,false),
                                NULLIF(e->>'date_start','')::date, NULLIF(e->>'date_end','')::date) AS rank,
        COALESCE((e->>'all_years')::boolean,false) AS all_years,
        NULLIF(e->>'date_start','')::date AS ds,
        NULLIF(e->>'date_end','')::date AS de
      FROM jsonb_array_elements(COALESCE(p_periods,'[]'::jsonb)) AS e
      WHERE COALESCE((e->>'is_closure')::boolean,false) = false
        AND NULLIF(e->>'date_start','') IS NOT NULL
        AND NULLIF(e->>'date_end','')   IS NOT NULL
    )
    SELECT a.rank AS rank
    FROM np a JOIN np b ON b.idx > a.idx AND b.rank = a.rank
    WHERE api.periods_partial_overlap(a.all_years, a.ds, a.de, b.ds, b.de)
    LIMIT 1
  LOOP
    RAISE EXCEPTION 'opening_period overlap (rank %)', r.rank USING ERRCODE = '23514';
  END LOOP;
END;
$$;
```

> **Note** : `api._covered_days` / `api.periods_partial_overlap` sont le miroir 1:1 de `coveredDays` / `periodsPartialOverlap` (Task B1) — implémenter B1 d'abord, puis transcrire. Le test A3 (Step 1) est le contrat à respecter.

Puis **intégrer dans `save_object_openings`** : reprendre la version courante (`migration_opening_period_type.sql:62`), et (a) appeler la validation après lecture du payload, (b) persister `is_closure` :

```sql
-- dans api.save_object_openings, juste après "p_payload := COALESCE(...)":
PERFORM api.assert_no_period_overlap(p_payload->'periods');

-- dans l'INSERT INTO public.opening_period(...): ajouter la colonne is_closure
INSERT INTO public.opening_period (
  id, object_id, name, date_start, date_end, source_period_id, all_years, name_i18n, extra, period_type_id, is_closure
)
VALUES (
  COALESCE(internal.workspace_uuid(v_period->>'id'), gen_random_uuid()),
  p_object_id,
  NULLIF(v_period->>'name', ''),
  NULLIF(v_period->>'date_start', '')::date,
  NULLIF(v_period->>'date_end', '')::date,
  NULLIF(v_period->>'source_period_id', ''),
  COALESCE(NULLIF(v_period->>'all_years', '')::boolean, false),
  CASE WHEN jsonb_typeof(v_period->'name_i18n') = 'object' THEN v_period->'name_i18n' ELSE NULL END,
  internal.workspace_jsonb_object(v_period->'extra'),
  v_period_type_id,
  COALESCE(NULLIF(v_period->>'is_closure','')::boolean, false)
)
RETURNING id INTO v_period_id;
```

(Copier le **reste** du corps de `save_object_openings` verbatim depuis `migration_opening_period_type.sql:62-203`, en n'appliquant QUE les deux changements ci-dessus.)

- [ ] **Step 4 — Exécuter (passe)**

Run : blocs A3a/A3b/A3c. Expected : a rejette, b et c passent.

- [ ] **Step 5 — Commit**

```bash
git add "Base de donnée DLL et API/migration_opening_period_recurrence.sql" tests/test_opening_recurrence.sql
git commit -m "feat(opening): server-side overlap guard + persist is_closure in save_object_openings"
```

---

## Task A4 : Lecture — `build_opening_period_json` émet `is_closure`

**Files:**
- Modify: `Base de donnée DLL et API/migration_opening_period_recurrence.sql`
- Test: `tests/test_opening_recurrence.sql` (bloc A4)

- [ ] **Step 1 — Test A4 (échoue : clé absente)**

```sql
-- A4: la lecture émet is_closure
DO $$
DECLARE v jsonb; v_pid uuid;
BEGIN
  INSERT INTO opening_period (object_id, all_years, is_closure, date_start, date_end)
  VALUES ('TEST_OPEN_0000001', false, true, CURRENT_DATE, CURRENT_DATE) RETURNING id INTO v_pid;
  v := api.build_opening_period_json(v_pid, 'TEST_OPEN_0000001', CURRENT_DATE, CURRENT_DATE, 1)::jsonb;
  IF NOT (v ? 'is_closure') OR (v->>'is_closure')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A4 FAIL: is_closure not emitted (%)', v;
  END IF;
END $$;
```

- [ ] **Step 2 — Exécuter (échoue)**

Expected : FAIL `A4 FAIL: is_closure not emitted`.

- [ ] **Step 3 — Mettre à jour `build_opening_period_json`**

Reprendre la version courante (`migration_opening_period_type.sql:206`) et ajouter `is_closure` à la lecture + à la sortie :

```sql
CREATE OR REPLACE FUNCTION api.build_opening_period_json(
  p_period_id UUID, p_object_id TEXT, p_date_start DATE, p_date_end DATE, p_order INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_weekday_slots JSONB;
  v_period_type_code TEXT;
  v_all_years BOOLEAN;
  v_is_closure BOOLEAN;
BEGIN
  v_weekday_slots := api.get_opening_slots_by_day(p_period_id);
  SELECT rc.code, op.all_years, op.is_closure
    INTO v_period_type_code, v_all_years, v_is_closure
    FROM public.opening_period op
    LEFT JOIN public.ref_code_opening_period_type rc ON rc.id = op.period_type_id
    WHERE op.id = p_period_id;
  RETURN json_build_object(
    'id', p_period_id::text,
    'order', p_order,
    'object_id', p_object_id,
    'date_start', p_date_start,
    'date_end', p_date_end,
    'all_years', v_all_years,
    'is_closure', v_is_closure,
    'period_type_code', v_period_type_code,
    'closed_days', '[]'::json,
    'weekday_slots', COALESCE(v_weekday_slots, '{}'::jsonb)::json
  );
END;
$$;
```

- [ ] **Step 4 — Exécuter (passe)** — Run bloc A4. Expected : pas d'exception.

- [ ] **Step 5 — Commit**

```bash
git add "Base de donnée DLL et API/migration_opening_period_recurrence.sql" tests/test_opening_recurrence.sql
git commit -m "feat(opening): emit is_closure from build_opening_period_json"
```

---

## Task A5 : Retrait du type `year_round` + fold schema + runbook

**Files:**
- Modify: `Base de donnée DLL et API/migration_opening_period_recurrence.sql` (DELETE conditionnel)
- Modify: `Base de donnée DLL et API/schema_unified.sql`
- Modify: `Base de donnée DLL et API/seeds_data.sql` (ou la source du seed `opening_period_type`)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`

- [ ] **Step 1 — Localiser le seed `opening_period_type`**

Run (Grep) : chercher `opening_period_type` dans `seeds_data.sql` et `schema_unified.sql`. Le seed canonique est dans `migration_opening_period_type.sql:41-51`. Confirmer s'il a été replié dans `seeds_data.sql`.

- [ ] **Step 2 — DELETE conditionnel `year_round` (0 référence live)**

Ajouter en fin de migration :

```sql
-- 6) Retrait du type "Annuelle" : redondant avec le mode "Toute l'année".
--    Sûr : 0 opening_period.period_type_id ne le référence (vérifié live 2026-06-17).
DELETE FROM public.ref_code rc
WHERE rc.domain = 'opening_period_type' AND rc.code = 'year_round'
  AND NOT EXISTS (SELECT 1 FROM public.opening_period op WHERE op.period_type_id = rc.id);
```

- [ ] **Step 3 — Fold dans `schema_unified.sql`**

- Table `opening_period` (~ligne 2437) : ajouter `is_closure BOOLEAN NOT NULL DEFAULT FALSE` après `all_years` ; ajouter l'`CREATE INDEX ... idx_opening_period_is_closure`.
- Remplacer le corps de `api.refresh_open_status` (~4886) par la version Task A2.
- Ajouter `api.opening_period_rank`, `api.opening_period_width`, `api.assert_no_period_overlap` (+ helpers) et la version finale de `api.save_object_openings` / `api.build_opening_period_json` (si ces fonctions vivent dans `api_views_functions.sql`/`object_workspace_safe_write_rpcs.sql`, les y mettre à jour à la place — suivre l'emplacement existant).
- Retirer la ligne de seed `year_round` de la source de seed.

- [ ] **Step 4 — Runbook + manifest**

Éditer `docs/SQL_ROLLOUT_RUNBOOK.md` : ajouter `migration_opening_period_recurrence.sql` à l'étape de manifest **14j** (après 14i), en notant l'ordre de dépendance (après `migration_opening_period_type.sql`).

- [ ] **Step 5 — Fresh-apply gate (local)**

Run : reconstruire une base fraîche selon le runbook (ou la commande de CI fresh-apply du repo) et exécuter `tests/test_opening_recurrence.sql`.
Expected : tous les blocs passent sur base fraîche == live.

- [ ] **Step 6 — Commit**

```bash
git add "Base de donnée DLL et API/migration_opening_period_recurrence.sql" "Base de donnée DLL et API/schema_unified.sql" "Base de donnée DLL et API/seeds_data.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "chore(opening): fold recurrence migration into schema + runbook; retire year_round type"
```

---

# PHASE B — Frontend

## Task B1 : Fonctions pures `opening-recurrence.ts`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/opening-recurrence.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/opening-recurrence.test.ts`

- [ ] **Step 1 — Écrire les tests (échouent)**

Créer `opening-recurrence.test.ts` :

```ts
import {
  OPENING_CYCLIC_SENTINEL_YEAR,
  encodeCyclicDate, decodeCyclicMonthDay,
  periodRank, periodWindowWidth,
  periodsPartialOverlap, findPeriodConflicts,
  type RecurrencePeriod,
} from './opening-recurrence';

const base = (o: Partial<RecurrencePeriod>): RecurrencePeriod => ({
  recurrence: 'cyclic', isClosure: false, startDate: '', endDate: '', label: '', ...o,
});

describe('cyclic sentinel encoding', () => {
  test('encodes month+day in sentinel year, no wrap', () => {
    expect(encodeCyclicDate(5, 1)).toBe('2000-05-01');
    expect(encodeCyclicDate(9, 30)).toBe('2000-09-30');
  });
  test('decodes month/day ignoring year', () => {
    expect(decodeCyclicMonthDay('2000-05-01')).toEqual({ month: 5, day: 1 });
    expect(decodeCyclicMonthDay('2001-02-15')).toEqual({ month: 2, day: 15 });
  });
});

describe('rank', () => {
  test('closure > fixed > cyclic > base', () => {
    expect(periodRank(base({ isClosure: true }))).toBe(4);
    expect(periodRank(base({ recurrence: 'fixed', startDate: '2025-01-01', endDate: '2025-02-01' }))).toBe(3);
    expect(periodRank(base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30' }))).toBe(2);
    expect(periodRank(base({ recurrence: 'always' }))).toBe(1);
  });
});

describe('partial overlap (same layer)', () => {
  test('two cyclics crossing => true', () => {
    const a = base({ startDate: '2000-05-01', endDate: '2000-09-30' });
    const b = base({ startDate: '2000-08-01', endDate: '2000-10-31' });
    expect(periodsPartialOverlap(a, b)).toBe(true);
  });
  test('nested cyclic (containment) => false', () => {
    const a = base({ startDate: '2000-05-01', endDate: '2000-09-30' });
    const b = base({ startDate: '2000-08-01', endDate: '2000-08-15' });
    expect(periodsPartialOverlap(a, b)).toBe(false);
  });
  test('cyclic wrap dec->feb partially crossing feb->mar => true', () => {
    const a = base({ startDate: '2000-12-15', endDate: '2001-02-15' }); // wrap
    const b = base({ startDate: '2000-02-01', endDate: '2000-03-31' }); // overlaps feb 1-15, extends past
    expect(periodsPartialOverlap(a, b)).toBe(true);
  });
  test('cyclic period fully inside a wrap window (containment) => false', () => {
    const a = base({ startDate: '2000-12-15', endDate: '2001-02-15' }); // wrap, covers jan
    const b = base({ startDate: '2000-01-01', endDate: '2000-01-31' }); // fully inside jan
    expect(periodsPartialOverlap(a, b)).toBe(false);
  });
});

describe('findPeriodConflicts', () => {
  test('ignores closures and different ranks', () => {
    const candidate = base({ recurrence: 'fixed', startDate: '2025-06-01', endDate: '2025-08-01', label: 'Festival' });
    const existing = [
      base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30', label: 'Haute' }), // different rank
      base({ isClosure: true, recurrence: 'fixed', startDate: '2025-06-10', endDate: '2025-06-12', label: 'Ferié' }),
    ];
    expect(findPeriodConflicts(candidate, existing)).toEqual([]);
  });
  test('flags same-rank partial overlap with the conflicting label', () => {
    const candidate = base({ recurrence: 'cyclic', startDate: '2000-08-01', endDate: '2000-10-31', label: 'Mi' });
    const existing = [base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30', label: 'Haute' })];
    expect(findPeriodConflicts(candidate, existing).map((c) => c.label)).toEqual(['Haute']);
  });
});
```

- [ ] **Step 2 — Exécuter (échoue)**

Run : `cd bertel-tourism-ui && npx jest opening-recurrence -t ""` (ou `npm test -- opening-recurrence`).
Expected : FAIL « Cannot find module './opening-recurrence' ».

- [ ] **Step 3 — Implémenter `opening-recurrence.ts`**

```ts
export const OPENING_CYCLIC_SENTINEL_YEAR = 2000;

export type RecurrenceMode = 'always' | 'cyclic' | 'fixed';

export interface RecurrencePeriod {
  recurrence: RecurrenceMode;
  isClosure: boolean;
  startDate: string; // ISO YYYY-MM-DD ('' si aucune)
  endDate: string;
  label: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Encode un mois (1-12) + jour (1-31) en date ISO de l'année-sentinelle. */
export function encodeCyclicDate(month: number, day: number): string {
  return `${OPENING_CYCLIC_SENTINEL_YEAR}-${pad(month)}-${pad(day)}`;
}

/** Si la fin "wrap" (MM-JJ fin < MM-JJ début), place la fin sur l'année+1. */
export function encodeCyclicRange(
  startMonth: number, startDay: number, endMonth: number, endDay: number,
): { startDate: string; endDate: string } {
  const startDate = encodeCyclicDate(startMonth, startDay);
  const wraps = `${pad(endMonth)}${pad(endDay)}` < `${pad(startMonth)}${pad(startDay)}`;
  const endDate = wraps
    ? `${OPENING_CYCLIC_SENTINEL_YEAR + 1}-${pad(endMonth)}-${pad(endDay)}`
    : `${OPENING_CYCLIC_SENTINEL_YEAR}-${pad(endMonth)}-${pad(endDay)}`;
  return { startDate, endDate };
}

export function decodeCyclicMonthDay(iso: string): { month: number; day: number } {
  const [, m, d] = iso.split('-');
  return { month: Number(m), day: Number(d) };
}

export function periodRank(p: RecurrencePeriod): number {
  if (p.isClosure) return 4;
  if (p.recurrence === 'fixed' && (p.startDate || p.endDate)) return 3;
  if (p.recurrence === 'cyclic' && (p.startDate || p.endDate)) return 2;
  return 1;
}

/** Jour-de-l'an approximatif (mois*31+jour) ; pour le cyclique on ajoute 372 si wrap. */
function dayIndex(iso: string): number {
  const { month, day } = decodeCyclicMonthDay(iso);
  return (month - 1) * 31 + day;
}

export function periodWindowWidth(p: RecurrencePeriod): number {
  if (!p.startDate || !p.endDate) return 100000;
  if (p.recurrence === 'cyclic') {
    const lo = dayIndex(p.startDate);
    let hi = dayIndex(p.endDate);
    if (p.endDate.slice(5) < p.startDate.slice(5)) hi += 372; // wrap (compare MM-DD)
    return hi - lo;
  }
  return Math.round((Date.parse(p.endDate) - Date.parse(p.startDate)) / 86400000);
}

interface Interval { lo: number; hi: number; }

function intervalsOf(p: RecurrencePeriod): Interval[] {
  if (!p.startDate || !p.endDate) return [];
  if (p.recurrence === 'cyclic') {
    const lo = dayIndex(p.startDate);
    const hi = dayIndex(p.endDate) + (p.endDate.slice(5) < p.startDate.slice(5) ? 372 : 0);
    // déplie le wrap en deux segments dans [1..372] pour comparer A vs B sur le même axe
    if (hi <= 372) return [{ lo, hi }];
    return [{ lo, hi: 372 }, { lo: 1, hi: hi - 372 }];
  }
  return [{ lo: Date.parse(p.startDate) / 86400000, hi: Date.parse(p.endDate) / 86400000 }];
}

/** Ensemble des jours couverts (axe entier ; cyclique 1..372 wrap déplié, fixe = jours epoch). */
function coveredDays(p: RecurrencePeriod): Set<number> {
  const days = new Set<number>();
  for (const { lo, hi } of intervalsOf(p)) {
    for (let d = Math.ceil(lo); d <= Math.floor(hi); d += 1) days.add(d);
  }
  return days;
}

/**
 * Vrai si deux périodes de même rang se croisent PARTIELLEMENT.
 * Imbrication/containment tolérée : si l'une est entièrement incluse dans l'autre, pas de conflit.
 * (Intersection ensembliste : robuste au wrap déc.→fév., contrairement à une comparaison d'enveloppes.)
 */
export function periodsPartialOverlap(a: RecurrencePeriod, b: RecurrencePeriod): boolean {
  if (a.isClosure || b.isClosure) return false;
  if (periodRank(a) !== periodRank(b)) return false;
  const A = coveredDays(a);
  const B = coveredDays(b);
  if (A.size === 0 || B.size === 0) return false;
  let inter = 0;
  for (const d of B) if (A.has(d)) inter += 1;
  if (inter === 0) return false; // disjointes
  if (inter === A.size || inter === B.size) return false; // l'une contenue dans l'autre → tolérée
  return true; // croisement partiel
}

export interface PeriodConflict { label: string; }

/** Conflits de même couche entre une période candidate et l'existant (hors elle-même). */
export function findPeriodConflicts(
  candidate: RecurrencePeriod, existing: readonly RecurrencePeriod[],
): PeriodConflict[] {
  return existing
    .filter((other) => other !== candidate && periodsPartialOverlap(candidate, other))
    .map((other) => ({ label: other.label || 'période sans nom' }));
}
```

- [ ] **Step 4 — Exécuter (passe)** — Run `npx jest opening-recurrence`. Expected : PASS.

- [ ] **Step 5 — Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/opening-recurrence.ts bertel-tourism-ui/src/features/object-editor/sections/opening-recurrence.test.ts
git commit -m "feat(opening): pure recurrence/overlap helpers (sentinel encode, rank, conflicts)"
```

---

## Task B2 : Modèle + parser (`recurrence`, `isClosure`)

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts` (type ~615-627 ; parser ~2256-2281)
- Test: `bertel-tourism-ui/src/services/object-workspace-parser.test.ts` (ou le fichier de tests parser existant — sinon créer `object-workspace-parser.openings.test.ts`)

- [ ] **Step 1 — Test parser (échoue)**

Ajouter (nouveau fichier `object-workspace-parser.openings.test.ts`) :

```ts
import { parseObjectWorkspace } from './object-workspace-parser';

function resource(periods: unknown[]) {
  return { opening_times: { periods_current: periods, periods_next_year: [] } } as Record<string, unknown>;
}

describe('openings recurrence parsing', () => {
  test('cyclic: all_years=true + dates => recurrence cyclic', () => {
    const m = parseObjectWorkspace(resource([
      { id: 'p1', all_years: true, is_closure: false, date_start: '2000-05-01', date_end: '2000-09-30', weekday_slots: {} },
    ])).openings;
    expect(m.periods[0].recurrence).toBe('cyclic');
    expect(m.periods[0].isClosure).toBe(false);
  });
  test('fixed: all_years=false + dates => recurrence fixed', () => {
    const m = parseObjectWorkspace(resource([
      { id: 'p2', all_years: false, date_start: '2025-01-15', date_end: '2025-12-15', weekday_slots: {} },
    ])).openings;
    expect(m.periods[0].recurrence).toBe('fixed');
  });
  test('always: all_years=true + no dates => recurrence always', () => {
    const m = parseObjectWorkspace(resource([{ id: 'p3', all_years: true, weekday_slots: {} }])).openings;
    expect(m.periods[0].recurrence).toBe('always');
  });
  test('closure: is_closure=true => isClosure true', () => {
    const m = parseObjectWorkspace(resource([
      { id: 'p4', is_closure: true, all_years: false, date_start: '2025-12-25', date_end: '2025-12-25', weekday_slots: {} },
    ])).openings;
    expect(m.periods[0].isClosure).toBe(true);
  });
});
```

> Vérifier le nom exact de l'entrée publique du parser (`parseObjectWorkspace` ou équivalent) au début de `object-workspace-parser.ts` et aligner l'import.

- [ ] **Step 2 — Exécuter (échoue)** — Run `npx jest object-workspace-parser.openings`. Expected : FAIL (`recurrence` undefined).

- [ ] **Step 3 — Étendre le type + le parser**

Dans `object-workspace-parser.ts`, type (~615) :

```ts
export interface ObjectWorkspaceOpeningPeriod {
  recordId: string | null;
  order: string;
  bucket: ObjectWorkspaceOpeningBucket;
  label: string;
  seasonTypeCode: string;
  startDate: string;
  endDate: string;
  allYears: boolean;
  /** Mode de récurrence dérivé/explicite (source de vérité de l'UI). */
  recurrence: 'always' | 'cyclic' | 'fixed';
  /** Couche fermeture (prioritaire, surcharge les périodes ouvertes). */
  isClosure: boolean;
  closedDays: string[];
  weekdays: ObjectWorkspaceOpeningWeekday[];
}
```

Dans `parseWorkspaceOpeningPeriodRecord` (~2256), remplacer le bloc de retour :

```ts
  const isClosure = readBoolean(record.is_closure);
  const allYearsFlag = isOpeningPeriodAllYears(record); // conserve la compat lecture
  const startDate = readString(record.date_start, readString(record.start_date));
  const endDate = readString(record.date_end, readString(record.end_date));
  const allYearsExplicit = record.all_years === true || record.all_years === 'true';
  const hasDates = Boolean(startDate || endDate);
  const recurrence: ObjectWorkspaceOpeningPeriod['recurrence'] =
    allYearsExplicit && hasDates ? 'cyclic'
    : !allYearsExplicit && hasDates ? 'fixed'
    : 'always';

  return {
    recordId: readString(record.id) || null,
    order: readString(record.order, String(index + 1)),
    bucket,
    label: readString(record.label, readString(record.name, `Periode ${index + 1}`)),
    seasonTypeCode: readString(record.period_type_code),
    startDate,
    endDate,
    allYears: recurrence === 'always' ? true : allYearsExplicit,
    recurrence,
    isClosure,
    closedDays: readStringList(record.closed_days),
    weekdays: fallbackWeekdays,
  };
```

> `readBoolean` existe déjà dans ce fichier (utilisé par `parseWorkspaceFollowUpNote`). Appliquer le **même** changement dans le second site de retour (~2308, `flattenedOpeningTimes`) avec `recurrence`/`isClosure`.

- [ ] **Step 4 — Exécuter (passe)** — Run `npx jest object-workspace-parser.openings`. Expected : PASS.

- [ ] **Step 5 — Commit**

```bash
git add bertel-tourism-ui/src/services/object-workspace-parser.ts bertel-tourism-ui/src/services/object-workspace-parser.openings.test.ts
git commit -m "feat(opening): parse recurrence mode + is_closure into the period model"
```

---

## Task B3 : Builder de payload (`saveObjectWorkspaceOpenings`)

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts:4305-4359`
- Test: `bertel-tourism-ui/src/services/object-workspace.openings.test.ts` (créer)

- [ ] **Step 1 — Test builder (échoue)**

On teste le mapping pur via une fonction extraite `buildOpeningsPayload(periods)`. Créer le test :

```ts
import { buildOpeningsPayload } from './object-workspace';
import type { ObjectWorkspaceOpeningPeriod } from './object-workspace-parser';

const p = (o: Partial<ObjectWorkspaceOpeningPeriod>): ObjectWorkspaceOpeningPeriod => ({
  recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false,
  closedDays: [], weekdays: [], ...o,
});

describe('buildOpeningsPayload', () => {
  test('cyclic => all_years true + dates kept', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'cyclic', allYears: true, startDate: '2000-05-01', endDate: '2000-09-30' })]);
    expect(out[0].all_years).toBe(true);
    expect(out[0].date_start).toBe('2000-05-01');
    expect(out[0].date_end).toBe('2000-09-30');
    expect(out[0].is_closure).toBe(false);
  });
  test('fixed => all_years false + dates kept', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'fixed', allYears: false, startDate: '2025-01-15', endDate: '2025-12-15' })]);
    expect(out[0].all_years).toBe(false);
    expect(out[0].date_start).toBe('2025-01-15');
  });
  test('always => dates nulled', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'always', allYears: true, startDate: '2000-01-01', endDate: '2000-12-31' })]);
    expect(out[0].date_start).toBeNull();
    expect(out[0].date_end).toBeNull();
  });
  test('closure carries is_closure + dates', () => {
    const out = buildOpeningsPayload([p({ isClosure: true, recurrence: 'fixed', allYears: false, startDate: '2025-12-25', endDate: '2025-12-25' })]);
    expect(out[0].is_closure).toBe(true);
    expect(out[0].date_start).toBe('2025-12-25');
  });
});
```

- [ ] **Step 2 — Exécuter (échoue)** — Run `npx jest object-workspace.openings`. Expected : FAIL (`buildOpeningsPayload` non exporté).

- [ ] **Step 3 — Extraire + adapter `buildOpeningsPayload`**

Dans `object-workspace.ts`, extraire le `.map` actuel en fonction pure exportée et l'appeler depuis `saveObjectWorkspaceOpenings` :

```ts
export function buildOpeningsPayload(periods: ObjectWorkspaceOpeningPeriod[]) {
  return periods.map((period, periodIndex) => {
    const openTimePeriods = period.weekdays
      .map((weekday) => {
        const frames = weekday.slots
          .map((slot) => ({ start_time: toNullableText(slot.start), end_time: toNullableText(slot.end) }))
          .filter((slot) => slot.start_time || slot.end_time);
        return { closed: false, weekdays: [{ weekday_code: normalizeOpeningWeekdayCode(weekday.code) }], time_frames: frames };
      })
      .filter((timePeriod) => timePeriod.weekdays[0]?.weekday_code);
    const openCodes = new Set(openTimePeriods.map((tp) => tp.weekdays[0]?.weekday_code));
    const closedTimePeriods = Array.from(new Set(period.closedDays.map(normalizeOpeningWeekdayCode)))
      .filter((code) => code && !openCodes.has(code))
      .map((code) => ({ closed: true, weekdays: [{ weekday_code: code }], time_frames: [] }));

    // always => pas de dates ; cyclic/fixed => on conserve les dates ; closure idem.
    const hasDates = period.recurrence !== 'always';
    return {
      id: toRpcUuid(period.recordId),
      name: toNullableText(period.label),
      period_type_code: toNullableText(period.seasonTypeCode),
      date_start: hasDates ? toNullableText(period.startDate) : null,
      date_end: hasDates ? toNullableText(period.endDate) : null,
      all_years: period.recurrence === 'fixed' ? false : true,
      is_closure: period.isClosure,
      extra: { workspace_order: period.order || String(periodIndex + 1) },
      schedules: [{ schedule_type_code: 'regular', name: 'Horaires', time_periods: [...openTimePeriods, ...closedTimePeriods] }],
    };
  });
}

export async function saveObjectWorkspaceOpenings(objectId: string, input: ObjectWorkspaceOpeningsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) return;
  await callObjectWorkspaceRpc('save_object_openings', objectId, { periods: buildOpeningsPayload(input.periods) }, 'Impossible d enregistrer les horaires.');
}
```

(Le `workspace_bucket` est retiré de `extra` — le bucket disparaît.)

- [ ] **Step 4 — Exécuter (passe)** — Run `npx jest object-workspace.openings`. Expected : PASS.

- [ ] **Step 5 — Commit**

```bash
git add bertel-tourism-ui/src/services/object-workspace.ts bertel-tourism-ui/src/services/object-workspace.openings.test.ts
git commit -m "feat(opening): map recurrence/is_closure in openings save payload; drop bucket"
```

---

## Task B4 : Refonte de la modale période (récurrence, type optionnel, validation)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/opening-period-edit.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/OpeningPeriodEditModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/opening-period-edit.test.ts` (existe)

- [ ] **Step 1 — Tests des helpers (échouent)**

Ajouter dans `opening-period-edit.test.ts` :

```ts
import { createPeriodDraft, validatePeriodDraft } from './opening-period-edit';

test('createPeriodDraft defaults to cyclic, not closure', () => {
  const d = createPeriodDraft(0);
  expect(d.recurrence).toBe('cyclic');
  expect(d.isClosure).toBe(false);
});

test('validatePeriodDraft: cyclic requires both bounds', () => {
  const d = { ...createPeriodDraft(0), recurrence: 'cyclic' as const, startDate: '2000-05-01', endDate: '' };
  expect(validatePeriodDraft(d).canSave).toBe(false);
});

test('validatePeriodDraft: always always saves (no dates needed)', () => {
  const d = { ...createPeriodDraft(0), recurrence: 'always' as const, startDate: '', endDate: '' };
  expect(validatePeriodDraft(d).canSave).toBe(true);
});
```

- [ ] **Step 2 — Exécuter (échoue)** — Run `npx jest opening-period-edit`. Expected : FAIL.

- [ ] **Step 3 — Adapter `opening-period-edit.ts`**

- Supprimer `OPENING_BUCKET_OPTIONS` (n'est plus utilisé).
- `createPeriodDraft` :

```ts
export function createPeriodDraft(index = 0): ObjectWorkspaceOpeningPeriod {
  return {
    recordId: null,
    order: String(index + 1),
    bucket: 'current',
    label: '',
    seasonTypeCode: '',
    startDate: '',
    endDate: '',
    allYears: true,
    recurrence: 'cyclic',
    isClosure: false,
    closedDays: [],
    weekdays: OPENING_WEEKDAYS.map(({ code, label }) => ({ code, label: label.toLowerCase(), slots: [] })),
  };
}
```

- `validatePeriodDraft` (le type n'est plus requis ; la cohérence dépend de `recurrence`) :

```ts
export function validatePeriodDraft(period: ObjectWorkspaceOpeningPeriod): PeriodValidation {
  const dateError = periodDateError(period);
  const canSave = dateError === null;
  return { canSave, dateError };
}

function periodDateError(period: ObjectWorkspaceOpeningPeriod): string | null {
  if (period.recurrence === 'always') return null;
  const hasStart = period.startDate.trim().length > 0;
  const hasEnd = period.endDate.trim().length > 0;
  if (!hasStart || !hasEnd) return 'Renseignez le début et la fin de la période.';
  if (period.endDate < period.startDate && period.recurrence === 'fixed') {
    return 'La date de fin doit être postérieure à la date de début.';
  }
  return null;
}
```

- [ ] **Step 4 — Exécuter (helpers passent)** — Run `npx jest opening-period-edit`. Expected : PASS.

- [ ] **Step 5 — Test modale (échoue)**

Ajouter `OpeningPeriodEditModal.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { OpeningPeriodEditModal } from './OpeningPeriodEditModal';
import { createPeriodDraft } from '../sections/opening-period-edit';

test('shows month pickers in cyclic mode, hides bucket dropdown', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'cyclic' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={() => {}} onSave={() => {}} />,
  );
  expect(screen.getByLabelText('Récurrence')).toBeInTheDocument();
  expect(screen.queryByLabelText('Période (cycle)')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Mois de début')).toBeInTheDocument();
});
```

- [ ] **Step 6 — Exécuter (échoue)** — Run `npx jest OpeningPeriodEditModal`. Expected : FAIL.

- [ ] **Step 7 — Refonte de `OpeningPeriodEditModal.tsx`**

Changements clés (garder la structure `EditorModal`/`Field`/`ScheduleEditor`) :
1. Ajouter une prop `existingPeriods: ObjectWorkspaceOpeningPeriod[]` (pour la validation chevauchement, en excluant le draft édité).
2. Remplacer le `Field "Période (cycle)"` par un `Field "Récurrence"` (segmented/Select 3 valeurs) pilotant `draft.recurrence`.
3. Zone de dates adaptative selon `draft.recurrence` :
   - `cyclic` → sélecteurs **Mois de début / Jour (opt.) → Mois de fin / Jour (opt.)** ; à l'`onChange`, écrire `startDate`/`endDate` via `encodeCyclicRange(...)` (jour vide → 1 pour début, dernier jour du mois pour fin).
   - `fixed` → deux `Input type="date"` (comportement actuel).
   - `always` → aucun champ de date.
4. `Type de période` → `required` retiré ; libellé « Type / étiquette (optionnel) » ; à la sélection, ne plus toucher `allYears`/dates (le type ne pilote plus la récurrence). Le placeholder reste « — Choisir un type — ».
5. Avant `onSave`, calculer les conflits :

```tsx
import { findPeriodConflicts, type RecurrencePeriod } from '../sections/opening-recurrence';

const conflicts = findPeriodConflicts(
  draft as unknown as RecurrencePeriod,
  initialDraft.recordId
    ? existingPeriods.filter((p) => p.recordId !== initialDraft.recordId) as unknown as RecurrencePeriod[]
    : existingPeriods as unknown as RecurrencePeriod[],
);
const overlapError = conflicts.length > 0
  ? `Cette période recoupe : ${conflicts.map((c) => c.label).join(', ')}.`
  : null;
// saveDisabled={!validation.canSave || Boolean(overlapError)} ; afficher overlapError en role="alert".
```

> `ObjectWorkspaceOpeningPeriod` est un sur-ensemble structurel de `RecurrencePeriod` (champs `recurrence`, `isClosure`, `startDate`, `endDate`, `label`) — le cast est sûr. Alternative plus propre : faire accepter `RecurrencePeriod` aux helpers via une interface partagée et mapper explicitement.

6. Retirer le bloc `Dates de fermeture exceptionnelle` de cette modale (déplacé au niveau objet — Task B5). La modale période ne gère plus que les horaires d'ouverture.
7. Mettre à jour `SectionOpenings.tsx` pour passer `existingPeriods={periods}` aux deux usages de la modale.

Étiquettes requises par le test : `aria-label="Récurrence"`, `aria-label="Mois de début"` (etc.).

- [ ] **Step 8 — Exécuter (passe)** — Run `npx jest OpeningPeriodEditModal opening-period-edit`. Expected : PASS.

- [ ] **Step 9 — Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/opening-period-edit.ts bertel-tourism-ui/src/features/object-editor/widgets/OpeningPeriodEditModal.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionOpenings.tsx bertel-tourism-ui/src/features/object-editor/widgets/OpeningPeriodEditModal.test.tsx bertel-tourism-ui/src/features/object-editor/sections/opening-period-edit.test.ts
git commit -m "feat(opening): recurrence selector + adaptive dates + optional type + overlap guard in modal"
```

---

## Task B5 : Fermetures au niveau objet (dates isolées + plages + récurrentes)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/ClosureEditModal.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionOpenings.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/ClosureEditModal.test.tsx`

- [ ] **Step 1 — Test (échoue)**

```tsx
import { render, screen } from '@testing-library/react';
import { ClosureEditModal } from './ClosureEditModal';

test('closure modal supports a single date and a range toggle', () => {
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={() => {}} />);
  expect(screen.getByLabelText('Date de fermeture')).toBeInTheDocument();
  expect(screen.getByLabelText('Plage de dates')).toBeInTheDocument();
  expect(screen.getByLabelText('Se répète chaque année')).toBeInTheDocument();
});
```

- [ ] **Step 2 — Exécuter (échoue)** — Run `npx jest ClosureEditModal`. Expected : FAIL.

- [ ] **Step 3 — Implémenter `ClosureEditModal.tsx`**

Modale qui produit un `ObjectWorkspaceOpeningPeriod` avec `isClosure: true`, `weekdays: []`, `closedDays: []` :
- Toggle « Plage de dates » : off → une date (début=fin) ; on → début + fin.
- Toggle « Se répète chaque année » : on → `recurrence: 'cyclic'`, encoder via `encodeCyclicRange` ; off → `recurrence: 'fixed'`, dates complètes.
- `label` optionnel (ex. « Travaux », « Jour férié »).
- `onSave(period)` renvoie le period prêt à pousser dans le tableau `openings.periods`.

```tsx
import { useState } from 'react';
import { EditorModal, Field, Input } from '../primitives';
import { encodeCyclicRange } from '../sections/opening-recurrence';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  draft?: ObjectWorkspaceOpeningPeriod;
  onClose: () => void;
  onSave: (closure: ObjectWorkspaceOpeningPeriod) => void;
}

export function ClosureEditModal({ open, mode, draft, onClose, onSave }: Props) {
  const [label, setLabel] = useState(draft?.label ?? '');
  const [isRange, setIsRange] = useState(Boolean(draft && draft.startDate !== draft.endDate));
  const [recurring, setRecurring] = useState(draft?.recurrence === 'cyclic');
  const [start, setStart] = useState(draft?.startDate ?? '');
  const [end, setEnd] = useState(draft?.endDate ?? '');

  const canSave = start.length > 0 && (!isRange || end.length > 0);

  function build(): ObjectWorkspaceOpeningPeriod {
    const effEnd = isRange ? end : start;
    let startDate = start, endDate = effEnd;
    if (recurring) {
      const sm = Number(start.slice(5, 7)), sd = Number(start.slice(8, 10));
      const em = Number(effEnd.slice(5, 7)), ed = Number(effEnd.slice(8, 10));
      ({ startDate, endDate } = encodeCyclicRange(sm, sd, em, ed));
    }
    return {
      recordId: draft?.recordId ?? null, order: draft?.order ?? '1', bucket: 'current',
      label, seasonTypeCode: '', startDate, endDate,
      allYears: recurring, recurrence: recurring ? 'cyclic' : 'fixed', isClosure: true,
      closedDays: [], weekdays: [],
    };
  }

  return (
    <EditorModal open={open} title={mode === 'edit' ? 'Modifier la fermeture' : 'Ajouter une fermeture'}
      onClose={onClose} onSave={() => onSave(build())} saveDisabled={!canSave} size="md">
      <Field label="Nom (optionnel)"><Input aria-label="Nom de la fermeture" value={label} onChange={setLabel} placeholder="ex. Travaux, Jour férié" /></Field>
      <label><input type="checkbox" aria-label="Plage de dates" checked={isRange} onChange={(e) => setIsRange(e.target.checked)} /> Plage de dates</label>
      <Field label={isRange ? 'Début' : 'Date de fermeture'}>
        <Input type="date" aria-label="Date de fermeture" value={start} onChange={setStart} />
      </Field>
      {isRange && <Field label="Fin"><Input type="date" aria-label="Fin de fermeture" value={end} onChange={setEnd} /></Field>}
      <label><input type="checkbox" aria-label="Se répète chaque année" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} /> Se répète chaque année</label>
    </EditorModal>
  );
}
```

> Vérifier la signature réelle de `Input` (le projet utilise `onChange={(value) => ...}`, pas l'event natif — cf. modale période). Adapter les `onChange` des `Input` en conséquence ; garder l'event natif uniquement pour les `checkbox` bruts (ou utiliser le primitive Toggle du projet s'il existe).

- [ ] **Step 4 — Exécuter (passe)** — Run `npx jest ClosureEditModal`. Expected : PASS.

- [ ] **Step 5 — Brancher dans `SectionOpenings.tsx`**

- Séparer `periods` en `openPeriods = periods.filter((p) => !p.isClosure)` et `closures = periods.filter((p) => p.isClosure)`.
- Passer `openPeriods` (et leur validation) à `OpeningPeriodsEditor` ; afficher une sous-liste « Fermetures exceptionnelles » avec un bouton « Ajouter une fermeture » ouvrant `ClosureEditModal`.
- À la sauvegarde d'une fermeture : `replace([...periods, closure])` (ou remplacement par recordId en édition).
- `existingPeriods` passé à `OpeningPeriodEditModal` = `openPeriods` (les fermetures ne comptent pas dans le chevauchement).

- [ ] **Step 6 — Exécuter (suite verte)** — Run `npx jest SectionOpenings ClosureEditModal`. Expected : PASS.

- [ ] **Step 7 — Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/widgets/ClosureEditModal.tsx bertel-tourism-ui/src/features/object-editor/widgets/ClosureEditModal.test.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionOpenings.tsx
git commit -m "feat(opening): object-level closures (single date or range, optional yearly)"
```

---

## Task B6 : Présentation — retrait du `bucket`, indication de couche

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/opening-period-meta.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/OpeningPeriodsEditor.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/blocks/opening-period-meta.test.ts` (créer si absent)

- [ ] **Step 1 — Test (échoue)**

```ts
import { formatPeriodRange } from './opening-period-meta';

const p = (o: any) => ({ recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false, closedDays: [], weekdays: [], ...o });

test('always => Toute l’année', () => {
  expect(formatPeriodRange(p({ recurrence: 'always' }))).toBe('Toute l’année');
});
test('cyclic => month range without year', () => {
  expect(formatPeriodRange(p({ recurrence: 'cyclic', allYears: true, startDate: '2000-05-01', endDate: '2000-09-30' })))
    .toMatch(/mai.*sept/i);
});
```

- [ ] **Step 2 — Exécuter (échoue)** — Run `npx jest opening-period-meta`. Expected : FAIL (cyclic affiche l'année via `formatShortDate`).

- [ ] **Step 3 — Adapter `opening-period-meta.ts`**

- `formatPeriodRange` : brancher sur `period.recurrence` :
  - `always` → `'Toute l’année'`
  - `cyclic` → formater **mois (+ jour si ≠ 1er / dernier)** sans année (utiliser `decodeCyclicMonthDay` + un tableau MONTHS) ; ex. `mai → sept.`
  - `fixed` → comportement actuel (date complète).
- Retirer la branche `period.bucket === 'next-year'` (le bucket disparaît).
- `currentPeriodIndex` : ne plus s'appuyer sur `bucket`. Le remplacer par « la période active aujourd'hui » via une résolution simple (ou retourner `0`). Implémentation minimale : retourner l'index de la première période `recurrence !== 'always'` active aujourd'hui, sinon 0. (La résolution complète est optionnelle ; garder simple.)

> `bucket` reste dans le type (compat parser) mais n'est plus lu par l'UI. Une passe T4 de nettoyage pourra le retirer du type.

- [ ] **Step 4 — Exécuter (passe)** — Run `npx jest opening-period-meta`. Expected : PASS.

- [ ] **Step 5 — `OpeningPeriodsEditor.tsx`** : retirer tout affichage du `bucket` ; afficher un badge de couche (Cyclique / Dates fixes / Toute l'année) dérivé de `recurrence`. Pas de logique métier nouvelle.

- [ ] **Step 6 — Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/blocks/opening-period-meta.ts bertel-tourism-ui/src/features/object-editor/sections/OpeningPeriodsEditor.tsx bertel-tourism-ui/src/features/object-editor/sections/blocks/opening-period-meta.test.ts
git commit -m "feat(opening): drop bucket from UI, show recurrence layer label"
```

---

# PHASE C — Intégration, vérification, documentation

## Task C1 : Suite complète + typecheck + smoke live

- [ ] **Step 1 — Suite Jest complète**

Run : `cd bertel-tourism-ui && npm test`.
Expected : suite verte (la baseline ~1273 tests + nouveaux). Corriger tout fixture cassé par l'ajout de `recurrence`/`isClosure` (chercher les fabriques de `ObjectWorkspaceOpeningPeriod` dans les tests existants et ajouter les deux champs).

- [ ] **Step 2 — Typecheck**

Run : `cd bertel-tourism-ui && npx tsc --noEmit`.
Expected : 0 erreur.

- [ ] **Step 3 — Build**

Run : `cd bertel-tourism-ui && npm run build`.
Expected : exit 0.

- [ ] **Step 4 — Smoke live (déploiement backend déjà appliqué)**

Appliquer `migration_opening_period_recurrence.sql` sur live (MCP `apply_migration`), `NOTIFY pgrst, 'reload schema'`, puis : créer un objet test, sauver une période cyclique mai→sept via l'éditeur, recharger → vérifier que `recurrence='cyclic'` revient et que la plage s'affiche sans année ; ajouter une fermeture 25 déc. récurrente ; lancer `SELECT api.refresh_open_status();` et vérifier `cached_is_open_now`.

- [ ] **Step 5 — Commit (le cas échéant — corrections de fixtures)**

```bash
git add -A
git commit -m "test(opening): fix fixtures for recurrence/is_closure fields"
```

## Task C2 : Journal de décisions + CLAUDE.md

- [ ] **Step 1 — `lot1_mapping_decisions.md`** : nouveau § documentant : modèle 3-modes, cascade de priorité (closure>fixed>cyclic>base), même-couche (croisement interdit / imbrication tolérée), `is_closure`, année-sentinelle 2000 (+ wrap 2001), retrait du type `year_round`, suppression du menu bucket, réécriture `refresh_open_status`. Inclure les emplacements de fichiers et le n° de manifest (14j).

- [ ] **Step 2 — Proposer un invariant `CLAUDE.md`** (sous « Business invariants ») :
  > « Périodes d'ouverture = cascade de priorité (fermeture > dates fixes > cyclique > base) ; à couche égale aucun croisement partiel (imbrication tolérée, la plus étroite gagne). Cyclique = `all_years=TRUE` + dates en année-sentinelle 2000 (wrap → 2001). Fermeture = `is_closure=TRUE`. `refresh_open_status` retient la période active la plus spécifique ; une fermeture active force fermé. »

- [ ] **Step 3 — Commit**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
git commit -m "docs(opening): log recurrence/cascade decisions + CLAUDE.md invariant proposal"
```

---

## Risques & garde-fous
- **Perf `refresh_open_status`** : vérifier l'EXPLAIN (Task A2 Step 5) ; rester set-based (§37).
- **Helper SQL de chevauchement** : le porter depuis la fonction pure TS testée (Task B1) plutôt que de réinventer en SQL (Task A3 Step 3).
- **Fixtures de tests existants** : l'ajout de 2 champs au modèle cassera les fabriques — balayer en Task C1.
- **Consommateurs d'« horaires aujourd'hui »** hors `cached_is_open_now` (cards/drawer) : à auditer (grep `cached_is_open_now`, `opening_times`, `weekday_slots`) ; aligner sur la résolution priorité si l'un affiche les horaires du jour. Hors cœur de ce plan ; ticket de suivi si trouvé.
- **`bucket`** reste dans le type pour la compat parser ; retrait complet = nettoyage T4.

# Brique 2 — Registre temporel `metric_snapshot` + cron quotidien — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser un registre historique faisant foi des stats du dashboard (complétude + corpus + classés + couverture + backlog CRM), figé chaque jour par un job pg_cron, lisible en séries temporelles et en comparaison année-après-année.

**Architecture:** Une table générique long-format `public.metric_snapshot`. Une fonction `api.capture_metric_snapshots(date)` `SECURITY DEFINER` qui appelle les RPC instantanées existantes (dont `api.get_dashboard_completeness`, déjà live) et upsert un panel de KPIs pour la date. Un job pg_cron quotidien l'exécute. Deux RPC de lecture (`get_metric_snapshot_series`, `get_metric_snapshot_yoy`) servent le front. **Backend only** — la consommation frontend (widgets) est un plan séparé, mutualisé avec la Brique 1.

**Tech Stack:** PostgreSQL (Supabase), pg_cron, SQL fonctions `api.*` `SECURITY DEFINER`. Tests `psql`-style transactionnels (BEGIN/ROLLBACK + `ASSERT`) exécutés via Supabase MCP `execute_sql`.

## Global Constraints

- **Deploy integrity** : toute DDL doit être (a) foldée dans la source canonique (`schema_unified.sql` pour la table, `api_views_functions.sql` pour les fonctions), ET (b) listée dans `docs/SQL_ROLLOUT_RUNBOOK.md` + `Base de donnée DLL et API/ci_fresh_apply.sql` + le workflow `.github/workflows/sql-fresh-apply.yml`. Un fresh DB doit reproduire le live.
- **Prochain id manifest** : `14s` (14r est le dernier pris).
- **search_path des fonctions** : `SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref` ; générer les UUID avec `gen_random_uuid()` (jamais `uuid_generate_v4()`).
- **Idempotence** : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, upsert `ON CONFLICT`, cron `IF NOT EXISTS`.
- **Complétude consommée, jamais redéfinie** : contrat figé = `api.get_dashboard_completeness(p_types, p_status, p_filters, p_updated_at_from, p_updated_at_to, p_below_limit)` → JSONB `{rows:[{type,total,avg_score,complete_pct,missing_top_field,below_80}]}`.
- **Pas de PII** dans `metric_snapshot` (agrégats uniquement).
- **Tests** : fichier `Base de donnée DLL et API/tests/test_metric_snapshot.sql`, exécuté via MCP `execute_sql` (le contenu commence par `BEGIN;` et finit par `ROLLBACK;` ; un `ASSERT` qui échoue lève une erreur = FAIL ; absence d'erreur = PASS). Pas de Docker/psql local (recette §60).
- **Workflow commit** : commits directs sur `master`, uniquement ses propres hunks ; l'utilisateur push. Appliquer le SQL au live via Supabase MCP `apply_migration`.

---

## File Structure

- **Create** `Base de donnée DLL et API/migration_metric_snapshot.sql` — migration incrémentale live (table + RLS + fonctions + note cron). Manifest `14s`.
- **Create** `Base de donnée DLL et API/tests/test_metric_snapshot.sql` — tests transactionnels.
- **Modify** `Base de donnée DLL et API/schema_unified.sql` — fold de la table `metric_snapshot` + RLS (section tables `other`/dashboard).
- **Modify** `Base de donnée DLL et API/api_views_functions.sql` — fold des 3 fonctions (`capture_metric_snapshots`, `get_metric_snapshot_series`, `get_metric_snapshot_yoy`).
- **Modify** `Base de donnée DLL et API/maintenance.sql` — bloc cron idempotent `capture-metric-snapshots`.
- **Modify** `Base de donnée DLL et API/ci_fresh_apply.sql` — étape de création de la table (fresh apply).
- **Modify** `docs/SQL_ROLLOUT_RUNBOOK.md` — entrée manifest `14s`.
- **Modify** `.github/workflows/sql-fresh-apply.yml` — exécuter `tests/test_metric_snapshot.sql`.

---

### Task 1: Table `metric_snapshot` + RLS + enregistrement deploy

**Files:**
- Create: `Base de donnée DLL et API/migration_metric_snapshot.sql`
- Create: `Base de donnée DLL et API/tests/test_metric_snapshot.sql`
- Modify: `Base de donnée DLL et API/schema_unified.sql` (fold table)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`
- Modify: `.github/workflows/sql-fresh-apply.yml`

**Interfaces:**
- Produces: table `public.metric_snapshot (id uuid, snapshot_date date, scope text, scope_key text NOT NULL DEFAULT '', metric_key text, value numeric, denominator integer, captured_at timestamptz)` + `UNIQUE (snapshot_date, scope, scope_key, metric_key)`. RLS ON ; `SELECT` ouvert à `authenticated` ; écritures réservées à `service_role`/DEFINER.

- [ ] **Step 1: Écrire le test (table + RLS + grants)**

Créer `Base de donnée DLL et API/tests/test_metric_snapshot.sql` :

```sql
-- test_metric_snapshot.sql
-- Brique 2 (manifest 14s): registre temporel metric_snapshot + capture + lecture.
-- Run AFTER the manifest. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  -- table + colonnes
  ASSERT to_regclass('public.metric_snapshot') IS NOT NULL, 'metric_snapshot must exist';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.metric_snapshot'::regclass),
         'metric_snapshot must have RLS enabled';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='metric_snapshot'
                   AND column_name='metric_key'), 'metric_key column present';
  -- unicité (snapshot_date,scope,scope_key,metric_key)
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value)
    VALUES ('2026-01-01','global','','t_demo',1);
  DECLARE v_dup boolean := false;
  BEGIN
    INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value)
      VALUES ('2026-01-01','global','','t_demo',2);
  EXCEPTION WHEN unique_violation THEN v_dup := true; END;
  ASSERT v_dup, 'duplicate (date,scope,scope_key,metric) must violate unique';
  RAISE NOTICE 'metric_snapshot table assertions passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Exécuter le contenu du fichier via Supabase MCP `execute_sql`.
Attendu : ERREUR `relation "public.metric_snapshot" does not exist` (table absente).

- [ ] **Step 3: Écrire la migration (table + RLS + grants)**

Créer `Base de donnée DLL et API/migration_metric_snapshot.sql` :

```sql
-- migration_metric_snapshot.sql — Brique 2 (manifest 14s)
-- Registre temporel des stats dashboard (séries + YoY). Idempotent.
-- Folded into schema_unified.sql (table) + api_views_functions.sql (functions).
BEGIN;

CREATE TABLE IF NOT EXISTS public.metric_snapshot (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  scope         text NOT NULL,            -- 'global' | 'type' | 'category' | 'commune' | 'status'
  scope_key     text NOT NULL DEFAULT '', -- '' pour 'global' ; ex. 'HLO', 'Le Tampon', 'published'
  metric_key    text NOT NULL,            -- ex. 'completeness_avg', 'corpus_count', 'classified_count'
  value         numeric NOT NULL,
  denominator   integer,                  -- ex. 'total' du type (recompose un %)
  captured_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_metric_snapshot UNIQUE (snapshot_date, scope, scope_key, metric_key)
);
CREATE INDEX IF NOT EXISTS idx_metric_snapshot_read
  ON public.metric_snapshot (metric_key, scope, scope_key, snapshot_date);

COMMENT ON TABLE public.metric_snapshot IS
'Registre temporel faisant foi des stats dashboard (Brique 2). Long-format: une ligne par
(snapshot_date, scope, scope_key, metric_key). Agrégats non-PII. Écrit par
api.capture_metric_snapshots (cron quotidien), lu par api.get_metric_snapshot_series / _yoy.';

ALTER TABLE public.metric_snapshot ENABLE ROW LEVEL SECURITY;
-- Agrégats non-PII : lecture authenticated OK ; écritures uniquement via la fonction
-- SECURITY DEFINER / service_role (aucune policy write ⇒ deny pour anon/authenticated).
DROP POLICY IF EXISTS metric_snapshot_read ON public.metric_snapshot;
CREATE POLICY metric_snapshot_read ON public.metric_snapshot
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.metric_snapshot TO authenticated;

COMMIT;
```

- [ ] **Step 4: Fold de la table dans `schema_unified.sql`**

Dans `Base de donnée DLL et API/schema_unified.sql`, ajouter le même bloc `CREATE TABLE IF NOT EXISTS public.metric_snapshot (...)` + index + `ENABLE ROW LEVEL SECURITY` + policy `metric_snapshot_read` + `GRANT SELECT … TO authenticated`, à la suite des autres tables applicatives non-domaine (rechercher la section où sont définies les tables dashboard/`audit_*` applicatives ; placer après une table autonome sans FK entrante). Le bloc doit être identique à la migration (idempotent).

- [ ] **Step 5: Enregistrer dans la chaîne deploy**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, ajouter après l'entrée `14r` :

```
14s. `migration_metric_snapshot.sql` — **Brique 2 registre temporel (table)** : `public.metric_snapshot`
(long-format `(snapshot_date,scope,scope_key,metric_key,value,denominator)`, unique de désambiguïsation,
RLS ON + read authenticated, écritures DEFINER/service_role). Foldé dans `schema_unified.sql`. After step 1.
Idempotent. Couvert par `tests/test_metric_snapshot.sql`. Spec
`docs/superpowers/specs/2026-06-18-dashboard-timeseries-observatory-design.md`.
```

Dans `Base de donnée DLL et API/ci_fresh_apply.sql`, vérifier que le fold `schema_unified.sql` couvre la table (rien à ajouter si la table y est foldée — le driver applique `schema_unified.sql`). Si le driver liste les migrations une à une, ajouter une étape `\i migration_metric_snapshot.sql` au bon rang (après la création des tables de base).

Dans `.github/workflows/sql-fresh-apply.yml`, ajouter `tests/test_metric_snapshot.sql` à la liste des tests exécutés après le manifest (suivre le motif d'une entrée existante, ex. `test_set_tag_color.sql`).

- [ ] **Step 6: Appliquer au live + relancer le test**

Appliquer `migration_metric_snapshot.sql` au live via Supabase MCP `apply_migration` (name: `metric_snapshot_table`).
Puis exécuter `tests/test_metric_snapshot.sql` via MCP `execute_sql`.
Attendu : `NOTICE: metric_snapshot table assertions passed.` (aucune erreur).

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/migration_metric_snapshot.sql" \
        "Base de donnée DLL et API/tests/test_metric_snapshot.sql" \
        "Base de donnée DLL et API/schema_unified.sql" \
        "Base de donnée DLL et API/ci_fresh_apply.sql" \
        "docs/SQL_ROLLOUT_RUNBOOK.md" \
        ".github/workflows/sql-fresh-apply.yml"
git commit -m "feat(dashboard): metric_snapshot table (Brique 2 registre temporel, manifest 14s)"
```

---

### Task 2: Fonction de capture `api.capture_metric_snapshots`

**Files:**
- Modify: `Base de donnée DLL et API/migration_metric_snapshot.sql` (append fonction)
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (fold fonction)
- Modify: `Base de donnée DLL et API/tests/test_metric_snapshot.sql` (append asserts capture)

**Interfaces:**
- Consumes: `api.get_dashboard_completeness(object_type[], object_status[], jsonb, date, date, int) → jsonb`; table `public.metric_snapshot` (Task 1).
- Produces: `api.capture_metric_snapshots(p_date date DEFAULT current_date) → integer` (nb de lignes pour la date). Écrit les `metric_key` : `completeness_avg` (scope type + global), `completeness_complete_pct` (type), `corpus_count` (global/type/status), `classified_count` (global/commune), `sustainability_count` (global), `accessibility_count` (global), `crm_backlog` (global). `SECURITY DEFINER`, EXECUTE réservé `service_role`.

- [ ] **Step 1: Écrire les asserts de capture (append au test)**

Avant le `ROLLBACK;` final de `tests/test_metric_snapshot.sql`, ajouter un second bloc `DO`:

```sql
DO $$
DECLARE v_n integer; v_corpus numeric; v_again integer;
BEGIN
  -- grants : anon ne doit pas exécuter, service_role oui
  ASSERT NOT has_function_privilege('anon','api.capture_metric_snapshots(date)','EXECUTE'),
         'anon must NOT execute capture_metric_snapshots';

  v_n := api.capture_metric_snapshots(DATE '2026-06-18');
  ASSERT v_n > 0, 'capture must write rows';

  -- corpus global = total non-ORG
  SELECT value INTO v_corpus FROM public.metric_snapshot
   WHERE snapshot_date='2026-06-18' AND scope='global' AND metric_key='corpus_count';
  ASSERT v_corpus = (SELECT count(*) FROM object WHERE object_type<>'ORG'),
         'corpus_count global matches live count';

  -- complétude par type présente (HLO existe en publié)
  ASSERT EXISTS (SELECT 1 FROM public.metric_snapshot
                 WHERE snapshot_date='2026-06-18' AND scope='type'
                   AND metric_key='completeness_avg'),
         'completeness_avg per type captured';

  -- idempotence : re-run ⇒ pas de doublon, une seule ligne par clé
  v_again := api.capture_metric_snapshots(DATE '2026-06-18');
  ASSERT (SELECT count(*) FROM public.metric_snapshot
          WHERE snapshot_date='2026-06-18' AND scope='global'
            AND metric_key='corpus_count') = 1,
         'idempotent re-run keeps one row per key';
  RAISE NOTICE 'capture_metric_snapshots assertions passed.';
END$$;
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Exécuter `tests/test_metric_snapshot.sql` via MCP `execute_sql`.
Attendu : ERREUR `function api.capture_metric_snapshots(date) does not exist`.

- [ ] **Step 3: Écrire la fonction (append à la migration)**

Avant le `COMMIT;` de `migration_metric_snapshot.sql`, ajouter :

```sql
CREATE OR REPLACE FUNCTION api.capture_metric_snapshots(p_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  v_comp jsonb;
  v_rows integer;
BEGIN
  -- 1. Complétude (pool publié) — contrat figé api.get_dashboard_completeness
  v_comp := api.get_dashboard_completeness(NULL, ARRAY['published']::object_status[],
                                           '{}'::jsonb, NULL, NULL, 0);

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',r->>'type','completeness_avg',(r->>'avg_score')::numeric,(r->>'total')::int
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',r->>'type','completeness_complete_pct',(r->>'complete_pct')::numeric,(r->>'total')::int
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  -- moyenne globale pondérée par le nombre de fiches
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','completeness_avg',
         ROUND(SUM((r->>'avg_score')::numeric*(r->>'total')::numeric)
               / NULLIF(SUM((r->>'total')::numeric),0),1),
         SUM((r->>'total')::int)
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  -- 2. Corpus net (tous statuts, hors ORG) : global / type / statut
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','corpus_count',count(*),NULL FROM object WHERE object_type<>'ORG'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',object_type::text,'corpus_count',count(*),NULL
  FROM object WHERE object_type<>'ORG' GROUP BY object_type
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'status',status::text,'corpus_count',count(*),NULL
  FROM object WHERE object_type<>'ORG' GROUP BY status
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 3. Classés (granted) : global + par commune
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','classified_count',count(DISTINCT object_id),NULL
  FROM object_classification WHERE status='granted'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'commune',COALESCE(NULLIF(btrim(ol.city),''),'(inconnu)'),'classified_count',
         count(DISTINCT oc.object_id),NULL
  FROM object_classification oc
  JOIN object_location ol ON ol.object_id=oc.object_id AND ol.is_main_location=true
  WHERE oc.status='granted' GROUP BY 3
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 4. Couverture : durabilité / accessibilité
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','sustainability_count',count(DISTINCT object_id),NULL
  FROM object_sustainability_action
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','accessibility_count',count(DISTINCT oa.object_id),NULL
  FROM object_amenity oa
  JOIN ref_amenity ra ON ra.id=oa.amenity_id
  JOIN ref_code_amenity_family f ON f.id=ra.family_id
  WHERE f.code='accessibility'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 5. Backlog CRM (provisoire jusqu'à Brique 3 : non résolu ET statut <> 'done')
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','crm_backlog',count(*),NULL
  FROM crm_interaction WHERE resolved_at IS NULL AND status::text <> 'done'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  SELECT count(*) INTO v_rows FROM public.metric_snapshot WHERE snapshot_date=p_date;
  RETURN v_rows;
END$fn$;

COMMENT ON FUNCTION api.capture_metric_snapshots(date) IS
'Brique 2: fige le panel de KPIs dashboard pour p_date dans metric_snapshot (upsert idempotent).
Complétude via api.get_dashboard_completeness (pool publié), corpus net (tous statuts), classés
(granted, global+commune), couverture durable/accessibilité, backlog CRM (provisoire avant Brique 3).
Exécutée par le cron quotidien capture-metric-snapshots.';

REVOKE ALL ON FUNCTION api.capture_metric_snapshots(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.capture_metric_snapshots(date) TO service_role;
```

- [ ] **Step 4: Fold de la fonction dans `api_views_functions.sql`**

Copier le bloc `CREATE OR REPLACE FUNCTION api.capture_metric_snapshots ...` + son `COMMENT` + `REVOKE`/`GRANT` dans `Base de donnée DLL et API/api_views_functions.sql`, à la suite des fonctions `get_dashboard_*` (rechercher `get_dashboard_completeness` et placer après son bloc).

- [ ] **Step 5: Appliquer au live + relancer le test**

Appliquer le bloc fonction au live via MCP `apply_migration` (name: `capture_metric_snapshots_fn`).
Exécuter `tests/test_metric_snapshot.sql` via MCP `execute_sql`.
Attendu : `NOTICE: capture_metric_snapshots assertions passed.` (aucune erreur).

- [ ] **Step 6: Semer le premier point réel (live, hors transaction)**

Via MCP `execute_sql` : `SELECT api.capture_metric_snapshots();` (date = aujourd'hui).
Vérifier : `SELECT scope, metric_key, count(*) FROM public.metric_snapshot WHERE snapshot_date=current_date GROUP BY 1,2 ORDER BY 1,2;`
Attendu : lignes pour `completeness_avg`(type+global), `corpus_count`(global/type/status), `classified_count`(global/commune), `sustainability_count`, `accessibility_count`, `crm_backlog`. (Le 1ᵉʳ point de toutes les courbes est posé.)

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/migration_metric_snapshot.sql" \
        "Base de donnée DLL et API/api_views_functions.sql" \
        "Base de donnée DLL et API/tests/test_metric_snapshot.sql"
git commit -m "feat(dashboard): api.capture_metric_snapshots — panel KPIs quotidien (Brique 2)"
```

---

### Task 3: Job pg_cron quotidien

**Files:**
- Modify: `Base de donnée DLL et API/maintenance.sql`

**Interfaces:**
- Consumes: `api.capture_metric_snapshots()` (Task 2).
- Produces: job pg_cron `capture-metric-snapshots` (`0 3 * * *`).

- [ ] **Step 1: Ajouter le bloc cron idempotent**

Dans `Base de donnée DLL et API/maintenance.sql`, à l'intérieur du `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN ...`, après le bloc `maintain-partitions` (avant le `ELSE`), insérer :

```sql
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capture-metric-snapshots') THEN
      PERFORM cron.schedule(
        'capture-metric-snapshots',
        '0 3 * * *',
        $cron$SELECT api.capture_metric_snapshots()$cron$
      );
    END IF;
```

- [ ] **Step 2: Appliquer le bloc maintenance au live**

Via MCP `execute_sql`, exécuter le `DO $$ ... END$$;` complet du bloc cron de `maintenance.sql` (le bloc est gardé par `IF EXISTS pg_cron` ⇒ sûr).

- [ ] **Step 3: Vérifier le job en live**

Via MCP `execute_sql` : `SELECT jobname, schedule, command FROM cron.job WHERE jobname='capture-metric-snapshots';`
Attendu : 1 ligne, `schedule = '0 3 * * *'`, `command = 'SELECT api.capture_metric_snapshots()'`.

> Note : le CI fresh-apply OMET pg_cron (cf. `ci_fresh_apply.sql`), donc ce job n'est PAS testé en CI — la vérification est live (cette étape). Le bloc est idempotent et garde-fou par `IF EXISTS`.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/maintenance.sql"
git commit -m "feat(dashboard): cron quotidien capture-metric-snapshots (Brique 2)"
```

---

### Task 4: RPC de lecture — séries + comparaison année-après-année

**Files:**
- Modify: `Base de donnée DLL et API/migration_metric_snapshot.sql` (append)
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (fold)
- Modify: `Base de donnée DLL et API/tests/test_metric_snapshot.sql` (append asserts lecture)

**Interfaces:**
- Consumes: table `public.metric_snapshot`.
- Produces:
  - `api.get_metric_snapshot_series(p_metric_key text, p_scope text DEFAULT 'global', p_scope_key text DEFAULT '', p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_grain text DEFAULT 'month') → TABLE(bucket date, value numeric, denominator integer)` — dernière valeur du bucket (sémantique stock). EXECUTE `authenticated, service_role`.
  - `api.get_metric_snapshot_yoy(p_metric_key text, p_scope text DEFAULT 'global', p_scope_key text DEFAULT '', p_years int DEFAULT 3) → TABLE(yr int, mon int, value numeric)` — valeurs mensuelles alignées par mois sur N années (overlay YoY). EXECUTE `authenticated, service_role`.

- [ ] **Step 1: Écrire les asserts de lecture (append au test)**

Avant le `ROLLBACK;` final de `tests/test_metric_snapshot.sql`, ajouter :

```sql
DO $$
DECLARE v_pts integer; v_yoy integer;
BEGIN
  ASSERT has_function_privilege('authenticated',
    'api.get_metric_snapshot_series(text,text,text,date,date,text)','EXECUTE'),
    'authenticated must execute get_metric_snapshot_series';

  -- jeu d'essai : 2 jours du même mois + 1 jour l'an précédent
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value) VALUES
    ('2026-03-10','global','','corpus_count',800),
    ('2026-03-28','global','','corpus_count',820),  -- dernier du bucket mois
    ('2025-03-15','global','','corpus_count',700);

  -- série mensuelle : le bucket 2026-03 retient la DERNIÈRE valeur (820)
  SELECT count(*) INTO v_pts FROM api.get_metric_snapshot_series('corpus_count','global','','2026-01-01','2026-12-31','month');
  ASSERT v_pts >= 1, 'series returns the 2026-03 bucket';
  ASSERT (SELECT value FROM api.get_metric_snapshot_series('corpus_count','global','','2026-03-01','2026-03-31','month')
          LIMIT 1) = 820, 'stock semantics: last snapshot of the month wins';

  -- YoY : 2025 et 2026 présents pour le mois 3
  SELECT count(*) INTO v_yoy FROM api.get_metric_snapshot_yoy('corpus_count','global','',5) WHERE mon=3;
  ASSERT v_yoy = 2, 'YoY returns both 2025 and 2026 for month 3';
  RAISE NOTICE 'get_metric_snapshot_series/_yoy assertions passed.';
END$$;
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Exécuter `tests/test_metric_snapshot.sql` via MCP `execute_sql`.
Attendu : ERREUR `function api.get_metric_snapshot_series(...) does not exist`.

- [ ] **Step 3: Écrire les 2 fonctions de lecture (append à la migration)**

Avant le `COMMIT;` de `migration_metric_snapshot.sql`, ajouter :

```sql
CREATE OR REPLACE FUNCTION api.get_metric_snapshot_series(
  p_metric_key text,
  p_scope      text DEFAULT 'global',
  p_scope_key  text DEFAULT '',
  p_from       date DEFAULT NULL,
  p_to         date DEFAULT NULL,
  p_grain      text DEFAULT 'month'
)
RETURNS TABLE(bucket date, value numeric, denominator integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $fn$
  WITH src AS (
    SELECT date_trunc(p_grain, snapshot_date)::date AS bucket,
           snapshot_date, value, denominator,
           ROW_NUMBER() OVER (PARTITION BY date_trunc(p_grain, snapshot_date)
                              ORDER BY snapshot_date DESC) AS rn
    FROM public.metric_snapshot
    WHERE metric_key = p_metric_key
      AND scope      = p_scope
      AND scope_key  = p_scope_key
      AND (p_from IS NULL OR snapshot_date >= p_from)
      AND (p_to   IS NULL OR snapshot_date <= p_to)
  )
  SELECT bucket, value, denominator FROM src WHERE rn = 1 ORDER BY bucket;
$fn$;

CREATE OR REPLACE FUNCTION api.get_metric_snapshot_yoy(
  p_metric_key text,
  p_scope      text DEFAULT 'global',
  p_scope_key  text DEFAULT '',
  p_years      int  DEFAULT 3
)
RETURNS TABLE(yr int, mon int, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $fn$
  WITH monthly AS (
    SELECT EXTRACT(YEAR  FROM snapshot_date)::int AS yr,
           EXTRACT(MONTH FROM snapshot_date)::int AS mon,
           value,
           ROW_NUMBER() OVER (PARTITION BY date_trunc('month', snapshot_date)
                              ORDER BY snapshot_date DESC) AS rn
    FROM public.metric_snapshot
    WHERE metric_key = p_metric_key AND scope = p_scope AND scope_key = p_scope_key
  )
  SELECT yr, mon, value FROM monthly
  WHERE rn = 1 AND yr > (EXTRACT(YEAR FROM current_date)::int - p_years)
  ORDER BY yr, mon;
$fn$;

REVOKE ALL ON FUNCTION api.get_metric_snapshot_series(text,text,text,date,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_metric_snapshot_yoy(text,text,text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_metric_snapshot_series(text,text,text,date,date,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_metric_snapshot_yoy(text,text,text,int) TO authenticated, service_role;
```

- [ ] **Step 4: Fold dans `api_views_functions.sql`**

Copier les 2 fonctions + leurs `REVOKE`/`GRANT` dans `api_views_functions.sql`, juste après `api.capture_metric_snapshots`.

- [ ] **Step 5: Appliquer au live + relancer le test complet**

Appliquer au live via MCP `apply_migration` (name: `metric_snapshot_read_rpcs`).
Exécuter l'intégralité de `tests/test_metric_snapshot.sql` via MCP `execute_sql`.
Attendu : les 4 `NOTICE` (`table`, `capture`, `series/_yoy`) sans erreur.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_metric_snapshot.sql" \
        "Base de donnée DLL et API/api_views_functions.sql" \
        "Base de donnée DLL et API/tests/test_metric_snapshot.sql"
git commit -m "feat(dashboard): get_metric_snapshot_series/_yoy — lecture séries + YoY (Brique 2)"
```

---

## Hors périmètre de ce plan (suite)

- **Frontend** : types `MetricSnapshotPoint`/`MetricSnapshotYoY`, service `getMetricSnapshotSeries`/`getMetricSnapshotYoy` dans `dashboard-rpc.ts`, hook, et widget « complétude dans le temps » (onglet Qualité) avec toggle YoY. → plan frontend dédié, mutualisé avec le `TimeseriesChart` de la Brique 1 (le composant graphique se construit une fois). Le widget n'a de valeur qu'après quelques jours/mois d'accumulation.
- **Brique 1** (séries dérivées rétroactives) et **Brique 3** (cycle de vie CRM → temps net, backlog précis) : plans séparés.
- **Décision PO en attente** (spec §9.7) : périmètre du panel (publiés vs tous statuts) — ici complétude=publiés, corpus=tous statuts ; à confirmer.

---

## Self-Review

**Spec coverage (spec §3 Brique 2 + §0 YoY) :** table générique long-format ✅ (Task 1) ; cron quotidien idempotent ✅ (Task 3) ; consomme `get_dashboard_completeness` sans la redéfinir ✅ (Task 2) ; panel (complétude + corpus net + classés/commune + couverture + backlog CRM) ✅ (Task 2) ; rétention indéfinie (aucune purge) ✅ ; lecture séries + YoY ✅ (Task 4) ; deploy integrity (fold + manifest 14s + CI test) ✅ (Task 1/2/4).

**Placeholder scan :** aucun TODO/TBD ; tout le SQL et les commandes sont explicites.

**Type consistency :** `metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)` identique table↔INSERT↔ON CONFLICT (clé `(snapshot_date,scope,scope_key,metric_key)`) ↔ lecture (mêmes colonnes filtrées). Contrat `get_dashboard_completeness` (avg_score/complete_pct/total) cohérent entre Task 2 et la source live vérifiée. `scope_key` NOT NULL DEFAULT '' partout (pas de NULL ⇒ ON CONFLICT fiable).

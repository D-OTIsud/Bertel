# Label Filter — Sectioned Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Explorer "Label" filter is active, group results into "Établissements labellisés" (hold the certified label) then "Aussi pertinents — actions/équipements compatibles" (equivalent evidence only), with real per-group counts, on the List/Cards and Table views, plus a filter toggle to restrict to genuine label-holders for fast bulk-selection.

**Architecture:** The backend `api.get_filtered_object_ids` already emits `label_rank` (0/1) + `label_match`. Two additive SQL edits: a `label_scheme_ranked_exact_only` gate (restrict to rank-0), and — in `list_object_resources_filtered_page` — make `label_rank` the primary sort when the label filter is active + return `meta.label_rank_counts`. Frontend: a new boolean common filter (`rankedLabelIncludeEquivalents`, default true), a pure sectioning helper that partitions loaded cards by `label_match.rank`, and rendering in both result views. Counts thread through the TanStack-query page (not the store).

**Tech Stack:** PostgreSQL (Supabase), Next.js/React, TanStack Query, Zustand, Tailwind, Jest.

**Design spec:** [docs/superpowers/specs/2026-07-03-label-filter-sectioned-results-design.md](../specs/2026-07-03-label-filter-sectioned-results-design.md)

## Global Constraints

- **Commits:** conventional (`feat:`/`fix:`/`test:`/`docs:`), **NO `Co-Authored-By` trailer** (attribution disabled globally). Commit to `master`, by explicit pathspec, staging + committing in ONE shell invocation. The user pushes; never `git push`, never `--amend`.
- **SQL deploy integrity:** every function edit is (a) applied **in place** in the folded canonical `Base de donnée DLL et API/api_views_functions.sql` (fresh==live) AND (b) carried in FULL (`CREATE OR REPLACE FUNCTION …` whole body — Postgres has no partial ALTER) by a NEW migration `Base de donnée DLL et API/migration_label_filter_sections.sql`, listed in `docs/SQL_ROLLOUT_RUNBOOK.md`, wired into `ci_fresh_apply.sql` + `.github/workflows/sql-fresh-apply.yml`. Do **NOT** edit the historical `migration_filters_accessibility_label.sql`.
- **SQL live verification (no local Docker):** verify each function change on live via the Supabase MCP `execute_sql` with ONE call: `BEGIN; <full CREATE OR REPLACE>; <DO $$ … ASSERT …; $$>; ROLLBACK;` (empty result = pass; a failed `ASSERT` aborts). The cloud MCP DB is **prod OTI** — verify transactionally first, apply permanently only via the reviewed migration.
- **Signatures unchanged ⇒ NO `NOTIFY pgrst`.** Both edited functions keep their exact signatures.
- **Payload backward-compat:** emit `label_scheme_ranked_exact_only` in the RPC payload **only** when `common.rankedLabelIncludeEquivalents === false` (strict) — default/`true`/`undefined` emits nothing, byte-identical to today.
- **Counts semantics:** `meta.label_rank_counts` is corpus-wide (computed off the full `filt` set, like `meta.total`). On the client, read it from **page 0** (`pages[0]`) — all buckets are queried on the first page; later scroll pages drop exhausted buckets. Never sum across scroll pages. Within one page, sum across the parallel bucket calls.
- **`since_fast` is NOT modified** — it uses keyset `(ts,id)` pagination and does not select `label_rank`; changing its ORDER BY would corrupt pagination.
- **Section trigger:** headers render only when BOTH rank groups are non-empty. Copy: rank-0 = `Établissements labellisés`; rank-1 = `Aussi pertinents — actions compatibles` (sustainability) or `Aussi pertinents — équipements compatibles` (source `accessibility_amenity`).
- **Decision-log number:** before finalizing docs, run `grep -oE '^## §[0-9]+' "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" | tail -1` and use the next integer (referenced below as `§NN`).
- **jest/tsc (worktree caveat):** if executing in a fresh git worktree, `node_modules` is a junction — run `cmd //c "mklink /J node_modules ..\\..\\Bertel3.0\\bertel-tourism-ui\\node_modules"` before jest/tsc, else `Cannot find package 'next'`.

---

## File Structure

**Backend (SQL):**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` — `get_filtered_object_ids` (exact_only), `list_object_resources_filtered_page` (sort + counts).
- Create: `Base de donnée DLL et API/migration_label_filter_sections.sql` — full bodies of both edited functions.
- Create: `Base de donnée DLL et API/tests/test_label_filter_sections.sql` — CI regression.
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`, `Base de donnée DLL et API/ci_fresh_apply.sql`, `.github/workflows/sql-fresh-apply.yml`.

**Frontend — filter state & contract:**
- Modify: `bertel-tourism-ui/src/types/domain.ts` — `ExplorerCommonFilters.rankedLabelIncludeEquivalents`, `RpcPageMeta.label_rank_counts`.
- Modify: `bertel-tourism-ui/src/utils/facets.ts` — default, normalize, payload.
- Modify: `bertel-tourism-ui/src/store/explorer-store.ts` — setter.
- Modify: `bertel-tourism-ui/src/lib/explorer-search-params.ts` — URL param.
- Modify: `bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts` — chip + group.
- Modify: `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx` — removal case.

**Frontend — counts plumbing:**
- Modify: `bertel-tourism-ui/src/services/rpc.ts` — `ExplorerCardsPage.labelRankCounts` + aggregation.
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` — expose `labelRankCounts`.
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx` — pass prop to 3 mounts.

**Frontend — sectioning UI:**
- Create: `bertel-tourism-ui/src/utils/explorer-result-sections.ts` + `.test.ts` — pure helper.
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsList.tsx` (+ `.test.tsx`).
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx`, `bertel-tourism-ui/src/styles.css`.
- Modify: `bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx` — toggle.

**Docs/memory:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§NN), `CLAUDE.md` (deferred tracker), auto-memory.

---

## PHASE 1 — Backend (SQL)

### Task 1: `get_filtered_object_ids` — `label_scheme_ranked_exact_only` gate

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (params CTE ~after line 1206; WHERE gate lines 1737–1741)
- Create: `Base de donnée DLL et API/tests/test_label_filter_sections.sql`

**Interfaces:**
- Produces: filter key `label_scheme_ranked_exact_only` (boolean). When present+true with `label_scheme_ranked`, only rank-0 (certified-label) rows are returned; `label_rank`/`label_match` unchanged.

- [ ] **Step 1: Write the failing SQL assertion.** Create `Base de donnée DLL et API/tests/test_label_filter_sections.sql` (house pattern: `\set ON_ERROR_STOP on` → `BEGIN;` → `DO $$…$$;` with `ASSERT`, seed lookups asserted present → `ROLLBACK;`):

```sql
-- test_label_filter_sections.sql
-- Label filter sectioning regression:
--   * label_scheme_ranked_exact_only=true restricts api.get_filtered_object_ids to rank-0 (certified label).
--   * api.list_object_resources_filtered_page sorts label_rank first when the label filter is active (even with search).
--   * meta.label_rank_counts = {labelled, equivalent} is correct.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_labelled  text := 'HOTLBLSECT00001';   -- holds LBL_CLEF_VERTE (granted)
  v_equiv     text := 'HOTLBLSECT00002';   -- equivalent sustainability action, no label
  v_scheme    uuid;
  v_action    uuid;
  v_rows      int;
BEGIN
  SELECT id INTO v_scheme FROM ref_classification_scheme WHERE code = 'LBL_CLEF_VERTE';
  ASSERT v_scheme IS NOT NULL, 'Missing LBL_CLEF_VERTE scheme seed';
  SELECT rcea.action_id INTO v_action
  FROM ref_classification_equivalent_action rcea
  WHERE rcea.scheme_id = v_scheme AND rcea.match_scope IN ('search_expansion','both')
  LIMIT 1;
  ASSERT v_action IS NOT NULL, 'Missing equivalent action seed for LBL_CLEF_VERTE';

  INSERT INTO object (id, object_type, status, name) VALUES
    (v_labelled, 'HOT', 'published', 'Labelled Sect Test'),
    (v_equiv,    'HOT', 'published', 'Equivalent Sect Test');
  INSERT INTO object_classification (object_id, scheme_id, status)
    VALUES (v_labelled, v_scheme, 'granted');
  INSERT INTO object_sustainability_action (object_id, action_id)
    VALUES (v_equiv, v_action);

  -- exact_only=true ⇒ only the labelled object survives; the equivalent one is excluded.
  SELECT COUNT(*) INTO v_rows
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE','label_scheme_ranked_exact_only',true),
    ARRAY['HOT']::object_type[], ARRAY['published']::object_status[], NULL
  ) f WHERE f.object_id IN (v_labelled, v_equiv);
  ASSERT v_rows = 1, format('exact_only should return only the labelled object, got %s rows', v_rows);

  SELECT COUNT(*) INTO v_rows
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE','label_scheme_ranked_exact_only',true),
    ARRAY['HOT']::object_type[], ARRAY['published']::object_status[], NULL
  ) f WHERE f.object_id = v_equiv;
  ASSERT v_rows = 0, 'exact_only must exclude equivalent-evidence objects';

  -- default (no exact_only) still returns BOTH (rank-0 + rank-1).
  SELECT COUNT(*) INTO v_rows
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE'),
    ARRAY['HOT']::object_type[], ARRAY['published']::object_status[], NULL
  ) f WHERE f.object_id IN (v_labelled, v_equiv);
  ASSERT v_rows = 2, format('default should return both objects, got %s', v_rows);

  RAISE NOTICE 'Label filter sectioning (exact_only) assertions passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Run it against the current live function to verify it FAILS.** Via Supabase MCP `execute_sql`, paste the file's body. Expected: FAIL on the first `ASSERT v_rows = 1` (current function ignores `label_scheme_ranked_exact_only`, returns 2). This confirms the test exercises the new behavior.

- [ ] **Step 3: Edit `get_filtered_object_ids` in `api_views_functions.sql`.** (a) In the `params` CTE, insert after line 1206 (`END AS label_disability_types_any,`):

```sql
      -- §NN — restrict a ranked-label filter to rank-0 (certified label) only, excluding
      -- equivalent evidence. Only meaningful alongside label_scheme_ranked.
      COALESCE((n.filters->>'label_scheme_ranked_exact_only')::boolean, false) AS exact_only,
```

(b) Replace the WHERE gate (lines 1737–1741) with:

```sql
    AND (NOT (params.filters ? 'label_scheme_ranked') OR (
      exact_label.evidence_count > 0
      OR (NOT params.exact_only AND (
        sustainability_evidence.evidence_count > 0
        OR accessibility_evidence.evidence_count > 0
      ))
    ));
```

- [ ] **Step 4: Verify live via transient apply.** Via MCP `execute_sql`, run ONE statement: `BEGIN; <the full edited CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(...) body, lines 1050–1742>; <the DO block from Step 1>; ROLLBACK;`. Expected: no error, `NOTICE: … assertions passed.` (The `ROLLBACK` discards both the transient function and the fixtures.)

- [ ] **Step 5: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_label_filter_sections.sql" && git commit -m "feat(filters): label_scheme_ranked_exact_only — get_filtered_object_ids restreint aux labellisés rank-0 (folded api_views_functions.sql + test CI)"
```

---

### Task 2: `list_object_resources_filtered_page` — label_rank primary sort + `meta.label_rank_counts`

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (DECLARE ~6092; paged CTE 6159 & 6161; INTO 6207–6210; RETURN meta 6234–6247)
- Modify: `Base de donnée DLL et API/tests/test_label_filter_sections.sql`

**Interfaces:**
- Consumes: `get_filtered_object_ids` (`label_rank`).
- Produces: results ordered rank-0 first when `label_scheme_ranked` present (even under `p_search`); `meta.label_rank_counts = {labelled, equivalent}` (or `null` when the label filter is inactive).

- [ ] **Step 1: Extend the SQL test with sort + counts assertions.** Append inside the `DO` block (before the final `RAISE NOTICE`):

```sql
  -- Sort: with a search term that matches BOTH, the labelled (rank-0) card must come FIRST.
  DECLARE
    v_page  jsonb;
    v_first text;
    v_counts jsonb;
  BEGIN
    v_page := api.list_object_resources_filtered_page(
      NULL, ARRAY['fr']::text[], 50,
      jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE'),
      ARRAY['HOT']::object_type[], ARRAY['published']::object_status[],
      'Sect Test'
    )::jsonb;
    SELECT (elem->>'id') INTO v_first
    FROM jsonb_array_elements(v_page->'data') WITH ORDINALITY AS t(elem, ord)
    WHERE (elem->>'id') IN (v_labelled, v_equiv)
    ORDER BY ord LIMIT 1;
    ASSERT v_first = v_labelled, format('labelled card must sort first under search, got %s', v_first);

    v_counts := v_page->'meta'->'label_rank_counts';
    ASSERT v_counts IS NOT NULL, 'meta.label_rank_counts must be present when label filter active';
    ASSERT (v_counts->>'labelled')::int >= 1, format('labelled count wrong: %s', v_counts);
    ASSERT (v_counts->>'equivalent')::int >= 1, format('equivalent count wrong: %s', v_counts);
  END;
```

- [ ] **Step 2: Run against current live page function to verify it FAILS.** Via MCP `execute_sql`, run the full test body (Task 1 function already verified transiently — for this step run against the *current* live page fn). Expected: FAIL at `ASSERT v_counts IS NOT NULL` (current meta has no `label_rank_counts`), or at the sort assertion if search relevance reorders. Confirms the test targets the new behavior.

- [ ] **Step 3: Edit `list_object_resources_filtered_page` in `api_views_functions.sql`.**
  (a) DECLARE — after line 6092 (`v_current_cursor TEXT;`) add:
```sql
  v_rank0 INT;
  v_rank1 INT;
```
  (b) `paged` CTE — replace the shared ORDER BY expression in BOTH the window (line 6159) and the trailing sort (line 6161). Current (both): `f.relevance DESC, f.label_rank, f.name_normalized NULLS LAST, f.id`. Replace both with:
```sql
CASE WHEN v_filters ? 'label_scheme_ranked' THEN f.label_rank END, f.relevance DESC, f.label_rank, f.name_normalized NULLS LAST, f.id
```
  (When the filter is absent the leading `CASE` is NULL for every row → legacy order preserved; when present, `label_rank` sorts first.)
  (c) INTO block — replace lines 6207–6210 with:
```sql
  SELECT
    (SELECT COUNT(*) FROM filt) AS total,
    (SELECT data FROM decorated_data) AS data,
    (SELECT COUNT(*) FROM filt WHERE label_rank = 0) AS rank0,
    (SELECT COUNT(*) FROM filt WHERE label_rank = 1) AS rank1
  INTO v_total, v_data, v_rank0, v_rank1;
```
  (d) RETURN meta — add, right after the `'total', v_total,` line (6240):
```sql
      'label_rank_counts', CASE WHEN v_filters ? 'label_scheme_ranked'
        THEN json_build_object('labelled', v_rank0, 'equivalent', v_rank1)
        ELSE NULL END,
```

- [ ] **Step 4: Verify live via transient apply.** Via MCP `execute_sql`: `BEGIN; <full edited get_filtered_object_ids>; <full edited list_object_resources_filtered_page>; <the complete DO block>; ROLLBACK;`. Expected: `NOTICE: … assertions passed.` no error.

- [ ] **Step 5: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_label_filter_sections.sql" && git commit -m "feat(filters): page RPC — tri label_rank prioritaire sous filtre label + meta.label_rank_counts (folded ; since_fast intact car keyset)"
```

---

### Task 3: Migration + runbook + CI wiring + live apply

**Files:**
- Create: `Base de donnée DLL et API/migration_label_filter_sections.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`, `Base de donnée DLL et API/ci_fresh_apply.sql`, `.github/workflows/sql-fresh-apply.yml`

**Interfaces:**
- Consumes: the edited `api_views_functions.sql` bodies (Tasks 1–2).
- Produces: a live-appliable migration reproducing fresh==live; CI fresh-apply gate green.

- [ ] **Step 1: Create the migration** `migration_label_filter_sections.sql`. It carries the FULL, edited `CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(...)` (copy verbatim from the now-edited `api_views_functions.sql` lines 1050–1742) followed by the FULL edited `CREATE OR REPLACE FUNCTION api.list_object_resources_filtered_page(...)` (lines 6051–6251), wrapped:

```sql
-- =====================================================================
-- migration_label_filter_sections.sql  (manifest step 16k ; decision log §NN)
-- Explorer : résultats sectionnés du filtre Label.
--   1. get_filtered_object_ids gagne la clé jsonb `label_scheme_ranked_exact_only`
--      (restreint aux labellisés rank-0 ; démarches équivalentes exclues).
--   2. list_object_resources_filtered_page trie label_rank en premier quand le
--      filtre label est actif (même sous recherche) + renvoie meta.label_rank_counts.
-- since_fast NON touché (keyset (ts,id)). Signatures inchangées ⇒ pas de NOTIFY pgrst.
-- FOLDED : api_views_functions.sql (fresh==live). Le plus récent des CREATE OR REPLACE
-- de get_filtered_object_ids ⇒ porte le corps complet §157+§162+§NN.
-- REVERSIBLE : git checkout api_views_functions.sql + ré-application de l'ancienne def.
-- TEST CI : tests/test_label_filter_sections.sql (fresh-apply gate).
-- =====================================================================
BEGIN;

-- <<< paste the ENTIRE edited CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(...) $$; here >>>

-- <<< paste the ENTIRE edited CREATE OR REPLACE FUNCTION api.list_object_resources_filtered_page(...) $$; here >>>

COMMIT;
```

- [ ] **Step 2: Add the runbook manifest entry.** In `docs/SQL_ROLLOUT_RUNBOOK.md`, after the `ORG2` entry (line 179) and before the `14. REFRESH MATERIALIZED VIEW` step (line 181), add a blank line then:

```
16k. `migration_label_filter_sections.sql` — **Résultats sectionnés du filtre Label (decision log §NN)** (self-contained ; après 16j — **le plus récent des CREATE OR REPLACE d'`api.get_filtered_object_ids`**, il DOIT porter le corps complet §157+§162+§NN). Deux CREATE OR REPLACE : `api.get_filtered_object_ids` gagne la clé jsonb `label_scheme_ranked_exact_only` (restreint aux labellisés rank-0) ; `api.list_object_resources_filtered_page` trie `label_rank` en premier sous filtre label + renvoie `meta.label_rank_counts`. `since_fast` intact (keyset). Signatures inchangées ⇒ pas de NOTIFY pgrst. Foldé : `api_views_functions.sql`. Live-applied <date> (transient BEGIN/ROLLBACK + apply). Couvert par `tests/test_label_filter_sections.sql`.
```

- [ ] **Step 3: Wire the fresh-apply driver.** In `Base de donnée DLL et API/ci_fresh_apply.sql`, after the `\ir migration_filters_accessibility_label.sql` block (16j) and before the `ORG1` `\echo`, add (ASCII-only `\echo`):

```
\echo '== 16k    migration_label_filter_sections.sql  (SNN resultats sectionnes filtre Label: cle label_scheme_ranked_exact_only + tri label_rank + meta.label_rank_counts; APRES 16j corps complet get_filtered_object_ids; CI = tests/test_label_filter_sections.sql) =='
\ir migration_label_filter_sections.sql
```

- [ ] **Step 4: Wire the CI test runner.** In `.github/workflows/sql-fresh-apply.yml`, after the ORG2 branding test step and before `- name: Stop Supabase`, add:

```yaml
      - name: "label section filter test (16k §NN — exact_only + sort + label_rank_counts)"
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_label_filter_sections.sql"
```

- [ ] **Step 5: Apply live + verify + commit.** Apply the migration to live via MCP `apply_migration` (name `label_filter_sections`). Then run `tests/test_label_filter_sections.sql` body (non-transactional, real fixtures inside its own BEGIN/ROLLBACK) via MCP `execute_sql` → expect the pass NOTICE. Then:

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/migration_label_filter_sections.sql" "docs/SQL_ROLLOUT_RUNBOOK.md" "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" && git commit -m "chore(sql): migration_label_filter_sections (16k) + runbook + fresh-apply + CI test — résultats sectionnés du filtre Label appliqués live"
```

---

## PHASE 2 — Frontend filter state & contract

### Task 4: `rankedLabelIncludeEquivalents` type + default + normalize + payload (facets)

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts` (after line 191)
- Modify: `bertel-tourism-ui/src/utils/facets.ts` (default ~line 76; normalize ~line 140; payload ~lines 420–422)
- Modify: `bertel-tourism-ui/src/utils/facets.test.ts`

**Interfaces:**
- Produces: `ExplorerCommonFilters.rankedLabelIncludeEquivalents: boolean` (default `true`); `buildBucketRpcFilters` emits `label_scheme_ranked_exact_only: true` iff a scheme is set AND `rankedLabelIncludeEquivalents === false`.

- [ ] **Step 1: Write failing facets tests.** In `bertel-tourism-ui/src/utils/facets.test.ts`, append a new describe block at end of file:

```ts
describe('buildBucketRpcFilters — label sections (§NN, exact-only)', () => {
  it('omits label_scheme_ranked_exact_only by default (equivalents included)', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'LBL_CLEF_VERTE' },
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({ label_scheme_ranked: 'LBL_CLEF_VERTE' });
    expect(buildBucketRpcFilters(filters, 'HOT')).not.toHaveProperty('label_scheme_ranked_exact_only');
  });

  it('emits label_scheme_ranked_exact_only=true when equivalents are excluded', () => {
    const filters = buildFilters({
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        rankedLabelSchemeCode: 'LBL_CLEF_VERTE',
        rankedLabelIncludeEquivalents: false,
      },
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({
      label_scheme_ranked: 'LBL_CLEF_VERTE',
      label_scheme_ranked_exact_only: true,
    });
  });

  it('does not emit exact-only when no scheme is selected', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelIncludeEquivalents: false },
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).not.toHaveProperty('label_scheme_ranked_exact_only');
  });

  it('normalizes rankedLabelIncludeEquivalents to true by default', () => {
    const normalized = normalizeExplorerFilters(buildFilters({}));
    expect(normalized.common.rankedLabelIncludeEquivalents).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** `cd bertel-tourism-ui && npx jest src/utils/facets.test.ts -t "label sections"`. Expected: FAIL — TS/`rankedLabelIncludeEquivalents` unknown or property emitted incorrectly.

- [ ] **Step 3a: Add the type.** In `domain.ts`, insert after line 191 (`rankedLabelSchemeCode: string | null;`):

```ts
  /**
   * §NN — quand un scheme classé est actif (`rankedLabelSchemeCode`), inclure les objets
   * couverts par une démarche équivalente en plus des labellisés directs. Défaut TRUE
   * (comportement historique). FALSE ⇒ `label_scheme_ranked_exact_only` au RPC.
   */
  rankedLabelIncludeEquivalents: boolean;
```

- [ ] **Step 3b: Add the default.** In `facets.ts` `DEFAULT_COMMON_FILTERS`, after line 76 (`rankedLabelSchemeCode: null,`):

```ts
  rankedLabelIncludeEquivalents: true,
```

- [ ] **Step 3c: Add normalize carry-through.** In `facets.ts` normalize `common:` block, after line 140 (`rankedLabelSchemeCode: cleanString(...) || null,`) — use `??` so an explicit `false` survives:

```ts
      rankedLabelIncludeEquivalents: common.rankedLabelIncludeEquivalents ?? true,
```

- [ ] **Step 3d: Emit the payload key.** In `facets.ts`, replace the `if (rankedLabelSchemeCode) { … }` at lines 420–422 with:

```ts
  if (rankedLabelSchemeCode) {
    payload.label_scheme_ranked = rankedLabelSchemeCode;
    // §NN — exact-only : restreint aux labellisés (rank-0). Émis UNIQUEMENT quand le
    // toggle est OFF ; défaut/true/undefined n'émet rien (payload inchangé vs aujourd'hui).
    if (common.rankedLabelIncludeEquivalents === false) {
      payload.label_scheme_ranked_exact_only = true;
    }
  }
```

- [ ] **Step 4: Run to verify PASS.** `cd bertel-tourism-ui && npx jest src/utils/facets.test.ts`. Expected: PASS (whole file).

- [ ] **Step 5: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/utils/facets.test.ts && git commit -m "feat(explorer): rankedLabelIncludeEquivalents (défaut true) + payload label_scheme_ranked_exact_only quand OFF"
```

---

### Task 5: store setter `setRankedLabelIncludeEquivalents`

**Files:**
- Modify: `bertel-tourism-ui/src/store/explorer-store.ts` (type ~line 50; impl ~after line 308)

**Interfaces:**
- Consumes: `ExplorerCommonFilters.rankedLabelIncludeEquivalents` (Task 4).
- Produces: `useExplorerStore().setRankedLabelIncludeEquivalents(value: boolean)`.

- [ ] **Step 1: Add the action type.** In the `ExplorerState` interface, after line 50 (`setRankedLabelScheme: (schemeCode: string | null) => void;`):

```ts
  setRankedLabelIncludeEquivalents: (value: boolean) => void;
```

- [ ] **Step 2: Add the implementation.** After the `setRankedLabelScheme` impl (after line 308):

```ts
  setRankedLabelIncludeEquivalents: (value) =>
    set((state) => ({ common: { ...state.common, rankedLabelIncludeEquivalents: value } })),
```

- [ ] **Step 3: Typecheck.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`. Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/store/explorer-store.ts && git commit -m "feat(explorer): store setter setRankedLabelIncludeEquivalents"
```

---

### Task 6: URL round-trip `rankedLabelExact`

**Files:**
- Modify: `bertel-tourism-ui/src/lib/explorer-search-params.ts` (read ~line 123; write ~lines 211–213)
- Create/append: `bertel-tourism-ui/src/lib/explorer-search-params.test.ts`

**Interfaces:**
- Produces: URL param `rankedLabelExact=true` present iff a scheme is selected AND `rankedLabelIncludeEquivalents === false`; absence ⇒ include (default true).

- [ ] **Step 1: Write failing round-trip test.** Create (or append to) `bertel-tourism-ui/src/lib/explorer-search-params.test.ts`:

```ts
import { buildSearchParams, parseExplorerSearchParams } from './explorer-search-params';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';

describe('explorer-search-params — rankedLabelExact', () => {
  it('writes rankedLabelExact=true only when a scheme is set and equivalents excluded', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        rankedLabelSchemeCode: 'LBL_CLEF_VERTE',
        rankedLabelIncludeEquivalents: false,
      },
    };
    const p = buildSearchParams(filters);
    expect(p.get('rankedLabelExact')).toBe('true');
  });

  it('omits rankedLabelExact by default (equivalents included)', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'LBL_CLEF_VERTE' },
    };
    expect(buildSearchParams(filters).get('rankedLabelExact')).toBeNull();
  });

  it('parses rankedLabelExact=true into rankedLabelIncludeEquivalents=false', () => {
    const parsed = parseExplorerSearchParams(new URLSearchParams('rankedLabel=LBL_CLEF_VERTE&rankedLabelExact=true'));
    expect(parsed.common.rankedLabelIncludeEquivalents).toBe(false);
  });

  it('defaults rankedLabelIncludeEquivalents to true when the param is absent', () => {
    const parsed = parseExplorerSearchParams(new URLSearchParams('rankedLabel=LBL_CLEF_VERTE'));
    expect(parsed.common.rankedLabelIncludeEquivalents).toBe(true);
  });
});
```

> Note: confirm the exported parser name (`parseExplorerSearchParams`) at the top of `explorer-search-params.ts`; if it differs, use the real export. `buildSearchParams` is confirmed (imported by `ExplorerActiveFilters.tsx:13`).

- [ ] **Step 2: Run to verify FAIL.** `cd bertel-tourism-ui && npx jest src/lib/explorer-search-params.test.ts`. Expected: FAIL.

- [ ] **Step 3a: Add the READ.** Inside the `commonPatch` object, adjacent to line 123 (`...(rankedLabelSchemeCode !== undefined && { rankedLabelSchemeCode }),`):

```ts
    ...(searchParams.get('rankedLabelExact') != null && {
      rankedLabelIncludeEquivalents: searchParams.get('rankedLabelExact') !== 'true',
    }),
```

- [ ] **Step 3b: Add the WRITE.** Adjacent to lines 211–213 (the `rankedLabel` write), gated on the scheme being present:

```ts
  if (normalizedFilters.common.rankedLabelSchemeCode && !normalizedFilters.common.rankedLabelIncludeEquivalents) {
    p.set('rankedLabelExact', 'true');
  }
```

- [ ] **Step 4: Run to verify PASS.** `cd bertel-tourism-ui && npx jest src/lib/explorer-search-params.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/lib/explorer-search-params.ts bertel-tourism-ui/src/lib/explorer-search-params.test.ts && git commit -m "feat(explorer): URL rankedLabelExact ↔ rankedLabelIncludeEquivalents (absent = inclus)"
```

---

### Task 7: active chip "Label obtenu uniquement" + removal

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts` (group union ~lines 11–41; chip push ~after line 114)
- Modify: `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx` (setter wiring ~line 40; removal case ~after line 108)

**Interfaces:**
- Consumes: `common.rankedLabelIncludeEquivalents`, `setRankedLabelIncludeEquivalents`.
- Produces: an `ActiveChip` with `group: 'rankedLabelExact'` when exact-only is active; removal resets it to `true`.

- [ ] **Step 1: Add the group + chip.** In `explorer-active-chips.ts`, add to the `ActiveChipGroup` union (adjacent to `| 'rankedLabel'`):

```ts
  | 'rankedLabelExact'
```

Then after the existing ranked-label chip block (after line 114):

```ts
  if (rankedScheme && !c.rankedLabelIncludeEquivalents) {
    chips.push({ key: 'rankedLabelExact', group: 'rankedLabelExact', value: rankedScheme, label: 'Label obtenu uniquement' });
  }
```

- [ ] **Step 2: Wire the setter + removal case.** In `ExplorerActiveFilters.tsx`, after line 40 (`const setRankedLabelScheme = …`):

```tsx
  const setRankedLabelIncludeEquivalents = useExplorerStore((s) => s.setRankedLabelIncludeEquivalents);
```

Then in the `remove` switch, after the `case 'rankedLabel':` block (after line 108):

```tsx
      case 'rankedLabelExact':
        setRankedLabelIncludeEquivalents(true);
        break;
```

- [ ] **Step 3: Typecheck + existing chip tests.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`. Expected: no errors. If `explorer-active-chips.test.ts` exists, `npx jest explorer-active-chips` and keep green.

- [ ] **Step 4: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx && git commit -m "feat(explorer): chip « Label obtenu uniquement » + retrait (reset includeEquivalents)"
```

---

## PHASE 3 — Counts plumbing

### Task 8: thread `label_rank_counts` → `labelRankCounts` prop

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts` (`RpcPageMeta` ~after line 342)
- Modify: `bertel-tourism-ui/src/services/rpc.ts` (`ExplorerCardsPage` lines 354–357; `fetchExplorerCardsPage` return ~line 395)
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` (`useExplorerCardsQuery` return ~lines 168–181)
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx` (read ~line 61; mounts 105, 197, 209)
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsList.tsx` (props 10–20), `bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx` (props 16–25)

**Interfaces:**
- Produces: a `labelRankCounts?: { labelled: number; equivalent: number }` prop on both result views, sourced corpus-wide from page 0.

- [ ] **Step 1: Add the meta field.** In `domain.ts` `RpcPageMeta`, after line 342 (`next_cursor?: string | null;`):

```ts
  /** §NN — comptes corpus par rang quand le filtre label est actif (sinon null). */
  label_rank_counts?: { labelled: number; equivalent: number } | null;
```

- [ ] **Step 2: Widen the page type + aggregate.** In `rpc.ts`, extend `ExplorerCardsPage` (lines 354–357):

```ts
export interface ExplorerCardsPage {
  cards: ObjectCard[];
  cursors: ExplorerBucketCursorMap;
  /** §NN — somme des comptes label par rang sur les buckets de CETTE page (corpus par bucket). */
  labelRankCounts: { labelled: number; equivalent: number };
}
```

Then in `fetchExplorerCardsPage`, replace the final `return { cards: …, cursors };` (line 395) with:

```ts
  const labelRankCounts = results.reduce(
    (acc, { page }) => ({
      labelled: acc.labelled + (page.meta.label_rank_counts?.labelled ?? 0),
      equivalent: acc.equivalent + (page.meta.label_rank_counts?.equivalent ?? 0),
    }),
    { labelled: 0, equivalent: 0 },
  );
  return { cards: results.flatMap((r) => r.page.data), cursors, labelRankCounts };
```

- [ ] **Step 3: Expose from the query hook — read page 0.** In `useExplorerQueries.ts` `useExplorerCardsQuery`, before the `return { ...query, data, isRefreshing };` (line ~181):

```ts
  const labelRankCounts = useMemo(
    () => query.data?.pages?.[0]?.labelRankCounts ?? { labelled: 0, equivalent: 0 },
    [query.data],
  );
```

and change the return to `return { ...query, data, isRefreshing, labelRankCounts };`.

> Rationale: page 0 queries all active buckets; later scroll pages drop exhausted buckets, so `.at(-1)` would undercount. Counts are corpus-wide (like `meta.total`), so page 0 is the stable source.

- [ ] **Step 4: Add the prop to both view interfaces.** In `ResultsList.tsx` `ResultsListProps` (after line 19 `onLoadMore?: () => void;`) and `ResultsTableView.tsx` `ResultsTableViewProps` (after `onLoadMore?`):

```ts
  labelRankCounts?: { labelled: number; equivalent: number };
```

- [ ] **Step 5: Pass the prop at all 3 mounts.** In `ExplorerPage.tsx`, read near line 61: `const labelRankCounts = cardsQuery.labelRankCounts;` and add `labelRankCounts={labelRankCounts}` to the two `<ResultsList>` mounts (lines 105, 197) and the `<ResultsTableView>` mount (line 209).

- [ ] **Step 6: Typecheck.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`. Expected: no errors. (`paginateMock` in rpc.ts omits `label_rank_counts` — legal because the field is optional; demo mode falls back to `{0,0}` and later to loaded-card counts in the helper.)

- [ ] **Step 7: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/services/rpc.ts bertel-tourism-ui/src/hooks/useExplorerQueries.ts bertel-tourism-ui/src/views/ExplorerPage.tsx bertel-tourism-ui/src/components/explorer/ResultsList.tsx bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx && git commit -m "feat(explorer): plomberie meta.label_rank_counts → prop labelRankCounts (page 0, corpus) sur les 2 vues"
```

---

## PHASE 4 — Sectioning UI

### Task 9: pure sectioning helper

**Files:**
- Create: `bertel-tourism-ui/src/utils/explorer-result-sections.ts` + `.test.ts`

**Interfaces:**
- Consumes: `ObjectCard.label_match` (`rank`, `source`).
- Produces:
  ```ts
  interface LabelRankCounts { labelled: number; equivalent: number }
  interface ResultSectionGroup { group: 'labelled' | 'equivalent'; label: string; count: number; cards: ObjectCard[] }
  type ResultSections = { grouped: false; cards: ObjectCard[] } | { grouped: true; groups: ResultSectionGroup[] }
  function buildResultSections(cards: ObjectCard[], counts?: LabelRankCounts | null): ResultSections
  ```

- [ ] **Step 1: Write the failing test.** Create `bertel-tourism-ui/src/utils/explorer-result-sections.test.ts`:

```ts
import type { ObjectCard } from '../types/domain';
import { buildResultSections } from './explorer-result-sections';

function card(id: string, rank?: 0 | 1, source?: string): ObjectCard {
  return {
    id, type: 'HOT', name: id,
    ...(rank == null ? {} : { label_match: { scheme_code: 'LBL_CLEF_VERTE', rank, source: source ?? 'certified_label', evidence_count: 1 } }),
  } as ObjectCard;
}

describe('buildResultSections', () => {
  it('returns flat when no card carries a label_match', () => {
    const r = buildResultSections([card('a'), card('b')]);
    expect(r).toEqual({ grouped: false, cards: [card('a'), card('b')] });
  });

  it('returns flat when only rank-0 cards are present', () => {
    expect(buildResultSections([card('a', 0), card('b', 0)]).grouped).toBe(false);
  });

  it('returns flat when only rank-1 cards are present', () => {
    expect(buildResultSections([card('a', 1, 'sustainability_action')]).grouped).toBe(false);
  });

  it('groups labelled first then equivalent when both present', () => {
    const r = buildResultSections([card('a', 1, 'sustainability_action'), card('b', 0), card('c', 1, 'sustainability_action')]);
    expect(r.grouped).toBe(true);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups.map((g) => g.group)).toEqual(['labelled', 'equivalent']);
    expect(r.groups[0].cards.map((c) => c.id)).toEqual(['b']);
    expect(r.groups[1].cards.map((c) => c.id)).toEqual(['a', 'c']);
    expect(r.groups[0].label).toBe('Établissements labellisés');
    expect(r.groups[1].label).toBe('Aussi pertinents — actions compatibles');
  });

  it('uses "équipements compatibles" when the equivalent source is accessibility', () => {
    const r = buildResultSections([card('a', 0), card('b', 1, 'accessibility_amenity')]);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups[1].label).toBe('Aussi pertinents — équipements compatibles');
  });

  it('uses corpus counts for headers, falling back to loaded length', () => {
    const cards = [card('a', 0), card('b', 1, 'sustainability_action')];
    expect(buildResultSections(cards, { labelled: 15, equivalent: 8 }).grouped && buildResultSections(cards, { labelled: 15, equivalent: 8 })).toMatchObject({
      groups: [{ count: 15 }, { count: 8 }],
    });
    const fallback = buildResultSections(cards, null);
    if (!fallback.grouped) throw new Error('expected grouped');
    expect(fallback.groups.map((g) => g.count)).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** `cd bertel-tourism-ui && npx jest src/utils/explorer-result-sections.test.ts`. Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** Create `bertel-tourism-ui/src/utils/explorer-result-sections.ts`:

```ts
import type { ObjectCard } from '../types/domain';

export interface LabelRankCounts {
  labelled: number;
  equivalent: number;
}

export interface ResultSectionGroup {
  group: 'labelled' | 'equivalent';
  label: string;
  count: number;
  cards: ObjectCard[];
}

export type ResultSections =
  | { grouped: false; cards: ObjectCard[] }
  | { grouped: true; groups: ResultSectionGroup[] };

const LABELLED_LABEL = 'Établissements labellisés';

/** For a single-scheme filter all rank-1 cards share the same evidence source. */
function equivalentLabel(equivalent: ObjectCard[]): string {
  const source = equivalent.find((c) => c.label_match?.rank === 1)?.label_match?.source;
  return source === 'accessibility_amenity'
    ? 'Aussi pertinents — équipements compatibles'
    : 'Aussi pertinents — actions compatibles';
}

/**
 * Partition Explorer result cards into the "labellisés" (rank-0) and "démarches
 * équivalentes" (rank-1) groups. Sections are emitted ONLY when the ranked-label filter
 * is active (cards carry `label_match`) AND both groups are non-empty. Header counts use
 * corpus-wide `counts` (meta.label_rank_counts) when provided, else the loaded lengths.
 */
export function buildResultSections(cards: ObjectCard[], counts?: LabelRankCounts | null): ResultSections {
  const labelled = cards.filter((c) => c.label_match?.rank === 0);
  const equivalent = cards.filter((c) => c.label_match?.rank === 1);
  if (labelled.length === 0 || equivalent.length === 0) {
    return { grouped: false, cards };
  }
  return {
    grouped: true,
    groups: [
      { group: 'labelled', label: LABELLED_LABEL, count: counts?.labelled ?? labelled.length, cards: labelled },
      { group: 'equivalent', label: equivalentLabel(equivalent), count: counts?.equivalent ?? equivalent.length, cards: equivalent },
    ],
  };
}
```

- [ ] **Step 4: Run to verify PASS.** `cd bertel-tourism-ui && npx jest src/utils/explorer-result-sections.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/utils/explorer-result-sections.ts bertel-tourism-ui/src/utils/explorer-result-sections.test.ts && git commit -m "feat(explorer): helper pur buildResultSections (partition rank-0/rank-1, en-têtes + comptes)"
```

---

### Task 10: ResultsList sectioning render

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsList.tsx` (chips section ~lines 198–224; `orderedCards` ~80–91)
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsList.test.tsx`

**Interfaces:**
- Consumes: `buildResultSections` (Task 9), `labelRankCounts` prop (Task 8).
- Produces: grouped rendering with a header before each group; selection-float suspended while grouped.

- [ ] **Step 1: Write the failing test.** In `ResultsList.test.tsx`, add a case rendering two labelled + one equivalent card and asserting both section headers appear and the labelled header precedes the equivalent one. Example (adapt imports/`renderWithProviders` to the file's existing harness):

```tsx
it('renders labelled and equivalent section headers when the ranked-label filter surfaces both', () => {
  const cards = [
    makeCard({ id: 'lab', label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 0, source: 'certified_label', evidence_count: 1 } }),
    makeCard({ id: 'eq', label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 1, source: 'sustainability_action', evidence_count: 1 } }),
  ];
  renderResultsList({ cards, labelRankCounts: { labelled: 1, equivalent: 1 } });
  const labelled = screen.getByText(/Établissements labellisés/);
  const equivalent = screen.getByText(/Aussi pertinents — actions compatibles/);
  expect(labelled).toBeInTheDocument();
  expect(equivalent).toBeInTheDocument();
  expect(labelled.compareDocumentPosition(equivalent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify FAIL.** `cd bertel-tourism-ui && npx jest src/components/explorer/ResultsList.test.tsx`. Expected: FAIL (no headers yet).

- [ ] **Step 3: Implement.** In `ResultsList.tsx`: import the helper and a card-renderer, then replace the scroll-container body (`{orderedCards.map(...)}` at lines 199–224) so it branches on sections. Add near the top of the component body (after `orderedCards`):

```tsx
import { buildResultSections } from '../../utils/explorer-result-sections';
// ...
const sections = buildResultSections(visibleCards, labelRankCounts);
```

Add `labelRankCounts` to the destructured props (default `undefined`). Extract the per-card JSX into a local `renderCard(card: ObjectCard)` returning the existing `<ResultCardView … />` (unchanged props). Then render:

```tsx
{sections.grouped
  ? sections.groups.map((grp) => (
      <div key={grp.group} className="flex flex-col gap-2">
        <div className="sticky top-0 z-[1] -mx-3 flex items-center justify-between gap-2 border-b border-line bg-surface2/95 px-3 py-1.5 backdrop-blur">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{grp.label}</span>
          <span className="rounded-[6px] bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-4">{grp.count}</span>
        </div>
        {grp.cards.map(renderCard)}
      </div>
    ))
  : orderedCards.map(renderCard)}
```

(When grouped, iterate `sections.groups` — this uses the sorted `visibleCards` and thereby suspends the selection-float `orderedCards`; when not grouped, keep `orderedCards` so the float is preserved. The `hasMore` sentinel block stays as-is after this.)

- [ ] **Step 4: Run to verify PASS.** `cd bertel-tourism-ui && npx jest src/components/explorer/ResultsList.test.tsx`. Expected: PASS (new + existing cases).

- [ ] **Step 5: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/ResultsList.tsx bertel-tourism-ui/src/components/explorer/ResultsList.test.tsx && git commit -m "feat(explorer): vue liste — sections labellisés / actions compatibles (float sélection suspendu si groupé)"
```

---

### Task 11: ResultsTableView group rows + CSS

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx` (tbody map ~lines 267–308)
- Modify: `bertel-tourism-ui/src/styles.css` (after the `.results-table` block, ~line 681)

**Interfaces:**
- Consumes: `buildResultSections` (Task 9), `sortCards` (table-columns), `labelRankCounts` prop.
- Produces: a group header `<tr>` before each rank group; column sort applies within each group.

- [ ] **Step 1: Add the CSS.** In `styles.css`, after the `.results-table__tool` rule (line ~681):

```css
.results-table tbody tr.results-table__group-row { cursor: default; }
.results-table tbody tr.results-table__group-row:hover { background: transparent; }
.results-table__group-cell {
  position: sticky; top: 33px; z-index: 1;
  background: var(--bg-tint);
  border-bottom: 1px solid var(--line);
  padding: 5px 10px !important;
  font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted); white-space: nowrap;
}
```

- [ ] **Step 2: Implement group rendering.** In `ResultsTableView.tsx`, add `labelRankCounts` to props, import `buildResultSections`, and replace the `sortedCards` usage in `<tbody>`. Compute `const sections = buildResultSections(cards, labelRankCounts);` and `const colSpan = 1 + columns.length;`. Extract the existing per-card `<tr>…</tr>` into `renderRow(card)`. Then:

```tsx
<tbody>
  {sections.grouped
    ? sections.groups.flatMap((grp) => [
        <tr key={`grp-${grp.group}`} className="results-table__group-row">
          <td className="results-table__group-cell" colSpan={colSpan}>
            {grp.label} <span className="results-table__dim">· {grp.count}</span>
          </td>
        </tr>,
        ...sortCards(grp.cards, tableSort).map(renderRow),
      ])
    : sortCards(cards, tableSort).map(renderRow)}
</tbody>
```

(Keep `sortedCards` for the CSV export — export stays flat. The `allLoadedSelected` header checkbox is unchanged: with the toggle OFF, `cards` is only labelled objects, so "select loaded" grabs exactly the genuine label-holders — the admin workflow.)

- [ ] **Step 3: Verify.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit` (no errors) and run any `ResultsTableView` test if present. Then Phase 5 covers the visual check.

- [ ] **Step 4: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx bertel-tourism-ui/src/styles.css && git commit -m "feat(explorer): vue tableau — lignes de groupe labellisés / actions compatibles (tri colonne intra-groupe)"
```

---

### Task 12: FiltersPanel toggle

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx` (after the ranked-label select, ~line 616)

**Interfaces:**
- Consumes: `common.rankedLabelIncludeEquivalents`, `setRankedLabelIncludeEquivalents`.
- Produces: a checkbox rendered only when a ranked label is selected.

- [ ] **Step 1: Wire the setter + value.** Near where `rankedLabelSchemeCode` is derived (line 134) and where setters are read, add:

```tsx
  const setRankedLabelIncludeEquivalents = useExplorerStore((s) => s.setRankedLabelIncludeEquivalents);
```

(and ensure `common.rankedLabelIncludeEquivalents` is accessible — `common` is already in scope).

- [ ] **Step 2: Render the toggle.** Immediately after the ranked-label select `<div>` (closes at line 616), inside the same `<div className="space-y-3">`:

```tsx
{rankedLabelSchemeCode ? (
  <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
    <input
      type="checkbox"
      className="mt-0.5 accent-teal"
      checked={common.rankedLabelIncludeEquivalents}
      onChange={(event) => setRankedLabelIncludeEquivalents(event.target.checked)}
    />
    <span>
      <span className="font-medium">Inclure les démarches équivalentes</span>
      <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">
        Affiche aussi les fiches sans le label mais avec des actions/équipements compatibles (2ᵉ section).
      </span>
    </span>
  </label>
) : null}
```

- [ ] **Step 3: Verify.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`. Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx && git commit -m "feat(explorer): toggle « Inclure les démarches équivalentes » sous le filtre label"
```

---

## PHASE 5 — Integration verification + docs

### Task 13: end-to-end verify + decision log + memory

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (new `§NN`)
- Modify: `CLAUDE.md` (Explorer visibility / deferred tracker note, if warranted)
- Modify: auto-memory (`MEMORY.md` + a topic file)

- [ ] **Step 1: Full suites + typecheck.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit && npx jest`. Expected: tsc clean, all suites green.

- [ ] **Step 2: Preview verification.** Start the dev server (preview_start), open the Explorer, select a sustainability label (e.g. Clef Verte). Verify via preview_snapshot/preview_screenshot:
  - List view shows "Établissements labellisés (N)" then "Aussi pertinents — actions compatibles (M)"; labelled group first; counts match `meta`.
  - Toggle "Inclure les démarches équivalentes" OFF → equivalent section disappears; only labelled remain; "Label obtenu uniquement" chip appears in the active-filter strip; removing the chip restores both sections.
  - Switch to Table view → group separator rows appear; clicking a column header sorts within groups.
  - Select T&H label → equivalent header reads "équipements compatibles".
  - Type a search term while the label filter is active → labelled cards still lead.

- [ ] **Step 3: Decision log.** Run `grep -oE '^## §[0-9]+' "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" | tail -1`, take the next integer as `§NN`, and append a section documenting: the two SQL edits (exact_only + sort/counts), the since_fast exclusion (keyset), the counts-from-page-0 rule, the sectioning helper trigger (both-groups), the toggle + admin bulk-select workflow, and the deferred item "select-all-across-pages" (§9 of the spec). Replace every literal `§NN` in the code comments/migration/runbook with the real number.

- [ ] **Step 4: Memory.** Update `C:\Users\dphil\.claude\projects\C--Users-dphil-Bertel3-0\memory\MEMORY.md` with a one-line work-log pointer and add a topic file capturing the invariants (since_fast keyset exclusion, counts-from-page-0, payload-emit-only-when-false, sections-only-when-both-groups).

- [ ] **Step 5: Final commit.**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" CLAUDE.md && git commit -m "docs(§NN): résultats sectionnés du filtre Label — décision + invariants (since_fast keyset, comptes page-0, exact_only)"
```

---

## Self-Review

**Spec coverage:** §3.1 List sections → Tasks 9–10. §3.2 Table sections → Task 11. §3.4 toggle → Tasks 4–7, 12. §4 state/URL/chips → Tasks 4–7. §5.1 exact_only → Task 1. §5.2 sort+counts → Task 2 (since_fast correctly excluded per grounding). §6 helper + views → Tasks 8–12. §7 tests → Tasks 1,2,4,6,9,10,13. §8 deploy → Task 3. §9 out-of-scope (select-all-across-pages) → documented in Task 13.

**Corrections vs spec (from grounding):** (a) since_fast is NOT modified (keyset pagination) — spec said "parity"; dropped with rationale. (b) counts thread through the TanStack query page, not the store, and are read from page 0 (all buckets present) — the spec left the plumbing abstract. (c) defaults live in `facets.ts` `DEFAULT_COMMON_FILTERS` + normalize, not the store.

**Placeholder scan:** `§NN` is intentionally deferred to a grep in Task 13 (decision-log numbers are unknowable until checked) and back-filled everywhere; no other TBDs. The migration "paste the full body" instruction points at the exact, just-edited function the executor holds — not a placeholder.

**Type consistency:** `rankedLabelIncludeEquivalents` (boolean), `setRankedLabelIncludeEquivalents(value: boolean)`, `label_scheme_ranked_exact_only` (payload), `label_rank_counts`/`labelRankCounts` ({labelled, equivalent}), `buildResultSections(cards, counts?)`, group `'rankedLabelExact'` — names are consistent across Tasks 1–13.

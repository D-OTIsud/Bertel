# Markdown descriptions — Delivery 1 (famille `object_description`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `object_description` family (Descriptif, Accroche, mobile, éditorial, adaptée) Markdown-editable, with the API serving each field plain (existing key, Markdown stripped) **and** structured (`*_md`), reusing the existing `MarkdownEditor`/`MarkdownContent`.

**Architecture:** Markdown becomes the canonical value in the existing `object_description` text columns (no schema change, no data migration). A new `api.strip_markdown(text)` derives the plain text on read; the rich read RPCs add `*_md` sibling keys (raw `i18n_pick` value); the flat readers (cards/map/InDesign) wrap their excerpt in `strip_markdown`. The editor swaps the §04 textareas to `MarkdownEditorLazy`; the drawer renders `*_md` via `MarkdownContent`. The editor-facing raw legs (`canonical_description`/`org_description`) are **never** stripped.

**Tech Stack:** PostgreSQL/PL-pgSQL (Supabase), PostgREST RPCs; Next 16 / React 19, TipTap + `tiptap-markdown` (editor), `markdown-to-jsx` (render), Jest.

## Global Constraints

- **Source spec:** `docs/superpowers/specs/2026-06-21-markdown-all-description-fields-design.md`. This plan implements **Delivery 1 only** (spec §12 phases 1–4: the `object_description` family). Type-specific prose (rooms/menus/places/iti/direction) + GPX/KML/InDesign-for-itineraries + `get_object_room_types` are **Delivery 2** (separate plan).
- **In-scope columns (Delivery 1):** `object_description.{description, description_chapo, description_mobile, description_edition, description_adapted}` (+ their `*_i18n`). `description_offre_hors_zone` and `sanitary_measures` are **out of scope** — never stripped, no `*_md`.
- **`strip_markdown` lives in schema `api`** (not `internal` as the spec text says) — for grant/search_path parity with `api.i18n_pick`, which it sits beside in every expression. Always call it fully-qualified `api.strip_markdown(...)`.
- **Never strip the editor legs** `canonical_description` / `org_description` (`to_jsonb(d)` raw rows at `api_views_functions.sql:2933-2952`). The editor needs raw Markdown to round-trip. Strip applies ONLY to public read keys.
- **`get_object_cards_batch` has two definition sites** that must stay byte-identical except the documented DEFINER deltas: `api_views_functions.sql` (step 5 baseline) AND `migration_cards_batch_authorize_definer.sql` (live/fresh form, manifest 8j). Edit BOTH.
- **Strip rules are line-anchored** (`^…` with Postgres `gn` flags), require the trailing space, match only the markers the editor emits (`*`/`**`), and run images→links→emphasis→headings→quote→lists→escapes→blank-lines. Idempotent; STRICT (NULL→NULL).
- **No data migration**; backward-compat on existing rows is verified by a **diff gate** (Task 2), not assumed. No `*_plain`/`*_md` columns added.
- **Commit discipline (project):** commit directly to `master`, only your own hunks (the PO edits shared files like `object-editor.css` in parallel via Cursor — never `git add -A`, never amend, no co-author trailer). The PO pushes.
- **Deploy integrity:** every SQL change is folded into `Base de donnée DLL et API/schema_unified.sql` and/or `api_views_functions.sql`, added to `docs/SQL_ROLLOUT_RUNBOOK.md` (next manifest id **14w**), and covered by the CI fresh-apply gate. After applying functions to live: `NOTIFY pgrst, 'reload schema';`.
- **SQL verification in this repo:** there is no local `psql`. Apply/verify via the Supabase MCP (`execute_sql` / `apply_migration`) against live, or the Node `pg` harness (`.tmp_pgapply/`, pooler creds in `.env.schemaspy`). SQL test files use `DO $$ … RAISE EXCEPTION …$$` assertions runnable via `execute_sql`.
- **Frontend verification:** `cd bertel-tourism-ui && npx jest <file>` (targeted), `npx tsc --noEmit`, `npm run build` (build excludes `*.test.*`).

---

## File Structure

**SQL**
- Create: `Base de donnée DLL et API/migration_markdown_strip_descriptions.sql` — `api.strip_markdown` + the RPC re-creations (cards, map, indesign, get_object_resource, get_object_resource_adapted).
- Modify: `Base de donnée DLL et API/api_views_functions.sql` — **define `api.strip_markdown` near the top (after `api.i18n_pick_strict`, ~line 430, before any consumer)** + fold the changed RPC bodies.
- Modify: `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql` — mirror the cards_batch strip.
- Not modified: `schema_unified.sql` — `api.*` helpers do not live there (e.g. `api.i18n_pick` is in `api_views_functions.sql:336`); folding the function there would NOT satisfy fresh-apply ordering.
- Create: `bertel-tourism-ui/tests/test_strip_markdown.sql`, `bertel-tourism-ui/tests/test_markdown_descriptions_api.sql`.
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` — manifest 14w.

**Frontend**
- Modify: `bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx` — add `variant?: 'block'|'inline'`.
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx` — swap textareas to `MarkdownEditorLazy`.
- Modify: `bertel-tourism-ui/src/services/object-detail-parser.ts` — add `*Md` fields to `ParsedTextSection`.
- Modify: `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` — render `*Md` via `MarkdownContent`.
- Tests: `MarkdownEditor.test.tsx`, `SectionDescriptions.test.tsx` (new or existing), `object-detail-parser.test.ts`.

---

## PHASE 1 — SQL socle

### Task 1: `api.strip_markdown(text)` + unit tests

**Files:**
- Create: `Base de donnée DLL et API/migration_markdown_strip_descriptions.sql`
- Test: `bertel-tourism-ui/tests/test_strip_markdown.sql`

**Interfaces:**
- Produces: `api.strip_markdown(md text) RETURNS text` — `IMMUTABLE STRICT`. Removes the editor's Markdown subset, returns clean plain text; NULL→NULL; idempotent.

- [ ] **Step 1: Write the failing test** — `bertel-tourism-ui/tests/test_strip_markdown.sql`

```sql
-- test_strip_markdown.sql — api.strip_markdown unit tests (run via Supabase execute_sql)
DO $$
DECLARE
  r text;
BEGIN
  -- headings (space required)
  ASSERT api.strip_markdown('## Titre') = 'Titre', 'heading';
  ASSERT api.strip_markdown('#1 du quartier') = '#1 du quartier', 'hash-no-space survives';
  -- emphasis (emitted markers only)
  ASSERT api.strip_markdown('**gras**') = 'gras', 'bold';
  ASSERT api.strip_markdown('*ital*') = 'ital', 'italic';
  ASSERT api.strip_markdown('***both***') = 'both', 'triple';
  ASSERT api.strip_markdown('fichier_2024_final') = 'fichier_2024_final', 'underscores survive';
  -- lists (line-anchored, space required)
  ASSERT api.strip_markdown(E'- a\n- b') = E'a\nb', 'bullets';
  ASSERT api.strip_markdown(E'1. a\n10. b') = E'a\nb', 'ordered multi-digit';
  ASSERT api.strip_markdown('Lun - Ven') = 'Lun - Ven', 'mid-line dash survives';
  ASSERT api.strip_markdown('Phase 2. Lancement') = 'Phase 2. Lancement', 'mid-line ordered survives';
  -- quote (nested to fixpoint)
  ASSERT api.strip_markdown('> > cite') = 'cite', 'nested quote';
  -- links / images
  ASSERT api.strip_markdown('[OTI](https://oti.re)') = 'OTI', 'link';
  ASSERT api.strip_markdown('![alt](https://x/a.jpg)') = '', 'image removed';
  -- escapes
  ASSERT api.strip_markdown('\*literal\*') = '*literal*', 'escapes';
  -- NULL + idempotency
  ASSERT api.strip_markdown(NULL) IS NULL, 'strict null';
  r := api.strip_markdown(E'## T\n- **x**\n> q');
  ASSERT api.strip_markdown(r) = r, 'idempotent';
  RAISE NOTICE 'test_strip_markdown OK';
END $$;
```

- [ ] **Step 2: Run test to verify it fails**

Run (Supabase MCP `execute_sql`): paste the file contents.
Expected: FAIL — `function api.strip_markdown(unknown) does not exist`.

- [ ] **Step 3: Write the implementation** — append to `migration_markdown_strip_descriptions.sql`

```sql
-- migration_markdown_strip_descriptions.sql (manifest 14w)
-- Markdown descriptions, Delivery 1: api.strip_markdown derives the plain ("sans styles")
-- text from the Markdown-canonical description columns. See spec 2026-06-21.
BEGIN;

CREATE OR REPLACE FUNCTION api.strip_markdown(md text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
  WITH s0  AS (SELECT md AS t),
  -- order is load-bearing. Protect escaped asterisks (\*) with a sentinel BEFORE emphasis so a
  -- literal '\*' survives as '*' instead of being eaten by the italic/bold rules. (Other escapes
  -- like \#, \-, \> are naturally safe: the backslash sits before the line-start marker, so the
  -- anchored block rules don't fire; the generic unescape at s9 then drops the backslash.)
  sp  AS (SELECT replace(t, '\*', chr(1))                                  AS t FROM s0),  -- protect \*
  s1  AS (SELECT regexp_replace(t, '!\[[^\]]*\]\([^)]*\)', '', 'g')        AS t FROM sp),  -- images first
  s2  AS (SELECT regexp_replace(t, '\[([^\]]*)\]\([^)]*\)', '\1', 'g')     AS t FROM s1),  -- links -> label
  s3  AS (SELECT regexp_replace(t, '\*\*([^*]+)\*\*', '\1', 'g')           AS t FROM s2),  -- bold
  s4  AS (SELECT regexp_replace(t, '\*([^*\n]+)\*', '\1', 'g')             AS t FROM s3),  -- italic (paired)
  s5  AS (SELECT regexp_replace(t, '^[ \t]*#{1,6}[ \t]+', '', 'gn')        AS t FROM s4),  -- headings (space req)
  s6  AS (SELECT regexp_replace(t, '^[ \t]*(?:> ?)+', '', 'gn')            AS t FROM s5),  -- blockquote (nested)
  s7  AS (SELECT regexp_replace(t, '^[ \t]*[-*+][ \t]+', '', 'gn')         AS t FROM s6),  -- bullets (space req)
  s8  AS (SELECT regexp_replace(t, '^[ \t]*\d+\.[ \t]+', '', 'gn')         AS t FROM s7),  -- ordered (multi-digit)
  s9  AS (SELECT regexp_replace(t, '\\([\\`_{}\[\]()#+.!>-])', '\1', 'g')  AS t FROM s8),  -- escapes (\* via sentinel)
  sr  AS (SELECT replace(t, chr(1), '*')                                   AS t FROM s9),  -- restore literal *
  s10 AS (SELECT regexp_replace(t, '\n{3,}', E'\n\n', 'g')                 AS t FROM sr)   -- collapse blanks
  SELECT btrim(t) FROM s10;
$fn$;

REVOKE ALL ON FUNCTION api.strip_markdown(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.strip_markdown(text) TO anon, authenticated, service_role;

COMMIT;
-- After live apply: NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Apply + run test to verify it passes**

Apply the `migration_markdown_strip_descriptions.sql` body via MCP `execute_sql`, then re-run `test_strip_markdown.sql`.
Expected: `NOTICE: test_strip_markdown OK` (no ASSERT failure).

- [ ] **Step 5: Fold (fresh-apply ordering) + commit**

**Fresh-apply ordering is load-bearing:** the RPCs that call `api.strip_markdown` are `LANGUAGE sql`, whose body is parse-checked at `CREATE` — a missing function fails with `42883`. The `api.*` helpers live in `api_views_functions.sql` (e.g. `api.i18n_pick` is at `api_views_functions.sql:336`, **not** `schema_unified.sql`). So fold the `api.strip_markdown` definition into **`api_views_functions.sql` immediately after `api.i18n_pick_strict` (~line 430), before its first consumer (`get_object_card` at 2006)** — this makes a fresh build create it before the RPCs in the same file (manifest step 5). The standalone `migration_markdown_strip_descriptions.sql` is the **live/incremental** path only (live already has `api_views_functions.sql`; the migration adds the function + re-creates the changed RPCs). Do **not** fold into `schema_unified.sql` (api functions don't live there). Then:

```bash
git add "Base de donnée DLL et API/migration_markdown_strip_descriptions.sql" \
        "Base de donnée DLL et API/api_views_functions.sql" \
        bertel-tourism-ui/tests/test_strip_markdown.sql
git commit -m "feat(api): api.strip_markdown — plain-text derivation for Markdown descriptions (14w)"
```

---

### Task 2: Live data diff gate (no-op verification)

**Files:** none (verification gate). Produces a triage decision recorded in the runbook.

- [ ] **Step 1: Run the diff over live data** (MCP `execute_sql`)

```sql
-- Rows where stripping CHANGES the stored (currently plain) text = candidates for review.
SELECT d.object_id, d.id,
       left(d.description,120)        AS before_desc,
       left(api.strip_markdown(d.description),120) AS after_desc
FROM object_description d
WHERE d.description IS NOT NULL
  AND api.strip_markdown(d.description) IS DISTINCT FROM d.description
UNION ALL
SELECT d.object_id, d.id, left(d.description_chapo,120), left(api.strip_markdown(d.description_chapo),120)
FROM object_description d
WHERE d.description_chapo IS NOT NULL
  AND api.strip_markdown(d.description_chapo) IS DISTINCT FROM d.description_chapo;
```

- [ ] **Step 2: Triage**

Expected: the result set is the exhaustive list of rows whose flat read changes after Delivery 1. Eyeball each: a change like `« - point »` → `« point »` (a pseudo-list flattened) is acceptable; a change that destroys meaning (e.g. an `*` that was multiplication) must be noted. If any unacceptable change exists, record it and fix the source row (edit the data) — do NOT weaken the strip rules without re-running Task 1 tests. Record the count + verdict in `docs/SQL_ROLLOUT_RUNBOOK.md` under the 14w entry.

- [ ] **Step 3: Commit the runbook note** (folded later in Task 11; no code commit here).

---

## PHASE 2 — flat readers of the `object_description` family

### Task 3: Strip card excerpts (`get_object_card` + `get_object_cards_batch`)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql:2040-2044` (get_object_card) and `:2346-2350` (get_object_cards_batch)
- Modify: `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:375-379` (live cards_batch)
- Test: `bertel-tourism-ui/tests/test_markdown_descriptions_api.sql` (create)

**Interfaces:**
- Consumes: `api.strip_markdown(text)` (Task 1).

- [ ] **Step 1: Write the failing test** — create `test_markdown_descriptions_api.sql`

```sql
-- test_markdown_descriptions_api.sql — cards/map/resource never leak Markdown
DO $$
DECLARE
  v_id text;
  v_card jsonb;
BEGIN
  -- pick any published object and temporarily give it a Markdown chapo (rolled back)
  SELECT o.id INTO v_id FROM object o WHERE o.status='published' LIMIT 1;
  UPDATE object_description SET description_chapo = '## Titre **gras**'
    WHERE object_id = v_id AND org_object_id IS NULL;
  v_card := api.get_object_card(v_id, ARRAY['fr']);
  ASSERT (v_card->>'description') NOT LIKE '%**%', 'card: no bold marker';
  ASSERT (v_card->>'description') NOT LIKE '##%', 'card: no heading marker';
  RAISE NOTICE 'card strip OK';
  RAISE EXCEPTION 'rollback'; -- never persist the test mutation
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'rollback' THEN RAISE; END IF;
END $$;
```

- [ ] **Step 2: Run to verify it fails**

Run via `execute_sql`. Expected: ASSERT failure `card: no bold marker` (current code returns raw `## Titre **gras**`).

- [ ] **Step 3: Edit `get_object_card`** (`api_views_functions.sql:2040-2044`)

Replace:
```sql
    'description',  LEFT(COALESCE(
      api.i18n_pick(d.description_chapo_i18n, api.pick_lang(p_lang_prefs), 'fr'),
      d.description_chapo,
      LEFT(d.description, 200)
    ), 200),
```
with:
```sql
    'description',  LEFT(regexp_replace(api.strip_markdown(COALESCE(
      api.i18n_pick(d.description_chapo_i18n, api.pick_lang(p_lang_prefs), 'fr'),
      d.description_chapo,
      d.description
    )), '\s+', ' ', 'g'), 200),
```

- [ ] **Step 4: Edit `get_object_cards_batch` in BOTH files**

In `api_views_functions.sql:2346-2350` AND `migration_cards_batch_authorize_definer.sql:375-379`, replace:
```sql
        'description', LEFT(COALESCE(
          api.i18n_pick(b.description_chapo_i18n, lang.code, 'fr'),
          b.description_chapo,
          LEFT(b.description, 200)
        ), 200),
```
with:
```sql
        'description', LEFT(regexp_replace(api.strip_markdown(COALESCE(
          api.i18n_pick(b.description_chapo_i18n, lang.code, 'fr'),
          b.description_chapo,
          b.description
        )), '\s+', ' ', 'g'), 200),
```

- [ ] **Step 5: Apply both bodies to live + run test to verify it passes**

Apply the updated `get_object_card` and the `migration_cards_batch_authorize_definer.sql` `get_object_cards_batch` body via `execute_sql` (the migration's DEFINER form is the live one). Re-run the card test.
Expected: `NOTICE: card strip OK` then the deliberate `rollback`.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" \
        "Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql" \
        bertel-tourism-ui/tests/test_markdown_descriptions_api.sql
git commit -m "feat(api): strip Markdown in card excerpts (get_object_card + cards_batch)"
```

---

### Task 4: Strip `get_object_map_item` (→ `list_objects_map_view`) + `export_publication_indesign`

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql:6882-6886` (map_item), `:4878` (indesign print_text)
- Test: extend `test_markdown_descriptions_api.sql`

**Interfaces:** Consumes `api.strip_markdown(text)`.

- [ ] **Step 1: Add the failing assertions** to `test_markdown_descriptions_api.sql` (inside the same DO block, before the rollback)

```sql
  ASSERT (api.get_object_map_item(v_id, ARRAY['fr'])->>'description') NOT LIKE '%**%', 'map: no bold';
```

- [ ] **Step 2: Run to verify it fails** (`map: no bold`).

- [ ] **Step 3: Edit `get_object_map_item`** (`:6882-6886`), same transform as the card:
```sql
    'description', LEFT(regexp_replace(api.strip_markdown(COALESCE(
      api.i18n_pick(d.description_chapo_i18n, api.pick_lang(p_lang_prefs), 'fr'),
      d.description_chapo,
      d.description
    )), '\s+', ' ', 'g'), 200),
```

- [ ] **Step 4: Edit `export_publication_indesign`** (`:4878`)

Replace:
```sql
      COALESCE(po.custom_print_text, od.description_edition, od.description) AS print_text,
```
with (keep operator-typed `custom_print_text` literal; strip only the description-sourced fallbacks):
```sql
      COALESCE(po.custom_print_text, api.strip_markdown(od.description_edition), api.strip_markdown(od.description)) AS print_text,
```

- [ ] **Step 5: Apply to live + run tests**

Apply both updated bodies. Re-run `test_markdown_descriptions_api.sql`.
Expected: all card+map asserts pass. (InDesign asserted by inspection — optional spot check: `SELECT … FROM api.export_publication_indesign(<pub_uuid>)` on a publication whose object has a Markdown `description_edition`.)

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" bertel-tourism-ui/tests/test_markdown_descriptions_api.sql
git commit -m "feat(api): strip Markdown in map items and InDesign print export"
```

---

## PHASE 3 — rich `object_description` read path (`*_md` keys)

### Task 5: `get_object_resource` — strip plain + add `*_md` (single block + descriptions[])

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql:2802-2849` (single) and `:2868-2909` (array)
- Test: extend `test_markdown_descriptions_api.sql`

**Interfaces:**
- Produces (resource payload top-level keys): `description` (plain), `description_md` (raw); same `_md` sibling for `description_chapo`, `description_mobile`, `description_edition`, `description_adapted`. Each `descriptions[]` item gains the same `*_md` siblings.
- Note: keys flow to the output via `resource_block_misc` (compose unions all blocks; `description_chapo` already does this today) — **no allow-list change required**. `get_object_with_deep_data` delegates to `get_objects_with_deep_data` (plural), which embeds `api.get_object_resource(...)` verbatim at `:6628`, so it inherits the `*_md` keys.

- [ ] **Step 1: Add failing assertions** to `test_markdown_descriptions_api.sql`

```sql
  DECLARE v_res jsonb;
  BEGIN
    UPDATE object_description SET description = '## Intro\n\nUn **beau** lieu.'
      WHERE object_id = v_id AND org_object_id IS NULL;
    v_res := api.get_object_resource(v_id, ARRAY['fr'], 'none', '{}'::jsonb);
    ASSERT (v_res->>'description') NOT LIKE '%**%', 'resource: plain description stripped';
    ASSERT (v_res->>'description_md') LIKE '%**beau**%', 'resource: description_md raw';
    -- deep_data inherits
    ASSERT ((api.get_object_with_deep_data(v_id, ARRAY['fr'], '{}'::jsonb)::jsonb->'object'->>'description_md')) LIKE '%**beau**%',
      'deep_data inherits _md';
  END;
```

- [ ] **Step 2: Run to verify it fails** (`resource: plain description stripped`).

- [ ] **Step 3: Edit the single description block** (`:2802-2849`)

For EACH of the 5 in-scope fields, wrap the existing `CASE … END` value in `api.strip_markdown(...)` for the plain key and add a `*_md` key with the same `CASE … END` unwrapped. Example for `description` (apply the identical pattern to `description_chapo`, `description_mobile`, `description_edition`, `description_adapted`):

```sql
        'description',
        api.strip_markdown(CASE
          WHEN api.i18n_pick(d.description_i18n, lang, 'fr') IS NOT NULL
          THEN api.i18n_pick(d.description_i18n, lang, 'fr')
          ELSE d.description
        END),
        'description_md',
        CASE
          WHEN api.i18n_pick(d.description_i18n, lang, 'fr') IS NOT NULL
          THEN api.i18n_pick(d.description_i18n, lang, 'fr')
          ELSE d.description
        END,
```
Leave `description_offre_hors_zone`, `sanitary_measures`, `visibility`, `position`, `created_at`, `updated_at` unchanged.

- [ ] **Step 4: Edit the descriptions[] array block** (`:2868-2909`)

Apply the exact same `strip_markdown(…)` + `*_md` pattern to the 5 in-scope fields inside the `jsonb_build_object(... )` of the array item.

- [ ] **Step 5: Apply to live + run test to verify it passes**

Apply the updated `get_object_resource` body. Re-run `test_markdown_descriptions_api.sql`.
Expected: resource + deep_data asserts pass; then the deliberate `rollback`.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" bertel-tourism-ui/tests/test_markdown_descriptions_api.sql
git commit -m "feat(api): get_object_resource serves description fields plain + *_md"
```

---

### Task 6: `get_object_resource_adapted` — strip plain + add `*_md`

**Files:** Modify `Base de donnée DLL et API/api_views_functions.sql:8645-8658`.

**Interfaces:** Produces `description`/`description_chapo` (plain) + `description_md`/`description_chapo_md` (raw). (RPC is dead-in-app but publicly documented; aligned for contract consistency.)

- [ ] **Step 1: Edit** (`:8645-8658`)

Replace the `'description'` and `'description_chapo'` builders:
```sql
    'description', api.strip_markdown(COALESCE(
      api.i18n_pick(d.description_adapted_i18n, lang, 'fr'), d.description_adapted,
      api.i18n_pick(d.description_i18n, lang, 'fr'), d.description)),
    'description_md', COALESCE(
      api.i18n_pick(d.description_adapted_i18n, lang, 'fr'), d.description_adapted,
      api.i18n_pick(d.description_i18n, lang, 'fr'), d.description),
    'description_chapo', api.strip_markdown(COALESCE(
      api.i18n_pick(d.description_adapted_i18n, lang, 'fr'), d.description_adapted,
      api.i18n_pick(d.description_chapo_i18n, lang, 'fr'), d.description_chapo)),
    'description_chapo_md', COALESCE(
      api.i18n_pick(d.description_adapted_i18n, lang, 'fr'), d.description_adapted,
      api.i18n_pick(d.description_chapo_i18n, lang, 'fr'), d.description_chapo),
```

- [ ] **Step 2: Apply to live + spot-check**

Apply the body. Run: `SELECT api.get_object_resource_adapted(<id with markdown>, ARRAY['fr']);` — confirm `description` is plain, `description_md` raw.

- [ ] **Step 3: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql"
git commit -m "feat(api): get_object_resource_adapted serves plain + *_md"
```

---

## PHASE 4 — editor + drawer render (family)

### Task 7: `MarkdownEditor` `variant` prop (block | inline)

**Files:**
- Modify: `bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx`
- Test: `bertel-tourism-ui/src/components/markdown/MarkdownEditor.test.tsx`

**Interfaces:**
- Produces: `MarkdownEditor({ value, onChange, disabled, ariaLabel, variant }: MarkdownEditorProps)` where `variant?: 'block' | 'inline'` (default `'block'`). In `inline`: StarterKit disables `heading`/`bulletList`/`orderedList`/`blockquote`; the Toolbar renders only Gras/Italique/Lien. `MarkdownEditorLazy` forwards the prop unchanged (it spreads all props via `dynamic`).

- [ ] **Step 1: Write the failing test** — add to `MarkdownEditor.test.tsx`

```tsx
it('inline variant hides heading and list controls', async () => {
  render(<MarkdownEditor value="" onChange={() => {}} ariaLabel="x" variant="inline" />);
  // The editor mounts async (immediatelyRender:false) — await the toolbar before asserting absence.
  expect(await screen.findByLabelText('Gras')).toBeInTheDocument();
  expect(screen.queryByLabelText('Titre')).toBeNull();
  expect(screen.queryByLabelText('Liste à puces')).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/markdown/MarkdownEditor.test.tsx -t "inline variant"`
Expected: FAIL (Titre control still present / prop ignored).

- [ ] **Step 3: Implement the variant**

In `MarkdownEditor.tsx`:
1. Extend the prop type: add `variant?: 'block' | 'inline';` to `MarkdownEditorProps` and destructure it with default `'block'`.
2. In `useEditor` extensions, make StarterKit conditional:
```tsx
StarterKit.configure({
  heading: variant === 'inline' ? false : { levels: [2, 3] },
  bulletList: variant === 'inline' ? false : undefined,
  orderedList: variant === 'inline' ? false : undefined,
  blockquote: variant === 'inline' ? false : undefined,
  codeBlock: false, code: false, horizontalRule: false, strike: false,
}),
```
3. Pass `variant` into `<Toolbar editor={editor} variant={variant} />` and, in `Toolbar`, wrap the structural buttons (`Titre`, `Sous-titre`, `Liste à puces`, `Liste numérotée`, `Citation`) in `{variant !== 'inline' && (<>…</>)}`, keeping Gras/Italique/Lien/Annuler/Rétablir always rendered.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/components/markdown/MarkdownEditor.test.tsx`
Expected: PASS. Then `npx tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx \
        bertel-tourism-ui/src/components/markdown/MarkdownEditor.test.tsx
git commit -m "feat(editor): MarkdownEditor inline variant (toolbar without block controls)"
```

---

### Task 8: Swap §04 Descriptif (block) + Accroche (inline) to `MarkdownEditorLazy`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `MarkdownEditorLazy` (existing), `MarkdownEditor` `variant` (Task 7), `patchField('chapo'|'description', md)` (existing in this file).
- The editor LOADS raw Markdown unchanged: `activeScopeData` comes from `descriptions.object`/`.orgOverlay`, parsed from the un-stripped `canonical_description`/`org_description` legs. No parser change.

- [ ] **Step 1: UPDATE the existing test** — `SectionDescriptions.test.tsx` (it already exists; do NOT create)

This file already renders the section via its own local `modules()`/`scope()` helpers + a `useObjectEditorState` renderHook, and asserts on `getByTestId('chapo-textarea')` + `getByDisplayValue(...)` (≈ lines 51, 89, 98). The textarea→`MarkdownEditorLazy` swap removes the `data-testid` handle, so the swap and this update ship in the SAME commit:

1. Add a mock that keeps a queryable handle and round-trips `value`:
```tsx
jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ value, onChange, ariaLabel }: any) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
```
2. Rewrite the broken queries (≈ lines 51, 89, 98) from `getByTestId('chapo-textarea')` to `getByLabelText(/^Accroche/)` (and `/^Descriptif/` where the Descriptif is queried). `getByDisplayValue(...)` keeps working — the mock preserves `value`.
3. Add the new behavior assertion (mirror the file's existing render + `replaceModule` spy setup):
```tsx
it('writes markdown from the Descriptif editor into the description module', () => {
  // render with the file's existing fixture + a replaceModule spy
  fireEvent.change(screen.getByLabelText(/^Descriptif/), { target: { value: '## H' } });
  // expect the replaceModule spy last call to carry descriptions.object.description.baseValue === '## H'
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/sections/SectionDescriptions.test.tsx`
Expected: FAIL (Descriptif still a `<Textarea>`, no `MarkdownEditorLazy`).

- [ ] **Step 3: Implement the swap** in `SectionDescriptions.tsx`

1. Add import: `import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';` and remove `Textarea` from the `../primitives` import (it has no other use after this swap).
2. Replace the **Descriptif** `<Textarea …>` (≈ lines 115-122) with the block editor + a soft counter (the old `count max={2000}` was soft — keep parity):
```tsx
        <MarkdownEditorLazy
          value={readTranslatableField(activeScopeData.description, active, descriptions.localLanguage)}
          onChange={(md) => patchField('description', md)}
          disabled={readOnly}
          ariaLabel={`Descriptif — ${resolveLanguageLabel(active, characteristics.languageOptions)}`}
          variant="block"
        />
        {(() => {
          const len = readTranslatableField(activeScopeData.description, active, descriptions.localLanguage).length;
          return <div className={`char-count${len > 2000 ? ' over' : ''}`}>{len} / 2000 caractères</div>;
        })()}
```
3. Replace the **Accroche** `<Textarea …>` (≈ lines 104-112) with the inline editor + a soft counter (parity with the old soft `count max={160}` — never hard-blocked):
```tsx
        <MarkdownEditorLazy
          value={readTranslatableField(activeScopeData.chapo, active, descriptions.localLanguage)}
          onChange={(md) => patchField('chapo', md)}
          disabled={readOnly}
          ariaLabel={`Accroche — ${resolveLanguageLabel(active, characteristics.languageOptions)}`}
          variant="inline"
        />
        {(() => {
          const len = readTranslatableField(activeScopeData.chapo, active, descriptions.localLanguage).length;
          return <div className={`char-count${len > 160 ? ' over' : ''}`}>{len} / 160 caractères</div>;
        })()}
```
4. The `placeholder`/`fallback` ghost text is dropped (MarkdownEditor has no placeholder) — the inherited-default cue remains in the `Field` `hint` (lines 66-74), unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/features/object-editor/sections/SectionDescriptions.test.tsx` → PASS.
Then `npx tsc --noEmit` (clean) and `npm run build` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx \
        bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.test.tsx
git commit -m "feat(editor): §04 Descriptif (block) + Accroche (inline) use MarkdownEditor"
```

---

### Task 9: Drawer parser — add `*Md` fields to `ParsedTextSection`

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-detail-parser.ts` (type at `:102-108`, builder at `:698-729`)
- Test: `bertel-tourism-ui/src/services/object-detail-parser.test.ts`

**Interfaces:**
- Produces on `ParsedTextSection`: `descriptionMd: string; chapoMd: string; adaptedDescriptionMd: string; mobileDescriptionMd: string; editorialDescriptionMd: string;` — each `pickFirstText` over the matching `raw.*_md` key (and the description-record `_md` fallbacks), empty string when absent.

- [ ] **Step 1: Write the failing test** — add to `object-detail-parser.test.ts`

```ts
it('exposes *_md raw markdown fields from the resource payload', () => {
  const parsed = parseObjectDetail({ id: 'X', type: 'HLO',
    description: 'Plain.', description_md: '## H\n**b**',
    description_adapted: 'A', description_adapted_md: '*a*' } as any);
  expect(parsed.text.descriptionMd).toBe('## H\n**b**');
  expect(parsed.text.adaptedDescriptionMd).toBe('*a*');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/services/object-detail-parser.test.ts -t "_md raw markdown"`
Expected: FAIL (`descriptionMd` undefined).

- [ ] **Step 3: Implement**

1. Add the 5 `*Md: string;` fields to the `ParsedTextSection` interface (`:102-108`) (and, if `DescriptionEntry`/the duplicated text shape at `:66-69` is the same object, leave that array shape unchanged — Delivery 1 only needs top-level md).
2. In the `text:` builder (`:698-729`), add after each plain field:
```ts
    descriptionMd: pickFirstText(raw.description_md, descriptionsRecord.description_md, objectDescriptionRecord.description_md),
    chapoMd: pickFirstText(raw.description_chapo_md, descriptionsRecord.description_chapo_md, objectDescriptionRecord.description_chapo_md),
    adaptedDescriptionMd: pickFirstText(raw.description_adapted_md, descriptionsRecord.description_adapted_md, objectDescriptionRecord.description_adapted_md),
    mobileDescriptionMd: pickFirstText(raw.description_mobile_md, descriptionsRecord.description_mobile_md, objectDescriptionRecord.description_mobile_md),
    editorialDescriptionMd: pickFirstText(raw.description_edition_md, descriptionsRecord.description_edition_md, objectDescriptionRecord.description_edition_md),
```
(Match the exact `pickFirstText` source order used by the sibling plain field. `objectDescriptionRecord` is the local already in scope at this builder — verify its name when editing.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/services/object-detail-parser.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/services/object-detail-parser.ts \
        bertel-tourism-ui/src/services/object-detail-parser.test.ts
git commit -m "feat(drawer): parse description *_md raw markdown fields"
```

---

### Task 10: Drawer render — generalize `renderCopy` to use `*Md`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` (`PreviewData` `:106-132`, `buildPreviewData` `:279-293`, `OverviewSection`/`renderCopy` `:1218-1241`)
- Test: existing `ObjectDetailView` render coverage (extend if present) + manual `MarkdownContent` assertion.

**Interfaces:**
- Consumes: `parsed.text.{descriptionMd, chapoMd, adaptedDescriptionMd, mobileDescriptionMd, editorialDescriptionMd}` (Task 9); `MarkdownContent` (existing).
- Produces: `PreviewData` gains `summaryMd`, `descriptionMd`, `adaptedDescriptionMd` (the md siblings of the three rendered fields). `renderCopy` renders Markdown when an `_md` value is present for the shown text, else `<p>`.

- [ ] **Step 1: Write/extend the failing test**

Assert that an object whose resource carries `description_md: '## Titre'` renders an `<h2>` (via `MarkdownContent`) in the overview, not the literal `## Titre`. (Mirror the existing `MarkdownContent.test.tsx` query style: `screen.getByRole('heading', { level: 2 })`.)

- [ ] **Step 2: Run to verify it fails** (literal `## Titre` shown as text).

- [ ] **Step 3: Implement**

1. Add `summaryMd: string; descriptionMd: string; adaptedDescriptionMd: string;` to `PreviewData` (`:106-132`).
2. In `buildPreviewData` (`:283-293`), source them parallel to their plain siblings:
```ts
    summaryMd:
      parsed.text.chapoMd || parsed.text.descriptionMd || parsed.text.adaptedDescriptionMd
      || parsed.text.mobileDescriptionMd || parsed.text.editorialDescriptionMd,
    descriptionMd: parsed.text.descriptionMd || parsed.text.chapoMd,
    adaptedDescriptionMd:
      parsed.text.adaptedDescriptionMd || parsed.text.mobileDescriptionMd || parsed.text.editorialDescriptionMd,
```
3. In `OverviewSection`, replace the adapted-only `renderCopy` (`:1218-1225`) with a version that takes the Markdown sibling **explicitly** (no fragile string-equality reverse-mapping — two byte-identical plain strings could otherwise collide):
```tsx
  // Render the Markdown sibling when present, else the plain text.
  const renderCopy = (text: string, md: string, className: string) =>
    md
      ? <MarkdownContent markdown={md} className={className} />
      : <p className={className}>{text}</p>;
```
Then update the three call sites (`:1231-1241`) to pass the matching md sibling:
```tsx
          {summary && renderCopy(
            summary, preview.summaryMd,
            `detail-overview__lead${!expanded && showToggle ? ' detail-overview__lead--clamped' : ''}`,
          )}
          {showExtendedText && (
            <>
              <span className="detail-overview__separator" aria-hidden="true" />
              {renderCopy(fullText, preview.descriptionMd, 'detail-overview__body')}
            </>
          )}
          {expanded && alternateText && renderCopy(alternateText, preview.adaptedDescriptionMd, 'detail-overview__support')}
```
(`summary`, `fullText`, `alternateText` are the locals at `:1181-1188`; keep them for the length/clamp logic at `:1189-1193`.)

- [ ] **Step 4: Run to verify it passes**

Run the drawer render test → PASS. Then `npx tsc --noEmit`, `npm run build` (exit 0), and the full editor/drawer suites: `npx jest src/features/object-drawer src/features/object-editor src/components/markdown src/services/object-detail-parser` → green.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx
git commit -m "feat(drawer): render description fields as Markdown via *_md"
```

---

## PHASE 5 (deploy integrity)

### Task 11: Fold + manifest + fresh-apply

**Files:**
- Modify: `Base de donnée DLL et API/schema_unified.sql` (confirm `api.strip_markdown` folded — Task 1) + the RPC bodies (cards/map/indesign/resource/adapted) reflect the live versions.
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (manifest 14w: list `migration_markdown_strip_descriptions.sql` in dependency order — after the base `api_views_functions.sql` step, with the `cards_batch` DEFINER caveat note).

- [ ] **Step 1: Fold the RPC edits**

Ensure every RPC body changed in Tasks 3–6 is identical between live, `api_views_functions.sql`, and (for cards_batch) `migration_cards_batch_authorize_definer.sql`. Confirm `api.strip_markdown` is defined in `api_views_functions.sql` **before its first consumer** (Task 1 Step 5) — NOT in `schema_unified.sql` — so the manifest step-5 fresh apply creates it before the RPCs.

- [ ] **Step 2: Add the manifest/runbook entry (14w)** documenting: the function, the RPC re-creations, the Task 2 diff verdict, and that `strip_markdown_jsonb` + the type-specific readers are Delivery 2.

- [ ] **Step 3: Run the fresh-apply gate**

Run the project's CI fresh-apply check (a fresh DB built from the documented order must reproduce live, RPCs included). Expected: green; advisors show only the expected §36 DEFINER notices (unchanged).

- [ ] **Step 4: `NOTIFY pgrst` + final verification**

Run `NOTIFY pgrst, 'reload schema';` on live. Re-run `test_strip_markdown.sql` + `test_markdown_descriptions_api.sql` against live → green.

- [ ] **Step 5: Commit**

```bash
git add docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "chore(deploy): manifest 14w for Markdown strip (delivery 1)"
```

---

## Decision-log update (do as the final step)

Add decision **§106** to `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`: Markdown for the `object_description` family — `api.strip_markdown` plain-on-read + `*_md` siblings; editor legs never stripped; flat readers wrapped; `strip_markdown` placed in `api` (not `internal`) for `i18n_pick` parity; `strip_markdown_jsonb` + type-specific readers deferred to Delivery 2. Propose the CLAUDE.md invariant from spec §13 (adjusting `internal.strip_markdown` → `api.strip_markdown`).

---

## Self-Review

- **Spec coverage (Delivery 1 = phases 1–4):** Task 1 = strip_markdown (§5, with `internal`→`api` noted); Task 2 = live diff gate (§8); Tasks 3–4 = family flat readers cards/map/InDesign (§3.2); Tasks 5–6 = rich path + adapted, deep_data inheritance (§3.2, §8); Tasks 7–8 = editor variant + §04 swap, editor legs never stripped (§6); Tasks 9–10 = drawer `*_md` render (§7); Task 11 = deploy integrity (§11). Deferred-and-noted: `strip_markdown_jsonb`, `*_normalized` generated columns, allow-list grouping (verified non-issue), and all type-specific surfaces (Delivery 2).
- **Type consistency:** `api.strip_markdown(text)` used identically in Tasks 3–6; `variant: 'block'|'inline'` defined in Task 7, consumed in Task 8; `*Md` parser fields defined in Task 9 (`descriptionMd`/`chapoMd`/`adaptedDescriptionMd`/`mobileDescriptionMd`/`editorialDescriptionMd`), consumed in Task 10.
- **Placeholders:** none — every code step shows the before/after. Task 8/9 reference existing fixture/local names to verify on edit (`objectDescriptionRecord`, the section test harness) rather than inventing them.

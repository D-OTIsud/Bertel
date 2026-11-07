# Opening Periods Migration Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Berta v2 AM/PM split opening periods into single periods with multiple time slots — fix the promotion logic first, backfill already-migrated data, verify the API output is correct, and only then adjust UX time formatting.

**Architecture:** The bug is in the migration's promotion logic (`20_promotion.sql`), which treats each staging row as a separate `opening_period`. The schema already supports multi-frame periods (`opening_time_frame.time_period_id` is non-unique FK) and the API function `api.get_opening_slots_by_day` already aggregates frames into a single weekday array. So the fix is data-only: (1) rewrite the promotion to group AM/PM staging rows by their `Horaires_id` base; (2) one-shot backfill that merges already-promoted pairs; (3) confirm the API; (4) format times as "12h"/"12h30" in the UI.

**Tech Stack:** PostgreSQL / PLpgSQL, TypeScript + React (Vite)

---

## Context

The Berta v2 legacy CSV stores lunch and dinner times as a single row per day-set with `AM_Start/AM_Finish` and `PM_Start/PM_Finish` fields. The staging load (`13_opening_period_temp__01.sql`) deliberately splits these into two staging rows with `source_period_id` suffixed `:am` and `:pm`. The promotion script then treats each staging row as a distinct `opening_period`, with one `opening_time_frame` each. Result: restaurants like `RESRUN00000000VC` (Au Domaine du Vacoa, type RES) get two semantically-identical "periods" — both `date_start = NULL`, `date_end = NULL`, same 7 weekdays — differing only by time-of-day (12:00–16:00 vs 19:00–21:00). The UI then surfaces "two periods" when there is really one with two service windows.

Audit (from migration + staging files, confirmed by structure of `20_promotion.sql:718-854`):

- **78 objects affected** (~15% of migrated objects), **29 are RES** (51% of all RES, because lunch/dinner is standard)
- Pattern: pair of `opening_period` rows with `source_period_id` ending in `:am` / `:pm`, same `Horaires_id` base
- Schema is fine — `opening_time_frame.time_period_id` is a non-unique FK; multiple frames per period are allowed
- API is fine — `api.get_opening_slots_by_day` aggregates all frames per weekday via `jsonb_agg`
- Recurrence concern (spec): the existing `opening_period.all_years BOOLEAN` plus `api.is_opening_period_active_on_date(...)` (comparing `to_char(date, 'MMDD')`) already covers the three required cases: single dated range, yearly recurrence with start/end dates, year-round implicit. **No schema evolution needed.**

## File Map

| Action | File |
|--------|------|
| Modify | `Base de donnée DLL et API/old_data_supabase_import_20260501/20_promotion.sql` (lines 718–854) |
| Create | `Base de donnée DLL et API/migrations/2026-05-15-merge-berta2-split-periods.sql` |
| Modify | `bertel-tourism-ui/src/features/object-drawer/utils.ts` (add `formatFrenchTime`) |
| Modify | `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` (slot label rendering) |

## Diagnostic Rule (identifying split pairs)

A pair of `opening_period` rows for the same object is a Berta v2 split iff:

- Both have `source_period_id LIKE 'old-data-berta2-%'`-derived ids that end in `:am` and `:pm` respectively
- The base (`regexp_replace(source_period_id, ':(am|pm)$', '')`) is identical

This is the **strongest signal** (source-evidence based) and is what every task below uses. Real seasonal periods are never matched because they have either a different `source_period_id` shape (no `:am`/`:pm` suffix), a non-NULL `date_start` / `date_end`, or a meaningful name.

---

## Task 0: Confirm scope with a read-only diagnostic

Before touching any data or code, run a diagnostic to confirm the audit's count of 78 affected objects. **If the numbers diverge significantly, stop and re-investigate before continuing.**

**Files:** none (read-only)

- [ ] **Step 1: Group split pairs**

Run via psql against the live DB:

```sql
WITH split_pairs AS (
  SELECT
    p.object_id,
    p.id AS period_id,
    p.source_period_id,
    regexp_replace(p.source_period_id, ':(am|pm)$', '') AS base_period_id,
    p.name
  FROM opening_period p
  WHERE p.source_period_id ~ ':(am|pm)$'
)
SELECT
  base_period_id,
  object_id,
  array_agg(name ORDER BY source_period_id) AS period_names,
  array_agg(period_id ORDER BY source_period_id) AS period_ids,
  count(*) AS period_count
FROM split_pairs
GROUP BY base_period_id, object_id
HAVING count(*) > 1
ORDER BY object_id, base_period_id;
```

Expected: ~78 groups, each typically with 2 periods.

- [ ] **Step 2: Count by object type**

```sql
SELECT
  obj.type_code,
  count(DISTINCT t.object_id) AS objects_affected,
  count(*) AS split_periods
FROM (
  SELECT p.object_id,
         regexp_replace(p.source_period_id, ':(am|pm)$', '') AS base_id
  FROM opening_period p
  WHERE p.source_period_id ~ ':(am|pm)$'
  GROUP BY p.object_id, base_id
  HAVING count(*) > 1
) t
JOIN object obj ON obj.id = t.object_id
GROUP BY obj.type_code
ORDER BY objects_affected DESC;
```

Expected: RES dominates (~29). Record the exact numbers — they will be quoted in the backfill migration's header comment.

- [ ] **Step 3: Spot-check `RESRUN00000000VC`**

```sql
SELECT
  p.id, p.source_period_id, p.name,
  p.date_start, p.date_end, p.all_years
FROM opening_period p
WHERE p.object_id = 'RESRUN00000000VC'
ORDER BY p.source_period_id;
```

Expected: two rows, one ending `:am` (12:00–16:00 frame), one `:pm` (19:00–21:00 frame), both with NULL dates and `all_years = TRUE`.

---

## Task 1: Rewrite the promotion logic to consolidate at insert time

Modify the promotion script so that future runs (or a re-run of the existing batch) produce ONE `opening_period` chain per `Horaires_id`, with multiple `opening_time_frame` rows.

**Files:**
- Modify: `Base de donnée DLL et API/old_data_supabase_import_20260501/20_promotion.sql` (block at lines 718–854)

The current block is inside a `DO $old_data_contact_price_opening$ ... $old_data_contact_price_opening$` PLpgSQL block. The structure is five sequential INSERTs: `opening_period`, `opening_schedule`, `opening_time_period`, `opening_time_period_weekday`, `opening_time_frame`. Each joins `staging.opening_period_temp op` on `op.source_period_id = p.source_period_id`. The fix changes the period-creation key from `source_period_id` to its base (without `:am`/`:pm` suffix), and lets all staging rows in a group contribute time frames.

- [ ] **Step 1: Replace the `INSERT INTO opening_period` block (lines 718–751)**

Replace with:

```sql
    INSERT INTO opening_period (
        object_id,
        name,
        source_period_id,
        all_years,
        extra,
        created_at,
        updated_at
    )
    SELECT
        oei.object_id,
        COALESCE(
            -- Prefer the AM row's name; falls back to generic label
            MIN(op.period_name) FILTER (WHERE op.source_period_id LIKE '%:am'),
            MIN(op.period_name),
            'Berta v2 opening'
        ) AS name,
        -- Canonical period id = base id (no :am/:pm suffix)
        regexp_replace(MIN(op.source_period_id), ':(am|pm)$', '') AS source_period_id,
        bool_or(COALESCE(op.all_years, TRUE)) AS all_years,
        jsonb_build_object(
            'import_batch_id', v_batch_id,
            'raw_source_data', jsonb_agg(op.raw_source_data ORDER BY op.source_period_id)
        ) AS extra,
        NOW(),
        NOW()
    FROM staging.opening_period_temp op
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
    WHERE op.import_batch_id = v_batch_id
      AND op.is_approved IS TRUE
      AND op.start_time IS NOT NULL
      AND op.end_time IS NOT NULL
    GROUP BY oei.object_id, regexp_replace(op.source_period_id, ':(am|pm)$', '')
    HAVING NOT EXISTS (
        SELECT 1
        FROM opening_period existing
        WHERE existing.object_id = oei.object_id
          AND existing.source_period_id = regexp_replace(MIN(op.source_period_id), ':(am|pm)$', '')
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening_period inserted (grouped): %', n;
```

- [ ] **Step 2: Update the `opening_schedule` block (lines 753–781)**

The join `op.source_period_id = p.source_period_id` won't match anymore because `p.source_period_id` is now the base id. Change to join on the base id, and pick only one staging row per group to drive the schedule insert (otherwise we'd insert duplicates). Replace the `JOIN staging.opening_period_temp op ...` clause:

```sql
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND regexp_replace(op.source_period_id, ':(am|pm)$', '') = p.source_period_id
     AND op.source_period_id LIKE '%:am'  -- only canonical (AM) staging row drives schedule
```

(For non-Berta source systems that don't use `:am`/`:pm`, the `LIKE '%:am'` filter would skip everything. To stay compatible, replace the filter line with:
```sql
     AND (op.source_period_id LIKE '%:am'
          OR op.source_period_id NOT LIKE '%:am' AND op.source_period_id NOT LIKE '%:pm')
```
This picks the AM row when one exists, otherwise the only row in the group.)

- [ ] **Step 3: Apply the same join change to the `opening_time_period` block (lines 783–803)**

Same replacement for `JOIN staging.opening_period_temp op`:

```sql
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND regexp_replace(op.source_period_id, ':(am|pm)$', '') = p.source_period_id
     AND (op.source_period_id LIKE '%:am'
          OR op.source_period_id NOT LIKE '%:am' AND op.source_period_id NOT LIKE '%:pm')
```

- [ ] **Step 4: Apply the same join change to the `opening_time_period_weekday` block (lines 805–826)**

Same replacement. Weekdays come from the canonical AM row's `weekdays` string, since AM and PM share weekdays for Berta v2.

- [ ] **Step 5: Change the `opening_time_frame` block (lines 828–854) so BOTH staging rows insert frames**

This one is different: we want EVERY staging row in a group to insert its `(start_time, end_time)` as a separate `opening_time_frame`. Replace the join (drop the `:am`-only filter):

```sql
    INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
    SELECT
        tp.id,
        op.start_time,
        op.end_time,
        NOW(),
        NOW()
    FROM opening_time_period tp
    JOIN opening_schedule s ON s.id = tp.schedule_id
    JOIN opening_period p ON p.id = s.period_id
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND regexp_replace(op.source_period_id, ':(am|pm)$', '') = p.source_period_id
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
     AND oei.object_id = p.object_id
    WHERE op.is_approved IS TRUE
      AND op.start_time IS NOT NULL
      AND op.end_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM opening_time_frame existing
        WHERE existing.time_period_id = tp.id
          AND existing.start_time IS NOT DISTINCT FROM op.start_time
          AND existing.end_time IS NOT DISTINCT FROM op.end_time
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening_time_frame inserted: %', n;
```

Both AM and PM staging rows now insert their frame into the same `opening_time_period`.

- [ ] **Step 6: Dry-run on a clean test database**

Restore a fresh DB snapshot. Run the full import pipeline (`00_*.sql` through `20_promotion.sql`). Then:

```sql
-- Should return 0
SELECT count(*) FROM opening_period WHERE source_period_id LIKE '%:am';
SELECT count(*) FROM opening_period WHERE source_period_id LIKE '%:pm';

-- Spot-check Au Domaine du Vacoa: ONE period, 2 frames
SELECT
  p.source_period_id,
  (SELECT count(*) FROM opening_schedule s
   JOIN opening_time_period tp ON tp.schedule_id = s.id
   JOIN opening_time_frame tf ON tf.time_period_id = tp.id
   WHERE s.period_id = p.id) AS frame_count
FROM opening_period p
WHERE p.object_id = 'RESRUN00000000VC';
```

Expected: 1 row, `frame_count = 2`.

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/old_data_supabase_import_20260501/20_promotion.sql"
git commit -m "fix(migration): merge Berta v2 AM/PM staging rows into one opening_period"
```

---

## Task 2: Backfill migration for already-loaded data

Already-imported batches still have the split. Write an **idempotent** migration that finds AM/PM pairs, copies the PM frames onto the AM period's `opening_time_period`, and deletes the PM `opening_period` (cascade kills its schedule chain).

**Files:**
- Create: `Base de donnée DLL et API/migrations/2026-05-15-merge-berta2-split-periods.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 2026-05-15 — Merge Berta v2 AM/PM split opening_period rows
--
-- Context: 20_promotion.sql, before its fix, created one opening_period per
-- staging row, so AM and PM shifts from the same Horaires_id became two
-- separate period chains. This script consolidates them into one period
-- with multiple opening_time_frame rows.
--
-- Idempotent: re-running it does nothing once pairs are merged.
--
-- Scope (from Task 0 diagnostic): N objects, M paired periods
-- [FILL IN WITH ACTUAL DIAGNOSTIC NUMBERS BEFORE RUNNING]
-- ============================================================================

DO $$
DECLARE
  v_pair RECORD;
  v_pm_count INT := 0;
  v_frame_count INT := 0;
  v_total_frames INT := 0;
BEGIN
  -- Find AM/PM pairs that share an object and Horaires_id base.
  FOR v_pair IN
    SELECT
      am.id  AS am_period_id,
      am.object_id,
      am.source_period_id AS am_source_id,
      pm.id  AS pm_period_id,
      pm.source_period_id AS pm_source_id
    FROM opening_period am
    JOIN opening_period pm
      ON pm.object_id = am.object_id
     AND regexp_replace(pm.source_period_id, ':(am|pm)$', '')
       = regexp_replace(am.source_period_id, ':(am|pm)$', '')
     AND pm.id <> am.id
    WHERE am.source_period_id LIKE '%:am'
      AND pm.source_period_id LIKE '%:pm'
  LOOP
    -- Copy each frame from the PM chain onto the AM chain's time_period.
    -- Match by weekday set so we don't merge across mismatched days
    -- (defence-in-depth; in practice AM and PM share the same weekday set).
    INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
    SELECT
      am_tp.id,
      pm_tf.start_time,
      pm_tf.end_time,
      NOW(),
      NOW()
    FROM opening_schedule am_s
    JOIN opening_time_period am_tp ON am_tp.schedule_id = am_s.id
    JOIN opening_schedule pm_s ON pm_s.period_id = v_pair.pm_period_id
    JOIN opening_time_period pm_tp ON pm_tp.schedule_id = pm_s.id
    JOIN opening_time_frame pm_tf ON pm_tf.time_period_id = pm_tp.id
    WHERE am_s.period_id = v_pair.am_period_id
      AND (
        SELECT array_agg(weekday_id ORDER BY weekday_id)
        FROM opening_time_period_weekday WHERE time_period_id = am_tp.id
      ) = (
        SELECT array_agg(weekday_id ORDER BY weekday_id)
        FROM opening_time_period_weekday WHERE time_period_id = pm_tp.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM opening_time_frame existing
        WHERE existing.time_period_id = am_tp.id
          AND existing.start_time IS NOT DISTINCT FROM pm_tf.start_time
          AND existing.end_time IS NOT DISTINCT FROM pm_tf.end_time
      );
    GET DIAGNOSTICS v_frame_count = ROW_COUNT;
    v_total_frames := v_total_frames + v_frame_count;

    -- Cascade-delete the PM period chain (schedule, time_period, frames, weekdays)
    DELETE FROM opening_period WHERE id = v_pair.pm_period_id;
    v_pm_count := v_pm_count + 1;

    RAISE NOTICE 'Merged % -> %: % frame(s)',
      v_pair.pm_source_id, v_pair.am_source_id, v_frame_count;
  END LOOP;

  -- Normalise AM-only ids: drop the :am suffix so the canonical source id
  -- matches what the new promotion logic in Task 1 produces.
  UPDATE opening_period
  SET source_period_id = regexp_replace(source_period_id, ':am$', ''),
      updated_at = NOW()
  WHERE source_period_id LIKE '%:am';

  RAISE NOTICE 'Total pairs merged: %, total frames moved: %', v_pm_count, v_total_frames;
END
$$;
```

- [ ] **Step 2: Run on a DB snapshot first**

Take a snapshot. Apply the migration. Then:

```sql
-- Both should return 0
SELECT count(*) FROM opening_period WHERE source_period_id LIKE '%:pm';
SELECT count(*) FROM opening_period WHERE source_period_id LIKE '%:am';

-- Au Domaine du Vacoa: one period with 2 frames
SELECT
  p.id, p.source_period_id, p.name,
  (SELECT count(*) FROM opening_schedule s
   JOIN opening_time_period tp ON tp.schedule_id = s.id
   JOIN opening_time_frame tf ON tf.time_period_id = tp.id
   WHERE s.period_id = p.id) AS frame_count
FROM opening_period p
WHERE p.object_id = 'RESRUN00000000VC';
```

Expected: 1 row; `frame_count = 2`.

- [ ] **Step 3: Verify the produced API JSON**

```sql
SELECT api.build_opening_period_json(p.id, p.object_id, p.date_start, p.date_end, 1)
FROM opening_period p
WHERE p.object_id = 'RESRUN00000000VC';
```

Expected:

```json
{
  "id": "...",
  "order": 1,
  "object_id": "RESRUN00000000VC",
  "date_start": null,
  "date_end": null,
  "closed_days": [],
  "weekday_slots": {
    "monday":    [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}],
    "tuesday":   [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}],
    "wednesday": [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}],
    "thursday":  [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}],
    "friday":    [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}],
    "saturday":  [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}],
    "sunday":    [{"start": "12:00:00", "end": "16:00:00"}, {"start": "19:00:00", "end": "21:00:00"}]
  }
}
```

- [ ] **Step 4: Run the migration twice to confirm idempotency**

Second run should produce `Total pairs merged: 0` and not change any rows.

- [ ] **Step 5: Commit**

```bash
git add "Base de donnée DLL et API/migrations/2026-05-15-merge-berta2-split-periods.sql"
git commit -m "feat(migration): backfill merge of Berta v2 AM/PM split opening periods"
```

---

## Task 3: Verify the API needs no change

`api.get_opening_slots_by_day` (lines 4478–4509 of `api_views_functions.sql`) already aggregates ALL `opening_time_frame` rows for a given period+weekday into a single JSON array. **No SQL function change is expected.** Run a regression to confirm.

**Files:** none (verification only)

- [ ] **Step 1: Compare API output for 5 fixed objects + 5 untouched single-period objects**

```sql
SELECT
  p.object_id,
  p.source_period_id,
  api.build_opening_period_json(p.id, p.object_id, p.date_start, p.date_end, 1)->'weekday_slots' AS slots
FROM opening_period p
WHERE p.object_id IN (
  'RESRUN00000000VC' /* 4 more from Task 0 diagnostic with multiple service times */
)
   OR p.object_id IN (
  /* 5 objects with a single time slot per day — pick from Task 0 results */
);
```

Each `weekday_slots` entry should have the expected number of ranges.

- [ ] **Step 2: If anything looks wrong, do NOT modify the API**

The API layer reads what the DB layer stores. Wrong output here means Task 2 missed cases — re-investigate the diagnostic.

---

## Task 4: UX time format — display "12h", "12h30" (LAST)

Only after the data is correct, fix the display so times no longer show `12:00:00` or `12h00`. The parser builds slot labels as `"09:00 -> 12:00"` and the renderer joins them with `·`. Two changes: introduce a `formatFrenchTime` helper, and use it at render time. We keep the internal `slots: string[]` in `HH:MM` form so the existing `getSlotRanges()` regex (which extracts `\d{1,2}:\d{2}`) and the bar-positioning logic (Task already shipped) keep working.

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-drawer/utils.ts`
- Modify: `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx`

- [ ] **Step 1: Add `formatFrenchTime` to utils.ts**

Add at the bottom of `bertel-tourism-ui/src/features/object-drawer/utils.ts`:

```ts
/** "12:00", "12:00:00", "12:30" -> "12h", "12h30" (French style, no seconds, no leading zero on hour) */
export function formatFrenchTime(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;
  const [, hourStr, minStr] = match;
  const hour = Number.parseInt(hourStr, 10);
  return minStr === '00' ? `${hour}h` : `${hour}h${minStr}`;
}

/** Convert a slot string like "09:00 -> 12:00" or "09:00–12:00" into "9h - 12h" / "9h30 - 12h30". */
export function formatFrenchSlot(slot: string): string {
  const times = slot.match(/\d{1,2}:\d{2}/g) ?? [];
  if (times.length < 2) return slot;
  return `${formatFrenchTime(times[0])} - ${formatFrenchTime(times[1])}`;
}
```

- [ ] **Step 2: Import and use `formatFrenchSlot` in the renderer**

In `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx`, add to the existing import from `./utils` (find the existing line `from './utils'` near the top of the file and append `formatFrenchSlot`).

Locate the `OpeningWeekGrid` component (around line 2415). Inside the `rows.map` body, find:

```tsx
<span className="detail-opening-day__slots">{closed ? 'Fermé' : row.slots.join(' · ')}</span>
```

Replace with:

```tsx
<span className="detail-opening-day__slots">{closed ? 'Fermé' : row.slots.map(formatFrenchSlot).join(' · ')}</span>
```

Locate the `OpeningPeriodsCard` component (around line 2512). Find:

```tsx
const todayLabel = todaySlots.length > 0 ? todaySlots.join(' · ') : 'Fermé';
```

Replace with:

```tsx
const todayLabel = todaySlots.length > 0 ? todaySlots.map(formatFrenchSlot).join(' · ') : 'Fermé';
```

That's it. The bar positioning is unaffected because `getSlotRanges()` still parses `HH:MM` from the internal slot string before any formatting.

- [ ] **Step 3: Run dev server and verify three cases**

```bash
cd bertel-tourism-ui && npm run dev
```

Open the drawer for three objects:
1. `RESRUN00000000VC` (after Task 2 backfill) — today should read: `Aujourd'hui · 12h - 16h · 19h - 21h`
2. An object with a single morning slot `09:00–17:00` — should read `9h - 17h`
3. An object with a half-hour boundary (e.g. `09:30–12:30`) — should read `9h30 - 12h30`

Check the week grid for the same objects: each day shows the same formatted ranges.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/features/object-drawer/utils.ts \
        bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx
git commit -m "feat(ui): French time format (12h, 12h30) for opening hours"
```

---

## Verification (end to end)

1. **DB layer:**
   ```sql
   SELECT count(*) FROM opening_period WHERE source_period_id LIKE '%:pm'; -- 0
   SELECT count(*) FROM opening_period WHERE source_period_id LIKE '%:am'; -- 0
   ```
2. **API layer:** `api.build_opening_period_json(...)` for `RESRUN00000000VC` returns one period with two ranges per weekday (see expected JSON in Task 2 Step 3).
3. **UX layer:** detail drawer for Au Domaine du Vacoa shows:
   - Hero: `Ouvert · ferme à 16h00` (status text via `getOpeningStatus`, unchanged) and `Aujourd'hui · 12h - 16h · 19h - 21h`
   - Week grid: each weekday has two bar segments and label `12h - 16h · 19h - 21h`
   - "Toutes les périodes" view: a single period card, not two
4. **Non-regression:** open 3 unaffected objects (no AM/PM split) and confirm their display is unchanged except for the new time format.

## Out of Scope

- **Schema additions for explicit yearly-recurrence** (`recurs_yearly`, `start_month`, `start_day`, `end_month`, `end_day`): the existing `opening_period.all_years BOOLEAN` plus `api.is_opening_period_active_on_date(...)` (compares `to_char(date, 'MMDD')`) already cover all three required cases — single dated range, yearly recurrence with start/end dates, year-round implicit (`all_years = TRUE` with NULL dates). The spec asked us to verify this; verdict: no schema change.
- **Generic merge of "periods without a name and without dates"** beyond the Berta v2 pattern. The diagnostic rule is intentionally narrow (`source_period_id LIKE '%:am'` / `%:pm`) to avoid accidentally merging legitimate seasonal periods that happen to lack metadata. If future imports introduce a similar pattern from a different source system, this plan's approach should be replicated for that source rather than generalised at the model level.
- **Re-running the import pipeline on production.** Production already has the data; Task 2's backfill handles it. The Task 1 fix matters for any future re-runs or new batches.

## Risks & Mitigations

- **Destructive `DELETE` in backfill (Task 2).** Mitigation: idempotent guard (`NOT EXISTS` on frame copy + cascade only after frames are copied); always run on a snapshot first; record the diagnostic count to detect divergence on re-run.
- **A real seasonal period with `:am`/`:pm` in its id by coincidence.** Mitigation: the suffix is a Berta-v2-specific convention (added by the staging load at `13_opening_period_temp__01.sql`), so the false-positive risk is structurally near-zero. The diagnostic in Task 0 lists every candidate before any change — review the names manually if anything looks unusual.
- **Frontend slot regex stops matching after format change.** Mitigation: we deliberately keep `OpeningItem.slots` in `HH:MM` form internally and only format at render time, so `getSlotRanges()` (and therefore the bar positions) keeps working.

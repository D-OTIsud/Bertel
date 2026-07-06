# Classement Grade Filter + Grade Sections (Phase A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a graded classement (hôtelier, meublés, épis, clés, catégories) is selected in the Explorer "Classement / label" filter, show an interactive star/épi/clé bar to pick levels (→ `classifications_any` filter), and group the results into collapsible sections by level (5★ first) in the List and Table views.

**Architecture:** Frontend-only, no backend. Grades come from `ref_classification_value` (loaded into references as `rankedLabelSchemeValues`); each card's grade for the active scheme is read from its existing badge `code` (`scheme:value`, e.g. `meuble_stars:3` — already emitted by `get_object_cards_batch`). Builds directly on the §173 sectioning: a new `buildGradeSections` returns the same discriminated union so the views branch once; grade mode is mutually exclusive with §173's rank sections.

**Tech Stack:** Next.js/React, TanStack Query, Zustand, lucide-react, Tailwind, Jest/RTL.

**Design spec:** [docs/superpowers/specs/2026-07-06-classement-grade-filter-sections-design.md](../specs/2026-07-06-classement-grade-filter-sections-design.md)

## Global Constraints

- **Frontend-only. No SQL / backend change.** The `classifications_any` filter, `cached_classification_codes` (`scheme:value`), and the card badge `code` (`scheme:value`) all already exist and are verified live.
- **Per-card grade source = `card.badges[].code`** in the format `<schemeCode>:<valueCode>` (e.g. `meuble_stars:3`). Backend emits it (`get_object_cards_batch` classification_badges CTE: `code = s.code || ':' || v.code`). Never re-parse the badge label; use the `code`.
- **Grade bar shows ONLY for a graded scheme** = `references.rankedLabelSchemeValues[schemeCode]` exists with **≥2 values**. Binary labels (Clef Verte, T&H, quality labels) have a single `granted` value → no bar.
- **House-style fidelity (spec §10):** reuse the real `ResultCardView` cards, the §173 section-header treatment verbatim, and the app's own classement icons (lucide `Star`/`Wheat`/`Key`). No generic styling, no hardcoded colors — use existing tokens (`--ink`/`--line`/`--surface`, the classement star colour from `.thumb__rating`, `accent-teal`).
- **Star bar interaction:** per-level **independent toggle** (click a level toggles just it — 3 and 5 skipping 4 is valid); selected = filled/coloured + slightly larger; hover enlarges; click = brief "pop". Animate **`transform` only** (compositor-friendly).
- **Payload:** `classifications_any = valueCodes.map(vc => ({ scheme_code, value_code: vc }))`, emitted only when a scheme AND ≥1 value are selected. `label_scheme_ranked` stays emitted (harmless AND). Byte-identical payload when no values selected.
- **Grade sections mutually exclusive with §173 rank sections:** ExplorerPage sets a `gradeSection` prop only when the active scheme is graded; when present, `buildGradeSections` wins over `buildResultSections`.
- **Commits:** conventional, **NO `Co-Authored-By` trailer**, to `master`, by explicit pathspec, stage+commit in ONE shell invocation (parallel session shares the index). User pushes.
- **Decision-log number:** `§174` (verify with `grep -oE '^## §[0-9]+' "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" | tail -1` before finalizing docs).
- **jest/tsc:** run inside `bertel-tourism-ui`. tsc = `npx tsc -p tsconfig.app.json --noEmit`.

---

## File Structure

- `bertel-tourism-ui/src/types/domain.ts` — `ExplorerReferences.rankedLabelSchemeValues` + `ExplorerCommonFilters.rankedLabelValueCodes`.
- `bertel-tourism-ui/src/services/explorer-reference.ts` — load `ref_classification_value` → `rankedLabelSchemeValues` (+ demo mock).
- `bertel-tourism-ui/src/components/explorer/classement-icons.tsx` (NEW) — extracted `CLASSEMENT_ICON` (Star/Wheat/Key) shared by the card cocarde + the grade bar.
- `bertel-tourism-ui/src/utils/explorer-card-display.ts` — `schemeUnit(code): ClassementUnit` resolver (+ re-import of the extracted icons where needed).
- `bertel-tourism-ui/src/components/explorer/ResultCardView.tsx` — re-import the extracted icons (no behaviour change).
- `bertel-tourism-ui/src/store/explorer-store.ts` — `setRankedLabelValueCodes` + reset on `setRankedLabelScheme`.
- `bertel-tourism-ui/src/utils/facets.ts` — default/normalize + `classifications_any` emission.
- `bertel-tourism-ui/src/lib/explorer-search-params.ts` — `rankedLabelValues` URL param.
- `bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts` + `ExplorerActiveFilters.tsx` — level chip + removal.
- `bertel-tourism-ui/src/components/explorer/GradeBar.tsx` (NEW) — the interactive level bar.
- `bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx` — render `<GradeBar>` gated on a graded scheme.
- `bertel-tourism-ui/src/utils/explorer-result-sections.ts` — `buildGradeSections` + widen group type.
- `bertel-tourism-ui/src/views/ExplorerPage.tsx` — compute + pass the `gradeSection` prop.
- `bertel-tourism-ui/src/components/explorer/ResultsList.tsx` + `ResultsTableView.tsx` — grade-section render + collapse.
- `bertel-tourism-ui/src/styles.css` — `.grade-bar` interaction styles.

---

## Task 1: Reference data — grade values + the new filter type

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts` (`ExplorerReferences` after L324; `ExplorerCommonFilters` near `rankedLabelIncludeEquivalents`)
- Modify: `bertel-tourism-ui/src/services/explorer-reference.ts`
- Test: `bertel-tourism-ui/src/services/explorer-reference.test.ts` (create or append)

**Interfaces:**
- Produces: `ExplorerReferences.rankedLabelSchemeValues: Record<string, ExplorerReferenceOption[]>` (per scheme code, grade values sorted ascending); `ExplorerCommonFilters.rankedLabelValueCodes: string[]`; exported `toRankedLabelSchemeValues(rows)`.

- [ ] **Step 1: Add the types.** In `domain.ts`, after the `rankedLabelSchemes: ExplorerReferenceOption[];` line in `ExplorerReferences`:

```ts
  /**
   * §174 — pour chaque scheme classé (is_distinction), ses paliers de note
   * (ref_classification_value : code, name), triés par grade croissant. Clé = code du scheme.
   * value_code '1'..'5' (étoiles/épis/clés) ou 'cat_1..3' (ot_category).
   */
  rankedLabelSchemeValues: Record<string, ExplorerReferenceOption[]>;
```

And in `ExplorerCommonFilters`, immediately after the `rankedLabelIncludeEquivalents: boolean;` line:

```ts
  /** §174 — niveaux de classement sélectionnés (value_codes du scheme classé actif). Réinitialisé au changement de scheme. */
  rankedLabelValueCodes: string[];
```

- [ ] **Step 2: Write the failing mapper test.** Create/append `bertel-tourism-ui/src/services/explorer-reference.test.ts`:

```ts
import { toRankedLabelSchemeValues } from './explorer-reference';

describe('toRankedLabelSchemeValues', () => {
  it('groups grade values by scheme code, sorted ascending, numeric-aware', () => {
    const rows = [
      { code: '3', name: '3 étoiles', position: null, scheme: { code: 'hot_stars' } },
      { code: '1', name: '1 étoile', position: null, scheme: { code: 'hot_stars' } },
      { code: '5', name: '5 étoiles', position: null, scheme: { code: 'hot_stars' } },
      { code: 'granted', name: 'Obtenu', position: null, scheme: { code: 'LBL_CLEF_VERTE' } },
    ];
    const out = toRankedLabelSchemeValues(rows);
    expect(out.hot_stars.map((v) => v.code)).toEqual(['1', '3', '5']);
    expect(out.hot_stars[0]).toEqual({ code: '1', name: '1 étoile' });
    expect(out.LBL_CLEF_VERTE.map((v) => v.code)).toEqual(['granted']);
  });

  it('drops rows without a scheme code or value code', () => {
    const out = toRankedLabelSchemeValues([
      { code: '', name: 'x', position: null, scheme: { code: 'hot_stars' } },
      { code: '2', name: '2 étoiles', position: null, scheme: null },
    ]);
    expect(out).toEqual({});
  });
});
```

- [ ] **Step 3: Run RED.** `cd bertel-tourism-ui && npx jest src/services/explorer-reference.test.ts`. Expected: FAIL (`toRankedLabelSchemeValues` not exported).

- [ ] **Step 4: Implement in `explorer-reference.ts`.**
  (a) Row type — after the `LabelSchemeRow = {...}` block:
```ts
type ClassificationValueRow = {
  code: string;
  name: string;
  position: number | null;
  scheme: { code?: string | null } | null;
};
```
  (b) The mapper (EXPORT it) — near `toRankedLabelOptions`:
```ts
export function toRankedLabelSchemeValues(rows: ClassificationValueRow[]): Record<string, ExplorerReferenceOption[]> {
  const bySchemeCode = new Map<string, ClassificationValueRow[]>();
  for (const row of rows) {
    const schemeCode = row.scheme?.code ?? '';
    if (!schemeCode || !row.code) continue;
    const current = bySchemeCode.get(schemeCode) ?? [];
    current.push(row);
    bySchemeCode.set(schemeCode, current);
  }
  const result: Record<string, ExplorerReferenceOption[]> = {};
  for (const [schemeCode, values] of bySchemeCode) {
    result[schemeCode] = [...values]
      .sort((a, b) => {
        const positionCompare = (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
        if (positionCompare !== 0) return positionCompare;
        const numA = Number(a.code);
        const numB = Number(b.code);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
      })
      .map((value) => ({ code: value.code, name: value.name }));
  }
  return result;
}
```
  (c) The query — append as the last entry in the `Promise.all([...])` array (after the `ref_classification_scheme` query):
```ts
    client
      .from('ref_classification_value')
      .select('code,name,position,scheme:scheme_id(code,is_distinction)')
      .order('position', { ascending: true }),
```
  (d) Destructure binding — add `rankedLabelSchemeValuesResult,` to the array head right after `rankedLabelSchemesResult,`.
  (e) Error guard — after the `rankedLabelSchemesResult.error` guard:
```ts
  if (rankedLabelSchemeValuesResult.error) {
    throw rankedLabelSchemeValuesResult.error;
  }
```
  (f) Data + filter to distinctions (the embedded select carries `is_distinction`) — after `const rankedLabelSchemes = …`:
```ts
  const rankedLabelSchemeValues = ((rankedLabelSchemeValuesResult.data ?? []) as (ClassificationValueRow & { scheme: { code?: string | null; is_distinction?: boolean | null } | null })[])
    .filter((row) => row.scheme?.is_distinction === true);
```
  (g) Return — after `rankedLabelSchemes: toRankedLabelOptions(rankedLabelSchemes),`:
```ts
    rankedLabelSchemeValues: toRankedLabelSchemeValues(rankedLabelSchemeValues),
```
  (h) Demo mock — in `buildDemoReferences`, after the `rankedLabelSchemes: [...]` array:
```ts
    rankedLabelSchemeValues: {
      meuble_stars: [
        { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
        { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
      ],
      gites_epics: [
        { code: '1', name: '1 épi' }, { code: '2', name: '2 épis' }, { code: '3', name: '3 épis' },
        { code: '4', name: '4 épis' }, { code: '5', name: '5 épis' },
      ],
    },
```

- [ ] **Step 5: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/services/explorer-reference.test.ts && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean (the non-optional interface field forces the demo mock — the compiler proves it's wired).

- [ ] **Step 6: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/services/explorer-reference.ts bertel-tourism-ui/src/services/explorer-reference.test.ts && git commit -m "feat(explorer): références — niveaux de classement (rankedLabelSchemeValues depuis ref_classification_value) + type rankedLabelValueCodes §174"
```

---

## Task 2: Shared classement icons + scheme→unit resolver

**Files:**
- Create: `bertel-tourism-ui/src/components/explorer/classement-icons.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/ResultCardView.tsx` (re-import the icons)
- Modify: `bertel-tourism-ui/src/utils/explorer-card-display.ts` (add `schemeUnit`)
- Test: `bertel-tourism-ui/src/utils/explorer-card-display.test.ts` (append)

**Interfaces:**
- Consumes: `ClassementUnit` (exported from `explorer-card-display.ts`).
- Produces: `CLASSEMENT_ICON: Record<ClassementUnit, ComponentType<{ 'aria-hidden'?: boolean }>>` (from `classement-icons.tsx`); `schemeUnit(code: string): ClassementUnit` (from `explorer-card-display.ts`).

- [ ] **Step 1: Create `classement-icons.tsx`** (extract the private map from `ResultCardView.tsx` so the card cocarde AND the grade bar draw the same picto):
```tsx
import type { ComponentType } from 'react';
import { Key, Star, Wheat } from 'lucide-react';
import type { ClassementUnit } from '../../utils/explorer-card-display';

/** Picto de l'unité de classement — étoiles (hôtels/campings…), épis (Gîtes), clés (Clévacances). */
export const CLASSEMENT_ICON: Record<ClassementUnit, ComponentType<{ 'aria-hidden'?: boolean }>> = {
  etoile: Star,
  epi: Wheat,
  cle: Key,
};
```

- [ ] **Step 2: Re-import in `ResultCardView.tsx`** — remove the private `RATING_ICON` const and use the shared one. Replace the private `const RATING_ICON: Record<ClassementUnit, …> = { etoile: Star, epi: Wheat, cle: Key };` with an import: add `import { CLASSEMENT_ICON } from './classement-icons';`, drop `Key, Star, Wheat` from the lucide import if now unused there, and change `RatingCockade`'s `const Icon = RATING_ICON[unit];` → `const Icon = CLASSEMENT_ICON[unit];`. Keep `RATING_UNIT_LABEL` and `RatingCockade` where they are (card-specific).

- [ ] **Step 3: Write the failing resolver test.** Append to `bertel-tourism-ui/src/utils/explorer-card-display.test.ts`:
```ts
import { schemeUnit } from './explorer-card-display';

describe('schemeUnit', () => {
  it('maps scheme codes to their classement unit', () => {
    expect(schemeUnit('hot_stars')).toBe('etoile');
    expect(schemeUnit('meuble_stars')).toBe('etoile');
    expect(schemeUnit('gites_epics')).toBe('epi');
    expect(schemeUnit('clevacances_keys')).toBe('cle');
    expect(schemeUnit('ot_category')).toBe('etoile');
  });
});
```

- [ ] **Step 4: Run RED.** `cd bertel-tourism-ui && npx jest src/utils/explorer-card-display.test.ts -t schemeUnit`. Expected: FAIL (`schemeUnit` not exported).

- [ ] **Step 5: Implement `schemeUnit`** in `explorer-card-display.ts` (near `ClassementUnit`):
```ts
/** §174 — résout l'unité de classement (étoile/épi/clé) depuis le CODE du scheme. */
export function schemeUnit(code: string): ClassementUnit {
  const c = code.toLowerCase();
  if (c.includes('epi') || c.includes('gites')) return 'epi';
  if (c.includes('key') || c.includes('cle')) return 'cle';
  return 'etoile';
}
```

- [ ] **Step 6: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/utils/explorer-card-display.test.ts && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 7: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/classement-icons.tsx bertel-tourism-ui/src/components/explorer/ResultCardView.tsx bertel-tourism-ui/src/utils/explorer-card-display.ts bertel-tourism-ui/src/utils/explorer-card-display.test.ts && git commit -m "refactor(explorer): CLASSEMENT_ICON partagé (carte + barre de niveaux) + schemeUnit(code) §174"
```

---

## Task 3: Filter state — store + facets (classifications_any)

**Files:**
- Modify: `bertel-tourism-ui/src/store/explorer-store.ts`
- Modify: `bertel-tourism-ui/src/utils/facets.ts`
- Test: `bertel-tourism-ui/src/utils/facets.test.ts` (append)

**Interfaces:**
- Consumes: `ExplorerCommonFilters.rankedLabelValueCodes` (Task 1).
- Produces: `useExplorerStore().setRankedLabelValueCodes(codes: string[])` (and `setRankedLabelScheme` resets it); `buildBucketRpcFilters` emits `classifications_any`.

- [ ] **Step 1: Write the failing facets tests.** Append to `facets.test.ts`:
```ts
describe('buildBucketRpcFilters — classement levels (§174)', () => {
  it('emits classifications_any for the selected scheme + value codes', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'meuble_stars', rankedLabelValueCodes: ['3', '4', '5'] },
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({
      label_scheme_ranked: 'meuble_stars',
      classifications_any: [
        { scheme_code: 'meuble_stars', value_code: '3' },
        { scheme_code: 'meuble_stars', value_code: '4' },
        { scheme_code: 'meuble_stars', value_code: '5' },
      ],
    });
  });
  it('omits classifications_any when no level is selected', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'meuble_stars' },
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).not.toHaveProperty('classifications_any');
  });
  it('omits classifications_any when levels set but no scheme', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelValueCodes: ['3'] },
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).not.toHaveProperty('classifications_any');
  });
  it('defaults rankedLabelValueCodes to [] on normalize', () => {
    expect(normalizeExplorerFilters(buildFilters({})).common.rankedLabelValueCodes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run RED.** `cd bertel-tourism-ui && npx jest src/utils/facets.test.ts -t "§174"`. Expected: FAIL.

- [ ] **Step 3: Store** — in `explorer-store.ts`: add the interface entry after `setRankedLabelIncludeEquivalents: (value: boolean) => void;`:
```ts
  setRankedLabelValueCodes: (codes: string[]) => void;
```
Make `setRankedLabelScheme` also reset values, and add the new setter (in the implementation block):
```ts
  setRankedLabelScheme: (schemeCode) =>
    set((state) => ({
      common: {
        ...state.common,
        rankedLabelSchemeCode: String(schemeCode ?? '').trim() || null,
        rankedLabelValueCodes: [],
      },
    })),
  setRankedLabelIncludeEquivalents: (value) =>
    set((state) => ({ common: { ...state.common, rankedLabelIncludeEquivalents: value } })),
  setRankedLabelValueCodes: (codes) =>
    set((state) => ({ common: { ...state.common, rankedLabelValueCodes: codes } })),
```

- [ ] **Step 4: Facets** — in `facets.ts`: default (after `rankedLabelIncludeEquivalents: true,`): `  rankedLabelValueCodes: [],`. Normalize (after `rankedLabelIncludeEquivalents: common.rankedLabelIncludeEquivalents ?? true,`): `      rankedLabelValueCodes: common.rankedLabelValueCodes ?? [],`. Payload — inside the existing `if (rankedLabelSchemeCode) { … }` block, before its closing `}`:
```ts
    const rankedLabelValueCodes = common.rankedLabelValueCodes.map(cleanString).filter(Boolean);
    if (rankedLabelValueCodes.length > 0) {
      payload.classifications_any = rankedLabelValueCodes.map((valueCode) => ({
        scheme_code: rankedLabelSchemeCode,
        value_code: valueCode,
      }));
    }
```

- [ ] **Step 5: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/utils/facets.test.ts && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 6: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/store/explorer-store.ts bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/utils/facets.test.ts && git commit -m "feat(explorer): niveaux classement — setter + reset au changement de scheme + payload classifications_any §174"
```

---

## Task 4: URL param + active chip + removal

**Files:**
- Modify: `bertel-tourism-ui/src/lib/explorer-search-params.ts` (+ its test if present, else create)
- Modify: `bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts` (+ test)
- Modify: `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx`

**Interfaces:**
- Consumes: `rankedLabelValueCodes` + `setRankedLabelValueCodes`.
- Produces: URL param `rankedLabelValues` (CSV); active chip group `'rankedLabelValues'`; removal → `setRankedLabelValueCodes([])`.

- [ ] **Step 1: Write failing tests.** In `explorer-search-params.test.ts`:
```ts
describe('explorer-search-params — rankedLabelValues', () => {
  it('writes rankedLabelValues CSV only when a scheme + levels are set', () => {
    const filters = { ...DEFAULT_EXPLORER_FILTERS, common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'meuble_stars', rankedLabelValueCodes: ['3', '5'] } };
    expect(buildSearchParams(filters).get('rankedLabelValues')).toBe('3,5');
  });
  it('omits rankedLabelValues when no scheme', () => {
    const filters = { ...DEFAULT_EXPLORER_FILTERS, common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelValueCodes: ['3'] } };
    expect(buildSearchParams(filters).get('rankedLabelValues')).toBeNull();
  });
  it('parses rankedLabelValues CSV into an array', () => {
    const parsed = parseSearchParams(new URLSearchParams('rankedLabel=meuble_stars&rankedLabelValues=3,5'));
    expect(parsed.common?.rankedLabelValueCodes).toEqual(['3', '5']);
  });
});
```
And in `explorer-active-chips.test.ts` (append), a case asserting a `Niveau · N sélectionné(s)` chip appears when scheme + values, absent otherwise (match the file's existing `filters()` harness + `buildExplorerActiveChips`).

- [ ] **Step 2: Run RED.** `cd bertel-tourism-ui && npx jest src/lib/explorer-search-params.test.ts src/components/explorer/explorer-active-chips.test.ts`. Expected: FAIL.

- [ ] **Step 3a: URL** in `explorer-search-params.ts`. READ (near the `rankedLabel` read):
```ts
  const rankedLabelValueCodes = searchParams.get('rankedLabelValues')?.split(',').map((item) => item.trim()).filter(Boolean) ?? undefined;
```
Into `commonPatch` (after the `rankedLabelExact` spread):
```ts
    ...(rankedLabelValueCodes !== undefined && { rankedLabelValueCodes }),
```
WRITE (after the `rankedLabelExact` write):
```ts
  if (normalizedFilters.common.rankedLabelSchemeCode && normalizedFilters.common.rankedLabelValueCodes.length > 0) {
    p.set('rankedLabelValues', normalizedFilters.common.rankedLabelValueCodes.join(','));
  }
```

- [ ] **Step 3b: Chip** in `explorer-active-chips.ts`. Union — add `| 'rankedLabelValues'`. Push (after the `rankedLabelExact` push):
```ts
  const rankedValueCount = (c.rankedLabelValueCodes ?? []).length;
  if (rankedScheme && rankedValueCount > 0) {
    chips.push({ key: 'rankedLabelValues', group: 'rankedLabelValues', value: '*', label: `Niveau · ${rankedValueCount} sélectionné${rankedValueCount > 1 ? 's' : ''}` });
  }
```

- [ ] **Step 3c: Removal** in `ExplorerActiveFilters.tsx`. Selector (after `setRankedLabelIncludeEquivalents` selector): `const setRankedLabelValueCodes = useExplorerStore((s) => s.setRankedLabelValueCodes);`. Case (after `rankedLabelExact`):
```ts
      case 'rankedLabelValues':
        setRankedLabelValueCodes([]);
        break;
```

- [ ] **Step 4: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/lib/explorer-search-params.test.ts src/components/explorer/explorer-active-chips.test.ts && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 5: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/lib/explorer-search-params.ts bertel-tourism-ui/src/lib/explorer-search-params.test.ts bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts bertel-tourism-ui/src/components/explorer/explorer-active-chips.test.ts bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx && git commit -m "feat(explorer): niveaux classement — URL rankedLabelValues + chip « Niveau · N » + retrait §174"
```

---

## Task 5: Grade bar (interactive level selector)

**Files:**
- Create: `bertel-tourism-ui/src/components/explorer/GradeBar.tsx` + `GradeBar.test.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx`
- Modify: `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consumes: `CLASSEMENT_ICON` (Task 2), `schemeUnit` (Task 2), `references.rankedLabelSchemeValues` (Task 1), `common.rankedLabelValueCodes` + `setRankedLabelValueCodes` (Task 3).
- Produces: `<GradeBar values={ExplorerReferenceOption[]} unit={ClassementUnit} selected={string[]} onChange={(codes:string[])=>void} />`.

- [ ] **Step 1: Write the failing GradeBar test.** `GradeBar.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { GradeBar } from './GradeBar';

const STARS = [
  { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
  { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
];

it('renders one toggle per level with the level name as accessible label', () => {
  render(<GradeBar values={STARS} unit="etoile" selected={['3']} onChange={() => {}} />);
  expect(screen.getByRole('button', { name: '3 étoiles' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '5 étoiles' })).toHaveAttribute('aria-pressed', 'false');
});

it('toggles a level independently on click', () => {
  const onChange = jest.fn();
  render(<GradeBar values={STARS} unit="etoile" selected={['3']} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '5 étoiles' }));
  expect(onChange).toHaveBeenCalledWith(['3', '5']);
  fireEvent.click(screen.getByRole('button', { name: '3 étoiles' }));
  expect(onChange).toHaveBeenCalledWith([]);
});
```

- [ ] **Step 2: Run RED.** `cd bertel-tourism-ui && npx jest src/components/explorer/GradeBar.test.tsx`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `GradeBar.tsx`.** Independent-toggle level bar; numeric levels → icon buttons (the scheme's unit picto), non-numeric (ot_category) → labelled text buttons. Reuses the app icon; house classes `.grade-bar`/`.grade-star`:
```tsx
'use client';
import type { ClassementUnit } from '../../utils/explorer-card-display';
import type { ExplorerReferenceOption } from '../../types/domain';
import { CLASSEMENT_ICON } from './classement-icons';
import { cn } from '@/lib/utils';

interface GradeBarProps {
  values: ExplorerReferenceOption[];
  unit: ClassementUnit;
  selected: string[];
  onChange: (codes: string[]) => void;
}

export function GradeBar({ values, unit, selected, onChange }: GradeBarProps) {
  const Icon = CLASSEMENT_ICON[unit];
  const numeric = values.every((v) => /^\d+$/.test(v.code));
  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };
  return (
    <div className="grade-bar" role="group" aria-label="Niveau de classement">
      {values.map((v) => {
        const on = selected.includes(v.code);
        return (
          <button
            key={v.code}
            type="button"
            aria-label={v.name}
            aria-pressed={on}
            title={v.name}
            onClick={() => toggle(v.code)}
            className={cn(numeric ? 'grade-star' : 'grade-cat', on && 'grade-on')}
          >
            {numeric ? <Icon aria-hidden /> : v.name}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS** in `styles.css`. Match the app's classement star colour — **read the existing `.thumb__rating` rule first** and reuse its colour for `.grade-on` (fallback: a warm/gold tone consistent with the cocarde). Compositor-friendly transform only:
```css
.grade-bar { display: inline-flex; align-items: center; gap: 2px; }
.grade-star { background: none; border: 0; padding: 3px; line-height: 1; color: var(--ink-4); cursor: pointer; transition: transform .14s ease, color .14s ease; }
.grade-star svg { width: 20px; height: 20px; display: block; }
.grade-star:hover { transform: scale(1.25); color: var(--ink-3); }
.grade-star.grade-on { color: var(--rating-star, #e0a100); }
.grade-star:active { transform: scale(.9); }
.grade-cat { border: .5px solid var(--line); background: var(--surface); border-radius: 6px; padding: 3px 8px; font-size: 12px; color: var(--ink-2); cursor: pointer; transition: transform .14s ease; }
.grade-cat.grade-on { border-color: var(--teal); color: var(--teal-2); background: var(--teal-soft); }
```
(If `.thumb__rating` defines a specific colour var, use it for `--rating-star` instead of the literal fallback.)

- [ ] **Step 5: Click-pop micro-interaction.** In `GradeBar.tsx`'s `onClick`, briefly enlarge then settle (transform only), e.g. set `event.currentTarget.style.transform='scale(1.45)'` then clear after 150 ms via `setTimeout`. Keep it minimal; hover/active CSS already gives feedback.

- [ ] **Step 6: Wire into `FiltersPanel.tsx`.** Read the grade values + setter; render `<GradeBar>` between the ranked-label dropdown `</div>` and the §173 equivalents toggle, gated on a graded scheme (values with ≥2 entries):
```tsx
```
Add near the other derived values (after `const rankedLabelOptions = …`):
```ts
  const rankedLabelValues = (rankedLabelSchemeCode && references?.rankedLabelSchemeValues?.[rankedLabelSchemeCode]) || [];
  const setRankedLabelValueCodes = useExplorerStore((state) => state.setRankedLabelValueCodes);
```
Import `GradeBar` + `schemeUnit`. Insert after the dropdown's closing `</div>` (before the equivalents toggle):
```tsx
            {rankedLabelSchemeCode && rankedLabelValues.length >= 2 ? (
              <div>
                <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Niveau</span>
                <GradeBar
                  values={rankedLabelValues}
                  unit={schemeUnit(rankedLabelSchemeCode)}
                  selected={common.rankedLabelValueCodes}
                  onChange={setRankedLabelValueCodes}
                />
              </div>
            ) : null}
```

- [ ] **Step 7: Run GREEN + tsc + FiltersPanel test.** `cd bertel-tourism-ui && npx jest src/components/explorer/GradeBar.test.tsx src/components/explorer/FiltersPanel.test.tsx && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 8: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/GradeBar.tsx bertel-tourism-ui/src/components/explorer/GradeBar.test.tsx bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx bertel-tourism-ui/src/styles.css && git commit -m "feat(explorer): barre de niveaux interactive (étoiles/épis/clés, toggle par niveau, survol/pop) sous le filtre classement §174"
```

---

## Task 6: `buildGradeSections` helper

**Files:**
- Modify: `bertel-tourism-ui/src/utils/explorer-result-sections.ts` (+ test)

**Interfaces:**
- Consumes: `ObjectCard.badges` (`code = 'scheme:value'`).
- Produces: `buildGradeSections(cards, schemeCode, values): ResultSections` (same discriminated union). `ResultSectionGroup.group` widened to `string`.

- [ ] **Step 1: Write the failing test.** Append to `explorer-result-sections.test.ts`:
```ts
import { buildGradeSections } from './explorer-result-sections';

function gcard(id: string, schemeValue?: string): ObjectCard {
  return { id, type: 'HOT', name: id, ...(schemeValue ? { badges: [{ kind: 'official_classification', code: schemeValue, label: id }] } : {}) } as ObjectCard;
}
const VALUES = [
  { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
  { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
];

describe('buildGradeSections', () => {
  it('groups cards by grade, highest first, using the badge scheme:value code', () => {
    const cards = [gcard('a', 'meuble_stars:3'), gcard('b', 'meuble_stars:5'), gcard('c', 'meuble_stars:3')];
    const r = buildGradeSections(cards, 'meuble_stars', VALUES);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups.map((g) => g.label)).toEqual(['5 étoiles', '3 étoiles']);
    expect(r.groups[0].cards.map((c) => c.id)).toEqual(['b']);
    expect(r.groups[1].cards.map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('puts cards without a badge for the scheme in a "Non classé" section last', () => {
    const r = buildGradeSections([gcard('a', 'meuble_stars:5'), gcard('b')], 'meuble_stars', VALUES);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups[r.groups.length - 1].label).toBe('Non classé');
  });
  it('returns flat when no card carries the scheme (defensive)', () => {
    expect(buildGradeSections([gcard('a'), gcard('b')], 'meuble_stars', VALUES).grouped).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED.** `cd bertel-tourism-ui && npx jest src/utils/explorer-result-sections.test.ts -t buildGradeSections`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `explorer-result-sections.ts`: widen `ResultSectionGroup.group` from `'labelled' | 'equivalent'` to `string`, then add:
```ts
const NON_CLASSE = 'Non classé';

/**
 * §174 — groupe les cartes par NIVEAU de classement pour le scheme gradué actif.
 * Le niveau d'une carte = son badge dont le code est `<schemeCode>:<valueCode>`
 * (émis par get_object_cards_batch). Sections triées par grade DÉCROISSANT (5★ d'abord),
 * ordre/libellés depuis `values` (référence). Cartes sans badge du scheme → « Non classé » en fin.
 * Flat si AUCUNE carte ne porte le scheme (défensif — ne devrait pas arriver sous ce filtre).
 */
export function buildGradeSections(cards: ObjectCard[], schemeCode: string, values: ExplorerReferenceOption[]): ResultSections {
  const prefix = `${schemeCode}:`;
  const cardValue = (c: ObjectCard): string | null => {
    const badge = (c.badges ?? []).find((b) => typeof b?.code === 'string' && b.code.startsWith(prefix));
    return badge?.code ? badge.code.slice(prefix.length) : null;
  };
  const byValue = new Map<string, ObjectCard[]>();
  const unranked: ObjectCard[] = [];
  for (const card of cards) {
    const vc = cardValue(card);
    if (vc == null) { unranked.push(card); continue; }
    (byValue.get(vc) ?? byValue.set(vc, []).get(vc)!).push(card);
  }
  if (byValue.size === 0) return { grouped: false, cards };
  const groups: ResultSectionGroup[] = [];
  for (const value of [...values].reverse()) {           // highest grade first
    const group = byValue.get(value.code);
    if (group && group.length > 0) {
      groups.push({ group: `grade:${value.code}`, label: value.name, count: group.length, cards: group });
    }
  }
  if (unranked.length > 0) {
    groups.push({ group: 'grade:__none__', label: NON_CLASSE, count: unranked.length, cards: unranked });
  }
  return { grouped: true, groups };
}
```
(Add `import type { ExplorerReferenceOption } from '../types/domain';` at the top.)

- [ ] **Step 4: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/utils/explorer-result-sections.test.ts && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean (widening `group` to `string` keeps `buildResultSections` compiling).

- [ ] **Step 5: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/utils/explorer-result-sections.ts bertel-tourism-ui/src/utils/explorer-result-sections.test.ts && git commit -m "feat(explorer): buildGradeSections — sections par niveau depuis le badge scheme:value (5★ d'abord, Non classé en fin) §174"
```

---

## Task 7: ExplorerPage plumbing + ResultsList grade sections + collapse

**Files:**
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsList.tsx` (+ `ResultsList.test.tsx`)

**Interfaces:**
- Produces: prop `gradeSection?: { schemeCode: string; values: { code: string; name: string }[] } | null` on both result views; ExplorerPage computes it from the store scheme + `referencesQuery.data`.

- [ ] **Step 1: ExplorerPage** — compute `gradeSection` once and pass to all mounts. Read the active scheme from the store and resolve against references (graded = ≥2 values):
```ts
  const rankedLabelSchemeCode = useExplorerStore((state) => state.common.rankedLabelSchemeCode);
  const gradeSection = useMemo(() => {
    if (!rankedLabelSchemeCode) return null;
    const values = referencesQuery.data?.rankedLabelSchemeValues?.[rankedLabelSchemeCode] ?? [];
    return values.length >= 2 ? { schemeCode: rankedLabelSchemeCode, values } : null;
  }, [rankedLabelSchemeCode, referencesQuery.data]);
```
Pass `gradeSection={gradeSection}` to the mobile `<ResultsList>` (results panel), the desktop `<ResultsList>`, and `<ResultsTableView>`.

- [ ] **Step 2: Write the failing ResultsList test.** In `ResultsList.test.tsx`, add a case: with `gradeSection={{ schemeCode:'meuble_stars', values:[…1..5…] }}` and cards carrying `badges:[{code:'meuble_stars:5'}]` / `meuble_stars:3`, assert two grade headers render ("5 étoiles", "3 étoiles"), 5★ before 3★, and clicking a header collapses its cards (query a card by name, assert removed after clicking the header button).

- [ ] **Step 3: Run RED.** `cd bertel-tourism-ui && npx jest src/components/explorer/ResultsList.test.tsx`. Expected: FAIL.

- [ ] **Step 4: Implement ResultsList.** Add the `gradeSection` prop to `ResultsListProps` + destructure. Import `buildGradeSections`, `ChevronDown` (`lucide-react`), `useState`. Branch the sections compute:
```ts
  const sections = useMemo(
    () => (gradeSection
      ? buildGradeSections(visibleCards, gradeSection.schemeCode, gradeSection.values)
      : buildResultSections(visibleCards, labelRankCounts)),
    [gradeSection, visibleCards, labelRankCounts],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
```
Turn the §173 sticky header `<div>` into a collapse control — same classes, wrapped as a `<button type="button" onClick={() => toggleCollapsed(grp.group)}>` with a `ChevronDown` rotated when collapsed (`className={cn('h-4 w-4 transition', collapsed.has(grp.group) && '-rotate-90')}`), and gate `{grp.cards.map(renderCard)}` behind `{!collapsed.has(grp.group) && grp.cards.map(renderCard)}`. (Keep the exact §173 header classes so grade + rank headers look identical.)

- [ ] **Step 5: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/components/explorer/ResultsList.test.tsx && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 6: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/views/ExplorerPage.tsx bertel-tourism-ui/src/components/explorer/ResultsList.tsx bertel-tourism-ui/src/components/explorer/ResultsList.test.tsx && git commit -m "feat(explorer): vue liste — sections par niveau repliables (gradeSection depuis ExplorerPage) §174"
```

---

## Task 8: ResultsTableView grade sections + collapse

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx` (+ test)

**Interfaces:**
- Consumes: the `gradeSection` prop (Task 7), `buildGradeSections` (Task 6).

- [ ] **Step 1: Write the failing test.** In `ResultsTableView.test.tsx`, add a `gradeSection` case: two grade group rows render (`.results-table__group-row`, or by "5 étoiles"/"3 étoiles" text), 5★ first, and clicking a group row collapses its rows.

- [ ] **Step 2: Run RED.** `cd bertel-tourism-ui && npx jest src/components/explorer/ResultsTableView.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Add `gradeSection` to `ResultsTableViewProps` + destructure. Branch the sections compute:
```ts
  const sections = gradeSection
    ? buildGradeSections(cards, gradeSection.schemeCode, gradeSection.values)
    : buildResultSections(cards, labelRankCounts);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
```
Make the group cell a collapse `<button>` with a `ChevronDown`/`ChevronUp` (already imported), and gate the `...sortCards(grp.cards, tableSort).map(renderRow)` spread behind `!collapsed.has(grp.group)`. Reuse the exact `results-table__group-row`/`__group-cell` primitive.

- [ ] **Step 4: Run GREEN + tsc.** `cd bertel-tourism-ui && npx jest src/components/explorer/ResultsTableView.test.tsx && npx tsc -p tsconfig.app.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 5: Commit.**
```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/ResultsTableView.tsx bertel-tourism-ui/src/components/explorer/ResultsTableView.test.tsx && git commit -m "feat(explorer): vue tableau — lignes de groupe par niveau repliables §174"
```

---

## Task 9: Integration verification + docs

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§174) + auto-memory.

- [ ] **Step 1: Full suite + tsc.** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit && npx jest`. Expected: tsc clean; all suites green except the known parallel-session `settings-nav.test.ts` (document it — not this feature).

- [ ] **Step 2: Preview verification.** Start the dev server; select "Classement hôtelier" (or meublés — demo mock covers meuble_stars/gites_epics); verify: the star bar appears with the scheme's real unit icon, hover enlarges, click toggles gold + pops; results group into collapsible level sections (5★ first) in List and Table; a graded scheme with a level selected filters the set; the "Niveau · N" chip appears in the active-filters strip and removing it clears the levels; a binary label (Clef Verte) shows NO bar and keeps §173 rank sections. (Demo mode carries the mock grades, so this IS observable in preview.)

- [ ] **Step 3: Decision log.** Verify the next § number; append a §174 section documenting: grades from `ref_classification_value`; per-card grade from badge `code`; `classifications_any` (no backend); the star bar (independent toggle, house icons); grade sections mutually exclusive with §173; the deferred Phase B (per-section map toggle). Replace any `§174` placeholder in code comments with the confirmed number if it differs.

- [ ] **Step 4: Memory.** Update `MEMORY.md` + a topic file with the invariants (per-card grade = badge `scheme:value`; grade bar only for schemes with ≥2 values; classifications_any needs no backend; grade sections vs §173 rank sections mutually exclusive).

- [ ] **Step 5: Final commit** (decision log + memory are gitignored/local — no git commit; if CLAUDE.md gained an invariant and is tracked, commit that only).

---

## Self-Review

**Spec coverage:** §3.1 star bar → Tasks 2, 5. §3.2 grade sections → Tasks 6, 7, 8. §4 state/URL/chip → Tasks 3, 4. §5 helper → Task 6 (per-card grade from badge `code`, resolving report-3's unfounded "no per-card grade" concern). §6 render mode selector → Task 7 (ExplorerPage `gradeSection`). §10 house-style → Tasks 2 (shared icons), 5 (`.thumb__rating` colour), 7/8 (§173 headers reused). §9 Phase B map toggle → documented, not built.

**Placeholder scan:** `§174` is confirmed-and-verified in Task 9; no TBDs. The FiltersPanel insertion (Task 5 Step 6) shows the exact JSX + the derived-values/setter additions.

**Type consistency:** `rankedLabelValueCodes` (string[]), `setRankedLabelValueCodes`, `rankedLabelSchemeValues` (Record<string, ExplorerReferenceOption[]>), `classifications_any` ([{scheme_code,value_code}]), `schemeUnit`, `CLASSEMENT_ICON`, `buildGradeSections(cards, schemeCode, values)`, `gradeSection` prop ({schemeCode, values}), chip group `'rankedLabelValues'`, section `group: string` — consistent across Tasks 1–9.

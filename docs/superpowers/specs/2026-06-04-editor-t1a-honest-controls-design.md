# Editor T1a — "Honest controls" write-trap sweep (2026-06-04)

**Status:** IMPLEMENTED 2026-06-04 (branch `feat/editor-t1a-honest-controls` off `master`; logged as §34 in `lot1_mapping_decisions.md`). TDD RED→GREEN; FE suite 362 green; `tsc` clean; push/PR pending.
**Sits in:** §24 P1.2 (editor completion / B2) → §25 remediation **P0** (stop write-traps). Follows §26 (save/status lifecycle), §29 (§15 relations + nested-RPC uuid), §30 (§10 T&H `subvalue_ids`). This is the **first half of T1**; the heavier **T1b** (§16 sub-places persistence via `save_object_places`) is a separate, later tranche.

---

## 1. Goal & invariant

Make every remaining *field-level* editable-looking control in the full-page object editor **honest**, per the CLAUDE.md invariant:

> Any editable control in the object editor MUST either persist on save or be visibly disabled/absent. Never render an enabled, editable field whose changes are silently discarded.

§26/§29/§30 closed the **section-level** traps (§01/§21 status, §15 relations, §18/§19 read-only, §10 T&H coverage). T1a closes the **field-level** leftovers that those passes did not cover, **without adding any new write path** (no new RPC, no migration, no schema change). It is **frontend-only** and ships with the next Coolify UI build — no CI-gate / deploy-integrity overhead.

## 2. Hard guardrail (do NOT regress §10)

**Accessibility editing must stay fully editable and persistent.** T1a must NOT modify `SectionAccessibility.tsx` or `saveObjectWorkspaceDistinctions`. Specifically these stay editable + persisted:
- accessibility **equipment** toggles,
- the **Tourisme & Handicap label** (scheme/value/status/dates),
- the **disability-type chips** → `object_classification.subvalue_ids` (wired in §30 at `object-workspace.ts:3647` via `buildClassificationSubvalueIds`, `object-workspace.ts:822`).

A regression test guards this (see §6).

## 3. Scope — IN

All anchors verified against current `master` (commit `4a96c3f`) this session. Two fixes only: **REMOVE** (delete the control) and **READ-ONLY** (keep displaying the value, make it non-editable).

| # | Control | File:line | Current behavior | Verdict | Fix |
|---|---------|-----------|------------------|---------|-----|
| 1 | §05 ASC "Public & niveau" 4× `TriState` (Familles/Débutants/Groupes/PMR) | `blocks/BlockASC.tsx:155–163` | `onChange={()=>undefined}` — toggles do nothing | REMOVE | Delete the 4 controls + their "Public & niveau accueillis" header (152–154) |
| 2 | §05 ASC `SeasonPicker` "Conditions saisonnières" | `blocks/BlockASC.tsx:176–179` | Fed hardcoded `DEFAULT_SEASON` (line 5); no `onChange` | REMOVE | Delete the picker + header + `DEFAULT_SEASON` const. **Logged as future feature** (§7) |
| 3 | §05 VIS "Public & accessibilité" 4× `TriState` | `blocks/BlockVIS.tsx:143–149` | `onChange={()=>undefined}` | REMOVE | Delete the 4 controls + header |
| 4 | §05 SRV "Communes desservies" static `Chip` set + "+ Commune" | `blocks/BlockSRV.tsx:60–70` (const `COMMUNE_LABELS` 9–18) | Hardcoded chips, `on={false}`, no `onClick`; dead "+ Commune" — looks editable, isn't | REMOVE | Delete the "Zone d'intervention" block (60–70) + `COMMUNE_LABELS`. Real authoring → **T1b** (`object_zone` via `save_object_places`) |
| 5 | §07 capacity-row `unit` Input | `SectionCapacity.tsx:126` | Enabled `<Input … onChange={(unit)=>update(...)}>` → marks `capacity-policies` dirty, but saver (`object-workspace.ts:3710`) omits `unit` → silently dropped | READ-ONLY | `readOnly` Input (mirror `BlockASC.tsx:97–98`). Unit is metric-derived (trigger from `ref_capacity_metric`); column header "Unité" already labels it |
| 6 | §09 per-tag `label` Input | `SectionTags.tsx:154` | Enabled `<Input … onChange={(label)=>updateTag(...)}>` → marks `tags` dirty, but saver (`object-workspace.ts:3867`, comment 3871) deliberately omits label (would diverge from `ref_tag.name`) | REMOVE (editable input) | Delete the `<Input>`; the colored chip at `:151–153` already displays the label. Keep the color `Select` (`:156`) editable |

**Net behavioral effect:** #1–#4 are pure visual removals (no module data flow — they were no-op/static). #5–#6 *reduce* false-dirty (the editor will no longer mark a module dirty over a value it cannot save). No module loses any genuinely-saved field.

## 4. Scope — OUT

- **§16 / `SectionPlaces`** (sub-places persistence + the ITI stage-kind `onChange={()=>undefined}` at `SectionPlaces.tsx:144`) → **T1b**. T1a does not touch `SectionPlaces.tsx`.
- **§10 disability-types persistence** → already done (§30). Excluded + guarded (§2).
- Reference enrichment (T2), coverage gaps / T1b (T3), coherence-polish (T4).
- No backend, no SQL, no migration, no RPC, no new primitive props.

## 5. Approach

- **Removals (#1–#4):** delete the JSX controls, their now-orphaned section headers, and dead consts (`DEFAULT_SEASON`, `COMMUNE_LABELS`). Remove the now-unused primitive imports (`TriState`, `SeasonPicker` from BlockASC; `TriState` from BlockVIS; `Field` from BlockSRV) — verified by `tsc` (unused import = error).
- **Read-only (#5):** `Input` already supports `readOnly` (used at `BlockASC.tsx:97`). No primitive change.
- **Remove editable input (#6):** delete the `<Input>`; the label remains visible via the existing chip. Clean up the `Input` import if it becomes unused (verified by `tsc`).
- **No `Select.disabled` / `ChipMultiSelect.disabled`** needed — the only inert `Select` left (ITI stage-kind) is in `SectionPlaces` = T1b, and §10's `ChipMultiSelect` stays enabled.

## 6. Testing (TDD — RED → GREEN)

Per affected section, a spec asserting the invariant directly:
- **BlockASC / BlockVIS:** the removed `TriState`/`SeasonPicker` controls no longer render (query by their labels returns nothing); the *kept* controls (toggles, pricing rows, schedule) still mark their module dirty.
- **BlockSRV:** no "Communes desservies" / "+ Commune" chips render; prestations + langues chips still toggle and mark `characteristics` dirty.
- **§07 SectionCapacity:** the unit field renders **read-only** (has `readonly` attribute); a user edit attempt does **not** mark `capacity-policies` dirty; value (`value`) + dates still do.
- **§09 SectionTags:** no editable label `<Input>` renders; the label still displays; editing the color `Select` still marks `tags` dirty.
- **§10 regression guard (the guardrail):** keep `SectionAccessibility.test.tsx` green — toggling a disability-type chip marks `distinctions` dirty and lands in `disabilityTypesCovered` (existing assertions at `:20–22`). Add, if not present, an explicit assertion that the equipment toggle + T&H label remain editable.

Update any section fixture/snapshot tests that asserted the removed controls' presence.

## 7. Deferred features logged (remove-but-remember)

1. **Object seasonality profile** (the removed `SeasonPicker`). Genuine feature, not cleanup. Model: normalized `object_season_month (object_id, month 1–12, intensity_id → ref_code_season_type)`, **reuse the existing `ref_code_season_type` vocabulary**; scope ASC/VIS. NOT derivable from opening hours (open ≠ peak season). Existing `object_price.season_code` / `promotion.season_id` are pricing/promo-scoped and don't cover it. → its own spec→plan→impl after T1. *(Already in the local `.claude/WORKFLOW.md` tracker; will be added to `lot1_mapping_decisions.md`.)*
2. **Object audience / clientèle suitability** (the removed ASC/VIS `TriState`s: Familles, Scolaires, Débutants, Groupes, PMR, Malentendants). A real "public cible" concept, currently fabricated. Model TBD (likely a `ref_clientele`-backed multi-select); scope ASC/VIS. → candidate future feature.
3. **Communes desservies / zone d'intervention** maps to `object_zone`, already handled by `save_object_places`. This belongs to **T1b** (zone authoring), not a separate feature — T1a only removes the misleading static chips.

## 8. Verification criteria

- `npm run typecheck` clean (catches the dead imports).
- `npm run test:run` green (≥ the current §30 baseline of 349, plus the new T1a specs; no suite removed).
- Manual smoke on the deployed build: open ASC / VIS / SRV editors — no phantom toggles, capacity unit read-only, tag label non-editable, **accessibility still fully editable + saving**.
- Frontend-only ⇒ no DB / CI-gate / migration. No deploy-integrity step.

## 9. Risks & edge cases

- **Fixture/snapshot tests** asserting the removed controls → update them (expected, part of the change).
- **Brand-new capacity row** shows an empty read-only unit until first save (the `ref_capacity_metric` trigger fills it on persist). Acceptable; optionally source the unit from the selected metric option (nice-to-have, not required for T1a).
- **Do not** touch `SectionAccessibility.tsx` / `saveObjectWorkspaceDistinctions` / `SectionPlaces.tsx` (guardrail + T1b boundary).
- Removals are layout-only for #1–#4; confirm no CSS/grid depended on the deleted nodes (visual check).

## 10. References

- §25 editor shell audit (`docs/superpowers/specs/2026-06-03-editor-shell-audit.md`) — P0 backlog (note: its §10 entry is now stale — closed by §30).
- §30 (`lot1_mapping_decisions.md`) — §10 `subvalue_ids` wiring (the guardrail).
- CLAUDE.md → "Editor — no silent write-traps".

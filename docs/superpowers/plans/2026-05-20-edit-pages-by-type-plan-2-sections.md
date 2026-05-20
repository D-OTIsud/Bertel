# Edit Pages by Type — Plan 2: Sections & Type Blocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining 13 universal editor sections and the 6 archetype-specific type blocks (section 05), all wired to existing workspace modules, and render the complete 22-section editor.

**Architecture:** Every section follows the pattern proven in Plan 1 (`src/features/object-editor/sections/SectionContacts.tsx`): a component `({ editor, permissions }: SectionProps)` that renders one `Fs` card, reads its `editor.draft.<module>` slice, and writes through `editor.replaceModule` / `editor.patchModule`. Type blocks are slotted at section 05 by archetype. No backend changes — the 4 unbacked sections (09 Tags, 11 Sustainability, 18 Fournisseur, 20 Distribution) are Plan 4.

**Tech Stack:** Next.js 16, React 19, TypeScript, Jest + Testing Library.

**Depends on:** Plan 1 (foundation) — merged. **Reference template:** `SectionContacts.tsx`, `SectionLocation.tsx`, `SectionDescriptions.tsx` (the established section pattern); the prototype `edit-primitives.jsx`, `edit-extensions.jsx`, `edit-classification.jsx`, `edit-type-blocks.jsx` in `Bertel.zip`. **Module shapes:** consult `src/services/object-workspace-parser.ts` for every module's exact field names before wiring.

**Conventions:** TDD per the Plan 1 pattern — one render test per section asserting it mounts with fixture data and that an edit flips `dirtySections`. Complex sub-logic (pricing rows, opening periods) gets its own pure helper + unit test. Commit per task. All commands from `bertel-tourism-ui/`.

---

## File Structure

New files under `src/features/object-editor/sections/`:

| File | Module bound | Notes |
|---|---|---|
| `SectionMedia.tsx` | `media` | Photo tiles + document repeater; cover flag. |
| `SectionCapacity.tsx` | `capacityPolicies` | Capacity metrics repeater + group/pet policy. |
| `SectionClassification.tsx` | `distinctions` | Scheme rows: value, status, dates, reference. KPI strip. |
| `SectionAccessibility.tsx` | `distinctions` + `characteristics` | Accessibility labels + amenity families. |
| `SectionPayLangs.tsx` | `characteristics` | Payment chips + language chips. |
| `SectionPricing.tsx` | `pricing` | Price-item repeater; period + audience selects. |
| `SectionOpenings.tsx` | `openings` | Period repeater + exceptional closures. |
| `SectionRelations.tsx` | `relationships` | Outgoing/incoming related-object lists. |
| `SectionPlaces.tsx` | `descriptions` + `itinerary` | ITI/VIS only — sub-lieux / stages. |
| `SectionAttachments.tsx` | `relationships` + `memberships` | Org/actor links + memberships. |
| `SectionCrm.tsx` | `providerFollowUp` | Interaction log (read-only module). |
| `SectionPublication.tsx` | `publication` + `generalInfo` | Status, visibility, lifecycle. |
| `SectionSync.tsx` | `syncIdentifiers` | External identifier rows (read-only module). |
| `blocks/BlockHEB.tsx` | `rooms` + `meetingRooms` | Rooms table + amenities + policies + MICE. |
| `blocks/BlockRES.tsx` | `menus` | Cuisine + menus PDF + week schedule. |
| `blocks/BlockASC.tsx` | `activity` | Formulas + operator/guide + season. |
| `blocks/BlockITI.tsx` | `itinerary` | GPX + KPIs + waypoints + season. |
| `blocks/BlockVIS.tsx` | `characteristics` + `openings` | Visit modes + tariffs + seasonal schedule. |
| `blocks/BlockSRV.tsx` | `characteristics` | Prestations + intervention zone + counter hours. |
| `blocks/index.ts` | — | `TYPE_BLOCKS: Record<ArchetypeCode, ComponentType<SectionProps>>`. |
| `sections/index.ts` | — | Barrel export of all section components. |

New reusable primitives under `src/features/object-editor/primitives/`:

| File | Purpose |
|---|---|
| `ScheduleEditor.tsx` | Week schedule grid (RES/VIS/SRV) — day rows × two slots. |
| `SeasonPicker.tsx` | 12-month three-state picker (ASC/ITI). |
| `TriState.tsx` | Yes / Conditional / No row (audience). |

Modified:

| File | Change |
|---|---|
| `src/features/object-editor/object-editor.css` | Append the section/block CSS from the prototype (`.media-grid`, `.sched`, `.season-picker`, `.class-kpi`, `.aud-row`, `.slider`, `.wp-num`, `.chan-row`, `.sync-row` …), all scoped under `.object-editor`. |
| `src/features/object-editor/ObjectEditPage.tsx` | Render the full ordered section list via a registry; add scroll-spy + Rapide/Complet folding. |
| `src/features/object-editor/section-config.ts` | Add a `component` reference (or a separate registry) mapping each section number to its component. |

---

## Task 1: Extend the editor CSS with section & block styles

**Files:** Modify `src/features/object-editor/object-editor.css`.

- [ ] **Step 1:** Append, scoped under `.object-editor`, the prototype `edit-types.css` rules not ported in Plan 1: `.media-grid`, `.media-tile*`, `.dropzone`, `.map-shell`, `.map-mini`, `.sched*`, `.season-picker`, `.season-legend`, `.slider*`, `.aud-row`, `.tri`, `.wp-rep`, `.wp-num`, `.chan-row*`, `.sync-row*`, `.class-kpi*`, `.class-row*`, `.kv`, `.provider-grid`, `.chip-group__label` (if not already present). Preserve the prototype values; keep the `.object-editor ` prefix on every selector.
- [ ] **Step 2:** Verify `next build` still succeeds (run at Task end / Task 16). No unit test — CSS.
- [ ] **Step 3:** Commit — `feat(ui): extend object-editor css with section and block styles`.

---

## Tasks 2–14: Universal sections

Each task creates one `SectionXxx.tsx` + `SectionXxx.test.tsx`. **Follow the Plan 1 pattern exactly** (`SectionContacts.tsx` for repeaters, `SectionLocation.tsx` for nested-field patch, `SectionDescriptions.tsx` for lang tabs). Each task's steps are:

1. Write the failing render test (fixture modules cast `as unknown as ObjectWorkspaceModules`, always include `generalInfo` — `getDirtySections` requires it; mount via `renderHook(useObjectEditorState)` then `render(<Section .../>)`; assert a known value renders; assert one edit flips `dirtySections.<module>`).
2. Run the test — verify it fails (module not found).
3. Implement the section per the spec row below.
4. Run the test — verify it passes.
5. Commit — `feat(ui): add SectionXxx to the full-page editor`.

| Task | Section | `Fs num` | Module | What it renders |
|---|---|---|---|---|
| 2 | `SectionMedia` | 06 | `media` | `objectItems` photo grid (cover star, alt text), document repeater. `addObjectMediaItem`/`removeObjectMediaItem`/`patchObjectMediaItem` logic — port from `ObjectDrawerShell` (those functions exist there; move the reusable parts into the section). |
| 3 | `SectionCapacity` | 07 | `capacityPolicies` | `capacityItems` repeater (metric Select from `metricOptions`, value Input), `groupPolicy` + `petPolicy` forms via `Toggle`/`Input`. |
| 4 | `SectionClassification` | 08 | `distinctions` | KPI strip (granted/pending/expired counts), `distinctionGroups` → row per scheme: value Input, status Select, awarded/validUntil dates, reference. |
| 5 | `SectionAccessibility` | 10 | `distinctions` + `characteristics` | `accessibilityLabels` + `accessibilityAmenityCoverage`; amenity family chip-sets filtered to the accessibility family of `characteristics.amenityGroups`. |
| 6 | `SectionPayLangs` | 12 | `characteristics` | Payment chips (`paymentOptions` + `selectedPaymentCodes`), language chips (`languageOptions` + `selectedLanguages`), environment chips. Chip toggles add/remove the code. |
| 7 | `SectionPricing` | 13 | `pricing` | `priceItems` repeater: label, amount, unit Select (`unitOptions`-style), kind Select. Pull a `pricing-row.ts` pure helper for add/update/remove + unit-test it. |
| 8 | `SectionOpenings` | 14 | `openings` | Period repeater (name, date range, day pattern, tag). Reuse existing opening-period display helpers from `features/object-drawer/utils.ts` where they fit; keep editing in the section. |
| 9 | `SectionRelations` | 15 | `relationships` | `relatedObjects` — outgoing (editable role Select + target) and incoming (read-only list). |
| 10 | `SectionPlaces` | 16 | `descriptions.places` + `itinerary` | ITI/VIS only — render `null` for other archetypes. Sub-lieu rows: name, description `Textarea`, accessibility Select. |
| 11 | `SectionAttachments` | 17 | `relationships` + `memberships` | Publisher org link, partner org/actor links, membership chips (`campaignOptions`). |
| 12 | `SectionCrm` | 19 | `providerFollowUp` | Interaction log — **read-only module** (`READONLY_MODULES`); render the log, no editing in this plan. |
| 13 | `SectionPublication` | 21 | `publication` + `generalInfo` | Status Select, commercial visibility, lifecycle dates. Visibility writes `generalInfo.commercialVisibility` (mirror `ObjectDrawerShell.patchPublicationSettings`). |
| 14 | `SectionSync` | 22 | `syncIdentifiers` | External identifier rows — **read-only module**; render only. |

**Notes for the implementer:**
- Read-only modules (`SectionCrm`, `SectionSync`) render their data but call no updater — `getDirtySections` already treats them as never dirty.
- `SectionPublication`'s visibility patch goes through `generalInfo`, not a `publication` module write — `publication` itself is largely server-managed.
- For media/contacts-style add/remove, lift the array logic into a small pure helper (e.g. `media-items.ts`) with a unit test, mirroring `descriptions-field.ts`.

---

## Task 15: Type blocks (section 05)

**Files:** Create `blocks/BlockHEB.tsx`, `BlockRES.tsx`, `BlockASC.tsx`, `BlockITI.tsx`, `BlockVIS.tsx`, `BlockSRV.tsx`, `blocks/index.ts`, and one `blocks/blocks.test.tsx`.

Each block is a `({ editor, permissions }: SectionProps)` component rendering an `Fs num="05"` card. Port the prototype's `edit-type-blocks.jsx` (`BlockHEB`…`BlockSRV`) faithfully, replacing mock data with the real module:

- [ ] **Step 1:** Build `ScheduleEditor`, `SeasonPicker`, `TriState` primitives (Task file structure) + a render test for each.
- [ ] **Step 2:** `BlockHEB` — `rooms.items` table (type, sleeps, surface, units, low/high price) + amenities chip-sets + check-in/out policies + `meetingRooms.items` MICE table. Wired to `rooms` and `meetingRooms`.
- [ ] **Step 3:** `BlockRES` — cuisine chips + couverts/ticket stats + `menus` PDF repeater + `ScheduleEditor` for service hours.
- [ ] **Step 4:** `BlockASC` — `activity` sub-type + object_act fields (duration, participants, age, guide/equipment toggles) + formula repeater + `SeasonPicker` + `TriState` audience rows.
- [ ] **Step 5:** `BlockITI` — `itinerary` GPX dropzone + KPI `StatCard`s (distance, elevation, duration) + waypoint repeater (`itinerary.stages`) + `SeasonPicker`.
- [ ] **Step 6:** `BlockVIS` — visit-mode `Toggle`s + tariff repeater + `ScheduleEditor` (seasonal) + `TriState` audience.
- [ ] **Step 7:** `BlockSRV` — prestation repeater + intervention-zone commune chips + counter-language chips + `ScheduleEditor`.
- [ ] **Step 8:** `blocks/index.ts` — `export const TYPE_BLOCKS: Record<ArchetypeCode, ComponentType<SectionProps>>`.
- [ ] **Step 9:** Run `blocks.test.tsx` (one mount test per block with fixture data) — verify pass.
- [ ] **Step 10:** Commit — `feat(ui): add the six archetype type blocks for editor section 05`.

---

## Task 16: Render the full section list + integrate

**Files:** Modify `ObjectEditPage.tsx`, `section-config.ts`; create `sections/section-registry.tsx`.

- [ ] **Step 1:** Write a failing test: `section-registry.test.tsx` asserts the registry returns 21 components for HEB and 22 for ITI (matching `makeSections`).
- [ ] **Step 2:** Create `section-registry.tsx` — maps each section `num` to its component; section 05 resolves through `TYPE_BLOCKS[archetype]`.
- [ ] **Step 3:** Update `ObjectEditPage` `EditorReady` to render the ordered section list from `makeSections(meta.archetype)` via the registry (replacing the hard-coded four).
- [ ] **Step 4:** Implement scroll-spy: an `IntersectionObserver` over the `#section-NN` anchors updates `activeNum`.
- [ ] **Step 5:** Implement Rapide/Complet folding: in `rapide` mode, `Fs` cards whose `num` is not in `MODE_ESSENTIAL` (`['01','02','03','04','05','13','14','21']`) render folded. Thread `mode` to the section list.
- [ ] **Step 6:** Run `npx jest src/features/object-editor`, `npm run typecheck`, `npm run build` — all green.
- [ ] **Step 7:** Commit — `feat(ui): render the full 22-section editor with scroll-spy and quick mode`.

---

## Self-Review

**Spec coverage:** sections 06–17, 19, 21, 22 — Tasks 2–14. ✓ · Type block 05 (6 archetypes) — Task 15. ✓ · Full section render + scroll-spy + Rapide/Complet — Task 16. ✓ · Section/block CSS — Task 1. ✓ · Sections 09/11/18/20 correctly deferred to Plan 4. ✓ · Cross-cutting widgets correctly deferred to Plan 3. ✓

**Placeholder scan:** Tasks 2–14 are specified by a table row each rather than full code — acceptable: the section pattern is fully implemented and committed in Plan 1 (`SectionContacts.tsx` et al.), which the executor reads as the template; each row pins the module, `Fs num`, and content. Complex logic (pricing rows, media items) is explicitly pulled into tested helpers.

**Type consistency:** every section consumes `SectionProps` (Plan 1, `section-types.ts`); `TYPE_BLOCKS` is keyed by `ArchetypeCode` (Plan 1, `archetypes.ts`); the registry consumes `makeSections` output (Plan 1, `section-config.ts`).

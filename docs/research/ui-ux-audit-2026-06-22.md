# Bertel — Full UI/UX Audit (2026-06-22)

Method: five independent assessments (Explorer · Object editor · Public drawer · Dashboard/CRM/Team/secondary · cross-cutting a11y & design-system), each scored against Nielsen's 10 heuristics and the impeccable product-register design laws, then synthesised. Read-only; no files were changed. The brief: account for the **full object surfaces by type** (HEB/RES/ASC/ITI/VIS/SRV/FMA + ORG, 19 DB types → 7 archetypes).

> Caveat: static code read only. No live browser/screen-reader pass was run; contrast ratios are computed from token hex; the P0 "whole-surface crash on query error" and focus-ring gaps would be worth confirming in a browser pass.

---

## 1. Scorecard

### Design health (Nielsen /40, per surface)

| Surface | Score | Band | Strongest / weakest heuristic |
|---|---|---|---|
| Object editor (`/objects/[id]/edit`) | **28/40** | Good | Error recovery strong; aesthetic/help weak |
| Public drawer (`ObjectDetailView`) | **26/40** | Acceptable | Scroll-spy nav strong; one-template-for-all types weak |
| Explorer (`/explorer`) | **22/40** | Acceptable | URL-state + map camera strong; error recovery (P0) weak |
| Dashboard / CRM / Team / secondary | **19/40** | Poor | RGPD page strong; consistency + help are the floor |
| **Weighted overall** | **≈24/40** | **Acceptable — good bones, real debt** | |

### Technical audit (impeccable /20)

| Dimension | Score | Key finding |
|---|---|---|
| Accessibility (WCAG 2.2 AA) | 1/4 | No `:focus-visible` outside the sidebar; muted text fails 4.5:1; reduced-motion covers 3/35 sites |
| Performance | 2/4 | Render-blocking Google Fonts `@import`; `background-attachment:fixed` on a 4-layer gradient repaints on scroll |
| Responsive | 2/4 | No mobile layout for the editor; 31 ad-hoc breakpoints; 40px touch targets |
| Theming | 1/4 | 5 parallel token families, duplicate tokens, ~234 hard-coded hex; light-only |
| Anti-patterns | 2/4 | Side-stripe KPI borders, hero-metric grid, color-by-hash, bounce easing |
| **Total** | **8/20** | **POOR (foundation pass needed)** |

### Anti-pattern verdict: would someone say "AI made this"?

**Partly — and it splits cleanly by tier.** The *core* surfaces (the 22-section editor design system, the drawer scaffold + scroll-spy, the MapLibre camera-ownership logic, XSS-safe markdown) are thoughtful, committed, and do **not** read as generated. The *secondary* tier (dashboard, CRM, the stub pages) carries most of the slop tells, concentrated and obvious:

- The 6-up identical-card **hero-metric grid** (`ScorecardStrip.tsx:20-66`).
- **Side-stripe accent borders** (banned): `styles.css:8826` (KPI 4px), `9456`, `9543`; `object-editor.css:2623/2627`; `block-notes.tsx:50`.
- **Color-by-hash** decorative tinting of avatars/tags (`crm-view-utils.ts:17-31`).
- **Fabricated data presented as real**: "Score Bertel /100" (`SectionSustainability.tsx:44`), interpolated itinerary stages/distances (`ObjectDetailView.tsx:2883-2905`).
- **Forever-"bientôt disponible"** controls: Sort (`ResultsList.tsx:114`), Envoyer (`SelectionBar.tsx:150`).
- **Two design systems** (custom-CSS vs Tailwind/shadcn) and **unaccented French** in the custom-CSS surfaces ("Connexion a la plateforme", "Gravite"), plus pervasive **em dashes** in placeholders.

Verdict: a competent, opinionated product with a slop-prone secondary tier and a real accessibility/foundation debt.

---

## 2. The object-type story (the brief's centre of gravity)

### 2a. Two taxonomies that disagree

There are **two different 7-way groupings of the same 19 types**, and they don't match:

| DB type | Editor/Drawer **archetype** (`archetypes.ts`) | Explorer **bucket** (`facets.ts:24-32`) | Mismatch |
|---|---|---|---|
| LOI | VIS (site/visit) | **ACT** (Activités) | ❌ |
| ASC | ASC (activity) | **SRV** (Services) | ❌ |
| VIL | SRV (service) | **VIS** (Visites) | ❌ |
| ACT | ASC | ACT | label drift |
| FMA | FMA | EVT | label drift |
| PRD | VIS | VIS | ✓ |

A user filtering "Activités" in the Explorer gets `ACT + LOI` (a leisure *site*), while a supervised activity (`ASC`) is hidden under "Services". The same record is filed under one heading when you discover it and a different one when you edit it. **Fix: one canonical type→family table, shared by Explorer/editor/drawer.** This is the root consistency defect behind most of the per-type problems below.

### 2b. Per-type coverage matrix (across the three surfaces)

| Type | Explorer card | Editor (§06 block) | Public drawer |
|---|---|---|---|
| **HEB** (HOT/HPA/HLO/CAMP/RVA) | capacity shown — the reference | Strongest; §07 fused into §06 | Best-served (rooms/MICE/policy) but check-in/out scavenged from hours text |
| **RES** | nothing restaurant-specific | Cleanest block (cuisine/menu/carte) | **No menu / cuisine / dietary block at all** (P0) |
| **ASC/ACT** | split across two buckets; ACT env-tag filter has **no UI** | dual-bound clobber fields (`BlockASC.tsx:42/135`) | identical to generic; `object_act` never surfaced (P0) |
| **ITI** | rich filters exist, **card shows none** of them | most feature-rich (GPX + stages) | **stages & elevation fabricated** (`:2883`) |
| **VIS** (LOI/PCU/PNA/PRD) | LOI mis-bucketed; **PRD invisible** | thin block | 6 clone views, nothing type-specific |
| **SRV** (PSV/VIL/COM/SPU) | catch-all, no sub-filter, indistinguishable | minimal block | falls to Generic; a town (VIL) shows a "capacity" KPI (wrong) |
| **FMA** (event) | no date filter; card can't show dates; open-dot meaningless | solid block (dates/recurrence) | **Not presented — no dates anywhere** (P0) |
| **ORG** | excluded (correct) | explicit unsupported panel (correct) | n/a |

The pattern: **authoring is broadly type-aware; discovery and presentation are not.** The editor knows an event has dates and a restaurant has a menu; the card and the drawer largely flatten every type into one template, and even fabricate data (ITI stages) to fill the template.

### 2c. The drawer is six copy-paste clones

`ObjectDetailView.tsx` (3588 lines) routes to six near-identical `*DetailView` functions (`:3294-3558`) that differ by ~one section each. Adding a section means editing it in six places → guaranteed drift, and it's why "Tarifs (0)" tabs appear on types that have no prices. **Fix: one config-driven `DetailView` reading an `ARCHETYPE_SECTIONS[archetype]` table** (which also feeds the tab list from a single source), plus the genuinely missing blocks (FMA dates, RES menu, ASC activity).

---

## 3. Systemic findings (high confidence — multiple assessments agreed)

| # | Finding | Severity | Evidence |
|---|---|---|---|
| S1 | **No `:focus-visible`** on the primary `.btn`/`.ghost-button`/nav/chip families (only the sidebar has it). 12 `outline:none` sites, half with no replacement. | P0 a11y | `object-editor.css:993`, `styles.css:656`, sidebar OK `:10517` |
| S2 | **Codes shown as human labels** (Type: HOT, role codes, scheme codes) despite label maps existing. | P0 recognition | `ActiveFilterStrip.tsx:35`, `ActualisationTable.tsx:66`, `MembersTable.tsx:32`, `crm-primitives.tsx:80` |
| S3 | **Two design systems** (custom-CSS vs Tailwind/shadcn). Team/RGPD look like another product. Accent split tracks the system split. | P0 consistency | `TeamAdminPage` + `features/team/*` vs `panel-card`/`chip`/`btn` |
| S4 | **Bare loading/empty states; none teach** and none distinguish "no data" from "filtered to empty". | P1 help | `WidgetFrame.tsx:34/55`, CRM lists, `ResultsList`, drawer empties |
| S5 | **Render-blocking fonts + fixed-gradient repaint.** Google Fonts `@import` line 1; `background-attachment:fixed` on a 4-layer radial mesh. | P0/P1 perf | `styles.css:1`, `:105-111` |
| S6 | **Token sprawl**: ≥5 parallel families, exact-duplicate tokens (`--orange-soft`=`--accent-soft`), two radius/shadow scales, ~234 hard-coded hex. | P1 theming | `styles.css:7-87` |
| S7 | **Contrast failures**: `--text-muted #66767d` ≈4.44:1, `--ink-3` ≈4.27:1, `--ink-4 #94a1a8` ≈2.97:1 — all on white, all used for labels/subtitles. | P1 a11y | `styles.css:27/70/71` |
| S8 | **Reduced-motion covers 3/35 sites**; bounce easing on markers; `transition:all` ×6. | P1/P3 motion | `styles.css:6778`, scattered |
| S9 | **Hero-metric grid + identical card widgets** with no inter-widget hierarchy. | P1 anti-pattern | `ScorecardStrip.tsx`, dashboard widgets |
| S10 | **Whole-surface crash on a single query error** (Explorer replaces everything with a raw error string; drawer load-error is terminal, no retry). | P0 error recovery | `ExplorerPage.tsx:61-67`, `ObjectDrawerShell.tsx:147` |
| S11 | **No responsive editor**; FiltersPanel/tables don't reflow; 40px touch targets. | P1 responsive | `object-editor.css` (no `.edit-body` media query), `Sidebar` 40px |
| S12 | **Dead-end / fake affordances**: disabled-forever Sort/Envoyer; drawer "Modifier"/"Voir versions" on a view-only surface; inert link-styled `<span>`s. | P2 control/freedom | `ResultsList.tsx:114`, `ObjectDetailView.tsx:1222/2686` |

Stale doc note: the README claim that audits/moderation/publications "silently render empty" is **wrong** — they render complete demo UIs; in non-demo they show a hero over an empty list with inert buttons (reads as broken). Re-describe as "demo-only".

---

## 4. Priority issues (ranked, with the surface they live on)

**P0**
1. Global focus-visible + remove unreplaced `outline:none` (S1) — one CSS rule fixes keyboard a11y app-wide.
2. One canonical type→family taxonomy shared by Explorer/editor/drawer (§2a).
3. Type-correct drawer: add `EventDetailView` (FMA dates), `RestaurantDetailView` (menu/cuisine), activity block; make it config-driven (§2c).
4. Single code→FR-label resolver threaded through every chip/table/tag (S2).
5. Unify the design system (port Team/RGPD onto the custom-CSS panel/btn/chip vocabulary, or commit to one) (S3).
6. Error recovery: inline error + Retry, keep last-good data (S10).
7. Fonts: `next/font/google`, drop the `@import`; fix the fixed-gradient repaint (S5).

**P1**
8. Type-aware Explorer result card (archetype metadata slot) (§2b).
9. Active-filter bar with per-filter removal + searchable city/sub-type filters (Explorer recall).
10. Teaching empty-state component with `no-data` vs `filtered` modes, used everywhere incl. stub pages (S4).
11. Replace the 6-up scorecard with a hierarchy-bearing summary band + a by-type breakdown strip (S9).
12. Contrast: raise `--text-muted`→`#5c6a71`, retire `--ink-4` from text; consolidate duplicate tokens (S6/S7).
13. Global `prefers-reduced-motion` guard; replace bounce easing with ease-out-expo (S8).
14. Editor: make **Enregistrer** the primary CTA, **Publier** a distinct deliberate action (`EditorTopbar.tsx:120-140`).
15. Progressive disclosure for §07 Capacity and §16 Places (`SectionCapacity.tsx`, `SectionPlaces.tsx`).
16. Responsive editor + reflowing filters/tables; 44px touch targets (S11).

**P2/P3**
17. Remove dead-end/fake controls; wire or delete inert link-spans (S12).
18. Fix `BlockASC` dual-bound fields (clobber) and `BlockVIS` dual-source amenity toggles.
19. Contiguous, label-led editor nav with keyboard roving; move disabled reasons out of `title`.
20. Delete the 5 dead `Object*Panel.tsx` + `workspace-ui.tsx`; split the 3588-line drawer.
21. Replace `window.confirm` with the themed `ConfirmDialog`; add pending state to async toggles.
22. Remove debug runtime text from the public login page (`LoginPage.tsx:156`).
23. Accent French + drop em dashes across the custom-CSS surfaces; swap §22 emoji buttons for lucide.

---

## 5. Persona red flags

**Amélie — OTI editor, power user, daily.** 22-section form with no visible focus ring → can't tab-navigate by sight. Codes-as-labels force recall. `FilterDropdown` is keyboard-dead. No saved Explorer views. The save bar makes **Publier** the primary button, so she risks publishing when she meant to save a draft.

**Jordan — occasional/new agent, first-timer.** 64px icon-only sidebar with no labels until hover. Bare "Aucun X" empties teach nothing. Stub pages look broken (hero over an empty list, live-looking dead buttons). Team feels like a different app (design-system split). Login shows `Supabase URL: …` debug text.

**Maël — on-site, tablet.** Editor has no responsive layout (3-col fixed grid). The 1268-line FiltersPanel and dense tables don't reflow. 40px touch targets. The fixed 4-layer gradient janks on scroll on mid-range hardware.

---

## 6. What's working (keep and replicate)

- The editor's shared design system (`Fs`/`Field`/`Input`/`Repeater`) — high cohesion, and the project's "persist-or-disabled-with-reason" invariant **holds** (no silent write-traps found).
- Coordinated blocker UX (nav dots + IssuesRail + save-bar chip + `BlockersModal` grouped by section), and modal-as-first-thought correctly *avoided*.
- Map camera-ownership + hover-intent logic (`MapPanel.tsx`).
- Skeletons that mirror real layout (`ResultsListSkeleton`, drawer skeletons).
- XSS-safe markdown (`MarkdownContent` — `disableParsingRawHTML`, scheme allowlist).
- Radix dialogs/sheets (correct focus trap/aria), `lang="fr"`, `.sr-only` infra, the sidebar's correct ARIA — the model the rest of the app should follow.
- The RGPD erasure page — the best-designed surface in the app.

---

## 7. Recommended sequencing (foundation → type-aware → polish)

1. **Foundation pass** (1 PR, high leverage, low risk): global `:focus-visible`, `prefers-reduced-motion` guard, `next/font/google`, fixed-gradient repaint fix, contrast token bump, token de-duplication. → impeccable audit 8/20 should jump to ~14/20.
2. **One taxonomy + code→label resolver** (1 PR): unify the type families, thread the label map. Removes a whole class of recognition/consistency defects.
3. **Type-aware discovery & presentation** (the brief): type-aware result card → config-driven drawer (FMA/RES/ASC blocks) → align Explorer filters to the unified taxonomy.
4. **Empty-state component + design-system unification** (Team/RGPD onto the house vocabulary; stub pages honest).
5. **Editor polish**: save-bar re-rank, §07/§16 disclosure, responsive, nav.

Wireframes for items in steps 1, 3, 4 accompany this audit (rendered in-session).

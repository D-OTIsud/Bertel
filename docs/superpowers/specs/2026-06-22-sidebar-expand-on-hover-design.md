# Sidebar expand-on-hover (overlay, CSS-only) — design

Date: 2026-06-22
Status: Approved (design); implementation pending
Scope: `bertel-tourism-ui` global app sidebar only

## Goal

Upgrade the existing global app sidebar from a fixed icon-only rail into a panel
that **expands on hover to reveal labels** with a smooth animation — adapted to
Bertel's own visual language (warm teal/orange light theme, lucide icons), not a
copy of the reference Aceternity component's neutral/dark look.

Inspiration: the Aceternity UI animated sidebar (expand-on-hover, labels slide in).
We keep the *interaction*, not its stack (`motion`, `@tabler/icons-react`, dark mode).

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Interaction | **Hover → overlay**. The panel floats *over* the workspace; page content never reflows. |
| Animation | **Pure CSS transitions**. No new dependency (no `motion`/framer-motion). |
| Mobile/touch | **Desktop-first**. On touch/small screens, today's behavior (icon rail) is kept. No mobile drawer. |
| Row content | **Label only** per row (no captions). |
| Code structure | **Upgrade `Sidebar.tsx` in place** (Approach A). No new `Sidebar`/`SidebarBody`/`SidebarLink` primitives. |
| Expanded width | **280px**, matching the existing `rail` Tailwind spacing token. Exposed as `--sidebar-w-expanded: 280px`. |
| Styles location | Appended to `src/styles.css` near the existing `.app-shell` rules. |

## Non-goals

- No mobile hamburger/drawer.
- No change to nav data (`allItems`), routes, role gating, or `onOpenProfile` wiring.
- No change to the object-editor section nav (`EditorNav`).
- No new dependency; no dark mode (app is `color-scheme: light`).
- No new reusable primitive set (can be extracted later if a second consumer appears).

## Layout mechanics — the "no reflow" guarantee

`.app-shell` is a CSS grid:

```
grid-template-columns: var(--sidebar-w) minmax(0, 1fr);   /* styles.css:5913 */
```

The sidebar occupies grid track 1 (`--sidebar-w` = 64px). That track width is left
**unchanged**, so the workspace (track 2) never moves.

- The `<aside>` becomes the 64px shell: `position: relative`, fixed 64px width.
- An inner panel `.app-sidebar__panel` is `position: absolute` (top/bottom/left:0),
  width `64px` at rest, growing to `var(--sidebar-w-expanded)` (280px) on
  `:hover` / `:focus-within`. It **overflows rightward over the workspace**.
- The panel uses an **opaque** surface (`--surface` = #fff) + `shadow-m` when
  expanded so workspace content underneath does not bleed through.

## Component changes (single file: `Sidebar.tsx`)

All existing logic stays: `allItems`, role filtering, `isActivePath`,
`canAdministerTeam`, `initialsFromName`, `onOpenProfile`, theme/session store reads.

Markup edits:

1. `<aside>` → 64px relative shell wrapping `.app-sidebar__panel` (the expanding surface).
2. Each nav item → a flex **row**: a fixed 38px icon box + a label `<span>`.
   - The label `<span>` is **always rendered in the DOM** (collapsed via width/opacity,
     never `display:none`). This is an accessibility *upgrade* over today's
     icon-only + `title` rail.
3. Active state → the teal pill spans the **whole row** when expanded and collapses
   back to the 38px icon square at rest, using the same element (CSS-driven).
4. Brand row → logo square + brand name beside it (name fades in on expand).
5. Bottom group → help + notifications get labels; profile becomes a row
   (avatar + name/role), fading in on expand. The notifications dot is preserved.
6. Active link gets `aria-current="page"`. Existing `aria-label`/`title` retained
   for the collapsed state.

## Animation

In `src/styles.css`, next to `.app-shell`:

- `.app-sidebar__panel { transition: width 200ms cubic-bezier(0.16, 1, 0.3, 1); }`
- Labels / brand name / profile text: `opacity` + `transform: translateX(-6px → 0)`,
  ~150ms, with a small delay so they appear just after the widen begins.
- New token: `--sidebar-w-expanded: 280px` (matches the `rail` spacing token).
- `@media (prefers-reduced-motion: reduce)` → transitions disabled (instant
  expand/collapse, no slide).

Only compositor-/cheap properties animate (`width` is not compositor-friendly, but
it is on a single small element with no layout dependents, since the grid track is
fixed; acceptable and matches the reference). Labels animate `opacity`/`transform`.

## Theming

Bertel tokens only:

- Surface: `--surface` (#fff), border `--line`, elevation `shadow-m`.
- Active: `--teal` (#176b6a) bg + white text (matches today).
- Idle text: `--ink-3` (#6a7a82); hover text `--ink`; hover bg `--surface-2`.
- Accent (profile avatar): `--accent-brand` → `--accent-brand-strong` gradient (unchanged).
- Fonts: Sora (display) / Manrope (sans), as already configured.

## z-index / overlay correctness

- `.app-shell__viewport` is z-index:2; the expanded panel must sit **above** workspace
  content but **below** drawers/modals (ProfileDrawer, ObjectDrawer, Radix dialogs live
  in the 60–200 band per `styles.css`).
- Target the panel at **~40**; the exact value is verified during implementation against
  the actual drawer/dialog z-index values so a sidebar hover never covers an open drawer.
- The object-editor route hides the TopBar but keeps the sidebar; the panel simply peeks
  over the editor's left edge — acceptable (hover-only, dismisses on mouse-out).

## Accessibility

- `:focus-within` triggers expansion, so keyboard tab-through reveals labels (not just
  pointer hover).
- Labels are real text nodes (improvement over `title`-only).
- `aria-current="page"` on the active item.
- Focus order unchanged; the overlay only widens — it does not trap focus or reorder DOM.
- `prefers-reduced-motion` honored.
- Contrast: ink-on-white and white-on-teal both pass; unchanged from today.

## Testing

Add `src/components/layout/Sidebar.test.tsx` (none exists today). Cover the behavioral
surface jsdom can observe:

- Renders role-filtered items **with their label text** for a given role.
- `/team` item shown only when `canAdministerTeam` is true.
- Active route item carries `aria-current="page"`.
- Clicking the profile button calls `onOpenProfile`.
- Settings link present.

The hover/width expansion is CSS and not unit-testable in jsdom; it is verified visually
in the preview (rail at rest, panel overlay on hover, no content reflow) and noted as such.

## Verification plan

1. `tsc` clean, lint clean.
2. New `Sidebar.test.tsx` green; full FE suite green.
3. Preview: confirm at-rest 64px rail, hover overlay to 280px, **workspace does not move**,
   labels fade in, active pill behaves in both states, keyboard focus expands the panel,
   reduced-motion disables animation, drawers still render above the sidebar.

## Files touched

- `bertel-tourism-ui/src/components/layout/Sidebar.tsx` (markup; logic unchanged)
- `bertel-tourism-ui/src/styles.css` (new `--sidebar-w-expanded` + `.app-sidebar__panel` rules near `.app-shell`)
- `bertel-tourism-ui/src/components/layout/Sidebar.test.tsx` (new)

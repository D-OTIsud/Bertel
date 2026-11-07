# Sidebar expand-on-hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the global app sidebar from a fixed 64px icon rail into a panel that expands on hover/keyboard-focus to reveal labels, overlaying the workspace (no reflow), using pure CSS in Bertel's own palette.

**Architecture:** The `.app-shell` CSS grid keeps the sidebar track at `var(--sidebar-w)` (64px) so the workspace never moves. Inside the `<aside>` (now `position: relative`, 64px), an absolutely-positioned `.app-sidebar__panel` grows `64px → 280px` on `:hover`/`:focus-within`, floating over the workspace with `shadow-m`. Each nav row gains an always-in-DOM label span that fades/slides in. Logic in `Sidebar.tsx` (role filtering, active path, team gating, profile open) is unchanged — only the markup and styling change.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Tailwind 3.4 + global `src/styles.css`, lucide-react icons, Zustand stores, Jest 29 + React Testing Library.

## Global Constraints

- No new dependency (no `motion`/framer-motion, no `@tabler/icons-react`).
- Pure CSS transitions only; honor `prefers-reduced-motion`.
- Desktop-first: do not add a mobile drawer; do not touch `.app-shell` responsive media queries.
- Label-only rows (no captions).
- In-place upgrade of `bertel-tourism-ui/src/components/layout/Sidebar.tsx`; no new `Sidebar`/`SidebarBody`/`SidebarLink` primitives.
- Expanded width = **280px**, exposed as CSS var `--sidebar-w-expanded: 280px` (matches the existing `rail: 280px` Tailwind spacing token).
- New CSS lives in `bertel-tourism-ui/src/styles.css`.
- Bertel design tokens only: `--surface`, `--teal`, `--ink`/`--ink-3`, `--line`, `--surface-2`, `--accent-brand`/`--accent-brand-strong`, `--shadow-m`, Sora/Manrope. No dark mode (app is `color-scheme: light`).
- Active item carries `aria-current="page"`.
- Sidebar panel `z-index: 40` — above `.app-shell__viewport` (z-index:2), below drawers/dialogs (Radix Sheet/Dialog portal to body at z ≥ 50).
- No change to nav data (`allItems`), routes, role gating, or `onOpenProfile` wiring. Editor nav (`EditorNav`) untouched.

---

### Task 1: Expand-on-hover sidebar (test + markup + styles)

This is a single coherent deliverable: the behavioral test, the markup refactor, and the CSS are interdependent (shared class names) and reviewed together.

**Files:**
- Create: `bertel-tourism-ui/src/components/layout/Sidebar.test.tsx`
- Modify (replace return markup; keep all logic): `bertel-tourism-ui/src/components/layout/Sidebar.tsx`
- Modify (append CSS block at end of file): `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consumes (unchanged): `Sidebar({ onOpenProfile }: { onOpenProfile: () => void })`; `useSessionStore` fields `role`, `adminRank`, `demoMode`, `userName`; `useThemeStore` `theme.brandName`, `theme.logoUrl`; `usePathname()`; `canAdministerTeam`; `isActivePath`; `initialsFromName`.
- Produces: same `Sidebar` export and props (no API change). New DOM contract: each nav item is a `<Link>`/`<button>` with class `app-sidebar__item`, an icon in `.app-sidebar__iconbox`, and a visible `<span class="app-sidebar__label">{label}</span>`; active items add `app-sidebar__item--active` + `aria-current="page"`.

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/components/layout/Sidebar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';

let mockPathname = '/explorer';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

beforeEach(() => {
  mockPathname = '/explorer';
  useSessionStore.setState({
    role: 'super_admin',
    adminRank: null,
    demoMode: true,
    userName: 'D. Philippe',
  } as never);
  useThemeStore.setState({
    theme: { ...useThemeStore.getState().theme, brandName: 'Bertel', logoUrl: null },
  } as never);
});

describe('Sidebar', () => {
  it('renders nav items with their visible labels for the role', () => {
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('CRM')).toBeInTheDocument();
  });

  it('marks the active route item with aria-current="page"', () => {
    mockPathname = '/dashboard';
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Explorer/i })).not.toHaveAttribute('aria-current');
  });

  it('shows the Équipe item for a team administrator', () => {
    useSessionStore.setState({ role: 'super_admin' } as never);
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByText('Équipe')).toBeInTheDocument();
  });

  it('hides the Équipe item for a non-admin role', () => {
    useSessionStore.setState({ role: 'tourism_agent', adminRank: null } as never);
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.queryByText('Équipe')).not.toBeInTheDocument();
  });

  it('calls onOpenProfile when the profile button is clicked', () => {
    const onOpenProfile = jest.fn();
    render(<Sidebar onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByRole('button', { name: /Profil/i }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('renders the settings link', () => {
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/layout/Sidebar.test.tsx`
Expected: FAIL — e.g. the first test throws `Unable to find an element with the text: Explorer` (today's rail renders icons only, no label text), and the `aria-current` test fails (attribute not set today).

- [ ] **Step 3: Replace the markup in `Sidebar.tsx` (keep all logic)**

In `bertel-tourism-ui/src/components/layout/Sidebar.tsx`, leave the imports, `allItems`, `isActivePath`, `initialsFromName`, the `SidebarProps` interface, and the entire hooks block (`pathname`, `role`, `adminRank`, `demoMode`, `userName`, `brandName`, `logoUrl`, `items`, `teamVisible`, `navItems`, `userLabel`, `initials`) exactly as they are. Add one derived label just before the `return`, then replace the whole `return ( ... )` block:

```tsx
  const settingsLabel = allItems.find((item) => item.to === '/settings')?.label ?? 'Parametres';

  return (
    <aside className="app-sidebar" aria-label="Navigation principale">
      <div className="app-sidebar__panel">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__logo">
            {logoUrl ? <img src={logoUrl} alt={brandName} /> : brandName.slice(0, 1)}
          </span>
          <span className="app-sidebar__label app-sidebar__brand-name">{brandName}</span>
        </div>

        <nav className="app-sidebar__nav" aria-label="Modules">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn('app-sidebar__item', active && 'app-sidebar__item--active')}
              >
                <span className="app-sidebar__iconbox">
                  <Icon className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="app-sidebar__label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar__divider" />

        <Link
          href="/settings"
          title="Parametres"
          aria-current={isActivePath(pathname, '/settings') ? 'page' : undefined}
          className={cn('app-sidebar__item', isActivePath(pathname, '/settings') && 'app-sidebar__item--active')}
        >
          <span className="app-sidebar__iconbox">
            <Settings2 className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
          </span>
          <span className="app-sidebar__label">{settingsLabel}</span>
        </Link>

        <div className="app-sidebar__footer">
          <button type="button" className="app-sidebar__item" aria-label="Aide" title="Aide">
            <span className="app-sidebar__iconbox">
              <CircleHelp className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="app-sidebar__label">Aide</span>
          </button>
          <button type="button" className="app-sidebar__item" aria-label="Notifications" title="Notifications">
            <span className="app-sidebar__iconbox">
              <Bell className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
              <span className="app-sidebar__dot" aria-hidden />
            </span>
            <span className="app-sidebar__label">Notifications</span>
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            className="app-sidebar__profile"
            aria-label={`Profil ${userLabel}`}
            title={userLabel}
          >
            <span className="app-sidebar__avatarbox">
              <span className="app-sidebar__avatar">{initials}</span>
            </span>
            <span className="app-sidebar__label app-sidebar__profile-name">{userLabel}</span>
          </button>
        </div>
      </div>
    </aside>
  );
```

Note: the imports already include `Link`, `Settings2`, `Bell`, `CircleHelp`, and the lucide icons used by `allItems`; no import changes are needed. The unused-after-refactor classes/inline styles are removed by replacing the return block.

- [ ] **Step 4: Append the CSS block at the END of `bertel-tourism-ui/src/styles.css`**

```css
/* ============================================================
   App sidebar — expand-on-hover overlay (§ sidebar redesign 2026-06-22)
   Rail stays 64px in the .app-shell grid track (no reflow);
   the panel grows to --sidebar-w-expanded on hover/focus-within
   and floats over the workspace.
   ============================================================ */
:root {
  --sidebar-w-expanded: 280px; /* matches the `rail` spacing token */
}

.app-sidebar {
  position: relative;
  width: var(--sidebar-w);
  height: 100%;
  z-index: 40; /* above .app-shell__viewport (2); below drawers/dialogs (>=50) */
}

.app-sidebar__panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 14px 12px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  overflow: hidden;
  transition: width 200ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 200ms ease,
              border-radius 200ms ease;
}

.app-sidebar__panel:hover,
.app-sidebar__panel:focus-within {
  width: var(--sidebar-w-expanded);
  box-shadow: var(--shadow-m);
  border-radius: 0 14px 14px 0;
}

.app-sidebar__brand {
  display: flex;
  align-items: center;
  height: 40px;
  margin-bottom: 10px;
}

.app-sidebar__logo {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: var(--surface-2);
  overflow: hidden;
  color: var(--teal);
  font-family: 'Sora', system-ui, sans-serif;
  font-weight: 700;
  font-size: 15px;
}
.app-sidebar__logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 6px;
}

.app-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-sidebar__item {
  display: flex;
  align-items: center;
  height: 40px;
  border-radius: 11px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
  transition: background-color 150ms ease, color 150ms ease;
}
.app-sidebar__item:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.app-sidebar__item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}
.app-sidebar__item--active,
.app-sidebar__item--active:hover {
  background: var(--teal);
  color: #fff;
}

.app-sidebar__iconbox {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.app-sidebar__icon {
  width: 18px;
  height: 18px;
}

.app-sidebar__dot {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-brand);
}

.app-sidebar__label {
  opacity: 0;
  transform: translateX(-6px);
  transition: opacity 150ms ease, transform 150ms ease;
  font-family: 'Manrope', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
}
.app-sidebar__panel:hover .app-sidebar__label,
.app-sidebar__panel:focus-within .app-sidebar__label {
  opacity: 1;
  transform: translateX(0);
  transition-delay: 60ms;
}

.app-sidebar__divider {
  height: 1px;
  background: var(--line);
  margin: 8px;
}

.app-sidebar__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-sidebar__profile {
  display: flex;
  align-items: center;
  height: 44px;
  border-radius: 11px;
  background: transparent;
  border: 0;
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  color: var(--ink);
  transition: background-color 150ms ease;
}
.app-sidebar__profile:hover {
  background: var(--surface-2);
}
.app-sidebar__profile:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}
.app-sidebar__avatarbox {
  width: 40px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.app-sidebar__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-brand), var(--accent-brand-strong));
  color: #fff;
  display: grid;
  place-items: center;
  font-family: 'Sora', system-ui, sans-serif;
  font-weight: 700;
  font-size: 13px;
}
.app-sidebar__profile-name {
  color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar__panel,
  .app-sidebar__label,
  .app-sidebar__item,
  .app-sidebar__profile {
    transition: none;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/components/layout/Sidebar.test.tsx`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Type-check and run the full FE suite**

Run: `cd bertel-tourism-ui && npx tsc --noEmit && npm run test:run`
Expected: tsc exits 0; the full Jest suite stays green (no regressions).

- [ ] **Step 7: Confirm the drawer z-index assumption**

Run: `cd bertel-tourism-ui && npx grep -rn "z-\[\|z-50\|z-index" src/components/ui/sheet.tsx src/components/ui/dialog.tsx 2>/dev/null; grep -rn "z-50\|z-\[" src/components/layout/ProfileDrawer.tsx src/components/editor/ObjectDrawer.tsx`
Expected: the Sheet/Dialog/drawer overlays sit at z ≥ 50 (Radix/shadcn default). If any drawer overlay is ≤ 40, lower `.app-sidebar { z-index }` to one below that layer and re-run Step 6. (Default expectation: no change needed.)

- [ ] **Step 8: Visual verification in the preview**

Start the dev server (`preview_start`), open the app, and confirm:
1. At rest: a 64px white icon rail (looks like today).
2. On hover: the panel slides out to 280px, floats over the workspace with a soft shadow, and the grey content/map/editor **does not move**.
3. Labels fade/slide in; the active item shows a full-width teal pill expanded and a teal square at rest.
4. Keyboard: Tab into the nav — `:focus-within` expands the panel; focus ring visible on items.
5. Open a drawer/dialog (e.g. the profile drawer) — it renders above the sidebar.
6. With OS "reduce motion" on, expand/collapse is instant (no slide).

Capture a screenshot of the rest and hover states as proof.

- [ ] **Step 9: Commit (own hunks only)**

```bash
git -C "C:/Users/dphil/Bertel3.0" add \
  "bertel-tourism-ui/src/components/layout/Sidebar.tsx" \
  "bertel-tourism-ui/src/components/layout/Sidebar.test.tsx" \
  "bertel-tourism-ui/src/styles.css"
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(layout): expand-on-hover sidebar (overlay, CSS-only)" -- \
  "bertel-tourism-ui/src/components/layout/Sidebar.tsx" \
  "bertel-tourism-ui/src/components/layout/Sidebar.test.tsx" \
  "bertel-tourism-ui/src/styles.css"
```

(Per workflow: commit own hunks only; the user pushes. `styles.css` is co-edited by the PO — stage it by explicit path and verify `git diff --cached` contains only the appended sidebar block before committing.)

---

## Self-Review

**Spec coverage:** Every spec section maps to Task 1 — layout mechanics (CSS `.app-sidebar`/`__panel` over the fixed grid track), component changes (markup refactor, labels in DOM, active pill), animation (CSS transitions + reduced-motion), theming (Bertel tokens only), z-index/overlay (z:40 + Step 7 check), accessibility (`aria-current`, `:focus-within`, focus ring, real label text), testing (Step 1 test), verification plan (Steps 5–8). Non-goals are respected: no deps, no mobile drawer, no nav-data/route change, EditorNav untouched.

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output.

**Type/name consistency:** Class names are consistent between the markup (Step 3) and CSS (Step 4): `app-sidebar`, `app-sidebar__panel`, `__brand`, `__logo`, `__nav`, `__item`, `__item--active`, `__iconbox`, `__icon`, `__dot`, `__label`, `__brand-name`, `__divider`, `__footer`, `__profile`, `__avatarbox`, `__avatar`, `__profile-name`. The test (Step 1) queries by accessible role/text only, so it does not depend on class names. `Sidebar` props and store fields are unchanged.

**One risk noted honestly:** `width` is not a compositor-friendly property, but here it animates on a single small element whose grid track is fixed (no dependent reflow), so it is acceptable and matches the reference interaction. Labels animate `opacity`/`transform` only.

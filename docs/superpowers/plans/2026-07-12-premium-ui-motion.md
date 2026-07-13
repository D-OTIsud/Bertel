# Premium UI Motion & Micro-Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `bertel-tourism-ui` a consistent motion system — tokenized timing/easing, animated modal/drawer/status transitions, tactile button feedback, localized save/publish confirmation next to the initiating control, and real loading skeletons everywhere a blank region can currently appear — using CSS transitions + small React presence helpers, no new dependency.

**Architecture:** One shared token/keyframe layer in `styles.css` (Task 1) underpins everything else. A new `usePresence` hook (Task 4) gives the house `Modal` component (Task 5) and two always-mounted banners (Task 21) a real exit phase instead of instant `if (!open) return null`. The Radix `Sheet` wrapper already has Presence machinery built in — only its `cva` durations change (Task 7). Skeletons reuse the existing `.drawer-skeleton` shimmer primitive instead of inventing a second one (Task 8). Buttons have **no single shared component** — three independent CSS families (`.primary-button`/`.ghost-button`, `.crm-btn`, `.object-editor .btn`) plus one `cva` component (`components/ui/button.tsx`) — each gets the press treatment individually (Task 14).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 3.4 + global `src/styles.css`, Radix UI (`@radix-ui/react-dialog` via `components/ui/sheet.tsx`), `class-variance-authority`, `tailwindcss-animate`, `lucide-react`, Zustand, TanStack Query, `sonner` (toasts), Jest 29 + React Testing Library.

## Global Constraints

- No new runtime dependency (no framer-motion/`motion`, no animation library).
- Pure CSS transitions/keyframes + small React hooks only.
- Reuse `bertel-tourism-ui/src/hooks/useMediaQuery.ts` (`useMediaQuery('(prefers-reduced-motion: reduce)')`) for reduced-motion detection in JS — do not hand-roll a second `matchMedia` subscription.
- Reuse the existing `.drawer-skeleton` shimmer primitive (`styles.css:2672-2777`, `@keyframes drawer-skeleton-shimmer`) for every new skeleton — do not introduce a second shimmer mechanism.
- The global `@media (prefers-reduced-motion: reduce)` guard already exists at `styles.css:206-216` (forces `transition-duration`/`animation-duration` to `.01ms`). Keep it. New per-class reduced-motion overrides are **additional**, colocated near each new rule block — this file already has 5 such component-scoped reduced-motion blocks (lines 2027, 3384, 3536, 8360, 12456); follow that convention, one block per new feature, not one giant block.
- New CSS custom properties go in the **one** existing `:root` block at `styles.css:9-130` (do not add a 3rd `:root` fragment; there's already a second one at line ~12209 for `--sidebar-w-expanded` only — leave it alone).
- `Modal`'s prop change (`onClose` → `open`+`onOpenChange`) is a breaking internal API change. Every caller must migrate in the **same task** — never leave a caller on the old signature after the interface changes.
- Do not touch `CrmModal.tsx`/`CrmInteractionModal.tsx`/`CrmActorModals.tsx`/`CrmTaskModal.tsx` — those are a separate, CRM-scoped modal family, not `components/common/Modal.tsx`.
- Do not touch the Explorer's mobile bottom-sheet (`ExplorerPage.tsx` `<Sheet side="bottom">`) beyond the shared `sheet.tsx` timing change that all 4 Sheet callers inherit automatically — there is no separate "Explorer filters" Sheet (filters are a plain, non-Sheet component).
- ExplorerViewSwitch sliding indicator must be computed from measured `DOMRect`s via a `ref`, not a fixed `25%`-per-slot CSS rule — button widths are icon-padding-derived, not guaranteed equal by contract even though they currently are.
- `.view-switch`/`.view-switch__btn` CSS is shared between `ExplorerViewSwitch` (4 icon buttons) and `MapPanel`'s 2-option layer picker. The sliding indicator is opt-in via a new modifier class (`.view-switch--indicator`) so `MapPanel` is unaffected.
- Do not animate `width`, `height`, `top`, `left` anywhere new. Only `opacity`, `transform`, `background-color`, `color`, `border-color`, `box-shadow` in new transitions.
- All new UI copy is French, matching the existing app convention (see `EditorTopbar.tsx`, `WidgetFrame.tsx` for tone/register).
- Keep existing tests green; update a test file only when its own component's behavior deliberately changes (e.g. `Modal.test.tsx`), never as a side effect of an unrelated change.
- Run `graphify update .` after implementation (Task 24).

---

## Package 1 — Motion foundations

### Task 1: Motion design tokens + shared keyframes/utility classes

**Files:**
- Modify: `bertel-tourism-ui/src/styles.css` (`:root` block, lines 9-130; reduced-motion guard area, lines 206-216)

**Interfaces:**
- Produces: CSS custom properties `--motion-instant`, `--motion-fast`, `--motion-base`, `--motion-surface`, `--motion-exit`, `--ease-premium-out`, `--ease-premium-in`, `--motion-distance-sm`, `--motion-distance-md`; utility classes `.motion-page-enter`, `.motion-status-enter`, `.motion-pop`, `.motion-content-reveal`, `.motion-success`, `.motion-spin`. Every later task in this plan consumes these — do this task first.

- [ ] **Step 1: Add the motion tokens to the existing `:root` block**

In `bertel-tourism-ui/src/styles.css`, insert right before the closing `}` of the `:root` block (currently ends at line 130, right after `--orange-soft: var(--accent-soft);   /* audit S6 : doublon exact de --accent-soft, aliasé */`):

```css
  /* Motion foundations (premium UI motion pass) — one timing/easing system for
     modals, drawers, status banners, button feedback, and skeleton reveals. */
  --motion-instant: 90ms;
  --motion-fast: 160ms;
  --motion-base: 220ms;
  --motion-surface: 280ms;
  --motion-exit: 180ms;
  --ease-premium-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-premium-in: cubic-bezier(0.4, 0, 1, 1);
  --motion-distance-sm: 4px;
  --motion-distance-md: 10px;
}
```

(The trailing `}` replaces the existing one that closes `:root` — you're adding lines just above it, not duplicating the brace.)

- [ ] **Step 2: Add the shared keyframes/utility classes after the global reduced-motion guard**

Insert this new block immediately after the existing guard (after line 216's closing `}`, before `/* Pastille de type ... */` / `.type-pill` at line 218):

```css
/* Motion primitives (premium UI motion pass) — shared entrance/exit/feedback
   animations. Consumed by RouteMotion, status banners, chips/badges, and the
   editor's success pulse. `usePresence`-driven exits use the sibling
   `[data-motion-phase]` selectors defined next to each consumer (Modal,
   OfflineBanner, PeerSavedBanner) rather than a generic exit class here,
   since each surface's exit transform differs (fade vs. slide vs. scale). */
.motion-page-enter {
  animation: motion-page-enter-keyframes var(--motion-base) var(--ease-premium-out) both;
}
@keyframes motion-page-enter-keyframes {
  from { opacity: 0; transform: translateY(var(--motion-distance-sm)); }
  to { opacity: 1; transform: translateY(0); }
}

.motion-status-enter {
  animation: motion-status-enter-keyframes var(--motion-fast) var(--ease-premium-out) both;
}
@keyframes motion-status-enter-keyframes {
  from { opacity: 0; transform: translateY(var(--motion-distance-md)); }
  to { opacity: 1; transform: translateY(0); }
}

.motion-pop {
  animation: motion-pop-keyframes var(--motion-fast) var(--ease-premium-out) both;
}
@keyframes motion-pop-keyframes {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

.motion-content-reveal {
  animation: motion-content-reveal-keyframes var(--motion-base) var(--ease-premium-out) both;
}
@keyframes motion-content-reveal-keyframes {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* One restrained pulse — no bounce, no color change (color is carried by the
   caller's own success icon/text, e.g. EditorTopbar's check icon). */
.motion-success {
  animation: motion-success-keyframes var(--motion-base) var(--ease-premium-out);
}
@keyframes motion-success-keyframes {
  0% { transform: scale(1); }
  40% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.motion-spin {
  animation: motion-spin-keyframes 0.9s linear infinite;
}
@keyframes motion-spin-keyframes {
  to { transform: rotate(360deg); }
}

/* D1 (writing-plans spec): transforms/animations must be REMOVED under
   reduced motion, not merely shortened by the blanket .01ms duration above —
   a translateY/scale animation at .01ms still paints one transformed frame.
   Spinners/shimmer stop too (matches the manual QA acceptance criterion). */
@media (prefers-reduced-motion: reduce) {
  .motion-page-enter,
  .motion-status-enter,
  .motion-pop,
  .motion-content-reveal,
  .motion-success,
  .motion-spin {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 3: Verify — no automated test covers global CSS; confirm manually**

Run: `cd bertel-tourism-ui && npx tsc --noEmit --pretty false` (CSS-only change, this just confirms the edit didn't accidentally break a co-located file). Then visually confirm in the browser preview (Task 24 covers the full visual QA pass) that no existing element regressed — this task adds classes nothing consumes yet, so nothing should visually change.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): add shared motion tokens, keyframes, and reduced-motion overrides"
```

### Task 2: Explicit-property transitions on the shared `Button` primitive + press state

**Files:**
- Modify: `bertel-tourism-ui/src/components/ui/button.tsx`
- Test: `bertel-tourism-ui/src/components/ui/button.test.tsx` (new)

**Interfaces:**
- Consumes: `--motion-fast` (Task 1).
- Produces: same `Button` export/props (no API change) — only the base `cva` class string changes.

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('does not use transition-all and lists explicit transition properties', () => {
    render(<Button>Go</Button>);
    const className = screen.getByRole('button', { name: 'Go' }).className;
    expect(className).not.toMatch(/\btransition-all\b/);
    expect(className).toMatch(/transition-\[transform,background-color,color,border-color,box-shadow,opacity\]/);
  });

  it('scales down on active press without affecting layout', () => {
    render(<Button>Go</Button>);
    const className = screen.getByRole('button', { name: 'Go' }).className;
    expect(className).toMatch(/active:scale-\[0\.98\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/ui/button.test.tsx`
Expected: FAIL (current class string is `... transition-all duration-200 ...` with no `active:scale` utility).

- [ ] **Step 3: Replace `transition-all` with explicit properties and add the press state**

In `bertel-tourism-ui/src/components/ui/button.tsx`, the base class string (line 7) currently includes `transition-all duration-200` among the focus-ring/layout classes. Replace `transition-all duration-200` with:

```
transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-200 active:scale-[0.98] active:duration-[var(--motion-instant)] disabled:active:scale-100 aria-disabled:active:scale-100
```

(Tailwind arbitrary-value duration `duration-[var(--motion-instant)]` reads the CSS custom property from Task 1; `disabled:active:scale-100` and `aria-disabled:active:scale-100` keep disabled controls from visually moving on press, per the spec's tactile-feedback requirement.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/components/ui/button.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/components/ui/button.tsx bertel-tourism-ui/src/components/ui/button.test.tsx
git commit -m "feat(motion): scope Button's transition-all to explicit properties, add press state"
```

### Task 3: Scope remaining `transition-all`/`transition: all` usages (CreateObjectDialog, ListComposeView, CRM buttons)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx` (lines 236, 302)
- Modify: `bertel-tourism-ui/src/views/ListComposeView.tsx` (line 548)
- Modify: `bertel-tourism-ui/src/styles.css` (CRM `.crm-btn` family + 5 sibling `transition: all` rules — lines ~10489, 10537, 10689, 10776, 11135, 11596)

**Interfaces:**
- Consumes: `--motion-fast` (Task 1). No component prop/interface changes — CSS-only.

- [ ] **Step 1: `CreateObjectDialog.tsx` — replace both `transition-all` usages**

At line 236 (type-picker option row), replace:
```
transition-all duration-150 will-change-transform
```
with:
```
transition-[transform,background-color,border-color,box-shadow] duration-150 will-change-transform active:scale-[0.98]
```

At line 302 (submit button), replace:
```
transition-all duration-150 hover:-translate-y-px hover:shadow-md
```
with:
```
transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md active:scale-[0.98] active:translate-y-0
```

- [ ] **Step 2: `ListComposeView.tsx` — replace the toggle-knob `transition-all`**

At line 548, replace:
```
absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all
```
with:
```
absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform
```
(This knob only ever animates its `translate-x` position via a sibling Tailwind class already present on the same element per its toggle state — `transition-transform` is the only property that actually changes here; `transition-all` was accidentally broad.)

- [ ] **Step 3: `styles.css` — scope the 6 CRM `transition: all` rules to explicit properties**

Each of the 6 occurrences (`.crm-btn` and its siblings, at the approximate lines noted above) currently reads `transition: all 0.12s ease;` (or a close variant). Replace each with:
```css
transition: transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, color 0.12s ease;
```
Locate each occurrence with: `grep -n "transition: all" bertel-tourism-ui/src/styles.css` — confirm exactly 6 matches before and 0 after.

- [ ] **Step 4: Add press-state to `.crm-btn`**

In the same `.crm-btn` rule block, add:
```css
.crm-app .crm-btn:active { transform: scale(0.98); }
.crm-app .crm-btn:disabled:active,
.crm-app .crm-btn[aria-disabled='true']:active { transform: none; }
```

- [ ] **Step 5: Verify no `transition-all`/`transition: all` remains outside the button primitive's replaced form**

Run: `cd bertel-tourism-ui && grep -rn "transition-all" src/ ; grep -n "transition: all" src/styles.css`
Expected: zero matches (the `Button` component's Task 2 replacement already removed the one Tailwind-utility instance; this task removes the rest).

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx bertel-tourism-ui/src/views/ListComposeView.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): scope remaining transition-all usages to explicit properties + CRM button press state"
```

---

## Package 2 — Modal & Sheet presence

### Task 4: `usePresence` hook

**Files:**
- Create: `bertel-tourism-ui/src/hooks/usePresence.ts`
- Test: `bertel-tourism-ui/src/hooks/usePresence.test.ts`

**Interfaces:**
- Consumes: `useMediaQuery` (`bertel-tourism-ui/src/hooks/useMediaQuery.ts`, existing).
- Produces: `usePresence(visible: boolean, exitDurationMs: number): { shouldRender: boolean; phase: 'entering' | 'open' | 'exiting' }`. Consumed by Task 5 (`Modal`), Task 21 (`OfflineBanner`, `PeerSavedBanner`).

- [ ] **Step 1: Write the failing tests**

Create `bertel-tourism-ui/src/hooks/usePresence.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { usePresence } from './usePresence';

jest.mock('./useMediaQuery', () => ({ useMediaQuery: jest.fn(() => false) }));
import { useMediaQuery } from './useMediaQuery';

beforeEach(() => {
  jest.useFakeTimers();
  (useMediaQuery as jest.Mock).mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('usePresence', () => {
  it('mounts immediately as "entering" then moves to "open" on the next frame', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: false },
    });
    expect(result.current.shouldRender).toBe(false);

    rerender({ visible: true });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe('entering');

    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.phase).toBe('open');
  });

  it('stays mounted as "exiting" for exitDurationMs then unmounts', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: true },
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.phase).toBe('open');

    rerender({ visible: false });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe('exiting');

    act(() => {
      jest.advanceTimersByTime(179);
    });
    expect(result.current.shouldRender).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.shouldRender).toBe(false);
  });

  it('cancels a stale exit timer on rapid close/reopen', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: true },
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });

    rerender({ visible: false }); // start exiting
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ visible: true }); // reopen before the exit timer fires
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe('entering');

    act(() => {
      jest.advanceTimersByTime(180); // the stale exit timer's original deadline
    });
    expect(result.current.shouldRender).toBe(true); // must NOT have unmounted
  });

  it('unmounts on the next tick without delay under reduced motion', () => {
    (useMediaQuery as jest.Mock).mockReturnValue(true);
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: true },
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });

    rerender({ visible: false });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current.shouldRender).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bertel-tourism-ui && npx jest src/hooks/usePresence.test.ts`
Expected: FAIL with "Cannot find module './usePresence'"

- [ ] **Step 3: Write the implementation**

Create `bertel-tourism-ui/src/hooks/usePresence.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

export type PresencePhase = 'entering' | 'open' | 'exiting';

export interface PresenceState {
  shouldRender: boolean;
  phase: PresencePhase;
}

/**
 * Keeps a surface mounted through its exit animation instead of unmounting on
 * the same render `visible` flips false. `entering` -> `open` happens on the
 * next animation frame (so the initial CSS state actually paints before the
 * transition kicks in); `exiting` holds for `exitDurationMs` then unmounts.
 * Reduced motion skips both delays — mount/unmount track `visible` directly.
 */
export function usePresence(visible: boolean, exitDurationMs: number): PresenceState {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shouldRender, setShouldRender] = useState(visible);
  const [phase, setPhase] = useState<PresencePhase>(visible ? 'open' : 'exiting');

  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearPending() {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    clearPending();

    if (visible) {
      setShouldRender(true);
      if (prefersReducedMotion) {
        setPhase('open');
        return clearPending;
      }
      setPhase('entering');
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setPhase('open');
      });
    } else {
      if (!shouldRender) {
        return clearPending;
      }
      if (prefersReducedMotion) {
        setShouldRender(false);
        setPhase('exiting');
        return clearPending;
      }
      setPhase('exiting');
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setShouldRender(false);
      }, exitDurationMs);
    }

    return clearPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldRender is read, not a driver; including it would re-run the exit timer on its own update.
  }, [visible, exitDurationMs, prefersReducedMotion]);

  return { shouldRender, phase };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/hooks/usePresence.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/hooks/usePresence.ts bertel-tourism-ui/src/hooks/usePresence.test.ts
git commit -m "feat(motion): add usePresence hook for exit-animated mount/unmount"
```

### Task 5: Migrate `Modal` to controlled `open`+`onOpenChange` with presence phases

**Files:**
- Modify: `bertel-tourism-ui/src/components/common/Modal.tsx`
- Modify: `bertel-tourism-ui/src/components/common/Modal.test.tsx`
- Modify: `bertel-tourism-ui/src/styles.css` (`.app-modal-overlay`/`.app-modal`/`.app-modal--drawer` blocks, lines 3799-3878)

**Interfaces:**
- Consumes: `usePresence` (Task 4).
- Produces: new `Modal` props `{ open: boolean; title: string; onOpenChange: (open: boolean) => void; children: ReactNode; footer?: ReactNode; variant?: 'modal' | 'drawer' }` — **replaces** `{ title; onClose; children; footer?; variant? }`. `Modal` itself now owns "is this mounted at all" (no more caller-side `if (!open) return null`).

- [ ] **Step 1: Update the failing/changed tests first**

`bertel-tourism-ui/src/components/common/Modal.test.tsx` currently asserts Escape/overlay-click/close-button call `onClose`, and presumably renders via `<Modal title="x" onClose={fn}>`. Update every render call in that file to pass `open={true}` (or `open={false}` for the "does not render when closed" case) and rename the callback prop to `onOpenChange`, asserting it was called with `false`:

Read the existing file, then apply this transform to each test case:
```tsx
// Before
render(<Modal title="Test" onClose={onClose}>content</Modal>);
// ...
expect(onClose).toHaveBeenCalled();

// After
render(<Modal title="Test" open onOpenChange={onOpenChange}>content</Modal>);
// ...
expect(onOpenChange).toHaveBeenCalledWith(false);
```

Add two new cases:
```tsx
it('does not render when open is false', () => {
  render(<Modal title="Test" open={false} onOpenChange={() => {}}>content</Modal>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('stays in the DOM with data-motion-phase="exiting" during the exit window, then unmounts', () => {
  jest.useFakeTimers();
  const { rerender } = render(<Modal title="Test" open onOpenChange={() => {}}>content</Modal>);
  act(() => { jest.advanceTimersByTime(20); });
  expect(screen.getByRole('dialog').closest('[data-motion-phase]')).toHaveAttribute('data-motion-phase', 'open');

  rerender(<Modal title="Test" open={false} onOpenChange={() => {}}>content</Modal>);
  expect(screen.getByRole('dialog').closest('[data-motion-phase]')).toHaveAttribute('data-motion-phase', 'exiting');

  // default variant="modal" exits over 220ms (matches --motion-base / the .app-modal CSS transition).
  act(() => { jest.advanceTimersByTime(220); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bertel-tourism-ui && npx jest src/components/common/Modal.test.tsx`
Expected: FAIL (current `Modal` has no `open`/`onOpenChange` props)

- [ ] **Step 3: Rewrite `Modal.tsx`**

Replace `bertel-tourism-ui/src/components/common/Modal.tsx` in full:

```tsx
'use client';

// Modal accessible MAISON (vocabulaire de l'app, pas shadcn) — overlay + carte surface,
// role="dialog" + aria-modal, fermeture Escape / clic overlay / bouton ✕, focus initial sur
// le premier champ + focus-trap Tab léger. `variant="drawer"` = tiroir latéral droit pleine
// hauteur (footer collant). Même mécanique que CrmModal mais générique (settings/team), pour
// remplacer les primitives shadcn Dialog/Sheet (unification S3, un seul design system).
// D1 (revue UX) : scroll-lock du body + restauration du focus au déclencheur à la fermeture +
// focusables robustes (tabindex/summary/contenteditable, re-capture du focus échappé).
// Motion pass : Modal possède désormais son propre cycle de montage (open/onOpenChange) via
// usePresence — l'appelant ne fait plus `if (!open) return null` avant de le rendre, sinon
// l'animation de sortie n'a jamais l'occasion de jouer.

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), details > summary,' +
  ' [contenteditable]:not([contenteditable="false"])';

// Must match the CARD's own CSS transition-duration below (not the overlay's
// shorter 140ms) — usePresence unmounts BOTH nodes at once, so the timer has
// to wait for the SLOWER of the two, or the card gets ripped out mid-fade.
// Centered .app-modal transitions over --motion-base (220ms); .app-modal--drawer
// over --motion-surface (280ms).
const MODAL_EXIT_MS_BY_VARIANT: Record<'modal' | 'drawer', number> = {
  modal: 220,
  drawer: 280,
};

function getFocusables(root: HTMLElement): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hasAttribute('aria-hidden'),
  );
  // offsetParent === null ⇒ élément masqué (display:none…). jsdom renvoie null
  // partout : repli sur la liste complète pour rester testable.
  const visible = all.filter((el) => el.offsetParent !== null);
  return visible.length > 0 ? visible : all;
}

export function Modal({
  open,
  title,
  onOpenChange,
  children,
  footer,
  variant = 'modal',
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
}) {
  const { shouldRender, phase } = usePresence(open, MODAL_EXIT_MS_BY_VARIANT[variant]);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!shouldRender) return;
    // D1 : mémorise le déclencheur + verrouille le scroll du body (sauve/restaure ⇒
    // les modales empilées se déverrouillent dans le bon ordre).
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const card = cardRef.current;
    if (card) {
      const focusables = getFocusables(card);
      (focusables.find((el) => !el.classList.contains('app-modal__close')) ?? focusables[0])?.focus();
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount (shouldRender false->true transition), not per phase change.
  }, [shouldRender]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onOpenChange(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const focusables = getFocusables(card);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // `!card.contains(active)` : un focus échappé de la carte est ramené dans la boucle.
    if (event.shiftKey && (active === first || !card.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!shouldRender) return null;

  return (
    <div
      className={variant === 'drawer' ? 'app-modal-overlay app-modal-overlay--drawer' : 'app-modal-overlay'}
      data-motion-phase={phase}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={cardRef}
        className={variant === 'drawer' ? 'app-modal app-modal--drawer' : 'app-modal'}
        data-motion-phase={phase}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        <div className="app-modal__head">
          <h3>{title}</h3>
          <button type="button" className="app-modal__close" aria-label="Fermer" onClick={() => onOpenChange(false)}>
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="app-modal__body">{children}</div>
        {footer && <div className="app-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add presence-phase CSS to `styles.css`**

In `bertel-tourism-ui/src/styles.css`, immediately after the existing `.app-modal-overlay--drawer`/`.app-modal--drawer` block (after line 3878, before the `/* 7.4 — révélation ... */` comment), add:

```css
/* Motion pass — presence-phase transitions (usePresence via Modal.tsx). Overlay
   fades; centered modal fades+lifts+scales; drawer fades+slides from the right.
   Exit uses --ease-premium-in, enter uses --ease-premium-out (D1). */
.app-modal-overlay {
  opacity: 1;
  transition: opacity 160ms var(--ease-premium-out);
}
.app-modal-overlay[data-motion-phase='entering'] {
  opacity: 0;
}
.app-modal-overlay[data-motion-phase='exiting'] {
  opacity: 0;
  transition-duration: 140ms;
  transition-timing-function: var(--ease-premium-in);
}

.app-modal {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: opacity var(--motion-base) var(--ease-premium-out), transform var(--motion-base) var(--ease-premium-out);
}
.app-modal[data-motion-phase='entering'] {
  opacity: 0;
  transform: translateY(var(--motion-distance-md)) scale(0.985);
}
.app-modal[data-motion-phase='exiting'] {
  opacity: 0;
  transform: translateY(var(--motion-distance-md)) scale(0.985);
  transition-timing-function: var(--ease-premium-in);
}

.app-modal--drawer {
  opacity: 1;
  transform: translateX(0);
  transition: opacity var(--motion-surface) var(--ease-premium-out), transform var(--motion-surface) var(--ease-premium-out);
}
.app-modal--drawer[data-motion-phase='entering'] {
  opacity: 0;
  transform: translateX(18px);
}
.app-modal--drawer[data-motion-phase='exiting'] {
  opacity: 0;
  transform: translateX(18px);
  transition-timing-function: var(--ease-premium-in);
}

@media (prefers-reduced-motion: reduce) {
  .app-modal-overlay,
  .app-modal,
  .app-modal--drawer {
    transition: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/components/common/Modal.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/components/common/Modal.tsx bertel-tourism-ui/src/components/common/Modal.test.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): migrate Modal to controlled open/onOpenChange with presence-phase exit animation"
```

### Task 6: Migrate every `Modal` caller to the new `open`/`onOpenChange` API

**Files (all 10 call sites — 11 usages, `CommandPalette.tsx` has 2):**
- Modify: `bertel-tourism-ui/src/components/common/ConfirmDialog.tsx`
- Modify: `bertel-tourism-ui/src/features/team/MemberPermissionsDrawer.tsx`
- Modify: `bertel-tourism-ui/src/components/layout/MobileNavDrawer.tsx`
- Modify: `bertel-tourism-ui/src/components/layout/CommandPalette.tsx`
- Modify: `bertel-tourism-ui/src/features/orgs/OrgsPanel.tsx`
- Modify: `bertel-tourism-ui/src/features/orgs/CreateOrgDialog.tsx`
- Modify: `bertel-tourism-ui/src/features/team/InviteMemberDialog.tsx`
- Modify: `bertel-tourism-ui/src/views/ListComposeView.tsx`
- Modify: `bertel-tourism-ui/src/views/ModerationPage.tsx`
- Modify: `bertel-tourism-ui/src/views/RefCodeEditor.tsx`

**The mechanical rule (identical at every site):** each caller today either (a) has its own `if (!x) return null;` guard *before* reaching the `<Modal>` JSX, or (b) wraps the `<Modal>` in `{cond && <Modal ...>}` / a ternary. **Delete that caller-side guard/conditional entirely** — `Modal` now handles "not visible" itself via its `open` prop and `usePresence`. Replace `<Modal title={...} onClose={handler}>` with `<Modal title={...} open={openFlag} onOpenChange={(next) => { if (!next) handler(); }}>` (or, when the caller's boolean setter already matches the shape, `onOpenChange={setOpenFlag}` directly).

- [ ] **Step 1: Worked example — `ConfirmDialog.tsx` (full before/after)**

Current (`bertel-tourism-ui/src/components/common/ConfirmDialog.tsx`, lines 44-65):
```tsx
  const [gateValue, setGateValue] = useState('');
  // Réinitialise la saisie à la fermeture pour que la prochaine ouverture reparte propre.
  useEffect(() => {
    if (!open) setGateValue('');
  }, [open]);

  if (!open) return null;

  const gatePass = /* ... */;
  const confirmBlocked = busy || !gatePass;
  const confirmReasonId = /* ... */;

  return (
    <Modal
      title={title}
      onClose={onCancel}
```

Change to:
```tsx
  const [gateValue, setGateValue] = useState('');
  // Réinitialise la saisie à la fermeture pour que la prochaine ouverture reparte propre.
  useEffect(() => {
    if (!open) setGateValue('');
  }, [open]);

  const gatePass = /* ... unchanged ... */;
  const confirmBlocked = busy || !gatePass;
  const confirmReasonId = /* ... unchanged ... */;

  return (
    <Modal
      title={title}
      open={open}
      onOpenChange={(next) => { if (!next) onCancel(); }}
```

(Delete the `if (!open) return null;` line. Everything else in the file — the gate logic, the footer buttons — is unchanged. `ConfirmDialog`'s own `open` prop is unchanged; it's now forwarded into `Modal` instead of gating a `return null`.)

- [ ] **Step 2: Run `ConfirmDialog`'s consumers to confirm nothing else broke**

Run: `cd bertel-tourism-ui && npx jest src/components/common/ConfirmDialog`
(If no dedicated `ConfirmDialog.test.tsx` exists, this step is a no-op — confirm via `grep -rn "ConfirmDialog.test" bertel-tourism-ui/src` first; if it exists, it must still pass.)

- [ ] **Step 3: Apply the same transformation to the remaining 9 files**

| File | Current guard/wrap | Current `<Modal>` invocation | New invocation |
|---|---|---|---|
| `MemberPermissionsDrawer.tsx:62,114` | `if (!member) return null;` | `<Modal variant="drawer" title={displayName} onClose={onClose}>` | Delete the guard (keep `member` null-checks elsewhere in the body that aren't the mount guard). `<Modal variant="drawer" title={displayName} open={!!member} onOpenChange={(next) => { if (!next) onClose(); }}>` — note `displayName`/other JSX inside the body that reads `member` must stay guarded by an inline `member &&` or optional chaining since `member` can still be `null` while `shouldRender` is true during the exit animation; use `member?.displayName ?? ''` for `title` and guard the body's `member`-dependent JSX with `{member && (...)}`. |
| `MobileNavDrawer.tsx:24-26,31` | `if (!open) { return null; }` | `<Modal title="Navigation" variant="drawer" onClose={() => setOpen(false)}>` | Delete the guard. `<Modal title="Navigation" variant="drawer" open={open} onOpenChange={setOpen}>` |
| `CommandPalette.tsx` (`ShortcutHelpModal` sub-component) | parent conditionally renders `<ShortcutHelpModal/>` | `<Modal title="Raccourcis clavier" onClose={onClose}>` | Give `ShortcutHelpModal` an `open` prop from its parent instead of the parent conditionally rendering it; forward `open`/`onOpenChange` straight through. |
| `CommandPalette.tsx:210` (main palette) | `{open ? <Modal ...>...</Modal> : ...}` | `<Modal title="Palette de commandes" onClose={() => setOpen(false)}>` | Remove the ternary's `false`-branch special-casing if it exists solely to avoid rendering `Modal`; always render `<Modal title="Palette de commandes" open={open} onOpenChange={setOpen}>`. |
| `OrgsPanel.tsx:78` | `{brandingOrg && <Modal ...>}` | `onClose={() => setBrandingOrg(null)}` | `<Modal title={...} open={!!brandingOrg} onOpenChange={(next) => { if (!next) setBrandingOrg(null); }} footer={...}>` — guard `brandingOrg`-dependent body JSX with `{brandingOrg && (...)}` since it can be null during exit. |
| `CreateOrgDialog.tsx:75` | `{open && <Modal ...>}` | `onClose={close}` | `<Modal title={...} open={open} onOpenChange={(next) => { if (!next) close(); }} footer={footer}>` |
| `InviteMemberDialog.tsx:146` | `{open && <Modal ...>}` | `onClose={handleClose}` | `<Modal title="Inviter des membres" open={open} onOpenChange={(next) => { if (!next) handleClose(); }} footer={footer}>` |
| `ListComposeView.tsx:640` | `{shareOpen && <Modal ...>}` | `onClose={() => setShareOpen(false)}` | `<Modal title="Partager par lien" open={shareOpen} onOpenChange={setShareOpen}>` |
| `ModerationPage.tsx:233` | `{rejectTarget && <Modal ...>}` | reject-reason modal | `<Modal title={...} open={!!rejectTarget} onOpenChange={(next) => { if (!next) setRejectTarget(null); }}>` — guard `rejectTarget`-dependent body JSX. |
| `RefCodeEditor.tsx:278` | `{i18nTarget && <Modal ...>}` | i18n edit modal | `<Modal title={...} open={!!i18nTarget} onOpenChange={(next) => { if (!next) setI18nTarget(null); }}>` — guard `i18nTarget`-dependent body JSX. |

For every row above: (1) read the actual current file first (line numbers are from research and may drift by a few lines), (2) delete the caller-side mount guard, (3) add `open`/`onOpenChange` to the `<Modal>` call replacing `onClose`, (4) where the modal body reads a nullable target object (`member`, `brandingOrg`, `rejectTarget`, `i18nTarget`), wrap the body's usages in an inline null-guard since that object can legitimately be `null` while the modal is still mounted and animating out.

- [ ] **Step 4: Typecheck the whole app (catches any remaining `onClose` reference)**

Run: `cd bertel-tourism-ui && npx tsc --noEmit --pretty false`
Expected: 0 errors. Any leftover `onClose={...}` passed to `<Modal>` fails here since the prop no longer exists — this is the safety net confirming all 11 sites were migrated.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd bertel-tourism-ui && npx jest --runInBand`
Expected: all suites green (no test should reference `Modal`'s old `onClose` prop except the already-updated `Modal.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/components/common/ConfirmDialog.tsx bertel-tourism-ui/src/features/team/MemberPermissionsDrawer.tsx bertel-tourism-ui/src/components/layout/MobileNavDrawer.tsx bertel-tourism-ui/src/components/layout/CommandPalette.tsx bertel-tourism-ui/src/features/orgs/OrgsPanel.tsx bertel-tourism-ui/src/features/orgs/CreateOrgDialog.tsx bertel-tourism-ui/src/features/team/InviteMemberDialog.tsx bertel-tourism-ui/src/views/ListComposeView.tsx bertel-tourism-ui/src/views/ModerationPage.tsx bertel-tourism-ui/src/views/RefCodeEditor.tsx
git commit -m "refactor(motion): migrate every Modal caller to the open/onOpenChange API"
```

### Task 7: Radix `Sheet` timing

**Files:**
- Modify: `bertel-tourism-ui/src/components/ui/sheet.tsx`

**Interfaces:** No prop/API change — `sheetVariants`'s `cva` base class string changes only. All 4 existing callers (`ProfileDrawer.tsx`, `ExplorerPage.tsx`, `EditorCrmDrawer.tsx`, `ObjectDrawer.tsx`) inherit the new timing automatically since it's centralized in one `cva` definition.

- [ ] **Step 1: Update `SheetOverlay`'s duration (lines 17-30)**

Current class string (line 23):
```
'fixed inset-0 z-50 bg-[rgba(24,49,59,0.28)] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
```
Change to:
```
'fixed inset-0 z-50 bg-[rgba(24,49,59,0.28)] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-[160ms] data-[state=closed]:duration-[140ms]'
```

- [ ] **Step 2: Update `sheetVariants`'s duration and easing (lines 32-47)**

Current base string (line 33):
```
'fixed z-50 gap-4 overflow-y-auto border border-border bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500'
```
Change to:
```
'fixed z-50 gap-4 overflow-y-auto border border-border bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-xl transition data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-[280ms] data-[state=closed]:duration-[200ms] data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)]'
```
(Removes the bare `ease-in-out` in favor of per-state arbitrary easing matching `--ease-premium-out`/`--ease-premium-in` from Task 1; `duration-300`/`duration-500` become `duration-[200ms]`/`duration-[280ms]`.)

- [ ] **Step 3: Verify the 4 Sheet consumers still render correctly**

Run: `cd bertel-tourism-ui && npx jest --testPathPattern="(ProfileDrawer|ExplorerPage|EditorCrmDrawer|ObjectDrawer)"`
Expected: PASS (no test asserts on the literal duration classes; this confirms nothing else regressed).

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/components/ui/sheet.tsx
git commit -m "feat(motion): retime Sheet open/close to 280ms/200ms with premium easing"
```

---

## Package 3 — Loading states & skeletons

### Task 8: `SkeletonBlock` + `PageSkeleton` primitives

**Files:**
- Create: `bertel-tourism-ui/src/components/common/SkeletonBlock.tsx`
- Create: `bertel-tourism-ui/src/components/common/PageSkeleton.tsx`
- Test: `bertel-tourism-ui/src/components/common/SkeletonBlock.test.tsx`
- Test: `bertel-tourism-ui/src/components/common/PageSkeleton.test.tsx`

**Interfaces:**
- Consumes: the existing `.drawer-skeleton` shimmer class (`styles.css:2672-2777`) — reused verbatim, not reinvented.
- Produces: `<SkeletonBlock className?: string />` (decorative, `aria-hidden`); `<PageSkeleton variant: 'dashboard' | 'list' | 'form' />` (one `role="status" aria-busy="true"` region with a screen-reader label). Consumed by Task 9 (`WidgetFrame`), Task 10 (route `loading.tsx` files), Task 12 (Suspense fallbacks).

- [ ] **Step 1: Write the failing tests**

Create `bertel-tourism-ui/src/components/common/SkeletonBlock.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { SkeletonBlock } from './SkeletonBlock';

describe('SkeletonBlock', () => {
  it('is hidden from assistive technology', () => {
    render(<SkeletonBlock className="h-4 w-24" data-testid="block" />);
    expect(screen.getByTestId('block')).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the shared shimmer class', () => {
    render(<SkeletonBlock className="h-4 w-24" data-testid="block" />);
    expect(screen.getByTestId('block')).toHaveClass('drawer-skeleton');
  });
});
```

Create `bertel-tourism-ui/src/components/common/PageSkeleton.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { PageSkeleton } from './PageSkeleton';

describe('PageSkeleton', () => {
  it.each(['dashboard', 'list', 'form'] as const)('exposes aria-busy + a readable status label for variant=%s', (variant) => {
    render(<PageSkeleton variant={variant} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAccessibleName();
  });

  it('hides its decorative blocks from assistive technology', () => {
    const { container } = render(<PageSkeleton variant="list" />);
    const decorative = container.querySelectorAll('[aria-hidden="true"]');
    expect(decorative.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bertel-tourism-ui && npx jest src/components/common/SkeletonBlock.test.tsx src/components/common/PageSkeleton.test.tsx`
Expected: FAIL ("Cannot find module")

- [ ] **Step 3: Implement `SkeletonBlock.tsx`**

```tsx
import { cn } from '@/lib/utils';

interface SkeletonBlockProps {
  className?: string;
  'data-testid'?: string;
}

/** Decorative shimmer placeholder — reuses the existing `.drawer-skeleton` primitive
 * (styles.css) so every new skeleton shares the one shimmer animation already in use
 * by ResultsListSkeleton and ObjectDrawerShell's skeletons. */
export function SkeletonBlock({ className, 'data-testid': testId }: SkeletonBlockProps) {
  return <span className={cn('drawer-skeleton', className)} aria-hidden="true" data-testid={testId} />;
}
```

- [ ] **Step 4: Implement `PageSkeleton.tsx`**

```tsx
import { SkeletonBlock } from './SkeletonBlock';

type PageSkeletonVariant = 'dashboard' | 'list' | 'form';

const VARIANT_LABEL: Record<PageSkeletonVariant, string> = {
  dashboard: 'Chargement du tableau de bord',
  list: 'Chargement de la liste',
  form: 'Chargement du formulaire',
};

function DashboardSkeletonBody() {
  return (
    <div className="page-skeleton__dashboard" aria-hidden="true">
      <div className="page-skeleton__row">
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
      </div>
      <SkeletonBlock className="h-64 w-full rounded-shellLg" />
      <div className="page-skeleton__row">
        <SkeletonBlock className="h-48 flex-1 rounded-shellLg" />
        <SkeletonBlock className="h-48 flex-1 rounded-shellLg" />
      </div>
    </div>
  );
}

function ListSkeletonBody() {
  return (
    <div className="page-skeleton__list" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="page-skeleton__row">
          <SkeletonBlock className="h-16 w-16 shrink-0 rounded-shellMd" />
          <div className="page-skeleton__col">
            <SkeletonBlock className="h-4 w-1/3 rounded-shellSm" />
            <SkeletonBlock className="h-3 w-1/2 rounded-shellSm" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormSkeletonBody() {
  return (
    <div className="page-skeleton__form" aria-hidden="true">
      <SkeletonBlock className="h-8 w-1/2 rounded-shellMd" />
      {Array.from({ length: 4 }, (_, index) => (
        <SkeletonBlock key={index} className="h-10 w-full rounded-shellMd" />
      ))}
    </div>
  );
}

const VARIANT_BODY: Record<PageSkeletonVariant, () => JSX.Element> = {
  dashboard: DashboardSkeletonBody,
  list: ListSkeletonBody,
  form: FormSkeletonBody,
};

/** Route/region-level loading skeleton. One accessible status region wrapping
 * purely decorative shimmer blocks sized to approximate the real content, so
 * nothing shifts layout when the real content replaces it. */
export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  const Body = VARIANT_BODY[variant];
  return (
    <div role="status" aria-busy="true" aria-label={VARIANT_LABEL[variant]} className="page-skeleton">
      <Body />
    </div>
  );
}
```

- [ ] **Step 5: Add the layout-only CSS (no new shimmer — reuses `.drawer-skeleton`)**

In `bertel-tourism-ui/src/styles.css`, add after the `.drawer-skeleton` block (after line ~2777's `@keyframes drawer-skeleton-shimmer` closing brace):
```css
.page-skeleton { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.page-skeleton__row { display: flex; gap: 16px; }
.page-skeleton__col { display: flex; flex: 1; flex-direction: column; gap: 8px; justify-content: center; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/components/common/SkeletonBlock.test.tsx src/components/common/PageSkeleton.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/components/common/SkeletonBlock.tsx bertel-tourism-ui/src/components/common/PageSkeleton.tsx bertel-tourism-ui/src/components/common/SkeletonBlock.test.tsx bertel-tourism-ui/src/components/common/PageSkeleton.test.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): add SkeletonBlock and PageSkeleton primitives reusing the existing shimmer"
```

### Task 9: `WidgetFrame` skeleton + `.motion-content-reveal` on load

**Files:**
- Modify: `bertel-tourism-ui/src/components/dashboard/WidgetFrame.tsx`
- Modify: `bertel-tourism-ui/src/components/dashboard/WidgetFrame.test.tsx`

**Interfaces:**
- Consumes: `SkeletonBlock` (Task 8), `.motion-content-reveal` (Task 1).
- Produces: new optional prop `skeleton?: ReactNode` on `WidgetFrameProps` — **additive**, existing 6 call sites in `DashboardPage.tsx` keep working unchanged (they'll just render the generic fallback skeleton until each is given a tailored one, per the spec's "existing callers may temporarily fall back to the generic widget skeleton").

- [ ] **Step 1: Write the new/changed tests**

In `bertel-tourism-ui/src/components/dashboard/WidgetFrame.test.tsx`, keep the 5 existing cases (isPending shows `role="status"`, error shows `role="alert"`+Retry, isEmpty shows emptyLabel, default renders children) but update the pending-state assertion since the literal text `'Chargement'` is replaced by a skeleton, and add a case for a custom `skeleton` prop:

```tsx
it('renders a skeleton (not bare text) while pending, with aria-busy status semantics', () => {
  render(<WidgetFrame isPending error={null}>content</WidgetFrame>);
  const region = screen.getByRole('status');
  expect(region).toHaveAttribute('aria-busy', 'true');
  expect(region).toHaveAccessibleName();
  expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
});

it('renders the provided custom skeleton when pending', () => {
  render(
    <WidgetFrame isPending error={null} skeleton={<div data-testid="custom-skel" />}>
      content
    </WidgetFrame>,
  );
  expect(screen.getByTestId('custom-skel')).toBeInTheDocument();
});

it('reveals loaded content with the motion-content-reveal class', () => {
  render(<WidgetFrame isPending={false} error={null}>content</WidgetFrame>);
  expect(screen.getByText('content').closest('.motion-content-reveal')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `cd bertel-tourism-ui && npx jest src/components/dashboard/WidgetFrame.test.tsx`
Expected: FAIL (current pending branch renders literal `Chargement…` text, no `skeleton` prop, no reveal wrapper)

- [ ] **Step 3: Update `WidgetFrame.tsx`**

```tsx
"use client";

import type { ReactNode } from 'react';
import { SkeletonBlock } from '../common/SkeletonBlock';

interface WidgetFrameProps {
  /**
   * Pass q.isPending from useDashboardQuery — spinner on initial fetch only;
   * background refetches intentionally keep showing stale data.
   */
  isPending: boolean;
  error: unknown;
  /** true quand la donnée est chargée mais vide pour les filtres courants. */
  isEmpty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  /** Skeleton shape matching this widget's real layout. Falls back to a generic
   * placeholder when omitted so existing callers don't need to migrate at once. */
  skeleton?: ReactNode;
  children: ReactNode;
}

function GenericWidgetSkeleton() {
  return (
    <div className="dashboard-widget-skeleton" aria-hidden="true">
      <SkeletonBlock className="h-4 w-1/3 rounded-shellSm" />
      <SkeletonBlock className="h-24 w-full rounded-shellMd" />
    </div>
  );
}

/**
 * Enveloppe d'état des widgets dashboard : fin des erreurs avalées en
 * console.error — chaque widget montre explicitement chargement / erreur / vide.
 */
export function WidgetFrame({
  isPending,
  error,
  isEmpty = false,
  emptyLabel = 'Aucun objet ne correspond aux filtres.',
  onRetry,
  skeleton,
  children,
}: WidgetFrameProps) {
  if (isPending) {
    return (
      <article className="kpi-panel kpi-panel--state" role="status" aria-busy="true" aria-label="Chargement du widget">
        {skeleton ?? <GenericWidgetSkeleton />}
      </article>
    );
  }
  if (error) {
    return (
      <article className="kpi-panel kpi-panel--state" role="alert">
        <span className="dashboard-widget-state dashboard-widget-state--error">
          Impossible de charger ce widget.
        </span>
        {onRetry && (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Réessayer
          </button>
        )}
      </article>
    );
  }
  if (isEmpty) {
    return (
      <article className="kpi-panel kpi-panel--state" role="status" aria-live="polite">
        <span className="dashboard-widget-state">{emptyLabel}</span>
      </article>
    );
  }
  return <div className="motion-content-reveal">{children}</div>;
}
```

- [ ] **Step 4: Add the generic skeleton's layout CSS**

In `styles.css`, near the existing `.dashboard-widget-state` rules (~line 10300-10312), add:
```css
.dashboard-widget-skeleton { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/components/dashboard/WidgetFrame.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/components/dashboard/WidgetFrame.tsx bertel-tourism-ui/src/components/dashboard/WidgetFrame.test.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): give WidgetFrame a real skeleton and content-reveal transition"
```

### Task 10: Route-level `loading.tsx` for all 9 `(main)` segments

**Files:**
- Create: `bertel-tourism-ui/src/app/(main)/dashboard/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/explorer/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/crm/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/moderation/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/audits/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/listes/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/team/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/settings/loading.tsx`
- Create: `bertel-tourism-ui/src/app/(main)/objects/[objectId]/edit/loading.tsx`

**Interfaces:**
- Consumes: `PageSkeleton` (Task 8). Next.js App Router auto-wraps each segment's `page.tsx` in a `<Suspense fallback={loading.tsx's default export}>` — no manual wiring needed.

- [ ] **Step 1: Create the 7 generic `list`/`dashboard` segments**

`bertel-tourism-ui/src/app/(main)/dashboard/loading.tsx`:
```tsx
import { PageSkeleton } from '../../../components/common/PageSkeleton';

export default function DashboardLoading() {
  return <PageSkeleton variant="dashboard" />;
}
```

`bertel-tourism-ui/src/app/(main)/explorer/loading.tsx`, `crm/loading.tsx`, `moderation/loading.tsx`, `audits/loading.tsx`, `listes/loading.tsx`, `team/loading.tsx`:
```tsx
import { PageSkeleton } from '../../../components/common/PageSkeleton';

export default function Loading() {
  return <PageSkeleton variant="list" />;
}
```
(6 files, identical content, adjust the relative import depth if a segment nests deeper — all of these sit directly under `(main)/`.)

`bertel-tourism-ui/src/app/(main)/settings/loading.tsx`:
```tsx
import { PageSkeleton } from '../../../components/common/PageSkeleton';

export default function SettingsLoading() {
  return <PageSkeleton variant="form" />;
}
```

- [ ] **Step 2: Create the object editor's dedicated skeleton (header + nav rail + form panel)**

`bertel-tourism-ui/src/app/(main)/objects/[objectId]/edit/loading.tsx`:
```tsx
import { SkeletonBlock } from '../../../../../components/common/SkeletonBlock';

export default function ObjectEditLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement de la fiche" className="editor-loading">
      <div className="editor-loading__topbar" aria-hidden="true">
        <SkeletonBlock className="h-6 w-48 rounded-shellSm" />
        <SkeletonBlock className="h-8 w-24 rounded-shellMd" />
      </div>
      <div className="editor-loading__body">
        <div className="editor-loading__rail" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonBlock key={index} className="h-8 w-full rounded-shellSm" />
          ))}
        </div>
        <div className="editor-loading__form" aria-hidden="true">
          <SkeletonBlock className="h-40 w-full rounded-shellLg" />
          <SkeletonBlock className="h-24 w-full rounded-shellLg" />
          <SkeletonBlock className="h-24 w-full rounded-shellLg" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add layout CSS for the editor skeleton**

In `styles.css`, near the `.drawer-skeleton` block, add:
```css
.editor-loading { display: flex; flex-direction: column; gap: 20px; padding: 20px; }
.editor-loading__topbar { display: flex; align-items: center; justify-content: space-between; }
.editor-loading__body { display: grid; grid-template-columns: 220px 1fr; gap: 24px; }
.editor-loading__rail { display: flex; flex-direction: column; gap: 8px; }
.editor-loading__form { display: flex; flex-direction: column; gap: 16px; }
```

- [ ] **Step 4: Manual verification (App Router `loading.tsx` has no unit-test seam)**

Start the dev server (`preview_start`), throttle network in devtools or add a temporary artificial delay to one query, navigate to `/dashboard`, `/explorer`, `/crm`, `/objects/<id>/edit`, and confirm each shows its skeleton (not a blank screen) before the real page paints. Remove any temporary delay before committing.

- [ ] **Step 5: Commit**

```bash
git add "bertel-tourism-ui/src/app/(main)/dashboard/loading.tsx" "bertel-tourism-ui/src/app/(main)/explorer/loading.tsx" "bertel-tourism-ui/src/app/(main)/crm/loading.tsx" "bertel-tourism-ui/src/app/(main)/moderation/loading.tsx" "bertel-tourism-ui/src/app/(main)/audits/loading.tsx" "bertel-tourism-ui/src/app/(main)/listes/loading.tsx" "bertel-tourism-ui/src/app/(main)/team/loading.tsx" "bertel-tourism-ui/src/app/(main)/settings/loading.tsx" "bertel-tourism-ui/src/app/(main)/objects/[objectId]/edit/loading.tsx" bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): add route-level loading skeletons for all 9 (main) segments"
```

### Task 11: `RouteMotion` wrapper (page transition, sidebar/topbar excluded)

**Files:**
- Create: `bertel-tourism-ui/src/components/layout/RouteMotion.tsx`
- Test: `bertel-tourism-ui/src/components/layout/RouteMotion.test.tsx`
- Modify: `bertel-tourism-ui/src/components/layout/AppShell.tsx` (line 35, wrap `{children}` only)

**Interfaces:**
- Consumes: `usePathname()` (already imported in `AppShell.tsx`), `.motion-page-enter` (Task 1).
- Produces: `<RouteMotion>{children}</RouteMotion>` — keys its inner wrapper by pathname so only the routed content re-animates, never `Sidebar`/`TopBar`.

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/components/layout/RouteMotion.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { RouteMotion } from './RouteMotion';

let mockPathname = '/explorer';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

describe('RouteMotion', () => {
  it('wraps children in a motion-page-enter div keyed by the current pathname', () => {
    render(
      <RouteMotion>
        <div>Explorer content</div>
      </RouteMotion>,
    );
    expect(screen.getByText('Explorer content').closest('.motion-page-enter')).toBeInTheDocument();
  });

  it('renders new content when the pathname changes (remount, not a stale wrapper)', () => {
    const { rerender } = render(
      <RouteMotion>
        <div>Explorer content</div>
      </RouteMotion>,
    );
    mockPathname = '/dashboard';
    rerender(
      <RouteMotion>
        <div>Dashboard content</div>
      </RouteMotion>,
    );
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(screen.queryByText('Explorer content')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/layout/RouteMotion.test.tsx`
Expected: FAIL ("Cannot find module")

- [ ] **Step 3: Implement `RouteMotion.tsx`**

```tsx
'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Wraps only the routed page content — never Sidebar/TopBar/CommandPalette/
 * drawers, which live as siblings in AppShell, outside this wrapper. Keying by
 * pathname remounts (and re-animates) the wrapper on real navigation only;
 * usePathname() ignores query-string changes, so in-page filter/search updates
 * do not trigger a re-animation.
 */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="motion-page-enter">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `AppShell.tsx`**

In `bertel-tourism-ui/src/components/layout/AppShell.tsx`, add the import and wrap only `{children}` (line 35) — leave `Sidebar`, `TopBar`, `ProfileDrawer`, `CommandPalette`, `MobileNavDrawer`, and the lazy `ObjectDrawer` untouched:

```tsx
import { RouteMotion } from './RouteMotion';
// ... existing imports

// inside the component's return, replace:
<main id="main-content">{children}</main>
// with:
<main id="main-content">
  <RouteMotion>{children}</RouteMotion>
</main>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/components/layout/RouteMotion.test.tsx`
Expected: PASS

- [ ] **Step 6: Manual verification — confirm the sidebar never re-animates**

Start the dev server, navigate between `/dashboard` and `/explorer`, confirm the sidebar/topbar stay static (no flash/re-render) while the main content area fades+lifts in.

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/components/layout/RouteMotion.tsx bertel-tourism-ui/src/components/layout/RouteMotion.test.tsx bertel-tourism-ui/src/components/layout/AppShell.tsx
git commit -m "feat(motion): add RouteMotion page-transition wrapper scoped to routed content only"
```

### Task 12: Replace the 2 `Suspense fallback={null}` sites with real fallbacks

**Files:**
- Modify: `bertel-tourism-ui/src/components/layout/AppShell.tsx` (lines 43-45, lazy `ObjectDrawer`)
- Modify: `bertel-tourism-ui/src/app/(main)/aide/page.tsx` (lines 9-11)

**Interfaces:** No new interfaces — `AppShell`'s existing `<ObjectDrawerShell>` already owns its own internal skeleton (`DrawerHeaderSkeleton`/`DrawerPreviewSkeleton`, approved pattern, do not touch); this task only changes the **outer** `Suspense` boundary's `fallback` around the `lazy()`-loaded `ObjectDrawer` module itself, which today shows nothing while the JS chunk downloads.

- [ ] **Step 1: `AppShell.tsx` — give the lazy `ObjectDrawer` a sheet-shell fallback**

Current (lines 43-45):
```tsx
<Suspense fallback={null}>
  <ObjectDrawer objectId={drawerObjectId} />
</Suspense>
```
Change to:
```tsx
<Suspense
  fallback={
    drawerObjectId ? (
      <div className="drawer-panel-fallback" role="status" aria-busy="true" aria-label="Chargement de la fiche" />
    ) : null
  }
>
  <ObjectDrawer objectId={drawerObjectId} />
</Suspense>
```
(Only render the fallback shell when a drawer is actually meant to be open — `drawerObjectId` truthy — otherwise `null` is correct, there's nothing to show.)

- [ ] **Step 2: Add the fallback shell's CSS (approximates the Sheet's right-side panel so nothing jumps once the real component mounts)**

In `styles.css`, near `.app-modal--drawer` (Task 5's additions), add:
```css
.drawer-panel-fallback {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  width: 100%;
  max-width: 1180px;
  background: var(--surface);
  border-left: 1px solid var(--line);
  z-index: 50;
}
```

- [ ] **Step 3: `aide/page.tsx` — replace `fallback={null}` with the form skeleton**

Current (lines 9-11):
```tsx
<Suspense fallback={null}>
  <HelpPage />
</Suspense>
```
Change to:
```tsx
<Suspense fallback={<PageSkeleton variant="list" />}>
  <HelpPage />
</Suspense>
```
Add the import: `import { PageSkeleton } from '../../../components/common/PageSkeleton';`
(Per the research: `HelpPage` itself isn't `lazy()`-loaded, only wrapped for the `useSearchParams()` App Router requirement, so this `Suspense` rarely actually suspends — but when it does, e.g. on a slow initial navigation, it now shows structure instead of nothing.)

- [ ] **Step 4: Manual verification**

Start the dev server, throttle network, open the object drawer from the Explorer and confirm the right-side fallback panel appears before the Sheet's real content mounts (no blank flash).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/components/layout/AppShell.tsx "bertel-tourism-ui/src/app/(main)/aide/page.tsx" bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): replace Suspense fallback={null} with real fallbacks (object drawer shell, help page skeleton)"
```

### Task 13: CRM skeletons (directory, actor/object detail, tasks, timeline)

**Files:**
- Modify: `bertel-tourism-ui/src/features/crm/CrmAnnuaire.tsx` (line 107)
- Modify: `bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx` (line 389)
- Modify: `bertel-tourism-ui/src/features/crm/CrmObjectView.tsx` (line 112)
- Modify: `bertel-tourism-ui/src/features/crm/CrmTaches.tsx` (line 142)
- Modify: `bertel-tourism-ui/src/features/crm/CrmTimelineView.tsx` (line 175)

**Interfaces:**
- Consumes: `SkeletonBlock` (Task 8).

- [ ] **Step 1: `CrmAnnuaire.tsx` — directory skeleton (KPI row + filter row + 6 table rows)**

Current (line 107): `return <div className="crm-loading">Chargement de l&apos;annuaire…</div>;`
Change to:
```tsx
return (
  <div role="status" aria-busy="true" aria-label="Chargement de l'annuaire" className="crm-loading-skeleton">
    <div className="crm-loading-skeleton__row" aria-hidden="true">
      <SkeletonBlock className="h-16 flex-1 rounded-shellMd" />
      <SkeletonBlock className="h-16 flex-1 rounded-shellMd" />
      <SkeletonBlock className="h-16 flex-1 rounded-shellMd" />
    </div>
    <SkeletonBlock className="h-10 w-full rounded-shellMd" aria-hidden="true" />
    {Array.from({ length: 6 }, (_, index) => (
      <SkeletonBlock key={index} className="h-10 w-full rounded-shellSm" />
    ))}
  </div>
);
```
Add the import: `import { SkeletonBlock } from '../../components/common/SkeletonBlock';`

- [ ] **Step 2: `CrmActorFiche.tsx` / `CrmObjectView.tsx` — header + content cards skeleton**

Current (each): `return <div className="crm-loading">Chargement de la fiche acteur…</div>;` (resp. `...de la vue établissement…`)
Change each to:
```tsx
return (
  <div role="status" aria-busy="true" aria-label="Chargement de la fiche" className="crm-loading-skeleton">
    <SkeletonBlock className="h-8 w-1/2 rounded-shellSm" aria-hidden="true" />
    <SkeletonBlock className="h-32 w-full rounded-shellLg" aria-hidden="true" />
    <SkeletonBlock className="h-32 w-full rounded-shellLg" aria-hidden="true" />
  </div>
);
```
Add the same `SkeletonBlock` import to both files.

- [ ] **Step 3: `CrmTaches.tsx` — 3 Kanban columns with placeholder cards**

Current (line 142): `return <div className="crm-loading">Chargement des tâches…</div>;`
Change to:
```tsx
return (
  <div role="status" aria-busy="true" aria-label="Chargement des tâches" className="crm-loading-skeleton crm-loading-skeleton--kanban">
    {['A faire', 'En cours', 'Fait'].map((column) => (
      <div key={column} className="crm-loading-skeleton__column" aria-hidden="true">
        <SkeletonBlock className="h-4 w-1/2 rounded-shellSm" />
        <SkeletonBlock className="h-16 w-full rounded-shellMd" />
        <SkeletonBlock className="h-16 w-full rounded-shellMd" />
      </div>
    ))}
  </div>
);
```
Add the `SkeletonBlock` import.

- [ ] **Step 4: `CrmTimelineView.tsx` — stacked timeline-card placeholders**

Current (line 175, inside a larger render): `<div className="crm-loading">Chargement de la timeline…</div>`
Change to:
```tsx
<div role="status" aria-busy="true" aria-label="Chargement de la timeline" className="crm-loading-skeleton">
  {Array.from({ length: 4 }, (_, index) => (
    <SkeletonBlock key={index} className="h-20 w-full rounded-shellMd" />
  ))}
</div>
```
Add the `SkeletonBlock` import.

- [ ] **Step 5: Add the CRM skeleton layout CSS**

In `styles.css`, near the `.crm-loading` rule (`.crm-app .crm-loading` — locate with `grep -n "crm-loading" bertel-tourism-ui/src/styles.css`), add alongside it:
```css
.crm-app .crm-loading-skeleton { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.crm-app .crm-loading-skeleton__row { display: flex; gap: 12px; }
.crm-app .crm-loading-skeleton--kanban { flex-direction: row; }
.crm-app .crm-loading-skeleton__column { display: flex; flex: 1; flex-direction: column; gap: 10px; }
```

- [ ] **Step 6: Run the CRM feature's existing tests**

Run: `cd bertel-tourism-ui && npx jest --testPathPattern="src/features/crm"`
Expected: PASS (no existing test asserts on the literal `Chargement…` text in these 5 files — confirm via `grep -rn "Chargement" bertel-tourism-ui/src/features/crm/*.test.tsx` before editing; if one does, update its assertion to check `getByRole('status')` instead of the literal text).

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/features/crm/CrmAnnuaire.tsx bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx bertel-tourism-ui/src/features/crm/CrmObjectView.tsx bertel-tourism-ui/src/features/crm/CrmTaches.tsx bertel-tourism-ui/src/features/crm/CrmTimelineView.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): replace CRM text-only loading blocks with structure-matching skeletons"
```

---

## Package 4 — Tactile controls

### Task 14: Press-state (scale .98) on the remaining 4 button families

**Files:**
- Modify: `bertel-tourism-ui/src/styles.css` (`.primary-button`/`.ghost-button`/`.chip`/`.open-pill` block, lines 1468-1500; `.map-panel__tool-button`, ~lines 8085-8131)
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css` (`.object-editor .btn`, lines 989-1005)

(`.crm-btn`'s press state was already added in Task 3, Step 4; `components/ui/button.tsx`'s press state was added in Task 2.)

**Interfaces:** CSS-only, no component changes.

- [ ] **Step 1: `.primary-button`/`.ghost-button`/`.chip`/`.open-pill` (styles.css:1468-1500)**

The existing hover rule (lines 1482-1487):
```css
.chip:hover,
.ghost-button:hover,
.primary-button:hover,
.open-pill:hover {
  transform: translateY(-1px);
}
```
Add immediately after it:
```css
.chip:active,
.ghost-button:active,
.primary-button:active,
.open-pill:active {
  transform: translateY(0) scale(0.98);
  transition-duration: var(--motion-instant);
}
.chip:disabled:active,
.ghost-button:disabled:active,
.primary-button:disabled:active,
.open-pill:disabled:active,
.chip[aria-disabled='true']:active,
.ghost-button[aria-disabled='true']:active,
.primary-button[aria-disabled='true']:active,
.open-pill[aria-disabled='true']:active {
  transform: none;
}
```

- [ ] **Step 2: `.object-editor .btn` (object-editor.css:989-1005) — currently has no transition at all**

After line 999 (`.object-editor .btn:hover { background: var(--surface-2); }`), add:
```css
.object-editor .btn {
  transition: background-color var(--motion-fast, 160ms) ease, transform var(--motion-instant, 90ms) ease;
}
.object-editor .btn:active { transform: scale(0.98); }
.object-editor .btn:disabled:active { transform: none; }
```
(`.object-editor .btn`'s base rule at line 989 gains the `transition` line — insert it into that existing rule block rather than as a separate selector, since it must apply to the base `.btn`, not just `:hover`.)

- [ ] **Step 3: `.map-panel__tool-button` — already has explicit-property transitions (not `all`), add press state only**

Locate the rule (`grep -n "map-panel__tool-button" bertel-tourism-ui/src/styles.css`), add:
```css
.map-panel__tool-button:active { transform: scale(0.98); }
```

- [ ] **Step 4: Manual verification**

Start the dev server, click (mousedown/mouseup) buttons from each of the 5 families (a `.primary-button` in Settings, a `.crm-btn` in CRM, a `.object-editor .btn` in the editor topbar, a map toolbar button, a shadcn `Button` in `CreateObjectDialog`) and confirm each visibly presses (scales to 98%) and returns, with no visible press effect on a disabled instance.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/styles.css bertel-tourism-ui/src/features/object-editor/object-editor.css
git commit -m "feat(motion): add press-state feedback to the remaining button families"
```

### Task 15: `ExplorerViewSwitch` sliding indicator

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/ExplorerViewSwitch.tsx`
- Test: `bertel-tourism-ui/src/components/explorer/ExplorerViewSwitch.test.tsx` (new — none exists today)
- Modify: `bertel-tourism-ui/src/styles.css` (add `.view-switch--indicator` modifier, near lines 601-634)

**Interfaces:**
- Produces: no prop change to `ExplorerViewSwitch` (still no-arg). Internally adds a `ref`-measured absolutely-positioned indicator `<span>` and a CSS custom property `--view-index` set inline. `MapPanel`'s layer switch is untouched (it does not opt into the new `.view-switch--indicator` modifier class).

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/components/explorer/ExplorerViewSwitch.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ExplorerViewSwitch } from './ExplorerViewSwitch';
import { useExplorerViewStore } from '../../store/explorer-view-store';

beforeEach(() => {
  useExplorerViewStore.setState({ viewMode: 'split' } as never);
});

describe('ExplorerViewSwitch', () => {
  it('renders 4 buttons in one group with the active one aria-pressed', () => {
    render(<ExplorerViewSwitch />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('all 4 modes remain clickable/operable and update aria-pressed', () => {
    render(<ExplorerViewSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(useExplorerViewStore.getState().viewMode).toBe('table');
  });

  it('renders an aria-hidden sliding indicator inside the group', () => {
    const { container } = render(<ExplorerViewSwitch />);
    const indicator = container.querySelector('.view-switch__indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/explorer/ExplorerViewSwitch.test.tsx`
Expected: FAIL (no `.view-switch__indicator` exists yet)

- [ ] **Step 3: Implement the ref-measured indicator**

Replace `bertel-tourism-ui/src/components/explorer/ExplorerViewSwitch.tsx` in full:
```tsx
'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Columns2, List, Map as MapIcon, Table2 } from 'lucide-react';
import { useExplorerViewStore, type ExplorerViewMode } from '../../store/explorer-view-store';
import { cn } from '@/lib/utils';

const MODES: Array<{ key: ExplorerViewMode; label: string; icon: typeof List }> = [
  { key: 'liste', label: 'Liste', icon: List },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'carte', label: 'Carte', icon: MapIcon },
  { key: 'split', label: 'Split', icon: Columns2 },
];

/**
 * D16 — sélecteur de vue de l'Explorer (Liste / Table / Carte / Split).
 * La carte devient UNE vue parmi quatre au lieu du plus grand panneau permanent ;
 * « replier la carte » = passer en Liste/Table (un seul état, pas de flag dédié).
 * Vit dans le header h-14 du panneau résultats/carte (plus de barre dédiée) —
 * icônes seules pour tenir dans la colonne liste du mode Split (min 320px),
 * libellés portés par title + aria-label.
 * Motion pass : indicateur glissant mesuré via ref (les boutons sont icon-only,
 * leur largeur dépend du padding — pas une hypothèse de largeur fixe/4).
 */
export function ExplorerViewSwitch() {
  const viewMode = useExplorerViewStore((state) => state.viewMode);
  const setViewMode = useExplorerViewStore((state) => state.setViewMode);
  const groupRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const activeButton = group.querySelector<HTMLButtonElement>('.view-switch__btn.is-on');
    if (!activeButton) return;
    setIndicatorStyle({ left: activeButton.offsetLeft, width: activeButton.offsetWidth });
  }, [viewMode]);

  return (
    <div
      ref={groupRef}
      className="view-switch view-switch--icons view-switch--indicator"
      role="group"
      aria-label="Mode d'affichage des résultats"
    >
      {indicatorStyle && (
        <span
          className="view-switch__indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${indicatorStyle.left}px)`, width: indicatorStyle.width }}
        />
      )}
      {MODES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={cn('view-switch__btn', viewMode === key && 'is-on')}
          aria-pressed={viewMode === key}
          aria-label={label}
          title={label}
          onClick={() => setViewMode(key)}
        >
          <Icon size={14} aria-hidden />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add the indicator CSS (opt-in via `.view-switch--indicator`, `MapPanel` unaffected)**

In `styles.css`, after the existing `.view-switch__btn.is-on` rule (after line 634), add:
```css
/* Indicateur glissant — opt-in via .view-switch--indicator, mesuré en JS
   (largeur des boutons dérivée du padding, pas une hypothèse 25%/bouton). */
.view-switch--indicator {
  position: relative;
}
.view-switch--indicator .view-switch__btn {
  position: relative;
  z-index: 1;
  background: transparent;
  box-shadow: none;
  transition: color 140ms ease;
}
.view-switch--indicator .view-switch__btn.is-on {
  background: transparent;
  box-shadow: none;
}
.view-switch__indicator {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  border-radius: 7px;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(24, 49, 59, 0.12);
  transition: transform 180ms var(--ease-premium-out), width 180ms var(--ease-premium-out);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .view-switch__indicator {
    transition: none !important;
  }
}
```
(`.view-switch--indicator .view-switch__btn.is-on` overrides the base `.view-switch__btn.is-on`'s own `background`/`box-shadow` — those visual cues now live on the sliding `.view-switch__indicator` span instead, sitting behind the buttons via `z-index`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/components/explorer/ExplorerViewSwitch.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/components/explorer/ExplorerViewSwitch.tsx bertel-tourism-ui/src/components/explorer/ExplorerViewSwitch.test.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(motion): add a ref-measured sliding indicator to ExplorerViewSwitch"
```

### Task 16: Background/color/shadow transitions on the remaining segmented controls

**Files:**
- Modify: `bertel-tourism-ui/src/styles.css` (`.dashboard-tab`, ~lines 10314-10334)
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css` (`.scope-tabs`, `.lang-tabs`)

**Interfaces:** CSS-only. Per the constraints, do **not** retrofit a sliding indicator here — `DashboardTabs`, `ScopeTabs`, `LangTabs` have variable-width tab labels (unlike the icon-only `ExplorerViewSwitch`), so only transition the existing background/color/shadow swap.

- [ ] **Step 1: `.dashboard-tab` — currently has zero transition property**

Locate the rule (`grep -n "\.dashboard-tab" bertel-tourism-ui/src/styles.css`) and add:
```css
.dashboard-tab {
  transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}
```

- [ ] **Step 2: `.scope-tabs` / `.lang-tabs` (object-editor.css) — add transitions to the existing `.is-on` background swap**

Locate `.scope-tabs` (object-editor.css ~418-432) and `.lang-tabs` (~398-413), add to each base button rule:
```css
transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
```

- [ ] **Step 3: Manual verification**

Confirm switching Dashboard's Qualité/Offre/Activité tabs, the editor's Canonique/Mon organisation scope tabs, and the language tabs all visibly cross-fade their background/color instead of snapping.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/styles.css bertel-tourism-ui/src/features/object-editor/object-editor.css
git commit -m "feat(motion): add background/color transitions to remaining segmented controls"
```

### Task 17: `.motion-pop` on inserted filter chips and numeric badges

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx` (chip insertion)
- Modify: `bertel-tourism-ui/src/views/ModerationPage.tsx` (queue-count badge)

**Interfaces:**
- Consumes: `.motion-pop` (Task 1). Numeric badges must be `key`ed by their displayed value so React remounts (and re-triggers the CSS animation) only when the count actually changes — not on every parent re-render.

- [ ] **Step 1: `ExplorerActiveFilters.tsx` — pop-in on newly added chips**

Locate the chip-rendering `.map(...)` (each active filter chip). Add `className="motion-pop"` (merged with the chip's existing classes via `cn(...)`) and a stable `key` per filter value (already required by React; confirm the existing key is the filter's own id/value, not an array index — if it's an index, fix it to the filter's identity so React treats each chip as the same node across re-renders and only mounts-with-animation for genuinely new ones).

- [ ] **Step 2: `ModerationPage.tsx` — pop the queue-count badge only when its value changes**

Find the pending-count badge (e.g. `<span className="...badge...">{pendingCount}</span>`). Change to:
```tsx
<span key={pendingCount} className={cn('...badge...', 'motion-pop')}>{pendingCount}</span>
```
(Keying by `pendingCount` itself means React remounts the `<span>` — and replays `.motion-pop`'s enter animation — only on an actual count change, not on unrelated re-renders. Import `cn` from `@/lib/utils` if not already imported in this file.)

- [ ] **Step 3: Manual verification**

Add/remove an Explorer filter and confirm the new chip pops in (no pop on chips that were already present); trigger a moderation queue count change (approve/reject an item in another tab or via a test fixture) and confirm the badge pops once, not continuously.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx bertel-tourism-ui/src/views/ModerationPage.tsx
git commit -m "feat(motion): pop-in animation for inserted filter chips and changed count badges"
```

---

## Package 5 — Local async feedback

### Task 18: `EditorActionFeedback` type + `EditorTopbar` pending/success/error

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx`

**Interfaces:**
- Produces: `export type EditorActionFeedback = 'idle' | 'pending' | 'success' | 'error';` (new file-local type, exported for `ObjectEditPage` to consume in Task 19). New `EditorTopbarProps` fields: `saveFeedback?: EditorActionFeedback` and `publishFeedback?: EditorActionFeedback` — **additive**, default `'idle'`, so the existing `publishing`/`saving`/`savingDraft` booleans keep gating `disabled` exactly as today (this task only adds the visual feedback layer on top, it does not replace the existing disable-logic).

- [ ] **Step 1: Write the new/changed tests**

In `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx`, keep every existing case (breadcrumbs, mode toggle, disabled-when-clean, Publier stays clickable with blockers, 'Publication…' while publishing, validation chip) and add:
```tsx
it('shows a spinner and "Enregistrement…" while saveFeedback is pending', () => {
  render(<EditorTopbar {...baseProps} saveFeedback="pending" onSaveDraft={() => {}} />);
  expect(screen.getByRole('button', { name: /Enregistrement…/ })).toBeInTheDocument();
});

it('shows a check and "Enregistré" for success, never alongside the spinner', () => {
  render(<EditorTopbar {...baseProps} saveFeedback="success" onSaveDraft={() => {}} />);
  const button = screen.getByRole('button', { name: /Enregistré/ });
  expect(button).toBeInTheDocument();
  expect(button.querySelector('[data-icon="spinner"]')).not.toBeInTheDocument();
});

it('shows an alert and "Échec — réessayer" for error', () => {
  render(<EditorTopbar {...baseProps} saveFeedback="error" onSaveDraft={() => {}} />);
  expect(screen.getByRole('button', { name: /Échec — réessayer/ })).toBeInTheDocument();
});

it('applies the same pending/success/error treatment to Publier via publishFeedback', () => {
  render(<EditorTopbar {...baseProps} publishFeedback="success" />);
  expect(screen.getByRole('button', { name: /Publié/ })).toBeInTheDocument();
});
```
(`baseProps` is whatever minimal-props object the existing test file already builds for other cases — reuse it, adding only the new feedback prop per case.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/shell/EditorTopbar.test.tsx`
Expected: FAIL (props don't exist yet)

- [ ] **Step 3: Implement the feedback rendering**

In `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx`:

Add near the top (after the existing `export type { EditorMode }`):
```tsx
export type EditorActionFeedback = 'idle' | 'pending' | 'success' | 'error';
```

Add imports: `import { Check, AlertTriangle, Loader2 } from 'lucide-react';`

Add to `EditorTopbarProps`:
```tsx
saveFeedback?: EditorActionFeedback;
publishFeedback?: EditorActionFeedback;
```
and destructure with defaults: `saveFeedback = 'idle', publishFeedback = 'idle',`.

Add a small local helper above the component (or inline where the buttons render) that derives label+icon:
```tsx
function feedbackContent(feedback: EditorActionFeedback, idleLabel: string, pendingLabel: string, successLabel: string, errorLabel: string) {
  switch (feedback) {
    case 'pending':
      return { label: pendingLabel, icon: <Loader2 size={13} className="motion-spin" aria-hidden data-icon="spinner" /> };
    case 'success':
      return { label: successLabel, icon: <Check size={13} className="motion-success" aria-hidden /> };
    case 'error':
      return { label: errorLabel, icon: <AlertTriangle size={13} aria-hidden /> };
    default:
      return { label: idleLabel, icon: null };
  }
}
```

Replace the Publier button's body (lines 127-134):
```tsx
<button
  type="button"
  className="btn"
  disabled={publishDisabled || publishing || saving}
  onClick={onPublish}
>
  {(() => {
    const { label, icon } = feedbackContent(publishFeedback, publishing ? 'Publication…' : 'Publier', 'Publication…', 'Publié', 'Échec — réessayer');
    return icon ? <>{icon} {label}</> : label;
  })()}
</button>
```

Replace the Enregistrer button's body (lines 136-151) similarly, keeping the existing `contributorMode` idle-label branching:
```tsx
{onSaveDraft && (
  <button
    type="button"
    className="btn primary"
    disabled={savingDraft || saving || publishing || dirtyCount === 0}
    onClick={onSaveDraft}
  >
    {(() => {
      const idleLabel = contributorMode ? 'Proposer une modification' : 'Enregistrer';
      const pendingLabel = contributorMode ? 'Soumission…' : 'Enregistrement…';
      const { label, icon } = feedbackContent(saveFeedback, savingDraft ? pendingLabel : idleLabel, pendingLabel, 'Enregistré', 'Échec — réessayer');
      return icon ? <>{icon} {label}</> : label;
    })()}
  </button>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/shell/EditorTopbar.test.tsx`
Expected: PASS (existing cases unaffected since `saveFeedback`/`publishFeedback` default to `'idle'`, reproducing today's exact label logic).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx
git commit -m "feat(motion): add pending/success/error feedback rendering to EditorTopbar"
```

### Task 19: Wire `ObjectEditPage` to drive `saveFeedback`/`publishFeedback`, auto-clear success after 1.2s

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

**Interfaces:**
- Consumes: `EditorActionFeedback` (Task 18).
- Produces: two new local state values (`saveFeedback`, `publishFeedback`) threaded into `<EditorTopbar>`; a shared timer-clearing helper so unmounting the page during a pending success-flash cannot call `setState` on an unmounted component.

- [ ] **Step 1: Add the feedback state + a self-clearing setter**

In `ObjectEditPage.tsx`, near the existing `const [statusMessage, setStatusMessage] = useState<string | null>(null);` (line 169), add:
```tsx
const [saveFeedback, setSaveFeedback] = useState<EditorActionFeedback>('idle');
const [publishFeedback, setPublishFeedback] = useState<EditorActionFeedback>('idle');
const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  return () => {
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
  };
}, []);

function flashSuccess(setFeedback: (value: EditorActionFeedback) => void) {
  setFeedback('success');
  if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
  feedbackTimerRef.current = setTimeout(() => setFeedback('idle'), 1200);
}
```
Add the import: `import { type EditorActionFeedback } from './shell/EditorTopbar';` and `useRef` to the existing `react` import if not already present.

- [ ] **Step 2: Drive `saveFeedback` from `handleSaveDraft`**

Current `handleSaveDraft` (lines 385-402):
```tsx
async function handleSaveDraft() {
  setStatusMessage(null);
  setSavingDraft(true);
  try {
    const { ok, saveErrors: errors } = await persistDirtyModules();
    if (ok) {
      setSaveErrors([]);
      toast.success(contributorMode ? 'Modification soumise pour validation' : 'Brouillon enregistré');
    } else {
      setSaveErrors(errors);
      setModalContext('save');
      setBlockersModalOpen(true);
    }
  } finally {
    setSavingDraft(false);
  }
}
```
Change to:
```tsx
async function handleSaveDraft() {
  setStatusMessage(null);
  setSavingDraft(true);
  setSaveFeedback('pending');
  try {
    const { ok, saveErrors: errors } = await persistDirtyModules();
    if (ok) {
      setSaveErrors([]);
      toast.success(contributorMode ? 'Modification soumise pour validation' : 'Brouillon enregistré');
      flashSuccess(setSaveFeedback);
    } else {
      setSaveErrors(errors);
      setModalContext('save');
      setBlockersModalOpen(true);
      setSaveFeedback('error');
    }
  } finally {
    setSavingDraft(false);
  }
}
```

- [ ] **Step 3: Drive `publishFeedback` from `handlePublish`**

Current `handlePublish` (lines 404-434, based on the read excerpt — the success/failure branches inside the `try`/`catch` around `publishObject.mutateAsync`):
```tsx
async function handlePublish() {
  if (validation.blockers.length > 0) {
    // ... existing blocker-gate branch, unchanged ...
    return;
  }

  setStatusMessage(null);
  const { ok, saveErrors: errors } = await persistDirtyModules();
  if (!ok) {
    setSaveErrors(errors);
    setModalContext('save');
    setBlockersModalOpen(true);
    return;
  }

  try {
    await publishObject.mutateAsync(true);
    editor.setSavedStatus('published');
    setSaveErrors([]);
    toast.success('Fiche enregistrée et publiée');
  } catch (error) {
    const issue = publishErrorToIssue(error);
    setSaveErrors([issue]);
    // ... existing error branch continues below the read excerpt — leave as-is ...
  }
}
```
Change to thread `publishFeedback` around the same branches:
```tsx
async function handlePublish() {
  if (validation.blockers.length > 0) {
    // ... existing blocker-gate branch, unchanged ...
    return;
  }

  setStatusMessage(null);
  setPublishFeedback('pending');
  const { ok, saveErrors: errors } = await persistDirtyModules();
  if (!ok) {
    setSaveErrors(errors);
    setModalContext('save');
    setBlockersModalOpen(true);
    setPublishFeedback('error');
    return;
  }

  try {
    await publishObject.mutateAsync(true);
    editor.setSavedStatus('published');
    setSaveErrors([]);
    toast.success('Fiche enregistrée et publiée');
    flashSuccess(setPublishFeedback);
  } catch (error) {
    const issue = publishErrorToIssue(error);
    setSaveErrors([issue]);
    setPublishFeedback('error');
    // ... existing error branch continues unchanged ...
  }
}
```

- [ ] **Step 4: Pass the new props to `<EditorTopbar>`**

At the existing `<EditorTopbar ... />` render (lines 471-494 per research), add:
```tsx
saveFeedback={saveFeedback}
publishFeedback={publishFeedback}
```

- [ ] **Step 5: Run the editor page's existing test suite**

Run: `cd bertel-tourism-ui && npx jest --testPathPattern="ObjectEditPage"`
Expected: PASS (this task is additive; no existing assertion should reference `saveFeedback`/`publishFeedback`).

- [ ] **Step 6: Add one focused test for the auto-clear behavior**

If `ObjectEditPage.test.tsx` exists and already mocks `useEditorSave`/`usePublishObjectWorkspaceMutation`, add:
```tsx
it('flashes save success then returns to idle after 1.2s', async () => {
  jest.useFakeTimers();
  // ... render with a save handler resolving ok:true, per this file's existing mocking pattern ...
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('button', { name: /Enregistré/ })).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(1200); });
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  jest.useRealTimers();
});
```
(Adapt the mock setup to match this file's existing conventions — read the file first if it exists; if no `ObjectEditPage.test.tsx` exists yet, skip this step, it is out of scope to create a full page-level test harness here.)

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx
git commit -m "feat(motion): wire ObjectEditPage save/publish to EditorTopbar's pending/success/error feedback"
```

### Task 20: Local feedback for CreateObjectDialog, InviteMemberDialog, ProfileEditModal

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx`
- Modify: `bertel-tourism-ui/src/features/team/InviteMemberDialog.tsx`
- Modify: `bertel-tourism-ui/src/features/settings/ProfileEditModal.tsx`

**Interfaces:** Each of these already has its own local `busy` boolean; this task adds a success flash next to the button on completion without inventing a new shared component (each already has a different existing feedback shape — inline alert, per-row status list, plain toast — per the research; this task only adds the missing local success acknowledgment next to the button itself, it does not unify the three patterns).

- [ ] **Step 1: `CreateObjectDialog.tsx` — add a brief success check next to the submit button before navigating away**

The current submit handler resets and calls `onCreated(id)` (navigation is the only success signal today, no toast, no local flash). Add a local `justCreated` boolean set `true` right before calling `onCreated(id)`, rendered as a `<Check size={14} className="motion-pop" aria-hidden />` next to the button label for one render (since the component unmounts on navigation immediately after, this is a best-effort visual — do not add an artificial delay before navigating, per the spec's "do not invent fake percentages/delays"). Concretely, change the button label rendering (line ~309-310) from a fixed `busy ? <Loader2 .../>Création… : 'Créer la fiche'` ternary to a 3-way switch also covering `justCreated`.

- [ ] **Step 2: `InviteMemberDialog.tsx` — this already has the richest pattern (per-row status icons); add `.motion-status-enter` to each new row**

Locate the per-row `InviteRow` rendering (status icon + label per address). Add `className="motion-status-enter"` (merged via `cn`) to each row's wrapper, keyed by the address (already the row's natural key) so a newly-added result row animates in without re-animating existing rows.

- [ ] **Step 3: `ProfileEditModal.tsx` — brief success check next to each of the 2 submit surfaces**

For the name-save button (`nameSaving`): on `toast.success(...)` (line 59), also set a local `nameJustSaved` boolean true for 1.2s before the modal closes (`onOpenChange(false)` already fires immediately today at line 60 — reorder so the success flash is visible for at least one frame; if the modal is expected to close immediately per current UX, skip the flash for this button and only add it to avatar upload, which keeps the modal open). For avatar upload (`avatarBusy`): on its `toast.success` (line 76), set `avatarJustUploaded = true` for 1.2s (modal stays open here, so the flash is visible), rendering a `<Check size={14} className="motion-success" aria-hidden />` next to the upload label with the uploaded filename, per the spec's upload-feedback requirement — reuse the same 1.2s-timer-with-cleanup pattern from Task 19's `flashSuccess`.

- [ ] **Step 4: Run each file's existing tests**

Run: `cd bertel-tourism-ui && npx jest --testPathPattern="(CreateObjectDialog|InviteMemberDialog|ProfileEditModal)"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx bertel-tourism-ui/src/features/team/InviteMemberDialog.tsx bertel-tourism-ui/src/features/settings/ProfileEditModal.tsx
git commit -m "feat(motion): add local success feedback to CreateObjectDialog, InviteMemberDialog rows, ProfileEditModal"
```

### Task 21: `OfflineBanner` + `PeerSavedBanner` on `usePresence`

**Files:**
- Modify: `bertel-tourism-ui/src/components/common/OfflineBanner.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/PeerSavedBanner.tsx`
- Test: `bertel-tourism-ui/src/components/common/OfflineBanner.test.tsx` (new — none exists today)
- Modify: `bertel-tourism-ui/src/styles.css` (`.offline-banner`, line ~795; `.peer-saved-banner` in `object-editor.css`, lines 2780-2788)

**Interfaces:**
- Consumes: `usePresence` (Task 4).

- [ ] **Step 1: Write the failing test for `OfflineBanner`**

Create `bertel-tourism-ui/src/components/common/OfflineBanner.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

describe('OfflineBanner', () => {
  beforeEach(() => setOnline(true));

  it('renders nothing while online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays mounted through the exit window after coming back online', () => {
    jest.useFakeTimers();
    render(<OfflineBanner />);
    act(() => setOnline(false));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => setOnline(true));
    expect(screen.getByRole('status')).toBeInTheDocument(); // still mounted, exiting
    act(() => { jest.advanceTimersByTime(140); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/common/OfflineBanner.test.tsx`
Expected: FAIL (current component unmounts synchronously, no exit window)

- [ ] **Step 3: Rewrite `OfflineBanner.tsx`**

```tsx
'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';

const OFFLINE_BANNER_EXIT_MS = 140;

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Bandeau global « hors ligne » (D4), piloté par navigator.onLine seul : le
 * statut réseau du store (présence realtime) couvre d'autres dégradations et
 * a déjà sa pastille dans la TopBar ; ici on ne signale que la coupure réelle.
 * Motion pass : usePresence garde le bandeau monté le temps de la sortie
 * (140ms) pour que l'annonce role="status" reste lisible aux lecteurs d'écran
 * au lieu de disparaître sur le même rendu que le retour en ligne.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const { shouldRender, phase } = usePresence(!isOnline, OFFLINE_BANNER_EXIT_MS);

  if (!shouldRender) {
    return null;
  }

  return (
    <div role="status" className="offline-banner motion-status-enter" data-motion-phase={phase}>
      <WifiOff size={14} aria-hidden />
      <span>Hors ligne — vos modifications ne peuvent pas être enregistrées.</span>
    </div>
  );
}
```

- [ ] **Step 4: Add exit transition CSS for `.offline-banner`**

In `styles.css`, at the existing `.offline-banner` rule (line ~795), add:
```css
.offline-banner[data-motion-phase='exiting'] {
  opacity: 0;
  transform: translateY(var(--motion-distance-md));
  transition: opacity 140ms var(--ease-premium-in), transform 140ms var(--ease-premium-in);
}
```

- [ ] **Step 5: Apply the same treatment to `PeerSavedBanner.tsx`**

Rewrite `bertel-tourism-ui/src/features/object-editor/widgets/PeerSavedBanner.tsx`:
```tsx
import { usePresence } from '../../../hooks/usePresence';
import type { PeerSavedNotice } from '../presence/editor-presence';

interface PeerSavedBannerProps {
  notice: PeerSavedNotice | null;
  onReload: () => void;
  onDismiss: () => void;
}

const PEER_SAVED_BANNER_EXIT_MS = 140;

/**
 * Non-blocking conflict banner: another editor saved the fiche while you have it open.
 * Reloading pulls in their changes; otherwise your next save may overwrite them.
 * Motion pass: usePresence keeps this mounted through its exit fade instead of
 * vanishing instantly on dismiss/reload.
 */
export function PeerSavedBanner({ notice, onReload, onDismiss }: PeerSavedBannerProps) {
  const { shouldRender, phase } = usePresence(notice !== null, PEER_SAVED_BANNER_EXIT_MS);

  if (!shouldRender || !notice) {
    return null;
  }

  return (
    <div className="peer-saved-banner motion-status-enter" data-motion-phase={phase} role="status">
      <span className="peer-saved-banner__text">
        <strong>{notice.name}</strong> a enregistré cette fiche. Recharge pour intégrer ses
        changements, sinon ton prochain enregistrement pourrait les écraser.
      </span>
      <span className="peer-saved-banner__actions">
        <button type="button" className="btn sm primary" onClick={onReload}>
          Recharger
        </button>
        <button type="button" className="btn sm" onClick={onDismiss}>
          Ignorer
        </button>
      </span>
    </div>
  );
}
```
(`!shouldRender || !notice` guards the render body — `notice` can go `null` while `shouldRender` is still `true` during the exit window, since the caller clears `notice` immediately on dismiss.)

- [ ] **Step 6: Add exit transition CSS for `.peer-saved-banner`**

In `bertel-tourism-ui/src/features/object-editor/object-editor.css`, at the existing rule (lines 2780-2788), add:
```css
.object-editor .peer-saved-banner[data-motion-phase='exiting'] {
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 140ms var(--ease-premium-in), transform 140ms var(--ease-premium-in);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd bertel-tourism-ui && npx jest src/components/common/OfflineBanner.test.tsx`
Expected: PASS. Also run any existing `PeerSavedBanner` test if one exists (`grep -rn "PeerSavedBanner.test" bertel-tourism-ui/src`).

- [ ] **Step 8: Commit**

```bash
git add bertel-tourism-ui/src/components/common/OfflineBanner.tsx bertel-tourism-ui/src/components/common/OfflineBanner.test.tsx bertel-tourism-ui/src/features/object-editor/widgets/PeerSavedBanner.tsx bertel-tourism-ui/src/styles.css bertel-tourism-ui/src/features/object-editor/object-editor.css
git commit -m "feat(motion): animate OfflineBanner and PeerSavedBanner exits via usePresence"
```

### Task 22: `.motion-status-enter` on CRM saved banner and inline validation confirmations

**Files:**
- Modify: `bertel-tourism-ui/src/features/crm/CrmInteractionModal.tsx` (lines 263-265)
- Modify: `bertel-tourism-ui/src/features/crm/CrmActorModals.tsx` (lines 645-649, 661-665)
- Modify: `bertel-tourism-ui/src/features/settings/PartnerKeysSettings.tsx` (lines 106-114)

**Interfaces:** No hook needed here — these are one-way appearances (the CRM saved banner permanently replaces the composer form; inline validation messages don't need a JS-managed exit, only an entrance). Add `.motion-status-enter` as a plain CSS class; the browser replays the CSS animation automatically whenever the element is freshly mounted (ternary swap / `&&`-conditional), which is exactly when these appear.

- [ ] **Step 1: `CrmInteractionModal.tsx` — CRM saved banner**

At lines 263-265, add the class to the existing `<div className="crm-saved-banner" role="status">`:
```tsx
<div className="crm-saved-banner motion-status-enter" role="status">
```

- [ ] **Step 2: `CrmActorModals.tsx` — 2 inline validation messages**

At lines 645-649 and 661-665, add the class to each:
```tsx
<p className="crm-field__hint motion-status-enter" role="status">Standardisez chaque adresse...</p>
```
```tsx
<div className="inline-alert motion-status-enter" role="alert">Échec de l'enregistrement...</div>
```
(Per the spec's "persistent errors should not auto-dismiss" — this task only adds the entrance animation; it does not add any auto-dismiss timer to the error alert.)

- [ ] **Step 3: `PartnerKeysSettings.tsx` — issued-key confirmation**

At lines 106-114:
```tsx
<div className="inline-alert inline-alert--ok motion-status-enter" role="status">... Clé émise ...</div>
```

- [ ] **Step 4: Manual verification**

Save a CRM interaction and confirm the confirmation banner fades+lifts in; trigger the address-format hint and a save failure in `CrmActorModals` and confirm both fade in (the error must stay visible — no auto-dismiss); issue a partner key and confirm the same.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/crm/CrmInteractionModal.tsx bertel-tourism-ui/src/features/crm/CrmActorModals.tsx bertel-tourism-ui/src/features/settings/PartnerKeysSettings.tsx
git commit -m "feat(motion): add status-enter animation to CRM saved banner and inline validation messages"
```

---

## Package 6 — Final consistency pass

### Task 23: Repo-wide scoped audit + `graphify update`

**Files:** none created — verification only, fixes applied inline if the audit finds a violation introduced by this plan's own tasks.

- [ ] **Step 1: Confirm no `transition-all`/`transition: all` remains**

Run: `cd bertel-tourism-ui && grep -rn "transition-all" src/ ; grep -n "transition: all" src/styles.css`
Expected: 0 matches.

- [ ] **Step 2: Confirm no new animation touches `width`/`height`/`top`/`left`**

Run: `cd bertel-tourism-ui && grep -n "transition:" src/styles.css | grep -E "\b(width|height|top|left)\b"`
Expected: only the pre-existing sidebar width transition and any pre-existing data-bar width indicator (per the constraints) — no new match introduced by this plan's tasks. Cross-check every match against the list of files touched by Tasks 1-22.

- [ ] **Step 3: Confirm no decorative animation exceeds 300ms and no element moves more than 18px**

Manually review the durations/transforms introduced in Tasks 1, 5, 7, 15, 21: `--motion-surface` (280ms, Sheet/drawer) is the longest; `translateX(18px)` (Modal drawer variant, Task 5) is the largest single-axis movement — both are exactly at the spec's ceilings, not over them. No task introduces anything larger.

- [ ] **Step 4: Confirm hover-only feedback has focus-visible equivalents**

Run: `cd bertel-tourism-ui && grep -n ":hover" src/styles.css | wc -l` then spot-check the button families touched in Tasks 2/3/14: `.primary-button`/`.ghost-button`/`.crm-btn`/`.object-editor .btn`/`components/ui/button.tsx` all inherit the existing global `:where(:focus-visible)` outline rule (`styles.css:200-204`) independent of `:hover` — confirm none of this plan's new rules scope a hover-only visual (e.g. the `.view-switch__indicator`'s position change from Task 15 is driven by `is-on`/click state, not hover, so it's unaffected).

- [ ] **Step 5: Run the full suite + typecheck**

Run:
```bash
cd bertel-tourism-ui
npx tsc --noEmit --pretty false
npx jest --runInBand
```
Expected: 0 type errors, all suites green.

- [ ] **Step 6: Run `graphify update`**

Run: `graphify update .` (from the repo root, `C:\Users\dphil\Bertel3.0`)

- [ ] **Step 7: Commit (only if Step 1-4 found something to fix; otherwise this task is verification-only, no commit)**

```bash
git add -A
git commit -m "chore(motion): final scoped-transition audit fixes + graphify refresh"
```

### Task 24: Manual visual QA + E2E scenario (demo mode)

**Files:**
- Create: `bertel-tourism-ui/e2e/premium-motion.spec.ts` (or the project's existing Playwright spec location — check `grep -rn "test.describe" bertel-tourism-ui/e2e` first for the right directory/import pattern before creating a new file)

- [ ] **Step 1: Write the E2E scenario**

Following this repo's existing Playwright spec conventions (import `test`/`expect` from `@playwright/test`, navigate via `page.goto`), cover exactly the 6 scenarios already specified by the source design doc's "Integration and E2E checks" section:
1. Navigate Dashboard → Explorer → CRM without a blank workspace (assert each route's skeleton or content is visible at every step, never a blank `<main>`).
2. Open/close one centered modal (`ConfirmDialog` via any destructive action in `/settings`), one drawer-variant `Modal` (`MobileNavDrawer` on a narrow viewport), and the object drawer (`ObjectDrawer` Sheet).
3. Assert the closing surface has `[data-motion-phase="exiting"]` present for at least one frame after triggering close (poll immediately after the close click, before it disappears).
4. Save an editor draft, assert the "Enregistrement…" pending label appears then "Enregistré" success label appears.
5. Change the Explorer view mode via `ExplorerViewSwitch`, assert `aria-pressed` flips and the indicator's inline `transform` style changes.
6. Repeat steps 2-3 with `page.emulateMedia({ reducedMotion: 'reduce' })` set before navigation, and assert the closing surface unmounts on the very next check (no `[data-motion-phase="exiting"]` observed with a delay).

- [ ] **Step 2: Run the E2E suite**

Run: `cd bertel-tourism-ui && npx playwright test premium-motion` (adjust to this repo's actual `npm run test:e2e` script if it wraps Playwright differently — check `package.json`'s `scripts` first).
Expected: all 6 scenarios pass.

- [ ] **Step 3: Manual visual QA at 1440px, 768px, 390px**

Using the browser preview, walk the full manual QA checklist from the source design doc at each breakpoint: modal/drawer motion doesn't clip or reveal white edges; the object drawer finishes within 300ms; skeleton-to-content swap doesn't shift layout; repeated button presses never leave controls visibly scaled at rest; toasts don't overlap the offline banner or drawer close controls; keyboard focus stays visible through every transition; rapid open/close/reopen of a Modal produces no stuck overlay; with `prefers-reduced-motion: reduce` forced on, confirm no sliding/scaling/shimmer-loop/delayed navigation anywhere touched by this plan.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/e2e/premium-motion.spec.ts
git commit -m "test(motion): add E2E coverage for modal/drawer presence, editor feedback, view-switch indicator"
```

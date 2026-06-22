# Global Live-Presence Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-room "X live" pill in the top bar with a site-wide presence indicator that counts distinct people (deduplicated) and opens a "who's online" panel (avatar + name + "en ligne depuis").

**Architecture:** A single Supabase Realtime presence channel (`presence:global`) mounted once in `AppBootstrap` via a new `useGlobalPresence` hook. The hook deduplicates presence by `userId`, writes the roster (`liveMembers`) and a unified `networkStatus` into the Zustand UI store, and is the **sole writer** of `networkStatus` (replacing `useNetworkMonitor`). A new `LivePresenceIndicator` component renders the pill + panel from the store. The per-object editor presence hook (`usePresenceRoom`) is left functionally unchanged except for removing its now-unused global-sync branch.

**Tech Stack:** Next.js App Router (React 19), TypeScript, Zustand, `@supabase/supabase-js` Realtime presence, Jest + React Testing Library, Tailwind + global `src/styles.css`.

## Global Constraints

- **Frontend only.** No SQL, no schema/RPC changes.
- **All commands run from `bertel-tourism-ui/`.** Tests: `npm run test:run -- <path>`. Typecheck: `npm run typecheck`. Build: `npm run build`.
- **`networkStatus` has exactly one writer** after this work: `useGlobalPresence`. Type: `'connected' | 'degraded' | 'offline'` (`src/types/domain.ts:2`).
- **Count = distinct persons** (dedup by `userId`); the current user is included and marked « · Vous ».
- **`PresenceMember`** (`src/types/domain.ts:307`): `{ userId: string; name: string; avatar: string; color: string; onlineSince?: number }`.
- **French copy, verbatim:** « En ligne », « Temps réel interrompu », « Hors ligne », « {n} personne(s) en ligne », « Vous êtes seul·e en ligne. », « Présence indisponible (hors ligne). ».
- **Per-object editor presence unchanged** (verrous de champs, typing, snackbar « X a quitté la page »).
- **Commits:** Conventional Commits, **no co-author trailer**, commit only the task's own files; the user pushes.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/presence.ts` *(new)* | Pure helpers: `dedupePresenceMembers`, `deriveNetworkStatus`, `networkStatusLabel`, `formatPresenceDuration`, `initials` (last two **moved** from `PresenceRail`) |
| `src/lib/presence.test.ts` *(new)* | Unit tests for the pure helpers |
| `src/hooks/useGlobalPresence.ts` *(new)* | Always-on global presence channel → writes `liveMembers` + `networkStatus` |
| `src/hooks/useGlobalPresence.test.tsx` *(new)* | Demo-mode + no-client behaviour |
| `src/components/layout/LivePresenceIndicator.tsx` *(new)* | Pill + "who's online" panel (hover + click) |
| `src/components/layout/LivePresenceIndicator.test.tsx` *(new)* | Render count, open panel, self marker, alone state, offline label |
| `src/store/ui-store.ts` *(modify)* | Add `liveMembers` + `setLivePresence`; later remove `liveUsersCount` + `setLiveUsersCount` |
| `src/components/common/AppBootstrap.tsx` *(modify)* | Mount `useGlobalPresence()`; drop `useNetworkMonitor()` |
| `src/components/layout/TopBar.tsx` *(modify)* | Render `<LivePresenceIndicator />` |
| `src/hooks/usePresenceRoom.ts` *(modify)* | Remove the unused `syncGlobalStatus` branch |
| `src/views/ExplorerPage.tsx` *(modify)* | Remove the global-count-only presence call |
| `src/views/CrmPage.tsx` *(modify)* | Drop `syncGlobalStatus` (keep the room for `typingUsers`) |
| `src/features/object-editor/widgets/PresenceRail.tsx` *(modify)* | Import `formatPresenceDuration`/`initials` from `src/lib/presence` |
| `src/features/object-editor/widgets/PresenceRail.test.tsx` *(modify)* | Drop the moved `formatPresenceDuration` block |
| `src/hooks/useNetworkMonitor.ts` *(delete)* | Folded into `useGlobalPresence` |
| `src/styles.css` *(modify)* | `.live-presence*` panel styles |

---

## Task 1: Pure presence helpers + PresenceRail refactor

**Files:**
- Create: `bertel-tourism-ui/src/lib/presence.ts`
- Create: `bertel-tourism-ui/src/lib/presence.test.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/PresenceRail.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/PresenceRail.test.tsx`

**Interfaces:**
- Produces:
  - `dedupePresenceMembers(state: Record<string, PresenceTrackPayload[]>, selfId: string | null): PresenceMember[]`
  - `deriveNetworkStatus(browserOnline: boolean, realtimeStatus: RealtimeConnState): NetworkStatus`
  - `networkStatusLabel(status: NetworkStatus): { tone: 'green'|'orange'|'red'; label: string; description: string }`
  - `formatPresenceDuration(onlineSince: number | undefined, now: number): string | null`
  - `initials(name: string): string`
  - `type RealtimeConnState = 'subscribed' | 'connecting' | 'error' | 'closed'`
  - `interface PresenceTrackPayload { userId: string; name: string; avatar: string; color: string; onlineSince?: number }`

- [ ] **Step 1: Write the failing test** — create `bertel-tourism-ui/src/lib/presence.test.ts`:

```ts
import {
  dedupePresenceMembers,
  deriveNetworkStatus,
  formatPresenceDuration,
  initials,
  networkStatusLabel,
} from './presence';

const FIVE_MIN_MS = 5 * 60 * 1000;

describe('dedupePresenceMembers', () => {
  it('collapses several connections of one person into a single member', () => {
    const state = {
      u1: [
        { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 3000 },
        { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 1000 },
        { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 2000 },
      ],
    };
    const members = dedupePresenceMembers(state, 'u1');
    expect(members).toHaveLength(1);
    expect(members[0].onlineSince).toBe(1000); // earliest arrival wins
  });

  it('sorts the current user first, then by arrival time', () => {
    const state = {
      u2: [{ userId: 'u2', name: 'Bob', avatar: 'BO', color: '#000', onlineSince: 1000 }],
      me: [{ userId: 'me', name: 'Moi', avatar: 'MO', color: '#000', onlineSince: 5000 }],
    };
    const members = dedupePresenceMembers(state, 'me');
    expect(members.map((m) => m.userId)).toEqual(['me', 'u2']);
  });

  it('returns an empty list for an empty state', () => {
    expect(dedupePresenceMembers({}, 'me')).toEqual([]);
  });
});

describe('deriveNetworkStatus', () => {
  it('is offline whenever the browser is offline', () => {
    expect(deriveNetworkStatus(false, 'subscribed')).toBe('offline');
  });
  it('is connected when online and subscribed', () => {
    expect(deriveNetworkStatus(true, 'subscribed')).toBe('connected');
  });
  it('is degraded when online but the channel is not subscribed', () => {
    expect(deriveNetworkStatus(true, 'connecting')).toBe('degraded');
    expect(deriveNetworkStatus(true, 'error')).toBe('degraded');
    expect(deriveNetworkStatus(true, 'closed')).toBe('degraded');
  });
});

describe('networkStatusLabel', () => {
  it('maps each status to a French label + tone', () => {
    expect(networkStatusLabel('connected')).toMatchObject({ tone: 'green', label: 'En ligne' });
    expect(networkStatusLabel('degraded')).toMatchObject({ tone: 'orange', label: 'Temps réel interrompu' });
    expect(networkStatusLabel('offline')).toMatchObject({ tone: 'red', label: 'Hors ligne' });
  });
});

describe('initials', () => {
  it('takes up to two uppercased initials', () => {
    expect(initials('Marie Durand')).toBe('MD');
    expect(initials('cilaos')).toBe('C');
  });
});

describe('formatPresenceDuration', () => {
  const now = 1_700_000_000_000;
  it('returns null when the join time is unknown', () => {
    expect(formatPresenceDuration(undefined, now)).toBeNull();
    expect(formatPresenceDuration(Number.NaN, now)).toBeNull();
  });
  it('shows "à l\'instant" under one minute', () => {
    expect(formatPresenceDuration(now - 30_000, now)).toBe("à l'instant");
  });
  it('shows minutes for sub-hour durations', () => {
    expect(formatPresenceDuration(now - FIVE_MIN_MS, now)).toBe('depuis 5 min');
  });
  it('shows whole hours with no remainder', () => {
    expect(formatPresenceDuration(now - 60 * 60 * 1000, now)).toBe('depuis 1 h');
  });
  it('shows hours and minutes together', () => {
    expect(formatPresenceDuration(now - 80 * 60 * 1000, now)).toBe('depuis 1 h 20 min');
  });
  it('clamps a future join time to "à l\'instant"', () => {
    expect(formatPresenceDuration(now + FIVE_MIN_MS, now)).toBe("à l'instant");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `bertel-tourism-ui/`): `npm run test:run -- src/lib/presence.test.ts`
Expected: FAIL — `Cannot find module './presence'`.

- [ ] **Step 3: Create `bertel-tourism-ui/src/lib/presence.ts`**

```ts
import type { NetworkStatus, PresenceMember } from '../types/domain';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** One raw presence entry as tracked on the realtime channel (one per connection). */
export interface PresenceTrackPayload {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  onlineSince?: number;
}

/** Realtime channel connection state, normalised for status derivation. */
export type RealtimeConnState = 'subscribed' | 'connecting' | 'error' | 'closed';

/**
 * Deduplicate a Supabase presence state into one member per person.
 * presenceState() returns { [presenceKey]: [payload, ...] }, and the key is the userId,
 * so each key is one person even with several tabs/connections open.
 * onlineSince = the EARLIEST across that person's connections (first arrival).
 * Sort: the current user (selfId) first, then by onlineSince, then by name.
 */
export function dedupePresenceMembers(
  state: Record<string, PresenceTrackPayload[]>,
  selfId: string | null,
): PresenceMember[] {
  const members: PresenceMember[] = Object.entries(state).map(([key, entries]) => {
    const first = entries[0];
    const sinces = entries
      .map((entry) => entry?.onlineSince)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return {
      userId: first?.userId ?? key,
      name: first?.name ?? 'Utilisateur',
      avatar: first?.avatar ?? '',
      color: first?.color ?? '',
      onlineSince: sinces.length > 0 ? Math.min(...sinces) : undefined,
    };
  });

  return members.sort((a, b) => {
    if (a.userId === selfId) return -1;
    if (b.userId === selfId) return 1;
    const aSince = a.onlineSince ?? Number.POSITIVE_INFINITY;
    const bSince = b.onlineSince ?? Number.POSITIVE_INFINITY;
    if (aSince !== bSince) return aSince - bSince;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Single source of truth for the network pill state. Browser-offline always wins (red);
 * otherwise the channel decides: subscribed = green, anything else = degraded (orange).
 */
export function deriveNetworkStatus(
  browserOnline: boolean,
  realtimeStatus: RealtimeConnState,
): NetworkStatus {
  if (!browserOnline) return 'offline';
  if (realtimeStatus === 'subscribed') return 'connected';
  return 'degraded';
}

export interface NetworkStatusLabel {
  tone: 'green' | 'orange' | 'red';
  label: string;
  description: string;
}

/** French label + tone + tooltip copy for a network status. */
export function networkStatusLabel(status: NetworkStatus): NetworkStatusLabel {
  switch (status) {
    case 'connected':
      return { tone: 'green', label: 'En ligne', description: 'Connexion temps réel active.' };
    case 'degraded':
      return {
        tone: 'orange',
        label: 'Temps réel interrompu',
        description: 'Tes données restent à jour ; seule la présence live est en pause.',
      };
    case 'offline':
    default:
      return { tone: 'red', label: 'Hors ligne', description: 'Aucune connexion réseau détectée.' };
  }
}

/** Up to two uppercased initials from a display name (e.g. "Marie Durand" -> "MD"). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Human-readable "how long this member has been online" label.
 * Returns null when the join time is unknown.
 */
export function formatPresenceDuration(onlineSince: number | undefined, now: number): string | null {
  if (onlineSince == null || !Number.isFinite(onlineSince)) {
    return null;
  }

  const elapsedMs = Math.max(0, now - onlineSince);
  const totalMinutes = Math.floor(elapsedMs / MINUTE_MS);

  if (totalMinutes < 1) {
    return "à l'instant";
  }
  if (elapsedMs < HOUR_MS) {
    return `depuis ${totalMinutes} min`;
  }

  const hours = Math.floor(elapsedMs / HOUR_MS);
  const minutes = totalMinutes - hours * 60;
  return minutes === 0 ? `depuis ${hours} h` : `depuis ${hours} h ${minutes} min`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/lib/presence.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Refactor `PresenceRail.tsx` to consume the shared helpers**

In `bertel-tourism-ui/src/features/object-editor/widgets/PresenceRail.tsx`:
- Replace the import line `import type { PresenceMember } from '../../../types/domain';` with:

```ts
import type { PresenceMember } from '../../../types/domain';
import { formatPresenceDuration, initials } from '../../../lib/presence';
```

- **Delete** the local `function initials(name: string)` block (lines ~30-37) and the local `export function formatPresenceDuration(...)` block (lines ~39-61). Keep `computeDepartedPeers` and the component. The component body still calls `initials(...)` and `formatPresenceDuration(...)` — now resolved from the import.

- [ ] **Step 6: Update `PresenceRail.test.tsx`** — the `formatPresenceDuration` tests now live in `presence.test.ts`.

In `bertel-tourism-ui/src/features/object-editor/widgets/PresenceRail.test.tsx`:
- Change the import on line 3 from:
  `import { PresenceRail, computeDepartedPeers, formatPresenceDuration } from './PresenceRail';`
  to:
  `import { PresenceRail, computeDepartedPeers } from './PresenceRail';`
- **Delete** the entire `describe('formatPresenceDuration', () => { ... });` block (lines ~22-49). Leave the `PresenceRail`, `computeDepartedPeers`, and snackbar describes untouched.

- [ ] **Step 7: Run the affected suites to verify green**

Run: `npm run test:run -- src/lib/presence.test.ts src/features/object-editor/widgets/PresenceRail.test.tsx`
Expected: PASS — both files green (duration behaviour preserved, just relocated).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add bertel-tourism-ui/src/lib/presence.ts bertel-tourism-ui/src/lib/presence.test.ts \
  bertel-tourism-ui/src/features/object-editor/widgets/PresenceRail.tsx \
  bertel-tourism-ui/src/features/object-editor/widgets/PresenceRail.test.tsx
git commit -m "refactor(presence): extract pure presence helpers into src/lib/presence"
```

---

## Task 2: UI store — add the live-members slice (additive)

**Files:**
- Modify: `bertel-tourism-ui/src/store/ui-store.ts`
- Create: `bertel-tourism-ui/src/store/ui-store.presence.test.ts`

**Interfaces:**
- Consumes: `PresenceMember` (`src/types/domain.ts`).
- Produces: store fields `liveMembers: PresenceMember[]` and `setLivePresence: (members: PresenceMember[]) => void`. (`liveUsersCount`/`setLiveUsersCount` remain for now; removed in Task 6.)

- [ ] **Step 1: Write the failing test** — create `bertel-tourism-ui/src/store/ui-store.presence.test.ts`:

```ts
import { useUiStore } from './ui-store';

describe('ui-store live presence slice', () => {
  it('defaults to an empty roster', () => {
    expect(useUiStore.getState().liveMembers).toEqual([]);
  });

  it('replaces the roster via setLivePresence', () => {
    useUiStore.getState().setLivePresence([
      { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 1000 },
    ]);
    expect(useUiStore.getState().liveMembers).toHaveLength(1);
    expect(useUiStore.getState().liveMembers[0].name).toBe('Marie');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/store/ui-store.presence.test.ts`
Expected: FAIL — `setLivePresence is not a function` / `liveMembers` undefined.

- [ ] **Step 3: Add the slice to `ui-store.ts`**

- Update the type import (line 4) to include `PresenceMember`:

```ts
import type { MapLayerMode, NetworkStatus, ObjectTypeCode, PresenceMember } from '../types/domain';
```

- In the `interface UiState` block, after `liveUsersCount: number;` add:

```ts
  liveMembers: PresenceMember[];
```

- In the same interface, after `setLiveUsersCount: (count: number) => void;` add:

```ts
  setLivePresence: (members: PresenceMember[]) => void;
```

- In the store creator initial state, after `liveUsersCount: 3,` add:

```ts
      liveMembers: [],
```

- In the actions, after `setLiveUsersCount: (count) => set({ liveUsersCount: count }),` add:

```ts
      setLivePresence: (members) => set({ liveMembers: members }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/store/ui-store.presence.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/store/ui-store.ts bertel-tourism-ui/src/store/ui-store.presence.test.ts
git commit -m "feat(presence): add liveMembers roster to the UI store"
```

---

## Task 3: `useGlobalPresence` hook (not yet mounted)

**Files:**
- Create: `bertel-tourism-ui/src/hooks/useGlobalPresence.ts`
- Create: `bertel-tourism-ui/src/hooks/useGlobalPresence.test.tsx`

**Interfaces:**
- Consumes: `dedupePresenceMembers`, `deriveNetworkStatus`, `PresenceTrackPayload`, `RealtimeConnState` (`src/lib/presence`); `getSupabaseClient` (`src/lib/supabase`); `mockPresence` (`src/data/mock`); `useSessionStore`, `useUiStore`.
- Produces: `useGlobalPresence(): void` — side effect only; writes `liveMembers` + `networkStatus` into the UI store.

- [ ] **Step 1: Write the failing test** — create `bertel-tourism-ui/src/hooks/useGlobalPresence.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import { useGlobalPresence } from './useGlobalPresence';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

describe('useGlobalPresence', () => {
  beforeEach(() => {
    useUiStore.setState({ liveMembers: [], networkStatus: 'connected' });
  });

  it('demo mode publishes the mock roster with the current user first and a healthy status', () => {
    useSessionStore.setState({ demoMode: true, userId: 'usr-local-marie', userName: 'Marie D.', avatar: 'MA' });
    renderHook(() => useGlobalPresence());
    const state = useUiStore.getState();
    expect(state.liveMembers.length).toBeGreaterThanOrEqual(2);
    expect(state.liveMembers[0].name).toBe('Marie D.');
    expect(state.networkStatus).toBe('connected');
  });

  it('with no Supabase client, shows only yourself and offline', () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    useSessionStore.setState({ demoMode: false, userId: 'u1', userName: 'Solo', avatar: 'SO' });
    renderHook(() => useGlobalPresence());
    const state = useUiStore.getState();
    expect(state.liveMembers).toHaveLength(1);
    expect(state.liveMembers[0].userId).toBe('u1');
    expect(state.networkStatus).toBe('offline');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/hooks/useGlobalPresence.test.tsx`
Expected: FAIL — `Cannot find module './useGlobalPresence'`.

- [ ] **Step 3: Create `bertel-tourism-ui/src/hooks/useGlobalPresence.ts`**

```ts
import { useEffect, useRef } from 'react';
import { mockPresence } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import {
  dedupePresenceMembers,
  deriveNetworkStatus,
  type PresenceTrackPayload,
  type RealtimeConnState,
} from '../lib/presence';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';
import type { PresenceMember } from '../types/domain';

const GLOBAL_PRESENCE_ROOM = 'presence:global';
const SELF_COLOR = '#ff7b54';
const DEMO_STAGGER_MS = 7 * 60_000;

/**
 * Site-wide presence: a single realtime channel mounted ONCE (in AppBootstrap) that
 * publishes the deduplicated roster of people currently online + a unified network
 * status into the UI store. This hook is the SOLE writer of networkStatus.
 */
export function useGlobalPresence(): void {
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const avatar = useSessionStore((state) => state.avatar);
  const demoMode = useSessionStore((state) => state.demoMode);
  const setLivePresence = useUiStore((state) => state.setLivePresence);
  const setNetworkStatus = useUiStore((state) => state.setNetworkStatus);
  // Captured once: when this tab came online.
  const onlineSinceRef = useRef(Date.now());

  useEffect(() => {
    const me: PresenceMember = {
      userId: userId ?? 'anonymous',
      name: userName || 'Vous',
      avatar: avatar || '–',
      color: SELF_COLOR,
      onlineSince: onlineSinceRef.current,
    };

    // Demo mode: static roster, healthy connection (showcase).
    if (demoMode) {
      const others = mockPresence
        .filter((member) => member.userId !== me.userId)
        .slice(0, 2)
        .map((member, index) => ({ ...member, onlineSince: onlineSinceRef.current - (index + 1) * DEMO_STAGGER_MS }));
      setLivePresence([me, ...others]);
      setNetworkStatus('connected');
      return undefined;
    }

    const client = getSupabaseClient();

    // No backend configured or not authenticated yet: show just yourself, offline.
    if (!client || !userId) {
      setLivePresence(userId ? [me] : []);
      setNetworkStatus('offline');
      return undefined;
    }

    let realtimeStatus: RealtimeConnState = 'connecting';
    const applyNetworkStatus = () => {
      setNetworkStatus(deriveNetworkStatus(navigator.onLine, realtimeStatus));
    };

    const channel = client.channel(GLOBAL_PRESENCE_ROOM, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceTrackPayload>();
      setLivePresence(dedupePresenceMembers(state as Record<string, PresenceTrackPayload[]>, userId));
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        realtimeStatus = 'subscribed';
        applyNetworkStatus();
        await channel.track(me);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeStatus = 'error';
        applyNetworkStatus();
      } else if (status === 'CLOSED') {
        realtimeStatus = 'closed';
        applyNetworkStatus();
      }
    });

    const handleBrowserChange = () => applyNetworkStatus();
    window.addEventListener('online', handleBrowserChange);
    window.addEventListener('offline', handleBrowserChange);
    applyNetworkStatus();

    return () => {
      window.removeEventListener('online', handleBrowserChange);
      window.removeEventListener('offline', handleBrowserChange);
      void channel.untrack();
      void channel.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [demoMode, userId, userName, avatar, setLivePresence, setNetworkStatus]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/hooks/useGlobalPresence.test.tsx`
Expected: PASS — both cases green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/hooks/useGlobalPresence.ts bertel-tourism-ui/src/hooks/useGlobalPresence.test.tsx
git commit -m "feat(presence): add global presence hook (channel + unified status)"
```

---

## Task 4: `LivePresenceIndicator` component + styles (not yet wired)

**Files:**
- Create: `bertel-tourism-ui/src/components/layout/LivePresenceIndicator.tsx`
- Create: `bertel-tourism-ui/src/components/layout/LivePresenceIndicator.test.tsx`
- Modify: `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consumes: `useUiStore` (`liveMembers`, `networkStatus`), `useSessionStore` (`userId`), `formatPresenceDuration`, `initials`, `networkStatusLabel` (`src/lib/presence`).
- Produces: `<LivePresenceIndicator />` (no props).

- [ ] **Step 1: Write the failing test** — create `bertel-tourism-ui/src/components/layout/LivePresenceIndicator.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LivePresenceIndicator } from './LivePresenceIndicator';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import type { PresenceMember } from '../../types/domain';
import type { NetworkStatus } from '../../types/domain';

function seed(members: PresenceMember[], networkStatus: NetworkStatus = 'connected') {
  useUiStore.setState({ liveMembers: members, networkStatus });
}

describe('LivePresenceIndicator', () => {
  beforeEach(() => {
    useSessionStore.setState({ userId: 'me' });
    seed([{ userId: 'me', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: Date.now() - 5 * 60_000 }]);
  });

  it('shows the live count in the trigger', () => {
    render(<LivePresenceIndicator />);
    expect(screen.getByRole('button', { name: /1 live/i })).toBeInTheDocument();
  });

  it('opens the panel on click and marks the current user', async () => {
    const user = userEvent.setup();
    seed([
      { userId: 'me', name: 'Marie', avatar: 'MA', color: '#ff7b54' },
      { userId: 'u2', name: 'Jean', avatar: 'JE', color: '#4cb3ff' },
    ]);
    render(<LivePresenceIndicator />);
    await user.click(screen.getByRole('button', { name: /2 live/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Marie · Vous')).toBeInTheDocument();
    expect(screen.getByText('Jean')).toBeInTheDocument();
  });

  it('opens on hover and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<LivePresenceIndicator />);
    await user.hover(screen.getByRole('button', { name: /1 live/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tells you when you are alone online', async () => {
    const user = userEvent.setup();
    render(<LivePresenceIndicator />);
    await user.click(screen.getByRole('button', { name: /1 live/i }));
    expect(screen.getByText('Vous êtes seul·e en ligne.')).toBeInTheDocument();
  });

  it('surfaces the offline label when the network is down', () => {
    seed([], 'offline');
    render(<LivePresenceIndicator />);
    expect(screen.getByText('Hors ligne')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/components/layout/LivePresenceIndicator.test.tsx`
Expected: FAIL — `Cannot find module './LivePresenceIndicator'`.

- [ ] **Step 3: Create `bertel-tourism-ui/src/components/layout/LivePresenceIndicator.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { formatPresenceDuration, initials, networkStatusLabel } from '../../lib/presence';

const TICK_MS = 30_000;

export function LivePresenceIndicator() {
  const liveMembers = useUiStore((state) => state.liveMembers);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const selfId = useSessionStore((state) => state.userId);

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const net = networkStatusLabel(networkStatus);
  const count = liveMembers.length;
  const isAlone = count === 1 && liveMembers[0]?.userId === selfId;

  // Keep the "en ligne depuis" labels fresh while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [open]);

  // Close on Escape or outside click while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [open]);

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      setOpen(next);
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      className="live-presence"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      {networkStatus !== 'connected' ? (
        <span className={`status-pill status-pill--${net.tone}`} title={net.description}>
          <span className="status-pill__dot" aria-hidden="true" />
          {net.label}
        </span>
      ) : null}

      <button
        type="button"
        className={`status-pill status-pill--${net.tone} live-presence__trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="live-presence-panel"
        onClick={togglePin}
        onFocus={() => setOpen(true)}
      >
        <span className="status-pill__dot" aria-hidden="true" />
        {count} live
      </button>

      {open ? (
        <div
          id="live-presence-panel"
          role="dialog"
          aria-label="Personnes en ligne"
          className="live-presence__panel"
        >
          <div className="live-presence__header">
            <strong>
              {count} {count > 1 ? 'personnes' : 'personne'} en ligne
            </strong>
            <span className={`live-presence__net live-presence__net--${net.tone}`} title={net.description}>
              <span className="status-pill__dot" aria-hidden="true" />
              {net.label}
            </span>
          </div>

          {count === 0 ? (
            <p className="live-presence__empty">Présence indisponible (hors ligne).</p>
          ) : (
            <ul className="live-presence__list">
              {liveMembers.map((member) => {
                const isSelf = member.userId === selfId;
                const duration = formatPresenceDuration(member.onlineSince, now);
                return (
                  <li key={member.userId} className="live-presence__row">
                    <span
                      className="avatar-chip"
                      style={{ backgroundColor: member.color || 'var(--theme-primary)' }}
                    >
                      {member.avatar || initials(member.name) || '?'}
                    </span>
                    <span className="live-presence__person">
                      <strong>
                        {member.name}
                        {isSelf ? ' · Vous' : ''}
                      </strong>
                      {duration ? <small>{duration}</small> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {isAlone ? <p className="live-presence__alone">Vous êtes seul·e en ligne.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Append styles to `bertel-tourism-ui/src/styles.css`** (after the `.avatar-chip--overflow` block, ~line 1169):

```css
.live-presence {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.live-presence__trigger {
  cursor: pointer;
}

.live-presence__panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 60;
  width: 16rem;
  max-width: 80vw;
  padding: 0.75rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: 0 18px 40px rgba(20, 16, 8, 0.16);
  animation: live-presence-pop 140ms ease-out;
}

@keyframes live-presence-pop {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .live-presence__panel { animation: none; }
}

.live-presence__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.live-presence__net {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
}

.live-presence__net--green { color: #1e6e57; }
.live-presence__net--orange { color: #a05b1f; }
.live-presence__net--red { color: #a14532; }

.live-presence__list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.live-presence__row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.live-presence__row .avatar-chip {
  width: 28px;
  height: 28px;
  margin-left: 0;
  font-size: 0.65rem;
  border-width: 0;
}

.live-presence__person {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.live-presence__person strong { font-size: 0.82rem; }
.live-presence__person small { font-size: 0.7rem; opacity: 0.7; }

.live-presence__empty,
.live-presence__alone {
  margin: 0.5rem 0 0;
  font-size: 0.76rem;
  opacity: 0.75;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- src/components/layout/LivePresenceIndicator.test.tsx`
Expected: PASS — all five cases green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/components/layout/LivePresenceIndicator.tsx \
  bertel-tourism-ui/src/components/layout/LivePresenceIndicator.test.tsx \
  bertel-tourism-ui/src/styles.css
git commit -m "feat(presence): live-presence indicator with who's-online panel"
```

---

## Task 5: Wire the indicator + global hook into the app shell

**Files:**
- Modify: `bertel-tourism-ui/src/components/common/AppBootstrap.tsx`
- Modify: `bertel-tourism-ui/src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `useGlobalPresence` (Task 3), `LivePresenceIndicator` (Task 4).
- Produces: the global indicator visible in the top bar; `useGlobalPresence` mounted once.

- [ ] **Step 1: Mount the global hook in `AppBootstrap.tsx`**

Replace the whole file `bertel-tourism-ui/src/components/common/AppBootstrap.tsx` with:

```tsx
'use client';

import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useCardCacheBootstrap } from '@/hooks/useCardCacheBootstrap';
import { useGlobalPresence } from '@/hooks/useGlobalPresence';

export function AppBootstrap() {
  useBootstrapSession();
  useGlobalPresence();
  useCardCacheBootstrap();

  return null;
}
```

- [ ] **Step 2: Render the indicator in `TopBar.tsx`**

In `bertel-tourism-ui/src/components/layout/TopBar.tsx`:

- Replace the import line `import { StatusPill } from '../common/StatusPill';` with:
  `import { LivePresenceIndicator } from './LivePresenceIndicator';`
- **Delete** these three lines from the component body:
  ```ts
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  ```
  and
  ```ts
  const networkTone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';
  ```
- Replace the pill block:
  ```tsx
          {networkStatus !== 'connected' ? (
            <StatusPill tone={networkTone}>{networkStatus}</StatusPill>
          ) : null}
          <StatusPill tone={networkTone}>
            {liveUsersCount} live
          </StatusPill>
  ```
  with:
  ```tsx
          <LivePresenceIndicator />
  ```

> `useUiStore` is still imported (used for `drawerObjectId`/`closeDrawer`). Leave that import.

- [ ] **Step 3: Typecheck (catches any dangling reference)**

Run: `npm run typecheck`
Expected: exit 0. (If it flags an unused `useUiStore` selector you removed, that's expected to be clean — only the three lines above are removed.)

- [ ] **Step 4: Run the presence + indicator suites to confirm no regression**

Run: `npm run test:run -- src/components/layout/LivePresenceIndicator.test.tsx src/hooks/useGlobalPresence.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/components/common/AppBootstrap.tsx bertel-tourism-ui/src/components/layout/TopBar.tsx
git commit -m "feat(presence): wire global presence indicator into the top bar"
```

---

## Task 6: Remove the legacy global-count wiring (cleanup)

**Files:**
- Modify: `bertel-tourism-ui/src/hooks/usePresenceRoom.ts`
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx`
- Modify: `bertel-tourism-ui/src/views/CrmPage.tsx`
- Modify: `bertel-tourism-ui/src/store/ui-store.ts`
- Delete: `bertel-tourism-ui/src/hooks/useNetworkMonitor.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `usePresenceRoom` no longer exposes `syncGlobalStatus`; the store no longer has `liveUsersCount`/`setLiveUsersCount`; `useNetworkMonitor` is gone. `networkStatus` now has a single writer.

- [ ] **Step 1: Strip `syncGlobalStatus` from `usePresenceRoom.ts`**

In `bertel-tourism-ui/src/hooks/usePresenceRoom.ts`:
- In `interface UsePresenceRoomOptions`, delete the line `syncGlobalStatus?: boolean;`.
- In the destructure, change
  `const { enabled = true, syncGlobalStatus = false } = options;`
  to
  `const { enabled = true } = options;`
- Delete the two store selector lines:
  ```ts
  const setNetworkStatus = useUiStore((state) => state.setNetworkStatus);
  const setLiveUsersCount = useUiStore((state) => state.setLiveUsersCount);
  ```
- Delete the `useUiStore` import if it is now unused (verify nothing else in the file references `useUiStore`; if so, remove `import { useUiStore } from '../store/ui-store';`).
- In the **demo branch**, delete:
  ```ts
      if (syncGlobalStatus) {
        setLiveUsersCount(demoPeers.length);
        setNetworkStatus(navigator.onLine ? 'degraded' : 'offline');
      }
  ```
- In the **no-client branch**, delete:
  ```ts
      if (syncGlobalStatus) {
        setLiveUsersCount(1);
        setNetworkStatus('offline');
      }
  ```
- In the **presence `sync` handler**, delete:
  ```ts
      if (syncGlobalStatus) {
        setLiveUsersCount(nextPeers.length);
      }
  ```
- In the **`channel.subscribe` callback**, delete the three `if (syncGlobalStatus) { setNetworkStatus(...) }` blocks (in the `SUBSCRIBED`, `CHANNEL_ERROR/TIMED_OUT`, and `CLOSED` arms), leaving each arm to do its non-status work (the `SUBSCRIBED` arm keeps `await channel.track(me);`).
- In the effect dependency array, remove `setLiveUsersCount`, `setNetworkStatus`, and `syncGlobalStatus`. Final deps: `[demoMode, enabled, me, roomKey, userId]`.

- [ ] **Step 2: Remove the global-count-only call from `ExplorerPage.tsx`**

In `bertel-tourism-ui/src/views/ExplorerPage.tsx`:
- Delete the line `usePresenceRoom('room:explorer', { syncGlobalStatus: true });` (≈ line 39).
- Delete the now-unused import `import { usePresenceRoom } from '../hooks/usePresenceRoom';` (≈ line 8) **only if** no other reference to `usePresenceRoom` remains in the file (verify with a search; the Explorer used it solely for the global count).

- [ ] **Step 3: Drop `syncGlobalStatus` in `CrmPage.tsx`**

In `bertel-tourism-ui/src/views/CrmPage.tsx` (≈ line 92-95): change
```ts
  // syncGlobalStatus: true alimente le badge « X live » du header (présence) ; on garde le hook
  ...
  const { typingUsers } = usePresenceRoom('crm:tasks', { syncGlobalStatus: true });
```
to
```ts
  // Salon de présence du CRM : on n'en garde que l'indicateur « est en train d'écrire ».
  // Le compteur « X live » du header est désormais alimenté par useGlobalPresence (site-wide).
  const { typingUsers } = usePresenceRoom('crm:tasks');
```

- [ ] **Step 4: Remove `liveUsersCount` from `ui-store.ts`**

In `bertel-tourism-ui/src/store/ui-store.ts`:
- In `interface UiState`, delete `liveUsersCount: number;` and `setLiveUsersCount: (count: number) => void;`.
- In the initial state, delete `liveUsersCount: 3,`.
- In the actions, delete `setLiveUsersCount: (count) => set({ liveUsersCount: count }),`.

- [ ] **Step 5: Delete the obsolete network monitor**

```bash
git rm bertel-tourism-ui/src/hooks/useNetworkMonitor.ts
```

- [ ] **Step 6: Typecheck — proves nothing still references the removed symbols**

Run: `npm run typecheck`
Expected: exit 0. (A failure here means a leftover reference to `liveUsersCount`, `setLiveUsersCount`, `syncGlobalStatus`, or `useNetworkMonitor` — fix it before continuing.)

- [ ] **Step 7: Run the full test suite**

Run: `npm run test:run`
Expected: PASS — entire suite green (incl. `usePresenceRoom.test.tsx`, which never used `syncGlobalStatus`).

- [ ] **Step 8: Production build**

Run: `npm run build`
Expected: exit 0 (`next build --webpack` completes; note: build excludes `*.test.*`).

- [ ] **Step 9: Commit**

```bash
git add bertel-tourism-ui/src/hooks/usePresenceRoom.ts bertel-tourism-ui/src/views/ExplorerPage.tsx \
  bertel-tourism-ui/src/views/CrmPage.tsx bertel-tourism-ui/src/store/ui-store.ts \
  bertel-tourism-ui/src/hooks/useNetworkMonitor.ts
git commit -m "refactor(presence): retire per-room global count + useNetworkMonitor (single status writer)"
```

---

## Task 7: Manual verification + decision log

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

- [ ] **Step 1: Manual smoke (dev server)**

Run: `npm run dev`, log in (or demo mode). Verify in the top bar:
- Single tab, alone → pill reads **« 1 live »**, green dot.
- Open a **second tab** of the same account → still **« 1 live »** (dedup by person).
- Hover the pill → panel opens listing yourself as « <nom> · Vous » + « en ligne depuis … » and « Vous êtes seul·e en ligne. ». Click pins it open; `Échap` / click-outside closes it.
- The pill now shows on every page that has the top bar (Dashboard, CRM, Explorer, Équipe), not just Explorer/CRM.
- Toggle the browser offline (DevTools → Network → Offline) → pill turns red with **« Hors ligne »**; back online → returns to green.

- [ ] **Step 2: Append a decision-log entry** to `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (new § at the end), recording: global `presence:global` channel mounted once in `AppBootstrap`; count deduplicated per `userId`; `useGlobalPresence` is the single writer of `networkStatus` (replaces `useNetworkMonitor`); `usePresenceRoom` reduced to per-object presence; new `src/lib/presence.ts` pure helpers; French status labels. Reference this plan + the spec `docs/superpowers/specs/2026-06-22-global-live-presence-indicator-design.md`.

- [ ] **Step 3: Commit**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
git commit -m "docs(decision-log): global live-presence indicator (site-wide who's online)"
```

---

## Self-Review

**Spec coverage**
- Global single channel mounted once → Task 3 (`useGlobalPresence`) + Task 5 (`AppBootstrap`). ✓
- Dedup by person (multi-tab = 1) → Task 1 (`dedupePresenceMembers`) + Task 3 wiring. ✓
- Hover + click panel with avatar + name + "en ligne depuis", self marked « Vous » → Task 4. ✓
- Unified network status, single writer, French labels → Task 1 (`deriveNetworkStatus`/`networkStatusLabel`) + Task 3 + Task 6 (remove `useNetworkMonitor`). ✓
- Remove stale `liveUsersCount: 3` default → Task 2 (`liveMembers: []`) + Task 6 (remove `liveUsersCount`). ✓
- Editor per-object presence unchanged → Task 1 only relocates pure helpers (re-imported); `usePresenceRoom` keeps locks/typing; Task 6 removes only the unused `syncGlobalStatus` branch. ✓
- Demo mode roster → Task 3 demo branch + test. ✓
- No-userId / no-client edge cases → Task 3 branch + test. ✓
- Decision-log update (project rule) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has an expected result. ✓

**Type consistency:** `dedupePresenceMembers(state, selfId)`, `deriveNetworkStatus(browserOnline, realtimeStatus)`, `networkStatusLabel(status)`, `setLivePresence(members)`, `liveMembers`, `PresenceTrackPayload`, `RealtimeConnState` are used identically across Tasks 1-6. `LivePresenceIndicator` consumes exactly the store/session fields defined earlier. ✓

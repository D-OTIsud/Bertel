# Dashboard statistiques — Lots 0+1 (socle onglets + filtres) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructurer la page `/dashboard` en 3 onglets par vocation avec React Query + états visibles, et livrer toute l'intégration des filtres (filtres avancés, drill-down, pont Explorer) — lots 0 et 1 de la spec `docs/superpowers/specs/2026-06-11-dashboard-statistics-design.md`.

**Architecture:** 100 % frontend (aucun SQL — toutes les clés de filtre utilisées existent déjà dans `api.get_filtered_object_ids`). Une route `/dashboard`, scorecards héro permanentes, onglets Qualité/Offre/Activité pilotés par le store zustand existant, fetch par widget via React Query (clé = filtres), widgets existants re-homés. Les lots 2-5 (SQL) auront leurs propres plans.

**Tech Stack:** Next.js (app router), React 18, zustand, @tanstack/react-query v5 (déjà configuré dans `src/app/query-client.ts`), Jest + React Testing Library, Supabase JS (PostgREST direct sur `ref_*` publiques + RPC `api.*`).

**Répertoire de travail :** `bertel-tourism-ui/` (toutes les commandes s'exécutent depuis ce dossier). Tests : `npm run test:run -- <pattern>` ; typecheck : `npm run typecheck`.

**Conventions du repo à respecter :**
- Commits sur `master`, l'utilisateur pousse manuellement (`git push` sandbox-bloqué).
- Pas de mocks pour les nouvelles données (mémoire « prefer real DB data ») ; le mode démo affiche l'état vide pour les nouveautés.
- Aucun contrôle éditable sans persistance (invariant no-write-trap) — ici tout est filtre, pas d'écriture objet.

---

## Vue d'ensemble des fichiers

| Fichier | Action | Rôle |
|---|---|---|
| `src/types/dashboard.ts` | Modifier | + `DashboardTabKey`, + 3 champs `DashboardFilters` |
| `src/store/dashboard-filter-store.ts` | Modifier | + `activeTab`/`setActiveTab` |
| `src/store/dashboard-filter-store.test.ts` | Créer | tests store |
| `src/hooks/useDashboardQuery.ts` (+ `.test.tsx`) | Créer | wrapper useQuery par widget |
| `src/components/dashboard/WidgetFrame.tsx` (+ `.test.tsx`) | Créer | états chargement/erreur/vide |
| `src/components/dashboard/DashboardTabs.tsx` (+ `.test.tsx`) | Créer | barre d'onglets |
| `src/views/DashboardPage.tsx` (+ `.test.tsx`) | Réécrire | héro + onglets + React Query |
| `src/styles.css` | Modifier | classes `.dashboard-tabs`, états widget |
| `src/services/dashboard-rpc.ts` (+ `.test.ts`) | Modifier | export `buildRpcParams` + 3 clés |
| `src/services/dashboard-reference.ts` (+ `.test.ts`) | Créer | catalogues filtres avancés |
| `src/components/dashboard/DashboardFiltersPanel.tsx` | Modifier | groupe « Filtres avancés » |
| `src/components/dashboard/ActiveFilterStrip.tsx` (+ `.test.tsx`) | Modifier | chips nouveaux filtres + bouton Explorer |
| `src/components/dashboard/TypeBreakdown.tsx` (+ `.test.tsx`) | Modifier | drill-down types |
| `src/components/dashboard/ActualisationTable.tsx` (+ `.test.tsx`) | Modifier | drill-down types |
| `src/lib/dashboard-to-explorer.ts` (+ `.test.ts`) | Créer | pont filtres dashboard → URL Explorer |

**Faits vérifiés sur lesquels ce plan s'appuie :**
- `CommuneDistribution.tsx` a DÉJÀ le drill-down communes (toggle + `--active`) : c'est le modèle à répliquer.
- `DistinctionOverview` ne reçoit PAS de drill-down dans ce lot (exige la clé résolveur `classification_schemes_any`, lot 5 — spec §5.2 amendée).
- L'Explorer lit ses filtres depuis l'URL au mount (`useExplorerUrlSync` → `parseSearchParams`) ; `buildSearchParams(filters)` (`src/lib/explorer-search-params.ts:176`) sérialise un `ExplorerFilters` complet → le pont est une simple navigation URL.
- Catalogues : `ref_code_domain_registry(domain,name,is_taxonomy,position)`, `ref_code(domain,code,name,is_active,position)`, `ref_classification_scheme(code,name,is_distinction)`, `ref_classification_value(code,name,scheme_id,position)`, `ref_language(code,name,position)`, `ref_tag(slug,name,position)`, `ref_amenity(family:family_id(code,name),scope)` — tous en lecture publique RLS.
- `classifications_any` = `[{scheme_code, value_code}]` matché sur `cached_classification_codes` (`'scheme:value'`) ; `amenity_families_any` = codes famille ; `languages_any` = codes langue sur `cached_language_codes` ; `tags_any` = slugs `ref_tag` via `tag_link`.

---

## LOT 0 — Socle onglets + React Query

### Task 1: Onglet actif dans le store dashboard

**Files:**
- Modify: `src/types/dashboard.ts` (en tête, après les imports)
- Modify: `src/store/dashboard-filter-store.ts`
- Create: `src/store/dashboard-filter-store.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/store/dashboard-filter-store.test.ts
import { useDashboardFilterStore } from './dashboard-filter-store';

describe('dashboard-filter-store — onglets', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality' });
  });

  it("démarre sur l'onglet Qualité", () => {
    expect(useDashboardFilterStore.getState().activeTab).toBe('quality');
  });

  it("change d'onglet via setActiveTab", () => {
    useDashboardFilterStore.getState().setActiveTab('offer');
    expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
  });

  it("resetFilters ne touche pas l'onglet actif", () => {
    useDashboardFilterStore.getState().setActiveTab('activity');
    useDashboardFilterStore.getState().setFilters({ types: ['HOT'] });
    useDashboardFilterStore.getState().resetFilters();
    expect(useDashboardFilterStore.getState().activeTab).toBe('activity');
    expect(useDashboardFilterStore.getState().filters).toEqual({ status: ['published'] });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- dashboard-filter-store`
Expected: FAIL — `activeTab`/`setActiveTab` n'existent pas (erreur TS/undefined).

- [ ] **Step 3: Implémenter**

Dans `src/types/dashboard.ts`, après le bloc d'import :

```ts
/** Onglets du dashboard — un par vocation (spec 2026-06-11 §3). */
export type DashboardTabKey = 'quality' | 'offer' | 'activity';
```

Dans `src/store/dashboard-filter-store.ts` (fichier complet remplacé) :

```ts
import { create } from 'zustand';
import type { DashboardFilters, DashboardTabKey } from '../types/dashboard';

interface DashboardFilterState {
  filters: DashboardFilters;
  /** Onglet actif — survit à resetFilters (le reset porte sur les filtres, pas la navigation). */
  activeTab: DashboardTabKey;
  sidebarCollapsed: boolean;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
  setActiveTab: (tab: DashboardTabKey) => void;
  toggleSidebar: () => void;
}

const DEFAULT_FILTERS: DashboardFilters = { status: ['published'] };

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  activeTab: 'quality',
  sidebarCollapsed: false,
  setFilters: (patch) =>
    set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- dashboard-filter-store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/dashboard.ts src/store/dashboard-filter-store.ts src/store/dashboard-filter-store.test.ts
git commit -m "feat(dashboard): onglet actif dans le store (DashboardTabKey, defaut quality)"
```

---

### Task 2: Hook `useDashboardQuery`

**Files:**
- Create: `src/hooks/useDashboardQuery.ts`
- Create: `src/hooks/useDashboardQuery.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// src/hooks/useDashboardQuery.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDashboardQuery } from './useDashboardQuery';
import type { DashboardFilters } from '../types/dashboard';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDashboardQuery', () => {
  const filters: DashboardFilters = { status: ['published'], types: ['HOT'] };

  it('retourne les données du fetcher', async () => {
    const fetcher = jest.fn().mockResolvedValue({ total: 42 });
    const { result } = renderHook(
      () => useDashboardQuery('scorecards', filters, fetcher),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual({ total: 42 }));
    expect(fetcher).toHaveBeenCalledWith(filters);
  });

  it('expose error quand le fetcher rejette', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () => useDashboardQuery('scorecards', filters, fetcher),
      { wrapper },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it('ne fetch pas quand enabled=false', async () => {
    const fetcher = jest.fn().mockResolvedValue({});
    renderHook(() => useDashboardQuery('scorecards', filters, fetcher, false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- useDashboardQuery`
Expected: FAIL — module `./useDashboardQuery` introuvable.

- [ ] **Step 3: Implémenter**

```ts
// src/hooks/useDashboardQuery.ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardFilters } from '../types/dashboard';

// React Query hash la queryKey en JSON à clés triées : passer l'objet filters
// directement suffit pour que deux états de filtres identiques partagent le cache.
const DASHBOARD_STALE_TIME_MS = 60_000;

export function useDashboardQuery<T>(
  widget: string,
  filters: DashboardFilters,
  fetcher: (filters: DashboardFilters) => Promise<T>,
  enabled = true,
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: ['dashboard', widget, filters],
    queryFn: () => fetcher(filters),
    staleTime: DASHBOARD_STALE_TIME_MS,
    enabled,
  });
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- useDashboardQuery`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDashboardQuery.ts src/hooks/useDashboardQuery.test.tsx
git commit -m "feat(dashboard): hook useDashboardQuery (React Query par widget, cle = filtres)"
```

---

### Task 3: Composant `WidgetFrame` (états chargement / erreur / vide)

**Files:**
- Create: `src/components/dashboard/WidgetFrame.tsx`
- Create: `src/components/dashboard/WidgetFrame.test.tsx`
- Modify: `src/styles.css` (ajout en fin de fichier)

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// src/components/dashboard/WidgetFrame.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetFrame } from './WidgetFrame';

describe('WidgetFrame', () => {
  it('affiche le chargement', () => {
    render(<WidgetFrame isLoading error={null}><p>contenu</p></WidgetFrame>);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
    expect(screen.queryByText('contenu')).not.toBeInTheDocument();
  });

  it("affiche l'erreur avec bouton réessayer", () => {
    const onRetry = jest.fn();
    render(
      <WidgetFrame isLoading={false} error={new Error('x')} onRetry={onRetry}>
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("affiche l'état vide", () => {
    render(
      <WidgetFrame isLoading={false} error={null} isEmpty emptyLabel="Rien ici.">
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByText('Rien ici.')).toBeInTheDocument();
  });

  it('affiche les enfants sinon', () => {
    render(<WidgetFrame isLoading={false} error={null}><p>contenu</p></WidgetFrame>);
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- WidgetFrame`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```tsx
// src/components/dashboard/WidgetFrame.tsx
"use client";

import type { ReactNode } from 'react';

interface WidgetFrameProps {
  isLoading: boolean;
  error: unknown;
  /** true quand la donnée est chargée mais vide pour les filtres courants. */
  isEmpty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * Enveloppe d'état des widgets dashboard : fin des erreurs avalées en
 * console.error — chaque widget montre explicitement chargement / erreur / vide.
 */
export function WidgetFrame({
  isLoading,
  error,
  isEmpty = false,
  emptyLabel = 'Aucun objet ne correspond aux filtres.',
  onRetry,
  children,
}: WidgetFrameProps) {
  if (isLoading) {
    return (
      <article className="kpi-panel kpi-panel--state" role="status" aria-live="polite">
        <span className="dashboard-widget-state">Chargement…</span>
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
      <article className="kpi-panel kpi-panel--state">
        <span className="dashboard-widget-state">{emptyLabel}</span>
      </article>
    );
  }
  return <>{children}</>;
}
```

En fin de `src/styles.css` :

```css
/* ── Dashboard — états de widget (WidgetFrame) ─────────────────────────────── */
.kpi-panel--state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 140px;
}
.dashboard-widget-state { color: var(--ink-3); font-size: 13px; }
.dashboard-widget-state--error { color: #c85c48; }
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- WidgetFrame`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/WidgetFrame.tsx src/components/dashboard/WidgetFrame.test.tsx src/styles.css
git commit -m "feat(dashboard): WidgetFrame — etats chargement/erreur/vide visibles"
```

---

### Task 4: Composant `DashboardTabs`

**Files:**
- Create: `src/components/dashboard/DashboardTabs.tsx`
- Create: `src/components/dashboard/DashboardTabs.test.tsx`
- Modify: `src/styles.css` (ajout en fin de fichier)

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// src/components/dashboard/DashboardTabs.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardTabs } from './DashboardTabs';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

describe('DashboardTabs', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ activeTab: 'quality' });
  });

  it('rend les 3 onglets avec le premier actif', () => {
    render(<DashboardTabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Qualité de la base',
      'Offre du territoire',
      'Activité équipe',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('change le store au clic', () => {
    render(<DashboardTabs />);
    fireEvent.click(screen.getByRole('tab', { name: 'Offre du territoire' }));
    expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- DashboardTabs`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```tsx
// src/components/dashboard/DashboardTabs.tsx
"use client";

import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import type { DashboardTabKey } from '../../types/dashboard';

const TABS: { key: DashboardTabKey; label: string }[] = [
  { key: 'quality', label: 'Qualité de la base' },
  { key: 'offer', label: 'Offre du territoire' },
  { key: 'activity', label: 'Activité équipe' },
];

export function DashboardTabs() {
  const activeTab = useDashboardFilterStore((s) => s.activeTab);
  const setActiveTab = useDashboardFilterStore((s) => s.setActiveTab);

  return (
    <div className="dashboard-tabs" role="tablist" aria-label="Sections du tableau de bord">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={activeTab === tab.key ? 'dashboard-tab dashboard-tab--active' : 'dashboard-tab'}
          onClick={() => setActiveTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

En fin de `src/styles.css` :

```css
/* ── Dashboard — onglets par vocation ──────────────────────────────────────── */
.dashboard-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  margin: 4px 0 12px;
}
.dashboard-tab {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-3);
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  cursor: pointer;
}
.dashboard-tab:hover { color: var(--ink-1); }
.dashboard-tab--active {
  color: var(--ink-1);
  border-bottom-color: var(--teal);
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- DashboardTabs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardTabs.tsx src/components/dashboard/DashboardTabs.test.tsx src/styles.css
git commit -m "feat(dashboard): barre d'onglets Qualite/Offre/Activite"
```

---

### Task 5: Recâblage `DashboardPage` (héro + onglets + React Query)

**Files:**
- Modify (réécriture): `src/views/DashboardPage.tsx`
- Create: `src/views/DashboardPage.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// src/views/DashboardPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';

jest.mock('../services/dashboard-rpc', () => ({
  getDashboardScorecards: jest.fn().mockResolvedValue({
    total: 10, published: 8, published_pct: 80, avg_completeness: null,
    pending_changes: 1, delta_30d: 2, delta_pct: null, avg_processing_days: null,
  }),
  getDashboardTypeBreakdown: jest.fn().mockResolvedValue({
    total: 10,
    rows: [{ type: 'HOT', count: 10, published: 8, draft: 2, archived: 0, pct_of_total: 100 }],
  }),
  getDashboardCityDistribution: jest.fn().mockResolvedValue({
    rows: [{ city: 'Le Tampon', count: 5, delta_30d: 1 }],
  }),
  getDashboardActualisation: jest.fn().mockResolvedValue({
    threshold_days: 90,
    rows: [{ type: 'HOT', total: 10, up_to_date: 7, to_review: 2, stale: 1, rate: 70, weekly_rates: null }],
  }),
  getDashboardDistinctionOverview: jest.fn().mockResolvedValue({
    total_scoped: 10, with_distinction: 4, without_distinction: 6, distinction_pct: 40,
    by_scheme: [{ scheme_code: 'hot_stars', scheme_name: 'Étoiles hôtel', display_group: 'official_classification', count: 4 }],
  }),
  getDashboardFilterOptions: jest.fn().mockResolvedValue({ cities: ['Le Tampon'], lieuDits: [] }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('DashboardPage — onglets', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality' });
  });

  it("l'onglet Qualité (défaut) montre répartition + actualisation, pas les communes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Par type d'objet")).toBeInTheDocument());
    expect(screen.getByText("Taux d'actualisation")).toBeInTheDocument();
    expect(screen.queryByText('Par commune')).not.toBeInTheDocument();
  });

  it("l'onglet Offre montre communes + distinctions", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Offre du territoire' }));
    await waitFor(() => expect(screen.getByText('Par commune')).toBeInTheDocument());
    expect(screen.getByText('Distinctions')).toBeInTheDocument();
    expect(screen.queryByText("Taux d'actualisation")).not.toBeInTheDocument();
  });

  it("l'onglet Activité affiche le panneau « à venir » explicite", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Activité équipe' }));
    expect(await screen.findByText(/lot 4/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- DashboardPage`
Expected: FAIL — la page actuelle n'a ni rôle `tab` ni découpage par onglet.

- [ ] **Step 3: Réécrire `DashboardPage.tsx`**

```tsx
// src/views/DashboardPage.tsx
"use client";

import { useQuery } from '@tanstack/react-query';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import {
  getDashboardScorecards,
  getDashboardTypeBreakdown,
  getDashboardCityDistribution,
  getDashboardActualisation,
  getDashboardDistinctionOverview,
  getDashboardFilterOptions,
} from '../services/dashboard-rpc';
import { useDashboardQuery } from '../hooks/useDashboardQuery';
import { ScorecardStrip } from '../components/dashboard/ScorecardStrip';
import { TypeBreakdown } from '../components/dashboard/TypeBreakdown';
import { CommuneDistribution } from '../components/dashboard/CommuneDistribution';
import { ActualisationTable } from '../components/dashboard/ActualisationTable';
import { DistinctionOverview } from '../components/dashboard/DistinctionOverview';
import { DashboardFiltersPanel } from '../components/dashboard/DashboardFiltersPanel';
import { ActiveFilterStrip } from '../components/dashboard/ActiveFilterStrip';
import { DashboardTabs } from '../components/dashboard/DashboardTabs';
import { WidgetFrame } from '../components/dashboard/WidgetFrame';

export default function DashboardPage() {
  const filters = useDashboardFilterStore((s) => s.filters);
  const activeTab = useDashboardFilterStore((s) => s.activeTab);

  // Options de filtre corpus-wide — indépendantes des filtres actifs.
  const filterOptions = useQuery({
    queryKey: ['dashboard', 'filter-options'],
    queryFn: getDashboardFilterOptions,
  });
  const filterOptionsError = filterOptions.error
    ? 'Impossible de charger les options de filtre'
    : null;

  // Héro permanent ; les widgets d'onglet ne fetchent que quand leur onglet est visible.
  const scorecards = useDashboardQuery('scorecards', filters, getDashboardScorecards);
  const typeBreakdown = useDashboardQuery('type-breakdown', filters, getDashboardTypeBreakdown, activeTab === 'quality');
  const actualisation = useDashboardQuery('actualisation', filters, getDashboardActualisation, activeTab === 'quality');
  const cityDistribution = useDashboardQuery('city-distribution', filters, getDashboardCityDistribution, activeTab === 'offer');
  const distinctions = useDashboardQuery('distinctions', filters, getDashboardDistinctionOverview, activeTab === 'offer');

  return (
    <div className="min-h-0 p-4">
      <div className="dashboard-layout">
        <DashboardFiltersPanel
          availableCities={filterOptions.data?.cities ?? []}
          cityLoadError={filterOptionsError}
          availableLieuDits={filterOptions.data?.lieuDits ?? []}
          lieuDitLoadError={filterOptionsError}
        />

        <main className="dashboard-main">
          <ActiveFilterStrip />

          <WidgetFrame isLoading={scorecards.isPending} error={scorecards.error} onRetry={() => scorecards.refetch()}>
            {scorecards.data && <ScorecardStrip data={scorecards.data} />}
          </WidgetFrame>

          <DashboardTabs />

          {activeTab === 'quality' && (
            <>
              <div className="dashboard-kpi__row">
                <WidgetFrame
                  isLoading={typeBreakdown.isPending}
                  error={typeBreakdown.error}
                  isEmpty={typeBreakdown.data?.rows.length === 0}
                  onRetry={() => typeBreakdown.refetch()}
                >
                  {typeBreakdown.data && <TypeBreakdown data={typeBreakdown.data} />}
                </WidgetFrame>
              </div>
              <WidgetFrame
                isLoading={actualisation.isPending}
                error={actualisation.error}
                isEmpty={actualisation.data?.rows.length === 0}
                onRetry={() => actualisation.refetch()}
              >
                {actualisation.data && <ActualisationTable data={actualisation.data} />}
              </WidgetFrame>
            </>
          )}

          {activeTab === 'offer' && (
            <div className="dashboard-kpi__row">
              <WidgetFrame
                isLoading={cityDistribution.isPending}
                error={cityDistribution.error}
                isEmpty={cityDistribution.data?.rows.length === 0}
                onRetry={() => cityDistribution.refetch()}
              >
                {cityDistribution.data && <CommuneDistribution data={cityDistribution.data} />}
              </WidgetFrame>
              <WidgetFrame
                isLoading={distinctions.isPending}
                error={distinctions.error}
                onRetry={() => distinctions.refetch()}
              >
                {distinctions.data && <DistinctionOverview data={distinctions.data} />}
              </WidgetFrame>
            </div>
          )}

          {activeTab === 'activity' && (
            <article className="kpi-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Activité équipe</span>
                  <h2>À venir</h2>
                </div>
              </div>
              <p className="dashboard-widget-state">
                Vélocité, contributeurs et modération arrivent au lot 4
                (spec 2026-06-11-dashboard-statistics-design).
              </p>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}

export { DashboardPage };
```

- [ ] **Step 4: Vérifier le passage + non-régression + typecheck**

Run: `npm run test:run -- DashboardPage`
Expected: PASS (3 tests).
Run: `npm run test:run`
Expected: PASS — suite complète (l'app n'importe `DashboardPage` que depuis `app/(main)/dashboard/page.tsx`, inchangé).
Run: `npm run typecheck`
Expected: 0 erreur.

- [ ] **Step 5: Vérification visuelle (preview)**

Lancer le dev server, ouvrir `/dashboard` : héro visible, 3 onglets, Qualité par défaut (répartition + actualisation), Offre (communes + distinctions), Activité (panneau « à venir »), changement de filtre → refetch des widgets visibles seulement (vérifier l'onglet réseau : pas d'appel `get_dashboard_city_distribution` tant que l'onglet Offre n'est pas ouvert).

- [ ] **Step 6: Commit**

```bash
git add src/views/DashboardPage.tsx src/views/DashboardPage.test.tsx
git commit -m "feat(dashboard): page a onglets par vocation + React Query (lot 0 socle)"
```

---

## LOT 1 — Filtres : avancés, drill-down, pont Explorer

### Task 6: Étendre `DashboardFilters` + exporter `buildRpcParams`

**Files:**
- Modify: `src/types/dashboard.ts` (interface `DashboardFilters`)
- Modify: `src/services/dashboard-rpc.ts` (`buildRpcParams`)
- Create: `src/services/dashboard-rpc.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/services/dashboard-rpc.test.ts
import { buildRpcParams } from './dashboard-rpc';

describe('buildRpcParams', () => {
  it('sérialise les filtres existants (régression)', () => {
    const params = buildRpcParams({
      types: ['HOT'],
      status: ['published'],
      cities: ['Le Tampon'],
      lieuDits: ['La Plaine'],
      labelsAny: ['famille-plus'],
      taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }],
      petsAccepted: true,
      pmr: true,
      updatedAtFrom: '2026-01-01',
      updatedAtTo: '2026-06-01',
    });
    expect(params).toEqual({
      p_types: ['HOT'],
      p_status: ['published'],
      p_filters: {
        city_any: ['Le Tampon'],
        lieu_dit_any: ['La Plaine'],
        tags_any: ['famille-plus'],
        taxonomy_any: [{ domain: 'taxonomy_hot', code: 'hotel' }],
        pet_accepted: true,
        amenities_any: ['wheelchair_access'],
      },
      p_updated_at_from: '2026-01-01',
      p_updated_at_to: '2026-06-01',
    });
  });

  it('sérialise les nouvelles clés avancées', () => {
    const params = buildRpcParams({
      classificationsAny: [{ schemeCode: 'hot_stars', valueCode: '4' }],
      amenityFamiliesAny: ['wellness'],
      languagesAny: ['en', 'de'],
    });
    expect(params.p_filters).toEqual({
      classifications_any: [{ scheme_code: 'hot_stars', value_code: '4' }],
      amenity_families_any: ['wellness'],
      languages_any: ['en', 'de'],
    });
  });

  it('omet les clés vides', () => {
    expect(buildRpcParams({}).p_filters).toEqual({});
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- dashboard-rpc`
Expected: FAIL — `buildRpcParams` non exporté + clés absentes.

- [ ] **Step 3: Implémenter**

Dans `src/types/dashboard.ts`, ajouter à la fin de l'interface `DashboardFilters` (après `updatedAtTo`) :

```ts
  /** Maps to p_filters.classifications_any — paires scheme+valeur (cached_classification_codes 'scheme:value') */
  classificationsAny?: { schemeCode: string; valueCode: string }[];
  /** Maps to p_filters.amenity_families_any — codes famille d'équipements */
  amenityFamiliesAny?: string[];
  /** Maps to p_filters.languages_any — codes langue (cached_language_codes) */
  languagesAny?: string[];
```

Dans `src/services/dashboard-rpc.ts` : remplacer `function buildRpcParams` par `export function buildRpcParams`, et ajouter dans le corps, après le bloc `pmr` :

```ts
  if (filters.classificationsAny && filters.classificationsAny.length > 0) {
    p_filters.classifications_any = filters.classificationsAny.map((c) => ({
      scheme_code: c.schemeCode,
      value_code: c.valueCode,
    }));
  }
  if (filters.amenityFamiliesAny && filters.amenityFamiliesAny.length > 0) {
    p_filters.amenity_families_any = filters.amenityFamiliesAny;
  }
  if (filters.languagesAny && filters.languagesAny.length > 0) {
    p_filters.languages_any = filters.languagesAny;
  }
```

NOTE : pas de champ `amenitiesAny` générique — `p_filters.amenities_any` est réservé au mapping PMR existant (conflit sinon) ; le besoin v1 est couvert au niveau famille (spec §5.1).

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- dashboard-rpc`
Expected: PASS (3 tests).
Run: `npm run typecheck`
Expected: 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/types/dashboard.ts src/services/dashboard-rpc.ts src/services/dashboard-rpc.test.ts
git commit -m "feat(dashboard): cles de filtre avancees (classifications/familles/langues) dans buildRpcParams"
```

---

### Task 7: Service catalogues des filtres avancés

**Files:**
- Create: `src/services/dashboard-reference.ts`
- Create: `src/services/dashboard-reference.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Le service est surtout de l'I/O PostgREST ; on teste la logique pure de mise en forme (filtre `is_distinction`, dédoublonnage familles) en l'isolant dans des helpers exportés.

```ts
// src/services/dashboard-reference.test.ts
import { shapeDistinctionValues, dedupeAmenityFamilies } from './dashboard-reference';

describe('dashboard-reference — mise en forme', () => {
  it('ne garde que les valeurs des schemes is_distinction et aplatit', () => {
    const rows = [
      { code: '4', name: '4 étoiles', scheme: { code: 'hot_stars', name: 'Étoiles hôtel', is_distinction: true } },
      { code: 'x', name: 'Interne', scheme: { code: 'internal', name: 'Interne', is_distinction: false } },
      { code: 'y', name: 'Orphelin', scheme: null },
    ];
    expect(shapeDistinctionValues(rows)).toEqual([
      { schemeCode: 'hot_stars', schemeName: 'Étoiles hôtel', valueCode: '4', valueName: '4 étoiles' },
    ]);
  });

  it('dédoublonne les familles et trie par nom', () => {
    const rows = [
      { family: { code: 'wellness', name: 'Bien-être' } },
      { family: { code: 'wellness', name: 'Bien-être' } },
      { family: { code: 'access', name: 'Accessibilité' } },
      { family: null },
    ];
    expect(dedupeAmenityFamilies(rows)).toEqual([
      { code: 'access', label: 'Accessibilité' },
      { code: 'wellness', label: 'Bien-être' },
    ]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- dashboard-reference`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// src/services/dashboard-reference.ts
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

// ─── Types des catalogues de filtres avancés ─────────────────────────────────

export interface TaxonomyDomainOption { domain: string; name: string }
export interface TaxonomyCodeOption { domain: string; code: string; name: string }
export interface DistinctionValueOption {
  schemeCode: string;
  schemeName: string;
  valueCode: string;
  valueName: string;
}
export interface SimpleOption { code: string; label: string }

export interface DashboardAdvancedFilterOptions {
  taxonomyDomains: TaxonomyDomainOption[];
  taxonomyCodes: TaxonomyCodeOption[];
  distinctionValues: DistinctionValueOption[];
  languages: SimpleOption[];
  amenityFamilies: SimpleOption[];
  tags: SimpleOption[];
}

const EMPTY_OPTIONS: DashboardAdvancedFilterOptions = {
  taxonomyDomains: [],
  taxonomyCodes: [],
  distinctionValues: [],
  languages: [],
  amenityFamilies: [],
  tags: [],
};

// ─── Helpers purs (testés) ───────────────────────────────────────────────────

interface RawClassificationValue {
  code: string;
  name: string;
  scheme: { code: string; name: string; is_distinction: boolean } | null;
}

export function shapeDistinctionValues(rows: RawClassificationValue[]): DistinctionValueOption[] {
  return rows
    .filter((r) => r.scheme?.is_distinction)
    .map((r) => ({
      schemeCode: r.scheme!.code,
      schemeName: r.scheme!.name,
      valueCode: r.code,
      valueName: r.name,
    }));
}

interface RawAmenityFamilyRow {
  family: { code: string; name: string } | null;
}

export function dedupeAmenityFamilies(rows: RawAmenityFamilyRow[]): SimpleOption[] {
  const byCode = new Map<string, string>();
  for (const r of rows) {
    if (r.family?.code && !byCode.has(r.family.code)) {
      byCode.set(r.family.code, r.family.name ?? r.family.code);
    }
  }
  return [...byCode.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

// ─── Chargeur ────────────────────────────────────────────────────────────────
// Tables ref_* en lecture publique RLS — selects directs (pattern explorer-reference).
// Mode démo : catalogues vides (pas de mocks pour les nouveautés — decision log §32).

export async function getDashboardAdvancedFilterOptions(): Promise<DashboardAdvancedFilterOptions> {
  const { demoMode } = useSessionStore.getState();
  const client = getSupabaseClient();
  if (demoMode || !client) return EMPTY_OPTIONS;

  const domainsRes = await client
    .from('ref_code_domain_registry')
    .select('domain,name')
    .eq('is_taxonomy', true)
    .order('position', { ascending: true });
  if (domainsRes.error) throw domainsRes.error;
  const taxonomyDomains: TaxonomyDomainOption[] = (domainsRes.data ?? []).map((d) => ({
    domain: d.domain,
    name: d.name ?? d.domain,
  }));

  const [codesRes, valuesRes, languagesRes, amenitiesRes, tagsRes] = await Promise.all([
    client
      .from('ref_code')
      .select('domain,code,name')
      .in('domain', taxonomyDomains.map((d) => d.domain))
      .eq('is_active', true)
      .order('position', { ascending: true }),
    client
      .from('ref_classification_value')
      .select('code,name,scheme:scheme_id(code,name,is_distinction)')
      .order('position', { ascending: true }),
    client.from('ref_language').select('code,name').order('position', { ascending: true }),
    client.from('ref_amenity').select('family:family_id(code,name)').in('scope', ['object', 'both']),
    client.from('ref_tag').select('slug,name').order('position', { ascending: true }),
  ]);
  const firstError = codesRes.error ?? valuesRes.error ?? languagesRes.error ?? amenitiesRes.error ?? tagsRes.error;
  if (firstError) throw firstError;

  return {
    taxonomyDomains,
    taxonomyCodes: (codesRes.data ?? []).map((c) => ({ domain: c.domain, code: c.code, name: c.name })),
    distinctionValues: shapeDistinctionValues((valuesRes.data ?? []) as unknown as RawClassificationValue[]),
    languages: (languagesRes.data ?? []).map((l) => ({ code: l.code, label: l.name })),
    amenityFamilies: dedupeAmenityFamilies((amenitiesRes.data ?? []) as unknown as RawAmenityFamilyRow[]),
    tags: (tagsRes.data ?? []).map((t) => ({ code: t.slug, label: t.name })),
  };
}
```

NOTE : si `getSupabaseClient` n'est pas le nom exporté par `src/lib/supabase` (vérifier — `explorer-reference.ts:337` l'utilise), aligner l'import sur le même que `explorer-reference.ts`.

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- dashboard-reference`
Expected: PASS (2 tests).
Run: `npm run typecheck`
Expected: 0 erreur (ajuster les casts PostgREST si besoin — les réponses embedded sont typées `unknown`).

- [ ] **Step 5: Vérification live (obligatoire — données réelles)**

Dev server + session connectée : dans la console réseau, vérifier que les 6 selects répondent 200 et que `taxonomyDomains` contient les domaines `taxonomy_*` seedés (dont les 8 de §57). En cas de 401 sur une table : la RLS `ref_*` est publique en lecture (house policy) — investiguer avant de contourner.

- [ ] **Step 6: Commit**

```bash
git add src/services/dashboard-reference.ts src/services/dashboard-reference.test.ts
git commit -m "feat(dashboard): catalogues des filtres avances (taxonomies, distinctions, langues, familles, tags)"
```

---

### Task 8: Groupe « Filtres avancés » dans le panneau

**Files:**
- Modify: `src/components/dashboard/DashboardFiltersPanel.tsx`
- Modify: `src/views/DashboardPage.tsx` (charger + passer les options)
- Modify: `src/styles.css`

- [ ] **Step 1: Charger les catalogues dans la page**

Dans `DashboardPage.tsx`, après la query `filterOptions` :

```tsx
import { getDashboardAdvancedFilterOptions } from '../services/dashboard-reference';
// …
  const advancedOptions = useQuery({
    queryKey: ['dashboard', 'advanced-filter-options'],
    queryFn: getDashboardAdvancedFilterOptions,
  });
```

et passer au panneau :

```tsx
        <DashboardFiltersPanel
          availableCities={filterOptions.data?.cities ?? []}
          cityLoadError={filterOptionsError}
          availableLieuDits={filterOptions.data?.lieuDits ?? []}
          lieuDitLoadError={filterOptionsError}
          advancedOptions={advancedOptions.data}
          advancedLoadError={advancedOptions.error ? 'Impossible de charger les filtres avancés' : null}
        />
```

- [ ] **Step 2: Étendre le panneau**

Dans `DashboardFiltersPanel.tsx` :

a) Imports + props :

```tsx
import { useMemo, useState } from 'react';
import type { DashboardAdvancedFilterOptions } from '../../services/dashboard-reference';

interface DashboardFiltersPanelProps {
  availableCities: string[];
  cityLoadError?: string | null;
  availableLieuDits: string[];
  lieuDitLoadError?: string | null;
  /** Catalogues des filtres avancés — undefined tant que la query charge. */
  advancedOptions?: DashboardAdvancedFilterOptions;
  advancedLoadError?: string | null;
}
```

b) Étendre `hasActiveFilters` (ajouter avant la comparaison de statut) :

```tsx
    (filters.taxonomyAny && filters.taxonomyAny.length > 0) ||
    (filters.classificationsAny && filters.classificationsAny.length > 0) ||
    (filters.languagesAny && filters.languagesAny.length > 0) ||
    (filters.amenityFamiliesAny && filters.amenityFamiliesAny.length > 0) ||
    (filters.labelsAny && filters.labelsAny.length > 0) ||
```

c) Dans le corps du composant (sidebar développée), état local + options dérivées :

```tsx
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [taxonomyDomain, setTaxonomyDomain] = useState<string>('');

  const taxonomyCodeOptions = useMemo(
    () =>
      (advancedOptions?.taxonomyCodes ?? [])
        .filter((c) => c.domain === taxonomyDomain)
        .map((c) => ({ code: c.code, label: c.name })),
    [advancedOptions, taxonomyDomain],
  );
  // Valeur sélectionnée pour le domaine affiché (les autres domaines restent dans le filtre)
  const selectedTaxonomyCodes = (filters.taxonomyAny ?? [])
    .filter((t) => t.domain === taxonomyDomain)
    .map((t) => t.code);

  function setTaxonomyCodes(codes: string[]) {
    const others = (filters.taxonomyAny ?? []).filter((t) => t.domain !== taxonomyDomain);
    const next = [...others, ...codes.map((code) => ({ domain: taxonomyDomain, code }))];
    setFilters({ taxonomyAny: next.length > 0 ? next : undefined });
  }

  const distinctionOptions = (advancedOptions?.distinctionValues ?? []).map((v) => ({
    code: `${v.schemeCode}:${v.valueCode}`,
    label: `${v.schemeName} — ${v.valueName}`,
  }));
  const selectedDistinctions = (filters.classificationsAny ?? []).map(
    (c) => `${c.schemeCode}:${c.valueCode}`,
  );
  function setDistinctions(codes: string[]) {
    const next = codes.map((pair) => {
      const [schemeCode, ...rest] = pair.split(':');
      return { schemeCode, valueCode: rest.join(':') };
    });
    setFilters({ classificationsAny: next.length > 0 ? next : undefined });
  }
```

d) JSX — insérer après le `FilterColumnGroup label="Accessibilité"`, avant la fermeture du conteneur scrollable :

```tsx
        <section className="border-b border-line py-3.5 last:border-0">
          <button
            type="button"
            className="dashboard-advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            Filtres avancés {advancedOpen ? '▾' : '▸'}
          </button>
          {advancedLoadError && advancedOpen && (
            <p className="dashboard-filter-error">{advancedLoadError}</p>
          )}
          {advancedOpen && advancedOptions && (
            <div className="mt-3 space-y-3">
              <FilterField label="Domaine de catégorie">
                <FilterDropdown<string>
                  mode="single"
                  placeholder="Choisir un domaine"
                  options={advancedOptions.taxonomyDomains.map((d) => ({ code: d.domain, label: d.name }))}
                  selected={taxonomyDomain ? [taxonomyDomain] : []}
                  onChange={(vals) => setTaxonomyDomain(vals[0] ?? '')}
                />
              </FilterField>
              {taxonomyDomain && (
                <FilterField label="Sous-catégories">
                  <FilterDropdown<string>
                    mode="multi"
                    placeholder="Toutes"
                    options={taxonomyCodeOptions}
                    selected={selectedTaxonomyCodes}
                    onChange={setTaxonomyCodes}
                  />
                </FilterField>
              )}
              <FilterField label="Distinctions (classements & labels)">
                <FilterDropdown<string>
                  mode="multi"
                  placeholder="Toutes"
                  options={distinctionOptions}
                  selected={selectedDistinctions}
                  onChange={setDistinctions}
                />
              </FilterField>
              <FilterField label="Langues parlées">
                <FilterDropdown<string>
                  mode="multi"
                  placeholder="Toutes"
                  options={advancedOptions.languages}
                  selected={filters.languagesAny ?? []}
                  onChange={(vals) => setFilters({ languagesAny: vals.length > 0 ? vals : undefined })}
                />
              </FilterField>
              <FilterField label="Familles d'équipements">
                <FilterDropdown<string>
                  mode="multi"
                  placeholder="Toutes"
                  options={advancedOptions.amenityFamilies}
                  selected={filters.amenityFamiliesAny ?? []}
                  onChange={(vals) => setFilters({ amenityFamiliesAny: vals.length > 0 ? vals : undefined })}
                />
              </FilterField>
              <FilterField label="Tags">
                <FilterDropdown<string>
                  mode="multi"
                  placeholder="Tous"
                  options={advancedOptions.tags}
                  selected={filters.labelsAny ?? []}
                  onChange={(vals) => setFilters({ labelsAny: vals.length > 0 ? vals : undefined })}
                />
              </FilterField>
            </div>
          )}
        </section>
```

NOTE : `FilterDropdown` attend `options: { code; label }[]` (cf. usages existants du fichier) — vérifier sa signature exacte avant d'écrire ; si l'option a un autre shape, s'aligner.

e) `src/styles.css` :

```css
/* ── Dashboard — filtres avancés ───────────────────────────────────────────── */
.dashboard-advanced-toggle {
  width: 100%;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  background: none;
  border: 0;
  cursor: pointer;
}
.dashboard-filter-error { color: #c85c48; font-size: 12px; margin-top: 6px; }
```

- [ ] **Step 3: Vérifier**

Run: `npm run test:run` — suite complète PASS (le panneau n'a pas de test dédié existant ; le test FilterDropdown couvre le composant de base).
Run: `npm run typecheck` — 0 erreur.
Preview : ouvrir « Filtres avancés », choisir un domaine → sous-catégories ; sélectionner une distinction ; vérifier dans l'onglet réseau que `p_filters` contient `classifications_any`/`taxonomy_any`… et que les compteurs changent.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardFiltersPanel.tsx src/views/DashboardPage.tsx src/styles.css
git commit -m "feat(dashboard): groupe Filtres avances (taxonomie, distinctions, langues, familles, tags)"
```

---

### Task 9: Chips `ActiveFilterStrip` pour tous les filtres

**Files:**
- Modify: `src/components/dashboard/ActiveFilterStrip.tsx`
- Create: `src/components/dashboard/ActiveFilterStrip.test.tsx`

Constat : la strip actuelle n'affiche PAS les chips lieux-dits, labels, taxonomie — et ne connaît pas les nouveaux champs. Tout filtre actif doit avoir sa chip (sinon filtre « invisible »).

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// src/components/dashboard/ActiveFilterStrip.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveFilterStrip } from './ActiveFilterStrip';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

// next/navigation est utilisé par le bouton Explorer (Task 11) — mock neutre dès maintenant.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('ActiveFilterStrip — chips', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({
      filters: {
        status: ['published'],
        lieuDits: ['La Plaine des Cafres'],
        taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }],
        classificationsAny: [{ schemeCode: 'hot_stars', valueCode: '4' }],
        languagesAny: ['en'],
        amenityFamiliesAny: ['wellness'],
        labelsAny: ['famille-plus'],
      },
      activeTab: 'quality',
    });
  });

  it('affiche une chip par filtre actif et la retire au clic', () => {
    render(<ActiveFilterStrip />);
    expect(screen.getByText(/La Plaine des Cafres/)).toBeInTheDocument();
    expect(screen.getByText(/hotel/)).toBeInTheDocument();
    expect(screen.getByText(/hot_stars : 4/)).toBeInTheDocument();
    expect(screen.getByText(/Langue : en/)).toBeInTheDocument();
    expect(screen.getByText(/Famille : wellness/)).toBeInTheDocument();
    expect(screen.getByText(/Tag : famille-plus/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Langue : en/));
    expect(useDashboardFilterStore.getState().filters.languagesAny).toBeUndefined();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- ActiveFilterStrip`
Expected: FAIL — chips absentes.

- [ ] **Step 3: Implémenter**

Dans `ActiveFilterStrip.tsx`, après le bloc `cities`, ajouter :

```tsx
  (filters.lieuDits ?? []).forEach((l) =>
    chips.push({ label: `Lieu-dit : ${l}`, onRemove: () =>
      setFilters({ lieuDits: filters.lieuDits?.filter((v) => v !== l) || undefined }) }),
  );

  (filters.taxonomyAny ?? []).forEach((t) =>
    chips.push({ label: `Catégorie : ${t.code}`, onRemove: () =>
      setFilters({
        taxonomyAny:
          filters.taxonomyAny?.filter((v) => !(v.domain === t.domain && v.code === t.code)) || undefined,
      }) }),
  );

  (filters.classificationsAny ?? []).forEach((c) =>
    chips.push({ label: `${c.schemeCode} : ${c.valueCode}`, onRemove: () =>
      setFilters({
        classificationsAny:
          filters.classificationsAny?.filter(
            (v) => !(v.schemeCode === c.schemeCode && v.valueCode === c.valueCode),
          ) || undefined,
      }) }),
  );

  (filters.languagesAny ?? []).forEach((l) =>
    chips.push({ label: `Langue : ${l}`, onRemove: () =>
      setFilters({ languagesAny: filters.languagesAny?.filter((v) => v !== l) || undefined }) }),
  );

  (filters.amenityFamiliesAny ?? []).forEach((f) =>
    chips.push({ label: `Famille : ${f}`, onRemove: () =>
      setFilters({ amenityFamiliesAny: filters.amenityFamiliesAny?.filter((v) => v !== f) || undefined }) }),
  );

  (filters.labelsAny ?? []).forEach((t) =>
    chips.push({ label: `Tag : ${t}`, onRemove: () =>
      setFilters({ labelsAny: filters.labelsAny?.filter((v) => v !== t) || undefined }) }),
  );
```

NOTE : l'idiome `…?.filter(…) || undefined` est repris tel quel des chips existantes du fichier. Il laisse passer un tableau vide (`[]` est truthy) — c'est déjà le comportement des chips actuelles et c'est sans effet : `buildRpcParams` ignore toute clé `length === 0`. Cohérence avec l'existant > micro-correction hors sujet.

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- ActiveFilterStrip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ActiveFilterStrip.tsx src/components/dashboard/ActiveFilterStrip.test.tsx
git commit -m "feat(dashboard): chips de retrait pour tous les filtres (lieux-dits, taxonomie, distinctions, langues, familles, tags)"
```

---

### Task 10: Drill-down TypeBreakdown + ActualisationTable

**Files:**
- Modify: `src/components/dashboard/TypeBreakdown.tsx`
- Create: `src/components/dashboard/TypeBreakdown.test.tsx`
- Modify: `src/components/dashboard/ActualisationTable.tsx`
- Create: `src/components/dashboard/ActualisationTable.test.tsx`
- Modify: `src/styles.css`

Modèle : `CommuneDistribution.tsx` (toggle + classe `--active` + `<button>` par ligne) — répliquer le même pattern pour le filtre `types`.

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
// src/components/dashboard/TypeBreakdown.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeBreakdown } from './TypeBreakdown';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

const data = {
  total: 10,
  rows: [
    { type: 'HOT' as const, count: 6, published: 5, draft: 1, archived: 0, pct_of_total: 60 },
    { type: 'RES' as const, count: 4, published: 4, draft: 0, archived: 0, pct_of_total: 40 },
  ],
};

describe('TypeBreakdown — drill-down', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality' });
  });

  it('clic sur une ligne ajoute le type au filtre (toggle on)', () => {
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /HOT/ }));
    expect(useDashboardFilterStore.getState().filters.types).toEqual(['HOT']);
  });

  it('re-clic retire le type (toggle off)', () => {
    useDashboardFilterStore.setState({ filters: { status: ['published'], types: ['HOT'] }, activeTab: 'quality' });
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /HOT/ }));
    expect(useDashboardFilterStore.getState().filters.types).toBeUndefined();
  });
});
```

```tsx
// src/components/dashboard/ActualisationTable.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ActualisationTable } from './ActualisationTable';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

const data = {
  threshold_days: 90,
  rows: [
    { type: 'HOT' as const, total: 10, up_to_date: 7, to_review: 2, stale: 1, rate: 70, weekly_rates: null },
  ],
};

describe('ActualisationTable — drill-down', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality' });
  });

  it('clic sur la cellule type filtre sur ce type', () => {
    render(<ActualisationTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'HOT' }));
    expect(useDashboardFilterStore.getState().filters.types).toEqual(['HOT']);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- "TypeBreakdown|ActualisationTable"`
Expected: FAIL — pas de `<button>` dans les lignes.

- [ ] **Step 3: Implémenter**

`TypeBreakdown.tsx` complet :

```tsx
"use client";

import type { DashboardTypeBreakdown } from '../../types/dashboard';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

interface Props {
  data: DashboardTypeBreakdown;
}

export function TypeBreakdown({ data }: Props) {
  const setFilters = useDashboardFilterStore((s) => s.setFilters);
  const activeTypes = useDashboardFilterStore((s) => s.filters.types) ?? [];

  // Drill-down en toggle — même pattern que CommuneDistribution (communes).
  function handleType(type: Props['data']['rows'][number]['type']) {
    const next = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];
    setFilters({ types: next.length > 0 ? next : undefined });
  }

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Répartition</span>
          <h2>Par type d'objet</h2>
        </div>
        <span className="kpi-panel__total">{data.total.toLocaleString('fr-FR')} fiches</span>
      </div>

      <div className="type-breakdown">
        {data.rows.map((row) => {
          const isActive = activeTypes.includes(row.type);
          return (
            <button
              key={row.type}
              type="button"
              title={`Filtrer : ${row.type}`}
              className={`type-breakdown__row type-breakdown__row--clickable${isActive ? ' type-breakdown__row--active' : ''}`}
              onClick={() => handleType(row.type)}
            >
              <span className="type-breakdown__label">{row.type}</span>
              <div className="type-breakdown__bar-wrap">
                <div
                  className="type-breakdown__bar"
                  style={{ width: `${row.pct_of_total}%` }}
                  title={`${row.pct_of_total} %`}
                />
              </div>
              <span className="type-breakdown__count">{row.count.toLocaleString('fr-FR')}</span>
              <span className="type-breakdown__pct">{row.pct_of_total} %</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
```

`ActualisationTable.tsx` — remplacer la cellule type :

```tsx
                <td className="actualisation-table__type">
                  <button
                    type="button"
                    className={`actualisation-table__type-btn${activeTypes.includes(row.type) ? ' actualisation-table__type-btn--active' : ''}`}
                    title={`Filtrer : ${row.type}`}
                    onClick={() => handleType(row.type)}
                  >
                    {row.type}
                  </button>
                </td>
```

et en tête du composant `ActualisationTable` (code complet — dupliqué sciemment depuis TypeBreakdown : 8 lignes, le pattern existant `CommuneDistribution` est lui-même inline, pas d'abstraction prématurée) :

```tsx
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
// …
export function ActualisationTable({ data }: Props) {
  const setFilters = useDashboardFilterStore((s) => s.setFilters);
  const activeTypes = useDashboardFilterStore((s) => s.filters.types) ?? [];

  function handleType(type: Props['data']['rows'][number]['type']) {
    const next = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];
    setFilters({ types: next.length > 0 ? next : undefined });
  }
  // … reste du composant inchangé (RateBar, table)
```

`src/styles.css` :

```css
/* ── Dashboard — drill-down (lignes cliquables) ────────────────────────────── */
.type-breakdown__row--clickable {
  width: 100%;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.type-breakdown__row--clickable:hover { background: var(--surface-2); }
.type-breakdown__row--active .type-breakdown__label { color: var(--teal); font-weight: 700; }
.actualisation-table__type-btn {
  background: none;
  border: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  padding: 0;
}
.actualisation-table__type-btn:hover { color: var(--teal); }
.actualisation-table__type-btn--active { color: var(--teal); font-weight: 700; }
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm run test:run -- "TypeBreakdown|ActualisationTable"`
Expected: PASS (3 tests).
Run: `npm run test:run` puis `npm run typecheck` — tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TypeBreakdown.tsx src/components/dashboard/TypeBreakdown.test.tsx src/components/dashboard/ActualisationTable.tsx src/components/dashboard/ActualisationTable.test.tsx src/styles.css
git commit -m "feat(dashboard): drill-down types sur TypeBreakdown et ActualisationTable (pattern CommuneDistribution)"
```

---

### Task 11: Pont « Ouvrir dans l'Explorer »

**Files:**
- Create: `src/lib/dashboard-to-explorer.ts`
- Create: `src/lib/dashboard-to-explorer.test.ts`
- Modify: `src/components/dashboard/ActiveFilterStrip.tsx`

L'Explorer lit ses filtres depuis l'URL au mount (`useExplorerUrlSync` → `parseSearchParams`). Le pont construit donc une URL `/explorer?…` via `buildSearchParams` — aucun couplage de store. Les champs sans équivalent Explorer sont retournés dans `dropped` et affichés en tooltip (honnêteté : l'utilisateur sait ce qui n'est pas transposé).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/lib/dashboard-to-explorer.test.ts
import { mapDashboardFiltersToExplorerUrl } from './dashboard-to-explorer';

describe('mapDashboardFiltersToExplorerUrl', () => {
  it('mappe types → buckets (+ hotSubtypes), cities, pmr, pets, labels, statuses', () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT', 'CAMP', 'RES'],
      status: ['published', 'draft'],
      cities: ['Le Tampon'],
      pmr: true,
      petsAccepted: true,
      labelsAny: ['famille-plus'],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/explorer?')).toBe(true);
    expect(params.get('buckets')!.split(',').sort()).toEqual(['HOT', 'RES']);
    expect(params.get('hotSubtypes')!.split(',').sort()).toEqual(['CAMP', 'HOT']);
    expect(params.get('cities')).toBe('Le Tampon');
    expect(params.get('pmr')).toBe('true');
    expect(params.get('pets')).toBe('true');
    expect(params.get('labels')).toBe('famille-plus');
    expect(params.get('status')).toBe('published,draft');
    expect(dropped).toEqual([]);
  });

  it('liste les champs non transposables dans dropped', () => {
    const { dropped } = mapDashboardFiltersToExplorerUrl({
      updatedAtFrom: '2026-01-01',
      classificationsAny: [{ schemeCode: 'hot_stars', valueCode: '4' }],
      languagesAny: ['en'],
      amenityFamiliesAny: ['wellness'],
      lieuDits: ['A', 'B'],
      status: ['archived'],
      taxonomyAny: [{ domain: 'taxonomy_res', code: 'creole' }],
    });
    expect(dropped).toEqual(
      expect.arrayContaining([
        'période de mise à jour',
        'distinctions',
        'langues',
        "familles d'équipements",
        'lieux-dits supplémentaires',
        'statut archivé/masqué',
        'catégories hors hébergement',
      ]),
    );
  });

  it('transpose la taxonomie taxonomy_hot vers hotTaxonomy', () => {
    const { url } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT'],
      taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('hotTaxonomy')).toBe('taxonomy_hot:hotel');
  });

  it('sans filtre, renvoie /explorer nu', () => {
    const { url } = mapDashboardFiltersToExplorerUrl({});
    expect(url).toBe('/explorer');
  });
});
```

NOTE : les noms exacts des paramètres URL (`buckets`, `hotSubtypes`, `cities`, `pmr`, `pets`, `labels`, `status`, `hotTaxonomy`, `lieuDit`) viennent de `parseSearchParams`/`buildSearchParams` (`src/lib/explorer-search-params.ts`) — si `buildSearchParams` sérialise différemment (ex. omission des valeurs par défaut), ajuster les assertions sur la sortie RÉELLE de `buildSearchParams`, pas l'inverse.

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run test:run -- dashboard-to-explorer`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// src/lib/dashboard-to-explorer.ts
import type { DashboardFilters } from '@/types/dashboard';
import type { BackendObjectTypeCode, ExplorerBucketKey, ExplorerStatusFilter } from '@/types/domain';
import {
  DEFAULT_EXPLORER_FILTERS,
  EXPLORER_BUCKET_TYPE_MAP,
  HOT_BUCKET_TYPES,
  normalizeExplorerFilters,
} from '@/utils/facets';
import { buildSearchParams } from '@/lib/explorer-search-params';

export interface ExplorerBridgeResult {
  url: string;
  /** Filtres dashboard actifs SANS équivalent Explorer — affichés à l'utilisateur. */
  dropped: string[];
}

/**
 * Pont sens unique dashboard → Explorer : sérialise les filtres dashboard dans
 * le vocabulaire URL de l'Explorer (lu au mount par useExplorerUrlSync).
 * Tout champ non transposable est nommé dans `dropped`, jamais silencieusement perdu.
 */
export function mapDashboardFiltersToExplorerUrl(filters: DashboardFilters): ExplorerBridgeResult {
  const dropped: string[] = [];
  const types = filters.types ?? [];

  // Types → buckets Explorer (familles), + sous-types HOT quand pertinent.
  const buckets = (Object.entries(EXPLORER_BUCKET_TYPE_MAP) as [ExplorerBucketKey, BackendObjectTypeCode[]][])
    .filter(([, members]) => members.some((m) => types.includes(m)))
    .map(([bucket]) => bucket);
  const hotSubtypes = types.filter((t) => HOT_BUCKET_TYPES.includes(t));

  // Statuts : l'Explorer ne connaît que published/draft.
  const statuses = (filters.status ?? []).filter(
    (s): s is ExplorerStatusFilter => s === 'published' || s === 'draft',
  );
  if ((filters.status ?? []).some((s) => s === 'archived' || s === 'hidden')) {
    dropped.push('statut archivé/masqué');
  }

  // Lieu-dit : champ Explorer mono-valué.
  const [firstLieuDit, ...restLieuDits] = filters.lieuDits ?? [];
  if (restLieuDits.length > 0) dropped.push('lieux-dits supplémentaires');

  // Taxonomie : seul le domaine HOT existe côté Explorer (hot.taxonomy).
  const hotTaxonomy = (filters.taxonomyAny ?? []).filter((t) => t.domain === 'taxonomy_hot');
  if ((filters.taxonomyAny ?? []).some((t) => t.domain !== 'taxonomy_hot')) {
    dropped.push('catégories hors hébergement');
  }

  if (filters.updatedAtFrom || filters.updatedAtTo) dropped.push('période de mise à jour');
  if (filters.classificationsAny?.length) dropped.push('distinctions');
  if (filters.languagesAny?.length) dropped.push('langues');
  if (filters.amenityFamiliesAny?.length) dropped.push("familles d'équipements");

  const explorerFilters = normalizeExplorerFilters({
    ...DEFAULT_EXPLORER_FILTERS,
    selectedBuckets: buckets,
    common: {
      ...DEFAULT_EXPLORER_FILTERS.common,
      cities: filters.cities ?? [],
      lieuDit: firstLieuDit ?? '',
      pmr: !!filters.pmr,
      petsAccepted: !!filters.petsAccepted,
      labelsAny: filters.labelsAny ?? [],
      statuses,
    },
    hot: {
      ...DEFAULT_EXPLORER_FILTERS.hot,
      ...(hotSubtypes.length > 0 ? { subtypes: hotSubtypes } : {}),
      taxonomy: hotTaxonomy,
    },
  });

  const params = buildSearchParams(explorerFilters);
  const qs = params.toString();
  return { url: qs ? `/explorer?${qs}` : '/explorer', dropped };
}
```

- [ ] **Step 4: Vérifier le passage (ajuster les assertions sur la sortie réelle de `buildSearchParams` si besoin)**

Run: `npm run test:run -- dashboard-to-explorer`
Expected: PASS (4 tests).

- [ ] **Step 5: Bouton dans `ActiveFilterStrip`**

Dans `ActiveFilterStrip.tsx` :

```tsx
import { useRouter } from 'next/navigation';
import { mapDashboardFiltersToExplorerUrl } from '../../lib/dashboard-to-explorer';
// …dans le composant, avant le return :
  const router = useRouter();
  const bridge = mapDashboardFiltersToExplorerUrl(filters);
// …dans le JSX, après le bouton « Tout effacer » :
      <button
        type="button"
        className="ghost-button active-filter-strip__explorer"
        title={bridge.dropped.length > 0 ? `Non transposés : ${bridge.dropped.join(', ')}` : undefined}
        onClick={() => router.push(bridge.url)}
      >
        Ouvrir dans l'Explorer
      </button>
```

Ajouter au test `ActiveFilterStrip.test.tsx` :

```tsx
  it("le bouton Explorer pousse l'URL transposée", () => {
    const push = jest.fn();
    (jest.requireMock('next/navigation') as { useRouter: () => unknown }).useRouter = () => ({ push });
    render(<ActiveFilterStrip />);
    fireEvent.click(screen.getByRole('button', { name: "Ouvrir dans l'Explorer" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/explorer/));
  });
```

- [ ] **Step 6: Vérifier + smoke navigateur**

Run: `npm run test:run -- "ActiveFilterStrip|dashboard-to-explorer"` puis `npm run typecheck`.
Preview : filtrer Type=HOT + commune, cliquer « Ouvrir dans l'Explorer » → l'Explorer s'ouvre avec bucket Hébergements + commune appliqués et **le même compte d'objets** que le dashboard (cohérence `get_filtered_object_ids`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard-to-explorer.ts src/lib/dashboard-to-explorer.test.ts src/components/dashboard/ActiveFilterStrip.tsx src/components/dashboard/ActiveFilterStrip.test.tsx
git commit -m "feat(dashboard): pont Ouvrir dans l'Explorer (URL Explorer + champs non transposes nommes)"
```

---

### Task 12: Vérification finale + documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée §)
- Modify: `.claude/WORKFLOW.md` (tracker si pertinent)

- [ ] **Step 1: Suite complète + typecheck**

Run: `npm run test:run` → PASS intégral ; `npm run typecheck` → 0 erreur.

- [ ] **Step 2: Vérification live de cohérence dashboard ↔ Explorer**

Avec le dev server et une session réelle (pas demo) : pour 3 jeux de filtres (a. aucun ; b. Type=HOT + commune ; c. distinction hot_stars:4), comparer le `total` du scorecard dashboard avec le compte de résultats Explorer après pont (pour a et b — c n'est pas transposable et doit apparaître dans le tooltip « Non transposés »). Les écarts attendus : zéro (même résolveur SQL).

- [ ] **Step 3: Documenter dans le decision log**

Ajouter une entrée § datée dans `lot1_mapping_decisions.md` : lots 0+1 livrés (onglets par vocation, React Query, états visibles, filtres avancés sur clés existantes, drill-down types/communes, pont Explorer URL one-way avec champs droppés nommés), DistinctionOverview drill + filtre ORG reportés au lot 5 (clés résolveur), lots 2-4 = plans séparés à venir.

- [ ] **Step 4: Commit final**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md .claude/WORKFLOW.md
git commit -m "docs(decisions): dashboard lots 0+1 livres — onglets, filtres avances, drill-down, pont Explorer"
```

---

## Hors périmètre de ce plan (rappel)

- **Lots 2-4** (SQL : complétude, fiches à problème, capacités, saisonnalité, profil de l'offre, vélocité, contributeurs, modération) — un plan par lot, après le socle.
- **Lot 5** (résolveur : `publisher_org_any` + `classification_schemes_any` + UI ORG + drill DistinctionOverview).
- Mode démo des nouveaux widgets (état vide assumé), persistance URL des filtres dashboard (écartée au cadrage).

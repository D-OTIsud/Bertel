# Aligner les filtres du Dashboard sur l'Explorer — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le panneau de filtres pauvre du Dashboard par le panneau riche de l'Explorer (état indépendant), en conservant la période propre au Dashboard.

**Architecture:** Frontend seul. `FiltersPanel`/`ExplorerActiveFilters` deviennent paramétrables par un hook de store (défaut = le singleton Explorer, donc l'Explorer reste intact). Une 2ᵉ instance de store (factory `createExplorerStore()`) donne l'état indépendant du Dashboard. Un mapper pur convertit cet état + la période en paramètres RPC — que les 6 RPC de stats consomment déjà via `api.get_filtered_object_ids`. **Aucune migration SQL.**

**Tech Stack:** React 19, Zustand, TanStack Query, TypeScript, Jest + React Testing Library, Tailwind. `cd bertel-tourism-ui` pour toutes les commandes.

## Global Constraints

- **Aucune modification SQL / RPC** — les signatures RPC restent inchangées.
- **L'Explorer et ses tests ne changent pas** : toute prop ajoutée à `FiltersPanel`/`ExplorerActiveFilters` a un **défaut = le singleton `useExplorerStore`** ; les fichiers de test Explorer existants ne passent aucune nouvelle prop et doivent rester verts.
- **Statuts** : Publié / Brouillon uniquement (jeu de l'Explorer) — pas d'Archivé/Masqué.
- **Facettes spécifiques par type** (`capacity_filters`, `meeting_room`, `itinerary`, `event`) : honnêtes uniquement en **mono-bucket** ⇒ rendues et émises **seulement quand exactement 1 bucket est sélectionné** (invariant « no silent write-trap »).
- **Commits** : conventionnels, **sans** trailer co-author, **par pathspec** (`git commit <chemins> -m …`). Le push est fait par l'utilisateur.
- Vérif systématique : `npx tsc --noEmit` + `npx jest <fichier>` après chaque task.

---

## Structure des fichiers

| Fichier | Rôle après le plan |
|---|---|
| `src/store/explorer-store.ts` | **modifié** : factory `createExplorerStore()` + exports `useExplorerStore` (Explorer) et `useDashboardExplorerStore` (Dashboard) |
| `src/components/explorer/FiltersPanel.tsx` | **modifié** : props `useStore` + `typeSpecificFacets` |
| `src/components/explorer/ExplorerActiveFilters.tsx` | **modifié** : prop `useStore` |
| `src/lib/dashboard-stats-params.ts` | **nouveau** : mapper pur `dashboardStatsParams(filters, period)` |
| `src/store/dashboard-filter-store.ts` | **modifié** : réduit à période + `activeTab` + `sidebarCollapsed` |
| `src/components/dashboard/DashboardPeriodSection.tsx` | **nouveau** : préréglages + plage Du/Au |
| `src/services/dashboard-rpc.ts` | **modifié** : getters prennent `DashboardStatsParams` ; `buildRpcParams` retiré |
| `src/hooks/useDashboardQuery.ts` | **modifié** : clé `params: DashboardStatsParams` |
| `src/views/DashboardPage.tsx` | **modifié** : monte le panneau réutilisé + période + chips ; références via `useExplorerReferencesQuery` |
| `src/components/dashboard/DashboardFiltersPanel.tsx`, `ActiveFilterStrip.tsx`, `lib/dashboard-to-explorer.ts`, type `DashboardFilters`, `services/dashboard-reference.ts` (loaders d'options) | **retirés** (Task 9, après vérif consommateurs) |

---

### Task 1 : Store factory + instance Dashboard indépendante

**Files:**
- Modify: `src/store/explorer-store.ts:185`
- Test: `src/store/explorer-store.test.ts`

**Interfaces:**
- Produces: `createExplorerStore()` ; `useExplorerStore` (inchangé) ; `useDashboardExplorerStore` — deux instances Zustand indépendantes, même `ExplorerState`, `.getState()` disponible sur chacune.

- [ ] **Step 1: Écrire le test d'indépendance** — l'ajouter à `src/store/explorer-store.test.ts`.

```ts
import { useExplorerStore, useDashboardExplorerStore } from './explorer-store';

test('useDashboardExplorerStore est une instance indépendante du singleton Explorer', () => {
  useExplorerStore.getState().resetAll();
  useDashboardExplorerStore.getState().resetAll();

  useDashboardExplorerStore.getState().toggleBucket('HOT');

  expect(useDashboardExplorerStore.getState().selectedBuckets).toContain('HOT');
  // Le singleton Explorer n'est pas affecté.
  expect(useExplorerStore.getState().selectedBuckets).not.toContain('HOT');
});
```

- [ ] **Step 2: Lancer le test — échec attendu**

Run: `npx jest src/store/explorer-store.test.ts -t "instance indépendante"`
Expected: FAIL — `useDashboardExplorerStore` n'est pas exporté.

- [ ] **Step 3: Transformer l'export en factory** — dans `src/store/explorer-store.ts`, remplacer la ligne `export const useExplorerStore = create<ExplorerState>((set) => ({` par une factory, et ajouter la 2ᵉ instance à la fin du `create(...)` (juste après la parenthèse fermante `}))`).

Remplacer :
```ts
export const useExplorerStore = create<ExplorerState>((set) => ({
```
par :
```ts
const createExplorerStore = () => create<ExplorerState>((set) => ({
```
Puis, immédiatement après la fermeture actuelle `}));` de ce `create`, ajouter :
```ts

/**
 * Instance Explorer (singleton) — inchangée, utilisée par la page Explorer,
 * useExplorerUrlSync, les résultats/carte/sélection et tous leurs tests.
 */
export const useExplorerStore = createExplorerStore();

/**
 * Instance INDÉPENDANTE pour le Dashboard (§ align filtres). Même logique de
 * filtre, état séparé : filtrer sur le Dashboard ne touche pas l'Explorer.
 * Pas de branchement URL (useExplorerUrlSync ne cible que le singleton).
 */
export const useDashboardExplorerStore = createExplorerStore();
```

- [ ] **Step 4: Lancer les tests du store — vert**

Run: `npx jest src/store/explorer-store.test.ts`
Expected: PASS (le nouveau test + tous les tests existants du store).

- [ ] **Step 5: Commit**

```bash
git commit src/store/explorer-store.ts src/store/explorer-store.test.ts -m "refactor(explorer-store): factory + 2e instance indépendante pour le Dashboard"
```

---

### Task 2 : `FiltersPanel` paramétrable (store + facettes spécifiques)

**Files:**
- Modify: `src/components/explorer/FiltersPanel.tsx`
- Test: `src/components/explorer/FiltersPanel.dashboard.test.tsx` (nouveau)

**Interfaces:**
- Consumes: `useDashboardExplorerStore` (Task 1).
- Produces: `FiltersPanel` accepte `useStore?: typeof useExplorerStore` (défaut `useExplorerStore`) et `typeSpecificFacets?: boolean` (défaut `true`).

- [ ] **Step 1: Écrire le test Dashboard** — nouveau fichier `src/components/explorer/FiltersPanel.dashboard.test.tsx`.

```tsx
import { render, screen, act } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';
import { useDashboardExplorerStore } from '../../store/explorer-store';

function resetDash() {
  act(() => useDashboardExplorerStore.getState().resetAll());
}

describe('FiltersPanel — instance Dashboard', () => {
  beforeEach(resetDash);

  it('lit/écrit le store passé en prop (indépendant du singleton)', () => {
    act(() => useDashboardExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel useStore={useDashboardExplorerStore} typeSpecificFacets />);
    // La section type-spécifique Hébergements est visible en mono-bucket.
    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
  });

  it('masque les sections spécifiques par type quand typeSpecificFacets=false', () => {
    act(() => useDashboardExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel useStore={useDashboardExplorerStore} typeSpecificFacets={false} />);
    expect(screen.queryByText("Type d'hébergement")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/components/explorer/FiltersPanel.dashboard.test.tsx`
Expected: FAIL — `FiltersPanel` n'accepte pas `useStore`/`typeSpecificFacets` (le panneau lit toujours le singleton).

- [ ] **Step 3: Ajouter les props et rebrancher le store** — dans `FiltersPanel.tsx` :

3a. Étendre les props (`interface FiltersPanelProps`) :
```ts
interface FiltersPanelProps {
  references?: ExplorerReferences;
  /** Hook de store à piloter — défaut = singleton Explorer (Explorer & tests inchangés). */
  useStore?: typeof useExplorerStore;
  /** Rendre les sections de facettes SPÉCIFIQUES par type (capacité, ITI, EVT…). Défaut true.
   *  Le Dashboard passe false hors mono-bucket (§7 : honnête seulement en 1 bucket). */
  typeSpecificFacets?: boolean;
}
```

3b. Dans la signature du composant, destructurer avec défauts :
```ts
export function FiltersPanel({ references, useStore = useExplorerStore, typeSpecificFacets = true }: FiltersPanelProps) {
```

3c. **Remplacer les 46 occurrences** de `useExplorerStore(` par `useStore(` **dans le corps de `FiltersPanel`** (uniquement — ne pas toucher l'import ni les autres composants). Règle mécanique : `useStore((state) => …)` / `useStore((s) => s.setX)`. Le nom `useStore` commence par `use` ⇒ conforme `rules-of-hooks`. Garder l'`import { useExplorerStore }` (il sert de valeur par défaut).

3d. **Gater les sections spécifiques par type** derrière `typeSpecificFacets`. Ce sont les 4 blocs repliables par bucket, identifiables par leurs en-têtes « Section Hébergements / Itinéraires / Site & visite / Services » (+ leurs contrôles capacité/difficulté/dates EVT). Envelopper chaque rendu de section spécifique dans `typeSpecificFacets && (…)`. Concrètement, pour chaque section de type, transformer `{selectedBuckets.includes('HOT') && (<section…Hébergements…/>)}` en `{typeSpecificFacets && selectedBuckets.includes('HOT') && (<section…/>)}` (idem ITI, VIS, SRV, EVT et tout bloc capacité/meeting/itinéraire/dates-événement). Les groupes transverses (Localisation, Distinctions, Accessibilité et services, Labels/distinctions, Statut) ne sont **pas** gatés.

- [ ] **Step 4: Lancer les deux suites FiltersPanel — vert**

Run: `npx jest src/components/explorer/FiltersPanel.test.tsx src/components/explorer/FiltersPanel.dashboard.test.tsx`
Expected: PASS — l'ancien test Explorer (sans prop → singleton, `typeSpecificFacets` défaut true) reste vert ; le nouveau passe.

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git commit src/components/explorer/FiltersPanel.tsx src/components/explorer/FiltersPanel.dashboard.test.tsx -m "feat(explorer): FiltersPanel paramétrable par store + gate facettes spécifiques par type"
```

---

### Task 3 : `ExplorerActiveFilters` paramétrable

**Files:**
- Modify: `src/components/explorer/ExplorerActiveFilters.tsx`
- Test: `src/components/explorer/ExplorerActiveFilters.test.tsx`

**Interfaces:**
- Produces: `ExplorerActiveFilters` accepte `useStore?: typeof useExplorerStore` (défaut `useExplorerStore`).

- [ ] **Step 1: Ajouter un test sur l'instance Dashboard** — dans `ExplorerActiveFilters.test.tsx`.

```tsx
import { useDashboardExplorerStore } from '../../store/explorer-store';
// … render existant réutilisé …

it('affiche une chip depuis le store passé en prop', () => {
  act(() => { useDashboardExplorerStore.getState().resetAll(); useDashboardExplorerStore.getState().setCities(['Le Tampon']); });
  render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} />);
  expect(screen.getByText(/Le Tampon/)).toBeInTheDocument();
});
```

> Vérifier le nom exact du setter de communes dans le store (`setCities`) et l'adapter si besoin en lisant `explorer-store.ts`.

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/components/explorer/ExplorerActiveFilters.test.tsx -t "passé en prop"`
Expected: FAIL — prop `useStore` inconnue.

- [ ] **Step 3: Paramétrer** — comme Task 2 : ajouter `useStore?: typeof useExplorerStore` aux props, défaut `useExplorerStore` dans la signature, remplacer les `useExplorerStore(` internes par `useStore(`.

- [ ] **Step 4: Lancer — vert**

Run: `npx jest src/components/explorer/ExplorerActiveFilters.test.tsx`
Expected: PASS (ancien + nouveau).

- [ ] **Step 5: Commit**

```bash
git commit src/components/explorer/ExplorerActiveFilters.tsx src/components/explorer/ExplorerActiveFilters.test.tsx -m "feat(explorer): ExplorerActiveFilters paramétrable par store"
```

---

### Task 4 : Mapper pur état→paramètres RPC

**Files:**
- Create: `src/lib/dashboard-stats-params.ts`
- Test: `src/lib/dashboard-stats-params.test.ts`

**Interfaces:**
- Consumes: `buildBucketRpcFilters`, `getEffectiveBackendTypesForBucket`, `normalizeExplorerFilters` (de `utils/facets`) ; type `ExplorerFilters` (de `types/domain`).
- Produces:
```ts
export interface DashboardStatsParams {
  p_types: string[] | null;
  p_status: string[];
  p_filters: Record<string, unknown>;
  p_updated_at_from: string | null;
  p_updated_at_to: string | null;
}
export interface DashboardPeriod { updatedAtFrom?: string; updatedAtTo?: string }
export function dashboardStatsParams(filters: ExplorerFilters, period: DashboardPeriod): DashboardStatsParams;
```

- [ ] **Step 1: Écrire les tests** — `src/lib/dashboard-stats-params.test.ts`.

```ts
import { dashboardStatsParams } from './dashboard-stats-params';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';

const base = DEFAULT_EXPLORER_FILTERS;

it('aucun bucket, aucune facette, aucune période → params vides/défaut', () => {
  const p = dashboardStatsParams({ ...base, selectedBuckets: [] }, {});
  expect(p.p_types).toBeNull();
  expect(p.p_status).toEqual(['published']);
  expect(p.p_filters).toEqual({});
  expect(p.p_updated_at_from).toBeNull();
  expect(p.p_updated_at_to).toBeNull();
});

it('mono-bucket ITI → p_filters porte la facette spécifique itinerary', () => {
  const filters = { ...base, selectedBuckets: ['ITI'], iti: { ...base.iti, difficultyMax: 2 } };
  const p = dashboardStatsParams(filters as any, {});
  expect(p.p_types).toContain('ITI');
  expect(p.p_filters).toHaveProperty('itinerary');
});

it('multi-bucket → facettes spécifiques exclues (transverse only), taxonomie ré-agrégée', () => {
  const filters = {
    ...base,
    selectedBuckets: ['HOT', 'ITI'],
    iti: { ...base.iti, difficultyMax: 2 },              // spécifique — doit disparaître
    common: { ...base.common, cities: ['Le Tampon'] },   // transverse — doit rester
  };
  const p = dashboardStatsParams(filters as any, {});
  expect(p.p_filters).not.toHaveProperty('itinerary');
  expect(p.p_filters).not.toHaveProperty('capacity_filters');
  expect(p.p_filters).toHaveProperty('city_any', ['le tampon']); // cleanString/immutable_unaccent côté RPC ; ici city_any brut du builder
});

it('période → p_updated_at_from/to', () => {
  const p = dashboardStatsParams({ ...base, selectedBuckets: [] }, { updatedAtFrom: '2026-01-01', updatedAtTo: '2026-02-01' });
  expect(p.p_updated_at_from).toBe('2026-01-01');
  expect(p.p_updated_at_to).toBe('2026-02-01');
});

it('statuts restreints à published/draft (défaut published si vide)', () => {
  const withDraft = { ...base, selectedBuckets: [], common: { ...base.common, statuses: ['published', 'draft'] } };
  expect(dashboardStatsParams(withDraft as any, {}).p_status).toEqual(['published', 'draft']);
});
```

> Le test `city_any` suppose que `buildBucketRpcFilters` émet `city_any` = communes nettoyées. Vérifier la valeur exacte produite (cf. `facets.ts:482`, `cleanCities`) et ajuster l'attendu si le builder ne lowercase pas (le lowercase/unaccent est fait côté RPC, pas dans le builder — attendre `['Le Tampon']`). **Aligner l'attendu sur la sortie réelle du builder au Step 4.**

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/lib/dashboard-stats-params.test.ts`
Expected: FAIL — module absent.

- [ ] **Step 3: Implémenter le mapper** — `src/lib/dashboard-stats-params.ts`.

```ts
import type { ExplorerBucketKey, ExplorerFilters, ExplorerStatusFilter } from '../types/domain';
import { buildBucketRpcFilters, getEffectiveBackendTypesForBucket, normalizeExplorerFilters } from '../utils/facets';

export interface DashboardStatsParams {
  p_types: string[] | null;
  p_status: string[];
  p_filters: Record<string, unknown>;
  p_updated_at_from: string | null;
  p_updated_at_to: string | null;
}
export interface DashboardPeriod { updatedAtFrom?: string; updatedAtTo?: string }

// Clés de facettes SPÉCIFIQUES par type — honnêtes seulement en mono-bucket (§7).
// En multi/zéro-bucket, elles sont retirées du payload (le garde EXISTS du RPC
// exclurait tous les objets des autres types). `bbox` = repli carte, hors Dashboard.
const TYPE_SPECIFIC_KEYS = ['itinerary', 'capacity_filters', 'meeting_room', 'event', 'bbox'] as const;

/** Payload transverse (multi/zéro-bucket) : facettes indépendantes du type +
 *  taxonomie RÉ-AGRÉGÉE sur tous les domaines (buildBucketRpcFilters la scope au bucket). */
function transverseFilters(filters: ExplorerFilters): Record<string, unknown> {
  const normalized = normalizeExplorerFilters(filters);
  // Les clés transverses sont indépendantes du bucket : on part d'un bucket
  // quelconque puis on retire le spécifique et on ré-agrège la taxonomie.
  const payload = buildBucketRpcFilters(filters, 'HOT');
  for (const key of TYPE_SPECIFIC_KEYS) delete payload[key];
  const allTaxonomy = normalized.common.taxonomyAny.map((t) => ({ domain: t.domain, code: t.code }));
  if (allTaxonomy.length > 0) payload.taxonomy_any = allTaxonomy;
  else delete payload.taxonomy_any;
  return payload;
}

export function dashboardStatsParams(filters: ExplorerFilters, period: DashboardPeriod): DashboardStatsParams {
  const normalized = normalizeExplorerFilters(filters);
  const buckets = normalized.selectedBuckets;

  // p_types : union des types des buckets (narrowing sous-types inclus) ; aucun bucket → null (tous, hors ORG).
  let pTypes: string[] | null = null;
  if (buckets.length > 0) {
    const set = new Set<string>();
    for (const b of buckets) for (const t of getEffectiveBackendTypesForBucket(filters, b as ExplorerBucketKey)) set.add(t);
    pTypes = [...set];
  }

  // p_filters : mono-bucket → payload complet du bucket ; sinon transverse-only.
  const pFilters = buckets.length === 1
    ? buildBucketRpcFilters(filters, buckets[0] as ExplorerBucketKey)
    : transverseFilters(filters);

  // p_status : restreint à published/draft (défaut published).
  const statuses = (normalized.common.statuses ?? []).filter(
    (s): s is ExplorerStatusFilter => s === 'published' || s === 'draft',
  );

  return {
    p_types: pTypes,
    p_status: statuses.length > 0 ? statuses : ['published'],
    p_filters: pFilters,
    p_updated_at_from: period.updatedAtFrom ?? null,
    p_updated_at_to: period.updatedAtTo ?? null,
  };
}
```

- [ ] **Step 4: Lancer — vert (ajuster l'attendu `city_any` sur la sortie réelle)**

Run: `npx jest src/lib/dashboard-stats-params.test.ts`
Expected: PASS. Si `city_any` diffère, corriger l'attendu du test pour matcher la sortie de `buildBucketRpcFilters` (ne pas modifier le builder).

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit` (0 erreur)
```bash
git commit src/lib/dashboard-stats-params.ts src/lib/dashboard-stats-params.test.ts -m "feat(dashboard): mapper pur état Explorer + période → paramètres RPC de stats"
```

---

### Task 5 : Amaigrir `dashboard-filter-store` (période + tab + sidebar)

**Files:**
- Modify: `src/store/dashboard-filter-store.ts`
- Test: `src/store/dashboard-filter-store.test.ts` (créer si absent)

**Interfaces:**
- Produces: `useDashboardFilterStore` avec `{ updatedAtFrom: string | null, updatedAtTo: string | null, activeTab: DashboardTabKey, sidebarCollapsed: boolean, setPeriod(from, to), clearPeriod(), setActiveTab(tab), toggleSidebar() }`.

- [ ] **Step 1: Écrire le test** — `src/store/dashboard-filter-store.test.ts`.

```ts
import { useDashboardFilterStore } from './dashboard-filter-store';

beforeEach(() => useDashboardFilterStore.getState().clearPeriod());

it('setPeriod / clearPeriod', () => {
  useDashboardFilterStore.getState().setPeriod('2026-01-01', '2026-02-01');
  expect(useDashboardFilterStore.getState().updatedAtFrom).toBe('2026-01-01');
  expect(useDashboardFilterStore.getState().updatedAtTo).toBe('2026-02-01');
  useDashboardFilterStore.getState().clearPeriod();
  expect(useDashboardFilterStore.getState().updatedAtFrom).toBeNull();
});

it('activeTab par défaut = quality et est modifiable', () => {
  expect(useDashboardFilterStore.getState().activeTab).toBe('quality');
  useDashboardFilterStore.getState().setActiveTab('offer');
  expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/store/dashboard-filter-store.test.ts`
Expected: FAIL — `setPeriod`/`clearPeriod`/`updatedAtFrom` absents.

- [ ] **Step 3: Réécrire le store** — remplacer tout le contenu de `dashboard-filter-store.ts` :

```ts
import { create } from 'zustand';
import type { DashboardTabKey } from '../types/dashboard';

interface DashboardFilterState {
  /** Période (updated_at) — UNIQUE filtre propre au Dashboard (les autres = instance Explorer). */
  updatedAtFrom: string | null;
  updatedAtTo: string | null;
  activeTab: DashboardTabKey;
  sidebarCollapsed: boolean;
  setPeriod: (from: string | null, to: string | null) => void;
  clearPeriod: () => void;
  setActiveTab: (tab: DashboardTabKey) => void;
  toggleSidebar: () => void;
}

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  updatedAtFrom: null,
  updatedAtTo: null,
  activeTab: 'quality',
  sidebarCollapsed: false,
  setPeriod: (from, to) => set({ updatedAtFrom: from, updatedAtTo: to }),
  clearPeriod: () => set({ updatedAtFrom: null, updatedAtTo: null }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
```

> `DashboardTabKey` reste exporté par `types/dashboard.ts` (ne pas le retirer). Le type `DashboardFilters` sera retiré en Task 9.

- [ ] **Step 4: Lancer — vert**

Run: `npx jest src/store/dashboard-filter-store.test.ts`
Expected: PASS. (tsc et les consommateurs seront verts après Tasks 6–9 ; c'est attendu que `DashboardPage`/`DashboardTabs` cassent temporairement — ils sont recâblés ensuite.)

- [ ] **Step 5: Commit**

```bash
git commit src/store/dashboard-filter-store.ts src/store/dashboard-filter-store.test.ts -m "refactor(dashboard): store réduit à période + onglet + sidebar"
```

---

### Task 6 : Composant `DashboardPeriodSection`

**Files:**
- Create: `src/components/dashboard/DashboardPeriodSection.tsx`
- Test: `src/components/dashboard/DashboardPeriodSection.test.tsx`

**Interfaces:**
- Consumes: `useDashboardFilterStore` (Task 5), `FilterColumnGroup` (`../common/FilterColumnGroup`).
- Produces: `<DashboardPeriodSection />` (sans prop — lit le store).

- [ ] **Step 1: Écrire le test**

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DashboardPeriodSection } from './DashboardPeriodSection';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

beforeEach(() => act(() => useDashboardFilterStore.getState().clearPeriod()));

it('la plage personnalisée écrit la période dans le store', () => {
  render(<DashboardPeriodSection />);
  fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-03-01' } });
  expect(useDashboardFilterStore.getState().updatedAtFrom).toBe('2026-03-01');
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/components/dashboard/DashboardPeriodSection.test.tsx`
Expected: FAIL — module absent.

- [ ] **Step 3: Implémenter** (reprend les préréglages + plage de l'ancien `DashboardFiltersPanel` bloc « Période », branché sur le store réduit).

```tsx
'use client';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import { FilterColumnGroup } from '../common/FilterColumnGroup';

const DATE_PRESETS: { label: string; days: number }[] = [
  { label: '7 j', days: 7 }, { label: '30 j', days: 30 }, { label: '3 mois', days: 90 }, { label: '1 an', days: 365 },
];
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoNDaysAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };

export function DashboardPeriodSection() {
  const { updatedAtFrom, updatedAtTo, setPeriod, clearPeriod } = useDashboardFilterStore();
  return (
    <FilterColumnGroup label="Période">
      <div className="space-y-3">
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Préréglages</span>
          <div className="chip-grid">
            {DATE_PRESETS.map(({ label, days }) => {
              const from = isoNDaysAgo(days);
              const active = updatedAtFrom === from && updatedAtTo === isoToday();
              return (
                <button key={label} type="button" className={active ? 'chip chip--active' : 'chip'}
                  onClick={() => (active ? clearPeriod() : setPeriod(from, isoToday()))}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Plage personnalisée</span>
          <div className="dashboard-filter-date-grid">
            <div>
              <label className="facet-title" htmlFor="dash-period-from">Du</label>
              <input id="dash-period-from" type="date" className="dashboard-filter-input"
                value={updatedAtFrom ?? ''} onChange={(e) => setPeriod(e.target.value || null, updatedAtTo)} />
            </div>
            <div>
              <label className="facet-title" htmlFor="dash-period-to">Au</label>
              <input id="dash-period-to" type="date" className="dashboard-filter-input"
                value={updatedAtTo ?? ''} onChange={(e) => setPeriod(updatedAtFrom, e.target.value || null)} />
            </div>
          </div>
        </div>
      </div>
    </FilterColumnGroup>
  );
}
```

- [ ] **Step 4: Lancer — vert + tsc**

Run: `npx jest src/components/dashboard/DashboardPeriodSection.test.tsx` (PASS) puis `npx tsc --noEmit` (0 erreur sur ce fichier).

- [ ] **Step 5: Commit**

```bash
git commit src/components/dashboard/DashboardPeriodSection.tsx src/components/dashboard/DashboardPeriodSection.test.tsx -m "feat(dashboard): section Période autonome (préréglages + plage) sur le store réduit"
```

---

### Task 7 : Recâbler `dashboard-rpc.ts` + `useDashboardQuery` sur `DashboardStatsParams`

**Files:**
- Modify: `src/services/dashboard-rpc.ts`
- Modify: `src/hooks/useDashboardQuery.ts`
- Test: `src/services/dashboard-rpc.test.ts`

**Interfaces:**
- Consumes: `DashboardStatsParams` (Task 4).
- Produces: chaque getter `getDashboardX(params: DashboardStatsParams, …extra)` passe `params` (+ `p_limit`/`p_threshold_days` le cas échéant) au RPC. `useDashboardQuery<T>(widget, params, fetcher, enabled?)`.

- [ ] **Step 1: Mettre à jour le test de `dashboard-rpc`** — `dashboard-rpc.test.ts` teste aujourd'hui `buildRpcParams`. Le remplacer par un test qui vérifie que le getter passe bien `params` au client (mock du client Supabase). Exemple minimal :

```ts
import { getDashboardScorecards } from './dashboard-rpc';
import type { DashboardStatsParams } from '../lib/dashboard-stats-params';

const PARAMS: DashboardStatsParams = { p_types: null, p_status: ['published'], p_filters: {}, p_updated_at_from: null, p_updated_at_to: null };

it('getDashboardScorecards passe les params tels quels au RPC', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: {}, error: null });
  // … mock getApiClient().schema().rpc = rpc (suivre le pattern de mock existant du fichier) …
  await getDashboardScorecards(PARAMS);
  expect(rpc).toHaveBeenCalledWith('get_dashboard_scorecards', PARAMS);
});
```

> Suivre le style de mock déjà présent dans `dashboard-rpc.test.ts` (mode demo désactivé). Retirer les assertions sur `buildRpcParams`.

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/services/dashboard-rpc.test.ts`
Expected: FAIL — les getters prennent encore `DashboardFilters` + `buildRpcParams`.

- [ ] **Step 3: Recâbler les getters** — dans `dashboard-rpc.ts` :
  - Supprimer `buildRpcParams` et l'`interface RpcParams`.
  - Importer `DashboardStatsParams` depuis `../lib/dashboard-stats-params`.
  - Remplacer, dans chaque getter live, la signature `(filters: DashboardFilters)` par `(params: DashboardStatsParams)` et l'appel `.rpc('get_dashboard_X', buildRpcParams(filters))` par `.rpc('get_dashboard_X', params)`. Pour city-distribution : `.rpc('get_dashboard_city_distribution', { ...params, p_limit: limit })`. Pour actualisation : `.rpc('get_dashboard_actualisation', { ...params, p_threshold_days: thresholdDays })`.
  - Le mode demo (`useSessionStore.getState().demoMode`) reste inchangé.
  - Les stubs (`getDashboardCapacity/Velocity/Contributors/Seasonality`) : changer aussi leur paramètre en `params: DashboardStatsParams` (ils l'ignorent via `void params`).

- [ ] **Step 4: Recâbler `useDashboardQuery`** :

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardStatsParams } from '../lib/dashboard-stats-params';

export const DASHBOARD_STALE_TIME_MS = 60_000;

export function useDashboardQuery<T>(
  widget: string,
  params: DashboardStatsParams,
  fetcher: (params: DashboardStatsParams) => Promise<T>,
  enabled = true,
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: ['dashboard', widget, params],
    queryFn: () => fetcher(params),
    staleTime: DASHBOARD_STALE_TIME_MS,
    enabled,
  });
}
```

- [ ] **Step 5: Lancer — vert + tsc**

Run: `npx jest src/services/dashboard-rpc.test.ts` (PASS). `npx tsc --noEmit` — des erreurs restent attendues dans `DashboardPage.tsx` (recâblé en Task 8) ; noter qu'aucune autre erreur ne subsiste.

- [ ] **Step 6: Commit**

```bash
git commit src/services/dashboard-rpc.ts src/hooks/useDashboardQuery.ts src/services/dashboard-rpc.test.ts -m "refactor(dashboard): getters + useDashboardQuery sur DashboardStatsParams (retire buildRpcParams)"
```

---

### Task 8 : Recâbler `DashboardPage`

**Files:**
- Modify: `src/views/DashboardPage.tsx`
- Test: `src/views/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useDashboardExplorerStore`, `FiltersPanel` (props), `ExplorerActiveFilters` (prop), `DashboardPeriodSection`, `dashboardStatsParams`, `useExplorerReferencesQuery` (de `../hooks/useExplorerQueries`).

- [ ] **Step 1: Mettre à jour le test RTL** — vérifier que le panneau riche de l'Explorer est monté sur le Dashboard et que la période est présente. Adapter `DashboardPage.test.tsx` :

```tsx
// Rendre <DashboardPage /> dans le provider TanStack Query existant du test.
it('monte le panneau de filtres Explorer + la section Période', async () => {
  renderDashboard(); // helper existant du fichier
  expect(await screen.findByText('Période')).toBeInTheDocument();
  // Un groupe transverse de l'Explorer est présent (ex. « Localisation »).
  expect(screen.getByText('Localisation')).toBeInTheDocument();
});
```

> Adapter aux mocks existants du test (demoMode / QueryClient). Retirer les assertions liées à l'ancien `DashboardFiltersPanel`/`ActiveFilterStrip`.

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/views/DashboardPage.test.tsx`
Expected: FAIL (ancien panneau retiré / nouveau non monté).

- [ ] **Step 3: Réécrire `DashboardPage`** — remplacer l'assemblage des filtres et le calcul des params :

```tsx
"use client";
import { useMemo } from 'react';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import { useDashboardExplorerStore } from '../store/explorer-store';
import { useExplorerReferencesQuery } from '../hooks/useExplorerQueries';
import { dashboardStatsParams } from '../lib/dashboard-stats-params';
import {
  getDashboardScorecards, getDashboardTypeBreakdown, getDashboardCityDistribution,
  getDashboardActualisation, getDashboardCompleteness, getDashboardDistinctionOverview,
} from '../services/dashboard-rpc';
import { useDashboardQuery } from '../hooks/useDashboardQuery';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ExplorerActiveFilters } from '../components/explorer/ExplorerActiveFilters';
import { DashboardPeriodSection } from '../components/dashboard/DashboardPeriodSection';
// … imports widgets (ScorecardStrip, TypeBreakdown, …, DashboardTabs, WidgetFrame) inchangés …

export default function DashboardPage() {
  const activeTab = useDashboardFilterStore((s) => s.activeTab);
  const updatedAtFrom = useDashboardFilterStore((s) => s.updatedAtFrom);
  const updatedAtTo = useDashboardFilterStore((s) => s.updatedAtTo);

  // État de filtre riche = instance Explorer indépendante du Dashboard.
  const selectedBuckets = useDashboardExplorerStore((s) => s.selectedBuckets);
  const common = useDashboardExplorerStore((s) => s.common);
  const hot = useDashboardExplorerStore((s) => s.hot);
  const iti = useDashboardExplorerStore((s) => s.iti);
  const res = useDashboardExplorerStore((s) => s.res);
  const evt = useDashboardExplorerStore((s) => s.evt);
  const vis = useDashboardExplorerStore((s) => s.vis);
  const srv = useDashboardExplorerStore((s) => s.srv);

  const references = useExplorerReferencesQuery();

  const params = useMemo(
    () => dashboardStatsParams(
      { selectedBuckets, common, hot, iti, res, evt, vis, srv },
      { updatedAtFrom: updatedAtFrom ?? undefined, updatedAtTo: updatedAtTo ?? undefined },
    ),
    [selectedBuckets, common, hot, iti, res, evt, vis, srv, updatedAtFrom, updatedAtTo],
  );

  const scorecards    = useDashboardQuery('scorecards', params, getDashboardScorecards);
  const typeBreakdown = useDashboardQuery('type-breakdown', params, getDashboardTypeBreakdown, activeTab === 'quality');
  const actualisation = useDashboardQuery('actualisation', params, getDashboardActualisation, activeTab === 'quality');
  const completeness  = useDashboardQuery('completeness', params, getDashboardCompleteness, activeTab === 'quality');
  const cityDistribution = useDashboardQuery('city-distribution', params, getDashboardCityDistribution, activeTab === 'offer');
  const distinctions  = useDashboardQuery('distinctions', params, getDashboardDistinctionOverview, activeTab === 'offer');

  return (
    <div className="min-h-0 p-4">
      <div className="dashboard-layout">
        <aside className="dashboard-filters-sidebar">
          <DashboardPeriodSection />
          <FiltersPanel
            references={references.data}
            useStore={useDashboardExplorerStore}
            typeSpecificFacets={selectedBuckets.length === 1}
          />
        </aside>

        <main className="dashboard-main">
          <ExplorerActiveFilters useStore={useDashboardExplorerStore} />
          {/* … le reste du <main> (WidgetFrame scorecards, DashboardTabs, panneaux d'onglets) inchangé … */}
        </main>
      </div>
    </div>
  );
}

export { DashboardPage };
```

> Garder tout le bloc `<main>` (scorecards, `DashboardTabs`, les 3 onglets) tel quel — seuls l'aside filtres, la source des filtres et le calcul `params` changent. Vérifier que `ExplorerFilters` (le type attendu par `dashboardStatsParams`) correspond bien à `{ selectedBuckets, common, hot, iti, res, evt, vis, srv }` en lisant `types/domain.ts` ; ajouter tout champ manquant au littéral.

- [ ] **Step 4: Lancer — vert + tsc complet**

Run: `npx jest src/views/DashboardPage.test.tsx` (PASS) puis `npx tsc --noEmit` (0 erreur — plus aucune référence à l'ancien stack sauf fichiers retirés en Task 9).

- [ ] **Step 5: Commit**

```bash
git commit src/views/DashboardPage.tsx src/views/DashboardPage.test.tsx -m "feat(dashboard): monte le panneau de filtres Explorer (instance indépendante) + Période"
```

---

### Task 9 : Nettoyage de l'ancien stack

**Files:**
- Delete: `src/components/dashboard/DashboardFiltersPanel.tsx` (+ `.test` éventuel)
- Delete: `src/components/dashboard/ActiveFilterStrip.tsx` + `ActiveFilterStrip.test.tsx`
- Delete: `src/lib/dashboard-to-explorer.ts` + `dashboard-to-explorer.test.ts` (si plus aucun consommateur)
- Modify: `src/types/dashboard.ts` (retirer le type `DashboardFilters`)
- Modify/Delete: `src/services/dashboard-reference.ts` — retirer `getDashboardAdvancedFilterOptions` et `getDashboardFilterOptions` (dans `dashboard-rpc.ts`) **si** plus aucun consommateur

- [ ] **Step 1: Vérifier les consommateurs avant suppression**

Run:
```bash
cd bertel-tourism-ui
grep -rn "DashboardFilters\b" src | grep -v ".test." || echo "DashboardFilters: 0"
grep -rn "dashboard-to-explorer\|mapDashboardFiltersToExplorerUrl" src || echo "bridge: 0"
grep -rn "DashboardFiltersPanel\|ActiveFilterStrip" src || echo "old panel: 0"
grep -rn "getDashboardAdvancedFilterOptions\|getDashboardFilterOptions" src || echo "option loaders: 0"
```
Expected: aucune référence hors des fichiers à retirer / leurs tests. Si le pont a un consommateur (bouton « voir dans l'Explorer »), le laisser et noter — sinon le supprimer.

- [ ] **Step 2: Supprimer les fichiers orphelins et le type**

```bash
git rm src/components/dashboard/DashboardFiltersPanel.tsx src/components/dashboard/ActiveFilterStrip.tsx src/components/dashboard/ActiveFilterStrip.test.tsx src/lib/dashboard-to-explorer.ts src/lib/dashboard-to-explorer.test.ts
```
Retirer le type `DashboardFilters` de `src/types/dashboard.ts` (garder `DashboardTabKey` et les types de données des widgets). Retirer `getDashboardFilterOptions`/`getDashboardAdvancedFilterOptions` et leurs imports **uniquement s'ils sont à 0 consommateur** (Step 1).

- [ ] **Step 3: tsc + suite complète**

Run:
```bash
npx tsc --noEmit
npx jest
```
Expected: `tsc` 0 erreur ; jest vert (hors 3 rouges connus `settings-nav` d'une session parallèle, sans rapport).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(dashboard): retire l'ancien stack de filtres (DashboardFiltersPanel, DashboardFilters, bridge, ActiveFilterStrip)"
```

*(commit par pathspec des fichiers modifiés + `git rm` déjà stagé ; lister les chemins explicitement.)*

---

## Auto-revue (couverture du spec)

- **Réutilisation FiltersPanel/ActiveFilters paramétrés** → Tasks 2, 3. ✓
- **État indépendant (2ᵉ instance)** → Task 1 + usage Task 8. ✓
- **Période Dashboard-only** → Tasks 5, 6, 8. ✓
- **Statuts published/draft** → mapper Task 4 (filtre) + FiltersPanel réutilisé (contrôle). ✓
- **Sérialisation vers RPC (0 SQL)** → Tasks 4, 7. ✓
- **§7 facettes spécifiques mono-bucket** → `typeSpecificFacets` (Task 2) + mapper `buckets.length===1` (Task 4) + gate UI (Task 8 prop). ✓
- **Nettoyage** → Task 9. ✓
- **Références réutilisées** (`useExplorerReferencesQuery`) → Task 8. ✓

## Différés (hors plan, cf. spec)

- URL-sync des filtres Dashboard.
- 7c (N passes fusionnées) pour facettes spécifiques en multi-bucket.
- Note latente `DistinctionOverview` (`environmental_label`/`accessibility_label`).
- Widgets stubs (`capacity/velocity/contributors/seasonality`).

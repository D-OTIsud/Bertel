# Dashboard KPI Transformation

The current [DashboardPage](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/views/DashboardPage.tsx#8-158) is an empty shell of static mock cards. The goal is to replace it with a true **command center** that lets tourism managers understand the state of their database at a glance, drill into it by type or location, identify gaps, and celebrate progress — all without leaving the page.

The implementation stays fully mock-data-driven for now (no backend needed to ship it), uses the existing design system from [styles.css](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/styles.css), and introduces real React sub-components inside a `components/dashboard/` folder.

---

## Proposed Dashboard Layout

```
┌─────────────────────────────┬──────────────────────────────────────────┐
│  FILTER SIDEBAR (left)      │  MAIN CONTENT                            │
│  [collapse ▶]               │                                          │
│                             │  [active filter chips]                   │
│  • Types (chip grid)        │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│  • City / Lieu-dit          │  │ KPI │ │ KPI │ │ KPI │ │ KPI │        │
│  • Status                   │  └─────┘ └─────┘ └─────┘ └─────┘        │
│  • Date range               │                                          │
│  • Completeness threshold   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  • Capacity min/max         │  │ ByType   │ │ ByCity   │ │ Complete.│ │
│  • Labels / classif.        │  └──────────┘ └──────────┘ └──────────┘ │
│  • PMR / Pets               │                                          │
│  [Réinitialiser]            │  ┌────────────────────────────────────┐  │
│                             │  │  Capacity KPI Panel                │  │
│                             │  └────────────────────────────────────┘  │
│                             │  ┌──────────────────┐ ┌──────────────┐  │
│                             │  │ Velocity Chart   │ │ Contributor  │  │
│                             │  └──────────────────┘ └──────────────┘  │
└─────────────────────────────┴──────────────────────────────────────────┘
│  EXPORT TOOLBAR (sticky bottom)  14 objets  [CSV] [Excel] [JSON] [PDF] [🕐 Planifier]  Dernier export: ...  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 0 — Dashboard Filter Panel

A **collapsible left sidebar** matching the visual language of the Explorer's [FiltersPanel](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx#80-427). It gets its **own** Zustand store (`useDashboardFilterStore`) — separate from the Explorer store.

### Filter groups

| Group | Controls |
|-------|----------|
| **Périmètre** | Type chip-grid (same labels as Explorer); Status chips (draft / published / archived / hidden) |
| **Localisation** | City text input; Lieu-dit (conditional); Region code |
| **Période** | Date range `updated_at` with presets: 7 j / 30 j / 3 mois / 1 an / Tout |
| **Qualité DB** | Completeness min % slider; Has image toggle; Has contact toggle; Has opening hours toggle |
| **Capacité** | Min beds (HOT); Min covers (RES); Min MICE seats; Min trail km (ITI) |
| **Labels** | Free-text chip grid; Classification reference filters |
| **Accessibilité** | PMR toggle; Pets accepted toggle |

### Active filter strip
A chip strip appears above the hero scorecards whenever any filter is active: `[City: Saint-Pierre ×]`. A "Réinitialiser tout" button clears everything.

### UX tricks
- Collapse button shrinks the sidebar to an **icon-only rail** (smooth CSS `width` transition) showing an active filter count badge
- Sidebar scroll is independent from the main content area
- Filter changes **immediately re-compute all KPIs** (pure reactive function on mock data)
- Sections are accordion-collapsible individually (same [FiltersSection](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx#55-68) pattern as Explorer)

---

---

## Section 1 — Hero Scorecards

**Four stat chips** at the top, always visible:

| KPI | Source field | Display |
|-----|-------------|---------|
| Total objects | `object.count` | Big number + delta vs last 30 days |
| Published | `status = 'published'` | count + % of total |
| Avg. db completeness | computed | gauge ring mini |
| Pending changes | `pending_change.status = 'pending'` | warning badge if > 0 |

UX tricks:
- Each card has a **trend arrow** (↑↓) and a tiny sparkline of the last 8 weeks
- Cards animate in with a stagger on mount (`animation-delay`)
- Click on any card deep-links to the relevant filtered list in Explorer

---

## Section 2 — Object Distribution

### 2a. By-Type Panel
Donut chart (CSS-based, no lib needed) showing the proportion of each type:
`HOT / HPA / HLO / CAMP / RES / ITI / ACT (LOI/FMA) / VIS / SRV`

Below the donut, a horizontal bar list ranks types by count with an inline % pill and a colored indicator dot matching the app's `--type-*` color tokens (already in [styles.css](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/styles.css)).

**UX tricks:**
- Hover on a segment highlights the bar row (and vice-versa) via shared `activeType` state
- A **status sub-breakdown** (published / draft / archived) appears as a stacked sub-bar on hover

### 2b. City / Location Distribution
A ranked card list of top N cities:
- City name | object count | sparkline (how many were added this quarter)
- Filterable: click a city → all other sections filter to that city (lifted state `focusCity`)

---

## Section 3 — Database Completeness

> "How complete is my database regarding crucial information about objects per type?"

A **gauge grid** — one gauge per object type, each showing a **completeness score** (0–100 %).

**Completeness score** is computed field-by-field against a per-type checklist:

| Type | Critical fields checked |
|------|------------------------|
| HOT | location, description, image, contact, opening_times, room_types, classification |
| RES | location, description, image, contact, opening_times, price |
| ITI | location, description, image, distance_km, duration_h, practice |
| ACT | location, description, image, contact, price |
| FMA | location, description, image, date_start, date_end |
| CAMP | location, description, image, capacity (nb_emplacements), opening_times |

Each gauge is a **SVG arc** with a color gradient (red → amber → green based on score).

Below each gauge: a "**missing top field**" chip (e.g., "8 HOT manquent une image principale") — immediately actionable.

**UX tricks:**
- Click a gauge → opens a **completeness drawer** listing all objects below 80% for that type, with a mini checklist of what's missing per object (deep-links to editor)
- Completeness trend sparkline at the top: "You went from 62% → 74% this month"

---

## Section 4 — Capacity KPIs

> "Number of beds, covers, seats, km … filtered and aggregated"

A **capacity aggregation panel** with an inline type-filter tabs row:

```
[All] [HOT] [HPA] [CAMP] [RES] [ITI]
```

Metrics displayed as large number tiles:

| Metric | Applies to | Field |
|--------|-----------|-------|
| 🛏 Total beds | HOT, HPA, HLO, CAMP | `object_room_type.total_rooms × capacity_adults` |
| 🍽 Total covers | RES | `object_capacity` (metric = `nb_couverts`) |
| 🏕 Pitches/emplacements | CAMP | `object_capacity` (metric = `nb_emplacements`) |
| 🎭 MICE theatre seats | HOT, RES | `object_meeting_room.cap_theatre` sum |
| 🏫 Classroom seats | HOT, RES | `object_meeting_room.cap_classroom` sum |
| 🥾 Trail km total | ITI | `object_capacity` (metric = `distance_km`) |
| 🧗 Activity capacity / day | LOI | `object_capacity` (activity_group_size × daily_sessions) |

**UX tricks:**
- Switching tabs animates the tiles with a slide-in effect
- Each tile shows: **total** + **number of contributing objects** + **average per object**
- Hovering a tile shows a tooltip breakdown by city
- A **"Missing data"** warning badge appears if fewer than 80% of objects in that type have the metric filled in (e.g., "6 HOT n'ont pas de types de chambres — compléter maintenant")

---

## Section 5 — Improvement Velocity

> "What is the rate of improvement over time?"

A **bar chart** (pure CSS) showing objects edited / created per week for the last 12 weeks.
Two overlapping series:
- New objects created (solid bar)
- Existing objects updated (lighter overlay bar)

A summary line: "**+23 % de mises à jour vs. le mois dernier**"

**UX tricks:**
- Bars animate from 0 on first render
- Click a bar → the contributor board (section 6) filters to that week

---

## Section 6 — Contributor Leaderboard

> "Who is making the most changes?"

A ranked list with:
- Avatar bubble (initials + colored ring matching presence system)
- Name + role
- Change count this month
- Types they edited most (icon chips)
- Trend: ↑↓ vs last month

Top contributor gets a **gold crown badge** — a small but motivating detail.

**UX tricks:**
- List is filterable by time range (this week / this month / all time) via segmented control
- Clicking a contributor deep-links to an activity log filtered to their actions

---

## Section 8 — Monthly Openings & Closings Calendar

> "How many établissements open or close each month?"

A **12-month activity ribbon** showing, for each month of the rolling year:
- 🟢 **Openings** — objects whose `opening_period.date_start` falls within that month (seasonal re-opening)
- 🔴 **Closings** — objects whose `opening_period.date_end` falls within that month (seasonal close)
- ⚡ **Events** (FMA) — count of events whose `object_fma.event_start_date` falls in that month

Display: a **dual-bar month grid** (12 columns) — openings bar goes up (green), closings bar goes down (red), event count as a dot on the axis. The current month is highlighted.

A summary row below: **"3 établissements ouvrent ce mois · 1 ferme · 2 événements à venir"**

**UX tricks:**
- Hovering a month column shows a tooltip listing the objects opening/closing that month (name + type icon)
- Click a month → filters the filter panel date range to that month, updating all other KPIs
- A **"next 60 days" alert chip** appears if any object has an opening/closing in the next 60 days: "📅 2 établissements réouvrent dans moins de 60 jours"
- Filterable by type (is most relevant for HOT, HPA, CAMP, RES which have strong seasonality)

**Data source (mock):**
```ts
// mock-dashboard.ts
monthlySeasonality: Array<{
  month: string;           // 'jan' … 'dec'
  openings: number;        // count of date_start matches
  closings: number;        // count of date_end matches
  events: number;          // count of FMA start_date matches
  openingObjects: { id: string; name: string; type: string }[];
  closingObjects: { id: string; name: string; type: string }[];
}>
```

**New component:** `components/dashboard/SeasonalityCalendar.tsx`

---

## Section 9 — Distinction Rate

> "What percentage of labelisable objects have at least one distinction / official classification?"

A **distinction rate panel** showing, for each labelisable type pool, the share of active published objects that carry at least one **granted** `object_classification` entry.

### Labelisable pools & relevant distinction schemes

| Pool | Types included | Example classification schemes |
|------|---------------|-------------------------------|
| 🏨 Hébergement | HOT, HPA, HLO, CAMP, RVA | Étoiles hôtelières, Clévacances, Gîtes de France, Label Qualité |
| 🍽 Restauration | RES | Fourchettes, Maître-Restaurateur, Toque |
| 🚵 Loisirs | LOI | Qualité Tourisme, Labels sport/aventure |
| 🏕 Plein air | CAMP, HPA | Clé Verte, Écolabel européen |

### Display

For each pool: a **horizontal gauge** with:
- `XX %` of objects have ≥ 1 distinction — large number, colored bar
- `N / M objects` (has distinction / total active published)
- A **breakdown by scheme** below the gauge: mini chips showing "⭐ Étoiles: 12 HOT · 🌿 Clé Verte: 4 CAMP …"

A **"no distinction" alert** for types where < 20 % have one: "⚠️ Seulement 8 % des RES ont une distinction — action recommandée"

**UX tricks:**
- Click on a pool bar → opens an overlay listing all objects without distinctions (drilldown)
- Click a scheme chip → filter the whole dashboard to objects with that specific classification
- Mini trend: `+3 distinctions accordées ce mois`
- Breakdown pill for each pool: "Manquantes: N" with a quick-link to the editor filter

**Data source (mock):**
```ts
// mock-dashboard.ts
distinctionPools: Array<{
  poolCode: string;            // 'HEB' | 'RES' | 'LOI' | 'CAMP'
  label: string;               // 'Hébergement'
  types: BackendObjectTypeCode[];
  totalActive: number;
  withDistinction: number;
  rate: number;                // 0–1
  byScheme: Array<{ schemeCode: string; schemeName: string; count: number }>;
  missingObjects: { id: string; name: string; type: string }[];
}>
```

**New component:** `components/dashboard/DistinctionRatePanel.tsx`

---

## Section 10 — Global Actualisation Rate

> "How fresh is the overall database — and by which pool of objects?"

A prominently displayed **freshness ring + pool breakdown** answering: *what % of published objects were updated within a given threshold period?*

### Freshness tiers (configurable in the filter panel)

| Tier | Definition | Color |
|------|-----------|-------|
| 🟢 À jour | `updated_at` within **90 days** | Green |
| 🟡 À réviser | `updated_at` between **91 and 180 days** | Amber |
| 🔴 Obsolète | `updated_at` older than **180 days** | Red |

### Display

1. **Global ring** (SVG donut, 3 arcs) — one slice per tier showing the % of the full filtered pool at a glance. Center label: `XX % à jour`.

2. **Pool filter tabs** (inline segmented control, reacts to the main filter sidebar too):
   `[Tous] [Hébergement] [Restauration] [Itinéraires] [Loisirs] [Événements] [Services]`
   Switching a tab instantly recomputes the ring and the detail table below it.

3. **Detail table** — one row per object type within the selected pool:

| Type | Total actifs | À jour | À réviser | Obsolètes | Taux |
|------|-------------|--------|-----------|-----------|------|
| HOT | 45 | 38 | 5 | 2 | 84 % |
| HPA | 12 | 8 | 3 | 1 | 67 % |

4. **Trend line** — tiny sparkline per row: actualisation rate week by week for the last 12 weeks.

5. **Alert banner** — if any type in the selected pool has an actualisation rate below 60 %: `⚠️ 14 HOT n'ont pas été mis à jour depuis plus de 6 mois — action recommandée`.

### UX tricks
- Threshold days are **user-configurable** via a small popover (`30 / 60 / 90 / 180 / 365 jours`) — the ring and table re-render immediately
- The pool tabs sync bidirectionally with the filter sidebar's type selection
- Clicking a row in the detail table opens a sorted overlay listing the actual obsolete objects, oldest first (Name / Type / City / Last update / Quick-edit link)
- The ring arc for each tier is clickable — clicking "Obsolètes" highlights only that segment in the table
- A **"Tout relancer"** ghost button: opens a filtered editor view of all obsolete objects for bulk review

**Data source (mock):**
```ts
// mock-dashboard.ts
actualisationPools: Array<{
  poolCode: string;           // 'ALL' | 'HEB' | 'RES' | 'ITI' | 'ACT' | 'EVT' | 'SRV'
  label: string;
  types: BackendObjectTypeCode[];
  rows: Array<{
    type: BackendObjectTypeCode;
    total: number;
    upToDate: number;       // updated < threshold days
    toReview: number;       // threshold..2× threshold
    stale: number;          // > 2× threshold
    weeklyRates: number[];  // 12 values, 0–1
  }>;
}>
```

**New component:** `components/dashboard/ActualisationRatePanel.tsx`

---

## Section 7 — Export Toolbar

A **sticky bottom bar** (glassmorphism background, always visible) giving one-click access to data exports scoped to the **current dashboard filters**.

### Export formats

| Button | Output | Notes |
|--------|--------|-------|
| 📄 **CSV** | Flat object list | id, type, name, status, city, completeness %, updated_at |
| 📊 **Excel** | Multi-sheet workbook | Sheet 1: objects; Sheet 2: capacity; Sheet 3: completeness detail |
| `{}` **JSON** | Raw KPI payload | Same shape as `mock-dashboard.ts` — useful for dev/API integration |
| 📋 **Rapport PDF** | Formatted report | Hero KPIs + type table + top gaps + capacity summary + timestamp; generated via `@media print` on a hidden print div |
| 🕐 **Planifier** | Scheduled sending | Opens a slide-up modal: format picker, frequency, recipient email, filter snapshot preview |

> [!NOTE]
> All exports in mock mode produce client-side files via `Blob` + `URL.createObjectURL` — no backend needed.

### UX tricks
- Far left: **result count pill** (`14 objets sélectionnés`) always reflects current filters
- Export buttons show a brief spinner → ✓ checkmark on success
- Far right: **last export timestamp** chip ("Dernier export: 09:14")
- "Planifier" uses the same slide-up drawer pattern as the editor panels

---

## Proposed Changes

### New files

#### [NEW] `store/dashboard-filter-store.ts`
Zustand store: selected types, city, status, date range preset, completeness threshold, capacity mins, labels, PMR. Includes `resetAll` and `activeFilterCount` derived selector.

#### [NEW] `components/dashboard/` folder

- `DashboardFiltersPanel.tsx` — collapsible left sidebar (reuses [FiltersSection](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx#55-68)/[FiltersSubsection](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx#69-79) primitives)
- `ActiveFilterStrip.tsx` — chip strip above scorecards showing active filters as removable chips
- `ScorecardStrip.tsx` — hero row: 4 stat cards + sparklines + trend arrows
- `TypeBreakdown.tsx` — donut + ranked bar list with hover cross-highlighting
- `CityDistribution.tsx` — top cities ranked list with quarterly deltas
- `CompletenessGrid.tsx` — per-type SVG arc gauges + missing-field chips + drill-down drawer
- `CapacityKPIPanel.tsx` — type-tabbed capacity tiles (beds/covers/km/MICE)
- `VelocityChart.tsx` — CSS grouped bar chart (12 weeks, create vs update)
- `ContributorBoard.tsx` — ranked leaderboard with crown badge + segmented time control
- `SeasonalityCalendar.tsx` — 12-month dual-bar opening/closing ribbon with event dots
- `DistinctionRatePanel.tsx` — per-pool distinction rate gauges + scheme chip breakdown
- `ActualisationRatePanel.tsx` — global freshness donut + pool tabs + stale object detail table
- `ExportToolbar.tsx` — sticky bottom bar with 5 export actions + result count pill
- `ScheduleReportModal.tsx` — scheduling configuration modal (format, frequency, recipient, filter snapshot)

#### [NEW] `data/mock-dashboard.ts`
Shapes all KPI data: per-type counts, status breakdown, per-city deltas, completeness scores + missing field lists, capacity aggregates, weekly velocity series (12 wks), contributor rankings.

#### [NEW] `utils/dashboard-export.ts`
Pure utilities: `exportToCSV()`, `exportToJSON()`, `buildPseudoExcel()` (multi-CSV tab fallback), `triggerPrintReport()`.

### Modified files

#### [MODIFY] [views/DashboardPage.tsx](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/views/DashboardPage.tsx)
Full rewrite. Two-column layout (`DashboardFiltersPanel` + main content). Assembles all sub-components. Lifts local UI state (`focusWeek`, `contributorTimeRange`). Filter state lives in `dashboard-filter-store`.

#### [MODIFY] [styles.css](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/styles.css)
New CSS blocks:
- `.dashboard-layout` — two-column sidebar + main
- `.dashboard-filters-sidebar`, `--collapsed` variant, `.dashboard-filters-rail`
- `.active-filter-strip`, `.active-filter-chip`
- `.kpi-hero-strip`, `.kpi-scorecard`, `.kpi-sparkline`
- `.donut-chart`, `.type-bar-list`, `.type-bar-row`
- `.city-rank-list`
- `.completeness-gauge-grid`, `.completeness-gauge` (SVG arc)
- `.capacity-panel`, `.capacity-tile`
- `.velocity-chart`, `.velocity-bar`, `.velocity-bar--update`
- `.contributor-board`, `.contributor-row`, `.crown-badge`
- `.export-toolbar` (glassmorphism, sticky bottom, z-index layer)
- `.schedule-report-modal`
- `@media print` — print-optimized report layout
- `@keyframes kpi-count-up`, `@keyframes bar-grow`, `@keyframes gauge-fill`

---

> [!IMPORTANT]
> **Real Database Layer** — Every dashboard service function must follow the **exact same `demoMode` pattern** used in [rpc.ts](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/services/rpc.ts): return mock data when `useSessionStore.getState().demoMode` is true, call the real Supabase RPC when false. No dashboard component should ever call Supabase directly.

---

## Real Data Layer (Production)

### Architecture: how mock ↔ real works

The app already has a clean switching mechanism in [rpc.ts](file:///c:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/services/rpc.ts):

```ts
// Pattern used by every service function:
const session = useSessionStore.getState();
if (session.demoMode || !requireRpcClient()) {
  return mockDashboardData.scorecards; // ← demo mode
}
const { data, error } = await client.schema('api').rpc('get_dashboard_scorecards', { ... });
```

`NEXT_PUBLIC_ENABLE_DEMO_MODE=false` + valid Supabase credentials → all dashboard calls go live automatically.

---

### New service file

#### [NEW] `services/dashboard-rpc.ts`
One exported async function per KPI section, all following the `demoMode` guard pattern:

| Function | Mock fallback | Real RPC |
|----------|--------------|----------|
| `getDashboardScorecards(filters)` | `mockDashboardData.scorecards` | `api.get_dashboard_scorecards` |
| `getDashboardTypeBreakdown(filters)` | `mockDashboardData.typeBreakdown` | `api.get_dashboard_type_breakdown` |
| `getDashboardCompleteness(filters)` | `mockDashboardData.completeness` | `api.get_dashboard_completeness` |
| `getDashboardCapacity(filters)` | `mockDashboardData.capacity` | `api.get_dashboard_capacity` |
| `getDashboardVelocity(filters)` | `mockDashboardData.velocity` | `api.get_dashboard_velocity` |
| `getDashboardContributors(filters)` | `mockDashboardData.contributors` | `api.get_dashboard_contributors` |
| `getDashboardSeasonality(filters)` | `mockDashboardData.seasonality` | `api.get_dashboard_seasonality` |
| `getDashboardDistinctions(filters)` | `mockDashboardData.distinctions` | `api.get_dashboard_distinctions` |
| `getDashboardActualisation(filters)` | `mockDashboardData.actualisation` | `api.get_dashboard_actualisation` |

All functions accept a `DashboardFilters` input (derived from `dashboard-filter-store`) and return typed promises.

---

### New SQL RPCs (to be added to [api_views_functions.sql](file:///c:/Users/dphil/Bertel3.0/Base%20de%20donn%C3%A9e%20DLL%20et%20API/api_views_functions.sql))

Six new `SECURITY DEFINER` functions in the `api` schema, each returning `JSONB`. They follow the existing code style exactly (same `SET search_path`, same `LANGUAGE plpgsql STABLE` pattern).

#### `api.get_dashboard_scorecards(p_filters JSONB)`
```sql
-- Returns: { total, published, published_pct, avg_completeness, pending_changes, delta_30d }
-- Sources: object (status, updated_at), pending_change (status)
SELECT jsonb_build_object(
  'total',            COUNT(*) FILTER (WHERE o.status <> 'archived'),
  'published',        COUNT(*) FILTER (WHERE o.status = 'published'),
  'published_pct',    ROUND(COUNT(*) FILTER (WHERE o.status = 'published') * 100.0
                            / NULLIF(COUNT(*) FILTER (WHERE o.status <> 'archived'), 0), 1),
  'pending_changes',  (SELECT COUNT(*) FROM pending_change WHERE status = 'pending'),
  'delta_30d',        COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')
) FROM object o WHERE /* apply p_filters type/status */;
```

#### `api.get_dashboard_type_breakdown(p_filters JSONB)`
```sql
-- Returns: Array<{ type, count, published, draft, archived }>
-- Source: object GROUP BY object_type
SELECT jsonb_agg(jsonb_build_object(
  'type', object_type, 'count', total,
  'published', pub, 'draft', dft, 'archived', arch
))
FROM (SELECT object_type,
             COUNT(*) total,
             COUNT(*) FILTER (WHERE status='published') pub,
             COUNT(*) FILTER (WHERE status='draft') dft,
             COUNT(*) FILTER (WHERE status='archived') arch
      FROM object GROUP BY object_type) t;
```

#### `api.get_dashboard_capacity(p_types TEXT[], p_filters JSONB)`
```sql
-- Returns: { beds, covers, pitches, mice_theatre, mice_classroom, trail_km }
-- Sources: object_room_type, object_capacity, object_meeting_room, object_iti
SELECT jsonb_build_object(
  'beds',            SUM(rt.total_rooms * COALESCE(rt.capacity_adults,1))
                       FROM object_room_type rt JOIN object o ON o.id=rt.object_id
                       WHERE o.object_type = ANY(p_types) AND o.status='published',
  'covers',          SUM(oc.value) FROM object_capacity oc
                       JOIN object o ON o.id=oc.object_id
                       WHERE oc.metric_code='nb_couverts' AND o.status='published',
  'trail_km',        SUM(oi.distance_km) FROM object_iti oi
                       JOIN object o ON o.id=oi.object_id WHERE o.status='published'
  -- ... etc
);
```

#### `api.get_dashboard_seasonality(p_filters JSONB)`
```sql
-- Returns: Array<{ month, openings, closings, events }>
-- Sources: opening_period (date_start, date_end), object_fma (event_start_date)
SELECT jsonb_agg(jsonb_build_object(
  'month', TO_CHAR(m.month, 'YYYY-MM'),
  'openings', COUNT(DISTINCT op.object_id) FILTER (
                WHERE DATE_TRUNC('month', op.date_start) = m.month),
  'closings', COUNT(DISTINCT op.object_id) FILTER (
                WHERE DATE_TRUNC('month', op.date_end) = m.month),
  'events',   COUNT(DISTINCT fma.object_id) FILTER (
                WHERE DATE_TRUNC('month', fma.event_start_date) = m.month)
))
FROM generate_series(DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
                     DATE_TRUNC('month', NOW()), '1 month') m(month)
CROSS JOIN opening_period op
CROSS JOIN object_fma fma;
```

#### `api.get_dashboard_distinctions(p_filters JSONB)`
```sql
-- Returns: Array<{ pool_code, total_active, with_distinction, rate, by_scheme[] }>
-- Sources: object, object_classification (status='granted'), ref_classification_scheme
SELECT jsonb_agg(jsonb_build_object(
  'pool_code', pool,
  'total_active', COUNT(DISTINCT o.id),
  'with_distinction', COUNT(DISTINCT oc.object_id),
  'rate', ROUND(COUNT(DISTINCT oc.object_id)*100.0/NULLIF(COUNT(DISTINCT o.id),0),1)
))
FROM object o
LEFT JOIN object_classification oc ON oc.object_id=o.id AND oc.status='granted'
WHERE o.status='published' AND o.commercial_visibility='active'
GROUP BY pool; -- pools defined by type membership
```

#### `api.get_dashboard_actualisation(p_types TEXT[], p_threshold_days INT)`
```sql
-- Returns: Array<{ type, total, up_to_date, to_review, stale }>
-- Source: object (updated_at, object_type); threshold is configurable
SELECT jsonb_agg(jsonb_build_object(
  'type', object_type,
  'total', COUNT(*),
  'up_to_date', COUNT(*) FILTER (WHERE updated_at >= NOW()-make_interval(days=>p_threshold_days)),
  'to_review',  COUNT(*) FILTER (WHERE updated_at < NOW()-make_interval(days=>p_threshold_days)
                                    AND updated_at >= NOW()-make_interval(days=>p_threshold_days*2)),
  'stale',      COUNT(*) FILTER (WHERE updated_at < NOW()-make_interval(days=>p_threshold_days*2))
))
FROM object WHERE status='published' AND object_type = ANY(p_types)
GROUP BY object_type;
```

### TypeScript types

#### [NEW] `types/dashboard.ts`
Typed interfaces for every RPC response payload — one interface per dashboard section (e.g., `DashboardScorecards`, `TypeBreakdownRow`, `CapacityKPIs`, `SeasonalityMonth`, `DistinctionPool`, `ActualisationRow`, etc.). These types are shared between the mock data and the real service layer so components never need to change when switching from demo to production.

---



1. **Progressive disclosure** — summary at a glance, drill-down on click (drawer, tooltip, filter)
2. **Color-coded types** — reuse `--type-HOT`, `--type-RES` etc. tokens consistently across all sections
3. **Actionability** — every gap has a CTA (link to editor, missing-data overlay)
4. **Animation** — count-up on mount, bar-grow, staggered card entry
5. **Filter = single source of truth** — `dashboard-filter-store` drives all KPI computations
6. **Dark-mode ready** — all new classes use existing CSS custom properties

---

## Verification Plan

### Manual verification (in-browser)

```
cd c:\Users\dphil\Bertel3.0\bertel-tourism-ui
npm run dev
```

1. **Filter sidebar** — renders on left; collapse shrinks to icon rail with badge; each section is accordion-collapsible
2. **Active filter strip** — selecting City adds a chip; clicking chip removes filter; "Réinitialiser tout" clears all
3. **Filter reactivity** — changing any filter immediately updates all 6 KPI sections
4. **Hero scorecards** — 4 tiles with number, trend arrow, sparkline
5. **Type breakdown** — donut renders; hover on segment highlights matching bar row
6. **City distribution** — top cities listed; click a city adds an active filter chip
7. **Completeness grid** — one gauge per type at correct %; click opens the completeness drawer
8. **Capacity panel** — tabs switch tiles; "Missing data" badges appear for incomplete types
9. **Velocity chart** — 12 bars animate in; clicking a bar filters the contributor board to that week
10. **Contributor board** — crown badge on top; segmented control reorders list
11. **Export toolbar** — sticky at bottom; CSV triggers download; JSON triggers download; result count pill matches filtered count; "Planifier" opens modal

### TypeScript check
```
cd c:\Users\dphil\Bertel3.0\bertel-tourism-ui
npx tsc --noEmit
```
No new TypeScript errors should appear.


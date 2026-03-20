import type { BackendObjectTypeCode } from './domain';

// ─── Shared filter input ──────────────────────────────────────────────────────
// Serialised from dashboard-filter-store to every RPC call.
// Mirrors the p_filters JSONB shape already understood by api.get_filtered_object_ids,
// plus the separate DATE params that are dashboard-only.

export interface DashboardFilters {
  /** Maps to p_types object_type[] */
  types?: BackendObjectTypeCode[];
  /** Maps to p_status object_status[]. Default on the server: ['published'] */
  status?: ('draft' | 'published' | 'archived' | 'hidden')[];
  /** Maps to p_filters.city_any */
  cities?: string[];
  /** Maps to p_filters.lieu_dit_any */
  lieuDits?: string[];
  /** Maps to p_filters.tags_any */
  labelsAny?: string[];
  /** Maps to p_filters.classifications_any */
  classificationsAny?: { schemeCode: string; valueCode: string }[];
  /** Maps to p_filters.pet_accepted */
  petsAccepted?: boolean;
  /** Maps to p_filters.amenities_any: ['wheelchair_access'] */
  pmr?: boolean;
  /** Maps to p_updated_at_from DATE (inclusive lower bound) */
  updatedAtFrom?: string;
  /** Maps to p_updated_at_to DATE (inclusive upper bound) */
  updatedAtTo?: string;
}

// ─── §1  Hero Scorecards  (LOCKED — Phase 2A) ────────────────────────────────

export interface DashboardScorecards {
  total: number;
  published: number;
  /** published / total × 100, 1 decimal */
  published_pct: number;
  /**
   * Always null in Phase 2A.
   * Will be the average field-presence score (0–100) in Phase 2C
   * once the per-type completeness formula is implemented server-side.
   */
  avg_completeness: null;
  /** pending_change rows scoped to the filtered object pool */
  pending_changes: number;
  /** objects created in the last 30 days within the filtered pool */
  delta_30d: number;
  /** percentage change vs the prior 30-day window; null when prior window is empty */
  delta_pct: number | null;
}

// ─── §2a  Type Breakdown  (LOCKED — Phase 2A) ────────────────────────────────

export interface TypeBreakdownRow {
  type: BackendObjectTypeCode;
  count: number;
  published: number;
  draft: number;
  archived: number;
  /** count / total × 100, 1 decimal */
  pct_of_total: number;
}

export interface DashboardTypeBreakdown {
  total: number;
  rows: TypeBreakdownRow[];
}

// ─── §2b  City Distribution  (LOCKED — Phase 2A) ─────────────────────────────

export interface CityRow {
  city: string;
  count: number;
  /** objects created (not updated) in this city in the last 30 days */
  delta_30d: number;
}

export interface DashboardCityDistribution {
  rows: CityRow[];
}

// ─── §10  Actualisation Rate  (LOCKED — Phase 2A) ────────────────────────────

export interface ActualisationRow {
  type: BackendObjectTypeCode;
  total: number;
  /** updated_at < threshold_days ago */
  up_to_date: number;
  /** updated_at between threshold and 2× threshold days ago */
  to_review: number;
  /** updated_at > 2× threshold days ago */
  stale: number;
  /** up_to_date / total × 100, 1 decimal */
  rate: number;
  /**
   * 12-week sparkline (0–1 rates, week 0 = oldest).
   * Null until Phase 2B adds the object_version time-series join.
   */
  weekly_rates: null;
}

export interface DashboardActualisation {
  threshold_days: number;
  rows: ActualisationRow[];
}

// ─── Provisional types — mock-only, NOT locked ───────────────────────────────
// Used by the UI in Phase 1. Shapes WILL change before Phase 2B SQL is written.
// Components importing these must only do so via the mock data layer, never
// by calling a real RPC. The _PROVISIONAL suffix is intentional.

export interface CompletenessRow_PROVISIONAL {
  type: BackendObjectTypeCode;
  total: number;
  avg_score: number;
  /** e.g. 'image', 'contact', 'opening_times' */
  missing_top_field: string;
  below_80: Array<{
    id: string;
    name: string;
    score: number;
    missing_fields: string[];
  }>;
}

export interface CapacityMetricSummary_PROVISIONAL {
  total: number;
  contributing_objects: number;
  avg_per_object: number;
}

export interface CapacityKPIs_PROVISIONAL {
  /** HOT+HPA+HLO+CAMP: object_room_type.total_rooms × capacity_adults */
  beds: CapacityMetricSummary_PROVISIONAL;
  /** RES: object_capacity metric code 'seats' */
  covers: CapacityMetricSummary_PROVISIONAL;
  /** CAMP: object_capacity metric code 'pitches' */
  pitches: CapacityMetricSummary_PROVISIONAL;
  /** HOT+RES: object_meeting_room.cap_theatre */
  mice_theatre: CapacityMetricSummary_PROVISIONAL;
  /** HOT+RES: object_meeting_room.cap_classroom */
  mice_classroom: CapacityMetricSummary_PROVISIONAL;
  /** ITI: object_iti.distance_km */
  trail_km: CapacityMetricSummary_PROVISIONAL;
}

export interface VelocityWeek_PROVISIONAL {
  /** ISO date string, Monday of the week */
  week_start: string;
  created: number;
  updated: number;
}

export interface ContributorRow_PROVISIONAL {
  user_id: string;
  display_name: string;
  role: string;
  change_count: number;
  primary_types: BackendObjectTypeCode[];
  trend_pct: number | null;
}

export interface SeasonalityMonth_PROVISIONAL {
  /** 'YYYY-MM' */
  month: string;
  openings: number;
  closings: number;
  events: number;
  opening_objects: { id: string; name: string; type: string }[];
  closing_objects: { id: string; name: string; type: string }[];
}

export interface DistinctionPool_PROVISIONAL {
  pool_code: 'HEB' | 'RES' | 'LOI' | 'PLEIN_AIR';
  label: string;
  types: BackendObjectTypeCode[];
  total_active: number;
  with_distinction: number;
  /** 0–1 */
  rate: number;
  /**
   * Verified scheme codes from seeds:
   * hot_stars | camp_stars | meuble_stars | gites_epics |
   * clevacances_keys | green_key | eu_ecolabel | tourisme_handicap
   */
  by_scheme: { scheme_code: string; scheme_name: string; count: number }[];
  missing_objects: { id: string; name: string; type: string }[];
}

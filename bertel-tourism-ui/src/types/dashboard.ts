import type { BackendObjectTypeCode } from './domain';

/** Onglets du dashboard — un par vocation (spec 2026-06-11 §3). */
export type DashboardTabKey = 'quality' | 'offer' | 'activity';

// ─── §1  Hero Scorecards  (LOCKED — Phase 2A) ────────────────────────────────

export interface DashboardScorecards {
  total: number;
  published: number;
  /** published / total × 100, 1 decimal */
  published_pct: number;
  /**
   * Weighted mean (by fiche count) of the per-type avg_score returned by
   * api.get_dashboard_completeness — visitor-perceived completeness 0–100.
   * Single source of truth for the 8-essential formula (no client recompute).
   * null when the filtered pool is empty.
   */
  avg_completeness: number | null;
  /**
   * Objects holding ≥1 granted official classement/label
   * (ref_classification_scheme.is_distinction), scoped to the filtered pool.
   */
  distinctions: number;
  /** distinctions / total × 100, 1 decimal. 0.0 when the pool is empty */
  distinctions_pct: number;
  /** pending_change rows scoped to the filtered object pool */
  pending_changes: number;
  /** objects created in the last 30 days within the filtered pool */
  delta_30d: number;
  /** percentage change vs the prior 30-day window; null when prior window is empty */
  delta_pct: number | null;
  /**
   * Average number of calendar days between pending_change.submitted_at and
   * COALESCE(applied_at, reviewed_at), for changes with status in
   * ('approved', 'rejected', 'applied'). Null when no resolved changes exist
   * in the current filtered pool.
   */
  avg_processing_days: number | null;
}

// ─── §1  CRM ouvert — carte d'attention du bandeau (LOCKED — 2026-08-30) ─────

export interface DashboardCrmOpen {
  /**
   * Interactions CRM ouvertes, GLOBAL (aucun filtre appliqué).
   * Prédicat identique à crm_backlog dans api.capture_metric_snapshots : resolved_at IS NULL
   * et la liste positive TYPÉE des statuts ouverts (new, in_progress, awaiting_provider),
   * manifeste 17g. Une comparaison en texte y serait une panne muette : elle survivrait à
   * tout renommage du vocabulaire en se réduisant à resolved_at IS NULL.
   */
  open_interactions: number;
  /**
   * Tâches CRM ouvertes — vocabulaire des TÂCHES (crm_task_status), distinct de celui des
   * demandes : les statuts terminaux de tâche sont exclus.
   */
  open_tasks: number;
  /** open_interactions + open_tasks */
  total: number;
  /** Demandes ouvertes de moins de 90 jours (manifeste 17h). */
  recent_interactions: number;
  /**
   * Demandes ouvertes de 90 jours ou plus (manifeste 17h). Calculé côté serveur par
   * SOUSTRACTION, si bien que recent + backlog = open_interactions PAR CONSTRUCTION : les
   * trois chiffres ne peuvent pas se contredire, et une demande sans date d'occurrence tombe
   * dans l'arriéré au lieu de disparaître entre deux bornes.
   */
  backlog_interactions: number;
}

// ─── §2  Activité de l'équipe — rythme de saisie et contributeurs (17h) ──────

export interface DashboardTeamActivityWeek {
  /** Lundi de la semaine, ISO (YYYY-MM-DD). */
  week_start: string;
  /**
   * Couples (éditeur, jour) — des JOURS, pas des versions. Une passe d'import produit des
   * centaines de versions en une après-midi ; les compter ferait de cette après-midi le
   * sommet de l'année. Un indicateur de rythme mesure la régularité, pas le débit.
   */
  editor_days: number;
  editors: number;
  objects_touched: number;
  /** Objets créés dans la semaine (versions `insert`), auteurs humains uniquement. */
  created: number;
}

export interface DashboardTeamActivityContributor {
  user_id: string;
  /**
   * Vient de `api.crm_user_label` côté serveur — MÊME source que le kanban CRM et le journal
   * de transitions, pour qu'une personne porte un seul nom d'un écran à l'autre.
   */
  display_name: string;
  active_days: number;
  objects_touched: number;
  /**
   * Jours où l'éditeur touche au moins 10 objets. La distribution réelle est bimodale : le
   * seuil sépare deux régimes de travail, il ne coupe pas une population continue.
   */
  bulk_days: number;
  first_at: string;
  last_at: string;
}

export interface DashboardTeamActivity {
  /** Toujours 12 entrées : une semaine sans activité sort à zéro, jamais omise. */
  weeks: DashboardTeamActivityWeek[];
  /** Trié par active_days décroissant. */
  contributors: DashboardTeamActivityContributor[];
}

// ─── §4  Activité CRM — arriéré, flux, temps net (17h) ───────────────────────

/**
 * Les quatre tranches d'âge, dans l'ordre du contrat. Liste FERMÉE et unique : le type et la
 * liste d'exécution en dérivent tous deux, comme la liste `VALUES` figée côté SQL. Deux
 * énumérations parallèles finiraient par diverger sans que rien ne le signale.
 */
export const DASHBOARD_CRM_AGE_BUCKETS = ['lt_30d', 'd30_90', 'd90_1y', 'gt_1y'] as const;

export type DashboardCrmAgeBucket = (typeof DASHBOARD_CRM_AGE_BUCKETS)[number];

export interface DashboardCrmActivity {
  /** Toujours les QUATRE tranches, une tranche vide à zéro — jamais omise. */
  open_by_age: { bucket: DashboardCrmAgeBucket; count: number }[];
  /** Trié par count décroissant. `name` n'est jamais vide : les demandes sans sujet sont
   *  regroupées sous un libellé explicite. */
  open_by_topic: { code: string | null; name: string; count: number; oldest: string }[];
  /** 12 mois ; un mois sans mouvement porte 0, jamais null. */
  monthly_flow: { month: string; created: number; resolved: number }[];
  /**
   * Temps de traitement NET : écoulé moins l'attente prestataire, parce qu'un indicateur ne
   * doit mesurer que ce que l'équipe maîtrise. `avg_days` vaut null tant qu'aucune demande
   * n'a bouclé son cycle depuis la bascule 17g — null veut dire « pas encore mesurable »,
   * là où zéro voudrait dire « instantané ».
   */
  net: { avg_days: number | null; count: number };
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

// ─── §5  Distinction Overview  (LOCKED — Phase 2B) ───────────────────────────

export type DistinctionDisplayGroup =
  | 'official_classification'
  | 'graded_label'
  | 'quality_label'
  | 'environmental_label'
  | 'accessibility_label';

export interface DistinctionSchemeRow {
  scheme_code: string;
  scheme_name: string;
  display_group: DistinctionDisplayGroup | null;
  count: number;
}

export interface DashboardDistinctionOverview {
  total_scoped: number;
  with_distinction: number;
  without_distinction: number;
  /** with_distinction / total_scoped × 100, 1 decimal. 0.0 when pool is empty */
  distinction_pct: number;
  /**
   * Per-scheme breakdown, sorted by count DESC.
   * Only schemes with count > 0 are included.
   * Covers: hot_stars, camp_stars, meuble_stars, gites_epics, clevacances_keys,
   * green_key, eu_ecolabel, tourisme_handicap.
   */
  by_scheme: DistinctionSchemeRow[];
}

// ─── §Qualité  Complétude « perçue visiteur » par type (LOCKED — 2026-06-18) ──
// Sert api.get_dashboard_completeness. Réplique le bundle d'essentiels du modèle
// éditeur (spec docs/superpowers/specs/2026-06-18-completude-par-type-design.md).

export interface CompletenessBelowObject {
  id: string;
  name: string;
  /** score essentiels 0–100 */
  score: number;
  /** clés d'essentiels manquants : name|subcategory|location|contact|description|photos|type_block|tags */
  missing_fields: string[];
}

export interface CompletenessRow {
  type: BackendObjectTypeCode;
  total: number;
  /** moyenne du score essentiels 0–100 (richesse perçue visiteur) */
  avg_score: number;
  /** % de fiches « complètes visiteur » (tous les essentiels présents, ≥4 photos) */
  complete_pct: number;
  /** essentiel le plus manquant sur le type (souvent 'photos') ; '' si aucun manque */
  missing_top_field: string;
  /** fiches sous 80, plafonné côté serveur par p_below_limit (pas de troncature silencieuse au-delà) */
  below_80: CompletenessBelowObject[];
}

export interface DashboardCompleteness {
  rows: CompletenessRow[];
}

// ─── Provisional types — mock-only, NOT locked ───────────────────────────────
// Used by the UI in Phase 1. Shapes WILL change before Phase 2B SQL is written.
// Components importing these must only do so via the mock data layer, never
// by calling a real RPC. The _PROVISIONAL suffix is intentional.

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

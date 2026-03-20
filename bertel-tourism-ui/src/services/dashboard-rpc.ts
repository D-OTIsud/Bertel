import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type {
  DashboardActualisation,
  DashboardCityDistribution,
  DashboardFilters,
  DashboardScorecards,
  DashboardTypeBreakdown,
} from '../types/dashboard';

// ─── RPC client helper (mirrors requireRpcClient in rpc.ts) ──────────────────

function requireDashboardRpcClient() {
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configuré. Activez le mode demo pour utiliser les données mock.');
  }
  return client;
}

// ─── Filter serialisation ─────────────────────────────────────────────────────
// Converts the TypeScript DashboardFilters into the flat parameter shape
// expected by all four Phase 2A SQL functions.

interface RpcParams {
  p_types?: string[] | null;
  p_status?: string[] | null;
  p_filters: Record<string, unknown>;
  p_updated_at_from?: string | null;
  p_updated_at_to?: string | null;
}

function buildRpcParams(filters: DashboardFilters): RpcParams {
  const p_filters: Record<string, unknown> = {};

  if (filters.cities && filters.cities.length > 0) {
    p_filters.city_any = filters.cities;
  }
  if (filters.lieuDits && filters.lieuDits.length > 0) {
    p_filters.lieu_dit_any = filters.lieuDits;
  }
  if (filters.labelsAny && filters.labelsAny.length > 0) {
    p_filters.tags_any = filters.labelsAny;
  }
  if (filters.classificationsAny && filters.classificationsAny.length > 0) {
    p_filters.classifications_any = filters.classificationsAny.map((c) => ({
      scheme_code: c.schemeCode,
      value_code: c.valueCode,
    }));
  }
  if (filters.petsAccepted) {
    p_filters.pet_accepted = true;
  }
  if (filters.pmr) {
    p_filters.amenities_any = ['wheelchair_access'];
  }

  return {
    p_types:            filters.types   ?? null,
    p_status:           filters.status  ?? null,
    p_filters,
    p_updated_at_from:  filters.updatedAtFrom ?? null,
    p_updated_at_to:    filters.updatedAtTo   ?? null,
  };
}

// ─── Phase 2A — Live RPC functions ───────────────────────────────────────────

export async function getDashboardScorecards(
  filters: DashboardFilters,
): Promise<DashboardScorecards> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.scorecards;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_scorecards', buildRpcParams(filters));

  if (error) throw error;
  return data as DashboardScorecards;
}

export async function getDashboardTypeBreakdown(
  filters: DashboardFilters,
): Promise<DashboardTypeBreakdown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.typeBreakdown;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_type_breakdown', buildRpcParams(filters));

  if (error) throw error;
  return data as DashboardTypeBreakdown;
}

export async function getDashboardCityDistribution(
  filters: DashboardFilters,
  limit = 20,
): Promise<DashboardCityDistribution> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.cityDistribution;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_city_distribution', { ...buildRpcParams(filters), p_limit: limit });

  if (error) throw error;
  return data as DashboardCityDistribution;
}

export async function getDashboardActualisation(
  filters: DashboardFilters,
  thresholdDays = 90,
): Promise<DashboardActualisation> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.actualisation;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_actualisation', {
      ...buildRpcParams(filters),
      p_threshold_days: thresholdDays,
    });

  if (error) throw error;
  return data as DashboardActualisation;
}

// ─── Phase 2B+ stubs — mock-only until backend is implemented ─────────────────
// Pattern matches existing stubs in rpc.ts (listPendingChanges, listCrmTasks…).

export async function getDashboardCompleteness(filters: DashboardFilters): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.completeness;
  }
  void filters;
  throw new Error('RPC get_dashboard_completeness à brancher sur le backend.');
}

export async function getDashboardCapacity(filters: DashboardFilters): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.capacity;
  }
  void filters;
  throw new Error('RPC get_dashboard_capacity à brancher sur le backend.');
}

export async function getDashboardVelocity(filters: DashboardFilters): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.velocity;
  }
  void filters;
  throw new Error('RPC get_dashboard_velocity à brancher sur le backend.');
}

export async function getDashboardContributors(filters: DashboardFilters): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.contributors;
  }
  void filters;
  throw new Error('RPC get_dashboard_contributors à brancher sur le backend.');
}

export async function getDashboardSeasonality(filters: DashboardFilters): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.seasonality;
  }
  void filters;
  throw new Error('RPC get_dashboard_seasonality à brancher sur le backend.');
}

export async function getDashboardDistinctions(filters: DashboardFilters): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.distinctions;
  }
  void filters;
  throw new Error('RPC get_dashboard_distinctions à brancher sur le backend.');
}

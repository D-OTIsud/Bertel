import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { DashboardStatsParams } from '../lib/dashboard-stats-params';
import type {
  DashboardActualisation,
  DashboardCityDistribution,
  DashboardCompleteness,
  DashboardDistinctionOverview,
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

// ─── Phase 2A — Live RPC functions ───────────────────────────────────────────
// params est déjà la charge utile aplatie attendue par les fonctions SQL
// (voir dashboardStatsParams dans lib/dashboard-stats-params.ts) — les getters
// ne font que la transmettre au RPC, sans transformation supplémentaire.

export async function getDashboardScorecards(
  params: DashboardStatsParams,
): Promise<DashboardScorecards> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.scorecards;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_scorecards', params);

  if (error) throw error;
  return data as DashboardScorecards;
}

export async function getDashboardTypeBreakdown(
  params: DashboardStatsParams,
): Promise<DashboardTypeBreakdown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.typeBreakdown;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_type_breakdown', params);

  if (error) throw error;
  return data as DashboardTypeBreakdown;
}

export async function getDashboardCityDistribution(
  params: DashboardStatsParams,
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
    .rpc('get_dashboard_city_distribution', { ...params, p_limit: limit });

  if (error) throw error;
  return data as DashboardCityDistribution;
}

export async function getDashboardActualisation(
  params: DashboardStatsParams,
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
      ...params,
      p_threshold_days: thresholdDays,
    });

  if (error) throw error;
  return data as DashboardActualisation;
}

export async function getDashboardDistinctionOverview(
  params: DashboardStatsParams,
): Promise<DashboardDistinctionOverview> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.distinctionOverview;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_distinction_overview', params);

  if (error) throw error;
  return data as DashboardDistinctionOverview;
}

// ─── Phase 2B+ stubs — mock-only until backend is implemented ─────────────────
// Pattern matches existing stubs in rpc.ts (listPendingChanges, listCrmTasks…).

export async function getDashboardCompleteness(
  params: DashboardStatsParams,
): Promise<DashboardCompleteness> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.completeness;
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_completeness', params);

  if (error) throw error;
  return data as DashboardCompleteness;
}

export async function getDashboardCapacity(params: DashboardStatsParams): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.capacity;
  }
  void params;
  throw new Error('RPC get_dashboard_capacity à brancher sur le backend.');
}

export async function getDashboardVelocity(params: DashboardStatsParams): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.velocity;
  }
  void params;
  throw new Error('RPC get_dashboard_velocity à brancher sur le backend.');
}

export async function getDashboardContributors(params: DashboardStatsParams): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.contributors;
  }
  void params;
  throw new Error('RPC get_dashboard_contributors à brancher sur le backend.');
}

export async function getDashboardSeasonality(params: DashboardStatsParams): Promise<unknown> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    const { mockDashboardData } = await import('../data/mock-dashboard');
    return mockDashboardData.seasonality;
  }
  void params;
  throw new Error('RPC get_dashboard_seasonality à brancher sur le backend.');
}

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { DashboardStatsParams } from '../lib/dashboard-stats-params';
import { DASHBOARD_CRM_AGE_BUCKETS } from '../types/dashboard';
import type {
  DashboardActualisation,
  DashboardCityDistribution,
  DashboardCompleteness,
  DashboardCrmActivity,
  DashboardCrmOpen,
  DashboardDistinctionOverview,
  DashboardScorecards,
  DashboardTeamActivity,
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

/**
 * Compteur des éléments CRM ouverts dans le périmètre réel/test de l'utilisateur.
 * Le périmètre prestataires est optionnel ; les autres facettes ne filtrent pas l'activité.
 */
export async function getDashboardCrmOpen(providerOnly = false): Promise<DashboardCrmOpen> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    return {
      open_interactions: 0, open_tasks: 0, total: 0,
      recent_interactions: 0, backlog_interactions: 0,
    };
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc(providerOnly ? 'get_dashboard_provider_crm_open' : 'get_dashboard_crm_open');

  if (error) throw error;
  return data as DashboardCrmOpen;
}

/**
 * Rythme de saisie de l'équipe sur 12 semaines + table des contributeurs.
 * Série du périmètre réel/test, ou limitée aux objets avec prestataire. Les autres
 * facettes ne filtrent pas l'activité. La formule jours-éditeur de 17h est conservée.
 */
export async function getDashboardTeamActivity(providerOnly = false): Promise<DashboardTeamActivity> {
  const { demoMode } = useSessionStore.getState();
  // Mode démo : la forme VIDE, jamais des données inventées — un rythme d'équipe fabriqué se
  // lirait comme un vrai et n'a aucune valeur de démonstration.
  if (demoMode) {
    return { weeks: [], contributors: [] };
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc(providerOnly ? 'get_dashboard_provider_team_activity' : 'get_dashboard_team_activity');

  if (error) throw error;
  return data as DashboardTeamActivity;
}

/**
 * Arriéré CRM par âge et par sujet, flux mensuel, temps de traitement net.
 * Même périmètre optionnel que getDashboardTeamActivity. Manifeste 17h.
 */
export async function getDashboardCrmActivity(providerOnly = false): Promise<DashboardCrmActivity> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    return {
      // Les quatre tranches sont émises À ZÉRO plutôt qu'omises : la FORME du contrat ne
      // change pas selon le mode, sinon le widget se code deux fois.
      open_by_age: DASHBOARD_CRM_AGE_BUCKETS.map((bucket) => ({ bucket, count: 0 })),
      open_by_topic: [],
      monthly_flow: [],
      net: { avg_days: null, count: 0 },
    };
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc(providerOnly ? 'get_dashboard_provider_crm_activity' : 'get_dashboard_crm_activity');

  if (error) throw error;
  return data as DashboardCrmActivity;
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

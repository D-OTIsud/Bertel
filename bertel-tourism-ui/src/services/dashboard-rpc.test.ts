import type { DashboardStatsParams } from '../lib/dashboard-stats-params';

const PARAMS: DashboardStatsParams = {
  p_types: null,
  p_status: ['published'],
  p_filters: {},
  p_updated_at_from: null,
  p_updated_at_to: null,
};

describe('dashboard-rpc getters', () => {
  const rpc = jest.fn().mockResolvedValue({ data: {}, error: null });
  const schema = jest.fn().mockReturnValue({ rpc });

  beforeEach(() => {
    jest.resetModules();
    rpc.mockClear();
    schema.mockClear();
    rpc.mockResolvedValue({ data: {}, error: null });
  });

  function mockClient() {
    jest.doMock('../lib/supabase', () => ({
      getApiClient: () => ({ schema }),
    }));
    jest.doMock('../store/session-store', () => ({
      useSessionStore: { getState: () => ({ demoMode: false }) },
    }));
  }

  it('getDashboardScorecards passe les params tels quels au RPC', async () => {
    mockClient();
    const { getDashboardScorecards } = await import('./dashboard-rpc');
    await getDashboardScorecards(PARAMS);
    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('get_dashboard_scorecards', PARAMS);
  });

  it('getDashboardTypeBreakdown passe les params tels quels au RPC', async () => {
    mockClient();
    const { getDashboardTypeBreakdown } = await import('./dashboard-rpc');
    await getDashboardTypeBreakdown(PARAMS);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_type_breakdown', PARAMS);
  });

  it('getDashboardCityDistribution ajoute p_limit aux params', async () => {
    mockClient();
    const { getDashboardCityDistribution } = await import('./dashboard-rpc');
    await getDashboardCityDistribution(PARAMS, 10);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_city_distribution', { ...PARAMS, p_limit: 10 });
  });

  it('getDashboardCityDistribution utilise p_limit=20 par défaut', async () => {
    mockClient();
    const { getDashboardCityDistribution } = await import('./dashboard-rpc');
    await getDashboardCityDistribution(PARAMS);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_city_distribution', { ...PARAMS, p_limit: 20 });
  });

  it('getDashboardActualisation ajoute p_threshold_days aux params', async () => {
    mockClient();
    const { getDashboardActualisation } = await import('./dashboard-rpc');
    await getDashboardActualisation(PARAMS, 30);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_actualisation', { ...PARAMS, p_threshold_days: 30 });
  });

  it('getDashboardDistinctionOverview passe les params tels quels au RPC', async () => {
    mockClient();
    const { getDashboardDistinctionOverview } = await import('./dashboard-rpc');
    await getDashboardDistinctionOverview(PARAMS);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_distinction_overview', PARAMS);
  });

  it('getDashboardCompleteness passe les params tels quels au RPC', async () => {
    mockClient();
    const { getDashboardCompleteness } = await import('./dashboard-rpc');
    await getDashboardCompleteness(PARAMS);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_completeness', PARAMS);
  });

  it('getDashboardCrmOpen appelle la RPC sans aucun paramètre', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: { open_interactions: 170, open_tasks: 2, total: 172 }, error: null });
    const { getDashboardCrmOpen } = await import('./dashboard-rpc');

    const result = await getDashboardCrmOpen();

    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('get_dashboard_crm_open');
    expect(result.total).toBe(172);
  });

  it('getDashboardCrmOpen propage l’erreur RPC au lieu de l’avaler', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { getDashboardCrmOpen } = await import('./dashboard-rpc');

    await expect(getDashboardCrmOpen()).rejects.toThrow('boom');
  });

  it('getDashboardCrmOpen expose les deux clés récent/arriéré (manifeste 17h)', async () => {
    mockClient();
    rpc.mockResolvedValue({
      data: {
        open_interactions: 170, open_tasks: 2, total: 172,
        recent_interactions: 3, backlog_interactions: 167,
      },
      error: null,
    });
    const { getDashboardCrmOpen } = await import('./dashboard-rpc');

    const result = await getDashboardCrmOpen();

    // L'invariant que la RPC tient PAR CONSTRUCTION doit traverser le getter intact.
    expect(result.recent_interactions + result.backlog_interactions).toBe(result.open_interactions);
  });

  it('getDashboardTeamActivity appelle la RPC sans aucun paramètre', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: { weeks: [], contributors: [] }, error: null });
    const { getDashboardTeamActivity } = await import('./dashboard-rpc');

    const result = await getDashboardTeamActivity();

    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('get_dashboard_team_activity');
    expect(result.weeks).toEqual([]);
  });

  it('getDashboardTeamActivity propage l’erreur RPC au lieu de l’avaler', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { getDashboardTeamActivity } = await import('./dashboard-rpc');

    await expect(getDashboardTeamActivity()).rejects.toThrow('boom');
  });

  it('getDashboardCrmActivity appelle la RPC sans aucun paramètre', async () => {
    mockClient();
    rpc.mockResolvedValue({
      data: { open_by_age: [], open_by_topic: [], monthly_flow: [], net: { avg_days: null, count: 0 } },
      error: null,
    });
    const { getDashboardCrmActivity } = await import('./dashboard-rpc');

    const result = await getDashboardCrmActivity();

    expect(rpc).toHaveBeenCalledWith('get_dashboard_crm_activity');
    // avg_days null = « pas encore mesurable ». Le getter ne doit pas le replier sur 0,
    // qui voudrait dire « traitement instantané » — deux affirmations opposées.
    expect(result.net.avg_days).toBeNull();
  });

  it('getDashboardCrmActivity propage l’erreur RPC au lieu de l’avaler', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { getDashboardCrmActivity } = await import('./dashboard-rpc');

    await expect(getDashboardCrmActivity()).rejects.toThrow('boom');
  });

  it('en mode démo, les deux getters d’activité rendent des formes VIDES, jamais des données inventées', async () => {
    jest.doMock('../lib/supabase', () => ({ getApiClient: () => ({ schema }) }));
    jest.doMock('../store/session-store', () => ({
      useSessionStore: { getState: () => ({ demoMode: true }) },
    }));
    const { getDashboardTeamActivity, getDashboardCrmActivity } = await import('./dashboard-rpc');

    const team = await getDashboardTeamActivity();
    const crm = await getDashboardCrmActivity();

    expect(rpc).not.toHaveBeenCalled();
    expect(team).toEqual({ weeks: [], contributors: [] });
    // Les quatre tranches sont émises À ZÉRO même en démo : la forme du contrat ne change
    // pas selon le mode, sinon le widget se code deux fois.
    expect(crm.open_by_age.map((b) => b.bucket)).toEqual(['lt_30d', 'd30_90', 'd90_1y', 'gt_1y']);
    expect(crm.open_by_age.every((b) => b.count === 0)).toBe(true);
    expect(crm.net).toEqual({ avg_days: null, count: 0 });
  });

  it('en mode demo, ne touche pas au client Supabase', async () => {
    jest.doMock('../lib/supabase', () => ({
      getApiClient: () => ({ schema }),
    }));
    jest.doMock('../store/session-store', () => ({
      useSessionStore: { getState: () => ({ demoMode: true }) },
    }));
    const { getDashboardScorecards } = await import('./dashboard-rpc');
    const result = await getDashboardScorecards(PARAMS);
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

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

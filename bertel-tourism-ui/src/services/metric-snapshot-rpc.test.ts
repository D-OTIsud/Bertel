import type { MetricSeriesArgs } from '../types/metric-snapshot';

const ARGS: MetricSeriesArgs = { metricKey: 'completeness_avg', scope: 'global', grain: 'week' };

describe('metric-snapshot-rpc', () => {
  const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
  const schema = jest.fn().mockReturnValue({ rpc });

  beforeEach(() => {
    jest.resetModules();
    rpc.mockClear();
    schema.mockClear();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  function mockClient(demoMode = false) {
    jest.doMock('../lib/supabase', () => ({ getApiClient: () => ({ schema }) }));
    jest.doMock('../store/session-store', () => ({
      useSessionStore: { getState: () => ({ demoMode }) },
    }));
  }

  it('passe la métrique, la portée et le grain au RPC', async () => {
    mockClient();
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await getMetricSnapshotSeries(ARGS);

    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('get_metric_snapshot_series_with_bounds', expect.objectContaining({
      p_metric_key: 'completeness_avg',
      p_scope: 'global',
      p_grain: 'week',
    }));
  });

  it('applique le grain mois par défaut', async () => {
    mockClient();
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await getMetricSnapshotSeries({ metricKey: 'corpus_count', scope: 'global' });

    expect(rpc).toHaveBeenCalledWith('get_metric_snapshot_series_with_bounds', expect.objectContaining({ p_grain: 'month' }));
  });

  it('propage l’erreur RPC au lieu de l’avaler', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await expect(getMetricSnapshotSeries(ARGS)).rejects.toThrow('boom');
  });

  it('rend une série vide en mode démo, sans jamais appeler le RPC', async () => {
    mockClient(true);
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await expect(getMetricSnapshotSeries(ARGS)).resolves.toEqual({ points: [], firstSnapshotDate: null, lastSnapshotDate: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('adapte les points et conserve les dates sources distinctes des buckets', async () => {
    mockClient();
    rpc.mockResolvedValue({
      data: { points: [
        { bucket: '2026-06-01', value: 92.3, denominator: 361 },
        { bucket: '2026-07-01', value: 91.4, denominator: 839 },
        { bucket: '2026-08-01', value: 91.4, denominator: 843 },
      ], first_snapshot_date: '2026-06-19', last_snapshot_date: '2026-08-30' },
      error: null,
    });
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    const result = await getMetricSnapshotSeries(ARGS);

    expect(result).toEqual({
      firstSnapshotDate: '2026-06-19',
      lastSnapshotDate: '2026-08-30',
      points: [
        { bucket_date: '2026-06-01', value: 92.3, denominator: 361 },
        { bucket_date: '2026-07-01', value: 91.4, denominator: 839 },
        { bucket_date: '2026-08-01', value: 91.4, denominator: 843 },
      ],
    });
  });

  it('rend une série vide quand le RPC ne renvoie aucune ligne (data nul)', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: null });
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await expect(getMetricSnapshotSeries(ARGS)).resolves.toEqual({ points: [], firstSnapshotDate: null, lastSnapshotDate: null });
  });
});

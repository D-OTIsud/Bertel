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
    expect(rpc).toHaveBeenCalledWith('get_metric_snapshot_series', expect.objectContaining({
      p_metric_key: 'completeness_avg',
      p_scope: 'global',
      p_grain: 'week',
    }));
  });

  it('applique le grain mois par défaut', async () => {
    mockClient();
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await getMetricSnapshotSeries({ metricKey: 'corpus_count', scope: 'global' });

    expect(rpc).toHaveBeenCalledWith('get_metric_snapshot_series', expect.objectContaining({ p_grain: 'month' }));
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

    await expect(getMetricSnapshotSeries(ARGS)).resolves.toEqual({ points: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  // Écart de contrat serveur (résolu 2026-08-30) : la RPC rend un tableau de
  // lignes NU (colonne `bucket`), pas une enveloppe { points: [...] }. Ce test
  // part du format serveur mesuré en direct et vérifie que le service l'adapte
  // au contrat client `{ points: [{ bucket_date, value, denominator }] }`.
  it('adapte le tableau de lignes du serveur (bucket) au contrat client (bucket_date)', async () => {
    mockClient();
    rpc.mockResolvedValue({
      data: [
        { bucket: '2026-06-01', value: 92.3, denominator: 361 },
        { bucket: '2026-07-01', value: 91.4, denominator: 839 },
        { bucket: '2026-08-01', value: 91.4, denominator: 843 },
      ],
      error: null,
    });
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    const result = await getMetricSnapshotSeries(ARGS);

    expect(result).toEqual({
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

    await expect(getMetricSnapshotSeries(ARGS)).resolves.toEqual({ points: [] });
  });
});

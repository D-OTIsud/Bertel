import type { ObjectWorkspaceCapacityPoliciesModule } from './object-workspace-parser';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: () => ({ demoMode: false }) },
}));

import { getSupabaseClient } from '../lib/supabase';
import { getObjectWorkspaceCapacityPoliciesModule } from './object-workspace';

const mockGetClient = getSupabaseClient as jest.Mock;

const METRICS = [
  { id: 'm-max', code: 'max_capacity', name: 'Capacité max.', position: 3 },
  { id: 'm-beds', code: 'beds', name: 'Couchages', position: 1 },
  { id: 'm-seats', code: 'seats', name: 'Places assises', position: 4 },
];

function baseModule(): ObjectWorkspaceCapacityPoliciesModule {
  return {
    metricOptions: [],
    capacityItems: [],
    groupPolicy: { minSize: '', maxSize: '', groupOnly: false, notes: '' },
    petPolicy: { accepted: false, conditions: '' },
    unavailableReason: null,
  };
}

/**
 * Minimal chainable/thenable PostgREST builder for the §07 capacity loader:
 * ref_capacity_metric + object_capacity + group/pet maybeSingle + the
 * ref_capacity_applicability select the type filter rides on.
 */
function makeMockClient(opts: {
  applicableMetricIds?: string[] | 'error';
  capacityRows?: Record<string, unknown>[];
} = {}) {
  function from(table: string) {
    const ctx: { filters: Record<string, unknown>; single?: boolean } = { filters: {} };
    const respond = () => {
      if (table === 'ref_capacity_metric') {
        return { data: METRICS, error: null };
      }
      if (table === 'object_capacity') {
        return { data: opts.capacityRows ?? [], error: null };
      }
      if (table === 'ref_capacity_applicability') {
        if (opts.applicableMetricIds === 'error') {
          return { data: null, error: { message: 'boom' } };
        }
        return { data: (opts.applicableMetricIds ?? []).map((id) => ({ metric_id: id })), error: null };
      }
      // object_group_policy / object_pet_policy maybeSingle
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        ctx.filters[col] = val;
        return b;
      },
      order: () => b,
      maybeSingle: () => {
        ctx.single = true;
        return b;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(respond()).then(resolve, reject),
    };
    return b;
  }
  return { client: { from } };
}

afterEach(() => {
  mockGetClient.mockReset();
});

/**
 * §07 review: metricOptions are filtered by ref_capacity_applicability for the
 * object's type (the known deferred item) — fail-open on probe failure, and a
 * non-applicable metric ALREADY used by the object stays selectable (no data loss).
 */
describe('capacity metric options filtered by type applicability', () => {
  it('keeps only the applicable metrics for the object type', async () => {
    const { client } = makeMockClient({ applicableMetricIds: ['m-max', 'm-seats'] });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceCapacityPoliciesModule('o1', baseModule(), 'RES');

    expect(moduleResult.metricOptions.map((option) => option.code)).toEqual(['max_capacity', 'seats']);
  });

  it('keeps a non-applicable metric that the object already uses', async () => {
    const { client } = makeMockClient({
      applicableMetricIds: ['m-max'],
      capacityRows: [{ id: 'row1', metric_id: 'm-beds', value_integer: 4, unit: 'bed', effective_from: null, effective_to: null }],
    });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceCapacityPoliciesModule('o1', baseModule(), 'RES');

    expect(moduleResult.metricOptions.map((option) => option.code)).toEqual(
      expect.arrayContaining(['max_capacity', 'beds']),
    );
    expect(moduleResult.capacityItems[0].metricCode).toBe('beds');
  });

  it('fails open (no filtering) when the applicability probe errors', async () => {
    const { client } = makeMockClient({ applicableMetricIds: 'error' });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceCapacityPoliciesModule('o1', baseModule(), 'RES');

    expect(moduleResult.metricOptions).toHaveLength(METRICS.length);
    expect(moduleResult.unavailableReason).toBeNull();
  });

  it('fails open when the object type is unknown (empty string)', async () => {
    const { client } = makeMockClient({ applicableMetricIds: [] });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceCapacityPoliciesModule('o1', baseModule(), '');

    expect(moduleResult.metricOptions).toHaveLength(METRICS.length);
  });
});

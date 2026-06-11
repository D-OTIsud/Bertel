import type { ObjectWorkspaceCapacityPoliciesModule, ObjectWorkspaceCharacteristicsModule } from './object-workspace-parser';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: () => ({ demoMode: false }) },
}));

import { getApiClient, getSupabaseClient } from '../lib/supabase';
import {
  getObjectWorkspaceCapacityPoliciesModule,
  saveObjectWorkspaceCapacityPolicies,
  saveObjectWorkspaceCharacteristics,
} from './object-workspace';

const mockGetClient = getSupabaseClient as jest.Mock;
const mockGetApiClient = getApiClient as jest.Mock;

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
  mockGetApiClient.mockReset();
});

function characteristicsModule(over: Partial<ObjectWorkspaceCharacteristicsModule> = {}): ObjectWorkspaceCharacteristicsModule {
  return {
    languageOptions: [],
    languageLevelOptions: [],
    selectedLanguages: [],
    paymentOptions: [],
    selectedPaymentCodes: [],
    environmentOptions: [],
    selectedEnvironmentCodes: [],
    amenityGroups: [],
    selectedAmenityCodes: [],
    unavailableReason: null,
    ...over,
  };
}

function apiClientCapturingRpc() {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  return rpc;
}

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

/**
 * §07 review — pet policy tri-state: an ABSENT object_pet_policy row means
 * « non renseigné » (accepted = null), never a public « Animaux non acceptés ».
 * The saver sends pet_policy: null in that state (the RPC deletes the row).
 */
describe('pet policy tri-state (null = non renseigné)', () => {
  it('loader keeps an absent pet row as accepted=null (not false)', async () => {
    const { client } = makeMockClient({ applicableMetricIds: ['m-max'] });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceCapacityPoliciesModule('o1', baseModule(), 'RES');

    expect(moduleResult.petPolicy.accepted).toBeNull();
  });

  it('saver sends pet_policy null when not stated (RPC deletes the row)', async () => {
    const rpc = apiClientCapturingRpc();

    await saveObjectWorkspaceCapacityPolicies('o1', {
      ...baseModule(),
      petPolicy: { accepted: null, conditions: '' },
    });

    const payload = rpc.mock.calls[0][1].p_payload as Record<string, unknown>;
    expect(payload.pet_policy).toBeNull();
  });

  it('saver sends an explicit refusal as accepted=false (a stated « non »)', async () => {
    const rpc = apiClientCapturingRpc();

    await saveObjectWorkspaceCapacityPolicies('o1', {
      ...baseModule(),
      petPolicy: { accepted: false, conditions: 'Chiens guides uniquement' },
    });

    const payload = rpc.mock.calls[0][1].p_payload as Record<string, unknown>;
    expect(payload.pet_policy).toEqual({ accepted: false, conditions: 'Chiens guides uniquement' });
  });
});

/**
 * §07 review — degraded-load no-clobber guards (§28/§40/§05 precedent): a module
 * whose enrichment failed must never be saved (the §07 delete-reinsert would wipe
 * effective dates; a degraded characteristics save would wipe language levels).
 */
describe('degraded-load save guards', () => {
  it('saveObjectWorkspaceCapacityPolicies throws the unavailableReason before any RPC call', async () => {
    const rpc = apiClientCapturingRpc();

    await expect(
      saveObjectWorkspaceCapacityPolicies('o1', {
        ...baseModule(),
        unavailableReason: 'Le live actuel ne fournit pas encore un module C4 complet pour ce profil.',
      }),
    ).rejects.toThrow(/module C4/);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('saveObjectWorkspaceCharacteristics throws the unavailableReason before any RPC call', async () => {
    const rpc = apiClientCapturingRpc();

    await expect(
      saveObjectWorkspaceCharacteristics('o1', characteristicsModule({
        unavailableReason: 'Connexion backend indisponible pour charger les caracteristiques.',
      })),
    ).rejects.toThrow(/caracteristiques/);

    expect(rpc).not.toHaveBeenCalled();
  });
});

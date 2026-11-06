jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }), subscribe: jest.fn(() => () => {}) } }));

import { getSupabaseClient } from '../lib/supabase';
import { getObjectWorkspaceTaxonomyModule, saveObjectWorkspaceTaxonomy } from './object-workspace';
import type { ObjectWorkspaceTaxonomyModule } from './object-workspace-parser';
import type { ReferenceCatalogs } from './reference-catalogs';

const nature = { id: 'old-nature', domain: 'taxonomy_hot', code: 'old_hotel', name: 'Ancien hôtel', parent_id: null, position: 1, is_active: false, is_assignable: false, metadata: { axis: 'nature' } };
const positioning = { ...nature, id: 'old-positioning', code: 'old_family', name: 'Ancien positionnement', metadata: { axis: 'positionnement' } };
const unit = { ...nature, id: 'old-unit', domain: 'accommodation_unit_type', code: 'old_unit', name: 'Ancienne unité', metadata: {} };
const catalogs: ReferenceCatalogs = {
  vocabularyRelease: 4,
  refCodeByDomain: { taxonomy_hot: [nature, positioning], accommodation_unit_type: [unit] },
  tables: { ref_code_domain_registry: [{ domain: 'taxonomy_hot', name: 'Hôtellerie', object_type: 'HOT', is_taxonomy: true, is_active: true }] },
};
const empty = (): ObjectWorkspaceTaxonomyModule => ({ domains: [], unitTypes: { options: [], selectedCodes: [], unavailableReason: null }, unavailableReason: null });

function mockDatabase(hasAssignments = true) {
  const mutations: { table: string; action: string; payload?: unknown }[] = [];
  const from = jest.fn((table: string) => {
    let action = 'select';
    let domain: string | undefined;
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'upsert', 'insert', 'delete']) {
      chain[method] = jest.fn((...args: unknown[]) => {
        if (method === 'eq' && args[0] === 'domain') domain = String(args[1]);
        if (['upsert', 'insert', 'delete'].includes(method)) {
          action = method;
          mutations.push({ table, action, payload: args[0] });
        }
        return chain;
      });
    }
    chain.then = (resolve: (value: unknown) => unknown, reject: (value: unknown) => unknown) => {
      const rows = table === 'ref_code' ? [nature, positioning, unit].filter((row) => !domain || row.domain === domain)
        : !hasAssignments ? []
          : table === 'object_taxonomy' ? [{ id: 'join-nature', domain: 'taxonomy_hot', ref_code_id: nature.id, note: 'Conserver la preuve' }]
            : table === 'object_accommodation_unit_type' ? [{ unit_type_id: unit.id }]
              : table === 'object_hotel_positioning' ? [{ positioning_id: positioning.id }] : [];
      return Promise.resolve({ data: action === 'select' ? rows : null, error: null }).then(resolve, reject);
    };
    return chain;
  });
  jest.mocked(getSupabaseClient).mockReturnValue({ from } as never);
  return { from, mutations };
}

beforeEach(() => jest.clearAllMocks());

it('loads inactive selected taxonomy, units and positionings from the same release snapshot', async () => {
  const { from } = mockDatabase();
  const loaded = await getObjectWorkspaceTaxonomyModule('o1', empty(), catalogs, 'HOT');
  expect(loaded.domains[0].assignment).toMatchObject({ nodeId: nature.id, label: nature.name });
  expect(loaded.domains[0].nodes[0]).toMatchObject({ isAssignable: false, isActive: false });
  expect(loaded.unitTypes.selectedCodes).toEqual([unit.code]);
  expect(loaded.unitTypes.options[0]).toMatchObject({ code: unit.code, isAssignable: false });
  expect(loaded.positionings?.selectedCodes).toEqual([positioning.code]);
  expect(from.mock.calls.map(([table]) => table)).not.toContain('ref_code');
});

it('preserves every unchanged inactive join without rewriting or deleting it', async () => {
  const { mutations } = mockDatabase();
  const loaded = await getObjectWorkspaceTaxonomyModule('o1', empty(), catalogs, 'HOT');
  await saveObjectWorkspaceTaxonomy('o1', loaded);
  expect(mutations).toEqual([]);
});

it('rejects a new inactive nature even if a forged UI payload contains it', async () => {
  mockDatabase();
  const loaded = await getObjectWorkspaceTaxonomyModule('o1', empty(), catalogs, 'HOT');
  const { mutations } = mockDatabase(false);
  await expect(saveObjectWorkspaceTaxonomy('o1', loaded)).rejects.toThrow(/ne peut pas etre assigne/);
  expect(mutations).toEqual([]);
});

it.each(['unitTypes', 'positionings'] as const)('rejects a new inactive %s before reconciling its joins', async (key) => {
  mockDatabase();
  const loaded = await getObjectWorkspaceTaxonomyModule('o1', empty(), catalogs, 'HOT');
  loaded.domains = [];
  if (key === 'unitTypes') loaded.positionings = undefined;
  else loaded.unitTypes = { options: [], selectedCodes: [], unavailableReason: null };
  const { mutations } = mockDatabase(false);
  await expect(saveObjectWorkspaceTaxonomy('o1', loaded)).rejects.toThrow(/ne peut plus être attribué/);
  expect(mutations).toEqual([]);
});

it('blocks missing selected catalog identities instead of interpreting them as deselection', async () => {
  const { mutations } = mockDatabase();
  const loaded = await getObjectWorkspaceTaxonomyModule('o1', empty(), { ...catalogs, refCodeByDomain: {} }, 'HOT');
  expect(loaded.unavailableReason).toMatch(/absente du catalogue/);
  await expect(saveObjectWorkspaceTaxonomy('o1', loaded)).rejects.toThrow(/absente du catalogue/);
  expect(mutations).toEqual([]);
});

it('removes only an explicitly deselected retired unit', async () => {
  const { mutations } = mockDatabase();
  const loaded = await getObjectWorkspaceTaxonomyModule('o1', empty(), catalogs, 'HOT');
  loaded.unitTypes.selectedCodes = [];
  await saveObjectWorkspaceTaxonomy('o1', loaded);
  expect(mutations).toEqual([{ table: 'object_accommodation_unit_type', action: 'delete', payload: undefined }]);
});

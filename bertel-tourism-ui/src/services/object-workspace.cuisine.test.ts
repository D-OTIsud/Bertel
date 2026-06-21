import type { ObjectWorkspaceCuisineModule } from './object-workspace-parser';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: () => ({ demoMode: false }) },
}));

import { getSupabaseClient } from '../lib/supabase';
import { saveObjectWorkspaceCuisine } from './object-workspace';

const mockGetClient = getSupabaseClient as jest.Mock;

const CATALOG = [
  { id: 'id-creole', code: 'creole' },
  { id: 'id-fr', code: 'metropolitan' },
  { id: 'id-ita', code: 'italienne' },
];

type Capture = { deletedFor?: string; inserted?: Record<string, unknown>[] };

function makeClient(capture: Capture, opts: { catalogError?: boolean; insertError?: boolean } = {}) {
  return {
    from(table: string) {
      if (table === 'ref_code') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve(
                opts.catalogError ? { data: null, error: { message: 'boom' } } : { data: CATALOG, error: null },
              ),
          }),
        };
      }
      // object_cuisine_type
      return {
        delete: () => ({
          eq: (_col: string, val: string) => {
            capture.deletedFor = val;
            return Promise.resolve({ error: null });
          },
        }),
        insert: (rows: Record<string, unknown>[]) => {
          capture.inserted = rows;
          return Promise.resolve(opts.insertError ? { error: { message: 'ins boom' } } : { error: null });
        },
      };
    },
  };
}

function baseModule(codes: string[]): ObjectWorkspaceCuisineModule {
  return { codes, options: [], unavailableReason: null };
}

describe('saveObjectWorkspaceCuisine (§06 P1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves codes→ids and inserts object_cuisine_type in selection order (1 = principale)', async () => {
    const capture: Capture = {};
    mockGetClient.mockReturnValue(makeClient(capture));

    await saveObjectWorkspaceCuisine('o1', baseModule(['creole', 'metropolitan']));

    expect(capture.deletedFor).toBe('o1');
    expect(capture.inserted).toEqual([
      { object_id: 'o1', cuisine_type_id: 'id-creole', position: 1 },
      { object_id: 'o1', cuisine_type_id: 'id-fr', position: 2 },
    ]);
  });

  it('dedupes codes and still clears existing when the selection is empty (no insert call)', async () => {
    const capture: Capture = {};
    mockGetClient.mockReturnValue(makeClient(capture));

    await saveObjectWorkspaceCuisine('o2', baseModule([]));

    expect(capture.deletedFor).toBe('o2');
    expect(capture.inserted).toBeUndefined();
  });

  it('throws the unavailableReason BEFORE touching the client (degraded-load guard)', async () => {
    await expect(
      saveObjectWorkspaceCuisine('o3', { codes: ['creole'], options: [], unavailableReason: 'catalogue indispo' }),
    ).rejects.toThrow('catalogue indispo');
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('throws on an unknown cuisine code', async () => {
    const capture: Capture = {};
    mockGetClient.mockReturnValue(makeClient(capture));

    await expect(saveObjectWorkspaceCuisine('o4', baseModule(['nope']))).rejects.toThrow(/inconnu/);
  });
});

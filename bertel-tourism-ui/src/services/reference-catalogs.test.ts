import { fetchReferenceCatalogs, REF_CODE_DOMAINS, REFERENCE_TABLES } from './reference-catalogs';

const inSpy = jest.fn();
const selectSpy = jest.fn();
const rows = [
  { id: '1', code: 'phone', name: 'Téléphone', domain: 'contact_kind', position: 1 },
  { id: '2', code: 'email', name: 'Courriel', domain: 'contact_kind', position: 2 },
  { id: '3', code: 'double', name: 'Lit double', domain: 'bed_type', position: 1 },
];

// Le mock imite la partie de l'API PostgREST reellement utilisee : `select()`
// est « thenable » (les tables de reference sont awaitees directement) ET porte
// `in()` / `order()` chainables (le bras ref_code).
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selectSpy(table, columns);
        const terminal = Promise.resolve({ data: table === 'ref_code' ? rows : [], error: null });
        return Object.assign(terminal, {
          in: (column: string, values: string[]) => {
            inSpy(table, column, values);
            return Object.assign(Promise.resolve({ data: rows, error: null }), {
              order: () =>
                Object.assign(Promise.resolve({ data: rows, error: null }), {
                  order: () => Promise.resolve({ data: rows, error: null }),
                }),
            });
          },
          order: () => terminal,
        });
      },
    }),
  }),
}));

describe('fetchReferenceCatalogs', () => {
  beforeEach(() => {
    inSpy.mockClear();
    selectSpy.mockClear();
  });

  test('couvre les 27 domaines ref_code en UN seul appel', async () => {
    await fetchReferenceCatalogs();

    const refCodeCalls = inSpy.mock.calls.filter(([table]) => table === 'ref_code');
    expect(refCodeCalls).toHaveLength(1);
    expect(refCodeCalls[0][1]).toBe('domain');
    expect(refCodeCalls[0][2]).toEqual([...REF_CODE_DOMAINS]);
  });

  test('regroupe les lignes par domaine', async () => {
    const catalogs = await fetchReferenceCatalogs();

    expect(catalogs.refCodeByDomain.contact_kind).toHaveLength(2);
    expect(catalogs.refCodeByDomain.bed_type).toHaveLength(1);
  });

  test('rend un tableau vide pour un domaine sans ligne, jamais undefined', async () => {
    const catalogs = await fetchReferenceCatalogs();

    for (const domain of REF_CODE_DOMAINS) {
      expect(Array.isArray(catalogs.refCodeByDomain[domain])).toBe(true);
    }
  });

  test('charge chaque table de reference exactement une fois', async () => {
    await fetchReferenceCatalogs();

    for (const table of REFERENCE_TABLES) {
      const calls = selectSpy.mock.calls.filter(([t]) => t === table);
      expect(calls).toHaveLength(1);
    }
  });

  test('rend un tableau pour chaque table declaree, jamais undefined', async () => {
    const catalogs = await fetchReferenceCatalogs();

    for (const table of REFERENCE_TABLES) {
      expect(Array.isArray(catalogs.tables[table])).toBe(true);
    }
  });
});

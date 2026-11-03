jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

jest.mock('./restaurant-cartes', () => ({ mutateRestaurantCarte: jest.fn(), restaurantCarteOperation: jest.fn() }));
import { mutateRestaurantCarte } from './restaurant-cartes';
import { useSessionStore } from '../store/session-store';
import { getSupabaseClient } from '../lib/supabase';
import { linkObjectCarte, listObjectCartes, unlinkObjectCarte, updateObjectCarte } from './object-cartes';

const mockGet = getSupabaseClient as jest.Mock;

type Capture = { inserted?: unknown; updated?: unknown; eqs?: Record<string, unknown> };

function makeClient(opts: { roleId?: string | null; rows?: Record<string, unknown>[]; capture?: Capture } = {}) {
  const capture = opts.capture ?? {};
  function builder(table: string) {
    const ctx: { op: string; eqs: Record<string, unknown> } = { op: 'select', eqs: {} };
    const result = () => {
      if (table === 'ref_code') return { data: opts.roleId === null ? null : { id: opts.roleId ?? 'role-carte' }, error: null };
      if (table === 'object_document' && ctx.op === 'select') return { data: opts.rows ?? [], error: null };
      return { error: null };
    };
    const b: Record<string, unknown> = {
      select() { ctx.op = 'select'; return b; },
      insert(p: unknown) { ctx.op = 'insert'; capture.inserted = p; return b; },
      update(p: unknown) { ctx.op = 'update'; capture.updated = p; return b; },
      delete() { ctx.op = 'delete'; return b; },
      eq(c: string, v: unknown) { ctx.eqs[c] = v; capture.eqs = { ...ctx.eqs }; return b; },
      order() { return b; },
      maybeSingle() { return Promise.resolve(result()); },
      then(onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) { return Promise.resolve(result()).then(onF, onR); },
    };
    return b;
  }
  return { from: builder };
}

const row = { object_id: 'o1', document_id: 'doc9', role_id: 'role-carte', title: null,
  valid_from: null, valid_to: null, position: 1, ref_document: { url: 'https://x.test/c.pdf', title: 'Carte', access_scope: 'public', valid_from: null, valid_to: null, storage_bucket: 'documents', storage_path: 'o1/c.pdf' } };
const mockMutate = mutateRestaurantCarte as jest.Mock;

describe('object-cartes atomic office adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    useSessionStore.setState({ userId: 'office-1' });
    mockMutate.mockResolvedValue([]);
  });

  it('keeps the raw null baseline separate from the title fallback', async () => {
    mockGet.mockReturnValue(makeClient({ rows: [row] }));
    const [carte] = await listObjectCartes('o1');
    expect(carte).toMatchObject({ title: 'Carte', validFrom: '', expected: { title: null, valid_from: null, document: row.ref_document } });
    expect(carte.readId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fails closed when the role catalog is missing', async () => {
    mockGet.mockReturnValue(makeClient({ roleId: null }));
    await expect(listObjectCartes('o1')).rejects.toThrow(/indisponible/);
  });

  it('attaches through the office-only writer and lets SQL assign the next position', async () => {
    const capture: Capture = {};
    mockGet.mockReturnValue(makeClient({ rows: [row], capture }));
    await linkObjectCarte('o1', 'doc9');
    expect(mockMutate).toHaveBeenCalledWith('o1', expect.any(String), { write_contract: 'restaurant-carte-v1', action: 'link-existing', document_id: 'doc9' });
    expect(capture.inserted).toBeUndefined();
  });

  it('sends only changed metadata with the original expected row and no direct DML', async () => {
    const capture: Capture = {};
    mockGet.mockReturnValue(makeClient({ rows: [row], capture }));
    const [carte] = await listObjectCartes('o1');
    await updateObjectCarte('o1', 'doc9', { title: 'Carte été', validTo: '' }, carte);
    expect(mockMutate).toHaveBeenCalledWith('o1', expect.any(String), expect.objectContaining({ expected: carte.expected, patch: { title: 'Carte été', valid_to: null } }));
    expect(capture.updated).toBeUndefined();
  });

  it('refuses mutation without the previously loaded baseline', async () => {
    await expect(updateObjectCarte('o1', 'doc9', { title: 'Changed' })).rejects.toThrow(/Rechargez/);
    await expect(unlinkObjectCarte('o1', 'doc9')).rejects.toThrow(/Rechargez/);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('detaches only the observed card and reloads current rows after a receipt replay', async () => {
    mockGet.mockReturnValue(makeClient({ rows: [row] }));
    const [carte] = await listObjectCartes('o1');
    mockMutate.mockResolvedValue([{ documentId: 'stale-receipt' }]);
    mockGet.mockReturnValue(makeClient({ rows: [] }));
    expect(await unlinkObjectCarte('o1', 'doc9', carte)).toEqual([]);
    expect(mockMutate).toHaveBeenCalledWith('o1', expect.any(String), expect.objectContaining({ action: 'remove', document_id: 'doc9', expected: carte.expected }));
  });
});

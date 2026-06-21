jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

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

describe('object-cartes service (§06 P3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists cartes with ref_document url + link-title fallback + validity', async () => {
    mockGet.mockReturnValue(makeClient({
      rows: [
        { document_id: 'd1', title: 'Carte midi', valid_from: '2026-01-01', valid_to: '2026-12-31', position: 1, ref_document: { url: 'u1', title: 'fallback' } },
        { document_id: 'd2', title: '', valid_from: null, valid_to: null, position: 2, ref_document: { url: 'u2', title: 'Carte du soir' } },
      ],
    }));
    expect(await listObjectCartes('o1')).toEqual([
      { documentId: 'd1', url: 'u1', title: 'Carte midi', validFrom: '2026-01-01', validTo: '2026-12-31', position: 1 },
      { documentId: 'd2', url: 'u2', title: 'Carte du soir', validFrom: '', validTo: '', position: 2 },
    ]);
  });

  it('returns [] when the carte role is unseeded', async () => {
    mockGet.mockReturnValue(makeClient({ roleId: null }));
    expect(await listObjectCartes('o1')).toEqual([]);
  });

  it('links a carte with role_id + position', async () => {
    const capture: Capture = {};
    mockGet.mockReturnValue(makeClient({ capture }));
    await linkObjectCarte('o1', 'doc9', 3);
    expect(capture.inserted).toEqual({ object_id: 'o1', document_id: 'doc9', role_id: 'role-carte', position: 3 });
  });

  it('updates only provided fields, blanking empties to null', async () => {
    const capture: Capture = {};
    mockGet.mockReturnValue(makeClient({ capture }));
    await updateObjectCarte('o1', 'doc9', { title: 'Carte été', validTo: '' });
    expect(capture.updated).toEqual({ title: 'Carte été', valid_to: null });
  });

  it('unlinks by object + document', async () => {
    const capture: Capture = {};
    mockGet.mockReturnValue(makeClient({ capture }));
    await unlinkObjectCarte('o1', 'doc9');
    expect(capture.eqs).toMatchObject({ object_id: 'o1', document_id: 'doc9' });
  });
});

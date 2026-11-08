/** @jest-environment node */
import assert from 'node:assert/strict';
import { PATCH } from './route';
import { authenticated } from '../_document-auth';
import { authorizeActor, authorizeObject } from './authorize';

jest.mock('../_document-auth', () => ({
  ...jest.requireActual('../_document-auth'),
  authenticated: jest.fn(),
}));
jest.mock('./authorize', () => ({ authorizeActor: jest.fn(), authorizeObject: jest.fn() }));

const ACTOR_ID = '11111111-2222-3333-4444-555555555555';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const TARGET_DOC_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const OBJECT_ID = 'ACTABC0123456789';

function promotionServer(actorRealm: unknown, objectRealm: unknown, realmError = false) {
  function table(data: unknown) {
    const chain = {
      error: null,
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
      single: jest.fn().mockResolvedValue({ data: { id: TARGET_DOC_ID }, error: null }),
    };
    return chain;
  }
  const tables = {
    actor: table({ is_test: actorRealm }),
    object: table({ is_test: objectRealm }),
    actor_document: table({ status: 'draft', title: 'Document' }),
    ref_document: table({ storage_bucket: 'actor-documents', storage_path: `actors/${ACTOR_ID}/document.pdf` }),
    ref_code: table({ id: 'document-role' }),
    object_document: table(null),
  };
  tables.actor_document.single.mockResolvedValue({ data: { document_id: TARGET_DOC_ID }, error: null });
  if (realmError) {
    tables.object.maybeSingle.mockResolvedValue({ data: { is_test: objectRealm }, error: { message: 'lookup failed' } });
  }
  const storage = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
    download: jest.fn().mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null,
    }),
    getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/document.pdf' } }),
  };
  const from = jest.fn((name: string) => tables[name as keyof typeof tables]);
  return { server: { from, storage: { from: jest.fn(() => storage) } }, tables, storage };
}

function request() {
  return {
    json: async () => ({
      actorId: ACTOR_ID, documentId: DOC_ID, objectId: OBJECT_ID, roleCode: 'kbis',
      // Client-provided realm values must not influence the server's comparison.
      is_test: false,
    }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(authorizeActor).mockResolvedValue(true);
  jest.mocked(authorizeObject).mockResolvedValue(true);
});

it.each([
  [true, false, false],
  [false, true, false],
  [null, false, false],
  [false, undefined, false],
  [false, false, true],
])('rejects actor realm %s and object realm %s (lookup error %s) before any copy or mutation', async (actorRealm, objectRealm, realmError) => {
  const { server, tables, storage } = promotionServer(actorRealm, objectRealm, realmError as boolean);
  jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'jwt', server } as never);

  const response = await PATCH(request());

  expect(response.status).toBe(403);
  expect(tables.actor.eq).toHaveBeenCalledWith('id', ACTOR_ID);
  expect(tables.object.eq).toHaveBeenCalledWith('id', OBJECT_ID);
  expect(storage.download).not.toHaveBeenCalled();
  expect(storage.upload).not.toHaveBeenCalled();
  expect(storage.remove).not.toHaveBeenCalled();
  expect(tables.ref_document.insert).not.toHaveBeenCalled();
  expect(tables.object_document.insert).not.toHaveBeenCalled();
  expect(tables.actor_document.update).not.toHaveBeenCalled();
});

it.each([false, true])('preserves canonical writers promoting within realm %s', async (realm) => {
  const { server, tables, storage } = promotionServer(realm, realm);
  jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'jwt', server } as never);

  const response = await PATCH(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ documentId: TARGET_DOC_ID });
  expect(authorizeObject).toHaveBeenCalledWith('jwt', OBJECT_ID);
  expect(storage.upload).toHaveBeenCalledTimes(1);
  expect(tables.object_document.insert).toHaveBeenCalledWith(expect.objectContaining({
    object_id: OBJECT_ID, document_id: TARGET_DOC_ID,
  }));
});


type PromotionFault = 'target_ack_lost' | 'object_ack_lost' | 'history_ack_lost' | 'history_zero' | 'success' | 'role_missing' | 'role_error_with_data';

/** The fake performs the write before returning a synthetic lost ACK. It exposes
 *  every old cleanup method, so a refusal cannot pass because a method is absent. */
function causalPromotion(fault: PromotionFault) {
  const sourcePath = `actors/${ACTOR_ID}/shared.pdf`;
  const aliasId = 'cccccccc-1111-4222-a333-dddddddddddd';
  const state = {
    references: new Map<string, string>([[DOC_ID, sourcePath], [aliasId, sourcePath]]),
    bytes: new Set<string>([sourcePath]),
    taskDocuments: new Set<string>([DOC_ID]),
    portalDocuments: new Set<string>([DOC_ID]),
    objectDocuments: new Set<string>(),
    actorDocument: DOC_ID as string | null,
    historyRows: 0,
    targetPath: '',
  };
  const lost = { code: '08006', message: 'synthetic acknowledgement lost after commit' };
  const remove = jest.fn(async (paths: string[]) => {
    paths.forEach((path) => state.bytes.delete(path));
    return { error: null };
  });
  const deleteMetadata = jest.fn((id: string) => {
    state.references.delete(id);
    state.objectDocuments.delete(id);
    state.taskDocuments.delete(id);
    state.portalDocuments.delete(id);
    if (state.actorDocument === id) state.actorDocument = null;
    return Promise.resolve({ error: null });
  });
  const query = (data: unknown, error: { message: string } | null = null) => {
    const q: { eq: jest.Mock; maybeSingle: jest.Mock } = { eq: jest.fn(() => q), maybeSingle: jest.fn(async () => ({ data, error })) };
    return q;
  };
  const historySingle = jest.fn();
  const historySelect = jest.fn();
  const from = jest.fn((table: string) => {
    if (table === 'actor' || table === 'object') return { select: () => query({ is_test: false }) };
    if (table === 'ref_code') return { select: () => query(
      fault === 'role_missing' ? null : { id: 'dddddddd-1111-4222-a333-eeeeeeeeeeee' },
      fault === 'role_error_with_data' ? { message: 'synthetic role lookup failed' } : null,
    ) };
    if (table === 'ref_document') return {
      select: () => query({ title: 'Shared source', storage_bucket: 'actor-documents', storage_path: sourcePath, extra: {} }),
      insert: () => ({ select: () => ({ single: async () => {
        state.references.set(TARGET_DOC_ID, state.targetPath);
        return { data: fault === 'target_ack_lost' ? null : { id: TARGET_DOC_ID }, error: fault === 'target_ack_lost' ? lost : null };
      } }) }),
      delete: () => ({ eq: (_key: string, id: string) => deleteMetadata(id) }),
    };
    if (table === 'object_document') return { insert: async () => {
      state.objectDocuments.add(TARGET_DOC_ID);
      return { error: fault === 'object_ack_lost' ? lost : null };
    } };
    if (table === 'actor_document') return {
      select: () => query({ status: 'active', title: 'Shared source', valid_from: null, valid_to: null }),
      update: (value: { document_id: string }) => {
        // A real concurrent unlink can commit after the pre-read and before this UPDATE.
        if (fault === 'history_zero') state.actorDocument = null;
        if (state.actorDocument === DOC_ID) {
          state.actorDocument = value.document_id;
          state.historyRows = 1;
        }
        const error = fault === 'history_ack_lost' ? lost : null;
        historySingle.mockImplementation(async () => state.historyRows === 1
          ? { data: { document_id: TARGET_DOC_ID }, error }
          : { data: null, error: { code: 'PGRST116', message: 'synthetic zero rows' } });
        const q: Promise<{ data: null; error: typeof error }> & { eq: jest.Mock; select: jest.Mock; single: jest.Mock } = Object.assign(Promise.resolve({ data: null, error }), {
          eq: jest.fn(() => q), select: historySelect, single: historySingle,
        });
        historySelect.mockReturnValue(q);
        return q;
      },
    };
    throw new Error(`unexpected synthetic table: ${table}`);
  });
  const storage = {
    remove,
    download: jest.fn(async () => ({ data: new Blob(['synthetic PDF bytes']), error: null })),
    upload: jest.fn(async (path: string) => {
      state.targetPath = path;
      state.bytes.add(path);
      return { data: { path }, error: null };
    }),
    getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://synthetic.example.invalid/storage/v1/object/public/documents/${path}` } })),
  };
  const server = { from, storage: { from: jest.fn(() => storage) } };
  return { server, state, storage, remove, deleteMetadata, historySelect, historySingle, sourcePath, aliasId };
}

function expectPreservedCopies(h: ReturnType<typeof causalPromotion>) {
  expect(h.state.targetPath.startsWith(`${OBJECT_ID}/`)).toBe(true);
  expect(h.state.targetPath.slice(OBJECT_ID.length + 1)).toMatch(/^[0-9a-f-]+[.]pdf$/);
  expect(h.state.bytes.has(h.state.targetPath)).toBe(true);
  assert.equal(h.state.bytes.has(h.sourcePath), true, 'shared source bytes must survive promotion');
  expect(h.state.references.get(DOC_ID)).toBe(h.sourcePath);
  expect(h.state.references.get(h.aliasId)).toBe(h.sourcePath);
  expect(h.state.taskDocuments.has(DOC_ID)).toBe(true);
  expect(h.state.portalDocuments.has(DOC_ID)).toBe(true);
  expect(h.remove).not.toHaveBeenCalled();
  expect(h.deleteMetadata).not.toHaveBeenCalled();
}

describe('PATCH promotion retains committed state and never infers a physical cleanup right', () => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); });

  it.each([
    ['target_ack_lost', 'promotion_document_failed'],
    ['object_ack_lost', 'object_link_failed'],
    ['history_ack_lost', 'history_update_failed'],
  ] as const)('preserves the committed write and both byte copies when %s', async (fault, stage) => {
    const h = causalPromotion(fault);
    jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'jwt', server: h.server } as never);
    const response = await PATCH(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: stage });
    assert.equal(h.state.references.has(TARGET_DOC_ID), true, 'committed target metadata must be retained');
    if (fault !== 'target_ack_lost') expect(h.state.objectDocuments.has(TARGET_DOC_ID)).toBe(true);
    if (fault === 'history_ack_lost') expect(h.state.actorDocument).toBe(TARGET_DOC_ID);
    expectPreservedCopies(h);
  });

  it('refuses success when a concurrent unlink makes the final UPDATE affect zero rows', async () => {
    const h = causalPromotion('history_zero');
    jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'jwt', server: h.server } as never);
    const response = await PATCH(request());
    assert.equal(response.status, 500, 'zero-row history UPDATE must not return success');
    await expect(response.json()).resolves.toEqual({ error: 'history_update_failed' });
    expect(h.state.historyRows).toBe(0);
    expect(h.state.actorDocument).toBeNull();
    expect(h.state.objectDocuments.has(TARGET_DOC_ID)).toBe(true);
    expectPreservedCopies(h);
  });

  it('returns the same 200 contract only with one acknowledged history row, retaining shared source aliases', async () => {
    const h = causalPromotion('success');
    jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'jwt', server: h.server } as never);
    const response = await PATCH(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ documentId: TARGET_DOC_ID });
    expect(h.state.historyRows).toBe(1);
    expect(h.state.actorDocument).toBe(TARGET_DOC_ID);
    expect(h.state.objectDocuments.has(TARGET_DOC_ID)).toBe(true);
    expectPreservedCopies(h);
    expect(h.historySelect).toHaveBeenCalledWith('document_id');
    expect(h.historySingle).toHaveBeenCalledTimes(1);
  });

  it.each(['role_missing', 'role_error_with_data'] as const)('rejects %s before any download, copy or metadata creation', async (fault) => {
    const h = causalPromotion(fault);
    jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'jwt', server: h.server } as never);
    const response = await PATCH(request());
    assert.equal(response.status, 400, 'role failure must not acquire a public copy');
    await expect(response.json()).resolves.toEqual({ error: 'unknown_document_type' });
    expect(h.storage.download).not.toHaveBeenCalled();
    expect(h.storage.upload).not.toHaveBeenCalled();
    expect(h.state.targetPath).toBe('');
    expect(h.state.references.size).toBe(2);
    expect(h.state.references.has(TARGET_DOC_ID)).toBe(false);
    expect(h.state.references.get(DOC_ID)).toBe(h.sourcePath);
    expect(h.state.references.get(h.aliasId)).toBe(h.sourcePath);
    expect(h.state.bytes).toEqual(new Set([h.sourcePath]));
    expect(h.state.taskDocuments.has(DOC_ID)).toBe(true);
    expect(h.state.portalDocuments.has(DOC_ID)).toBe(true);
    expect(h.state.objectDocuments.size).toBe(0);
    expect(h.state.actorDocument).toBe(DOC_ID);
    expect(h.state.historyRows).toBe(0);
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.deleteMetadata).not.toHaveBeenCalled();
  });
});

/** @jest-environment node */
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

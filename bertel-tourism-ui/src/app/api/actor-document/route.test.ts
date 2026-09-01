/** @jest-environment node */
import { POST, DELETE, PATCH } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./process-actor-document', () => ({
  processActorDocumentBuffer: jest.fn().mockResolvedValue({
    buffer: Buffer.from('pdf'), mimeType: 'application/pdf', extension: 'pdf',
  }),
}));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

// Les trois verbes d'/api/actor-document partagent le socle d'authentification extrait dans
// ../_document-auth (Bearer → getUser → client « en tant qu'appelant ») et les deux gates
// d'./authorize. Ces tests asservissent CE socle depuis la route : jusqu'ici il était recopié
// dans chaque fichier et aucun test ne le touchait — une extraction sans filet aurait pu
// déplacer le gate APRÈS l'écriture sans qu'une seule suite ne rougisse.
//
// Chaque test à 401/403 assert en plus qu'AUCUNE écriture n'est tentée, et les faux
// FOURNISSENT storage/from : la preuve ne doit pas tenir à la famine du mock.

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const ACTOR_ID = '11111111-2222-3333-4444-555555555555';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const OBJECT_ID = 'ACTABC0123456789';

/** Le client appelant doit porter la clé ANON et le JWT de session, jamais la service key. */
const SUPABASE_URL = 'https://project.supabase.co';
const ANON_KEY = 'anon-key';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
});

/** Faux client appelant : enregistre le nom du RPC de gate et sa réponse. */
function callerCan(can: boolean | Record<string, boolean>) {
  const rpc = jest.fn(async (name: string) => ({
    data: typeof can === 'boolean' ? can : can[name] === true,
    error: null,
  }));
  mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
  return rpc;
}

function baseServer(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    ...overrides,
  } as never;
}

function multipartReq(actorId: string, withBearer = true) {
  const form = new FormData();
  form.append('actor_id', actorId);
  form.append('file', new File([Buffer.from('%PDF-x')], 'Kbis.pdf', { type: 'application/pdf' }));
  return {
    headers: new Headers(withBearer ? { authorization: 'Bearer jwt' } : {}),
    formData: async () => form,
  } as never;
}

function jsonReq(body: unknown, withBearer = true) {
  return {
    headers: new Headers(withBearer ? { authorization: 'Bearer jwt' } : {}),
    json: async () => body,
  } as never;
}

/** Serveur espionné : storage et tables fournis, pour prouver qu'ils restent INTOUCHÉS. */
function spiedServer() {
  const upload = jest.fn().mockResolvedValue({ error: null });
  const remove = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn();
  const storageFrom = jest.fn().mockReturnValue({ upload, remove });
  return {
    server: baseServer({ storage: { from: storageFrom }, from }),
    upload, remove, from, storageFrom,
  };
}

describe('/api/actor-document — socle d’authentification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('500 server_misconfigured quand le client service_role est absent', async () => {
    mockedServer.mockReturnValue(null as never);
    const res = await POST(multipartReq(ACTOR_ID));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'server_misconfigured' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('401 sans en-tête Bearer, et AUCUNE écriture tentée', async () => {
    const { server, upload, from } = spiedServer();
    mockedServer.mockReturnValue(server);
    const res = await POST(multipartReq(ACTOR_ID, false));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthenticated' });
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('401 quand getUser rejette le JWT, et AUCUNE écriture tentée', async () => {
    const { upload, from, storageFrom } = spiedServer();
    mockedServer.mockReturnValue(baseServer({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } }) },
      storage: { from: storageFrom },
      from,
    }));
    const res = await POST(multipartReq(ACTOR_ID));
    expect(res.status).toBe(401);
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('le client de gate porte la clé ANON et le JWT de l’appelant, jamais la service key', async () => {
    const { server } = spiedServer();
    mockedServer.mockReturnValue(server);
    callerCan(false);
    await POST(multipartReq(ACTOR_ID));
    expect(mockedCreate).toHaveBeenCalledWith(
      SUPABASE_URL,
      ANON_KEY,
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer jwt' } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  });
});

describe('/api/actor-document POST', () => {
  beforeEach(() => jest.clearAllMocks());

  it('400 invalid_fields sur une forme UUID invalide, AVANT tout gate', async () => {
    const { server } = spiedServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(true);
    const res = await POST(multipartReq('pas-un-uuid'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_fields' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('400 bad_multipart quand le corps n’est pas un multipart lisible', async () => {
    const { server } = spiedServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(true);
    const res = await POST({
      headers: new Headers({ authorization: 'Bearer jwt' }),
      formData: async () => { throw new Error('boundary'); },
    } as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_multipart' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('403 quand user_can_write_crm_actor est faux, et AUCUNE écriture tentée', async () => {
    const { server, upload, from } = spiedServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(false);
    const res = await POST(multipartReq(ACTOR_ID));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'forbidden', detail: 'caller cannot edit this actor',
    });
    // Le gate est bien le prédicat d'ÉCRITURE, évalué sur l'acteur demandé.
    expect(rpc).toHaveBeenCalledWith('user_can_write_crm_actor', { p_actor_id: ACTOR_ID });
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('403 quand le RPC de gate ERREUR (fail-closed), et AUCUNE écriture tentée', async () => {
    const { server, upload, from } = spiedServer();
    mockedServer.mockReturnValue(server);
    mockedCreate.mockReturnValue({
      schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }) }),
    } as never);
    const res = await POST(multipartReq(ACTOR_ID));
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('201 : bucket privé, chemin actors/{actorId}/…, ref_document puis actor_document', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const storageFrom = jest.fn().mockReturnValue({ upload, remove: jest.fn() });
    const insertDoc = jest.fn().mockReturnValue({
      select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: DOC_ID }, error: null }) }),
    });
    const insertLink = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: storageFrom },
      from: (table: string) => (table === 'ref_document' ? { insert: insertDoc } : { insert: insertLink }),
    }));
    callerCan(true);
    const res = await POST(multipartReq(ACTOR_ID));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ documentId: DOC_ID, title: 'Kbis.pdf' });
    expect(storageFrom).toHaveBeenCalledWith('actor-documents');
    expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^actors/${ACTOR_ID}/`));
    expect(insertDoc.mock.calls[0][0]).toMatchObject({
      storage_bucket: 'actor-documents', access_scope: 'crm_private',
    });
    expect(insertLink.mock.calls[0][0]).toMatchObject({
      actor_id: ACTOR_ID, document_id: DOC_ID, created_by: 'u-1',
    });
  });
});

describe('/api/actor-document DELETE', () => {
  beforeEach(() => jest.clearAllMocks());

  it('400 invalid_fields sur une forme UUID invalide, AVANT tout gate', async () => {
    const { server } = spiedServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(true);
    const res = await DELETE(jsonReq({ actorId: ACTOR_ID, documentId: 'nope' }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('403 quand user_can_write_crm_actor est faux, et AUCUNE lecture ni suppression', async () => {
    const { server, remove, from } = spiedServer();
    mockedServer.mockReturnValue(server);
    callerCan(false);
    const res = await DELETE(jsonReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('supprime le fichier puis la métadonnée quand le lien existe', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const deleteEq = jest.fn().mockResolvedValue({ error: null });
    const linkSelect = () => ({
      eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'draft' }, error: null }) }) }),
    });
    const docSelect = () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { storage_bucket: 'actor-documents', storage_path: `actors/${ACTOR_ID}/x.pdf` },
          error: null,
        }),
      }),
    });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: jest.fn().mockReturnValue({ remove }) },
      from: (table: string) => (table === 'actor_document'
        ? { select: linkSelect }
        : { select: docSelect, delete: () => ({ eq: deleteEq }) }),
    }));
    callerCan(true);
    const res = await DELETE(jsonReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true });
    expect(remove).toHaveBeenCalledWith([`actors/${ACTOR_ID}/x.pdf`]);
    expect(deleteEq).toHaveBeenCalledWith('id', DOC_ID);
  });
});

describe('/api/actor-document PATCH', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 quand le gate ACTEUR passe mais pas le gate OBJET, sans aucune écriture', async () => {
    // La promotion écrit dans l'espace public d'un objet : les DEUX prédicats doivent tenir.
    const { server, upload, from } = spiedServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan({ user_can_write_crm_actor: true, user_can_write_object_canonical: false });
    const res = await PATCH(jsonReq({
      actorId: ACTOR_ID, documentId: DOC_ID, objectId: OBJECT_ID, roleCode: 'kbis',
    }));
    expect(res.status).toBe(403);
    expect(rpc.mock.calls.map((call) => call[0]).sort()).toEqual([
      'user_can_write_crm_actor', 'user_can_write_object_canonical',
    ]);
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('403 quand le gate OBJET passe mais pas le gate ACTEUR, sans aucune écriture', async () => {
    const { server, upload, from } = spiedServer();
    mockedServer.mockReturnValue(server);
    callerCan({ user_can_write_crm_actor: false, user_can_write_object_canonical: true });
    const res = await PATCH(jsonReq({
      actorId: ACTOR_ID, documentId: DOC_ID, objectId: OBJECT_ID, roleCode: 'kbis',
    }));
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('400 invalid_fields sur une forme d’identifiant objet invalide, AVANT tout gate', async () => {
    const { server } = spiedServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(true);
    const res = await PATCH(jsonReq({
      actorId: ACTOR_ID, documentId: DOC_ID, objectId: 'pas-un-objet', roleCode: 'kbis',
    }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

// C'est LA route qui délivre l'accès à un fichier privé d'acteur. Elle partage le socle
// d'authentification d'../../_document-auth avec les trois verbes d'/api/actor-document, mais
// son gate lui est propre : `user_can_read_crm_actor` (LECTURE), pas le prédicat d'écriture.
//
// Les tests ci-dessous asservissent cette asymétrie, ainsi que le filtre sur LA PAIRE
// (actor_id, document_id) et la durée de vie bornée du lien signé.

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const ACTOR_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ACTOR_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const DOC_PATH = `actors/${ACTOR_ID}/x.pdf`;
const SIGNED = 'https://storage.example/signed?token=abc';

function callerCan(can: boolean) {
  const rpc = jest.fn().mockResolvedValue({ data: can, error: null });
  mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
  return rpc;
}

function urlReq(body: unknown, withBearer = true) {
  return {
    headers: new Headers(withBearer ? { authorization: 'Bearer jwt' } : {}),
    json: async () => body,
  } as never;
}

/** Faux `actor_document` qui filtre RÉELLEMENT sur les colonnes passées aux `.eq()` : un
 *  faux qui les ignorerait ne prouverait rien sur la règle de la paire. */
function linkTable(rows: Array<{ actor_id: string; document_id: string }>) {
  const eqCalls: Array<[string, unknown]> = [];
  const withFilters = (filters: Array<[string, unknown]>) => ({
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return withFilters([...filters, [column, value]]);
    },
    maybeSingle: async () => ({
      data: rows.find((row) => filters.every(
        ([column, value]) => (row as unknown as Record<string, unknown>)[column] === value)) ?? null,
      error: null,
    }),
  });
  return { eqCalls, select: () => withFilters([]) };
}

function urlServer(options: {
  links?: Array<{ actor_id: string; document_id: string }>;
  document?: { storage_bucket?: string; storage_path?: string } | null;
} = {}) {
  const link = linkTable(options.links ?? [{ actor_id: ACTOR_ID, document_id: DOC_ID }]);
  const documentRow = options.document === undefined
    ? { storage_bucket: 'actor-documents', storage_path: DOC_PATH }
    : options.document;
  const documentEq = jest.fn().mockReturnValue({
    maybeSingle: async () => ({ data: documentRow, error: null }),
  });
  const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  const storageFrom = jest.fn().mockReturnValue({ createSignedUrl });
  const from = jest.fn((table: string) => (table === 'actor_document'
    ? { select: link.select }
    : { select: () => ({ eq: documentEq }) }));
  const server = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    storage: { from: storageFrom },
    from,
  } as never;
  return { server, link, documentEq, createSignedUrl, storageFrom, from };
}

describe('/api/actor-document/url', () => {
  beforeEach(() => jest.clearAllMocks());

  it('500 server_misconfigured quand le client service_role est absent', async () => {
    mockedServer.mockReturnValue(null as never);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'server_misconfigured' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('401 sans Bearer, et AUCUNE signature émise', async () => {
    const { server, createSignedUrl, from } = urlServer();
    mockedServer.mockReturnValue(server);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }, false));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthenticated' });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('401 quand getUser rejette le JWT, et AUCUNE signature émise', async () => {
    const { createSignedUrl, from, storageFrom } = urlServer();
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } }) },
      storage: { from: storageFrom },
      from,
    } as never);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(401);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('400 bad_json quand le corps n’est pas du JSON', async () => {
    const { server, createSignedUrl } = urlServer();
    mockedServer.mockReturnValue(server);
    const res = await POST({
      headers: new Headers({ authorization: 'Bearer jwt' }),
      json: async () => { throw new Error('nope'); },
    } as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_json' });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('400 sur une forme UUID invalide, AVANT tout gate', async () => {
    const { server, createSignedUrl } = urlServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(true);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: 'pas-un-uuid' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_fields' });
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('403 quand user_can_read_crm_actor est faux, et AUCUNE signature émise', async () => {
    // Gate de LECTURE ici, à la différence des trois verbes d'/api/actor-document qui
    // exigent l'écriture : consulter une pièce jointe n'exige pas de pouvoir la modifier.
    const { server, createSignedUrl, from } = urlServer();
    mockedServer.mockReturnValue(server);
    const rpc = callerCan(false);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(rpc).toHaveBeenCalledWith('user_can_read_crm_actor', { p_actor_id: ACTOR_ID });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('403 quand le RPC de gate ERREUR (fail-closed), et AUCUNE signature émise', async () => {
    const { server, createSignedUrl, from } = urlServer();
    mockedServer.mockReturnValue(server);
    mockedCreate.mockReturnValue({
      schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }) }),
    } as never);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(403);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('404 pour un document valide rattaché à un AUTRE acteur, sans signature', async () => {
    const { server, createSignedUrl } = urlServer({
      links: [{ actor_id: OTHER_ACTOR_ID, document_id: DOC_ID }],
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('404 file_missing quand la ligne ne désigne aucun fichier', async () => {
    const { server, createSignedUrl } = urlServer({ document: {} });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'file_missing' });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('happy path : {url} signée sur le chemin lié, TTL borné à 60 s', async () => {
    const { server, link, documentEq, createSignedUrl, storageFrom } = urlServer();
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: SIGNED });
    expect(createSignedUrl).toHaveBeenCalledWith(DOC_PATH, 60);
    expect(storageFrom).toHaveBeenCalledWith('actor-documents');
    // Filtre sur LA PAIRE (actor_id, document_id), asserté sur les colonnes réellement vues.
    expect(link.eqCalls).toEqual([['actor_id', ACTOR_ID], ['document_id', DOC_ID]]);
    expect(documentEq).toHaveBeenCalledWith('id', DOC_ID);
  });

  it('signe dans le bucket PORTÉ PAR LA LIGNE, pas dans une constante épinglée', async () => {
    // Comportement ACTUEL, verrouillé ici pour qu'une refonte ne le change pas par
    // accident. Il diffère de /api/task-document/url, qui épingle le bucket à une
    // constante — l'écart est documenté dans le rapport de cette passe, il n'est PAS
    // corrigé ici (ce serait un changement de comportement, hors périmètre).
    const { server, createSignedUrl, storageFrom } = urlServer({
      document: { storage_bucket: 'documents', storage_path: DOC_PATH },
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ actorId: ACTOR_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    expect(storageFrom).toHaveBeenCalledWith('documents');
    expect(createSignedUrl).toHaveBeenCalledWith(DOC_PATH, 60);
  });
});

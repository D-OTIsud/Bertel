/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { documentTable, linkTable } from '../task-document.test-utils';

// C'est LA route qui délivre l'accès à un fichier privé : la surface où une erreur
// d'autorisation se paie le plus cher. Chaque test ci-dessous asservit une garde précise —
// gate avant signature, filtre sur la paire (task_id, document_id), erreur de lecture ≠
// absence, bucket épinglé, durée de vie bornée.

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const TASK_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_TASK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const DOC_PATH = `tasks/${TASK_ID}/x.pdf`;
const SIGNED = 'https://storage.example/signed?token=abc';

function callerCan(can: boolean) {
  mockedCreate.mockReturnValue({
    schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: can, error: null }) }),
  } as never);
}

function urlReq(body: unknown, withBearer = true) {
  return {
    headers: new Headers(withBearer ? { authorization: 'Bearer jwt' } : {}),
    json: async () => body,
  } as never;
}

/** Serveur d'URL signée : lien + document paramétrables, createSignedUrl espionné. */
function urlServer(options: {
  links?: Parameters<typeof linkTable>[0];
  linkError?: { message: string } | null;
  document?: Parameters<typeof documentTable>[0];
} = {}) {
  const link = linkTable(options.links ?? [{ task_id: TASK_ID, document_id: DOC_ID }], options.linkError ?? null);
  const document = documentTable(options.document
    ?? { data: { storage_bucket: 'actor-documents', storage_path: DOC_PATH }, error: null });
  const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  const storageFrom = jest.fn().mockReturnValue({ createSignedUrl });
  const from = jest.fn((table: string) => (table === 'crm_task_document'
    ? { select: link.select }
    : { select: document.select }));
  const server = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    storage: { from: storageFrom },
    from,
  } as never;
  return { server, link, createSignedUrl, storageFrom, from };
}

describe('/api/task-document/url', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 sans Bearer, et AUCUNE signature émise', async () => {
    const { server, createSignedUrl, from } = urlServer();
    mockedServer.mockReturnValue(server);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }, false));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthenticated' });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('400 sur une forme UUID invalide, avant tout gate', async () => {
    const { server, createSignedUrl } = urlServer();
    mockedServer.mockReturnValue(server);
    const rpc = jest.fn();
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: 'pas-un-uuid' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_fields' });
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('403 quand user_can_write_crm_task est faux, et AUCUNE signature émise', async () => {
    // Le gate doit PRÉCÉDER la signature : sans lui, l'appelant obtiendrait une URL
    // ouvrant le fichier privé sans aucun droit sur la tâche.
    const { server, createSignedUrl, from } = urlServer();
    mockedServer.mockReturnValue(server);
    callerCan(false);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('404 pour un document valide rattaché à une AUTRE tâche, sans signature', async () => {
    const { server, createSignedUrl } = urlServer({
      links: [{ task_id: OTHER_TASK_ID, document_id: DOC_ID }],
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('happy path : {url} signée sur le chemin lié, TTL borné à 60 s', async () => {
    const { server, link, createSignedUrl, storageFrom } = urlServer();
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: SIGNED });
    // Durée de vie : l'URL sort du périmètre gaté dès son émission, une fenêtre large en
    // ferait un droit d'accès durable au fichier privé.
    expect(createSignedUrl).toHaveBeenCalledWith(DOC_PATH, 60);
    // Bucket épinglé, jamais celui porté par la ligne.
    expect(storageFrom).toHaveBeenCalledWith('actor-documents');
    // Filtre sur LA PAIRE, asserté sur les colonnes réellement vues.
    expect(link.eqCalls).toEqual([['task_id', TASK_ID], ['document_id', DOC_ID]]);
  });

  it('500 quand la lecture ref_document échoue, sans signature', async () => {
    // Une erreur de lecture n'est pas une absence : l'avaler ferait signer sur un chemin
    // vide ou répondre « fichier manquant » sur un incident transitoire.
    const { server, createSignedUrl } = urlServer({
      document: { data: null, error: { message: 'statement timeout' } },
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'document_lookup_failed' });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('404 file_missing quand la ligne ne désigne aucun fichier', async () => {
    const { server, createSignedUrl } = urlServer({ document: { data: {}, error: null } });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'file_missing' });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('409 quand la ligne pointe un autre bucket, sans signature', async () => {
    const { server, createSignedUrl } = urlServer({
      document: { data: { storage_bucket: 'public-media', storage_path: DOC_PATH }, error: null },
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await POST(urlReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(409);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

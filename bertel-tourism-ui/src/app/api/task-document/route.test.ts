/** @jest-environment node */
import { POST, DELETE } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../actor-document/process-actor-document', () => ({
  processActorDocumentBuffer: jest.fn().mockResolvedValue({
    buffer: Buffer.from('pdf'), mimeType: 'application/pdf', extension: 'pdf',
  }),
}));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { documentTable, linkTable } from './task-document.test-utils';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const TASK_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_TASK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const DOC_PATH = `tasks/${TASK_ID}/x.pdf`;

function callerCan(can: boolean) {
  mockedCreate.mockReturnValue({
    schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: can, error: null }) }),
  } as never);
}

function baseServer(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    ...overrides,
  } as never;
}

function multipartReq(taskId: string) {
  const form = new FormData();
  form.append('task_id', taskId);
  form.append('file', new File([Buffer.from('%PDF-x')], 'Devis.pdf', { type: 'application/pdf' }));
  return {
    headers: new Headers({ authorization: 'Bearer jwt' }),
    formData: async () => form,
  } as never;
}

function deleteReq(body: unknown) {
  return {
    headers: new Headers({ authorization: 'Bearer jwt' }),
    json: async () => body,
  } as never;
}

/** Serveur de suppression : lien + document paramétrables, storage et delete espionnés.
 *  `from` est lui-même un jest.fn() (pas une simple fonction) pour pouvoir prouver, dans le
 *  test du gate 403, qu'AUCUNE table n'est même interrogée — la preuve « aucune écriture »
 *  ne doit pas tenir à la famine du faux (removed/delDoc/from sont fournis, pas absents). */
function deleteServer(options: {
  links?: Parameters<typeof linkTable>[0];
  linkError?: { message: string } | null;
  document?: Parameters<typeof documentTable>[0];
}) {
  const link = linkTable(options.links ?? [{ task_id: TASK_ID, document_id: DOC_ID }], options.linkError ?? null);
  const document = documentTable(options.document
    ?? { data: { storage_bucket: 'actor-documents', storage_path: DOC_PATH }, error: null });
  const removed = jest.fn().mockResolvedValue({ error: null });
  const deleteEq = jest.fn().mockResolvedValue({ error: null });
  const delDoc = jest.fn().mockReturnValue({ eq: deleteEq });
  const from = jest.fn((table: string) => (table === 'crm_task_document'
    ? { select: link.select }
    : { select: document.select, delete: delDoc }));
  const server = baseServer({
    storage: { from: () => ({ remove: removed }) },
    from,
  });
  return { server, link, document, removed, delDoc, from };
}

describe('/api/task-document', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 quand user_can_write_crm_task est faux, et AUCUNE écriture n’est tentée', async () => {
    // La preuve « aucune écriture » ne doit pas tenir à la famine du mock : on FOURNIT
    // storage.upload et from(), et on assert qu'ils restent intouchés. Si le gate cessait
    // de précéder l'upload, ce test rougirait au lieu de passer par accident.
    const upload = jest.fn();
    const from = jest.fn();
    mockedServer.mockReturnValue(baseServer({ storage: { from: () => ({ upload, remove: jest.fn() }) }, from }));
    callerCan(false);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('413 size sur un corps hors plafond, SANS lire le multipart ni interroger le gate', async () => {
    // L'identifiant de la tâche voyage DANS le multipart : le gate ne peut pas précéder la
    // lecture du corps. À défaut, on refuse avant de bufferiser ce qui n'aurait de toute
    // façon jamais pu aboutir — `formData` est fourni et doit rester intouché.
    const rpc = jest.fn();
    mockedServer.mockReturnValue(baseServer());
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const formData = jest.fn();
    const res = await POST({
      headers: new Headers({ authorization: 'Bearer jwt', 'content-length': String(500 * 1024 * 1024) }),
      formData,
    } as never);
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: 'size' });
    expect(formData).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401 l’emporte sur le plafond de corps : un anonyme reste unauthenticated', async () => {
    mockedServer.mockReturnValue(baseServer());
    const formData = jest.fn();
    const res = await POST({
      headers: new Headers({ 'content-length': String(500 * 1024 * 1024) }),
      formData,
    } as never);
    expect(res.status).toBe(401);
    expect(formData).not.toHaveBeenCalled();
  });

  it('POST refuse une forme UUID invalide (400) avant tout gate', async () => {
    const rpc = jest.fn();
    mockedServer.mockReturnValue(baseServer());
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(multipartReq('pas-un-uuid'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_fields' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('upload heureux : storage + ref_document + crm_task_document → 201', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const insertDoc = jest.fn().mockReturnValue({
      select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: DOC_ID }, error: null }) }),
    });
    const insertLink = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ upload, remove: jest.fn() }) },
      from: (table: string) => (table === 'ref_document' ? { insert: insertDoc } : { insert: insertLink }),
    }));
    callerCan(true);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ documentId: DOC_ID, title: 'Devis.pdf' });
    expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^tasks/${TASK_ID}/`));
    expect(insertLink.mock.calls[0][0]).toMatchObject({ task_id: TASK_ID, document_id: DOC_ID, created_by: 'u-1' });
  });

  it('échec de l’insert ref_document ⇒ retrait du fichier déjà uploadé, 500', async () => {
    // Sans ce retrait le fichier reste dans le bucket alors qu'aucune ligne ne le
    // référence : orphelin muet, jamais purgé.
    const removed = jest.fn().mockResolvedValue({ error: null });
    const upload = jest.fn().mockResolvedValue({ error: null });
    const insertLink = jest.fn();
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ upload, remove: removed }) },
      from: (table: string) => (table === 'ref_document'
        ? {
            insert: jest.fn().mockReturnValue({
              select: () => ({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert refusé' } }) }),
            }),
          }
        : { insert: insertLink }),
    }));
    callerCan(true);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'document_create_failed' });
    expect(removed).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
    expect(insertLink).not.toHaveBeenCalled();
  });

  it('échec du lien ⇒ rollback ref_document + storage, 500', async () => {
    const removed = jest.fn();
    const delDoc = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ upload: jest.fn().mockResolvedValue({ error: null }), remove: removed }) },
      from: (table: string) => (table === 'ref_document'
        ? {
            insert: jest.fn().mockReturnValue({
              select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: DOC_ID }, error: null }) }),
            }),
            delete: delDoc,
          }
        : { insert: jest.fn().mockResolvedValue({ error: { message: 'boom' } }) }),
    }));
    callerCan(true);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(500);
    expect(delDoc).toHaveBeenCalled();
    expect(removed).toHaveBeenCalled();
  });

  it('DELETE refuse une forme UUID invalide (400)', async () => {
    mockedServer.mockReturnValue(baseServer());
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: 'pas-un-uuid' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_fields' });
  });

  it('DELETE : 403 quand user_can_write_crm_task est faux, et AUCUNE suppression n’est tentée', async () => {
    // C'est LE verbe qui DÉTRUIT une pièce jointe, et jusqu'à ce test aucun des 13 tests de
    // ce fichier n'exerçait ce gate en refus (tous appelaient callerCan(true) sur DELETE) :
    // route.ts:107 pouvait être supprimée sans faire rougir la suite. Preuve non affamée :
    // removed/delDoc/from sont FOURNIS au faux serveur (pas absents), on assert qu'ils
    // restent intouchés plutôt que de laisser passer un chemin non gaté sans le remarquer.
    const { server, removed, delDoc, from } = deleteServer({});
    mockedServer.mockReturnValue(server);
    callerCan(false);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('DELETE supprime storage puis ref_document (le lien tombe par cascade FK)', async () => {
    const { server, link, document, removed, delDoc } = deleteServer({});
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    expect(removed).toHaveBeenCalledWith([DOC_PATH]);
    expect(delDoc).toHaveBeenCalled();
    // La règle de la paire, assertée sur les colonnes RÉELLEMENT filtrées : un filtre qui
    // porterait deux fois sur document_id (donc jamais sur la tâche) rougirait ici.
    expect(link.eqCalls).toEqual([['task_id', TASK_ID], ['document_id', DOC_ID]]);
    // Le filtre `ref_document.id = documentId` : un faux qui rendrait son résultat quel
    // que soit le filtre passerait inaperçu sans cette ligne (Minor 3).
    expect(document.eqCalls).toEqual([['id', DOC_ID]]);
  });

  it('DELETE rend 404 pour un document valide rattaché à une AUTRE tâche', async () => {
    // Le documentId existe, l'appelant a le droit d'écrire sur TASK_ID, mais le lien
    // appartient à OTHER_TASK_ID : sans filtre sur la paire, il supprimerait la pièce
    // jointe d'une tâche qu'il n'a jamais gatée.
    const { server, removed, delDoc } = deleteServer({
      links: [{ task_id: OTHER_TASK_ID, document_id: DOC_ID }],
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).not.toHaveBeenCalled();
  });

  it('DELETE : lecture ref_document en échec ⇒ 500 et AUCUNE suppression (pas d’orphelin)', async () => {
    // Avaler cette erreur donnerait document = null ⇒ bucket/path vides ⇒ retrait storage
    // SAUTÉ ⇒ ligne ref_document supprimée quand même ⇒ le fichier reste dans le bucket
    // sans plus aucune ligne pour le référencer, et la route répondrait 200 {deleted:true}.
    const { server, removed, delDoc } = deleteServer({
      document: { data: null, error: { message: 'statement timeout' } },
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'document_lookup_failed' });
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).not.toHaveBeenCalled();
  });

  it('DELETE : lecture du lien en échec ⇒ 500 et AUCUNE suppression', async () => {
    const { server, removed, delDoc } = deleteServer({ linkError: { message: 'connexion perdue' } });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'link_lookup_failed' });
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).not.toHaveBeenCalled();
  });

  it('DELETE : ligne sans fichier (déjà purgé) ⇒ suppression normale, 200', async () => {
    // Cas distinct de l'erreur de lecture ci-dessus : la lecture réussit, la ligne ne
    // désigne simplement aucun fichier. Rien à retirer, la métadonnée part quand même.
    const { server, removed, delDoc } = deleteServer({ document: { data: {}, error: null } });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true });
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).toHaveBeenCalled();
  });

  it('DELETE : fichier déjà absent du bucket ("Object not found") ⇒ toléré, suppression normale, 200', async () => {
    // Cas normal du point de vue de CETTE route (suppression concurrente, retry après un
    // premier succès partiel) : on ne bloque pas la suppression de la ligne pour autant.
    // Distinct du test suivant, qui documente ce que cette tolérance NE couvre PAS.
    const { server, removed, delDoc } = deleteServer({});
    mockedServer.mockReturnValue(server);
    removed.mockResolvedValue({ error: { message: 'Object not found' } });
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    expect(removed).toHaveBeenCalledWith([DOC_PATH]);
    expect(delDoc).toHaveBeenCalled();
  });

  it('DELETE : échec RÉEL du retrait storage (pas « objet absent ») ⇒ 500, ligne CONSERVÉE', async () => {
    // Avaler CETTE erreur (droits, réseau, quota…) aboutirait au même état final que le
    // constat déjà fermé sur les erreurs de LECTURE : ligne supprimée, fichier orphelin
    // dans le bucket, 200 {deleted:true} rendu à l'appelant qui croit l'opération réussie.
    // On distingue donc « déjà absent » (toléré, test précédent) de tout le reste (traité).
    const { server, removed, delDoc } = deleteServer({});
    mockedServer.mockReturnValue(server);
    removed.mockResolvedValue({ error: { message: 'network error contacting storage' } });
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'storage_remove_failed' });
    expect(delDoc).not.toHaveBeenCalled();
  });

  it('DELETE : bucket inattendu sur la ligne ⇒ 409, aucune suppression', async () => {
    // Le bucket est épinglé : une ligne ref_document pointant ailleurs ne doit pas faire
    // supprimer un objet d'un autre bucket avec le service_role.
    const { server, removed, delDoc } = deleteServer({
      document: { data: { storage_bucket: 'public-media', storage_path: DOC_PATH }, error: null },
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(409);
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).not.toHaveBeenCalled();
  });

  it('DELETE : bucket CORRECT mais storage_path vide ⇒ « déjà purgée », 200 (pas 409)', async () => {
    // Régression fermée dans cette passe : l'ancienne condition (`bucket !== PRIVATE_BUCKET
    // || !path`) faisait tomber un chemin vide sur le BON bucket dans la branche 409, ce
    // qui rendait la ligne indéboulonnable — alors qu'un bucket correct avec un chemin vide
    // est une ligne « déjà purgée » comme une autre, pas un bucket suspect.
    const { server, removed, delDoc } = deleteServer({
      document: { data: { storage_bucket: 'actor-documents', storage_path: '' }, error: null },
    });
    mockedServer.mockReturnValue(server);
    callerCan(true);
    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));
    expect(res.status).toBe(200);
    expect(removed).not.toHaveBeenCalled();
    expect(delDoc).toHaveBeenCalled();
  });
});

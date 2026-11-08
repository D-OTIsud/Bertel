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
import { acquireLease, SEMAPHORE_RETRY_AFTER_SECONDS } from '@/lib/request-body.server';
import { processActorDocumentBuffer } from '../actor-document/process-actor-document';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const TASK_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_TASK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DOC_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

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

function multipartReq(taskId: string, amend?: (form: FormData) => void) {
  const form = new FormData();
  form.append('task_id', taskId);
  form.append('file', new File([Buffer.from('%PDF-x')], 'Devis.pdf', { type: 'application/pdf' }));
  amend?.(form);
  return new Request('http://internal.invalid/api/task-document', {
    method: 'POST',
    headers: { authorization: 'Bearer jwt' },
    body: form,
  }) as never;
}

function deleteReq(body: unknown) {
  return {
    headers: new Headers({ authorization: 'Bearer jwt' }),
    json: async () => body,
  } as never;
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

  it.each([undefined, '1'])('borne le flux réel sans taille fiable (%s) et annule sa lecture avant le gate', async (contentLength) => {
    const upload = jest.fn();
    const from = jest.fn();
    const rpc = jest.fn();
    mockedServer.mockReturnValue(baseServer({ storage: { from: () => ({ upload }) }, from }));
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const chunk = new Uint8Array(1024 * 1024);
    const cancel = jest.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 24) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    }, { highWaterMark: 0 });
    const headers = new Headers({
      authorization: 'Bearer jwt',
      'content-type': 'multipart/form-data; boundary=bounded-task',
      ...(contentLength === undefined ? {} : { 'content-length': contentLength }),
    });
    const res = await POST({ headers, body } as never);
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: 'request_body_too_large' });
    expect(pulls).toBe(22); // 21 MiB accepted, the next chunk cancels; two remain unread.
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(processActorDocumentBuffer).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['duplicate_task', 'unknown_field', 'duplicate_file'])('refuse le multipart %s avant tout gate', async (shape) => {
    const rpc = jest.fn();
    const upload = jest.fn();
    mockedServer.mockReturnValue(baseServer({ storage: { from: () => ({ upload }) } }));
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(multipartReq(TASK_ID, (form) => {
      if (shape === 'duplicate_task') form.append('task_id', OTHER_TASK_ID);
      if (shape === 'unknown_field') form.append('unread_payload', 'synthetic');
      if (shape === 'duplicate_file') form.append('file', new File(['%PDF-x'], 'Autre.pdf', { type: 'application/pdf' }));
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_multipart' });
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(processActorDocumentBuffer).not.toHaveBeenCalled();
  });

  it('partage le plafond upload, ne lit pas le corps refusé, puis libère sa place après interruption', async () => {
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
    // Another upload already owns one of the two process-wide slots.
    const otherUpload = acquireLease('upload');
    expect(otherUpload).not.toBeNull();
    const abort = new AbortController();
    let onRead!: () => void;
    const reading = new Promise<void>((resolve) => { onRead = resolve; });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        abort.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
      pull() { onRead(); },
    }, { highWaterMark: 0 });
    const pending = POST({
      headers: new Headers({ authorization: 'Bearer jwt', 'content-type': 'multipart/form-data; boundary=interrupted' }),
      body,
      signal: abort.signal,
    } as never);
    try {
      await reading;
      const pull = jest.fn();
      const rejected = await POST({
        headers: new Headers({ authorization: 'Bearer jwt' }),
        body: new ReadableStream({ pull }, { highWaterMark: 0 }),
      } as never);
      expect(rejected.status).toBe(429);
      expect(rejected.headers.get('Retry-After')).toBe(String(SEMAPHORE_RETRY_AFTER_SECONDS));
      expect(pull).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      abort.abort();
      const interrupted = await pending;
      expect(interrupted.status).toBe(400);
      await expect(interrupted.json()).resolves.toEqual({ error: 'bad_multipart' });
      // One slot is still held externally: this valid upload only succeeds if
      // the interrupted route released its own slot in finally.
      const retry = await POST(multipartReq(TASK_ID));
      expect(retry.status).toBe(201);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      abort.abort();
      await pending;
      otherUpload?.release();
    }
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

  it.each([
    ['deleted', 200, { deleted: true }],
    ['forbidden', 403, { error: 'forbidden' }],
    ['not_found', 404, { error: 'not_found' }],
    ['unexpected_bucket', 409, { error: 'unexpected_bucket' }],
  ])('DELETE %s utilise seulement le retrait de la paire par le RPC appelant', async (outcome, status, payload) => {
    const from = jest.fn();
    const storageFrom = jest.fn();
    const rpc = jest.fn().mockResolvedValue({ data: outcome, error: null });
    mockedServer.mockReturnValue(baseServer({ from, storage: { from: storageFrom } }));
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual(payload);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('unlink_crm_task_document', {
      p_task_id: TASK_ID, p_document_id: DOC_ID,
    });
    expect(from).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('DELETE ne relaie pas une erreur RPC brute et ne tente aucun retrait de secours', async () => {
    const from = jest.fn();
    const storageFrom = jest.fn();
    const rpc = jest.fn().mockResolvedValue({
      data: null, error: { code: 'XX000', message: 'private SQL details' },
    });
    mockedServer.mockReturnValue(baseServer({ from, storage: { from: storageFrom } }));
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await DELETE(deleteReq({ taskId: TASK_ID, documentId: DOC_ID }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'delete_failed' });
    expect(from).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });
});

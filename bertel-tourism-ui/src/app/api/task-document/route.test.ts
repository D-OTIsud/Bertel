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

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const TASK_ID = '11111111-2222-3333-4444-555555555555';
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

function multipartReq(taskId: string) {
  const form = new FormData();
  form.append('task_id', taskId);
  form.append('file', new File([Buffer.from('%PDF-x')], 'Devis.pdf', { type: 'application/pdf' }));
  return {
    headers: new Headers({ authorization: 'Bearer jwt' }),
    formData: async () => form,
  } as never;
}

describe('/api/task-document', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 quand user_can_write_crm_task est faux', async () => {
    mockedServer.mockReturnValue(baseServer());
    callerCan(false);
    const res = await POST(multipartReq(TASK_ID));
    expect(res.status).toBe(403);
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

  it('DELETE supprime storage puis ref_document (le lien tombe par cascade FK)', async () => {
    const removed = jest.fn().mockResolvedValue({ error: null });
    const maybeLink = jest.fn().mockResolvedValue({ data: { document_id: DOC_ID }, error: null });
    const maybeDoc = jest.fn().mockResolvedValue({
      data: { storage_bucket: 'actor-documents', storage_path: `tasks/${TASK_ID}/x.pdf` }, error: null,
    });
    const delDoc = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    mockedServer.mockReturnValue(baseServer({
      storage: { from: () => ({ remove: removed }) },
      from: (table: string) => (table === 'crm_task_document'
        ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: maybeLink }) }) }) }
        : { select: () => ({ eq: () => ({ maybeSingle: maybeDoc }) }), delete: delDoc }),
    }));
    callerCan(true);
    const res = await DELETE({
      headers: new Headers({ authorization: 'Bearer jwt' }),
      json: async () => ({ taskId: TASK_ID, documentId: DOC_ID }),
    } as never);
    expect(res.status).toBe(200);
    expect(removed).toHaveBeenCalledWith([`tasks/${TASK_ID}/x.pdf`]);
    expect(delDoc).toHaveBeenCalled();
  });
});

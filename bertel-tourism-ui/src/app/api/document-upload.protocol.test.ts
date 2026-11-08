/** @jest-environment node */
import { POST as actorPost } from './actor-document/route';
import { POST as taskPost } from './task-document/route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { processActorDocumentBuffer } from './actor-document/process-actor-document';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./actor-document/process-actor-document', () => ({
  ACTOR_PDF_MAX_BYTES: 5242880,
  processActorDocumentBuffer: jest.fn(async () => ({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf', extension: 'pdf' })),
}));

const USER = '00000000-0000-4000-a000-000000009101';
const PARENT = '00000000-0000-4000-a000-000000009102';
const OLD_DOCUMENT = '00000000-0000-4000-a000-000000009103';
type Failure = 'prepare' | 'prepared_reply' | 'upload' | 'confirm' | 'attach' | 'attach_throw' | 'attach_pending' | 'document_insert';
type Params = Record<string, unknown>;

function harness(kind: 'actor' | 'task', failure?: Failure, image?: Buffer) {
  const events: string[] = [];
  const bytes = new Set<string>();
  const documents = new Set<string>();
  const links = new Set<string>();
  let intent: Params | undefined;
  let state = '';
  let legacyPath = '';
  let finishPending: (() => void) | undefined;
  const networkError = { code: '', message: 'synthetic lost acknowledgement' };
  const committedAttach = (id: string) => {
    documents.add(id); links.add(id); state = 'attached'; events.push('attach-committed');
  };
  const callerRpc = jest.fn(async (name: string, args: Params) => {
    if (name.startsWith('user_can_write_')) return { data: true, error: null };
    if (name === 'prepare_crm_document_upload') {
      intent = args; state = 'prepared'; events.push('intent-committed');
      if (failure === 'prepare') return { data: null, error: networkError };
      const path = `${kind === 'actor' ? 'actors' : 'tasks'}/${PARENT}/${args.p_upload_id}.${args.p_extension}`;
      return { data: { uploadId: args.p_upload_id, documentId: args.p_upload_id,
        bucket: 'actor-documents', path: failure === 'prepared_reply' ? 'other/key.pdf' : path, state }, error: null };
    }
    if (name === 'attach_crm_document_upload') {
      events.push('attach-requested');
      const id = String(args.p_upload_id);
      if (failure === 'attach_pending') {
        finishPending = () => committedAttach(id);
        return { data: null, error: networkError };
      }
      if (failure === 'document_insert') return { data: null, error: { code: 'PT500', message: 'document_create_failed' } };
      committedAttach(id);
      if (failure === 'attach') return { data: null, error: networkError };
      if (failure === 'attach_throw') throw new Error('synthetic transport rejection');
      return { data: { documentId: id, title: intent!.p_title }, error: null };
    }
    throw new Error('Unexpected caller RPC');
  });
  const serviceRpc = jest.fn(async (_name: string, args: Params) => {
    events.push('upload-acknowledged'); state = 'uploaded';
    return failure === 'confirm' ? { data: null, error: networkError }
      : { data: { uploadId: args.p_upload_id, state }, error: null };
  });
  const remove = jest.fn(async (paths: string[]) => {
    paths.forEach(path => bytes.delete(path)); return { error: null };
  });
  const upload = jest.fn(async (path: string, _buffer: Buffer) => {
    events.push('provider-upload'); legacyPath = path; bytes.add(path);
    return failure === 'upload' ? { data: null, error: networkError } : { data: { path }, error: null };
  });
  // The complete old table/provider surface makes the regression fail causally
  // against cc006: its committed link ACK loss invokes DELETE + Storage remove.
  const from = jest.fn((table: string) => ({
    insert: () => table === 'ref_document' ? {
      select: () => ({ single: async () => {
        documents.add(OLD_DOCUMENT); return { data: { id: OLD_DOCUMENT }, error: null };
      } }),
    } : Promise.resolve().then(() => {
      links.add(OLD_DOCUMENT);
      return { error: failure === 'attach' ? networkError : null };
    }),
    delete: () => ({ eq: async (_column: string, id: string) => {
      documents.delete(id); links.delete(id); return { error: null };
    } }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }));
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc: callerRpc }) } as never);
  jest.mocked(getServerSupabaseClient).mockReturnValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER } }, error: null })) },
    storage: { from: () => ({ upload, remove }) }, schema: () => ({ rpc: serviceRpc }), from,
  } as never);
  const form = new FormData();
  form.append(`${kind}_id`, PARENT);
  form.append('file', new File([image ? new Uint8Array(image) : '%PDF-synthetic'], image ? 'Synthetic.jpg' : 'Synthetic.pdf', { type: image ? 'image/jpeg' : 'application/pdf' }));
  const request = new Request(`http://synthetic.invalid/api/${kind}-document`, {
    method: 'POST', headers: { authorization: 'Bearer synthetic-jwt' }, body: form,
  });
  return { run: () => (kind === 'actor' ? actorPost : taskPost)(request as never),
    events, bytes, documents, links, upload, remove, from, callerRpc, serviceRpc,
    state: () => state, intent: () => intent, path: () => legacyPath,
    finishPending: () => { expect(finishPending).toBeDefined(); finishPending!(); } };
}

describe.each(['actor', 'task'] as const)('%s upload uncertainty', kind => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves committed metadata, link and bytes when the attachment ACK is lost', async () => {
    const h = harness(kind, 'attach');
    expect((await h.run()).status).toBe(500);
    expect(h.documents.size).toBe(1);
    expect(h.links.size).toBe(1);
    expect(h.bytes.size).toBe(1);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('keeps prepared provenance after an upload commits but its response is lost', async () => {
    const h = harness(kind, 'upload');
    expect((await h.run()).status).toBe(500);
    expect(h.state()).toBe('prepared');
    expect(h.bytes.has(h.path())).toBe(true);
    expect(h.serviceRpc).not.toHaveBeenCalled();
    expect(h.documents.size).toBe(0);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it.each(['prepare', 'prepared_reply'] as const)('does not upload without an exact acknowledged preparation (%s)', async failure => {
    const h = harness(kind, failure);
    expect((await h.run()).status).toBe(500);
    expect(h.state()).toBe('prepared');
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it.each(['confirm', 'attach_throw', 'document_insert'] as const)('retains the one upload and intent on %s failure', async failure => {
    const h = harness(kind, failure);
    expect((await h.run()).status).toBe(500);
    expect(h.intent()).toBeDefined();
    expect(h.bytes.size).toBe(1);
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
    if (failure === 'confirm') expect(h.events).not.toContain('attach-requested');
  });

  it('does not infer failure from absence while the attachment is still in flight', async () => {
    const h = harness(kind, 'attach_pending');
    expect((await h.run()).status).toBe(500);
    expect(h.documents.size).toBe(0);
    expect(h.links.size).toBe(0);
    expect(h.state()).toBe('uploaded');
    expect(h.from).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
    h.finishPending();
    expect(h.documents.size).toBe(1);
    expect(h.links.size).toBe(1);
    expect(h.bytes.size).toBe(1);
  });

  it('accepts the real JPEG processor output with the prepared MIME, extension and byte count', async () => {
    const actual = jest.requireActual('./actor-document/process-actor-document') as typeof import('./actor-document/process-actor-document');
    jest.mocked(processActorDocumentBuffer).mockImplementationOnce(actual.processActorDocumentBuffer);
    const image = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#4488aa' } }).jpeg().toBuffer();
    const h = harness(kind, undefined, image);
    expect((await h.run()).status).toBe(201);
    expect(h.intent()).toMatchObject({ p_mime_type: 'image/jpeg', p_extension: 'jpg' });
    expect(h.intent()!.p_size_bytes).toBe(h.upload.mock.calls[0][1].byteLength);
    expect(h.path()).toMatch(/\.jpg$/);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('keeps the normal 201 and binds the service confirmation to exact prepared bytes', async () => {
    const h = harness(kind);
    const res = await h.run();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ documentId: h.intent()!.p_upload_id, title: 'Synthetic.pdf' });
    expect(h.events).toEqual(['intent-committed', 'provider-upload', 'upload-acknowledged', 'attach-requested', 'attach-committed']);
    expect(h.serviceRpc).toHaveBeenCalledWith('confirm_crm_document_upload', {
      p_upload_id: h.intent()!.p_upload_id, p_user_id: USER, p_storage_path: h.path(),
      p_sha256: h.intent()!.p_sha256, p_size_bytes: 3, p_mime_type: 'application/pdf',
    });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
  });
});

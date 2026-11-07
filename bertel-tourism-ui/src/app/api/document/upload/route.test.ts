/** @jest-environment node */
// /api/document/upload — justificatif (PDF + image) → ref_document. Same gate as
// /api/media/upload (authorize AS THE CALLER via user_can_write_object_canonical);
// service-role storage write + ref_document insert are bounded by that probe.
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../media/upload/process-image', () => ({
  processImage: jest.fn(async () => ({ buffer: Buffer.from([9, 9, 9]), width: 512, height: 512, mimeType: 'image/jpeg' })),
  MAX_INPUT_BYTES: 20 * 1024 * 1024,
  MediaProcessingError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
// Auth/permission-focused tests below stub `formData` directly on fake `req` objects with no
// real `.body` stream — reduce readBoundedFormData to that stub. The oversized-body path is
// covered for /api/media/upload's real-byte regression test (shared implementation).
jest.mock('@/lib/request-body.server', () => {
  const actual = jest.requireActual('@/lib/request-body.server');
  return {
    ...actual,
    readBoundedFormData: jest.fn((req: { formData: () => Promise<FormData> }) => req.formData()),
  };
});

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const OBJECT_ID = 'HOTRUN0000000001';

function pdfForm(objectId: string = OBJECT_ID): FormData {
  const form = new FormData();
  // Real %PDF- header — the route validates magic bytes, not just the client MIME (§71 E).
  form.append('file', new File([new TextEncoder().encode('%PDF-1.4 test')], 'attestation.pdf', { type: 'application/pdf' }));
  form.append('object_id', objectId);
  return form;
}

function req(headers: Record<string, string>, form: FormData): never {
  return { headers: new Headers(headers), formData: async () => form } as never;
}

function serverOk(insertId = 'doc-1', errors: { upload?: string; insert?: string } = {}) {
  const single = jest.fn().mockResolvedValue(errors.insert
    ? { data: null, error: { message: errors.insert } }
    : { data: { id: insertId }, error: null });
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: errors.upload ? { message: errors.upload } : null }),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://cdn/documents/HOTRUN0000000001/x.pdf' } })),
      })),
    },
    from: jest.fn(() => ({ insert })),
    __insert: insert,
  } as never;
}

function authorize(value: boolean | null, error: unknown = null) {
  const rpc = jest.fn().mockResolvedValue({ data: value, error });
  mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
  return rpc;
}

describe('POST /api/document/upload', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('401 without a bearer token', async () => {
    mockedServer.mockReturnValue(serverOk());
    expect((await POST(req({}, pdfForm()))).status).toBe(401);
  });

  it('400 when object_id is malformed (before any permission probe)', async () => {
    mockedServer.mockReturnValue(serverOk());
    const res = await POST(req({ authorization: 'Bearer t' }, pdfForm('../evil')));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('403 when the caller cannot write the object (fail-closed)', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = authorize(false);
    const res = await POST(req({ authorization: 'Bearer t' }, pdfForm()));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('user_can_write_object_canonical', { p_object_id: OBJECT_ID });
  });

  it('403 when the permission probe errors', async () => {
    mockedServer.mockReturnValue(serverOk());
    authorize(null, { message: 'boom' });
    expect((await POST(req({ authorization: 'Bearer t' }, pdfForm()))).status).toBe(403);
  });

  it('201 + { documentId, url } for an authorized PDF (creates ref_document)', async () => {
    const server = serverOk('doc-42');
    mockedServer.mockReturnValue(server);
    authorize(true);
    const res = await POST(req({ authorization: 'Bearer t' }, pdfForm()));
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.documentId).toBe('doc-42');
    expect(payload.url).toContain('/documents/');
    expect((server as unknown as { __insert: jest.Mock }).__insert).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.any(String), title: 'attestation.pdf' }),
    );
  });

  it.each([
    ['upload', 'upload_failed'],
    ['insert', 'document_create_failed'],
  ] as const)('500 correlates the %s failure without exposing engine details', async (step, code) => {
    mockedServer.mockReturnValue(serverOk('doc-1', { [step]: 'synthetic engine detail DOC_SENTINEL' }));
    authorize(true);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await POST(req({ authorization: 'Bearer t' }, pdfForm()));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: code });
      const requestId = res.headers.get('x-request-id');
      expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(warn.mock.calls).toEqual([['[route-error]', { route: 'document/upload.POST', code, requestId }]]);
    } finally {
      warn.mockRestore();
    }
  });
});

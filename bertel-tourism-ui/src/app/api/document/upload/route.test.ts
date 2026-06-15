/** @jest-environment node */
// /api/document/upload — justificatif (PDF + image) → ref_document. Same gate as
// /api/media/upload (authorize AS THE CALLER via user_can_write_object_canonical);
// service-role storage write + ref_document insert are bounded by that probe.
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../media/upload/process-image', () => ({
  processImage: jest.fn(async () => ({ buffer: Buffer.from([9, 9, 9]), width: 512, height: 512, mimeType: 'image/jpeg' })),
  MediaProcessingError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const OBJECT_ID = 'HOTRUN0000000001';

function pdfForm(objectId: string = OBJECT_ID): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'attestation.pdf', { type: 'application/pdf' }));
  form.append('object_id', objectId);
  return form;
}

function req(headers: Record<string, string>, form: FormData): never {
  return { headers: new Headers(headers), formData: async () => form } as never;
}

/** Server: getUser OK + storage upload OK + getPublicUrl + ref_document insert OK. */
function serverOk(insertId = 'doc-1') {
  const single = jest.fn().mockResolvedValue({ data: { id: insertId }, error: null });
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
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
});

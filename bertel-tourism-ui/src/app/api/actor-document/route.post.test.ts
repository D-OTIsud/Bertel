/** @jest-environment node */
// POST /api/actor-document — API-01 body bound. Mirrors the pattern used by the other
// upload routes: auth/permission tests stub formData() directly; oversized-body tests
// exercise the real byte path with Content-Length absent or falsely small.
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../media/upload/process-image', () => ({
  MAX_INPUT_BYTES: 20 * 1024 * 1024,
  MediaProcessingError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('./process-actor-document', () => ({
  processActorDocumentBuffer: jest.fn(async () => ({ buffer: Buffer.from([1, 2, 3]), mimeType: 'image/jpeg', extension: 'jpg' })),
  ACTOR_PDF_MAX_BYTES: 5 * 1024 * 1024,
}));
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

const ACTOR_UUID = '11111111-2222-4333-8444-555555555555';

function makeForm(): FormData {
  const form = new FormData();
  form.append('actor_id', ACTOR_UUID);
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'doc.jpg', { type: 'image/jpeg' }));
  return form;
}

function req(headers: Record<string, string>, form: FormData): never {
  return { headers: new Headers(headers), formData: async () => form } as never;
}

function serverWithUser() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn().mockResolvedValue({ error: null }) })) },
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }) })) })),
    })),
  } as never;
}

describe('POST /api/actor-document', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('401 without a bearer token', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    expect((await POST(req({}, makeForm()))).status).toBe(401);
  });

  it('403 when the caller cannot write the actor', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
  });

  it('201 when authorized', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(201);
  });

  it.each([undefined, '1'])('413s an oversized stream with Content-Length %s before any permission probe', async (contentLength) => {
    const { readBoundedFormData: real } = jest.requireActual('@/lib/request-body.server');
    const { readBoundedFormData } = jest.requireMock('@/lib/request-body.server') as { readBoundedFormData: jest.Mock };
    readBoundedFormData.mockImplementationOnce(real);

    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn();
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const realReq = new Request('http://internal.invalid/', {
      method: 'POST',
      headers: {
        authorization: 'Bearer t',
        'content-type': 'multipart/form-data; boundary=x',
        ...(contentLength === undefined ? {} : { 'content-length': contentLength }),
      },
      body: new Uint8Array(22 * 1024 * 1024),
    });

    const res = await POST(realReq as never);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'request_body_too_large' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

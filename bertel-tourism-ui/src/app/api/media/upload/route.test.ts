/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./handle-upload', () => ({
  handleMediaUpload: jest.fn(async () => ({
    url: 'https://cdn.test/HOTRUN9999990711/x.jpg',
    width: 800,
    height: 600,
    mimeType: 'image/jpeg',
  })),
}));
// These tests target auth/permission behaviour, not the byte-bounding path — reduce
// readBoundedFormData to the request's own formData() so the fake `req` objects below
// (which stub `formData` directly, with no real `.body` stream) keep working.
// request-body.server.test.ts and the oversized-request test below exercise the real bytes.
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

function makeForm(objectId = 'HOTRUN9999990711'): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' }));
  form.append('object_id', objectId);
  return form;
}

function req(headers: Record<string, string>, form: FormData): never {
  return { headers: new Headers(headers), formData: async () => form } as never;
}

function serverWithUser() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    storage: { from: jest.fn() },
  } as never;
}

describe('POST /api/media/upload — per-object permission gate', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('403 when the caller cannot write the object canonically (storage-spam hole closed)', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('user_can_write_object_canonical', { p_object_id: 'HOTRUN9999990711' });
  });

  it('403 (fail-closed) when the permission probe errors', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
  });

  it('201 when the caller is authorized', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/media/upload — declared-size preflight (before arrayBuffer)', () => {
  it('415s a declared-oversized image without ever reading its bytes', async () => {
    // A 99 MiB declared IMAGE fits the ~101 MiB envelope (sized for the largest accepted file,
    // a video) but must never reach processImage's 20 MiB decode-time check via a full buffer
    // copy. `size` is overridden on a tiny real File (no 99 MiB fixture allocated); `arrayBuffer`
    // is spied to prove it is never called — the preflight must reject from `file.size` alone.
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const file = new File([new Uint8Array([1, 2, 3])], 'huge.jpg', { type: 'image/jpeg' });
    const arrayBufferSpy = jest.fn(async () => new ArrayBuffer(0));
    Object.defineProperty(file, 'size', { value: 99 * 1024 * 1024 });
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBufferSpy });
    const form = new FormData();
    form.append('file', file);
    form.append('object_id', 'HOTRUN9999990711');

    const res = await POST(req({ authorization: 'Bearer t' }, form));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe('size');
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/media/upload — API-01 body bound (real byte path)', () => {
  it('413s an oversized request before any permission probe or storage write, body left unread by the RPC layer', async () => {
    // Restore the REAL readBoundedFormData for this test — a real stream, no formData() stub.
    const { readBoundedFormData: real } = jest.requireActual('@/lib/request-body.server');
    const { readBoundedFormData } = jest.requireMock('@/lib/request-body.server') as {
      readBoundedFormData: jest.Mock;
    };
    readBoundedFormData.mockImplementationOnce(real);

    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn();
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    // Declared Content-Length alone (bigger than the ~101 MiB envelope) is enough to trigger
    // the early rejection in readBoundedBytes — no need for a near-100 MiB fixture, and the
    // stream is never even read (proving the body is left unread on the oversized path). A
    // plain duck-typed object (not `new Request()`) avoids Node's own fetch implementation
    // starting to consume/pipe the stream as part of Request body extraction, which would
    // desynchronize this "never read" assertion from what our code actually does.
    let streamRead = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          streamRead = true;
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const realReq = {
      headers: new Headers({
        authorization: 'Bearer t',
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(200 * 1024 * 1024),
      }),
      body: stream,
    };

    const res = await POST(realReq as never);
    expect(streamRead).toBe(false);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'request_body_too_large' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

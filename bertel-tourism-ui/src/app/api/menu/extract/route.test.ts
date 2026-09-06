/** @jest-environment node */
// POST /api/menu/extract — API-01 body bound + AI concurrency semaphore.
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./media-prep', () => ({
  MAX_VISION_IMAGES: 8,
  prepareVisionImage: jest.fn(async (buf: Buffer, mime: string) => ({ mime, base64: buf.toString('base64') })),
}));
jest.mock('./orchestrate', () => ({
  orchestrateExtraction: jest.fn(async () => ({ ok: true, menu: { sections: [] }, suggestedDietaryByDish: [] })),
}));
// Auth/permission-focused tests below stub req.json() directly; the real byte path is
// exercised separately in the oversized-body test.
jest.mock('@/lib/request-body.server', () => {
  const actual = jest.requireActual('@/lib/request-body.server');
  return {
    ...actual,
    readBoundedJson: jest.fn((req: { json: () => Promise<unknown> }) => req.json()),
  };
});

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { orchestrateExtraction } from './orchestrate';
import { prepareVisionImage } from './media-prep';
import { MediaProcessingError } from '../../media/upload/process-image';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedOrchestrate = jest.mocked(orchestrateExtraction);
const mockedPrepareVisionImage = jest.mocked(prepareVisionImage);

const OBJECT_ID = 'HOTRUN0000000001';
const TINY_JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff]).toString('base64');
let testUser = 0;

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    object_id: OBJECT_ID,
    images: [{ mime: 'image/jpeg', base64: TINY_JPEG_BASE64 }],
    ...overrides,
  };
}

function req(headers: Record<string, string>, body: unknown): never {
  return { headers: new Headers(headers), json: async () => body } as never;
}

function serverWithUser() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: `test-user-${testUser}` } }, error: null }) },
    schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: [{ api_kind: 'openai', base_url: 'x', model: 'm', max_output_tokens: 100, extra: null, api_key: 'k' }], error: null }) }),
  } as never;
}

describe('POST /api/menu/extract', () => {
  beforeEach(() => {
    testUser += 1;
    mockedServer.mockReset();
    mockedCreate.mockReset();
    mockedOrchestrate.mockClear();
    mockedPrepareVisionImage.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('401 without a bearer token', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    expect((await POST(req({}, makeBody()))).status).toBe(401);
  });

  it('403 when the caller cannot write the object', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(res.status).toBe(403);
  });

  it('200 when authorized', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(res.status).toBe(200);
  });

  it('400 when an image base64 string exceeds the per-image bound (before decode)', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const body = makeBody({ images: [{ mime: 'image/jpeg', base64: 'x'.repeat(20 * 1024 * 1024) }] });
    const res = await POST(req({ authorization: 'Bearer t' }, body));
    expect(res.status).toBe(400);
  });

  it('truncates (200, truncated:true) for a count above MAX_VISION_IMAGES but within the array cap — unchanged contract', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const body = makeBody({ images: Array.from({ length: 20 }, () => ({ mime: 'image/jpeg', base64: TINY_JPEG_BASE64 })) });
    const res = await POST(req({ authorization: 'Bearer t' }, body));
    expect(res.status).toBe(200);
    expect((await res.json()).truncated).toBe(true);
  });

  it('400s when the image array exceeds the outer cap (pathological decoy-array defense)', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const body = makeBody({ images: Array.from({ length: 65 }, () => ({ mime: 'image/jpeg', base64: TINY_JPEG_BASE64 })) });
    const res = await POST(req({ authorization: 'Bearer t' }, body));
    expect(res.status).toBe(400);
  });

  it('holds the ai lease while an image preparation is in flight: a second authorized request is 429ed and never reaches the provider; the lease frees only once the pending work settles', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let resolveFirst!: (v: { mime: string; base64: string }) => void;
    const deferred = new Promise<{ mime: string; base64: string }>((resolve) => {
      resolveFirst = resolve;
    });
    mockedPrepareVisionImage.mockImplementationOnce(() => {
      signalStarted();
      return deferred;
    });

    const firstRequest = POST(req({ authorization: 'Bearer t' }, makeBody()));
    await Promise.race([started, firstRequest.then(() => { throw new Error('Preparation was never started'); })]);

    const concurrent = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(concurrent.status).toBe(429);
    expect(mockedOrchestrate).not.toHaveBeenCalled();

    resolveFirst({ mime: 'image/jpeg', base64: 'AAA' });
    const firstRes = await firstRequest;
    expect(firstRes.status).toBe(200);

    // Only NOW is the lease free again.
    const followUp = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(followUp.status).toBe(200);
  });

  it('une première conversion invalide empêche de lancer les suivantes et libère le quota', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    mockedPrepareVisionImage.mockRejectedValueOnce(new MediaProcessingError('mime', 'format invalide'));
    const body = makeBody({
      images: [
        { mime: 'image/jpeg', base64: TINY_JPEG_BASE64 },
        { mime: 'image/jpeg', base64: TINY_JPEG_BASE64 },
      ],
    });
    const res = await POST(req({ authorization: 'Bearer t' }, body));
    expect(res.status).toBe(415);
    expect(mockedPrepareVisionImage).toHaveBeenCalledTimes(1);
    expect(mockedOrchestrate).not.toHaveBeenCalled();

    // No work survived the rejection — an immediate follow-up request is admitted right away.
    const followUp = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(followUp.status).toBe(200);
  });

  it('garde le quota pendant la première conversion lente, puis refuse la seconde invalide sans travail restant', async () => {
    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let resolveFirst!: (v: { mime: string; base64: string }) => void;
    const deferred = new Promise<{ mime: string; base64: string }>((resolve) => {
      resolveFirst = resolve;
    });
    mockedPrepareVisionImage.mockImplementationOnce(() => {
      signalStarted();
      return deferred;
    });
    mockedPrepareVisionImage.mockRejectedValueOnce(new MediaProcessingError('mime', 'format invalide'));

    const body = makeBody({
      images: [
        { mime: 'image/jpeg', base64: TINY_JPEG_BASE64 }, // slow/deferred, resolved below
        { mime: 'image/jpeg', base64: TINY_JPEG_BASE64 }, // rejected only when preparation starts
      ],
    });
    const pending = POST(req({ authorization: 'Bearer t' }, body));
    await Promise.race([started, pending.then(() => { throw new Error('Preparation was never started'); })]);

    // While image 0's preparation is in flight, the lease is held.
    const concurrent = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(concurrent.status).toBe(429);

    resolveFirst({ mime: 'image/jpeg', base64: 'AAA' });
    const res = await pending;
    expect(res.status).toBe(415);
    expect(mockedPrepareVisionImage).toHaveBeenCalledTimes(2);
    expect(mockedOrchestrate).not.toHaveBeenCalled();

    // Lease freed immediately after the rejection — no orphaned work lingers.
    const followUp = await POST(req({ authorization: 'Bearer t' }, makeBody()));
    expect(followUp.status).toBe(200);
  });

  it('413s an oversized JSON request before authorization (real byte path)', async () => {
    const { readBoundedJson: real } = jest.requireActual('@/lib/request-body.server');
    const { readBoundedJson } = jest.requireMock('@/lib/request-body.server') as { readBoundedJson: jest.Mock };
    readBoundedJson.mockImplementationOnce(real);

    mockedServer.mockReturnValue(serverWithUser());
    const rpc = jest.fn();
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const realReq = new Request('http://internal.invalid/', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-length': String(200 * 1024 * 1024) },
      body: new Uint8Array([1, 2, 3]),
    });

    const res = await POST(realReq as never);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'request_body_too_large' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

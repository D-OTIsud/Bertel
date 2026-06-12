/** @jest-environment node */
// Route portrait acteur (PO point 4) — MÊME pipeline que /api/media/upload : autorise
// AS THE CALLER (user_can_write_crm_actor), strippe l'EXIF via process-image, écrit en
// service-role, pose actor.photo_url. Le gate est la frontière (le storage write bypass RLS).
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
import { processImage } from '../../media/upload/process-image';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedProcess = jest.mocked(processImage);

function makeForm(actorId = 'actor-1'): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'portrait.jpg', { type: 'image/jpeg' }));
  form.append('actorId', actorId);
  return form;
}

function req(headers: Record<string, string>, form: FormData): never {
  return { headers: new Headers(headers), formData: async () => form } as never;
}

/** Server client : getUser OK + storage upload OK + getPublicUrl + actor update OK. */
function serverOk(updateSpy = jest.fn().mockResolvedValue({ error: null })) {
  const eqSpy = jest.fn(() => updateSpy());
  const updateFrom = jest.fn(() => ({ eq: eqSpy }));
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://cdn/actors/actor-1/x.jpg' } })),
      })),
    },
    from: jest.fn(() => ({ update: updateFrom })),
    __updateFrom: updateFrom,
  } as never;
}

describe('POST /api/actor-photo/upload — gate as-the-caller + pipeline', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    mockedProcess.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('401 sans bearer', async () => {
    mockedServer.mockReturnValue(serverOk());
    const res = await POST(req({}, makeForm()));
    expect(res.status).toBe(401);
  });

  it('403 quand le caller ne peut pas écrire l acteur (storage-spam hole fermé)', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('user_can_write_crm_actor', { p_actor_id: 'actor-1' });
  });

  it('403 (fail-closed) quand la sonde de permission erre', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
  });

  it('415 sur un MIME non autorisé (gate process-image)', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const { MediaProcessingError } = jest.requireMock('../../media/upload/process-image');
    mockedProcess.mockRejectedValueOnce(new MediaProcessingError('mime', 'Unsupported MIME type'));

    const form = new FormData();
    form.append('file', new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' }));
    form.append('actorId', 'actor-1');
    const res = await POST(req({ authorization: 'Bearer t' }, form));
    expect(res.status).toBe(415);
  });

  it('201 + { url } quand autorisé : process-image appelé, actor.photo_url posé', async () => {
    const updateSpy = jest.fn().mockResolvedValue({ error: null });
    const server = serverOk(updateSpy);
    mockedServer.mockReturnValue(server);
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload).toEqual({ url: 'https://cdn/actors/actor-1/x.jpg' });
    expect(mockedProcess).toHaveBeenCalledTimes(1);
    // L'UPDATE actor.photo_url part (single writer du portrait).
    expect((server as unknown as { __updateFrom: jest.Mock }).__updateFrom).toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalled();
  });
});

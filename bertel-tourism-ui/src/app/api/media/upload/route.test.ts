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

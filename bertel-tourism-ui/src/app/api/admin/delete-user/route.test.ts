/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

function req(headers: Record<string, string>, body: unknown): never {
  return { headers: new Headers(headers), json: async () => body } as never;
}

function callerClient(isSuper: boolean, rank: number | null) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: isSuper, error: null })
    .mockResolvedValueOnce({ data: rank, error: null });
  return { schema: () => ({ rpc }) };
}

describe('POST /api/admin/delete-user', () => {
  beforeEach(() => {
    mockedServer.mockReset(); mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('401 when no bearer token', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    const res = await POST(req({}, {}));
    expect(res.status).toBe(401);
  });

  it('403 when caller is neither superuser nor org_admin', async () => {
    mockedServer.mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }) } } as never);
    mockedCreate.mockReturnValue(callerClient(false, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    expect(res.status).toBe(403);
  });

  it('403 self_delete_forbidden when admin targets their own account', async () => {
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }) },
    } as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'admin' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('self_delete_forbidden');
  });

  it('200 deletes the target user via the admin API', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { deleteUser },
      },
    } as never);
    mockedCreate.mockReturnValue(callerClient(false, 30) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('target');
  });
});

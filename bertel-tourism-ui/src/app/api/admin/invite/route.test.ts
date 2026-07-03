/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

function req(headers: Record<string, string>, body: unknown): never {
  return { headers: new Headers(headers), json: async () => body, url: 'https://app.test/api/admin/invite' } as never;
}

/** asCaller client whose gate answers superuser=true. */
function superuserCaller() {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  return { schema: () => ({ rpc }) };
}

describe('POST /api/admin/invite', () => {
  beforeEach(() => { mockedServer.mockReset(); mockedCreate.mockReset(); process.env.NEXT_PUBLIC_SUPABASE_URL='https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='anon'; });

  it('401 when no bearer token', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    const res = await POST(req({}, {}));
    expect(res.status).toBe(401);
  });

  it('403 when caller is neither superuser nor org_admin', async () => {
    mockedServer.mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) } } as never);
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { email: 'x@y.z', orgObjectId: 'ORG1' }));
    expect(res.status).toBe(403);
  });

  it('201 sends the invite email with the /set-password redirect', async () => {
    const inviteUserByEmail = jest.fn().mockResolvedValue({ data: { user: { id: 'new1' } }, error: null });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { inviteUserByEmail },
      },
      from: () => ({ upsert }),
    } as never);
    mockedCreate.mockReturnValue(superuserCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t', origin: 'https://bertel.otisud.re' }, { email: 'x@y.z' }));
    expect(res.status).toBe(201);
    expect(inviteUserByEmail).toHaveBeenCalledWith('x@y.z', { redirectTo: 'https://bertel.otisud.re/set-password' });
    expect((await res.json()).userId).toBe('new1');
  });

  it('409 with neverSignedIn when the email already exists', async () => {
    const inviteUserByEmail = jest.fn().mockResolvedValue({ data: null, error: { message: 'exists' } });
    const listUsers = jest.fn().mockResolvedValue({ data: { users: [{ id: 'u9', email: 'x@y.z', last_sign_in_at: null }] } });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { inviteUserByEmail, listUsers },
      },
    } as never);
    mockedCreate.mockReturnValue(superuserCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { email: 'x@y.z' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ userId: 'u9', alreadyExisted: true, neverSignedIn: true });
  });

  it('resend: deletes the never-signed-in account then re-invites', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    const inviteUserByEmail = jest.fn().mockResolvedValue({ data: { user: { id: 'new2' } }, error: null });
    const listUsers = jest.fn().mockResolvedValue({ data: { users: [{ id: 'old1', email: 'x@y.z', last_sign_in_at: null }] } });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { inviteUserByEmail, listUsers, deleteUser },
      },
      from: () => ({ upsert }),
    } as never);
    mockedCreate.mockReturnValue(superuserCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { email: 'x@y.z', resend: true }));
    expect(res.status).toBe(201);
    expect(deleteUser).toHaveBeenCalledWith('old1');
    expect(inviteUserByEmail).toHaveBeenCalled();
    expect((await res.json()).userId).toBe('new2');
  });

  it('resend: 409 already_active when the account has signed in', async () => {
    const deleteUser = jest.fn();
    const inviteUserByEmail = jest.fn();
    const listUsers = jest.fn().mockResolvedValue({ data: { users: [{ id: 'old1', email: 'x@y.z', last_sign_in_at: '2026-07-01T00:00:00Z' }] } });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { inviteUserByEmail, listUsers, deleteUser },
      },
    } as never);
    mockedCreate.mockReturnValue(superuserCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { email: 'x@y.z', resend: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_active');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});

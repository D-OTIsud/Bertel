/** @jest-environment node */
import { POST } from './route';
import { readApiErrorMessage } from '@/services/api-error';

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

/**
 * `server.from(...)` pour la garde `sharesOrgIgnoringTargetActivity` : une ligne par membership,
 * `is_active` porté explicitement (la fonction ne filtre PAS côté requête — elle lit tout et
 * n'exige l'activité que côté appelant).
 */
function membershipFrom(rows: Array<{ user_id: string; org_object_id: string; is_active: boolean }>) {
  const inFn = jest.fn().mockResolvedValue({ data: rows, error: null });
  const select = jest.fn().mockReturnValue({ in: inFn });
  return jest.fn().mockReturnValue({ select });
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

  it('200 deletes the target user via the admin API (même ORG, active des deux côtés)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { deleteUser },
      },
      from: membershipFrom([
        { user_id: 'admin', org_object_id: 'ORG1', is_active: true },
        { user_id: 'target', org_object_id: 'ORG1', is_active: true },
      ]),
    } as never);
    mockedCreate.mockReturnValue(callerClient(false, 30) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('target');
  });

  it('403 out_of_scope quand la cible est d’une AUTRE ORG (rang 30) — deleteUser jamais appelée', async () => {
    const deleteUser = jest.fn();
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { deleteUser },
      },
      from: membershipFrom([
        { user_id: 'admin', org_object_id: 'ORG1', is_active: true },
        { user_id: 'target', org_object_id: 'ORG2', is_active: true },
      ]),
    } as never);
    mockedCreate.mockReturnValue(callerClient(false, 30) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('out_of_scope');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('200 quand la cible est de la MÊME ORG mais avec un membership DÉSACTIVÉ (piège B — l’admin vient lui-même de la désactiver)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        admin: { deleteUser },
      },
      from: membershipFrom([
        { user_id: 'admin', org_object_id: 'ORG1', is_active: true },
        { user_id: 'target', org_object_id: 'ORG1', is_active: false },
      ]),
    } as never);
    mockedCreate.mockReturnValue(callerClient(false, 30) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('target');
  });

  it('un échec GoTrue ne fait plus fuiter son message anglais dans `delete_failed`', async () => {
    // `delete_failed` est dans `CODES_WITH_BUSINESS_DETAIL` (api-error.ts) : son `detail` est
    // affiché VERBATIM. Celui de GoTrue est anglais et nomme la couche interne en cause.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteUser = jest.fn().mockResolvedValue({ error: { message: 'Database error deleting user', status: 500 } });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'super' } }, error: null }),
        admin: { deleteUser },
      },
    } as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);

    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    const payload = await res.json();

    expect(res.status).toBe(500);
    expect(payload.error).toBe('delete_failed');
    expect(payload.detail).toBeUndefined();
    expect(readApiErrorMessage(payload, res.status)).toBe('La suppression a échoué.');
    expect(JSON.stringify(warn.mock.calls)).toContain('Database error deleting user'); // journal, pas écran
    warn.mockRestore();
  });

  it('200 pour un superuser ciblant un compte de N’IMPORTE QUELLE ORG (garde exemptée)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'super' } }, error: null }),
        admin: { deleteUser },
      },
    } as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'target' }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('target');
  });
});

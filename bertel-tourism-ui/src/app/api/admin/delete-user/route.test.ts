/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

// UUID v4-shaped (le format exact importe : la route rejette tout ce qui ne matche pas UUID_RE).
const ADMIN_RANK30 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CALLER_SUPERADMIN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CALLER_OWNER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const TARGET_ORDINARY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_OWNER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TARGET_SUPERADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TARGET_OTHER_ORG = '99999999-9999-4999-8999-999999999999';

function req(headers: Record<string, string>, body: unknown): never {
  return { headers: new Headers(headers), json: async () => body } as never;
}

/**
 * Client "en tant qu'appelant" : les deux premières valeurs en file servent aux sondes
 * d'`authorizeAdminRoute` (`is_platform_superuser`, `current_user_admin_rank`) ; une troisième,
 * si fournie, sert à la sonde `is_platform_owner` que la route appelle elle-même pour une cible
 * super_admin.
 */
function callerClient(isSuper: boolean, rank: number | null, isOwner?: boolean | null, ownerError?: string) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: isSuper, error: null })
    .mockResolvedValueOnce({ data: rank, error: null });
  if (isOwner !== undefined) rpc.mockResolvedValueOnce({ data: isOwner, error: ownerError ? { message: ownerError } : null });
  return { schema: () => ({ rpc }) };
}

/**
 * Client service-role : identité de l'appelant + lecture `app_user_profile.role` de la cible +
 * `deleteUser`. `deleteUser` résout TOUJOURS un succès par défaut — y compris dans les scénarios
 * de refus — pour que le test soit NON-VACUEUX : si la garde testée disparaissait, l'appel
 * réussirait silencieusement au lieu que le test échoue pour une raison sans rapport (mock manquant).
 */
function serverMock(
  callerId: string,
  opts: { role?: string | null; profileError?: string; missingProfileRow?: boolean; deleteUser?: jest.Mock } = {},
) {
  const deleteUser = opts.deleteUser ?? jest.fn().mockResolvedValue({ error: null });
  const maybeSingle = jest.fn().mockResolvedValue(
    opts.profileError
      ? { data: null, error: { message: opts.profileError } }
      : opts.missingProfileRow
        ? { data: null, error: null }
        : { data: { role: opts.role ?? null }, error: null },
  );
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: callerId } }, error: null }),
      admin: { deleteUser },
    },
    from,
  };
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

  it('403 when caller is neither superuser nor org_admin (garde authorizeAdminRoute inchangée)', async () => {
    mockedServer.mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: ADMIN_RANK30 } }, error: null }) } } as never);
    mockedCreate.mockReturnValue(callerClient(false, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_ORDINARY }));
    expect(res.status).toBe(403);
  });

  it('400 bad_json quand le corps n’est pas du JSON', async () => {
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const badReq = { headers: new Headers({ authorization: 'Bearer t' }), json: async () => { throw new Error('boom'); } } as never;
    const res = await POST(badReq);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_json');
  });

  it('400 bad_json quand le corps est null', async () => {
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_json');
  });

  it('400 bad_json quand le corps est un tableau', async () => {
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, [TARGET_ORDINARY]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_json');
  });

  it('422 invalid_user_id quand userId n’est pas un UUID', async () => {
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: 'not-a-uuid' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_user_id');
  });

  it('403 self_delete_forbidden quand admin cible son propre compte', async () => {
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: CALLER_SUPERADMIN }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('self_delete_forbidden');
  });

  it('403 self_delete_forbidden pour un UUID propre envoyé en MAJUSCULES (anti-self insensible à la casse)', async () => {
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: CALLER_SUPERADMIN.toUpperCase() }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('self_delete_forbidden');
  });

  it('403 platform_superuser_required : admin d’ORG rang 30 partageant l’ORG ACTIVE de la cible — deleteUser jamais appelée', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(ADMIN_RANK30, { deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(false, 30) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_ORDINARY }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('platform_superuser_required');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('403 platform_superuser_required : admin d’ORG rang 30 dont l’adhésion cible est INACTIVE dans une AUTRE ORG (ancien piège B) — deleteUser jamais appelée', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(ADMIN_RANK30, { deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(false, 30) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_OTHER_ORG }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('platform_superuser_required');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('500 target_profile_check_failed quand la lecture du profil cible échoue (fail-closed)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN, { profileError: 'boom', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_ORDINARY }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('target_profile_check_failed');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('500 target_profile_check_failed quand aucune ligne app_user_profile n’existe pour la cible (fail-closed)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN, { missingProfileRow: true, deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_ORDINARY }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('target_profile_check_failed');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('200 super_admin supprime un compte ORDINAIRE (role tourism_agent)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN, { role: 'tourism_agent', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_ORDINARY }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ORDINARY);
  });

  it('200 super_admin supprime un compte ORDINAIRE (role NULL — CHECK app_user_profile autorise NULL)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN, { role: null, deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_ORDINARY }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ORDINARY);
  });

  it('403 owner_delete_forbidden : un super_admin ne peut jamais supprimer un owner — deleteUser jamais appelée', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN, { role: 'owner', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_OWNER }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('owner_delete_forbidden');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('403 owner_delete_forbidden : même un owner appelant ne peut pas supprimer directement un owner cible — deleteUser jamais appelée', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_OWNER, { role: 'owner', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null, true) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_OWNER }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('owner_delete_forbidden');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('403 owner_required_for_super_admin_delete : un super_admin (non-owner) ne peut pas supprimer un super_admin — deleteUser jamais appelée', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_SUPERADMIN, { role: 'super_admin', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null, false) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_SUPERADMIN }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('owner_required_for_super_admin_delete');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('200 owner supprime un compte super_admin (is_platform_owner === true)', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_OWNER, { role: 'super_admin', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null, true) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_SUPERADMIN }));
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(TARGET_SUPERADMIN);
  });

  it.each([null, false, true])('refuse une sonde owner en erreur même si data vaut %s', async (isOwner) => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock(CALLER_OWNER, { role: 'super_admin', deleteUser }) as never);
    mockedCreate.mockReturnValue(callerClient(true, null, isOwner, 'RPC unavailable') as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { userId: TARGET_SUPERADMIN }));
    expect(res.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

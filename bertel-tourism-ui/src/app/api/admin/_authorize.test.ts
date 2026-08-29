/** @jest-environment node */
import { authorizeAdminRoute, sharesActiveOrg, sharesOrgIgnoringTargetActivity } from './_authorize';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

function req(headers: Record<string, string>): never {
  return { headers: new Headers(headers), url: 'https://app.test/api/admin/x' } as never;
}

/** Client "en tant qu'appelant" dont la sonde répond superuser / rang. */
function callerProbe(isSuper: unknown, rank: unknown) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: isSuper, error: null })
    .mockResolvedValueOnce({ data: rank, error: null });
  return { schema: () => ({ rpc }) };
}

function serverWithUser(id: string) {
  return { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id } }, error: null }) } };
}

describe('authorizeAdminRoute', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('500 quand la service key est absente', async () => {
    mockedServer.mockReturnValue(null);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(500);
  });

  it('401 sans en-tête Bearer', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    const auth = await authorizeAdminRoute(req({}));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it('401 quand le JWT ne résout aucun utilisateur', async () => {
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it('403 quand l’appelant n’est ni superuser ni admin de rang suffisant', async () => {
    mockedServer.mockReturnValue(serverWithUser('admin') as never);
    mockedCreate.mockReturnValue(callerProbe(false, 20) as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(403);
  });

  it('accepte un superuser et rend son identité', async () => {
    mockedServer.mockReturnValue(serverWithUser('admin') as never);
    mockedCreate.mockReturnValue(callerProbe(true, null) as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.callerId).toBe('admin');
      expect(auth.isSuper).toBe(true);
      expect(auth.rank).toBe(0);
    }
  });

  it('accepte un admin d’ORG de rang 30 sans statut superuser', async () => {
    mockedServer.mockReturnValue(serverWithUser('admin') as never);
    mockedCreate.mockReturnValue(callerProbe(false, 30) as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.isSuper).toBe(false);
      expect(auth.rank).toBe(30);
    }
  });
});

describe('sharesActiveOrg', () => {
  function serverWithMemberships(rows: Array<{ user_id: string; org_object_id: string }>) {
    const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
    const inFn = jest.fn().mockReturnValue({ eq });
    const select = jest.fn().mockReturnValue({ in: inFn });
    return { from: jest.fn().mockReturnValue({ select }) } as never;
  }

  it('vrai quand les deux comptes partagent une ORG active', async () => {
    const server = serverWithMemberships([
      { user_id: 'a', org_object_id: 'ORG1' },
      { user_id: 'b', org_object_id: 'ORG1' },
    ]);
    await expect(sharesActiveOrg(server, 'a', 'b')).resolves.toBe(true);
  });

  it('faux quand les ORG diffèrent', async () => {
    const server = serverWithMemberships([
      { user_id: 'a', org_object_id: 'ORG1' },
      { user_id: 'b', org_object_id: 'ORG2' },
    ]);
    await expect(sharesActiveOrg(server, 'a', 'b')).resolves.toBe(false);
  });

  it('faux quand la cible n’a aucun membership actif', async () => {
    const server = serverWithMemberships([{ user_id: 'a', org_object_id: 'ORG1' }]);
    await expect(sharesActiveOrg(server, 'a', 'b')).resolves.toBe(false);
  });
});

describe('sharesOrgIgnoringTargetActivity', () => {
  function serverWithMemberships(
    rows: Array<{ user_id: string; org_object_id: string; is_active: boolean }>,
  ) {
    const inFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    const select = jest.fn().mockReturnValue({ in: inFn });
    return { from: jest.fn().mockReturnValue({ select }) } as never;
  }

  it('vrai quand la cible a un membership DÉSACTIVÉ dans l’ORG où l’appelant est actif (piège B)', async () => {
    const server = serverWithMemberships([
      { user_id: 'admin', org_object_id: 'ORG1', is_active: true },
      { user_id: 'target', org_object_id: 'ORG1', is_active: false },
    ]);
    await expect(sharesOrgIgnoringTargetActivity(server, 'admin', 'target')).resolves.toBe(true);
  });

  it('vrai quand les deux comptes sont actifs dans la même ORG', async () => {
    const server = serverWithMemberships([
      { user_id: 'admin', org_object_id: 'ORG1', is_active: true },
      { user_id: 'target', org_object_id: 'ORG1', is_active: true },
    ]);
    await expect(sharesOrgIgnoringTargetActivity(server, 'admin', 'target')).resolves.toBe(true);
  });

  it('faux quand l’appelant n’est PAS actif dans l’ORG partagée (l’asymétrie ne joue que pour la cible)', async () => {
    const server = serverWithMemberships([
      { user_id: 'admin', org_object_id: 'ORG1', is_active: false },
      { user_id: 'target', org_object_id: 'ORG1', is_active: false },
    ]);
    await expect(sharesOrgIgnoringTargetActivity(server, 'admin', 'target')).resolves.toBe(false);
  });

  it('faux quand les ORG diffèrent', async () => {
    const server = serverWithMemberships([
      { user_id: 'admin', org_object_id: 'ORG1', is_active: true },
      { user_id: 'target', org_object_id: 'ORG2', is_active: false },
    ]);
    await expect(sharesOrgIgnoringTargetActivity(server, 'admin', 'target')).resolves.toBe(false);
  });

  it('faux quand la lecture échoue (fail-closed)', async () => {
    const inFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const select = jest.fn().mockReturnValue({ in: inFn });
    const server = { from: jest.fn().mockReturnValue({ select }) } as never;
    await expect(sharesOrgIgnoringTargetActivity(server, 'admin', 'target')).resolves.toBe(false);
  });
});

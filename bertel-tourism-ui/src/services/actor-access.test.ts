import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { canManageActorPortalAccess, invitePortalAccess, resendPortalAccess, revokePortalAccess } from './actor-access';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  (getSupabaseClient as jest.Mock).mockReturnValue({
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }) },
  });
});

afterAll(() => { global.fetch = originalFetch; });

it.each([
  [true, null, true], [false, null, false], [null, null, false],
  [undefined, null, false], [true, { message: 'unavailable' }, false],
])('permission RPC data=%s error=%s gives %s', async (data, error, allowed) => {
  const rpc = jest.fn().mockResolvedValue({ data, error });
  const schema = jest.fn().mockReturnValue({ rpc });
  (getApiClient as jest.Mock).mockReturnValue({ schema });
  await expect(canManageActorPortalAccess()).resolves.toBe(allowed);
  expect(schema).toHaveBeenCalledWith('api');
  expect(rpc).toHaveBeenCalledWith('current_user_can_manage_actor_portal');
});

it('hides access when the permission request throws', async () => {
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc: jest.fn().mockRejectedValue(new Error('offline')) }) });
  await expect(canManageActorPortalAccess()).resolves.toBe(false);
});

it.each([
  ['invite', () => invitePortalAccess('actor-1', 'partner@example.test')],
  ['resend', () => resendPortalAccess('actor-1', 'partner@example.test')],
  ['revoke', () => revokePortalAccess('actor-1')],
] as const)('%s preserves the missing CRM trace through the real service', async (action, invoke) => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ traced: false }) });

  await expect(invoke()).resolves.toEqual({ traced: false });
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/crm/actor-access');
  expect(JSON.parse(request.body)).toEqual({
    action,
    actorId: 'actor-1',
    ...(action === 'revoke' ? {} : { email: 'partner@example.test' }),
  });
});

it('explains that a failed resend has removed the previous access', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: 'resend_lost_previous' }),
  });

  await expect(resendPortalAccess('actor-1', 'partner@example.test')).rejects.toThrow(
    'L’ancien accès a été fermé mais le nouveau n’a pas pu être créé — relancez l’invitation.',
  );
});

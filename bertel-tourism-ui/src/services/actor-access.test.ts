import { getSupabaseClient } from '../lib/supabase';
import { invitePortalAccess, resendPortalAccess, revokePortalAccess } from './actor-access';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

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

/** @jest-environment node */
import { queryClient } from '../app/query-client';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { getServiceAvailability, invalidateServiceAvailability, UNAVAILABLE_SERVICES } from './service-availability';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);
const session = { access_token: 'token', user: { id: 'user-a' } };

function ready(userId = 'user-a') {
  useSessionStore.setState({ status: 'ready', userId, orgId: 'org-a', isTestRealm: false, demoMode: false });
}

beforeEach(() => {
  queryClient.clear();
  (session.user as { id: string }).id = 'user-a';
  ready();
  mockedClient.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }) } } as never);
  global.fetch = jest.fn() as unknown as typeof fetch;
});

afterEach(() => {
  queryClient.clear();
  useSessionStore.setState({ status: 'guest', userId: null, orgId: null, demoMode: false });
});

it('fails closed on an availability endpoint error', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));
  await expect(getServiceAvailability()).resolves.toEqual(UNAVAILABLE_SERVICES);
});

it('scopes cached availability to the authenticated user', async () => {
  jest.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ translation: true, imageAnalysis: true, email: false })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ translation: false, imageAnalysis: false, email: true })));
  await expect(getServiceAvailability()).resolves.toEqual({ translation: true, imageAnalysis: true, email: false });
  ready('user-b');
  (session.user as { id: string }).id = 'user-b';
  await expect(getServiceAvailability()).resolves.toEqual({ translation: false, imageAnalysis: false, email: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('purges a true result across logout and same-user login before the next refetch', async () => {
  jest.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ translation: true, imageAnalysis: true, email: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ translation: false, imageAnalysis: false, email: false })));
  await expect(getServiceAvailability()).resolves.toEqual({ translation: true, imageAnalysis: true, email: true });

  useSessionStore.setState({ status: 'guest', userId: null, orgId: null, demoMode: false });
  ready('user-a');
  await expect(getServiceAvailability()).resolves.toEqual(UNAVAILABLE_SERVICES);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not let an in-flight response re-enable services after invalidation', async () => {
  let resolve!: (response: Response) => void;
  jest.mocked(fetch).mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
  const pending = getServiceAvailability({ force: true });
  await Promise.resolve();
  await Promise.resolve();
  invalidateServiceAvailability();
  resolve(new Response(JSON.stringify({ translation: true, imageAnalysis: true, email: true })));
  await expect(pending).resolves.toEqual(UNAVAILABLE_SERVICES);
});

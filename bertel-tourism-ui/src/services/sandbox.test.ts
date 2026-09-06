import { createClient } from '@supabase/supabase-js';
import { enterSandbox, leaveSandbox } from './sandbox';
import { SANDBOX_AUTH_KEY, SANDBOX_MODE_KEY } from '@/lib/sandbox-mode';
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/env', () => ({ hasSupabaseConfig: true, env: { supabaseUrl: 'https://project.test', supabaseAnonKey: 'public-key' } }));
const originalFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); global.fetch = fetchMock; });
afterAll(() => { global.fetch = originalFetch; });
function setup({ marker = true, realm = true } = {}) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: 'test-access', refresh_token: 'test-refresh' }) });
  const setSession = jest.fn().mockResolvedValue({ data: { user: { app_metadata: { sandbox_discovery: marker } } }, error: null });
  const rpc = jest.fn().mockResolvedValue({ data: realm, error: null });
  jest.mocked(createClient).mockReturnValue({ auth: { setSession }, schema: () => ({ rpc }) } as never);
  return { setSession, rpc };
}
it('stores the verified sandbox session separately from the working session', async () => {
  const { setSession } = setup();
  localStorage.setItem('working-session-fixture', 'keep-me');
  await enterSandbox();
  expect(fetchMock).toHaveBeenCalledWith('/api/sandbox/session', { method: 'POST', cache: 'no-store' });
  expect(createClient).toHaveBeenCalledWith('https://project.test', 'public-key', expect.objectContaining({ auth: expect.objectContaining({ storageKey: SANDBOX_AUTH_KEY, storage: sessionStorage }) }));
  expect(setSession).toHaveBeenCalledWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
  expect(sessionStorage.getItem(SANDBOX_MODE_KEY)).toBe('true');
  leaveSandbox();
  expect(sessionStorage.getItem(SANDBOX_MODE_KEY)).toBeNull();
  expect(localStorage.getItem('working-session-fixture')).toBe('keep-me');
  localStorage.removeItem('working-session-fixture');
});
it.each([{ marker: false }, { realm: false }])('does not activate test mode without verified isolation: %p', async (options) => {
  setup(options);
  await expect(enterSandbox()).rejects.toThrow();
  expect(sessionStorage.getItem(SANDBOX_MODE_KEY)).toBeNull();
});
it('shares a single request between concurrent mounts', async () => {
  setup();
  await Promise.all([enterSandbox(), enterSandbox()]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('does not create a local session when the server refuses entry', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  await expect(enterSandbox()).rejects.toThrow('indisponible');
  expect(createClient).not.toHaveBeenCalled();
});

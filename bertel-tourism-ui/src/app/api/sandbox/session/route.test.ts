/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from './route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
const USER = '00000000-0000-4000-a000-00000000dc01';
let requestNumber = 0;
function request(ip = `test-${++requestNumber}`) {
  return new NextRequest('https://bertel.re/api/sandbox/session', { method: 'POST', headers: { 'x-real-ip': ip } });
}
function setup({ existing = true, safe = true, rpcError = false } = {}) {
  let provisioned = existing;
  const rpc = jest.fn(async (name: string) => {
    if (rpcError) return { data: null, error: { message: 'unsafe identity' } };
    if (name === 'configure_sandbox_discovery_user') { provisioned = true; return { data: USER, error: null }; }
    if (name === 'get_sandbox_discovery_user') return { data: provisioned ? USER : null, error: null };
    throw new Error(`Unexpected ${name}`);
  });
  const user = { id: USER, email: 'discovery-fixture@sandbox.bertel.invalid', app_metadata: { sandbox_discovery: safe } };
  const admin = {
    createUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    getUserById: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    generateLink: jest.fn().mockResolvedValue({ data: { user, properties: { hashed_token: 'one-time-token' } }, error: null }),
  };
  const verifyOtp = jest.fn().mockResolvedValue({ data: { session: { user, access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null });
  jest.mocked(getServerSupabaseClient).mockReturnValue({ schema: () => ({ rpc }), auth: { admin } } as never);
  jest.mocked(createClient).mockReturnValue({ auth: { verifyOtp } } as never);
  return { rpc, admin, verifyOtp };
}
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
});

it('opens discovery without account credentials, emitting only the restricted session', async () => {
  const { admin, verifyOtp } = setup();
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(await response.json()).toEqual({ access_token: 'test-access', refresh_token: 'test-refresh' });
  expect(admin.createUser).not.toHaveBeenCalled();
  expect(admin.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'discovery-fixture@sandbox.bertel.invalid' });
  expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'one-time-token', type: 'magiclink' });
  expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'public-key', expect.any(Object));
});

it('provisions the fixed test scope before minting the first session', async () => {
  const { rpc, admin } = setup({ existing: false });
  expect((await POST(request())).status).toBe(200);
  expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true, app_metadata: { sandbox_discovery: true } }));
  expect(rpc).toHaveBeenCalledWith('configure_sandbox_discovery_user', { p_user_id: USER });
  expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(admin.generateLink.mock.invocationCallOrder[0]);
});

it.each([{ safe: false }, { rpcError: true }])('never issues a link when identity validation fails: %p', async (options) => {
  const { admin } = setup(options);
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'sandbox_unavailable' });
  expect(admin.generateLink).not.toHaveBeenCalled();
});

it('refuses a link resolving to a different user', async () => {
  const { admin, verifyOtp } = setup();
  admin.generateLink.mockResolvedValue({ data: { user: { id: 'staff' }, properties: { hashed_token: 'wrong' } }, error: null });
  expect((await POST(request())).status).toBe(503);
  expect(verifyOtp).not.toHaveBeenCalled();
});

it('bounds repeated public requests before invoking Auth', async () => {
  const { admin } = setup();
  for (let index = 0; index < 20; index++) await POST(request('repeated-ip'));
  admin.generateLink.mockClear();
  const response = await POST(request('repeated-ip'));
  expect(response.status).toBe(429);
  expect(admin.generateLink).not.toHaveBeenCalled();
});

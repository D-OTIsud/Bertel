/** @jest-environment node */
jest.mock('server-only', () => ({}));
import type { NextRequest } from 'next/server';
import { POST as translate } from '../ai/translate/route';
import { POST as extract } from '../menu/extract/route';
import { POST as sendList } from '../lists/send/route';
import { POST as drain } from '../crm/notify-drain/route';
import { POST as testAi } from '../admin/ai-config/test/route';
import { POST as invite } from '../admin/invite/route';
import { POST as actorAccess } from '../crm/actor-access/route';
import { GET as availability } from '../service-availability/route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createCallerClient } from '@/lib/supabase-caller.server';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { resolveSmtpConfig } from '@/lib/smtp-settings.server';
import { isSandboxDiscoveryUser } from '@/lib/sandbox-effects';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: jest.fn() }));
jest.mock('@/lib/ai-provider.server', () => ({ resolveActiveAiProvider: jest.fn() }));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: jest.fn() }));
jest.mock('@/lib/mail.server', () => ({ sendListEmail: jest.fn(), sendMail: jest.fn(), MailNotConfiguredError: class extends Error {} }));

const server = { auth: { getUser: jest.fn(), admin: { inviteUserByEmail: jest.fn(), deleteUser: jest.fn() } }, schema: jest.fn() };
const callerRpc = jest.fn();
function request(body?: unknown): NextRequest {
  return { headers: new Headers({ authorization: 'Bearer verified-token' }),
    json: jest.fn(body === undefined ? () => { throw Error('body must not be read'); } : async () => body),
  } as unknown as NextRequest;
}
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon';
  server.auth.getUser.mockResolvedValue({ data: { user: {
    id: 'sandbox-user', app_metadata: { sandbox_discovery: true }, user_metadata: { sandbox_discovery: false },
  } }, error: null });
  jest.mocked(getServerSupabaseClient).mockReturnValue(server as never);
  callerRpc.mockResolvedValue({ data: true, error: null });
  jest.mocked(createCallerClient).mockReturnValue({ schema: () => ({ rpc: callerRpc }) } as never);
});

test.each([['translation',translate],['menu extraction',extract],['notification drain',drain],['AI connection test',testAi]] as const)
  ('discovery cannot invoke %s, even with an existing valid session', async (_name, handler) => {
    const req=request();
    const result=await handler(req);
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ error: 'sandbox_external_effects_disabled' });
    expect(req.json).not.toHaveBeenCalled();
    expect(server.schema).not.toHaveBeenCalled();
    expect(createCallerClient).not.toHaveBeenCalled();
    expect(resolveActiveAiProvider).not.toHaveBeenCalled();
    expect(resolveSmtpConfig).not.toHaveBeenCalled();
  });

test('the closed bridge refuses manual email before even reading the discovery session', async () => {
  const req = request();
  const result = await sendList(req);
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ error: 'email_protection_unavailable' });
  expect(getServerSupabaseClient).not.toHaveBeenCalled();
  expect(req.json).not.toHaveBeenCalled();
  expect(server.schema).not.toHaveBeenCalled();
  expect(createCallerClient).not.toHaveBeenCalled();
  expect(resolveSmtpConfig).not.toHaveBeenCalled();
});

test('discovery service availability stays off without reading provider or SMTP settings', async () => {
  const result=await availability(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ translation:false,imageAnalysis:false,email:false });
  expect(resolveActiveAiProvider).not.toHaveBeenCalled();
  expect(resolveSmtpConfig).not.toHaveBeenCalled();
});

test('even a discovery identity with an otherwise successful admin gate cannot send an invitation', async () => {
  const result=await invite(request());
  expect(result.status).toBe(403);
  expect(server.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  expect(server.auth.admin.deleteUser).not.toHaveBeenCalled();
});

test.each(['invite','resend'])('discovery cannot %s a portal invitation', async (action) => {
  const result=await actorAccess(request({ action,actorId:'00000000-0000-4000-a000-000000000001' }));
  expect(result.status).toBe(403);
  expect(await result.json()).toMatchObject({ error:'sandbox_external_effects_disabled' });
  expect(server.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  expect(server.auth.admin.deleteUser).not.toHaveBeenCalled();
  expect(createCallerClient).not.toHaveBeenCalled();
});

test('only trusted application metadata defines the discovery restriction', () => {
  expect(isSandboxDiscoveryUser({ app_metadata:{sandbox_discovery:true} })).toBe(true);
  expect(isSandboxDiscoveryUser({ app_metadata:{sandbox_discovery:false} })).toBe(false);
  expect(isSandboxDiscoveryUser({})).toBe(false);
  expect(isSandboxDiscoveryUser({ user_metadata:{sandbox_discovery:true} } as never)).toBe(false);
});

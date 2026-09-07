/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/env.server', () => ({ readSmtpConfig: jest.fn(() => null) }));
jest.mock('@/lib/mail.server', () => ({ verifySmtpConnection: jest.fn() }));
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { verifySmtpConnection } from '@/lib/mail.server';
import { GET, PUT } from './route';
import { POST } from './test/route';

const rpc = jest.fn();
const getUser = jest.fn();
const row = { enabled: true, host: 'smtp.example.com', port: 587, secure: false, from_email: 'mail@example.com', from_name: 'Bertel', auth_mode: 'password', username: 'user', has_password: true, updated_at: '2026-09-06', password: 'never-return-me' };
const input = { enabled: true, host: row.host, port: 587, secure: false, fromEmail: row.from_email, fromName: 'Bertel', authMode: 'password', user: 'user' };
function req(method = 'GET', body?: unknown, token = 'valid') {
  return new NextRequest('http://localhost/api/admin/smtp-config', { method, headers: token ? { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  jest.mocked(getServerSupabaseClient).mockReturnValue({ auth: { getUser } } as never);
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'is_platform_superuser' ? true : name === 'get_smtp_config' ? [row] : null, error: null }));
});

it('all three endpoints reject missing authentication before touching SMTP', async () => {
  for (const action of [GET, PUT, POST]) expect((await action(req('POST', undefined, ''))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
  expect(verifySmtpConnection).not.toHaveBeenCalled();
});

it('rejects an invalid session', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
  expect((await GET(req())).status).toBe(401);
});

it.each([false, null, 'true'])('rejects non-super-admin authorization %s, including organization admins', async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  expect((await PUT(req('PUT', input))).status).toBe(403);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('fails closed when the admin probe returns true with an error', async () => {
  rpc.mockResolvedValue({ data: true, error: { message: 'unavailable' } });
  expect((await POST(req('POST'))).status).toBe(403);
  expect(verifySmtpConnection).not.toHaveBeenCalled();
});

it('returns sanitized metadata and marks the response non-cacheable', async () => {
  const response = await GET(req());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).not.toContain('never-return-me');
});

it('retains an existing password when omitted on the same saved account', async () => {
  const response = await PUT(req('PUT', input));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('upsert_smtp_config', expect.objectContaining({ p_password: null, p_username: 'user' }));
  expect(await response.text()).not.toContain('never-return-me');
});

it('requires fresh credentials for a new host/account', async () => {
  expect((await PUT(req('PUT', { ...input, host: 'other.example.com' }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalledWith('upsert_smtp_config', expect.anything());
});

it('sends a new password only to the protected RPC and never echoes it', async () => {
  const response = await PUT(req('PUT', { ...input, password: 'new-secret' }));
  expect(rpc).toHaveBeenCalledWith('upsert_smtp_config', expect.objectContaining({ p_password: 'new-secret' }));
  expect(await response.text()).not.toContain('new-secret');
});

it('clears credentials explicitly in relay mode', async () => {
  expect((await PUT(req('PUT', { ...input, authMode: 'relay' }))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('upsert_smtp_config', expect.objectContaining({ p_auth_mode: 'relay', p_password: null, p_username: null }));
});

it('does not expose raw database errors', async () => {
  rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'is_platform_superuser' ? true : null, error: name === 'is_platform_superuser' ? null : { code: 'XX000', message: 'sensitive-server-error' } }));
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('sensitive-server-error');
});

it('only tests the saved configuration after authorization', async () => {
  jest.mocked(verifySmtpConnection).mockResolvedValue({ ok: true, detail: 'Connexion réussie' });
  const response = await POST(req('POST'));
  expect(await response.json()).toEqual({ ok: true, detail: 'Connexion réussie' });
  expect(verifySmtpConnection).toHaveBeenCalledTimes(1);
});

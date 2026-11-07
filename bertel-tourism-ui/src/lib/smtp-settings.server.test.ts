/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('./env.server', () => ({ readSmtpConfig: jest.fn() }));
import { getServerSupabaseClient } from './supabase-server';
import { readSmtpConfig } from './env.server';
import { readAdminSmtpSettings, resolveSmtpConfig, smtpSettingsInputSchema } from './smtp-settings.server';

const rpc = jest.fn();
const client = { schema: jest.fn(() => ({ rpc })) };
const env = { host: 'env.example.com', port: 587, secure: false, fromEmail: 'mail@example.com', fromName: 'Bertel', user: null, pass: null };
const row = { enabled: true, host: 'db.example.com', port: 465, secure: true, from_email: 'saved@example.com', from_name: 'Saved', auth_mode: 'password', username: 'smtp-user', has_password: true, password: 'vault-password', updated_at: '2026-09-06' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getServerSupabaseClient).mockReturnValue(client as never);
  jest.mocked(readSmtpConfig).mockReturnValue(env);
});

it('uses saved host/password instead of environment for all mail senders', async () => {
  rpc.mockResolvedValue({ data: [row], error: null });
  await expect(resolveSmtpConfig()).resolves.toEqual({ host: row.host, port: 465, secure: true, fromEmail: row.from_email, fromName: 'Saved', user: 'smtp-user', pass: 'vault-password' });
  expect(rpc).toHaveBeenCalledWith('get_smtp_config_secret');
});

it('a saved disabled setting suspends sending even with a configured environment', async () => {
  rpc.mockResolvedValue({ data: [{ ...row, enabled: false }], error: null });
  await expect(resolveSmtpConfig()).resolves.toBeNull();
});

it('supports environment fallback while the migration is absent', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find api.get_smtp_config_secret()' } });
  await expect(resolveSmtpConfig()).resolves.toEqual(env);
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find api.get_smtp_config()' } });
  await expect(readAdminSmtpSettings(client as never)).resolves.toEqual(expect.objectContaining({ source: 'environment', editable: false }));
});

it('a database/Vault error fails closed without silently changing the relay', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'vault failed; secret details' } });
  await expect(resolveSmtpConfig()).rejects.toThrow('Les paramètres SMTP sont indisponibles');
  await expect(readAdminSmtpSettings(client as never)).rejects.not.toThrow('secret details');
});

it('an empty database exposes environment metadata and allows saving', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(resolveSmtpConfig()).resolves.toEqual(env);
  await expect(readAdminSmtpSettings(client as never)).resolves.toEqual(expect.objectContaining({ source: 'environment', editable: true }));
});

it('whitelists public fields even if an unexpected secret is returned by the management RPC', async () => {
  rpc.mockResolvedValue({ data: [{ ...row, password_secret_id: 'secret-id' }], error: null });
  const response = await readAdminSmtpSettings(client as never);
  expect(response.hasPassword).toBe(true);
  expect(JSON.stringify(response)).not.toMatch(/vault-password|secret-id|password_secret_id/);
  expect(response).not.toHaveProperty('password');
});

it('never downgrades an incomplete password authentication to an IP relay', async () => {
  rpc.mockResolvedValue({ data: [{ ...row, password: null }], error: null });
  await expect(resolveSmtpConfig()).rejects.toThrow('identifiants SMTP enregistrés sont incomplets');
  rpc.mockResolvedValue({ data: [], error: null });
  jest.mocked(readSmtpConfig).mockReturnValue({ ...env, user: 'missing-password' });
  await expect(resolveSmtpConfig()).rejects.toThrow('identifiants SMTP du serveur sont incomplets');
});

it('rejects malformed ports, URLs, header injection and password mode without a user', () => {
  const good = { enabled: true, host: 'smtp.example.com', port: 587, secure: false, fromEmail: 'mail@example.com', fromName: 'Bertel', authMode: 'relay', user: '' };
  expect(smtpSettingsInputSchema.safeParse(good).success).toBe(true);
  for (const invalid of [{ port: 0 }, { port: 65536 }, { host: 'https://smtp.example.com/path' }, { fromName: 'Mail\r\nBcc: stolen@example.com' }, { authMode: 'password' }]) {
    expect(smtpSettingsInputSchema.safeParse({ ...good, ...invalid }).success).toBe(false);
  }
});

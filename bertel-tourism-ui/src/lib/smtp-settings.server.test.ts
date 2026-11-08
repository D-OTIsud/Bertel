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

describe('manual list e-mail limits', () => {
  const good = { enabled: true, host: 'smtp.example.com', port: 587, secure: false, fromEmail: 'mail@example.com', fromName: 'Bertel', authMode: 'relay', user: '' };

  it('exposes stored limits through the whitelist without their database names', async () => {
    rpc.mockResolvedValue({ data: [{ ...row, manual_max_per_minute: 25, manual_max_per_24h: 2000 }], error: null });
    const response = await readAdminSmtpSettings(client as never);
    expect(response).toMatchObject({ manualMaxPerMinute: 25, manualMaxPer24h: 2000 });
    expect(JSON.stringify(response)).not.toMatch(/manual_max|vault-password/);
  });

  it.each([
    { name: 'old schema', limits: {} },
    { name: 'invalid values', limits: { manual_max_per_minute: 0, manual_max_per_24h: '2000' } },
  ])('reports the defaults for a saved row with $name', async ({ limits }) => {
    rpc.mockResolvedValue({ data: [{ ...row, ...limits }], error: null });
    await expect(readAdminSmtpSettings(client as never)).resolves.toMatchObject({ manualMaxPerMinute: 10, manualMaxPer24h: 1000 });
  });

  it('reports the defaults for the environment and no-row fallbacks', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(readAdminSmtpSettings(client as never)).resolves.toMatchObject({ source: 'environment', manualMaxPerMinute: 10, manualMaxPer24h: 1000 });
    jest.mocked(readSmtpConfig).mockReturnValue(null);
    await expect(readAdminSmtpSettings(client as never)).resolves.toMatchObject({ source: 'none', manualMaxPerMinute: 10, manualMaxPer24h: 1000 });
  });

  it('leaves the SMTP secret reader output unchanged', async () => {
    rpc.mockResolvedValue({ data: [{ ...row, manual_max_per_minute: 25, manual_max_per_24h: 2000 }], error: null });
    await expect(resolveSmtpConfig()).resolves.toEqual({ host: row.host, port: 465, secure: true, fromEmail: row.from_email, fromName: 'Saved', user: 'smtp-user', pass: 'vault-password' });
  });

  it('keeps absent limits absent and accepts valid supplied limits', () => {
    const absent = smtpSettingsInputSchema.parse(good);
    expect(absent).not.toHaveProperty('manualMaxPerMinute');
    expect(absent).not.toHaveProperty('manualMaxPer24h');
    expect(smtpSettingsInputSchema.parse({ ...good, manualMaxPerMinute: 1, manualMaxPer24h: 2147483647 }))
      .toMatchObject({ manualMaxPerMinute: 1, manualMaxPer24h: 2147483647 });
  });

  it.each(['manualMaxPerMinute', 'manualMaxPer24h'].flatMap((field) => (
    [0, -1, 1.5, '10', null, 2147483648, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN].map((value) => [field, value] as const)
  )))('rejects %s=%s', (field, value) => {
    const parsed = smtpSettingsInputSchema.safeParse({ ...good, [field]: value });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Indiquez un nombre entier supérieur ou égal à 1.');
  });
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

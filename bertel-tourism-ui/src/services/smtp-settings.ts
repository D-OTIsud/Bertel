import { invalidateServiceAvailability } from './service-availability';

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  authMode: 'relay' | 'password';
  user: string;
  hasPassword: boolean;
  source: 'database' | 'environment' | 'none';
  configured: boolean;
  editable: boolean;
  updatedAt: string | null;
  /** Manual list e-mail only: messages per rolling 60 seconds, across all lists and instances. */
  manualMaxPerMinute: number;
  /** Manual list e-mail only: messages per rolling 24 hours, across all lists and instances. */
  manualMaxPer24h: number;
}

export interface SmtpSettingsInput {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  authMode: 'relay' | 'password';
  user: string;
  /** Write-only. Empty/omitted keeps the saved password; relay mode deletes it. */
  password?: string;
  /** Omitted keeps the stored limit, so an older client can never reset it. */
  manualMaxPerMinute?: number;
  /** Omitted keeps the stored limit, so an older client can never reset it. */
  manualMaxPer24h?: number;
}

async function request<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/admin/smtp-config${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? 'Les paramètres SMTP sont indisponibles.');
  return payload as T;
}

export function getSmtpSettings(accessToken: string): Promise<SmtpSettings> {
  return request(accessToken, '');
}

export async function saveSmtpSettings(accessToken: string, input: SmtpSettingsInput): Promise<SmtpSettings> {
  const settings = await request<SmtpSettings>(accessToken, '', { method: 'PUT', body: JSON.stringify(input) });
  invalidateServiceAvailability();
  return settings;
}

/** Verifies the saved server/authentication without sending a message. */
export function testSmtpConnection(accessToken: string): Promise<{ ok: boolean; detail: string }> {
  return request(accessToken, '/test', { method: 'POST' });
}

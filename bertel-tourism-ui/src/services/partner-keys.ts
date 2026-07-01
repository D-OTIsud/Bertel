import { getSupabaseClient } from '../lib/supabase';

/**
 * Super-admin client for partner API keys (audit API R1a/R1b). Calls the SECURITY DEFINER RPCs
 * (superuser-gated server-side). The raw key is WRITE-ONCE: returned only by `issuePartnerKey`
 * at creation and NEVER read back — `listPartnerKeys` returns metadata + prefix only.
 */

export interface PartnerKey {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Returned only at creation — the raw `bk_live_…` key is never retrievable again. */
export interface IssuedPartnerKey {
  id: string;
  apiKey: string;
  keyPrefix: string;
  label: string;
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Connexion backend indisponible.');
  return c.schema('api');
}

function rowToKey(raw: Record<string, unknown>): PartnerKey {
  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    keyPrefix: String(raw.key_prefix ?? ''),
    scopes: Array.isArray(raw.scopes) ? (raw.scopes as string[]) : [],
    isActive: Boolean(raw.is_active),
    expiresAt: (raw.expires_at as string | null) ?? null,
    revokedAt: (raw.revoked_at as string | null) ?? null,
    lastUsedAt: (raw.last_used_at as string | null) ?? null,
    createdAt: String(raw.created_at ?? ''),
  };
}

export async function listPartnerKeys(): Promise<PartnerKey[]> {
  const { data, error } = await client().rpc('list_partner_keys');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(rowToKey);
}

export async function issuePartnerKey(
  label: string,
  scopes: string[] = [],
  expiresAt: string | null = null,
): Promise<IssuedPartnerKey> {
  const { data, error } = await client().rpc('rpc_issue_partner_key', {
    p_label: label,
    p_scopes: scopes,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    apiKey: String(row.api_key ?? ''),
    keyPrefix: String(row.key_prefix ?? ''),
    label: String(row.label ?? label),
  };
}

export async function revokePartnerKey(id: string): Promise<boolean> {
  const { data, error } = await client().rpc('rpc_revoke_partner_key', { p_id: id });
  if (error) throw new Error(error.message);
  return Boolean((data as Record<string, unknown> | null)?.revoked);
}

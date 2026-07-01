import 'server-only';
import { createHash } from 'node:crypto';
import { getServerSupabaseClient } from './supabase-server';

/**
 * Partner API-key authentication for the public `/api/public/*` surface (audit API R1b).
 *
 * The raw key `bk_live_…` arrives in the Authorization header. We compute its SHA-256
 * HERE (Node) and only ever send the HASH to the DB (`api.partner_authenticate`) — the
 * raw key never touches Postgres, and is NEVER logged (security review R1a, MEDIUM #1).
 */

// Issued shape: 'bk_live_' + hex(gen_random_bytes(24)) = 'bk_live_' + 48 lowercase hex.
const PARTNER_KEY_RE = /^bk_live_[0-9a-f]{48}$/;
const MAX_LOG_PATH = 200; // truncate before logging (security review R1a, MEDIUM #2)

export interface PartnerIdentity {
  keyId: string;
  label: string;
  scopes: string[];
}

/** Pull the raw partner key out of an `Authorization: Bearer bk_live_…` header. Never log the result. */
export function extractPartnerKey(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  const raw = trimmed.startsWith('Bearer ') ? trimmed.slice('Bearer '.length).trim() : trimmed;
  return PARTNER_KEY_RE.test(raw) ? raw : null;
}

/** SHA-256 hex of the raw key — MUST match Postgres `encode(digest(key,'sha256'),'hex')`. */
export function hashPartnerKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/**
 * Authenticate a partner request. Returns the identity, or null if the key is missing,
 * malformed, unknown, revoked or expired. Fail-closed on any error.
 */
export async function authenticatePartner(authHeader: string | null | undefined): Promise<PartnerIdentity | null> {
  const rawKey = extractPartnerKey(authHeader);
  if (!rawKey) return null;

  const server = getServerSupabaseClient();
  if (!server) return null;

  try {
    const { data, error } = await server
      .schema('api')
      .rpc('partner_authenticate', { p_key_hash: hashPartnerKey(rawKey) });
    if (error || !data || typeof data !== 'object') return null;
    const row = data as { ok?: boolean; id?: string; label?: string; scopes?: unknown };
    if (row.ok !== true || !row.id) return null;
    return {
      keyId: row.id,
      label: typeof row.label === 'string' ? row.label : '',
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    };
  } catch {
    return null;
  }
}

/** Best-effort audit log of a partner call. Path is truncated. NEVER throws (logging must not fail a request). */
export async function logPartnerCall(keyId: string, path: string, status: number): Promise<void> {
  try {
    const server = getServerSupabaseClient();
    if (!server) return;
    await server.schema('api').rpc('partner_log_call', {
      p_key_id: keyId,
      p_path: path.slice(0, MAX_LOG_PATH),
      p_status: status,
    });
  } catch {
    /* best-effort */
  }
}

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

export interface RateVerdict {
  allowed: boolean;
  retryAfter: number;
  limit: number;
  remaining: number;
}

/**
 * Fixed-window rate check for a partner key (audit API R2). FAIL-OPEN: an abuse limiter must not
 * block legitimate traffic if the DB call fails — access is already gated by authenticatePartner
 * (which is fail-closed). Returns {allowed:true} on any infra error.
 *
 * Also surfaces `limit`/`remaining` so routes can emit `X-RateLimit-Limit`/`X-RateLimit-Remaining`
 * (partners self-throttle before hitting the 429). On fail-open, `remaining` optimistically = limit.
 */
export async function checkPartnerRate(keyId: string, limit = 120, windowSeconds = 60): Promise<RateVerdict> {
  try {
    const server = getServerSupabaseClient();
    if (!server) return { allowed: true, retryAfter: 0, limit, remaining: limit };
    const { data, error } = await server.schema('api').rpc('partner_rate_check', {
      p_key_id: keyId,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error || !data || typeof data !== 'object') return { allowed: true, retryAfter: 0, limit, remaining: limit };
    const row = data as { allowed?: boolean; retry_after?: number; remaining?: number };
    const allowed = row.allowed !== false;
    return {
      allowed,
      retryAfter: Number(row.retry_after ?? windowSeconds),
      limit,
      remaining: Math.max(0, Number(row.remaining ?? (allowed ? limit : 0))),
    };
  } catch {
    return { allowed: true, retryAfter: 0, limit, remaining: limit };
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

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AiRequestRoute = 'translate' | 'menu_extract';
type Admission = { allowed: boolean; remaining: number; retryAfter: number };

export class AiAdmissionUnavailableError extends Error {
  constructor() { super('AI request admission unavailable'); }
}

/** Service client and verified Auth user only; no fallback counter or fail-open. */
export async function admitAiRequest(server: SupabaseClient, userId: string, route: AiRequestRoute, signal?: AbortSignal): Promise<Admission> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  // Bound this short admission independently of the much slower provider call.
  // An uncertain timeout may have consumed one slot; it never starts paid work.
  const timeout = setTimeout(abort, 5_000);
  try {
    const { data, error } = await server.schema('api').rpc('admit_ai_request', { p_user_id: userId, p_route: route }).abortSignal(controller.signal);
    if (controller.signal.aborted || error || !data || typeof data !== 'object' || Array.isArray(data)) throw new AiAdmissionUnavailableError();
    const row = data as Record<string, unknown>;
    if (typeof row.allowed !== 'boolean'
      || !Number.isInteger(row.remaining) || (row.remaining as number) < 0 || (row.remaining as number) > 11
      || !Number.isInteger(row.retry_after) || (row.retry_after as number) < 0 || (row.retry_after as number) > 60
      || (row.allowed ? row.retry_after !== 0 : row.remaining !== 0 || row.retry_after === 0)) {
      throw new AiAdmissionUnavailableError();
    }
    return { allowed: row.allowed, remaining: row.remaining as number, retryAfter: row.retry_after as number };
  } catch {
    // Never expose database errors or convert uncertain admission into a paid call.
    throw new AiAdmissionUnavailableError();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

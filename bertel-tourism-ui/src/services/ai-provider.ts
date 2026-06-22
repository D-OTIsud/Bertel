import { getSupabaseClient } from '../lib/supabase';

/**
 * Super-admin client for the platform AI provider config (§06 carte extraction). Calls the
 * SECURITY DEFINER RPCs (super-admin gated server-side). The API key is write-only: it is sent once
 * to upsert and NEVER read back — list returns `hasKey` only. Spec §4.
 */

export type AiApiKind = 'openai_compatible' | 'anthropic';

export interface AiProvider {
  id: string;
  label: string;
  apiKind: AiApiKind;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  isActive: boolean;
  extra: Record<string, unknown>;
  hasKey: boolean;
}

export interface AiProviderInput {
  id?: string;
  label: string;
  apiKind: AiApiKind;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  isActive: boolean;
  extra?: Record<string, unknown>;
  /** Provided only when setting/rotating the key; omitted otherwise (never read back). */
  apiKey?: string;
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Connexion backend indisponible.');
  return c.schema('api');
}

function rowToProvider(raw: Record<string, unknown>): AiProvider {
  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    apiKind: (raw.api_kind as AiApiKind) ?? 'openai_compatible',
    baseUrl: String(raw.base_url ?? ''),
    model: String(raw.model ?? ''),
    maxOutputTokens: Number(raw.max_output_tokens ?? 4096),
    isActive: Boolean(raw.is_active),
    extra: (raw.extra as Record<string, unknown>) ?? {},
    hasKey: Boolean(raw.has_key),
  };
}

export async function listAiProviders(): Promise<AiProvider[]> {
  const { data, error } = await client().rpc('list_ai_providers');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(rowToProvider);
}

export async function upsertAiProvider(input: AiProviderInput): Promise<string> {
  const { data, error } = await client().rpc('upsert_ai_provider', {
    p_id: input.id ?? null,
    p_label: input.label,
    p_api_kind: input.apiKind,
    p_base_url: input.baseUrl,
    p_model: input.model,
    p_max_output_tokens: input.maxOutputTokens,
    p_is_active: input.isActive,
    p_extra: input.extra ?? {},
    p_api_key: input.apiKey && input.apiKey.trim() ? input.apiKey : null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function setActiveAiProvider(id: string): Promise<void> {
  const { error } = await client().rpc('set_active_ai_provider', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function deleteAiProvider(id: string): Promise<void> {
  const { error } = await client().rpc('delete_ai_provider', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Ask the server route to do a tiny round-trip against the ACTIVE provider (key stays server-side). */
export async function testAiConnection(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string }> {
  const resp = await fetchImpl('/api/admin/ai-config/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let payload: { ok?: boolean; detail?: string; error?: string } = {};
  try {
    payload = await resp.json();
  } catch {
    /* ignore */
  }
  if (resp.ok && payload.ok) return { ok: true, detail: payload.detail ?? 'Connexion réussie.' };
  return { ok: false, detail: payload.detail ?? payload.error ?? `Échec (${resp.status})` };
}

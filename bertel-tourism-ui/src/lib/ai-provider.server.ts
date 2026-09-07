import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

const providerSchema = z.object({
  api_kind: z.literal('openai_compatible'),
  base_url: z.string().trim().url().refine((url) => /^https?:\/\//i.test(url)),
  model: z.string().trim().min(1),
  max_output_tokens: z.number().int().min(256).max(32768),
  extra: z.record(z.unknown()).nullable(),
  // Local providers such as Ollama deliberately support operation without a key.
  api_key: z.string().nullable(),
});

export async function resolveActiveAiProvider(server: SupabaseClient, signal?: AbortSignal) {
  const request = server.schema('api').rpc('get_active_ai_provider_secret');
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw new Error('La configuration IA est indisponible.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const parsed = providerSchema.safeParse(row);
  if (!parsed.success) return null;
  const provider = parsed.data;
  return {
    config: {
      apiKind: provider.api_kind,
      baseUrl: provider.base_url,
      model: provider.model,
      maxOutputTokens: provider.max_output_tokens,
      extra: provider.extra,
    },
    apiKey: provider.api_key,
  };
}

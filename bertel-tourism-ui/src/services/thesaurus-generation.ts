import { getSupabaseClient } from '../lib/supabase';

export interface ReferenceSnapshot {
  meta: { vocabulary_release: string | number | null };
  refCodeByDomain: Record<string, Record<string, unknown>[]>;
  tables: Record<string, Record<string, unknown>[]>;
  locationOptions?: { cities: string[]; lieu_dits: string[] } | null;
}

/** Only a missing RPC permits the staged-deployment legacy path. Other errors fail closed. */
function missingRpc(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202';
}

export async function fetchThesaurusGeneration(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client || typeof client.schema !== 'function') return null;
  const { data, error } = await client.schema('api').rpc('thesaurus_generation');
  if (missingRpc(error)) return null;
  if (error) throw error;
  if (data == null) return null;
  const value = String(data);
  if (!/^\d+$/.test(value)) throw new Error('Version du vocabulaire invalide.');
  return value;
}

export async function readThesaurusReferenceSnapshot(domains?: readonly string[]): Promise<ReferenceSnapshot | null> {
  const client = getSupabaseClient();
  if (!client || typeof client.schema !== 'function') return null;
  const { data, error } = await client.schema('api').rpc('thesaurus_reference_snapshot', { p_domains: domains ? [...domains] : null });
  if (missingRpc(error)) return null;
  if (error) throw error;
  if (!data || typeof data !== 'object' || !data.meta || !data.refCodeByDomain || !data.tables) {
    throw new Error('Les référentiels du vocabulaire sont incomplets.');
  }
  return data as ReferenceSnapshot;
}

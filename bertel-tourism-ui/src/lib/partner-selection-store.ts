import 'server-only';
import { getServerSupabaseClient } from './supabase-server';
import type { PartnerSelection, PartnerSelectionBucket } from './partner-selections';

/** Read only the active persistent definition. Never fall back to the beta Map. */
export async function loadPartnerSelection(id: string): Promise<PartnerSelection | undefined> {
  const server = getServerSupabaseClient();
  if (!server) throw new Error('Partner selection store unavailable');
  const { data, error } = await server.schema('api').rpc('get_active_partner_selection_definition', { p_selection_id: id });
  if (error) throw new Error('Partner selection store unavailable');
  if (data == null) return undefined;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid partner selection definition');
  const row = data as Record<string, unknown>;
  if (row.id !== id || typeof row.name !== 'string' || row.state !== 'active'
    || typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 1
    || !Array.isArray(row.buckets) || row.buckets.length === 0
    || (row.commune_insee !== null && (!Array.isArray(row.commune_insee)
      || !row.commune_insee.every((v) => typeof v === 'string')))) {
    throw new Error('Invalid partner selection definition');
  }
  for (const value of row.buckets) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.types)
      || value.types.length === 0 || !value.types.every((v: unknown) => typeof v === 'string')) {
      throw new Error('Invalid partner selection definition');
    }
  }
  return { id, name: row.name, revision: row.revision,
    buckets: row.buckets as PartnerSelectionBucket[], communeInsee: row.commune_insee as string[] | null };
}

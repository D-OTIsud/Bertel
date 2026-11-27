import { getSupabaseClient } from '../lib/supabase';
import { readThesaurusReferenceSnapshot } from './thesaurus-generation';

export interface CreationCommune {
  code: string;
  name: string;
  postcodes: string[];
}

/** Public postal mapping joined to the published, assignable commune catalogue. */
export async function listCreationCommunes(): Promise<CreationCommune[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion indisponible pour charger les communes.');

  const [snapshot, mapping] = await Promise.all([
    readThesaurusReferenceSnapshot(['commune']),
    client.from('ref_commune_postcode').select('postcode,insee_code'),
  ]);
  if (mapping.error) throw mapping.error;
  const rows = snapshot?.tables.ref_commune;
  if (!snapshot || !Array.isArray(rows)) {
    throw new Error('Le référentiel des communes est indisponible. Réessayez.');
  }

  const published = snapshot.meta.vocabulary_release != null;
  const postcodesByCode = new Map<string, Set<string>>();
  for (const row of mapping.data ?? []) {
    if (typeof row.postcode !== 'string' || !/^\d{5}$/.test(row.postcode)
        || typeof row.insee_code !== 'string') continue;
    const postcodes = postcodesByCode.get(row.insee_code) ?? new Set<string>();
    postcodes.add(row.postcode);
    postcodesByCode.set(row.insee_code, postcodes);
  }
  return rows
    .filter((row) => row.is_active !== false && row.is_assignable !== false
      && row.thesaurus_valid_today !== false
      && (!published || row.thesaurus_assignable === true)
      && (row.thesaurus_lifecycle == null || row.thesaurus_lifecycle === 'active'))
    .flatMap((row) => {
      if (typeof row.insee_code !== 'string' || typeof row.name !== 'string') return [];
      const postcodes = [...(postcodesByCode.get(row.insee_code) ?? [])].sort();
      return postcodes.length ? [{ code: row.insee_code, name: row.name, postcodes }] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

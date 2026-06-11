import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

// ─── Types des catalogues de filtres avancés ─────────────────────────────────

export interface TaxonomyDomainOption { domain: string; name: string }
export interface TaxonomyCodeOption { domain: string; code: string; name: string }
export interface DistinctionValueOption {
  schemeCode: string;
  schemeName: string;
  valueCode: string;
  valueName: string;
}
export interface SimpleOption { code: string; label: string }

export interface DashboardAdvancedFilterOptions {
  taxonomyDomains: TaxonomyDomainOption[];
  taxonomyCodes: TaxonomyCodeOption[];
  distinctionValues: DistinctionValueOption[];
  languages: SimpleOption[];
  amenityFamilies: SimpleOption[];
  tags: SimpleOption[];
}

const EMPTY_OPTIONS: DashboardAdvancedFilterOptions = {
  taxonomyDomains: [],
  taxonomyCodes: [],
  distinctionValues: [],
  languages: [],
  amenityFamilies: [],
  tags: [],
};

// ─── Helpers purs (testés) ───────────────────────────────────────────────────

interface RawClassificationValue {
  code: string;
  name: string;
  scheme: { code: string; name: string; is_distinction: boolean } | null;
}

export function shapeDistinctionValues(rows: RawClassificationValue[]): DistinctionValueOption[] {
  return rows
    .filter((r) => r.scheme?.is_distinction)
    .map((r) => ({
      schemeCode: r.scheme!.code,
      schemeName: r.scheme!.name,
      valueCode: r.code,
      valueName: r.name,
    }));
}

interface RawAmenityFamilyRow {
  family: { code: string; name: string } | null;
}

export function dedupeAmenityFamilies(rows: RawAmenityFamilyRow[]): SimpleOption[] {
  const byCode = new Map<string, string>();
  for (const r of rows) {
    if (r.family?.code && !byCode.has(r.family.code)) {
      byCode.set(r.family.code, r.family.name ?? r.family.code);
    }
  }
  return [...byCode.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
}

// ─── Chargeur ────────────────────────────────────────────────────────────────
// Tables ref_* en lecture publique RLS — selects directs (pattern explorer-reference).
// Mode démo : catalogues vides (pas de mocks pour les nouveautés — decision log §32).

export async function getDashboardAdvancedFilterOptions(): Promise<DashboardAdvancedFilterOptions> {
  const { demoMode } = useSessionStore.getState();
  const client = getSupabaseClient();
  if (demoMode || !client) return EMPTY_OPTIONS;

  const domainsRes = await client
    .from('ref_code_domain_registry')
    .select('domain,name')
    .eq('is_taxonomy', true)
    .order('position', { ascending: true });
  if (domainsRes.error) throw domainsRes.error;
  const taxonomyDomains: TaxonomyDomainOption[] = (domainsRes.data ?? []).map((d) => ({
    domain: d.domain,
    name: d.name ?? d.domain,
  }));

  const [codesRes, valuesRes, languagesRes, amenitiesRes, tagsRes] = await Promise.all([
    client
      .from('ref_code')
      .select('domain,code,name')
      .in('domain', taxonomyDomains.map((d) => d.domain))
      .eq('is_active', true)
      .order('position', { ascending: true }),
    client
      .from('ref_classification_value')
      .select('code,name,scheme:scheme_id(code,name,is_distinction)')
      .order('position', { ascending: true }),
    client.from('ref_language').select('code,name').order('position', { ascending: true }),
    client.from('ref_amenity').select('family:family_id(code,name)').in('scope', ['object', 'both']),
    client.from('ref_tag').select('slug,name').order('position', { ascending: true }),
  ]);
  // First-error-wins : les cinq selects ont tous couru ; on jette le premier échec
  // trouvé (chargement tout-ou-rien — React Query affichera l'erreur du groupe).
  const firstError = codesRes.error ?? valuesRes.error ?? languagesRes.error ?? amenitiesRes.error ?? tagsRes.error;
  if (firstError) throw firstError;

  return {
    taxonomyDomains,
    taxonomyCodes: (codesRes.data ?? []).map((c) => ({ domain: c.domain, code: c.code, name: c.name ?? c.code })),
    distinctionValues: shapeDistinctionValues((valuesRes.data ?? []) as unknown as RawClassificationValue[]),
    languages: (languagesRes.data ?? []).map((l) => ({ code: l.code, label: l.name })),
    amenityFamilies: dedupeAmenityFamilies((amenitiesRes.data ?? []) as unknown as RawAmenityFamilyRow[]),
    // slug = clé de filtre (tags_any matche ref_tag.slug via tag_link)
    tags: (tagsRes.data ?? []).map((t) => ({ code: t.slug, label: t.name })),
  };
}

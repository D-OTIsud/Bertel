import type { ExplorerBucketKey, ExplorerFilters, ExplorerStatusFilter } from '../types/domain';
import { buildBucketRpcFilters, getEffectiveBackendTypesForBucket, normalizeExplorerFilters } from '../utils/facets';

export interface DashboardStatsParams {
  p_types: string[] | null;
  p_status: string[];
  p_filters: Record<string, unknown>;
  p_updated_at_from: string | null;
  p_updated_at_to: string | null;
}
export interface DashboardPeriod { updatedAtFrom?: string; updatedAtTo?: string }

// Clés de facettes SPÉCIFIQUES par type — honnêtes seulement en mono-bucket (§7).
// En multi/zéro-bucket, elles sont retirées du payload (le garde EXISTS du RPC
// exclurait tous les objets des autres types). `bbox` = repli carte, hors Dashboard.
const TYPE_SPECIFIC_KEYS = ['itinerary', 'capacity_filters', 'meeting_room', 'event', 'bbox'] as const;

/** Payload transverse (multi/zéro-bucket) : facettes indépendantes du type +
 *  taxonomie RÉ-AGRÉGÉE sur tous les domaines (buildBucketRpcFilters la scope au bucket). */
function transverseFilters(filters: ExplorerFilters): Record<string, unknown> {
  const normalized = normalizeExplorerFilters(filters);
  // Les clés transverses sont indépendantes du bucket : on part d'un bucket
  // quelconque puis on retire le spécifique et on ré-agrège la taxonomie.
  const payload = buildBucketRpcFilters(filters, 'HOT');
  for (const key of TYPE_SPECIFIC_KEYS) delete payload[key];
  const allTaxonomy = normalized.common.taxonomyAny.map((t) => ({ domain: t.domain, code: t.code }));
  if (allTaxonomy.length > 0) payload.taxonomy_any = allTaxonomy;
  else delete payload.taxonomy_any;
  return payload;
}

export function dashboardStatsParams(filters: ExplorerFilters, period: DashboardPeriod): DashboardStatsParams {
  const normalized = normalizeExplorerFilters(filters);
  const buckets = normalized.selectedBuckets;

  // p_types : union des types des buckets (narrowing sous-types inclus) ; aucun bucket → null (tous, hors ORG).
  let pTypes: string[] | null = null;
  if (buckets.length > 0) {
    const set = new Set<string>();
    for (const b of buckets) for (const t of getEffectiveBackendTypesForBucket(filters, b as ExplorerBucketKey)) set.add(t);
    pTypes = [...set];
  }

  // p_filters : mono-bucket → payload complet du bucket ; sinon transverse-only.
  const pFilters = buckets.length === 1
    ? buildBucketRpcFilters(filters, buckets[0] as ExplorerBucketKey)
    : transverseFilters(filters);

  // p_status : restreint à published/draft (défaut published).
  const statuses = (normalized.common.statuses ?? []).filter(
    (s): s is ExplorerStatusFilter => s === 'published' || s === 'draft',
  );

  return {
    p_types: pTypes,
    p_status: statuses.length > 0 ? statuses : ['published'],
    p_filters: pFilters,
    p_updated_at_from: period.updatedAtFrom ?? null,
    p_updated_at_to: period.updatedAtTo ?? null,
  };
}

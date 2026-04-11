import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type {
  ExplorerReferenceOption,
  ExplorerReferences,
  ExplorerBucketKey,
  ExplorerTaxonomyDomain,
  ExplorerTaxonomyNode,
} from '../types/domain';
import { EXPLORER_BUCKET_TYPE_MAP } from '../utils/facets';

type CapacityMetricRow = {
  id: string;
  code: string;
  name: string;
  position: number | null;
};

type CapacityApplicabilityRow = {
  metric_id: string;
  object_type: string;
};

type TaxonomyDomainRow = {
  domain: string;
  name: string;
  object_type: string;
  position: number | null;
};

type TaxonomyNodeRow = {
  id: string;
  domain: string;
  code: string;
  name: string;
  parent_id: string | null;
  is_assignable: boolean | null;
  position: number | null;
};

type PracticeRow = {
  code: string;
  name: string;
  position: number | null;
};

function sortByPositionAndName<T extends { position?: number | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const positionCompare = (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
    if (positionCompare !== 0) {
      return positionCompare;
    }
    return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
  });
}

function toReferenceOptions<T extends { code: string; name: string; position?: number | null }>(rows: T[]): ExplorerReferenceOption[] {
  return sortByPositionAndName(rows).map((row) => ({ code: row.code, name: row.name }));
}

function bucketCapacityOptions(
  bucket: ExplorerBucketKey,
  metrics: CapacityMetricRow[],
  applicability: CapacityApplicabilityRow[],
): ExplorerReferenceOption[] {
  const allowedTypes = new Set(EXPLORER_BUCKET_TYPE_MAP[bucket]);
  const metricIds = new Set(
    applicability
      .filter((row) => allowedTypes.has(row.object_type as never))
      .map((row) => row.metric_id),
  );

  return toReferenceOptions(
    metrics.filter((metric) => metricIds.has(metric.id) && metric.code !== 'meeting_rooms'),
  );
}

function computeTaxonomyDepth(nodeId: string, parentIdByNodeId: Map<string, string | null>, cache: Map<string, number>): number {
  const cached = cache.get(nodeId);
  if (cached != null) {
    return cached;
  }

  const parentId = parentIdByNodeId.get(nodeId) ?? null;
  const depth = parentId ? computeTaxonomyDepth(parentId, parentIdByNodeId, cache) + 1 : 0;
  cache.set(nodeId, depth);
  return depth;
}

function buildTaxonomyDomains(domainRows: TaxonomyDomainRow[], nodeRows: TaxonomyNodeRow[]): ExplorerTaxonomyDomain[] {
  const nodesByDomain = new Map<string, TaxonomyNodeRow[]>();
  for (const node of nodeRows) {
    const current = nodesByDomain.get(node.domain) ?? [];
    current.push(node);
    nodesByDomain.set(node.domain, current);
  }

  return sortByPositionAndName(domainRows.map((row) => ({ ...row, name: row.name }))).map((domainRow) => {
    const domainNodes = nodesByDomain.get(domainRow.domain) ?? [];
    const nodeById = new Map(domainNodes.map((node) => [node.id, node]));
    const parentIdByNodeId = new Map(domainNodes.map((node) => [node.id, node.parent_id]));
    const depthCache = new Map<string, number>();

    const nodes: ExplorerTaxonomyNode[] = domainNodes
      .filter((node) => node.code !== 'root')
      .map((node) => ({
        code: node.code,
        name: node.name,
        parentCode: node.parent_id ? (nodeById.get(node.parent_id)?.code ?? null) : null,
        depth: Math.max(0, computeTaxonomyDepth(node.id, parentIdByNodeId, depthCache) - 1),
        isAssignable: node.is_assignable !== false,
        position: node.position,
      }))
      .sort((left, right) => {
        const positionCompare = (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
        if (positionCompare !== 0) {
          return positionCompare;
        }
        return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
      });

    return {
      domain: domainRow.domain,
      name: domainRow.name,
      objectType: domainRow.object_type,
      nodes,
    };
  });
}

// Representative Réunion municipalities for demo mode city dropdown.
// Live mode derives from api.get_dashboard_filter_options() (object_location corpus).
const DEMO_CITIES = ['Le Tampon', 'Saint-Benoît', 'Saint-Denis', 'Saint-Paul', 'Saint-Pierre', 'Sainte-Marie'];

function buildDemoReferences(): ExplorerReferences {
  return {
    cities: DEMO_CITIES,
    lieuDits: [],
    hotTaxonomy: [
      {
        domain: 'taxonomy_hot',
        name: 'Taxonomie HOT',
        objectType: 'HOT',
        nodes: [
          { code: 'hotel', name: 'Hôtel', parentCode: null, depth: 0, isAssignable: true, position: 1 },
          { code: 'boutique_hotel', name: 'Hôtel boutique', parentCode: 'hotel', depth: 1, isAssignable: true, position: 2 },
          { code: 'family_hotel', name: 'Hôtel familial', parentCode: 'hotel', depth: 1, isAssignable: true, position: 3 },
          { code: 'business_hotel', name: 'Hôtel d’affaires', parentCode: 'hotel', depth: 1, isAssignable: true, position: 4 },
        ],
      },
    ],
    hotCapacityMetrics: [
      { code: 'beds', name: 'Lits' },
      { code: 'bedrooms', name: 'Chambres' },
      { code: 'pitches', name: 'Emplacements' },
      { code: 'meeting_rooms', name: 'Salles de reunion' },
    ],
    resCapacityMetrics: [
      { code: 'seats', name: 'Places assises' },
      { code: 'standing_places', name: 'Places debout' },
    ],
    itiPractices: [
      { code: 'randonnee', name: 'Randonnee' },
      { code: 'velo', name: 'Velo' },
      { code: 'patrimoine', name: 'Patrimoine' },
    ],
  };
}

export async function listExplorerReferences(): Promise<ExplorerReferences> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return buildDemoReferences();
  }

  const [
    metricsResult,
    applicabilityResult,
    taxonomyDomainsResult,
    practicesResult,
    locationOptionsResult,
  ] = await Promise.all([
    client.from('ref_capacity_metric').select('id,code,name,position').order('position', { ascending: true }),
    client.from('ref_capacity_applicability').select('metric_id,object_type'),
    client
      .from('ref_code_domain_registry')
      .select('domain,name,object_type,position')
      .eq('is_taxonomy', true)
      .in('domain', ['taxonomy_hot'])
      .order('position', { ascending: true }),
    client.from('ref_code').select('code,name,position').eq('domain', 'iti_practice').eq('is_active', true).order('position', { ascending: true }),
    client.schema('api').rpc('get_dashboard_filter_options'),
  ]);

  if (metricsResult.error) {
    throw metricsResult.error;
  }
  if (applicabilityResult.error) {
    throw applicabilityResult.error;
  }
  if (taxonomyDomainsResult.error) {
    throw taxonomyDomainsResult.error;
  }
  if (practicesResult.error) {
    throw practicesResult.error;
  }
  if (locationOptionsResult.error) {
    throw locationOptionsResult.error;
  }

  const taxonomyDomains = (taxonomyDomainsResult.data ?? []) as TaxonomyDomainRow[];
  const domainCodes = taxonomyDomains.map((domain) => domain.domain);
  const taxonomyNodesResult = domainCodes.length > 0
    ? await client
        .from('ref_code')
        .select('id,domain,code,name,parent_id,is_assignable,position')
        .in('domain', domainCodes)
        .eq('is_active', true)
        .order('position', { ascending: true })
    : { data: [], error: null };

  if (taxonomyNodesResult.error) {
    throw taxonomyNodesResult.error;
  }

  const metrics = (metricsResult.data ?? []) as CapacityMetricRow[];
  const applicability = (applicabilityResult.data ?? []) as CapacityApplicabilityRow[];
  const taxonomyNodes = (taxonomyNodesResult.data ?? []) as TaxonomyNodeRow[];
  const practices = (practicesResult.data ?? []) as PracticeRow[];
  const locationOptions = locationOptionsResult.data as { cities: string[]; lieu_dits: string[] } | null;

  return {
    hotTaxonomy: buildTaxonomyDomains(taxonomyDomains, taxonomyNodes),
    hotCapacityMetrics: bucketCapacityOptions('HOT', metrics, applicability),
    resCapacityMetrics: bucketCapacityOptions('RES', metrics, applicability),
    itiPractices: toReferenceOptions(practices),
    cities: locationOptions?.cities ?? [],
    lieuDits: locationOptions?.lieu_dits ?? [],
  };
}

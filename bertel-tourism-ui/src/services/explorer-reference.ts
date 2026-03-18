import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { ExplorerClassificationGroup, ExplorerReferenceOption, ExplorerReferences, ExplorerBucketKey } from '../types/domain';
import { EXPLORER_BUCKET_TYPE_MAP, HOT_CLASSIFICATION_SCHEME_CODES } from '../utils/facets';

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

type ClassificationSchemeRow = {
  id: string;
  code: string;
  name: string;
  position: number | null;
};

type ClassificationValueRow = {
  scheme_id: string;
  code: string;
  name: string;
  position: number | null;
  ordinal: number | null;
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

function buildDemoReferences(): ExplorerReferences {
  return {
    hotClassifications: [
      {
        schemeCode: 'type_hot',
        schemeName: 'Type d hotel',
        values: [
          { code: 'hotel_boutique', name: 'Hotel boutique' },
          { code: 'hotel_familial', name: 'Hotel familial' },
          { code: 'hotel_affaires', name: 'Hotel affaires' },
        ],
      },
      {
        schemeCode: 'hot_stars',
        schemeName: 'Classement hotelier',
        values: [
          { code: '3', name: '3 etoiles' },
          { code: '4', name: '4 etoiles' },
          { code: '5', name: '5 etoiles' },
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
    schemesResult,
    practicesResult,
  ] = await Promise.all([
    client.from('ref_capacity_metric').select('id,code,name,position').order('position', { ascending: true }),
    client.from('ref_capacity_applicability').select('metric_id,object_type'),
    client.from('ref_classification_scheme').select('id,code,name,position').in('code', [...HOT_CLASSIFICATION_SCHEME_CODES]).order('position', { ascending: true }),
    client.from('ref_code_iti_practice').select('code,name,position').eq('is_active', true).order('position', { ascending: true }),
  ]);

  if (metricsResult.error) {
    throw metricsResult.error;
  }
  if (applicabilityResult.error) {
    throw applicabilityResult.error;
  }
  if (schemesResult.error) {
    throw schemesResult.error;
  }
  if (practicesResult.error) {
    throw practicesResult.error;
  }

  const schemes = (schemesResult.data ?? []) as ClassificationSchemeRow[];
  const schemeIds = schemes.map((scheme) => scheme.id);
  const valuesResult = await client
    .from('ref_classification_value')
    .select('scheme_id,code,name,position,ordinal')
    .in('scheme_id', schemeIds)
    .order('position', { ascending: true });

  if (valuesResult.error) {
    throw valuesResult.error;
  }

  const metrics = (metricsResult.data ?? []) as CapacityMetricRow[];
  const applicability = (applicabilityResult.data ?? []) as CapacityApplicabilityRow[];
  const values = (valuesResult.data ?? []) as ClassificationValueRow[];
  const practices = (practicesResult.data ?? []) as PracticeRow[];

  const hotClassifications: ExplorerClassificationGroup[] = sortByPositionAndName(schemes).map((scheme) => ({
    schemeCode: scheme.code,
    schemeName: scheme.name,
    values: toReferenceOptions(
      values
        .filter((value) => value.scheme_id === scheme.id)
        .sort((left, right) => {
          const ordinalCompare = (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER);
          if (ordinalCompare !== 0) {
            return ordinalCompare;
          }
          return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
        }),
    ),
  }));

  return {
    hotClassifications,
    hotCapacityMetrics: bucketCapacityOptions('HOT', metrics, applicability),
    resCapacityMetrics: bucketCapacityOptions('RES', metrics, applicability),
    itiPractices: toReferenceOptions(practices),
  };
}

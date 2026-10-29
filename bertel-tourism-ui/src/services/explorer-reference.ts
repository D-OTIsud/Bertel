import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type {
  AccessibilityAmenityRef,
  AccessibilityDisabilityTypeCode,
  BackendObjectTypeCode,
  CapacityBoundsByMetric,
  ExplorerReferenceOption,
  ExplorerReferences,
  ExplorerBucketKey,
  ExplorerTagFilter,
  SustainabilityActionRef,
  SustainabilityCategoryRef,
  ExplorerTaxonomyDomain,
  ExplorerTaxonomyNode,
  ExplorerAccommodationFamily,
} from '../types/domain';
import { ACCESSIBILITY_DISABILITY_TYPE_OPTIONS, EXPLORER_BUCKET_TYPE_MAP, HEADLINE_CAPACITY_METRIC } from '../utils/facets';
import { accommodationFamilyDescription } from '../utils/accommodation-help';
import { buildDemoReferences } from '../data/explorer-reference-demo';

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
  description: string | null;
  parent_id: string | null;
  is_assignable: boolean | null;
  position: number | null;
  metadata: unknown;
};

type PracticeRow = {
  code: string;
  name: string;
  position: number | null;
};

type AmenityRow = {
  code: string;
  name: string;
  description?: string | null;
  extra?: unknown;
  position: number | null;
  family?: { code?: string | null; name?: string | null } | null;
};

type SustainabilityCategoryRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  position: number | null;
};

type SustainabilityActionRow = {
  code: string;
  label?: string | null;
  name?: string | null;
  description?: string | null;
  category_id: string;
  position: number | null;
};

type LabelSchemeRow = {
  id: string;
  code: string;
  name: string;
  position: number | null;
  display_group: string | null;
};

type CapacityBoundsRow = {
  metric_code: string;
  object_type: string;
  value_min: number | null;
  value_max: number | null;
  sample_size: number | null;
};

type LabelApplicabilityRow = {
  scheme_id: string;
  object_type: string;
};

type ClassificationValueRow = {
  code: string;
  name: string;
  position: number | null;
  scheme: { code?: string | null } | null;
};

const ACCESSIBILITY_DISABILITY_CODES = new Set(ACCESSIBILITY_DISABILITY_TYPE_OPTIONS.map((option) => option.code));
const ACCESSIBILITY_DISABILITY_REFERENCES: ExplorerReferenceOption[] = ACCESSIBILITY_DISABILITY_TYPE_OPTIONS.map((option) => ({
  code: option.code,
  name: option.label,
}));

function comparePositionThenName<T extends { position?: number | null; name: string }>(left: T, right: T): number {
    const positionCompare = (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
    if (positionCompare !== 0) {
      return positionCompare;
    }
    return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
  }

function sortByPositionAndName<T extends { position?: number | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort(comparePositionThenName);
}

function toReferenceOptions<T extends { code: string; name: string; position?: number | null }>(rows: T[]): ExplorerReferenceOption[] {
  return sortByPositionAndName(rows).map((row) => ({ code: row.code, name: row.name }));
}

// §173/§175 — le filtre « Distinctions » de l'Explorer expose TOUTES les distinctions
// (is_distinction), pas seulement durabilité/accessibilité : classements officiels (étoiles/
// épis/clés) + labels qualité y compris. Regroupées par famille (`display_group`) pour les
// en-têtes du menu déroulant. Ordre : Classements → Labels qualité → Durabilité → Accessibilité.
const RANKED_LABEL_FAMILIES: Record<string, { label: string; order: number }> = {
  official_classification: { label: 'Classements', order: 1 },
  // §176 — distinctions notées de réseau privé (Gîtes de France, Clévacances, Logis) :
  // des objets classés (1→5), mais pas par l'État ⇒ groupe distinct des labels binaires.
  graded_label: { label: 'Labels notés', order: 2 },
  quality_label: { label: 'Labels qualité', order: 3 },
  sustainability_labels: { label: 'Durabilité', order: 4 },
  accessibility_labels: { label: 'Accessibilité', order: 5 },
};

function rankedLabelFamily(displayGroup: string | null): { label: string; order: number } {
  return (displayGroup ? RANKED_LABEL_FAMILIES[displayGroup] : undefined) ?? { label: 'Autres', order: 9 };
}

/**
 * Manifest 16n — attache à chaque distinction ses types applicables.
 * `objectTypes` reste **undefined** quand le registre ne dit rien du scheme : c'est le
 * défaut fail-open (« applicable partout »), pas un tableau vide qui voudrait dire
 * « applicable à rien ». Les deux ne doivent jamais être confondus.
 */
function toRankedLabelOptions(
  rows: LabelSchemeRow[],
  applicability: LabelApplicabilityRow[],
): ExplorerReferenceOption[] {
  const typesBySchemeId = new Map<string, BackendObjectTypeCode[]>();
  for (const row of applicability) {
    const current = typesBySchemeId.get(row.scheme_id) ?? [];
    current.push(String(row.object_type).toUpperCase() as BackendObjectTypeCode);
    typesBySchemeId.set(row.scheme_id, current);
  }

  return [...rows]
    .map((row) => ({ row, family: rankedLabelFamily(row.display_group) }))
    .sort((a, b) => {
      if (a.family.order !== b.family.order) return a.family.order - b.family.order;
      const positionCompare =
        (a.row.position ?? Number.MAX_SAFE_INTEGER) - (b.row.position ?? Number.MAX_SAFE_INTEGER);
      if (positionCompare !== 0) return positionCompare;
      return a.row.name.localeCompare(b.row.name, 'fr', { sensitivity: 'base' });
    })
    .map(({ row, family }) => ({
      code: row.code,
      name: row.name,
      group: family.label,
      objectTypes: typesBySchemeId.get(row.id),
    }));
}

// §174 — paliers de note d'un scheme classé (ref_classification_value), groupés par code de
// scheme et triés par grade croissant (position, puis code numérique, puis nom en repli).
export function toRankedLabelSchemeValues(rows: ClassificationValueRow[]): Record<string, ExplorerReferenceOption[]> {
  const bySchemeCode = new Map<string, ClassificationValueRow[]>();
  for (const row of rows) {
    const schemeCode = row.scheme?.code ?? '';
    if (!schemeCode || !row.code) continue;
    const current = bySchemeCode.get(schemeCode) ?? [];
    current.push(row);
    bySchemeCode.set(schemeCode, current);
  }
  const result: Record<string, ExplorerReferenceOption[]> = {};
  for (const [schemeCode, values] of bySchemeCode) {
    result[schemeCode] = [...values]
      .sort((a, b) => {
        const positionCompare = (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
        if (positionCompare !== 0) return positionCompare;
        const numA = Number(a.code);
        const numB = Number(b.code);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
      })
      .map((value) => ({ code: value.code, name: value.name }));
  }
  return result;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeDisabilityTypes(value: unknown): AccessibilityDisabilityTypeCode[] {
  return readStringList(value).filter((item): item is AccessibilityDisabilityTypeCode =>
    ACCESSIBILITY_DISABILITY_CODES.has(item as AccessibilityDisabilityTypeCode),
  );
}

function buildAccessibilityAmenities(rows: AmenityRow[]): AccessibilityAmenityRef[] {
  return sortByPositionAndName(
    rows
      .map((row) => {
        const extra = readRecord(row.extra);
        const disabilityTypes = normalizeDisabilityTypes(extra.disability_types);
        const familyCode = row.family?.code ?? '';
        return {
          code: row.code,
          name: row.name,
          description: row.description ?? null,
          disabilityTypes,
          familyCode,
          position: row.position,
        };
      })
      .filter((row) => row.code && row.name && (row.familyCode === 'accessibility' || row.code.startsWith('acc_') || row.disabilityTypes.length > 0)),
  ).map(({ code, name, description, disabilityTypes }) => ({
    code,
    name,
    description,
    disabilityTypes,
  }));
}

function buildSustainabilityCategories(
  categoryRows: SustainabilityCategoryRow[],
  actionRows: SustainabilityActionRow[],
): SustainabilityCategoryRef[] {
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const actionsByCategoryCode = new Map<string, SustainabilityActionRef[]>();

  for (const action of sortByPositionAndName(
    actionRows.map((row) => ({
      ...row,
      name: row.label || row.name || row.code,
    })),
  )) {
    const categoryCode = categoryById.get(action.category_id)?.code ?? '';
    if (!categoryCode || !action.code) {
      continue;
    }
    const current = actionsByCategoryCode.get(categoryCode) ?? [];
    current.push({
      code: action.code,
      name: action.name,
      description: action.description ?? null,
      categoryCode,
    });
    actionsByCategoryCode.set(categoryCode, current);
  }

  return sortByPositionAndName(categoryRows)
    .map((category) => ({
      code: category.code,
      name: category.name,
      description: category.description ?? null,
      actions: actionsByCategoryCode.get(category.code) ?? [],
    }))
    .filter((category) => category.code && category.name && category.actions.length > 0);
}

/**
 * Métriques de capacité d'un bucket, **chacune porteuse de ses types applicables**.
 *
 * Le panneau resserre ensuite la liste sur les SOUS-TYPES cochés (`objectTypes`) : sans
 * cela, chercher un hôtel proposait « Emplacements », « Camping-cars » et « Tentes »,
 * parce que le bucket HOT unionne HOT∪HLO∪HPA∪CAMP∪RVA (signalement PO 2026-07-27).
 *
 * Deux exclusions :
 *   - `meeting_rooms` : le bloc MICE a ses propres contrôles ;
 *   - la métrique VEDETTE du bucket (cf. `HEADLINE_CAPACITY_METRIC`), rendue juste
 *     au-dessus en contrôle principal. La proposer aussi dans le tiroir détaillé,
 *     c'est deux commandes pour un seul filtre.
 */
function bucketCapacityOptions(
  bucket: ExplorerBucketKey,
  metrics: CapacityMetricRow[],
  applicability: CapacityApplicabilityRow[],
): ExplorerReferenceOption[] {
  const ownedElsewhere = new Set(
    ['meeting_rooms', HEADLINE_CAPACITY_METRIC[bucket]].filter(Boolean) as string[],
  );
  const allowedTypes = new Set(EXPLORER_BUCKET_TYPE_MAP[bucket]);
  const typesByMetricId = new Map<string, BackendObjectTypeCode[]>();
  for (const row of applicability) {
    if (!allowedTypes.has(row.object_type as never)) continue;
    const current = typesByMetricId.get(row.metric_id) ?? [];
    current.push(String(row.object_type).toUpperCase() as BackendObjectTypeCode);
    typesByMetricId.set(row.metric_id, current);
  }

  return metrics
    .filter((metric) => typesByMetricId.has(metric.id) && !ownedElsewhere.has(metric.code))
    .map((metric) => ({
      code: metric.code,
      name: metric.name,
      objectTypes: typesByMetricId.get(metric.id),
    }));
}

/** `v_capacity_metric_bounds` (16o) → `metric_code → object_type → bornes`. */
function toCapacityBounds(rows: CapacityBoundsRow[]): CapacityBoundsByMetric {
  const result: CapacityBoundsByMetric = {};
  for (const row of rows) {
    if (!row.metric_code || !row.object_type) continue;
    const byType = result[row.metric_code] ?? {};
    byType[String(row.object_type).toUpperCase()] = {
      min: Number(row.value_min),
      max: Number(row.value_max),
      sampleSize: Number(row.sample_size),
    };
    result[row.metric_code] = byType;
  }
  return result;
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

export function buildTaxonomyDomains(domainRows: TaxonomyDomainRow[], nodeRows: TaxonomyNodeRow[]): ExplorerTaxonomyDomain[] {
  const nodesByDomain = new Map<string, TaxonomyNodeRow[]>();
  for (const node of nodeRows) {
    const current = nodesByDomain.get(node.domain) ?? [];
    current.push(node);
    nodesByDomain.set(node.domain, current);
  }

  const domains = sortByPositionAndName(domainRows.map((row) => ({ ...row, name: row.name }))).map((domainRow) => {
    const domainNodes = nodesByDomain.get(domainRow.domain) ?? [];
    const nodeById = new Map(domainNodes.map((node) => [node.id, node]));
    const parentIdByNodeId = new Map(domainNodes.map((node) => [node.id, node.parent_id]));
    const depthCache = new Map<string, number>();

    const nodes: ExplorerTaxonomyNode[] = domainNodes
      .filter((node) => node.code !== 'root')
      .map((node) => {
        const metadata = readRecord(node.metadata);
        const axis = typeof metadata.axis === 'string' ? metadata.axis : null;
        const resolvedAxis: ExplorerTaxonomyNode['axis'] =
          axis === 'famille' || axis === 'nature' || axis === 'sous_type'
            || axis === 'type_unite' || axis === 'positionnement' ? axis : null;
        return {
          code: node.code,
          name: node.name,
          description: node.description ?? null,
          parentCode: node.parent_id ? (nodeById.get(node.parent_id)?.code ?? null) : null,
          depth: Math.max(0, computeTaxonomyDepth(node.id, parentIdByNodeId, depthCache) - 1),
          isAssignable: node.is_assignable !== false,
          position: node.position,
          axis: resolvedAxis,
          family: typeof metadata.famille === 'string' ? metadata.famille : null,
          aliases: readStringList(metadata.aliases),
          sourceRef: typeof metadata.source_ref === 'string' ? metadata.source_ref : null,
        };
      })
      .sort(comparePositionThenName);

    return {
      domain: domainRow.domain,
      name: domainRow.name,
      objectType: domainRow.object_type,
      nodes,
    };
  });

  return projectLegacyOutdoorAccommodationTaxonomies(domains);
}

const LEGACY_OUTDOOR_FAMILY_CODE = 'plein_air';
const OUTDOOR_FAMILY_ALIASES = ['Hôtellerie de plein air', 'Hébergement de plein air'];
const CAMPING_TERRAIN_HPA_CODES = new Set([
  'natural_camp_area',
  'farm_camping',
  'homestay_camping',
]);

/**
 * Compatibilité de déploiement §201.
 *
 * Le frontend doit être publiable avant la migration SQL de la hiérarchie v2.
 * Tant que le catalogue live porte encore l'ancienne famille `plein_air`, on
 * projette ses nœuds connus vers les deux familles cibles. Les filtres envoyés
 * au serveur conservent leurs vrais couples domaine/code : cette projection ne
 * fabrique donc aucune affectation et ne change pas la sémantique de filtrage.
 */
export function projectLegacyOutdoorAccommodationTaxonomies(
  domains: ExplorerTaxonomyDomain[],
): ExplorerTaxonomyDomain[] {
  return domains.map((domain) => ({
    ...domain,
    nodes: domain.nodes.map((node) => {
      if (node.family !== LEGACY_OUTDOOR_FAMILY_CODE) {
        return node;
      }

      if (domain.domain === 'taxonomy_camp') {
        return { ...node, family: 'campings_terrains' };
      }

      if (domain.domain === 'taxonomy_hpa' && CAMPING_TERRAIN_HPA_CODES.has(node.code)) {
        return { ...node, family: 'campings_terrains' };
      }

      if (domain.domain === 'taxonomy_hpa' && node.code === 'motorhome_area') {
        return { ...node, family: 'aires_haltes_plein_air' };
      }

      if (domain.domain === 'taxonomy_hpa' && node.code === 'outdoor_glamping') {
        return {
          ...node,
          family: null,
          axis: 'type_unite',
          isAssignable: false,
        };
      }

      // Un nouveau code encore non arbitré ne doit pas recréer silencieusement
      // l'ancienne famille ni être rangé au hasard dans l'une des deux nouvelles.
      return { ...node, family: null };
    }),
  }));
}

/**
 * Remplace à l'affichage l'ancien regroupement `plein_air` par les deux familles
 * validées. Idempotent : après la migration SQL, les lignes cibles sont gardées
 * telles quelles et l'éventuelle ligne historique active est seulement masquée.
 */
export function projectLegacyOutdoorAccommodationFamilies(
  families: ExplorerAccommodationFamily[],
): ExplorerAccommodationFamily[] {
  const legacy = families.find((family) => family.code === LEGACY_OUTDOOR_FAMILY_CODE);
  const hasOutdoorFamily = Boolean(
    legacy
    || families.some((family) => family.code === 'campings_terrains')
    || families.some((family) => family.code === 'aires_haltes_plein_air'),
  );
  const projected = families.filter((family) => family.code !== LEGACY_OUTDOOR_FAMILY_CODE);

  if (!hasOutdoorFamily) {
    return sortByPositionAndName(projected);
  }

  const legacyAliases = legacy ? [legacy.name, ...(legacy.aliases ?? [])] : [];
  const aliases = Array.from(new Set([...OUTDOOR_FAMILY_ALIASES, ...legacyAliases]));
  const targets: ExplorerAccommodationFamily[] = [
    {
      code: 'campings_terrains',
      name: 'Campings et terrains',
      description: accommodationFamilyDescription('campings_terrains'),
      position: 4,
      aliases,
    },
    {
      code: 'aires_haltes_plein_air',
      name: 'Aires et haltes de plein air',
      description: accommodationFamilyDescription('aires_haltes_plein_air'),
      position: 5,
      aliases,
    },
  ];

  for (const target of targets) {
    const existingIndex = projected.findIndex((family) => family.code === target.code);
    if (existingIndex < 0) {
      projected.push(target);
      continue;
    }

    const existing = projected[existingIndex];
    projected[existingIndex] = {
      ...existing,
      name: target.name,
      description: existing.description ?? target.description,
      position: target.position,
      aliases: Array.from(new Set([...(existing.aliases ?? []), ...aliases])),
    };
  }

  return sortByPositionAndName(projected);
}

function toAccommodationFamilies(rows: Array<{
  code: string;
  name: string;
  description: string | null;
  position: number | null;
  metadata?: unknown;
}>): ExplorerAccommodationFamily[] {
  return projectLegacyOutdoorAccommodationFamilies(rows.map((row) => ({
    code: row.code,
    name: row.name,
    description: row.description,
    position: row.position,
    aliases: readStringList(readRecord(row.metadata).aliases),
  })));
}

/**
 * Source taxonomique unique des filtres Explorer et du sélecteur de création.
 * Les deux surfaces voient ainsi exactement les mêmes domaines, nœuds actifs,
 * niveaux et libellés issus de ref_code.
 */
export async function listTaxonomyReferences(): Promise<ExplorerTaxonomyDomain[]> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return buildDemoReferences(ACCESSIBILITY_DISABILITY_REFERENCES).taxonomies;
  }

  const taxonomyDomainsResult = await client
    .from('ref_code_domain_registry')
    .select('domain,name,object_type,position')
    .eq('is_taxonomy', true)
    .neq('object_type', 'ORG')
    .order('position', { ascending: true });

  if (taxonomyDomainsResult.error) {
    throw taxonomyDomainsResult.error;
  }

  const taxonomyDomains = (taxonomyDomainsResult.data ?? []) as TaxonomyDomainRow[];
  const domainCodes = taxonomyDomains.map((domain) => domain.domain);
  const taxonomyNodesResult = domainCodes.length > 0
      ? await client
        .from('ref_code')
        .select('id,domain,code,name,description,parent_id,is_assignable,position,metadata')
        .in('domain', domainCodes)
        .eq('is_active', true)
        .order('position', { ascending: true })
    : { data: [], error: null };

  if (taxonomyNodesResult.error) {
    throw taxonomyNodesResult.error;
  }

  return buildTaxonomyDomains(
    taxonomyDomains,
    (taxonomyNodesResult.data ?? []) as TaxonomyNodeRow[],
  );
}

/**
 * §201 — familles d'hébergement seules (parcours de création guidée).
 * Le dialogue de création n'a pas besoin des ~20 catalogues de `listExplorerReferences`.
 */
export async function listAccommodationFamilies(): Promise<ExplorerAccommodationFamily[]> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return buildDemoReferences(ACCESSIBILITY_DISABILITY_REFERENCES).accommodationFamilies ?? [];
  }

  const result = await client
    .from('ref_code')
    .select('code,name,description,position,metadata')
    .eq('domain', 'accommodation_family')
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return toAccommodationFamilies((result.data ?? []) as Array<{
    code: string; name: string; description: string | null; position: number | null; metadata?: unknown;
  }>);
}

export async function listExplorerReferences(): Promise<ExplorerReferences> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return buildDemoReferences(ACCESSIBILITY_DISABILITY_REFERENCES);
  }

  const [
    metricsResult,
    applicabilityResult,
    taxonomies,
    accommodationFamiliesResult,
    practicesResult,
    environmentTagsResult,
    accommodationUnitTypesResult,
    amenityFamiliesResult,
    tagsResult,
    locationOptionsResult,
    accessibilityAmenitiesResult,
    sustainabilityCategoriesResult,
    sustainabilityActionsResult,
    rankedLabelSchemesResult,
    rankedLabelApplicabilityResult,
    capacityBoundsResult,
    rankedLabelSchemeValuesResult,
  ] = await Promise.all([
    client.from('ref_capacity_metric').select('id,code,name,position').order('position', { ascending: true }),
    client.from('ref_capacity_applicability').select('metric_id,object_type'),
    listTaxonomyReferences(),
    client.from('ref_code').select('code,name,description,position,metadata').eq('domain', 'accommodation_family').eq('is_active', true).order('position', { ascending: true }),
    client.from('ref_code').select('code,name,position').eq('domain', 'iti_practice').eq('is_active', true).order('position', { ascending: true }),
    // §154 — cadre & environnement (transverse, cf. ExplorerCommonFilters.environmentTagsAny).
    client.from('ref_code').select('code,name,position').eq('domain', 'environment_tag').eq('is_active', true).order('position', { ascending: true }),
    // §201 — types d'unité d'hébergement. Lu sur le PARENT `ref_code` avec un
    // filtre de domaine : les partitions filles ne sont pas exposées par PostgREST.
    client.from('ref_code').select('code,name,position').eq('domain', 'accommodation_unit_type').eq('is_active', true).eq('is_assignable', true).order('position', { ascending: true }),
    // §159 — familles de services & équipements (transverse).
    client.from('ref_code').select('code,name,position').eq('domain', 'amenity_family').eq('is_active', true).order('position', { ascending: true }),
    // §160 — catalogue des tags §09 (picker du panneau ; le click-to-filter reste l'autre voie).
    client.from('ref_tag').select('slug,name,color').order('position', { ascending: true }),
    client.schema('api').rpc('get_dashboard_filter_options'),
    client
      .from('ref_amenity')
      .select('code,name,description,extra,position,family:family_id(code,name)')
      .in('scope', ['object', 'both'])
      .order('position', { ascending: true }),
    client
      .from('ref_sustainability_action_category')
      .select('id,code,name,description,position')
      .order('position', { ascending: true }),
    client
      .from('ref_sustainability_action')
      .select('code,label,description,category_id,position')
      .order('position', { ascending: true }),
    client
      .from('ref_classification_scheme')
      .select('id,code,name,position,display_group')
      .eq('is_distinction', true)
      .order('position', { ascending: true }),
    // Applicabilité par type (manifest 16n). Requête SÉPARÉE et son échec est TOLÉRÉ
    // (cf. plus bas) : sur une base où la migration n'est pas encore passée, on retombe
    // sur « aucune restriction », c'est-à-dire le comportement d'avant. Un embed
    // PostgREST ferait au contraire échouer TOUT le chargement des références.
    client.from('ref_classification_scheme_applicability').select('scheme_id,object_type'),
    // 16o — bornes observées des métriques de capacité. Échec TOLÉRÉ comme ci-dessus :
    // sans la vue, les curseurs retombent sur une saisie numérique libre.
    client.from('v_capacity_metric_bounds').select('metric_code,object_type,value_min,value_max,sample_size'),
    client
      .from('ref_classification_value')
      .select('code,name,position,scheme:scheme_id(code,is_distinction)')
      .order('position', { ascending: true }),
  ]);

  if (metricsResult.error) {
    throw metricsResult.error;
  }
  if (applicabilityResult.error) {
    throw applicabilityResult.error;
  }
  if (accommodationFamiliesResult.error) {
    throw accommodationFamiliesResult.error;
  }
  if (practicesResult.error) {
    throw practicesResult.error;
  }
  if (environmentTagsResult.error) {
    throw environmentTagsResult.error;
  }
  if (amenityFamiliesResult.error) {
    throw amenityFamiliesResult.error;
  }
  if (tagsResult.error) {
    throw tagsResult.error;
  }
  if (locationOptionsResult.error) {
    throw locationOptionsResult.error;
  }
  if (accessibilityAmenitiesResult.error) {
    throw accessibilityAmenitiesResult.error;
  }
  if (sustainabilityCategoriesResult.error) {
    throw sustainabilityCategoriesResult.error;
  }
  if (sustainabilityActionsResult.error) {
    throw sustainabilityActionsResult.error;
  }
  if (rankedLabelSchemesResult.error) {
    throw rankedLabelSchemesResult.error;
  }
  if (rankedLabelSchemeValuesResult.error) {
    throw rankedLabelSchemeValuesResult.error;
  }

  const metrics = (metricsResult.data ?? []) as CapacityMetricRow[];
  const applicability = (applicabilityResult.data ?? []) as CapacityApplicabilityRow[];
  const practices = (practicesResult.data ?? []) as PracticeRow[];
  const environmentTags = (environmentTagsResult.data ?? []) as PracticeRow[];
  // §201 — tolérant à l'absence : tant que taxo6 n'est pas appliquée, le domaine
  // n'existe pas. Un throw ici priverait l'Explorateur de TOUS ses catalogues
  // pour un filtre qui n'a pas encore de données.
  const accommodationUnitTypes = (accommodationUnitTypesResult.error
    ? []
    : (accommodationUnitTypesResult.data ?? [])) as PracticeRow[];
  const accommodationPositionings = taxonomies
    .find((domain) => domain.domain === 'taxonomy_hot')
    ?.nodes
    .filter((node) => node.axis === 'positionnement' && node.isAssignable)
    .map((node) => ({ code: node.code, name: node.name, position: node.position })) ?? [];
  const amenityFamilies = (amenityFamiliesResult.data ?? []) as PracticeRow[];
  const locationOptions = locationOptionsResult.data as { cities: string[]; lieu_dits: string[] } | null;
  const accessibilityAmenities = (accessibilityAmenitiesResult.data ?? []) as AmenityRow[];
  const sustainabilityCategories = (sustainabilityCategoriesResult.data ?? []) as SustainabilityCategoryRow[];
  const sustainabilityActions = (sustainabilityActionsResult.data ?? []) as SustainabilityActionRow[];
  const rankedLabelSchemes = (rankedLabelSchemesResult.data ?? []) as LabelSchemeRow[];
  // 16n — échec TOLÉRÉ (pas de `throw`) : une base sans la table 16n retombe sur
  // « aucune restriction », le comportement historique. Un throw ici priverait
  // l'Explorer de TOUTES ses références pour une donnée d'affinage.
  const rankedLabelApplicability = rankedLabelApplicabilityResult.error
    ? []
    : ((rankedLabelApplicabilityResult.data ?? []) as LabelApplicabilityRow[]);
  // §174 — filtre JS aux schemes classés (is_distinction) : la table est petite, filtrer côté
  // client après un select embarqué reste simple et robuste (pas besoin d'un second aller-retour).
  const rankedLabelSchemeValues = ((rankedLabelSchemeValuesResult.data ?? []) as (ClassificationValueRow & { scheme: { code?: string | null; is_distinction?: boolean | null } | null })[])
    .filter((row) => row.scheme?.is_distinction === true);

  return {
    accessibilityDisabilityTypes: ACCESSIBILITY_DISABILITY_REFERENCES,
    accessibilityAmenities: buildAccessibilityAmenities(accessibilityAmenities),
    sustainabilityCategories: buildSustainabilityCategories(sustainabilityCategories, sustainabilityActions),
    rankedLabelSchemes: toRankedLabelOptions(rankedLabelSchemes, rankedLabelApplicability),
    rankedLabelSchemeValues: toRankedLabelSchemeValues(rankedLabelSchemeValues),
    taxonomies,
    // §201 — `metadata.aliases` porte l'ancien vocabulaire de famille (« Hôtellerie
    // de plein air »). Sans lui, un agent qui cherche l'ancien terme ne trouve
    // plus rien alors que DEUX familles le remplacent.
    accommodationFamilies: toAccommodationFamilies((accommodationFamiliesResult.data ?? []) as Array<{
      code: string; name: string; description: string | null; position: number | null; metadata?: unknown;
    }>),
    capacityBounds: toCapacityBounds(capacityBoundsResult.error ? [] : ((capacityBoundsResult.data ?? []) as CapacityBoundsRow[])),
    hotCapacityMetrics: bucketCapacityOptions('HOT', metrics, applicability),
    resCapacityMetrics: bucketCapacityOptions('RES', metrics, applicability),
    itiPractices: toReferenceOptions(practices),
    environmentTags: toReferenceOptions(environmentTags),
    accommodationUnitTypes: toReferenceOptions(accommodationUnitTypes),
    accommodationPositionings: toReferenceOptions(accommodationPositionings),
    amenityFamilies: toReferenceOptions(amenityFamilies),
    tags: ((tagsResult.data ?? []) as ExplorerTagFilter[]).filter((tag) => tag.slug && tag.name),
    cities: locationOptions?.cities ?? [],
    lieuDits: locationOptions?.lieu_dits ?? [],
  };
}

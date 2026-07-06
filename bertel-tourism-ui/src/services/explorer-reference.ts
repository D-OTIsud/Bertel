import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type {
  AccessibilityAmenityRef,
  AccessibilityDisabilityTypeCode,
  ExplorerReferenceOption,
  ExplorerReferences,
  ExplorerBucketKey,
  ExplorerTagFilter,
  SustainabilityActionRef,
  SustainabilityCategoryRef,
  ExplorerTaxonomyDomain,
  ExplorerTaxonomyNode,
} from '../types/domain';
import { ACCESSIBILITY_DISABILITY_TYPE_OPTIONS, EXPLORER_BUCKET_TYPE_MAP } from '../utils/facets';

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
  code: string;
  name: string;
  position: number | null;
  display_group: string | null;
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

function toRankedLabelOptions(rows: LabelSchemeRow[]): ExplorerReferenceOption[] {
  return [...rows]
    .map((row) => ({ row, family: rankedLabelFamily(row.display_group) }))
    .sort((a, b) => {
      if (a.family.order !== b.family.order) return a.family.order - b.family.order;
      const positionCompare =
        (a.row.position ?? Number.MAX_SAFE_INTEGER) - (b.row.position ?? Number.MAX_SAFE_INTEGER);
      if (positionCompare !== 0) return positionCompare;
      return a.row.name.localeCompare(b.row.name, 'fr', { sensitivity: 'base' });
    })
    .map(({ row, family }) => ({ code: row.code, name: row.name, group: family.label }));
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
    accessibilityDisabilityTypes: ACCESSIBILITY_DISABILITY_REFERENCES,
    rankedLabelSchemes: [
      { code: 'meuble_stars', name: 'Classement meublés', group: 'Classements' },
      // §176 — Gîtes de France = label noté de réseau (épis), groupe « Labels notés ».
      { code: 'gites_epics', name: 'Gîtes de France (épis)', group: 'Labels notés' },
      { code: 'qualite_tourisme_reunion', name: 'Qualité Tourisme Île de La Réunion', group: 'Labels qualité' },
      { code: 'LBL_CLEF_VERTE', name: 'Clef Verte', group: 'Durabilité' },
      { code: 'LBL_TOURISME_HANDICAP', name: 'Tourisme & Handicap', group: 'Accessibilité' },
    ],
    rankedLabelSchemeValues: {
      meuble_stars: [
        { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
        { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
      ],
      gites_epics: [
        { code: '1', name: '1 épi' }, { code: '2', name: '2 épis' }, { code: '3', name: '3 épis' },
        { code: '4', name: '4 épis' }, { code: '5', name: '5 épis' },
      ],
    },
    accessibilityAmenities: [
      { code: 'acc_pmr_parking', name: 'Places PMR', disabilityTypes: ['motor'] },
      { code: 'acc_step_removal', name: 'Acces sans ressaut', disabilityTypes: ['motor'] },
      { code: 'acc_magnetic_loop', name: 'Boucle magnetique', disabilityTypes: ['hearing'] },
      { code: 'acc_subtitles', name: 'Sous-titrage', disabilityTypes: ['hearing'] },
      { code: 'acc_braille_signage', name: 'Signaletique braille', disabilityTypes: ['visual'] },
      { code: 'acc_falc_docs', name: 'Documents en FALC', disabilityTypes: ['cognitive'] },
      { code: 'acc_staff_mental_training', name: 'Personnel forme - sante mentale', disabilityTypes: ['cognitive'] },
    ],
    sustainabilityCategories: [
      {
        code: 'CAT_ENERGY',
        name: 'Energie',
        description: 'Reduction et pilotage des consommations.',
        actions: [
          { code: 'MA_LOW_ENERGY_LIGHTING', name: 'Eclairage basse consommation', categoryCode: 'CAT_ENERGY' },
          { code: 'MA_RENEWABLE_ENERGY', name: 'Energie renouvelable', categoryCode: 'CAT_ENERGY' },
        ],
      },
      {
        code: 'CAT_WASTE',
        name: 'Dechets',
        description: 'Tri, reduction et reemploi.',
        actions: [
          { code: 'MA_SORTING_BINS', name: 'Tri des dechets', categoryCode: 'CAT_WASTE' },
          { code: 'MA_DURABLE_GOODS_REUSE', name: 'Reemploi et reparation', categoryCode: 'CAT_WASTE' },
        ],
      },
      {
        code: 'CAT_MOBILITY',
        name: 'Mobilite',
        description: 'Acces et mobilites durables.',
        actions: [
          { code: 'MA_BIKE_PARKING', name: 'Stationnement velo', categoryCode: 'CAT_MOBILITY' },
          { code: 'MA_EV_CHARGING', name: 'Recharge electrique', categoryCode: 'CAT_MOBILITY' },
        ],
      },
    ],
    cities: DEMO_CITIES,
    lieuDits: [],
    taxonomies: [
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
      {
        domain: 'taxonomy_res',
        name: 'Taxonomie RES',
        objectType: 'RES',
        nodes: [
          { code: 'restaurant', name: 'Restaurant', parentCode: null, depth: 0, isAssignable: true, position: 1 },
          { code: 'table_d_hotes', name: "Table d'hôtes", parentCode: null, depth: 0, isAssignable: true, position: 2 },
          { code: 'pizzeria', name: 'Pizzeria', parentCode: null, depth: 0, isAssignable: true, position: 3 },
          { code: 'snack_bar', name: 'Snack-bar', parentCode: 'restaurant', depth: 1, isAssignable: true, position: 4 },
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
    environmentTags: [
      { code: 'bord_mer', name: 'Bord de mer' },
      { code: 'montagne', name: 'Montagne' },
      { code: 'volcan', name: 'Au pied du volcan' },
      { code: 'foret', name: 'Forêt' },
      { code: 'vue_panoramique', name: 'Vue panoramique' },
    ],
    amenityFamilies: [
      { code: 'outdoor', name: 'Plein air' },
      { code: 'wellness', name: 'Bien-être' },
      { code: 'parking', name: 'Parking' },
      { code: 'gastronomy', name: 'Gastronomie' },
    ],
    tags: [
      { slug: 'spa', name: 'Spa', color: '#176b6a' },
      { slug: 'famille', name: 'Famille', color: '#8a5b12' },
      { slug: 'vue-mer', name: 'Vue mer', color: '#1c4d8f' },
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
    environmentTagsResult,
    amenityFamiliesResult,
    tagsResult,
    locationOptionsResult,
    accessibilityAmenitiesResult,
    sustainabilityCategoriesResult,
    sustainabilityActionsResult,
    rankedLabelSchemesResult,
    rankedLabelSchemeValuesResult,
  ] = await Promise.all([
    client.from('ref_capacity_metric').select('id,code,name,position').order('position', { ascending: true }),
    client.from('ref_capacity_applicability').select('metric_id,object_type'),
    // §155 — TOUS les domaines de sous-catégories (un par type), plus seulement
    // taxonomy_hot. ORG exclu (pas un bucket Explorer).
    client
      .from('ref_code_domain_registry')
      .select('domain,name,object_type,position')
      .eq('is_taxonomy', true)
      .neq('object_type', 'ORG')
      .order('position', { ascending: true }),
    client.from('ref_code').select('code,name,position').eq('domain', 'iti_practice').eq('is_active', true).order('position', { ascending: true }),
    // §154 — cadre & environnement (transverse, cf. ExplorerCommonFilters.environmentTagsAny).
    client.from('ref_code').select('code,name,position').eq('domain', 'environment_tag').eq('is_active', true).order('position', { ascending: true }),
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
      .select('code,name,position,display_group')
      .eq('is_distinction', true)
      .order('position', { ascending: true }),
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
  if (taxonomyDomainsResult.error) {
    throw taxonomyDomainsResult.error;
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
  const environmentTags = (environmentTagsResult.data ?? []) as PracticeRow[];
  const amenityFamilies = (amenityFamiliesResult.data ?? []) as PracticeRow[];
  const locationOptions = locationOptionsResult.data as { cities: string[]; lieu_dits: string[] } | null;
  const accessibilityAmenities = (accessibilityAmenitiesResult.data ?? []) as AmenityRow[];
  const sustainabilityCategories = (sustainabilityCategoriesResult.data ?? []) as SustainabilityCategoryRow[];
  const sustainabilityActions = (sustainabilityActionsResult.data ?? []) as SustainabilityActionRow[];
  const rankedLabelSchemes = (rankedLabelSchemesResult.data ?? []) as LabelSchemeRow[];
  // §174 — filtre JS aux schemes classés (is_distinction) : la table est petite, filtrer côté
  // client après un select embarqué reste simple et robuste (pas besoin d'un second aller-retour).
  const rankedLabelSchemeValues = ((rankedLabelSchemeValuesResult.data ?? []) as (ClassificationValueRow & { scheme: { code?: string | null; is_distinction?: boolean | null } | null })[])
    .filter((row) => row.scheme?.is_distinction === true);

  return {
    accessibilityDisabilityTypes: ACCESSIBILITY_DISABILITY_REFERENCES,
    accessibilityAmenities: buildAccessibilityAmenities(accessibilityAmenities),
    sustainabilityCategories: buildSustainabilityCategories(sustainabilityCategories, sustainabilityActions),
    rankedLabelSchemes: toRankedLabelOptions(rankedLabelSchemes),
    rankedLabelSchemeValues: toRankedLabelSchemeValues(rankedLabelSchemeValues),
    taxonomies: buildTaxonomyDomains(taxonomyDomains, taxonomyNodes),
    hotCapacityMetrics: bucketCapacityOptions('HOT', metrics, applicability),
    resCapacityMetrics: bucketCapacityOptions('RES', metrics, applicability),
    itiPractices: toReferenceOptions(practices),
    environmentTags: toReferenceOptions(environmentTags),
    amenityFamilies: toReferenceOptions(amenityFamilies),
    tags: ((tagsResult.data ?? []) as ExplorerTagFilter[]).filter((tag) => tag.slug && tag.name),
    cities: locationOptions?.cities ?? [],
    lieuDits: locationOptions?.lieu_dits ?? [],
  };
}

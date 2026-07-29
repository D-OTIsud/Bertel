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
          { code: 'hotel', name: 'Hôtel', description: 'Établissement hôtelier.', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'hotellerie', aliases: [], sourceRef: 'Code du tourisme art. D311-4' },
          { code: 'boutique_hotel', name: 'Hôtel boutique', parentCode: 'hotel', depth: 1, isAssignable: true, position: 2, axis: 'positionnement', family: 'hotellerie', aliases: [] },
          { code: 'family_hotel', name: 'Hôtel familial', parentCode: 'hotel', depth: 1, isAssignable: true, position: 3, axis: 'positionnement', family: 'hotellerie', aliases: [] },
          { code: 'business_hotel', name: 'Hôtel d’affaires', parentCode: 'hotel', depth: 1, isAssignable: true, position: 4, axis: 'positionnement', family: 'hotellerie', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_hlo',
        name: 'Taxonomie HLO',
        objectType: 'HLO',
        nodes: [
          { code: 'chambre_d_hotes', name: "Chambre d'hôtes", parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'locatif', aliases: [] },
          { code: 'location_saisonniere', name: 'Meublé de tourisme', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'locatif', aliases: ['Gîte', 'Location saisonnière'] },
          { code: 'auberge_collective', name: 'Auberge', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'collectif', aliases: ['Auberge collective'] },
          { code: 'gite_de_groupe', name: 'Gîte', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'collectif', aliases: ['Gîte de groupe'] },
          { code: 'gite_de_randonnee', name: "Refuge et gîte d'étape", parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'collectif', aliases: ["Gîte d'étape et de randonnée"] },
        ],
      },
      {
        domain: 'taxonomy_rva',
        name: 'Taxonomie RVA',
        objectType: 'RVA',
        nodes: [
          { code: 'tourism_residence', name: 'Résidence de tourisme', parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'collectif', aliases: [] },
          { code: 'holiday_village', name: 'Village de vacances', parentCode: null, depth: 0, isAssignable: true, position: 5, axis: 'nature', family: 'collectif', aliases: [] },
          { code: 'aparthotel', name: 'Résidence hôtelière', parentCode: null, depth: 0, isAssignable: true, position: 6, axis: 'nature', family: 'collectif', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_camp',
        name: 'Taxonomie CAMP',
        objectType: 'CAMP',
        nodes: [
          { code: 'camping', name: 'Camping', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'campings_terrains', aliases: ['Camping aménagé', 'Camping classé'] },
        ],
      },
      {
        domain: 'taxonomy_hpa',
        name: 'Taxonomie HPA',
        objectType: 'HPA',
        nodes: [
          { code: 'natural_camp_area', name: 'Aire naturelle de camping', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'campings_terrains', aliases: [] },
          { code: 'declared_campground', name: 'Terrain de camping déclaré', parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'campings_terrains', aliases: [] },
          { code: 'farm_camping', name: 'Camping à la ferme', parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 1, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
          { code: 'homestay_camping', name: "Camping chez l'habitant", parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 2, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
          { code: 'residential_leisure_park', name: 'Parc résidentiel de loisirs', parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'campings_terrains', aliases: ['PRL'] },
          { code: 'bivouac_area', name: 'Aire de bivouac', parentCode: null, depth: 0, isAssignable: true, position: 10, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'motorhome_area', name: "Aire d'accueil camping-car", parentCode: null, depth: 0, isAssignable: true, position: 11, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'motorhome_night_stop', name: 'Halte nocturne camping-car/van', parentCode: null, depth: 0, isAssignable: true, position: 12, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
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
    // §201 — `plein_air` est retirée : elle mélangeait un TERRAIN de camping et
    // une simple autorisation de halte. Les deux familles qui la remplacent
    // portent son libellé en alias, car l'ancien terme les recouvrait toutes les
    // deux : une recherche sur « plein air » doit proposer les deux.
    accommodationFamilies: [
      { code: 'hotellerie', name: 'Hôtellerie', position: 1 },
      { code: 'locatif', name: 'Hébergement locatif', position: 2 },
      { code: 'collectif', name: 'Hébergement collectif', position: 3 },
      { code: 'campings_terrains', name: 'Campings et terrains', position: 4, aliases: ['Hôtellerie de plein air', 'Hébergement de plein air'] },
      { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air', position: 5, aliases: ['Hôtellerie de plein air', 'Hébergement de plein air'] },
    ],
    // Démo : les métriques portent leurs types applicables comme en live, sinon le
    // scoping par sous-type (16o) ne serait pas exerçable dans ce mode.
    hotCapacityMetrics: [
      { code: 'beds', name: 'Lits', objectTypes: ['HOT', 'HLO', 'HPA', 'CAMP', 'RVA'] },
      { code: 'bedrooms', name: 'Chambres', objectTypes: ['HOT', 'HLO', 'RVA'] },
      { code: 'pitches', name: 'Emplacements', objectTypes: ['CAMP', 'HPA'] },
    ],
    resCapacityMetrics: [
      { code: 'seats', name: 'Places assises', objectTypes: ['RES'] },
      { code: 'standing_places', name: 'Places debout', objectTypes: ['RES'] },
    ],
    capacityBounds: {
      beds: { HOT: { min: 4, max: 120, sampleSize: 6 }, HLO: { min: 2, max: 14, sampleSize: 22 } },
      bedrooms: { HOT: { min: 2, max: 60, sampleSize: 6 } },
      seats: { RES: { min: 12, max: 180, sampleSize: 14 } },
    },
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
    // §201 — types d'unité d'hébergement (axe multi-valué).
    accommodationUnitTypes: [
      { code: 'house_villa', name: 'Maison / villa' },
      { code: 'apartment', name: 'Appartement' },
      { code: 'studio', name: 'Studio' },
      { code: 'room', name: 'Chambre' },
      { code: 'bungalow', name: 'Bungalow' },
      { code: 'chalet', name: 'Chalet' },
      { code: 'mobile_home', name: 'Mobil-home' },
      { code: 'caravan', name: 'Roulotte' },
      { code: 'dormitory', name: 'Dortoir' },
      { code: 'bare_pitch', name: 'Emplacement nu' },
      { code: 'equipped_pitch', name: 'Emplacement équipé' },
      { code: 'bubble', name: 'Bulle' },
      { code: 'cabin', name: 'Cabane' },
      { code: 'lodge', name: 'Lodge' },
      { code: 'tipi', name: 'Tipi' },
      { code: 'yurt', name: 'Yourte' },
      { code: 'furnished_tent', name: 'Tente aménagée' },
      { code: 'dome', name: 'Dôme' },
      { code: 'tiny_house', name: 'Tiny house' },
      { code: 'boat', name: 'Péniche / bateau' },
      { code: 'unusual_outdoor_unit', name: 'Insolite' },
      { code: 'other', name: 'Autre' },
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

/**
 * Source taxonomique unique des filtres Explorer et du sélecteur de création.
 * Les deux surfaces voient ainsi exactement les mêmes domaines, nœuds actifs,
 * niveaux et libellés issus de ref_code.
 */
export async function listTaxonomyReferences(): Promise<ExplorerTaxonomyDomain[]> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return buildDemoReferences().taxonomies;
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
    return buildDemoReferences().accommodationFamilies ?? [];
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
    return buildDemoReferences();
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
    amenityFamilies: toReferenceOptions(amenityFamilies),
    tags: ((tagsResult.data ?? []) as ExplorerTagFilter[]).filter((tag) => tag.slug && tag.name),
    cities: locationOptions?.cities ?? [],
    lieuDits: locationOptions?.lieu_dits ?? [],
  };
}

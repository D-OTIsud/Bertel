import { useState } from 'react';
import { Check, ChevronDown, Info, Search, X } from 'lucide-react';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import type {
  AccessibilityAmenityRef,
  AccessibilityDisabilityTypeCode,
  BackendObjectTypeCode,
  ExplorerBucketKey,
  ExplorerFilters,
  ExplorerAccommodationFamily,
  ExplorerReferences,
  ExplorerStatusFilter,
  ExplorerTaxonomyDomain,
  ExplorerTaxonomyNode,
  SustainabilityActionRef,
  TaxonomyRef,
} from '../../types/domain';
import {
  ACCESSIBILITY_DISABILITY_TYPE_OPTIONS,
  EXPLORER_BUCKET_OPTIONS,
  EXPLORER_BUCKET_TYPE_MAP,
  DEFAULT_HOT_SUBTYPES,
  DEFAULT_SRV_SUBTYPES,
  DEFAULT_VIS_SUBTYPES,
  HOT_BUCKET_TYPES,
  HEADLINE_CAPACITY_METRIC,
  bucketForTaxonomyDomain,
  filterOptionsBySelectedBuckets,
  isSubtypeNarrowed,
  resolveCapacityBounds,
  resolveExplorerStatuses,
} from '../../utils/facets';
import { resolveTypeLabel } from '../../utils/labels';
import { schemeUnit } from '../../utils/explorer-card-display';
import { Input } from '@/components/ui/input';
import { FilterDropdown } from '../dashboard/FilterDropdown';
import { FilterColumnGroup } from '../common/FilterColumnGroup';
import { GradeBar } from './GradeBar';
import { tagChipStyle } from '../../utils/explorer-card';
import { cn } from '@/lib/utils';
import { RangeSlider } from '@/components/ui/range-slider';
import { buildExplorerActiveChips } from './explorer-active-chips';
import {
  accommodationBreadcrumb,
  buildAccommodationTaxonomyTree,
  filterAccommodationNatures,
  type AccommodationTaxonomyEntry,
} from './accommodation-taxonomy-tree';
import { CapacityCriteria } from './CapacityCriteria';
import {
  accommodationFamilyDescription,
  accommodationNatureDescription,
} from '../../utils/accommodation-help';

/** Unités affichées à côté des valeurs de capacité — seulement là où elles éclairent. */
const HOT_CAPACITY_UNITS: Record<string, string> = { beds: 'lits', bedrooms: 'ch.', pitches: 'empl.', floor_area_m2: 'm²' };
const RES_CAPACITY_UNITS: Record<string, string> = { seats: 'places', standing_places: 'places' };

const STATUS_OPTIONS: Array<{ code: ExplorerStatusFilter; label: string }> = [
  { code: 'published', label: 'Publié' },
  { code: 'draft', label: 'Brouillon' },
];

const ACCOMMODATION_AXIS_LABELS = {
  nature: "Nature d'hébergement",
  sous_type: "Sous-type d'hébergement",
  type_unite: "Type d'unité d'hébergement",
  positionnement: 'Positionnement',
} as const;

// Le catalogue sémantique est la projection utilisateur de référence. Les
// partitions techniques HOT/HLO/HPA/CAMP/RVA ne doivent plus être exposées.
const ENABLE_SEMANTIC_ACCOMMODATION_LAYOUT = true;

function foldAccommodationTerm(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[’']/g, ' ').trim();
}

function accommodationNodeMatches(node: ExplorerTaxonomyNode, query: string): boolean {
  if (!query) return true;
  return [node.name, node.description ?? '', node.sourceRef ?? '', ...(node.aliases ?? [])]
    .some((value) => foldAccommodationTerm(value).includes(query));
}

/** §156 — l'échelle FFRandonnée 1-5 en trois segments parlants (bornes min/max du store). */
const DIFFICULTY_SEGMENTS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'Facile (1-2)', max: 2 },
  { label: 'Moyen (3)', min: 3, max: 3 },
  { label: 'Difficile (4-5)', min: 4 },
];
// §153 : plus de map de libellés locale — resolveTypeLabel (TYPE_LABEL) est la
// source unique, la même que les cartes résultats et le tiroir.

interface FiltersPanelProps {
  references?: ExplorerReferences;
  /** Hook de store à piloter — défaut = singleton Explorer (Explorer & tests inchangés). */
  useStore?: typeof useExplorerStore;
  /** Rendre les sections de facettes SPÉCIFIQUES par type (capacité, ITI, EVT…). Défaut true.
   *  Le Dashboard passe false hors mono-bucket (§7 : honnête seulement en 1 bucket). */
  typeSpecificFacets?: boolean;
}

function readCapacityValue(filters: Array<{ code: string; min?: number; max?: number }>, code: string, key: 'min' | 'max'): number | undefined {
  return filters.find((filter) => filter.code === code)?.[key];
}

function countActiveRanges(filters: Array<{ code: string; min?: number; max?: number }>): number {
  return filters.filter((filter) => filter.min != null || filter.max != null).length;
}

/** §155 — nombre de sous-catégories sélectionnées appartenant à un bucket. */
function taxonomyCountForBucket(taxonomyAny: TaxonomyRef[], bucket: ExplorerBucketKey): number {
  return taxonomyAny.filter((item) => bucketForTaxonomyDomain(item.domain) === bucket).length;
}

/** §155 — domaines de sous-catégories d'un type d'objet (l'union rend le « Type de … » du bucket). */
function domainsForType(references: ExplorerReferences | undefined, type: BackendObjectTypeCode): ExplorerTaxonomyDomain[] {
  return (references?.taxonomies ?? []).filter((domain) => domain.objectType === type);
}

function renderNumber(value?: number): string {
  return value == null ? '' : String(value);
}

function isBucketSelected(selectedBuckets: ExplorerBucketKey[], bucket: ExplorerBucketKey): boolean {
  return selectedBuckets.includes(bucket);
}

function hasOverlap(left: readonly string[], right: readonly string[]): boolean {
  return left.some((item) => right.includes(item));
}

function filterAccessibilityAmenities(
  amenities: AccessibilityAmenityRef[],
  selectedTypes: string[] | undefined,
  selectedAmenityCodes: string[] | undefined,
): AccessibilityAmenityRef[] {
  const types = selectedTypes ?? [];
  const codes = selectedAmenityCodes ?? [];

  if (types.length === 0) {
    return amenities.filter((amenity) => codes.includes(amenity.code));
  }

  return amenities.filter(
    (amenity) =>
      codes.includes(amenity.code) ||
      hasOverlap(amenity.disabilityTypes ?? [], types),
  );
}

function flattenSustainabilityActions(references?: ExplorerReferences): SustainabilityActionRef[] {
  return (references?.sustainabilityCategories ?? []).flatMap((category) => category.actions);
}

function filterSustainabilityActions(
  references: ExplorerReferences | undefined,
  selectedCategoryCodes: string[] | undefined,
  selectedActionCodes: string[] | undefined,
): SustainabilityActionRef[] {
  const categoryCodes = selectedCategoryCodes ?? [];
  const actionCodes = selectedActionCodes ?? [];
  const actions = flattenSustainabilityActions(references);
  if (categoryCodes.length === 0 && actionCodes.length === 0) {
    return [];
  }

  return actions.filter(
    (action) =>
      actionCodes.includes(action.code) ||
      categoryCodes.includes(action.categoryCode),
  );
}

export function FiltersPanel({ references, useStore = useExplorerStore, typeSpecificFacets = true }: FiltersPanelProps) {
  const [accommodationQuery, setAccommodationQuery] = useState('');
  const [openAccommodationFamily, setOpenAccommodationFamily] = useState<string | null>('locatif');
  const [showAccommodationComplements, setShowAccommodationComplements] = useState(false);
  /** §201 — sous-arbres de nature dépliés (clé `domaine:code`), ex. Terrain de camping déclaré. */
  const [openAccommodationSubtrees, setOpenAccommodationSubtrees] = useState<string[]>([]);
  const selectedBuckets = useStore((state) => state.selectedBuckets);
  const common = useStore((state) => state.common);
  const cities = common.cities ?? [];
  const tagsAny = common.tagsAny ?? [];
  const rankedLabelSchemeCode = common.rankedLabelSchemeCode ?? null;
  const statuses = common.statuses ?? [];
  const pmr = common.pmr === true;
  const accessibilityDisabilityTypesAny = common.accessibilityDisabilityTypesAny ?? [];
  const accessibilityAmenityCodesAny = common.accessibilityAmenityCodesAny ?? [];
  const sustainable = common.sustainable === true;
  const environmentTagsAny = common.environmentTagsAny ?? [];
  const accommodationUnitTypesAny = common.accommodationUnitTypesAny ?? [];
  const amenityFamiliesAny = common.amenityFamiliesAny ?? [];
  const taxonomyAny = common.taxonomyAny ?? [];
  const sustainabilityCategoryCodesAny = common.sustainabilityCategoryCodesAny ?? [];
  const sustainabilityActionCodesAny = common.sustainabilityActionCodesAny ?? [];
  const hot = useStore((state) => state.hot);
  const res = useStore((state) => state.res);
  const iti = useStore((state) => state.iti);
  const evt = useStore((state) => state.evt);
  const vis = useStore((state) => state.vis);
  const srv = useStore((state) => state.srv);
  const toggleBucket = useStore((state) => state.toggleBucket);
  const setCities = useStore((state) => state.setCities);
  const setLieuDit = useStore((state) => state.setLieuDit);
  const setPmr = useStore((state) => state.setPmr);
  const toggleAccessibilityDisabilityType = useStore((state) => state.toggleAccessibilityDisabilityType);
  const toggleAccessibilityAmenity = useStore((state) => state.toggleAccessibilityAmenity);
  const setSustainable = useStore((state) => state.setSustainable);
  const toggleSustainabilityCategory = useStore((state) => state.toggleSustainabilityCategory);
  const toggleSustainabilityAction = useStore((state) => state.toggleSustainabilityAction);
  const setPetsAccepted = useStore((state) => state.setPetsAccepted);
  const setOpenNow = useStore((state) => state.setOpenNow);
  const setEnvironmentTags = useStore((state) => state.setEnvironmentTags);
  const setAccommodationUnitTypes = useStore((state) => state.setAccommodationUnitTypes);
  const setOpenAt = useStore((state) => state.setOpenAt);
  const setEvtEventRange = useStore((state) => state.setEvtEventRange);
  const setAmenityFamilies = useStore((state) => state.setAmenityFamilies);
  const setRankedLabelScheme = useStore((state) => state.setRankedLabelScheme);
  const setRankedLabelIncludeEquivalents = useStore((state) => state.setRankedLabelIncludeEquivalents);
  const toggleTag = useStore((state) => state.toggleTag);
  const clearTags = useStore((state) => state.clearTags);
  const toggleHotSubtype = useStore((state) => state.toggleHotSubtype);
  const toggleVisSubtype = useStore((state) => state.toggleVisSubtype);
  const toggleSrvSubtype = useStore((state) => state.toggleSrvSubtype);
  const toggleTaxonomy = useStore((state) => state.toggleTaxonomy);
  const setHotCapacityFilter = useStore((state) => state.setHotCapacityFilter);
  const setResCapacityFilter = useStore((state) => state.setResCapacityFilter);
  const setHotMeetingRoom = useStore((state) => state.setHotMeetingRoom);
  const setItiIsLoop = useStore((state) => state.setItiIsLoop);
  const setItiDifficulty = useStore((state) => state.setItiDifficulty);
  const setItiDistance = useStore((state) => state.setItiDistance);
  const setItiDuration = useStore((state) => state.setItiDuration);
  const toggleItiPractice = useStore((state) => state.toggleItiPractice);
  const resetAll = useStore((state) => state.resetAll);
  const setStatuses = useStore((state) => state.setStatuses);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const showHot = isBucketSelected(selectedBuckets, 'HOT');
  const showRes = isBucketSelected(selectedBuckets, 'RES');
  const showIti = isBucketSelected(selectedBuckets, 'ITI');
  const showAct = isBucketSelected(selectedBuckets, 'ACT');
  const showEvt = isBucketSelected(selectedBuckets, 'EVT');
  const showVis = isBucketSelected(selectedBuckets, 'VIS');
  const showSrv = isBucketSelected(selectedBuckets, 'SRV');
  const effectiveStatuses = resolveExplorerStatuses(statuses, canEditObjects);

  /**
   * « N actifs » = le nombre exact de pastilles de la barre de filtres actifs.
   *
   * L'ancienne implémentation ré-énumérait les critères à la main et divergeait de la
   * barre sur quatre points (buckets et statuts comptés 1 quel qu'en soit le nombre,
   * niveaux de classement et « label obtenu uniquement » non comptés) : trois buckets +
   * deux statuts + un niveau affichaient « 2 actifs » au-dessus de 6 pastilles. Deux
   * compteurs co-visibles ne peuvent pas avoir deux implémentations — c'est l'exigence
   * §152 appliquée jusqu'au bout.
   *
   * Le sélecteur renvoie un NOMBRE : pas de nouvelle référence à chaque rendu.
   */
  const activeFilterCount = useStore((s) => buildExplorerActiveChips(s as unknown as ExplorerFilters).length);

  const accessibilityDisabilityTypes: Array<{ code: AccessibilityDisabilityTypeCode; label: string }> =
    references?.accessibilityDisabilityTypes?.length
      ? references.accessibilityDisabilityTypes.map((option) => ({
          code: option.code as AccessibilityDisabilityTypeCode,
          label: option.name,
        }))
      : ACCESSIBILITY_DISABILITY_TYPE_OPTIONS;
  const accessibilityAmenities = references?.accessibilityAmenities ?? [];
  const visibleAccessibilityAmenities = filterAccessibilityAmenities(
    accessibilityAmenities,
    accessibilityDisabilityTypesAny,
    accessibilityAmenityCodesAny,
  );
  const sustainabilityCategories = references?.sustainabilityCategories ?? [];
  const visibleSustainabilityActions = filterSustainabilityActions(
    references,
    sustainabilityCategoryCodesAny,
    sustainabilityActionCodesAny,
  );
  const accessibilityDetailCount = accessibilityDisabilityTypesAny.length + accessibilityAmenityCodesAny.length;
  const sustainabilityDetailCount = sustainabilityCategoryCodesAny.length + sustainabilityActionCodesAny.length;
  // 16n — la liste suit les catégories cochées : proposer « Classement hôtelier » avec le
  // seul bucket Visites était une promesse vide (aucun résultat possible). Le scheme
  // sélectionné reste dans la liste même s'il devient inapplicable, sinon on afficherait
  // un sélecteur vide pour un filtre pourtant actif.
  const rankedLabelOptions = filterOptionsBySelectedBuckets(
    references?.rankedLabelSchemes ?? [],
    selectedBuckets,
    rankedLabelSchemeCode,
  );
  // §174 — niveaux du scheme classé actif (étoiles/épis/clés…), pour la barre GradeBar.
  const rankedLabelValues = (rankedLabelSchemeCode && references?.rankedLabelSchemeValues?.[rankedLabelSchemeCode]) || [];
  // « Gradué » = ≥2 niveaux (classement hôtelier, épis, clés…) — même gate que la GradeBar.
  // Un scheme gradué est un classement, pas un label : les démarches équivalentes (§173)
  // n'existent que pour les labels ⇒ le toggle « Inclure les démarches équivalentes » est masqué.
  const rankedSchemeIsGraded = rankedLabelValues.length >= 2;
  const setRankedLabelValueCodes = useStore((state) => state.setRankedLabelValueCodes);
  const labelFilterCount = rankedLabelSchemeCode ? 1 : 0;

  // §152 — sections type-spécifiques repliables : le compte de critères actifs
  // vit dans l'en-tête, visible section repliée (un filtre actif n'est jamais
  // masqué par le pli — même exigence d'honnêteté que la barre de chips D23).
  const hotSectionCount =
    (isSubtypeNarrowed(hot.subtypes, DEFAULT_HOT_SUBTYPES) ? 1 : 0) +
    taxonomyCountForBucket(taxonomyAny, 'HOT') +
    countActiveRanges(hot.capacityFilters) +
    (Object.values(hot.meetingRoom).some((value) => value != null) ? 1 : 0);
  const resSectionCount = taxonomyCountForBucket(taxonomyAny, 'RES') + countActiveRanges(res.capacityFilters);
  const itiSectionCount =
    taxonomyCountForBucket(taxonomyAny, 'ITI') +
    (iti.isLoop != null ? 1 : 0) +
    (iti.difficultyMin != null || iti.difficultyMax != null ? 1 : 0) +
    (iti.distanceMinKm != null || iti.distanceMaxKm != null ? 1 : 0) +
    (iti.durationMinH != null || iti.durationMaxH != null ? 1 : 0) +
    iti.practicesAny.length;
  const actSectionCount = taxonomyCountForBucket(taxonomyAny, 'ACT');
  const evtSectionCount = taxonomyCountForBucket(taxonomyAny, 'EVT') + (evt.eventFrom || evt.eventTo ? 1 : 0);
  const visSectionCount =
    (isSubtypeNarrowed(vis.subtypes, DEFAULT_VIS_SUBTYPES) ? 1 : 0) + taxonomyCountForBucket(taxonomyAny, 'VIS');
  const srvSectionCount =
    (isSubtypeNarrowed(srv.subtypes, DEFAULT_SRV_SUBTYPES) ? 1 : 0) + taxonomyCountForBucket(taxonomyAny, 'SRV');

  const bucketChipClass = (active: boolean) =>
    cn(
      'inline-flex min-h-[28px] items-center rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold transition',
      active ? 'border-teal bg-teal text-white shadow-s' : 'border-line bg-surface text-ink hover:border-lineStrong hover:bg-surface2',
    );

  const isTaxonomyActive = (domain: string, code: string) =>
    taxonomyAny.some((item) => item.domain === domain && item.code === code);

  // §155-bis — copy honnête : tant que les références ne sont pas chargées c'est
  // un chargement ; une fois chargées, un domaine absent est « indisponible »
  // (jamais un « Chargement… » menteur qui ne finit pas).
  const taxonomyCatalogFallback = (
    <p className="text-[12px] leading-snug text-ink-3">
      {references ? 'Catalogue de sous-catégories indisponible.' : 'Chargement du catalogue…'}
    </p>
  );

  /**
   * §161 — chip de sous-catégorie : plus petite que la rangée de catégorie et
   * que les boutons de bucket (la classe globale `.chip` héritait du 16px du
   * document — l'override compact `.filters-panel` est mort depuis la refonte
   * du panneau ; on style en local comme le reste du panneau).
   */
  const taxonomyChipClass = (active: boolean) =>
    cn(
      'inline-flex min-h-[26px] items-center rounded-[8px] border px-2 py-0.5 text-[12px] font-medium transition',
      active ? 'border-teal bg-teal text-white shadow-s' : 'border-line bg-surface text-ink-2 hover:border-lineStrong hover:bg-surface2',
    );

  /**
   * §155 — chips de sous-catégories d'un type (union de ses domaines), en ordre
   * d'arbre (parents avant enfants), sans fausse indentation (l'ancien
   * margin-left par profondeur perdait tout sens au premier retour à la ligne).
   * §155-bis — `onActivate` : sélectionner une sous-catégorie d'un type exclu
   * ré-inclut le type (sinon types ∩ sous-catégorie = ∅ ⇒ 0 résultat muet).
   */
  const renderTaxonomyChips = (type: BackendObjectTypeCode, onActivate?: () => void) => {
    const domains = domainsForType(references, type);
    if (domains.length === 0) {
      return null;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {domains.flatMap((domain) =>
          domain.nodes.map((node) => {
            const active = isTaxonomyActive(domain.domain, node.code);
            return (
              <button
                key={`${domain.domain}:${node.code}`}
                type="button"
                className={taxonomyChipClass(active)}
                onClick={() => {
                  if (!active) {
                    onActivate?.();
                  }
                  toggleTaxonomy(domain.domain, node.code);
                }}
                aria-pressed={active}
              >
                {node.name}
              </button>
            );
          }),
        )}
      </div>
    );
  };

  /**
   * §155 — bloc « Type de … » d'un bucket multi-types (HOT/VIS/SRV) : chaque
   * type est une ligne-titre TOGGLE (le sous-type) suivie de ses sous-catégories.
   * Fusionne les anciens « Sous-types » + « Taxonomie » en un seul étage lisible.
   * §161 — la catégorie est une RANGÉE pleine largeur façon case à cocher
   * (état lisible même quand tout est sélectionné par défaut), plus un gros
   * bouton plein : trois niveaux distincts — bucket > catégorie > chips.
   */
  const typeRowClass = (active: boolean) =>
    cn(
      'mb-1.5 flex w-full items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-left text-[12px] font-semibold transition',
      active
        ? 'border-line bg-surface2 text-ink hover:border-lineStrong'
        : 'border-line bg-surface text-ink-3 hover:border-lineStrong hover:text-ink',
    );

  const renderTypeTree = (
    types: BackendObjectTypeCode[],
    selectedSubtypes: BackendObjectTypeCode[],
    onToggleSubtype: (type: BackendObjectTypeCode) => void,
  ) => (
    <div className="space-y-3">
      {types.map((type) => {
        const active = selectedSubtypes.includes(type);
        const chips = renderTaxonomyChips(type, () => {
          // §155-bis : activer une sous-catégorie d'un type exclu ré-inclut
          // le type — jamais de combinaison contradictoire silencieuse.
          if (isSubtypeNarrowed(selectedSubtypes, types) && !selectedSubtypes.includes(type)) {
            onToggleSubtype(type);
          }
        });
        return (
          <div key={type}>
            <button
              type="button"
              className={typeRowClass(active)}
              onClick={() => onToggleSubtype(type)}
              aria-pressed={active}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition',
                  active ? 'border-teal bg-teal text-white' : 'border-lineStrong bg-surface',
                )}
              >
                {active ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              {resolveTypeLabel(type)}
            </button>
            {chips ? <div className="pl-1.5">{chips}</div> : null}
          </div>
        );
      })}
    </div>
  );

  /**
   * §192 L2 — projection sémantique de l'hébergement. Les types HOT/HLO/HPA/
   * CAMP/RVA restent des partitions techniques : l'utilisateur navigue par
   * famille, nature, sous-type et type d'unité déclarés dans ref_code.metadata.
   * Repli automatique sur le rendu historique tant que L1 n'est pas déployé.
   */
  const renderAccommodationTaxonomy = () => {
    const domains = (references?.taxonomies ?? []).filter((domain) =>
      HOT_BUCKET_TYPES.includes(domain.objectType as BackendObjectTypeCode),
    );
    const familyRefs = references?.accommodationFamilies ?? [];
    const familyByCode = new Map(familyRefs.map((family) => [family.code, family]));
    // §201 — l'arbre est construit par une fonction PURE et testée à part : c'est
    // elle qui garantit qu'un enfant à l'écran est un vrai enfant en base
    // (`parentCode` same-domain), et qu'un nœud non assignable disparaît partout.
    const tree = buildAccommodationTaxonomyTree(domains, familyRefs.map((family) => family.code));
    if (tree.families.length === 0) {
      return null;
    }

    const query = foldAccommodationTerm(accommodationQuery);

    const activateType = (type: BackendObjectTypeCode) => {
      if (isSubtypeNarrowed(hot.subtypes, HOT_BUCKET_TYPES) && !hot.subtypes.includes(type)) {
        toggleHotSubtype(type);
      }
    };

    // `ref_code.description` et `source_ref` servent aussi aux audits et peuvent
    // contenir des notes de migration. Ils restent indexables, mais ne sont pas
    // une microcopie validée pour l'utilisateur final.
    const nodeTitle = (domain: string, node: ExplorerTaxonomyNode, breadcrumb?: string) => [
      breadcrumb,
      accommodationNatureDescription(domain, node.code),
      node.aliases?.length ? `Aussi appelé : ${node.aliases.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    /**
     * Une puce = UN couple domaine/code envoyé à `taxonomyAny`. Sélectionner un
     * parent n'envoie QUE le parent : c'est la closure serveur qui inclut les
     * sous-types. Le front ne reconstitue jamais l'union des descendants — il
     * dériverait du jour où la hiérarchie change en base.
     */
    const renderChip = (entry: AccommodationTaxonomyEntry, breadcrumb: string) => {
      const active = isTaxonomyActive(entry.domain, entry.node.code);
      const explanation = accommodationNatureDescription(entry.domain, entry.node.code);
      return (
        <button
          key={`${entry.domain}:${entry.node.code}`}
          type="button"
          className={taxonomyChipClass(active)}
          onClick={() => {
            if (!active) activateType(entry.objectType);
            toggleTaxonomy(entry.domain, entry.node.code);
          }}
          aria-pressed={active}
          aria-description={explanation || undefined}
          title={nodeTitle(entry.domain, entry.node, breadcrumb) || undefined}
        >
          {entry.node.name}
          {explanation ? <Info className="ml-1 h-3 w-3 opacity-60" aria-hidden="true" /> : null}
        </button>
      );
    };

    /** Axes complémentaires (type d'unité, positionnement) : liste plate. */
    const renderFlatEntries = (axisEntries: AccommodationTaxonomyEntry[], dedupe = false) => {
      const groups = new Map<string, AccommodationTaxonomyEntry[]>();
      for (const entry of axisEntries) {
        const key = dedupe ? foldAccommodationTerm(entry.node.name) : `${entry.domain}:${entry.node.code}`;
        const current = groups.get(key) ?? [];
        current.push(entry);
        groups.set(key, current);
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(groups.values()).map((group) => {
            const representative = group[0];
            const active = group.some((entry) => isTaxonomyActive(entry.domain, entry.node.code));
            return (
              <button
                key={group.map((entry) => `${entry.domain}:${entry.node.code}`).join('|')}
                type="button"
                className={taxonomyChipClass(active)}
                onClick={() => {
                  const nextActive = !active;
                  for (const entry of group) {
                    const entryActive = isTaxonomyActive(entry.domain, entry.node.code);
                    if (entryActive !== nextActive) {
                      if (nextActive) activateType(entry.objectType);
                      toggleTaxonomy(entry.domain, entry.node.code);
                    }
                  }
                }}
                aria-pressed={active}
                title={group.map((entry) => nodeTitle(entry.domain, entry.node)).filter(Boolean).join('\n\n') || undefined}
              >
                {representative.node.name}
              </button>
            );
          })}
        </div>
      );
    };

    const familyBlocks = tree.families.map((familyGroup) => {
      const familyCode = familyGroup.code;
      const family = familyByCode.get(familyCode) as ExplorerAccommodationFamily | undefined;
      const familyLabel = family?.name ?? familyCode.replace(/_/g, ' ');
      const familyDescription = accommodationFamilyDescription(familyCode) ?? family?.description ?? null;
      // La recherche interroge AUSSI les alias de famille : « plein air » doit
      // continuer de mener aux deux familles qui ont remplacé l'ancienne.
      const familyMatches = Boolean(query) && foldAccommodationTerm(
        [familyLabel, familyDescription ?? '', ...(family?.aliases ?? [])].join(' '),
      ).includes(query);
      const natures = familyMatches
        ? familyGroup.natures
        : filterAccommodationNatures(familyGroup.natures, (node) => accommodationNodeMatches(node, query));
      if (natures.length === 0) return null;
      const selectedCount = familyGroup.natures
        .flatMap((nature) => [nature.entry, ...nature.children.map((child) => child.entry)])
        .filter((entry) => isTaxonomyActive(entry.domain, entry.node.code)).length;
      const expanded = Boolean(query) || openAccommodationFamily === familyCode;
      return (
        <div key={familyCode} className="border-b border-line last:border-b-0">
          <button
            type="button"
            className="group flex min-h-9 w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
            onClick={() => setOpenAccommodationFamily((current) => current === familyCode ? null : familyCode)}
            aria-expanded={expanded}
            aria-controls={`accommodation-family-${familyCode}`}
            aria-description={familyDescription || undefined}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', expanded && 'rotate-180')}
            />
            <span className="min-w-0 flex-1 text-[12px] font-semibold text-ink">{familyLabel}</span>
            {selectedCount > 0 ? (
              <span className="rounded-full bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                {selectedCount}
              </span>
            ) : null}
            {familyDescription ? (
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-3 group-hover:text-ink-2"
                title={familyDescription}
                aria-hidden="true"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
          </button>
          {expanded ? (
            <div id={`accommodation-family-${familyCode}`} className="space-y-2 px-2 pb-2.5 pl-7">
              {/* UN SEUL étage « Nature » : les six natures collectives (HLO et RVA
                  confondus) sont des sœurs. Les sous-types n'ont plus de bloc à
                  part — ils vivent DANS le conteneur de leur parent. */}
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                Nature
              </span>
              <div className="space-y-1.5">
                {natures.map((nature) => {
                  const natureKey = `${nature.entry.domain}:${nature.entry.node.code}`;
                  const breadcrumb = accommodationBreadcrumb(familyLabel, nature.entry.node.name);
                  if (nature.children.length === 0) {
                    return (
                      <div key={natureKey} className="flex flex-wrap gap-1.5">
                        {renderChip(nature.entry, breadcrumb)}
                      </div>
                    );
                  }
                  const childSelected = nature.children
                    .some((child) => isTaxonomyActive(child.entry.domain, child.entry.node.code));
                  const subtreeOpen = Boolean(query) || childSelected || openAccommodationSubtrees.includes(natureKey);
                  return (
                    <div key={natureKey}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderChip(nature.entry, breadcrumb)}
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition hover:bg-surface2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
                          onClick={() => setOpenAccommodationSubtrees((current) => (
                            current.includes(natureKey)
                              ? current.filter((key) => key !== natureKey)
                              : [...current, natureKey]
                          ))}
                          aria-expanded={subtreeOpen}
                          aria-controls={`accommodation-subtree-${familyCode}-${nature.entry.node.code}`}
                          aria-label={`${subtreeOpen ? 'Replier' : 'Déplier'} les sous-types de ${nature.entry.node.name}`}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn('h-3.5 w-3.5 transition-transform', subtreeOpen && 'rotate-180')}
                          />
                        </button>
                      </div>
                      {/* Conteneur ENFANT, indenté et bordé : les sous-types ne
                          doivent jamais être des voisins DOM des natures sœurs. */}
                      {subtreeOpen ? (
                        <div
                          id={`accommodation-subtree-${familyCode}-${nature.entry.node.code}`}
                          className="ml-3 mt-1.5 flex flex-wrap gap-1.5 border-l border-line pl-3"
                        >
                          {nature.children.map((child) => renderChip(
                            child.entry,
                            accommodationBreadcrumb(familyLabel, nature.entry.node.name, child.entry.node.name),
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      );
    }).filter(Boolean);

    const unitEntries = tree.unitTypes.filter((entry) => accommodationNodeMatches(entry.node, query));
    const positioningEntries = tree.positionings.filter((entry) => accommodationNodeMatches(entry.node, query));
    // §201 — le NOUVEL axe multi-valué. Il cohabite volontairement avec les
    // `type_unite` restés dans taxonomy_hlo (maison, appartement, chalet…) :
    // leur migration est un lot à part, et créer un second système concurrent
    // pour elles serait pire que la cohabitation.
    const unitTypeOptions = (references?.accommodationUnitTypes ?? []).filter((option) => (
      !query || foldAccommodationTerm(option.name).includes(query)
    ));
    const hasResults = familyBlocks.length > 0 || unitEntries.length > 0
      || positioningEntries.length > 0 || unitTypeOptions.length > 0;
    const complementarySelectedCount = [...unitEntries, ...positioningEntries]
      .filter((entry) => isTaxonomyActive(entry.domain, entry.node.code)).length
      + accommodationUnitTypesAny.length;
    const showComplements = Boolean(query) || showAccommodationComplements;

    return (
      <div className="space-y-2.5">
        <div className="relative">
          <label htmlFor="accommodation-taxonomy-search" className="sr-only">
            Rechercher un type d'hébergement
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            id="accommodation-taxonomy-search"
            className="h-8 pl-8 pr-8 text-[12px]"
            value={accommodationQuery}
            onChange={(event) => setAccommodationQuery(event.target.value)}
            placeholder="Rechercher un type ou un ancien terme…"
          />
          {accommodationQuery ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-surface2 hover:text-ink"
              onClick={() => setAccommodationQuery('')}
              aria-label="Effacer la recherche d'hébergement"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {familyBlocks.length > 0 ? (
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-3">
              Famille d'hébergement
            </span>
            <div className="overflow-hidden rounded-[9px] border border-line bg-surface">
              {familyBlocks}
            </div>
          </div>
        ) : null}

        {unitEntries.length > 0 || positioningEntries.length > 0 || unitTypeOptions.length > 0 ? (
          <div className="overflow-hidden rounded-[9px] border border-line bg-surface">
            <button
              type="button"
              className="flex min-h-9 w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              onClick={() => setShowAccommodationComplements((current) => !current)}
              aria-expanded={showComplements}
              aria-controls="accommodation-complementary-filters"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', showComplements && 'rotate-180')}
              />
              <span className="flex-1 text-[12px] font-semibold text-ink-2">Critères complémentaires</span>
              {complementarySelectedCount > 0 ? (
                <span className="rounded-full bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                  {complementarySelectedCount}
                </span>
              ) : null}
            </button>
            {showComplements ? (
              <div id="accommodation-complementary-filters" className="space-y-2 border-t border-line px-2 pb-2.5 pt-2">
                {unitTypeOptions.length > 0 ? (
                  <div>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      Type d&apos;unité
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {unitTypeOptions.map((option) => {
                        const active = accommodationUnitTypesAny.includes(option.code);
                        return (
                          <button
                            key={option.code}
                            type="button"
                            className={taxonomyChipClass(active)}
                            onClick={() => setAccommodationUnitTypes(
                              active
                                ? accommodationUnitTypesAny.filter((code) => code !== option.code)
                                : [...accommodationUnitTypesAny, option.code],
                            )}
                            aria-pressed={active}
                            title="Dans quoi le visiteur dort — indépendant de la nature de l’établissement."
                          >
                            {option.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {unitEntries.length > 0 ? (
                  <div>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      {ACCOMMODATION_AXIS_LABELS.type_unite}
                    </span>
                    {renderFlatEntries(unitEntries, true)}
                  </div>
                ) : null}
                {positioningEntries.length > 0 ? (
                  <div>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      {ACCOMMODATION_AXIS_LABELS.positionnement}
                    </span>
                    {renderFlatEntries(positioningEntries)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!hasResults ? <p className="text-[12px] text-ink-3">Aucun terme ne correspond à cette recherche.</p> : null}

        {isSubtypeNarrowed(hot.subtypes, HOT_BUCKET_TYPES) ? (
          <div className="rounded-[8px] border border-warn-border bg-warn-bg px-2 py-1.5 text-[12px] leading-snug text-warn-ink">
            Un ancien filtre de type de fiche est actif. Utilisez les filtres actifs pour le retirer si les résultats semblent incomplets.
          </div>
        ) : null}
      </div>
    );
  };

  /**
   * Contrôle de capacité VEDETTE d'un bucket (« Capacité d'accueil »), min ET max.
   *
   * Le libellé de la métrique vient du catalogue quand il est disponible ; à défaut on
   * garde un intitulé métier plutôt qu'un code brut. Les bornes viennent du corpus
   * (16o) et sont resserrées sur les sous-types cochés, donc chercher un hôtel affiche
   * l'étendue des hôtels, pas celle de tout l'hébergement.
   */
  const renderHeadlineCapacity = (
    bucket: ExplorerBucketKey,
    types: readonly BackendObjectTypeCode[],
    capacityFilters: Array<{ code: string; min?: number; max?: number }>,
    setFilter: (code: string, min?: number, max?: number) => void,
  ) => {
    const code = HEADLINE_CAPACITY_METRIC[bucket];
    if (!code) return null;
    return (
      <RangeSlider
        label="Capacité d'accueil"
        unit="pers."
        min={readCapacityValue(capacityFilters, code, 'min')}
        max={readCapacityValue(capacityFilters, code, 'max')}
        bounds={resolveCapacityBounds(references?.capacityBounds, code, types)}
        onChange={(min, max) => setFilter(code, min, max)}
      />
    );
  };

  const renderAccessibilityDetails = () => (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div>
        <span className="mb-2 block text-[12px] font-semibold text-ink-2">Types de handicap</span>
        <div className="flex flex-wrap gap-2">
          {accessibilityDisabilityTypes.map((option) => {
            const active = accessibilityDisabilityTypesAny.includes(option.code);
            return (
              <button
                key={option.code}
                type="button"
                className={bucketChipClass(active)}
                onClick={() => toggleAccessibilityDisabilityType(option.code)}
                aria-pressed={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {visibleAccessibilityAmenities.length > 0 ? (
        <div>
          <span className="mb-2 block text-[12px] font-semibold text-ink-2">Aménagements précis</span>
          <div className="flex flex-wrap gap-2">
            {visibleAccessibilityAmenities.map((amenity) => {
              const active = accessibilityAmenityCodesAny.includes(amenity.code);
              return (
                <button
                  key={amenity.code}
                  type="button"
                  className={bucketChipClass(active)}
                  onClick={() => toggleAccessibilityAmenity(amenity.code)}
                  aria-pressed={active}
                  title={amenity.description || undefined}
                >
                  {amenity.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-ink-3">
          {accessibilityAmenities.length > 0
            ? accessibilityDisabilityTypesAny.length > 0
              ? 'Aucun aménagement ne correspond à ce type.'
              : 'Choisissez un type pour afficher les aménagements associés.'
            : 'Chargement des aménagements…'}
        </p>
      )}
    </div>
  );

  const renderSustainabilityDetails = () => (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {sustainabilityCategories.length > 0 ? (
        <div>
          <span className="mb-2 block text-[12px] font-semibold text-ink-2">Axes durables</span>
          <div className="flex flex-wrap gap-2">
            {sustainabilityCategories.map((category) => {
              const active = sustainabilityCategoryCodesAny.includes(category.code);
              return (
                <button
                  key={category.code}
                  type="button"
                  className={bucketChipClass(active)}
                  onClick={() => toggleSustainabilityCategory(category.code)}
                  aria-pressed={active}
                  title={category.description || undefined}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-ink-3">Chargement des axes durables…</p>
      )}

      {visibleSustainabilityActions.length > 0 ? (
        <div>
          <span className="mb-2 block text-[12px] font-semibold text-ink-2">Actions engagées</span>
          <div className="flex flex-wrap gap-2">
            {visibleSustainabilityActions.map((action) => {
              const active = sustainabilityActionCodesAny.includes(action.code);
              return (
                <button
                  key={action.code}
                  type="button"
                  className={bucketChipClass(active)}
                  onClick={() => toggleSustainabilityAction(action.code)}
                  aria-pressed={active}
                  title={action.description || undefined}
                >
                  {action.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : sustainabilityCategories.length > 0 ? (
        <p className="text-[12px] leading-snug text-ink-3">Choisissez un axe pour afficher les actions associées.</p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line bg-surface px-4">
        <div className="flex items-baseline gap-2 font-display text-[13px] font-bold tracking-tight text-ink">
          Filtres
          <span className="font-sans text-xs font-medium text-ink-3">{activeFilterCount} actifs</span>
        </div>
        <button type="button" onClick={resetAll} className="text-[12px] font-semibold text-orange-2 hover:text-orange">
          Réinitialiser
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-1">
        <FilterColumnGroup label="Catégorie">
          <div className="flex flex-wrap gap-2">
            {EXPLORER_BUCKET_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                className={bucketChipClass(selectedBuckets.includes(option.code))}
                onClick={() => toggleBucket(option.code)}
                aria-pressed={selectedBuckets.includes(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterColumnGroup>

        {canEditObjects ? (
          <FilterColumnGroup label="Statut">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => {
                const active = effectiveStatuses.includes(option.code);
                return (
                  <button
                    key={option.code}
                    type="button"
                    className={bucketChipClass(active)}
                    onClick={() => {
                      const nextEffective: ExplorerStatusFilter[] = active
                        ? effectiveStatuses.filter((entry) => entry !== option.code)
                        : [...effectiveStatuses, option.code];
                      const sanitized: ExplorerStatusFilter[] =
                        nextEffective.length > 0 ? nextEffective : ['published'];
                      const isEditorDefault =
                        sanitized.length === STATUS_OPTIONS.length &&
                        STATUS_OPTIONS.every((opt) => sanitized.includes(opt.code));
                      setStatuses(isEditorDefault ? [] : sanitized);
                    }}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FilterColumnGroup>
        ) : null}

        <FilterColumnGroup label="Localisation">
          <div className="space-y-3">
            <div>
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Ville</span>
              <FilterDropdown<string>
                mode="multi"
                placeholder="Toutes les communes"
                allLabel="Toutes les communes"
                searchable
                searchPlaceholder="Rechercher une commune"
                options={(references?.cities ?? []).map((c) => ({ code: c, label: c }))}
                selected={cities}
                onChange={(vals) => setCities(vals)}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Lieu-dit</span>
              <FilterDropdown<string>
                mode="single"
                placeholder="Tous les lieux-dits"
                options={(references?.lieuDits ?? []).map((v) => ({ code: v, label: v }))}
                selected={common.lieuDit ? [common.lieuDit] : []}
                onChange={(vals) => setLieuDit(vals[0] ?? '')}
              />
            </div>
          </div>
        </FilterColumnGroup>

        {/* 16n — groupe masqué quand AUCUNE distinction ne s'applique aux catégories cochées
            (et qu'aucune n'est active) : un sélecteur « Toutes les distinctions » sur une liste
            vide ne dit rien. Une section de moins dans la colonne. */}
        {rankedLabelOptions.length > 0 || rankedLabelSchemeCode ? (
        <FilterColumnGroup label="Labels & certifications" count={labelFilterCount > 0 ? labelFilterCount : undefined}>
          <div className="space-y-3">
            <div>
              {/* §175 — « Distinctions » (et non « Classement / label ») : le mot « classement »
                  est réservé au classement officiel de l'État. Les labels (Gîtes de France,
                  Clévacances, durabilité, accessibilité…) sont des distinctions, pas des classements. */}
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Distinctions</span>
              <FilterDropdown<string>
                mode="single"
                placeholder="Toutes les distinctions"
                allLabel="Toutes les distinctions"
                searchable
                searchPlaceholder="Rechercher une distinction"
                options={rankedLabelOptions.map((option) => ({ code: option.code, label: option.name, group: option.group }))}
                selected={rankedLabelSchemeCode ? [rankedLabelSchemeCode] : []}
                onChange={(vals) => setRankedLabelScheme(vals[0] ?? null)}
              />
            </div>

            {rankedLabelSchemeCode && rankedSchemeIsGraded ? (
              <div>
                <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Niveau</span>
                <GradeBar
                  values={rankedLabelValues}
                  unit={schemeUnit(rankedLabelSchemeCode)}
                  selected={common.rankedLabelValueCodes}
                  onChange={setRankedLabelValueCodes}
                />
              </div>
            ) : null}

            {rankedLabelSchemeCode && !rankedSchemeIsGraded ? (
              <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-teal"
                  checked={common.rankedLabelIncludeEquivalents}
                  onChange={(event) => setRankedLabelIncludeEquivalents(event.target.checked)}
                />
                <span>
                  <span className="font-medium">Inclure les démarches équivalentes</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">
                    Affiche aussi les fiches sans le label mais avec des actions/équipements compatibles (2ᵉ section).
                  </span>
                </span>
              </label>
            ) : null}

          </div>
        </FilterColumnGroup>
        ) : null}

        <FilterColumnGroup label="Tags" count={tagsAny.length > 0 ? tagsAny.length : undefined}>
          <div className="space-y-2">
            {/* §160 — picker : les tags sont ajoutables depuis le panneau, plus
                seulement par clic sur une carte de résultat (découvrabilité). */}
            <FilterDropdown<string>
              mode="multi"
              placeholder="Tous les tags"
              allLabel="Tous les tags"
              searchable
              searchPlaceholder="Rechercher un tag"
              options={(references?.tags ?? []).map((tag) => ({ code: tag.slug, label: tag.name }))}
              selected={tagsAny.map((tag) => tag.slug)}
              onChange={(slugs) => {
                const selectedSlugs = tagsAny.map((tag) => tag.slug);
                for (const tag of tagsAny) {
                  if (!slugs.includes(tag.slug)) {
                    toggleTag(tag);
                  }
                }
                for (const slug of slugs) {
                  if (!selectedSlugs.includes(slug)) {
                    const catalogTag = (references?.tags ?? []).find((tag) => tag.slug === slug);
                    if (catalogTag) {
                      toggleTag(catalogTag);
                    }
                  }
                }
              }}
            />
            {tagsAny.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {tagsAny.map((tag) => (
                    <button
                      key={tag.slug}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[12px] font-semibold transition hover:opacity-90"
                      style={tag.color ? tagChipStyle(tag.color) : undefined}
                      aria-label={`Retirer le tag ${tag.name}`}
                      title={`Retirer le tag ${tag.name}`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag.name}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="text-[12px] font-semibold text-orange-2 hover:text-orange" onClick={clearTags}>
                  Effacer les tags
                </button>
              </>
            ) : (
              <p className="text-[12px] leading-snug text-ink-3">
                Vous pouvez aussi cliquer sur un tag coloré dans la liste des résultats.
              </p>
            )}
          </div>
        </FilterColumnGroup>

        <FilterColumnGroup
          label="Accessibilité et services"
          count={accessibilityDetailCount + sustainabilityDetailCount > 0 ? accessibilityDetailCount + sustainabilityDetailCount : undefined}
        >
          <div className="flex flex-col gap-2">
            <label className="switch-row">
              <span>Accessibilité (PMR)</span>
              <input type="checkbox" checked={pmr} onChange={(event) => setPmr(event.target.checked)} />
            </label>
            {pmr ? renderAccessibilityDetails() : null}
            <label className="switch-row">
              <span>Démarche durable</span>
              <input type="checkbox" checked={sustainable} onChange={(event) => setSustainable(event.target.checked)} />
            </label>
            {sustainable ? renderSustainabilityDetails() : null}
            <label className="switch-row">
              <span>Animaux acceptés</span>
              <input type="checkbox" checked={common.petsAccepted} onChange={(event) => setPetsAccepted(event.target.checked)} />
            </label>
            <label className="switch-row">
              <span>Ouvert maintenant</span>
              <input type="checkbox" checked={common.openNow} onChange={(event) => setOpenNow(event.target.checked)} />
            </label>
            {/* §157 — « ouvert à … » : le moteur d'ouverture évalué à un instant
                choisi (« les restaurants encore ouverts à 18 h »). Exclusif avec
                « Ouvert maintenant » (le store gère l'exclusion). */}
            <div>
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Ouvert à… (date et heure)</span>
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={common.openAt ?? ''}
                  onChange={(event) => setOpenAt(event.target.value || null)}
                  aria-label="Ouvert à une date et heure donnée"
                />
                {common.openAt ? (
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-orange-2 hover:text-orange"
                    onClick={() => setOpenAt(null)}
                  >
                    Effacer
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </FilterColumnGroup>

        {/* §154 — cadre & environnement : transverse (la donnée couvre tous les
            types — rural, vue panoramique, volcan… — pas seulement les activités). */}
        <FilterColumnGroup
          label="Cadre & environnement"
          count={environmentTagsAny.length > 0 ? environmentTagsAny.length : undefined}
        >
          <FilterDropdown<string>
            mode="multi"
            placeholder="Tous les cadres"
            allLabel="Tous les cadres"
            searchable
            searchPlaceholder="Rechercher (mer, volcan, forêt…)"
            options={(references?.environmentTags ?? []).map((option) => ({ code: option.code, label: option.name }))}
            selected={environmentTagsAny}
            onChange={(vals) => setEnvironmentTags(vals)}
          />
        </FilterColumnGroup>

        {/* §159 — services & équipements : transverse (object_amenity est
            trans-types — piscine d'un camping, parking d'un musée…). */}
        <FilterColumnGroup
          label="Services & équipements"
          count={amenityFamiliesAny.length > 0 ? amenityFamiliesAny.length : undefined}
        >
          <FilterDropdown<string>
            mode="multi"
            placeholder="Tous les services"
            allLabel="Tous les services"
            searchable
            searchPlaceholder="Rechercher (bien-être, parking…)"
            options={(references?.amenityFamilies ?? []).map((option) => ({ code: option.code, label: option.name }))}
            selected={amenityFamiliesAny}
            onChange={(vals) => setAmenityFamilies(vals)}
          />
        </FilterColumnGroup>

        {typeSpecificFacets && showHot ? (
          <FilterColumnGroup label="Hébergements" collapsible count={hotSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'hébergement</span>
                {ENABLE_SEMANTIC_ACCOMMODATION_LAYOUT
                  ? (renderAccommodationTaxonomy() ?? renderTypeTree(HOT_BUCKET_TYPES, hot.subtypes, toggleHotSubtype))
                  : renderTypeTree(HOT_BUCKET_TYPES, hot.subtypes, toggleHotSubtype)}
              </div>

              {/* §159 — l'idiome conseiller (« un gîte pour 12 personnes »), désormais
                  BORNÉ DES DEUX CÔTÉS : chercher « 4 à 6 personnes » est aussi légitime
                  que « au moins 12 » — c'est même le cas courant sur les meublés, dont
                  la capacité médiane est 6. Réutilise capacityFilters ⇒ chips/URL/RPC
                  déjà câblés. */}
              {renderHeadlineCapacity('HOT', hot.subtypes, hot.capacityFilters, setHotCapacityFilter)}

              {references?.hotCapacityMetrics.length ? (
                <div>
                  <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Capacités détaillées</span>
                  <CapacityCriteria
                    metrics={references.hotCapacityMetrics}
                    filters={hot.capacityFilters}
                    // Les SOUS-TYPES cochés, pas le bucket : c'est ce qui écarte
                    // « Emplacements / Camping-cars / Tentes » quand on cherche un hôtel.
                    selectedTypes={hot.subtypes}
                    bounds={references.capacityBounds}
                    onChange={setHotCapacityFilter}
                    unitByMetric={HOT_CAPACITY_UNITS}
                  />
                </div>
              ) : null}

              {/* §159 — MICE = besoin expert, replié par défaut (le badge de la
                  section garde tout critère actif visible, §152). */}
              <details>
                <summary className="cursor-pointer text-[12px] font-semibold text-ink-2">Séminaires & réunions (MICE)</summary>
                <div className="filters-panel__range-grid mt-2">
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minCount)}
                    onChange={(event) => setHotMeetingRoom({ minCount: event.target.value ? Number(event.target.value) : undefined })}
                    placeholder="Nb. salles min"
                    aria-label="Nombre minimal de salles de réunion"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minAreaM2)}
                    onChange={(event) => setHotMeetingRoom({ minAreaM2: event.target.value ? Number(event.target.value) : undefined })}
                    placeholder="Surface min m2"
                    aria-label="Surface minimale de salle en mètres carrés"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minCapTheatre)}
                    onChange={(event) =>
                      setHotMeetingRoom({ minCapTheatre: event.target.value ? Number(event.target.value) : undefined })
                    }
                    placeholder="Cap. théâtre min"
                    aria-label="Capacité minimale en configuration théâtre"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minCapClassroom)}
                    onChange={(event) =>
                      setHotMeetingRoom({ minCapClassroom: event.target.value ? Number(event.target.value) : undefined })
                    }
                    placeholder="Cap. classe min"
                    aria-label="Capacité minimale en configuration classe"
                  />
                </div>
              </details>
            </div>
          </FilterColumnGroup>
        ) : null}

        {typeSpecificFacets && showRes ? (
          <FilterColumnGroup label="Restaurants" collapsible count={resSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de restauration</span>
                {renderTaxonomyChips('RES') ?? taxonomyCatalogFallback}
              </div>

              {/* §159 — même idiome que HEB, sur la métrique que les restaurants
                  RENSEIGNENT vraiment : `seats`. Le contrôle pointait sur
                  `max_capacity`, dont aucune fiche RES ne porte la moindre valeur
                  (0 ligne en base) — il ne renvoyait donc jamais rien. */}
              {renderHeadlineCapacity('RES', EXPLORER_BUCKET_TYPE_MAP.RES, res.capacityFilters, setResCapacityFilter)}

              {references?.resCapacityMetrics.length ? (
                <div>
                  <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Capacités détaillées</span>
                  <CapacityCriteria
                    metrics={references.resCapacityMetrics}
                    filters={res.capacityFilters}
                    // Le bucket RES n'a qu'un type : la portée vaut le bucket, mais on
                    // passe la même primitive pour ne pas avoir deux chemins à maintenir.
                    selectedTypes={EXPLORER_BUCKET_TYPE_MAP.RES}
                    bounds={references.capacityBounds}
                    onChange={setResCapacityFilter}
                    unitByMetric={RES_CAPACITY_UNITS}
                  />
                </div>
              ) : null}
            </div>
          </FilterColumnGroup>
        ) : null}

        {/* §155 — sections Activités / Événements : le filtre existe parce que le
            concept existe dans le modèle (principe §150), même à 0 objet publié. */}
        {typeSpecificFacets && showAct ? (
          <FilterColumnGroup label="Activités" collapsible count={actSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'activité</span>
            {domainsForType(references, 'ASC').length + domainsForType(references, 'ACT').length > 0 ? (
              <div className="space-y-3">
                {(['ASC', 'ACT'] as BackendObjectTypeCode[]).map((type) =>
                  domainsForType(references, type).length > 0 ? (
                    <div key={type}>
                      {/* §155-bis : sous-titre par type — structures (ASC) et
                          prestations encadrées (ACT) ne se mélangent pas. */}
                      <span className="mb-1.5 block text-[11px] font-medium text-ink-3">{resolveTypeLabel(type)}</span>
                      {renderTaxonomyChips(type)}
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              taxonomyCatalogFallback
            )}
          </FilterColumnGroup>
        ) : null}

        {typeSpecificFacets && showEvt ? (
          <FilterColumnGroup label="Événements" collapsible count={evtSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'événement</span>
                {renderTaxonomyChips('FMA') ?? taxonomyCatalogFallback}
              </div>
              {/* §157 — plage de dates (recouvrement avec [début, fin] de l'événement). */}
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Dates</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="date"
                    value={evt.eventFrom ?? ''}
                    onChange={(event) => setEvtEventRange(event.target.value || null, evt.eventTo)}
                    aria-label="Événements à partir du"
                  />
                  <Input
                    type="date"
                    value={evt.eventTo ?? ''}
                    onChange={(event) => setEvtEventRange(evt.eventFrom, event.target.value || null)}
                    aria-label="Événements jusqu'au"
                  />
                </div>
              </div>
            </div>
          </FilterColumnGroup>
        ) : null}

        {typeSpecificFacets && showIti ? (
          <FilterColumnGroup label="Itinéraires" collapsible count={itiSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'itinéraire</span>
                {renderTaxonomyChips('ITI') ?? taxonomyCatalogFallback}
              </div>

              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de parcours</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Tous', value: null as boolean | null },
                    { label: 'Boucle', value: true },
                    { label: 'Linéaire', value: false },
                  ].map((option) => (
                    <button
                      key={String(option.value)}
                      type="button"
                      className={bucketChipClass(iti.isLoop === option.value)}
                      onClick={() => setItiIsLoop(option.value)}
                      aria-pressed={iti.isLoop === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* §156 — l'échelle ordinale 1-5 en segments nommés, plus des inputs
                  numériques libres (affordance fausse, min>max possible, échelle
                  inconnue de l'utilisateur). */}
              <div className="facet-group">
                <span className="facet-title">Difficulté</span>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTY_SEGMENTS.map((segment) => {
                    const active = iti.difficultyMin === segment.min && iti.difficultyMax === segment.max;
                    return (
                      <button
                        key={segment.label}
                        type="button"
                        className={bucketChipClass(active)}
                        onClick={() => (active ? setItiDifficulty(undefined, undefined) : setItiDifficulty(segment.min, segment.max))}
                        aria-pressed={active}
                      >
                        {segment.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="facet-group">
                <span className="facet-title">Distance (km)</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(iti.distanceMinKm)}
                    onChange={(event) => setItiDistance(event.target.value ? Number(event.target.value) : undefined, iti.distanceMaxKm)}
                    placeholder="Min"
                    aria-label="Distance minimale en kilomètres"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(iti.distanceMaxKm)}
                    onChange={(event) => setItiDistance(iti.distanceMinKm, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
                    aria-label="Distance maximale en kilomètres"
                  />
                </div>
              </div>

              <div className="facet-group">
                <span className="facet-title">Durée (h)</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={renderNumber(iti.durationMinH)}
                    onChange={(event) => setItiDuration(event.target.value ? Number(event.target.value) : undefined, iti.durationMaxH)}
                    placeholder="Min"
                    aria-label="Durée minimale en heures"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={renderNumber(iti.durationMaxH)}
                    onChange={(event) => setItiDuration(iti.durationMinH, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
                    aria-label="Durée maximale en heures"
                  />
                </div>
              </div>

              {references?.itiPractices.length ? (
                <div>
                  <span className="mb-2 block text-[12px] font-semibold text-ink-2">Pratiques</span>
                  <div className="flex flex-wrap gap-2">
                    {references.itiPractices.map((practice) => {
                      const active = iti.practicesAny.includes(practice.code);
                      return (
                        <button
                          key={practice.code}
                          type="button"
                          className={bucketChipClass(active)}
                          onClick={() => toggleItiPractice(practice.code)}
                          aria-pressed={active}
                        >
                          {practice.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </FilterColumnGroup>
        ) : null}

        {typeSpecificFacets && showVis ? (
          <FilterColumnGroup label="Site & visite" collapsible count={visSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de visite</span>
            {renderTypeTree(EXPLORER_BUCKET_TYPE_MAP.VIS, vis.subtypes, toggleVisSubtype)}
          </FilterColumnGroup>
        ) : null}

        {typeSpecificFacets && showSrv ? (
          <FilterColumnGroup label="Services" collapsible count={srvSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de service</span>
            {renderTypeTree(EXPLORER_BUCKET_TYPE_MAP.SRV, srv.subtypes, toggleSrvSubtype)}
          </FilterColumnGroup>
        ) : null}
      </div>
    </div>
  );
}

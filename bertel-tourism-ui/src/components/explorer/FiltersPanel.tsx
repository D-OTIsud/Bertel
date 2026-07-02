import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import type {
  AccessibilityAmenityRef,
  AccessibilityDisabilityTypeCode,
  BackendObjectTypeCode,
  ExplorerBucketKey,
  ExplorerReferences,
  ExplorerStatusFilter,
  ExplorerTaxonomyDomain,
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
  bucketForTaxonomyDomain,
  resolveExplorerStatuses,
} from '../../utils/facets';
import { resolveTypeLabel } from '../../utils/labels';
import { Input } from '@/components/ui/input';
import { FilterDropdown } from '../dashboard/FilterDropdown';
import { FilterColumnGroup } from '../common/FilterColumnGroup';
import { tagChipStyle } from '../../utils/explorer-card';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: Array<{ code: ExplorerStatusFilter; label: string }> = [
  { code: 'published', label: 'Publié' },
  { code: 'draft', label: 'Brouillon' },
];

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
}

function readCapacityValue(filters: Array<{ code: string; min?: number; max?: number }>, code: string, key: 'min' | 'max'): number | undefined {
  return filters.find((filter) => filter.code === code)?.[key];
}

/** Sélection de sous-types rétrécie ? (vide ou complète = « tous », pas un critère actif) */
function isSubtypeNarrowed(selected: BackendObjectTypeCode[], all: BackendObjectTypeCode[]): boolean {
  return selected.length > 0 && !(selected.length === all.length && all.every((type) => selected.includes(type)));
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

export function FiltersPanel({ references }: FiltersPanelProps) {
  const selectedBuckets = useExplorerStore((state) => state.selectedBuckets);
  const common = useExplorerStore((state) => state.common);
  const cities = common.cities ?? [];
  const labelsAny = common.labelsAny ?? [];
  const tagsAny = common.tagsAny ?? [];
  const rankedLabelSchemeCode = common.rankedLabelSchemeCode ?? null;
  const statuses = common.statuses ?? [];
  const pmr = common.pmr === true;
  const accessibilityDisabilityTypesAny = common.accessibilityDisabilityTypesAny ?? [];
  const accessibilityAmenityCodesAny = common.accessibilityAmenityCodesAny ?? [];
  const sustainable = common.sustainable === true;
  const environmentTagsAny = common.environmentTagsAny ?? [];
  const taxonomyAny = common.taxonomyAny ?? [];
  const sustainabilityCategoryCodesAny = common.sustainabilityCategoryCodesAny ?? [];
  const sustainabilityActionCodesAny = common.sustainabilityActionCodesAny ?? [];
  const hot = useExplorerStore((state) => state.hot);
  const res = useExplorerStore((state) => state.res);
  const iti = useExplorerStore((state) => state.iti);
  const vis = useExplorerStore((state) => state.vis);
  const srv = useExplorerStore((state) => state.srv);
  const toggleBucket = useExplorerStore((state) => state.toggleBucket);
  const setCities = useExplorerStore((state) => state.setCities);
  const setLieuDit = useExplorerStore((state) => state.setLieuDit);
  const setPmr = useExplorerStore((state) => state.setPmr);
  const toggleAccessibilityDisabilityType = useExplorerStore((state) => state.toggleAccessibilityDisabilityType);
  const toggleAccessibilityAmenity = useExplorerStore((state) => state.toggleAccessibilityAmenity);
  const setSustainable = useExplorerStore((state) => state.setSustainable);
  const toggleSustainabilityCategory = useExplorerStore((state) => state.toggleSustainabilityCategory);
  const toggleSustainabilityAction = useExplorerStore((state) => state.toggleSustainabilityAction);
  const setPetsAccepted = useExplorerStore((state) => state.setPetsAccepted);
  const setOpenNow = useExplorerStore((state) => state.setOpenNow);
  const setEnvironmentTags = useExplorerStore((state) => state.setEnvironmentTags);
  const setRankedLabelScheme = useExplorerStore((state) => state.setRankedLabelScheme);
  const toggleLabel = useExplorerStore((state) => state.toggleLabel);
  const clearLabels = useExplorerStore((state) => state.clearLabels);
  const toggleTag = useExplorerStore((state) => state.toggleTag);
  const clearTags = useExplorerStore((state) => state.clearTags);
  const toggleHotSubtype = useExplorerStore((state) => state.toggleHotSubtype);
  const toggleVisSubtype = useExplorerStore((state) => state.toggleVisSubtype);
  const toggleSrvSubtype = useExplorerStore((state) => state.toggleSrvSubtype);
  const toggleTaxonomy = useExplorerStore((state) => state.toggleTaxonomy);
  const setHotCapacityFilter = useExplorerStore((state) => state.setHotCapacityFilter);
  const setResCapacityFilter = useExplorerStore((state) => state.setResCapacityFilter);
  const setHotMeetingRoom = useExplorerStore((state) => state.setHotMeetingRoom);
  const setItiIsLoop = useExplorerStore((state) => state.setItiIsLoop);
  const setItiDifficulty = useExplorerStore((state) => state.setItiDifficulty);
  const setItiDistance = useExplorerStore((state) => state.setItiDistance);
  const setItiDuration = useExplorerStore((state) => state.setItiDuration);
  const toggleItiPractice = useExplorerStore((state) => state.toggleItiPractice);
  const resetAll = useExplorerStore((state) => state.resetAll);
  const setStatuses = useExplorerStore((state) => state.setStatuses);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const showHot = isBucketSelected(selectedBuckets, 'HOT');
  const showRes = isBucketSelected(selectedBuckets, 'RES');
  const showIti = isBucketSelected(selectedBuckets, 'ITI');
  const showAct = isBucketSelected(selectedBuckets, 'ACT');
  const showEvt = isBucketSelected(selectedBuckets, 'EVT');
  const showVis = isBucketSelected(selectedBuckets, 'VIS');
  const showSrv = isBucketSelected(selectedBuckets, 'SRV');
  const effectiveStatuses = resolveExplorerStatuses(statuses, canEditObjects);

  const activeFilterCount = useExplorerStore((s) => {
    let n = 0;
    if (s.selectedBuckets.length) n += 1;
    if (s.common.search.trim()) n += 1;
    if ((s.common.cities ?? []).length) n += 1;
    if (s.common.lieuDit.trim()) n += 1;
    if (s.common.pmr) n += 1;
    if ((s.common.accessibilityDisabilityTypesAny ?? []).length) n += 1;
    if ((s.common.accessibilityAmenityCodesAny ?? []).length) n += 1;
    if (s.common.sustainable) n += 1;
    if ((s.common.sustainabilityCategoryCodesAny ?? []).length) n += 1;
    if ((s.common.sustainabilityActionCodesAny ?? []).length) n += 1;
    if (s.common.petsAccepted) n += 1;
    if (s.common.openNow) n += 1;
    if (s.common.rankedLabelSchemeCode) n += 1;
    if ((s.common.labelsAny ?? []).length) n += 1;
    if ((s.common.tagsAny ?? []).length) n += 1;
    if ((s.common.statuses ?? []).length > 0) n += 1;
    // Un dessin de zone pose polygon ET bbox : un seul geste, un seul actif.
    if (s.common.polygon || s.common.bbox) n += 1;
    // Mêmes primitives que les badges de section (§152) — sinon les deux
    // compteurs co-visibles se contredisent (vide=tous, meetingRoom vidé…).
    if (isSubtypeNarrowed(s.hot.subtypes, DEFAULT_HOT_SUBTYPES)) n += 1;
    if (isSubtypeNarrowed(s.vis.subtypes, DEFAULT_VIS_SUBTYPES)) n += 1;
    if (isSubtypeNarrowed(s.srv.subtypes, DEFAULT_SRV_SUBTYPES)) n += 1;
    if ((s.common.taxonomyAny ?? []).length) n += 1;
    if (countActiveRanges(s.hot.capacityFilters)) n += 1;
    if (Object.values(s.hot.meetingRoom).some((value) => value != null)) n += 1;
    if (countActiveRanges(s.res.capacityFilters)) n += 1;
    if (s.iti.isLoop !== null || s.iti.practicesAny.length || s.iti.difficultyMin != null || s.iti.difficultyMax != null) n += 1;
    if (s.iti.distanceMinKm != null || s.iti.distanceMaxKm != null) n += 1;
    if (s.iti.durationMinH != null || s.iti.durationMaxH != null) n += 1;
    if ((s.common.environmentTagsAny ?? []).length) n += 1;
    return n;
  });

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
  const rankedLabelOptions = references?.rankedLabelSchemes ?? [];
  const labelFilterCount = (rankedLabelSchemeCode ? 1 : 0) + labelsAny.length;

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
  const evtSectionCount = taxonomyCountForBucket(taxonomyAny, 'EVT');
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

  /**
   * §155 — chips de sous-catégories d'un type (union de ses domaines), en ordre
   * d'arbre (parents avant enfants), sans fausse indentation (l'ancien
   * margin-left par profondeur perdait tout sens au premier retour à la ligne).
   */
  const renderTaxonomyChips = (type: BackendObjectTypeCode) => {
    const domains = domainsForType(references, type);
    if (domains.length === 0) {
      return null;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {domains.flatMap((domain) =>
          domain.nodes.map((node) => {
            const active = isTaxonomyActive(domain.domain, node.code);
            return (
              <button
                key={`${domain.domain}:${node.code}`}
                type="button"
                className={active ? 'chip chip--active' : 'chip'}
                onClick={() => toggleTaxonomy(domain.domain, node.code)}
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
   */
  const renderTypeTree = (
    types: BackendObjectTypeCode[],
    selectedSubtypes: BackendObjectTypeCode[],
    onToggleSubtype: (type: BackendObjectTypeCode) => void,
  ) => (
    <div className="space-y-3">
      {types.map((type) => {
        const active = selectedSubtypes.includes(type);
        return (
          <div key={type}>
            <button
              type="button"
              className={cn('mb-1.5', bucketChipClass(active))}
              onClick={() => onToggleSubtype(type)}
              aria-pressed={active}
            >
              {resolveTypeLabel(type)}
            </button>
            {renderTaxonomyChips(type)}
          </div>
        );
      })}
    </div>
  );

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

        <FilterColumnGroup label="Labels & certifications" count={labelFilterCount > 0 ? labelFilterCount : undefined}>
          <div className="space-y-3">
            <div>
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Classement / label</span>
              <FilterDropdown<string>
                mode="single"
                placeholder="Tous les labels"
                allLabel="Tous les labels"
                options={rankedLabelOptions.map((option) => ({ code: option.code, label: option.name }))}
                selected={rankedLabelSchemeCode ? [rankedLabelSchemeCode] : []}
                onChange={(vals) => setRankedLabelScheme(vals[0] ?? null)}
              />
            </div>

            {labelsAny.length > 0 ? (
              <div className="space-y-2">
                <ul className="grid gap-2">
                  {labelsAny.map((label) => (
                    <li key={label}>
                      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                        <input type="checkbox" className="accent-teal" checked onChange={() => toggleLabel(label)} />
                        <span className="font-medium">{label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" className="text-[12px] font-semibold text-orange-2 hover:text-orange" onClick={clearLabels}>
                  Effacer les labels
                </button>
              </div>
            ) : (
              <p className="text-[12px] leading-snug text-ink-3">Cliquez sur un label dans la liste des résultats pour filtrer.</p>
            )}
          </div>
        </FilterColumnGroup>

        <FilterColumnGroup label="Tags" count={tagsAny.length > 0 ? tagsAny.length : undefined}>
          {tagsAny.length > 0 ? (
            <div className="space-y-2">
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
            </div>
          ) : (
            <p className="text-[12px] leading-snug text-ink-3">Cliquez sur un tag coloré dans la liste des résultats pour filtrer.</p>
          )}
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

        {showHot ? (
          <FilterColumnGroup label="Hébergements" collapsible count={hotSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'hébergement</span>
                {renderTypeTree(HOT_BUCKET_TYPES, hot.subtypes, toggleHotSubtype)}
              </div>

              {references?.hotCapacityMetrics.length ? (
                <div className="filters-panel__metric-stack">
                  {references.hotCapacityMetrics.map((metric) => (
                    <div key={metric.code} className="filters-panel__metric-row">
                      <strong>{metric.name}</strong>
                      <div className="filters-panel__range-grid">
                        <Input
                          type="number"
                          min={0}
                          value={renderNumber(readCapacityValue(hot.capacityFilters, metric.code, 'min'))}
                          onChange={(event) =>
                            setHotCapacityFilter(
                              metric.code,
                              event.target.value ? Number(event.target.value) : undefined,
                              readCapacityValue(hot.capacityFilters, metric.code, 'max'),
                            )
                          }
                          placeholder="Min"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={renderNumber(readCapacityValue(hot.capacityFilters, metric.code, 'max'))}
                          onChange={(event) =>
                            setHotCapacityFilter(
                              metric.code,
                              readCapacityValue(hot.capacityFilters, metric.code, 'min'),
                              event.target.value ? Number(event.target.value) : undefined,
                            )
                          }
                          placeholder="Max"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Salles de réunion</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minCount)}
                    onChange={(event) => setHotMeetingRoom({ minCount: event.target.value ? Number(event.target.value) : undefined })}
                    placeholder="Nb. salles min"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minAreaM2)}
                    onChange={(event) => setHotMeetingRoom({ minAreaM2: event.target.value ? Number(event.target.value) : undefined })}
                    placeholder="Surface min m2"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minCapTheatre)}
                    onChange={(event) =>
                      setHotMeetingRoom({ minCapTheatre: event.target.value ? Number(event.target.value) : undefined })
                    }
                    placeholder="Cap. théâtre min"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(hot.meetingRoom.minCapClassroom)}
                    onChange={(event) =>
                      setHotMeetingRoom({ minCapClassroom: event.target.value ? Number(event.target.value) : undefined })
                    }
                    placeholder="Cap. classe min"
                  />
                </div>
              </div>
            </div>
          </FilterColumnGroup>
        ) : null}

        {showRes ? (
          <FilterColumnGroup label="Restaurants" collapsible count={resSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de restauration</span>
                {renderTaxonomyChips('RES') ?? (
                  <p className="text-[12px] leading-snug text-ink-3">Chargement des types de restauration…</p>
                )}
              </div>

              {references?.resCapacityMetrics.length ? (
                <div className="filters-panel__metric-stack">
                  {references.resCapacityMetrics.map((metric) => (
                    <div key={metric.code} className="filters-panel__metric-row">
                      <strong>{metric.name}</strong>
                      <div className="filters-panel__range-grid">
                        <Input
                          type="number"
                          min={0}
                          value={renderNumber(readCapacityValue(res.capacityFilters, metric.code, 'min'))}
                          onChange={(event) =>
                            setResCapacityFilter(
                              metric.code,
                              event.target.value ? Number(event.target.value) : undefined,
                              readCapacityValue(res.capacityFilters, metric.code, 'max'),
                            )
                          }
                          placeholder="Min"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={renderNumber(readCapacityValue(res.capacityFilters, metric.code, 'max'))}
                          onChange={(event) =>
                            setResCapacityFilter(
                              metric.code,
                              readCapacityValue(res.capacityFilters, metric.code, 'min'),
                              event.target.value ? Number(event.target.value) : undefined,
                            )
                          }
                          placeholder="Max"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </FilterColumnGroup>
        ) : null}

        {/* §155 — sections Activités / Événements : le filtre existe parce que le
            concept existe dans le modèle (principe §150), même à 0 objet publié. */}
        {showAct ? (
          <FilterColumnGroup label="Activités" collapsible count={actSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'activité</span>
            {renderTaxonomyChips('ASC') ?? null}
            <div className="mt-2">{renderTaxonomyChips('ACT') ?? null}</div>
          </FilterColumnGroup>
        ) : null}

        {showEvt ? (
          <FilterColumnGroup label="Événements" collapsible count={evtSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'événement</span>
            {renderTaxonomyChips('FMA') ?? (
              <p className="text-[12px] leading-snug text-ink-3">Chargement des types d'événement…</p>
            )}
          </FilterColumnGroup>
        ) : null}

        {showIti ? (
          <FilterColumnGroup label="Itinéraires" collapsible count={itiSectionCount || undefined}>
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type d'itinéraire</span>
                {renderTaxonomyChips('ITI') ?? (
                  <p className="text-[12px] leading-snug text-ink-3">Chargement des types d'itinéraire…</p>
                )}
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
                      className={iti.isLoop === option.value ? 'chip chip--active' : 'chip'}
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
                        className={active ? 'chip chip--active' : 'chip'}
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
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(iti.distanceMaxKm)}
                    onChange={(event) => setItiDistance(iti.distanceMinKm, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
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
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={renderNumber(iti.durationMaxH)}
                    onChange={(event) => setItiDuration(iti.durationMinH, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
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
                          className={active ? 'chip chip--active' : 'chip'}
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

        {showVis ? (
          <FilterColumnGroup label="Site & visite" collapsible count={visSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de visite</span>
            {renderTypeTree(EXPLORER_BUCKET_TYPE_MAP.VIS, vis.subtypes, toggleVisSubtype)}
          </FilterColumnGroup>
        ) : null}

        {showSrv ? (
          <FilterColumnGroup label="Services" collapsible count={srvSectionCount || undefined}>
            <span className="mb-2 block text-[12px] font-semibold text-ink-2">Type de service</span>
            {renderTypeTree(EXPLORER_BUCKET_TYPE_MAP.SRV, srv.subtypes, toggleSrvSubtype)}
          </FilterColumnGroup>
        ) : null}
      </div>
    </div>
  );
}

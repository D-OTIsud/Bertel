/**
 * Dérive les filtres actifs de l'Explorateur en pastilles retirables (impl. 3.2).
 * PURE : libellés résolus (jamais de code brut), terme de recherche inclus. Le
 * `group`/`value` permet au composant de câbler le bon setter du store pour le
 * retrait individuel.
 */
import type { ExplorerFilters } from '../../types/domain';
import { EXPLORER_BUCKET_OPTIONS } from '../../utils/facets';
import { resolveSchemeLabel } from '../../utils/labels';

export type ActiveChipGroup =
  | 'search'
  | 'bucket'
  | 'city'
  | 'lieuDit'
  | 'pmr'
  | 'pets'
  | 'openNow'
  | 'sustainable'
  | 'label'
  | 'tag'
  | 'status'
  | 'rankedLabel'
  // D23 — filtres jusqu'ici invisibles dans la barre :
  | 'zone'
  | 'accessDisability'
  | 'accessAmenities'
  | 'sustCategories'
  | 'sustActions'
  | 'hotTaxonomy'
  | 'hotCapacity'
  | 'resCapacity'
  | 'itiLoop'
  | 'itiDifficulty'
  | 'itiDistance'
  | 'itiDuration'
  | 'itiPractices';

export interface ActiveChip {
  key: string;
  label: string;
  group: ActiveChipGroup;
  /** Valeur ciblée par le retrait (code de bucket, commune, slug de tag…). */
  value: string;
}

const STATUS_LABELS: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
};

/** Types de handicap (codes stables du modèle, cf. AccessibilityDisabilityTypeCode). */
const DISABILITY_LABELS: Record<string, string> = {
  motor: 'Moteur',
  hearing: 'Auditif',
  visual: 'Visuel',
  cognitive: 'Cognitif',
};

function bucketLabel(code: string): string {
  return EXPLORER_BUCKET_OPTIONS.find((o) => o.code === code)?.label ?? code;
}

/** Libellé « ≥ min · ≤ max » d'un filtre borné (capacité, difficulté, distance…). */
function rangeLabel(min?: number, max?: number, unit = ''): string {
  const parts: string[] = [];
  if (min != null) parts.push(`≥ ${min}${unit}`);
  if (max != null) parts.push(`≤ ${max}${unit}`);
  return parts.join(' · ');
}

export function buildExplorerActiveChips(filters: ExplorerFilters): ActiveChip[] {
  const c = filters.common;
  const chips: ActiveChip[] = [];

  const search = String(c.search ?? '').trim();
  if (search) {
    chips.push({ key: 'search', group: 'search', value: search, label: `Recherche · ${search}` });
  }

  for (const bucket of filters.selectedBuckets ?? []) {
    chips.push({ key: `bucket:${bucket}`, group: 'bucket', value: bucket, label: `Catégorie · ${bucketLabel(bucket)}` });
  }

  for (const city of c.cities ?? []) {
    chips.push({ key: `city:${city}`, group: 'city', value: city, label: `Commune · ${city}` });
  }

  const lieuDit = String(c.lieuDit ?? '').trim();
  if (lieuDit) {
    chips.push({ key: 'lieuDit', group: 'lieuDit', value: lieuDit, label: `Lieu-dit · ${lieuDit}` });
  }

  if (c.pmr) {
    chips.push({ key: 'pmr', group: 'pmr', value: 'pmr', label: 'Accessibilité (PMR)' });
  }
  if (c.petsAccepted) {
    chips.push({ key: 'pets', group: 'pets', value: 'pets', label: 'Animaux acceptés' });
  }
  if (c.openNow) {
    chips.push({ key: 'openNow', group: 'openNow', value: 'openNow', label: 'Ouvert maintenant' });
  }
  if (c.sustainable) {
    chips.push({ key: 'sustainable', group: 'sustainable', value: 'sustainable', label: 'Démarche durable' });
  }

  const rankedScheme = String(c.rankedLabelSchemeCode ?? '').trim();
  if (rankedScheme) {
    chips.push({ key: 'rankedLabel', group: 'rankedLabel', value: rankedScheme, label: `Classé · ${resolveSchemeLabel(rankedScheme)}` });
  }

  for (const label of c.labelsAny ?? []) {
    chips.push({ key: `label:${label}`, group: 'label', value: label, label: `Label · ${label}` });
  }

  for (const tag of c.tagsAny ?? []) {
    chips.push({ key: `tag:${tag.slug}`, group: 'tag', value: tag.slug, label: `Tag · ${tag.name || tag.slug}` });
  }

  for (const status of c.statuses ?? []) {
    chips.push({ key: `status:${status}`, group: 'status', value: status, label: `Statut · ${STATUS_LABELS[status] ?? status}` });
  }

  // D23 — complétude : les filtres ci-dessous étaient actifs mais INVISIBLES
  // dans la barre (impossible à voir/retirer sans rouvrir chaque panneau).
  if (c.polygon) {
    chips.push({ key: 'zone', group: 'zone', value: 'zone', label: 'Zone dessinée sur la carte' });
  }

  for (const type of c.accessibilityDisabilityTypesAny ?? []) {
    chips.push({
      key: `accessDisability:${type}`,
      group: 'accessDisability',
      value: type,
      label: `Accessibilité · ${DISABILITY_LABELS[type] ?? type}`,
    });
  }
  const amenityCount = (c.accessibilityAmenityCodesAny ?? []).length;
  if (amenityCount > 0) {
    // Compteur (les libellés vivent dans le catalogue de références, pas ici) —
    // le retrait efface l'ensemble des critères.
    chips.push({
      key: 'accessAmenities',
      group: 'accessAmenities',
      value: '*',
      label: `Accessibilité · ${amenityCount} critère${amenityCount > 1 ? 's' : ''}`,
    });
  }

  const sustCatCount = (c.sustainabilityCategoryCodesAny ?? []).length;
  if (sustCatCount > 0) {
    chips.push({
      key: 'sustCategories',
      group: 'sustCategories',
      value: '*',
      label: `Durable · ${sustCatCount} catégorie${sustCatCount > 1 ? 's' : ''}`,
    });
  }
  const sustActionCount = (c.sustainabilityActionCodesAny ?? []).length;
  if (sustActionCount > 0) {
    chips.push({
      key: 'sustActions',
      group: 'sustActions',
      value: '*',
      label: `Durable · ${sustActionCount} action${sustActionCount > 1 ? 's' : ''}`,
    });
  }

  const taxonomyCount = (filters.hot.taxonomy ?? []).length;
  if (taxonomyCount > 0) {
    chips.push({
      key: 'hotTaxonomy',
      group: 'hotTaxonomy',
      value: '*',
      label: `Sous-catégorie héb. · ${taxonomyCount}`,
    });
  }
  for (const capacity of filters.hot.capacityFilters ?? []) {
    chips.push({
      key: `hotCapacity:${capacity.code}`,
      group: 'hotCapacity',
      value: capacity.code,
      label: `Capacité héb. · ${rangeLabel(capacity.min, capacity.max)}`,
    });
  }
  for (const capacity of filters.res.capacityFilters ?? []) {
    chips.push({
      key: `resCapacity:${capacity.code}`,
      group: 'resCapacity',
      value: capacity.code,
      label: `Capacité resto · ${rangeLabel(capacity.min, capacity.max)}`,
    });
  }

  const iti = filters.iti;
  if (iti.isLoop != null) {
    chips.push({
      key: 'itiLoop',
      group: 'itiLoop',
      value: String(iti.isLoop),
      // « Linéaire » = tracé non bouclé (l'éditeur dit « Tracé en boucle ») —
      // ni « aller simple » ni « aller-retour », qui affirment plus que la donnée.
      label: iti.isLoop ? 'Itinéraire · Boucle' : 'Itinéraire · Linéaire',
    });
  }
  if (iti.difficultyMin != null || iti.difficultyMax != null) {
    chips.push({
      key: 'itiDifficulty',
      group: 'itiDifficulty',
      value: '*',
      label: `Difficulté · ${rangeLabel(iti.difficultyMin, iti.difficultyMax)}`,
    });
  }
  if (iti.distanceMinKm != null || iti.distanceMaxKm != null) {
    chips.push({
      key: 'itiDistance',
      group: 'itiDistance',
      value: '*',
      label: `Distance · ${rangeLabel(iti.distanceMinKm, iti.distanceMaxKm, ' km')}`,
    });
  }
  if (iti.durationMinH != null || iti.durationMaxH != null) {
    chips.push({
      key: 'itiDuration',
      group: 'itiDuration',
      value: '*',
      label: `Durée · ${rangeLabel(iti.durationMinH, iti.durationMaxH, ' h')}`,
    });
  }
  const practiceCount = (iti.practicesAny ?? []).length;
  if (practiceCount > 0) {
    chips.push({
      key: 'itiPractices',
      group: 'itiPractices',
      value: '*',
      label: `Pratique · ${practiceCount} sélectionnée${practiceCount > 1 ? 's' : ''}`,
    });
  }

  return chips;
}

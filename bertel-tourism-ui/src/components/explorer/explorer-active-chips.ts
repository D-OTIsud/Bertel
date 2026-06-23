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
  | 'rankedLabel';

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

function bucketLabel(code: string): string {
  return EXPLORER_BUCKET_OPTIONS.find((o) => o.code === code)?.label ?? code;
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
    chips.push({ key: 'pmr', group: 'pmr', value: 'pmr', label: 'PMR / Accessibilité' });
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

  return chips;
}

/**
 * Dérive les filtres actifs de l'Explorateur en pastilles retirables (impl. 3.2).
 * PURE : libellés résolus (jamais de code brut), terme de recherche inclus. Le
 * `group`/`value` permet au composant de câbler le bon setter du store pour le
 * retrait individuel.
 */
import type { BackendObjectTypeCode, ExplorerFilters } from '../../types/domain';
import {
  DEFAULT_HOT_SUBTYPES,
  DEFAULT_SRV_SUBTYPES,
  DEFAULT_VIS_SUBTYPES,
  EXPLORER_BUCKET_OPTIONS,
  EXPLORER_STATUS_OPTIONS,
  isSubtypeNarrowed,
} from '../../utils/facets';
import { resolveSchemeLabel } from '../../utils/labels';
import { REMPLISSAGE_BUCKET_OPTIONS, essentialLabel } from '../../utils/remplissage';

export type ActiveChipGroup =
  | 'search'
  | 'bucket'
  | 'city'
  | 'lieuDit'
  | 'pmr'
  | 'pets'
  | 'openNow'
  | 'sustainable'
  | 'tag'
  | 'status'
  | 'rankedLabel'
  | 'rankedLabelExact'
  | 'rankedLabelValues'
  // D23 — filtres jusqu'ici invisibles dans la barre :
  | 'zone'
  | 'environment'
  | 'openAt'
  | 'evtDates'
  | 'amenityFamilies'
  | 'accommodationUnitTypes'
  | 'accommodationPositionings'
  | 'accessDisability'
  | 'accessAmenities'
  | 'sustCategories'
  | 'sustActions'
  | 'taxonomy'
  // Complétude 2026-07-27 : trois critères restaient actifs SANS chip — donc invisibles
  // et non retirables depuis la barre, et absents de tout compteur dérivé d'elle.
  | 'hotSubtypes'
  | 'visSubtypes'
  | 'srvSubtypes'
  | 'meetingRoom'
  | 'hotCapacity'
  | 'resCapacity'
  | 'itiLoop'
  | 'itiDifficulty'
  | 'itiDistance'
  | 'itiDuration'
  | 'itiPractices'
  // §204 — remplissage (éditeurs seulement)
  | 'missingEssentialsBuckets'
  | 'missingEssentialsAny';

export interface ActiveChip {
  key: string;
  label: string;
  group: ActiveChipGroup;
  /** Valeur ciblée par le retrait (code de bucket, commune, slug de tag…). */
  value: string;
}

// §205 — dérivés du vocabulaire unique (« Archivé » inclus, jamais hidden).
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  EXPLORER_STATUS_OPTIONS.map((option) => [option.code, option.label]),
);

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
  if (rankedScheme && !c.rankedLabelIncludeEquivalents) {
    chips.push({ key: 'rankedLabelExact', group: 'rankedLabelExact', value: rankedScheme, label: 'Label obtenu uniquement' });
  }
  const rankedValueCount = (c.rankedLabelValueCodes ?? []).length;
  if (rankedScheme && rankedValueCount > 0) {
    chips.push({ key: 'rankedLabelValues', group: 'rankedLabelValues', value: '*', label: `Niveau · ${rankedValueCount} sélectionné${rankedValueCount > 1 ? 's' : ''}` });
  }

  for (const tag of c.tagsAny ?? []) {
    chips.push({ key: `tag:${tag.slug}`, group: 'tag', value: tag.slug, label: `Tag · ${tag.name || tag.slug}` });
  }

  for (const status of c.statuses ?? []) {
    chips.push({ key: `status:${status}`, group: 'status', value: status, label: `Statut · ${STATUS_LABELS[status] ?? status}` });
  }

  // §204 — une puce PAR critère : chacune se retire seule. Libellés résolus,
  // jamais de code brut à l'écran. Un filtre sans puce est un filtre qu'on
  // oublie avoir posé — c'est exactement ce qui avait été corrigé le 2026-07-27
  // sur trois autres critères (cf. le commentaire D23 plus bas).
  for (const bucket of c.missingEssentialsBuckets ?? []) {
    const option = REMPLISSAGE_BUCKET_OPTIONS.find((o) => o.code === bucket);
    chips.push({
      key: `remplissage:${bucket}`,
      group: 'missingEssentialsBuckets',
      value: bucket,
      label: `Remplissage · ${option?.label ?? bucket}`,
    });
  }

  for (const code of c.missingEssentialsAny ?? []) {
    chips.push({
      key: `manque:${code}`,
      group: 'missingEssentialsAny',
      value: code,
      label: `Il manque · ${essentialLabel(code)}`,
    });
  }

  // D23 — complétude : les filtres ci-dessous étaient actifs mais INVISIBLES
  // dans la barre (impossible à voir/retirer sans rouvrir chaque panneau).
  if (c.polygon) {
    chips.push({ key: 'zone', group: 'zone', value: 'zone', label: 'Zone dessinée sur la carte' });
  }

  // §157 — « ouvert à … » (datetime-local YYYY-MM-DDTHH:mm → JJ/MM à HH:mm).
  if (c.openAt) {
    const [datePart = '', timePart = ''] = c.openAt.split('T');
    const [y = '', m = '', d = ''] = datePart.split('-');
    const label = y ? `Ouvert le ${d}/${m} à ${timePart}` : 'Ouvert à…';
    chips.push({ key: 'openAt', group: 'openAt', value: c.openAt, label });
  }

  // §157 — dates Événements.
  const frDate = (iso: string) => iso.split('-').reverse().join('/');
  if (filters.evt.eventFrom || filters.evt.eventTo) {
    const from = filters.evt.eventFrom ? `du ${frDate(filters.evt.eventFrom)}` : '';
    const to = filters.evt.eventTo ? `au ${frDate(filters.evt.eventTo)}` : '';
    chips.push({
      key: 'evtDates',
      group: 'evtDates',
      value: '*',
      label: `Événements ${[from, to].filter(Boolean).join(' ')}`.trim(),
    });
  }

  // §159 — services & équipements (compteur, même pattern que le cadre).
  const familyCount = (c.amenityFamiliesAny ?? []).length;
  if (familyCount > 0) {
    chips.push({
      key: 'amenityFamilies',
      group: 'amenityFamilies',
      value: '*',
      label: `Services · ${familyCount} sélectionné${familyCount > 1 ? 's' : ''}`,
    });
  }

  // §154 — cadre & environnement (compteur : les libellés vivent dans le
  // catalogue de références, pas ici — même pattern que les aménagements).
  const envCount = (c.environmentTagsAny ?? []).length;
  if (envCount > 0) {
    chips.push({
      key: 'environment',
      group: 'environment',
      value: '*',
      label: `Cadre · ${envCount} critère${envCount > 1 ? 's' : ''}`,
    });
  }

  // §201 — un critère actif DOIT produire une pastille : sans elle il serait
  // invisible dans la barre, non retirable et absent des compteurs (§194).
  const unitTypeCount = (c.accommodationUnitTypesAny ?? []).length;
  if (unitTypeCount > 0) {
    chips.push({
      key: 'accommodationUnitTypes',
      group: 'accommodationUnitTypes',
      value: '*',
      label: `Type d'unité · ${unitTypeCount}`,
    });
  }

  const positioningCount = (c.accommodationPositioningsAny ?? []).length;
  if (positioningCount > 0) {
    chips.push({
      key: 'accommodationPositionings',
      group: 'accommodationPositionings',
      value: '*',
      label: `Positionnement · ${positioningCount}`,
    });
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

  // §155 — sous-catégories (tous buckets, état commun).
  const taxonomyCount = (c.taxonomyAny ?? []).length;
  if (taxonomyCount > 0) {
    chips.push({
      key: 'taxonomy',
      group: 'taxonomy',
      value: '*',
      label: `Sous-catégorie${taxonomyCount > 1 ? 's' : ''} · ${taxonomyCount}`,
    });
  }
  // Sous-types rétrécis (HOT/VIS/SRV) : « 2 types sur 5 » est un critère à part entière,
  // qui vidait pourtant la liste sans laisser de trace dans la barre.
  const subtypeChip = (
    group: 'hotSubtypes' | 'visSubtypes' | 'srvSubtypes',
    bucketLabelText: string,
    selected: BackendObjectTypeCode[] | undefined,
    all: BackendObjectTypeCode[],
  ) => {
    const codes = selected ?? [];
    if (!isSubtypeNarrowed(codes, all)) return;
    chips.push({
      key: group,
      group,
      value: '*',
      label: `${bucketLabelText} · ${codes.length} type${codes.length > 1 ? 's' : ''} sur ${all.length}`,
    });
  };
  subtypeChip('hotSubtypes', 'Hébergements', filters.hot.subtypes, DEFAULT_HOT_SUBTYPES);
  subtypeChip('visSubtypes', 'Visites', filters.vis?.subtypes, DEFAULT_VIS_SUBTYPES);
  subtypeChip('srvSubtypes', 'Services', filters.srv?.subtypes, DEFAULT_SRV_SUBTYPES);

  const meetingRoomCount = Object.values(filters.hot.meetingRoom ?? {}).filter((value) => value != null).length;
  if (meetingRoomCount > 0) {
    chips.push({
      key: 'meetingRoom',
      group: 'meetingRoom',
      value: '*',
      label: `Séminaires · ${meetingRoomCount} critère${meetingRoomCount > 1 ? 's' : ''}`,
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

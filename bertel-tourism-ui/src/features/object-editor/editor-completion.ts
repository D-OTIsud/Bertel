import type { ObjectWorkspaceModules, WorkspaceTranslatableField } from '../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';
import type { ArchetypeCode } from './archetypes';
import type { SectionItem } from './section-config';
import { validateForPublication } from './editor-validation';

export type SectionCompletionStatus = 'ok' | 'warn';

export interface SectionCompletion {
  num: string;
  label: string;
  pct: number;
  stat: SectionCompletionStatus;
}

type CompletionValue = unknown;
type CompletionSelector = (draft: ObjectWorkspaceModules) => CompletionValue;

interface CompletionRule {
  fields: CompletionSelector[];
}

export const SCORE_SECTION_NUMS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '12',
  '13',
  '14',
  '15',
  '17',
  '19',
  '21',
  '22',
];

function hasText(value: string | null | undefined): boolean {
  return String(value ?? '').trim().length > 0;
}

function hasTranslatableText(field: WorkspaceTranslatableField): boolean {
  return hasText(field.baseValue) || Object.values(field.values).some(hasText);
}

function allTaxonomyAssigned(draft: ObjectWorkspaceModules): boolean {
  return draft.taxonomy.domains.length === 0 || draft.taxonomy.domains.every((domain) => Boolean(domain.assignment));
}

export const SECTION_COMPLETION_RULES: Record<string, CompletionRule> = {
  '01': {
    fields: [
      (draft) => draft.generalInfo.name,
      (draft) => draft.generalInfo.status,
      allTaxonomyAssigned,
    ],
  },
  '02': {
    fields: [
      (draft) => draft.location.main.address1,
      (draft) => draft.location.main.postcode,
      (draft) => draft.location.main.city,
      (draft) => hasText(draft.location.main.latitude) && hasText(draft.location.main.longitude),
    ],
  },
  '03': {
    fields: [
      (draft) => draft.contacts.objectItems.some((item) => hasText(item.value)),
    ],
  },
  '04': {
    fields: [
      (draft) => hasTranslatableText(draft.descriptions.object.chapo),
      (draft) => hasTranslatableText(draft.descriptions.object.description),
    ],
  },
  // Renumbered 2026-06-11: '05' = Médias, '06' = the type block.
  '05': {
    fields: [
      (draft) => draft.media.objectItems.length > 0,
      (draft) => draft.media.objectItems.some((item) => item.isMain),
    ],
  },
  '06': {
    fields: [
      // §46-gated (RES menus, etc.) → complet ; sinon chambres présentes ; sinon (HEB roomless,
      // §64) crédité par une capacité max renseignée — la capacité d'accueil vit en §06 pour HEB.
      (draft) =>
        Boolean(draft.rooms?.unavailableReason) ||
        (draft.rooms?.items.length ?? 0) > 0 ||
        draft.capacityPolicies.capacityItems.some((item) => item.metricCode === 'max_capacity' && hasText(item.value)),
    ],
  },
  '07': {
    fields: [
      // Aligned with the section pill: a metric row with an EMPTY value is not progress.
      (draft) => draft.capacityPolicies.capacityItems.some((item) => hasText(item.value)),
      (draft) => hasText(draft.capacityPolicies.groupPolicy.minSize) || hasText(draft.capacityPolicies.groupPolicy.maxSize),
    ],
  },
  '08': {
    fields: [
      (draft) => draft.distinctions.distinctionGroups.some((group) => group.items.length > 0),
    ],
  },
  // Renumbered 2026-06-15 (user): Accessibilité is §09.
  '09': {
    fields: [
      (draft) => draft.distinctions.accessibilityLabels.length > 0 || draft.distinctions.accessibilityAmenityCoverage.length > 0,
    ],
  },
  '12': {
    fields: [
      (draft) => draft.characteristics.selectedPaymentCodes.length > 0,
      (draft) => draft.characteristics.selectedLanguages.length > 0,
    ],
  },
  '13': {
    fields: [
      (draft) => draft.pricing.prices.length > 0,
    ],
  },
  '14': {
    fields: [
      (draft) => draft.openings.periods.length > 0,
    ],
  },
  '15': {
    fields: [
      (draft) => draft.relationships.relatedObjects.length > 0,
    ],
  },
  '17': {
    fields: [
      (draft) => draft.relationships.organizationLinks.length > 0,
      (draft) => draft.memberships.items.length > 0,
    ],
  },
  '19': {
    fields: [
      (draft) => draft.providerFollowUp.notes.length > 0,
    ],
  },
  '21': {
    fields: [
      (draft) => draft.generalInfo.commercialVisibility,
      (draft) => draft.publication.status || draft.generalInfo.status,
    ],
  },
  '22': {
    fields: [
      (draft) => draft.syncIdentifiers.externalIdentifiers.length > 0 || draft.syncIdentifiers.origins.length > 0,
    ],
  },
};

function isFilled(value: CompletionValue): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return hasText(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === 'object' && 'baseValue' in value && 'values' in value) {
    return hasTranslatableText(value as WorkspaceTranslatableField);
  }

  return value != null;
}

export function computeSectionCompletion(num: string, draft: ObjectWorkspaceModules): number {
  const rule = SECTION_COMPLETION_RULES[num];
  if (!rule || rule.fields.length === 0) {
    return 100;
  }

  const filled = rule.fields.filter((field) => isFilled(field(draft))).length;
  return Math.round((filled / rule.fields.length) * 100);
}

export function completionStatusFor(pct: number): SectionCompletionStatus {
  return pct >= 80 ? 'ok' : 'warn';
}

// ============================================================================
// Complétude « perçue visiteur » — modèle type-aware 80 / 15 / 5
// (spec docs/superpowers/specs/2026-06-18-completude-par-type-design.md)
//   80 % ESSENTIELS : le bundle qu'un visiteur attend (nom, type+sous-catégorie, lieu,
//        contact, accroche+descriptif, photos [4=plein], équipements/équivalent type, tags).
//   15 % COMPLÉMENTAIRE-attendu : tarifs/ouverture/juridique/liens/rattachements/identifiants…
//        Les dimensions non applicables au type (N-A) sont EXCLUES du dénominateur.
//   5 %  VALORISATION : distinctions/labels — BONUS PUR. Présent = +pts, absent = +0 ;
//        un établissement non classé n'est JAMAIS pénalisé (décision PO 2026-06-18).
// Le % mesure la richesse perçue ; il ne se substitue pas à validateForPublication.
// ============================================================================

export type CompletionStatus = 'red' | 'orange' | 'green';

/**
 * Cible de photos pour le plein crédit de l'essentiel « photos » (richesse min(n/cible, 1)).
 * Défaut 4 (« 4 photos = 100 % », décision PO 2026-06-18). FMA = 1 : pour un événement / une
 * manifestation, une affiche suffit ; davantage de photos est un plus mais l'absence ne pénalise
 * jamais ce type (décision PO 2026-06-18).
 */
const PHOTO_TARGET = 4;
const PHOTO_TARGET_BY_ARCHETYPE: Partial<Record<ArchetypeCode, number>> = {
  FMA: 1,
};
function photoTargetFor(archetype: ArchetypeCode): number {
  return PHOTO_TARGET_BY_ARCHETYPE[archetype] ?? PHOTO_TARGET;
}
const PHOTO_HINT_TOKENS = ['image', 'photo', 'visuel', 'cover'];
/** Codes ref de mode de visite (§06 VIS) — distincts des équipements d'accessibilité (§09). */
const VISIT_MODE_CODES = ['visite_libre', 'visite_guidee', 'audioguide'];

interface VisitorDimension {
  id: string;
  measure: (draft: ObjectWorkspaceModules, archetype: ArchetypeCode) => number; // [0,1]
  applicable?: (draft: ObjectWorkspaceModules, archetype: ArchetypeCode) => boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bool01(value: boolean): number {
  return value ? 1 : 0;
}

/** Photos de l'objet (même heuristique que le hint nav : type/kind contient image/photo/visuel/cover). */
function countObjectPhotos(draft: ObjectWorkspaceModules): number {
  return draft.media.objectItems.filter((item) => {
    const text = `${item.typeCode} ${item.typeLabel} ${item.kind}`.toLowerCase();
    return PHOTO_HINT_TOKENS.some((token) => text.includes(token));
  }).length;
}

/** Équipements sélectionnés hors famille « accessibility » (évite le double-emploi §06/§09). */
function nonAccessibilityAmenityCount(draft: ObjectWorkspaceModules): number {
  const accessibilityCodes = new Set(
    draft.characteristics.amenityGroups
      .filter((group) => group.familyCode === 'accessibility')
      .flatMap((group) => group.options.map((option) => option.code)),
  );
  return draft.characteristics.selectedAmenityCodes.filter((code) => !accessibilityCodes.has(code)).length;
}

/** Slot 7 « équipements ou équivalent » — la donnée porteuse du §06, par archétype. */
function measureTypeBlock(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): number {
  const { capacityPolicies, rooms, menus, activity, itinerary, event, characteristics } = draft;
  switch (archetype) {
    case 'HEB':
      return bool01(
        capacityPolicies.capacityItems.some((item) => item.metricCode === 'max_capacity' && hasText(item.value)) ||
          rooms.items.length > 0 ||
          Boolean(rooms.unavailableReason),
      );
    case 'RES':
      return bool01(
        capacityPolicies.capacityItems.some((item) => item.metricCode === 'seats' && hasText(item.value)) ||
          menus.items.length > 0,
      );
    case 'ASC':
      return bool01(
        hasText(activity.durationMin) ||
          hasText(activity.minParticipants) ||
          hasText(activity.maxParticipants) ||
          hasText(activity.minAge) ||
          hasText(activity.difficultyLevel),
      );
    case 'ITI':
      return bool01(hasText(itinerary.geometrySummary) || itinerary.stages.length > 0);
    case 'VIS':
      return bool01(
        VISIT_MODE_CODES.some((code) => characteristics.selectedAmenityCodes.includes(code)) ||
          nonAccessibilityAmenityCount(draft) > 0,
      );
    case 'SRV':
      // N-A pour SPU (toilettes/eau, pas de §06) nécessiterait le type DB brut, pas seulement
      // l'archétype SRV — raffinement différé (spec décision PO #5).
      return bool01(characteristics.selectedAmenityCodes.length > 0);
    case 'FMA':
      return bool01(hasText(event.startDate) || event.occurrences.length > 0);
    default:
      return 1;
  }
}

const ESSENTIAL_DIMENSIONS: VisitorDimension[] = [
  { id: 'name', measure: (d) => bool01(hasText(d.generalInfo.name)) },
  {
    id: 'subcategory',
    // Aucun domaine de taxonomie pour ce type ⇒ N-A ; sinon ≥1 domaine assigné.
    measure: (d) => bool01(d.taxonomy.domains.some((domain) => Boolean(domain.assignment))),
    applicable: (d) => d.taxonomy.domains.length > 0,
  },
  {
    id: 'location',
    measure: (d) =>
      bool01(
        hasText(d.location.main.city) ||
          hasText(d.location.main.codeInsee) ||
          (hasText(d.location.main.latitude) && hasText(d.location.main.longitude)),
      ),
  },
  { id: 'contact', measure: (d) => bool01(d.contacts.objectItems.some((item) => item.isPublic && hasText(item.value))) },
  {
    id: 'description',
    measure: (d) =>
      bool01(hasTranslatableText(d.descriptions.object.chapo) && hasTranslatableText(d.descriptions.object.description)),
  },
  { id: 'photos', measure: (d, a) => clamp01(countObjectPhotos(d) / photoTargetFor(a)) },
  { id: 'typeBlock', measure: (d, a) => measureTypeBlock(d, a) },
  { id: 'tags', measure: (d) => bool01(d.tags.displayed.length > 0) },
];

const COMPLEMENTARY_DIMENSIONS: VisitorDimension[] = [
  { id: 'pricing', measure: (d) => bool01(d.pricing.prices.length > 0), applicable: (_d, a) => a !== 'SRV' },
  { id: 'opening', measure: (d) => bool01(d.openings.periods.length > 0) },
  { id: 'links', measure: (d) => bool01(d.relationships.relatedObjects.length > 0) },
  {
    id: 'attachments',
    measure: (d) => bool01(d.relationships.organizationLinks.length > 0 || d.memberships.items.length > 0),
  },
  { id: 'legal', measure: (d) => bool01(d.legal.records.length > 0) },
  {
    id: 'externalIds',
    measure: (d) => bool01(d.syncIdentifiers.externalIdentifiers.length > 0 || d.syncIdentifiers.origins.length > 0),
  },
  {
    id: 'subPlaces',
    measure: (d) => bool01(d.location.places.length > 0),
    applicable: (_d, a) => a === 'ITI' || a === 'VIS',
  },
];

const VALORISATION_DIMENSIONS: VisitorDimension[] = [
  { id: 'classement', measure: (d) => bool01(d.distinctions.distinctionGroups.some((group) => group.items.length > 0)) },
  { id: 'accessibilityLabel', measure: (d) => bool01(d.distinctions.accessibilityLabels.length > 0) },
  {
    id: 'sustainability',
    measure: (d) => bool01(d.sustainability.categories.some((cat) => cat.actions.some((action) => action.selected))),
  },
];

function applicableDimensions(
  dimensions: VisitorDimension[],
  draft: ObjectWorkspaceModules,
  archetype: ArchetypeCode,
): VisitorDimension[] {
  return dimensions.filter((dim) => (dim.applicable ? dim.applicable(draft, archetype) : true));
}

/** Score moyen [0,1] d'un paquet — dénominateur = dimensions applicables uniquement. */
function bucketScore(dimensions: VisitorDimension[], draft: ObjectWorkspaceModules, archetype: ArchetypeCode): number {
  const applicable = applicableDimensions(dimensions, draft, archetype);
  if (applicable.length === 0) {
    return 1;
  }
  const total = applicable.reduce((sum, dim) => sum + clamp01(dim.measure(draft, archetype)), 0);
  return total / applicable.length;
}

export function computeOverallCompletion(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): number {
  const essentials = bucketScore(ESSENTIAL_DIMENSIONS, draft, archetype);
  const complementary = bucketScore(COMPLEMENTARY_DIMENSIONS, draft, archetype);
  // Valorisation = bonus pur : moyenne des distinctions présentes, plafonnée ; absence = +0.
  const valorisation = clamp01(
    VALORISATION_DIMENSIONS.reduce((sum, dim) => sum + clamp01(dim.measure(draft, archetype)), 0) /
      VALORISATION_DIMENSIONS.length,
  );
  return Math.round(80 * essentials + 15 * complementary + 5 * valorisation);
}

/**
 * Statut tricolore « perçu visiteur », découplé du %.
 *   🔴 rouge  : au moins un bloquant de publication (droits §21 inclus) — via validateForPublication.
 *   🟢 vert   : aucun bloquant ET tous les essentiels applicables présents (≥4 photos inclus).
 *   🟠 orange : aucun bloquant mais un essentiel manque (typiquement < 4 photos).
 */
export function computeCompletionStatus(
  draft: ObjectWorkspaceModules,
  permissions: ObjectWorkspacePermissions,
  archetype: ArchetypeCode,
): CompletionStatus {
  if (validateForPublication(draft, permissions, archetype).blockers.length > 0) {
    return 'red';
  }
  const essentials = applicableDimensions(ESSENTIAL_DIMENSIONS, draft, archetype);
  const allPresent = essentials.every((dim) => dim.measure(draft, archetype) >= 1);
  return allPresent ? 'green' : 'orange';
}

export function computeSectionCompletions(
  draft: ObjectWorkspaceModules,
  items: SectionItem[],
): SectionCompletion[] {
  return items.map((item) => {
    const pct = computeSectionCompletion(item.num, draft);
    return {
      num: item.num,
      label: item.label,
      pct,
      stat: completionStatusFor(pct),
    };
  });
}

/** Short nav hint (design ref: EN/CRE, 4/6) — falls back to percent. */
export function computeNavHint(
  num: string,
  draft: ObjectWorkspaceModules,
  pct: number,
  archetype?: ArchetypeCode,
): string {
  if (num === '04') {
    const langs = draft.descriptions.availableLanguages;
    const object = draft.descriptions.object;
    const missing = langs.filter(
      (code) => !object.chapo.values[code] && !object.description.values[code],
    );
    if (missing.length > 0 && missing.length < langs.length) {
      return missing.map((c) => c.slice(0, 2).toUpperCase()).join('/');
    }
    if (missing.length === langs.length && langs.length > 1) {
      return `${langs.length - 1} lang.`;
    }
  }
  if (num === '05') {
    const target = archetype ? photoTargetFor(archetype) : PHOTO_TARGET;
    const photos = countObjectPhotos(draft);
    if (photos > 0 && photos < target) {
      return `${photos}/${target}`;
    }
  }
  if (num === '08') {
    const expired = draft.distinctions.distinctionGroups.flatMap((g) => g.items).filter(
      (item) => item.validUntil && new Date(item.validUntil) < new Date(),
    );
    if (expired.length > 0) {
      return `${expired.length} expir.`;
    }
  }
  if (num === '19' && draft.providerFollowUp.notes.length > 0) {
    return `${draft.providerFollowUp.notes.length} note(s)`;
  }
  if (pct >= 100) {
    return '';
  }
  return `${pct}%`;
}

import type { ObjectWorkspaceModules, WorkspaceTranslatableField } from '../../services/object-workspace-parser';
import type { SectionItem } from './section-config';

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

const SCORE_SECTION_NUMS = [
  '01',
  '02',
  '03',
  '04',
  '06',
  '07',
  '08',
  '10',
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
  '06': {
    fields: [
      (draft) => draft.media.objectItems.length > 0,
      (draft) => draft.media.objectItems.some((item) => item.isMain),
    ],
  },
  '07': {
    fields: [
      (draft) => draft.capacityPolicies.capacityItems.length > 0,
      (draft) => hasText(draft.capacityPolicies.groupPolicy.minSize) || hasText(draft.capacityPolicies.groupPolicy.maxSize),
    ],
  },
  '08': {
    fields: [
      (draft) => draft.distinctions.distinctionGroups.some((group) => group.items.length > 0),
    ],
  },
  '10': {
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

export function computeOverallCompletion(draft: ObjectWorkspaceModules, nums = SCORE_SECTION_NUMS): number {
  if (nums.length === 0) {
    return 100;
  }

  const values = nums.map((num) => computeSectionCompletion(num, draft));
  return Math.round(values.reduce((sum, pct) => sum + pct, 0) / values.length);
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
export function computeNavHint(num: string, draft: ObjectWorkspaceModules, pct: number): string {
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
  if (num === '06') {
    const photos = draft.media.objectItems.filter((item) => {
      const text = `${item.typeCode} ${item.typeLabel} ${item.kind}`.toLowerCase();
      return ['image', 'photo', 'visuel', 'cover'].some((t) => text.includes(t));
    });
    if (photos.length > 0 && photos.length < 6) {
      return `${photos.length}/6`;
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

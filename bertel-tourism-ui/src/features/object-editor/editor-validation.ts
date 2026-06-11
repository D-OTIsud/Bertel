import type { ArchetypeCode } from './archetypes';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

export type ValidationTone = 'req' | 'warn';

export interface Issue {
  section: string;
  message: string;
  tone: ValidationTone;
}

type ValidationRule = (input: {
  draft: ObjectWorkspaceModules;
  permissions: ObjectWorkspacePermissions;
  archetype: ArchetypeCode;
}) => Issue | null;

function hasText(value: string | null | undefined): boolean {
  return String(value ?? '').trim().length > 0;
}

function hasLongDescription(draft: ObjectWorkspaceModules): boolean {
  const field = draft.descriptions.object.description;
  const values = [field.baseValue, ...Object.values(field.values)];
  return values.some((value) => value.trim().length >= 120);
}

function canUsePublicationGate(permissions: ObjectWorkspacePermissions): boolean {
  const publication = permissions.publication;
  return publication.canDirectWrite || publication.canPrepareProposal || publication.canSubmitProposal;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Heuristic kind family from the ref contact_kind code (codes vary: phone/mobile/fax/email/website…). */
function classifyContactKind(kindCode: string): 'email' | 'phone' | 'url' | 'other' {
  const code = kindCode.toLowerCase();
  if (code.includes('mail')) return 'email';
  if (/(phone|tel|mobile|fax|gsm)/.test(code)) return 'phone';
  if (/(web|site|url)/.test(code)) return 'url';
  return 'other';
}

/**
 * Soft pre-save format check (warn-only): the DB only enforces the e-mail shape,
 * and only at save time — surface obvious slips before that. Empty values are the
 * presence rule's concern, not a format issue.
 */
function isContactValueWellFormed(kindCode: string, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  switch (classifyContactKind(kindCode)) {
    case 'email':
      return EMAIL_SHAPE.test(trimmed);
    case 'phone':
      return /^[+0-9 ().\-/]+$/.test(trimmed) && (trimmed.match(/\d/g)?.length ?? 0) >= 6;
    case 'url':
      try {
        new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        return true;
      } catch {
        return false;
      }
    default:
      return true;
  }
}

const VALIDATION_RULES: ValidationRule[] = [
  ({ draft }) =>
    hasText(draft.generalInfo.name)
      ? null
      : { section: '01', message: 'Le nom commercial est obligatoire avant publication.', tone: 'req' },
  ({ permissions }) =>
    canUsePublicationGate(permissions)
      ? null
      : { section: '21', message: 'Vos droits ne permettent pas de demander ou publier cette fiche.', tone: 'req' },
  ({ draft }) =>
    // The commune may arrive as a display name or as an INSEE code alone (ref_commune resolves it).
    hasText(draft.location.main.city) || hasText(draft.location.main.codeInsee)
      ? null
      : { section: '02', message: 'La commune de localisation est obligatoire avant publication.', tone: 'req' },
  ({ draft }) => {
    // §04 marks the canonical descriptif as required — back the star with a real gate.
    const description = draft.descriptions.object.description;
    return [description.baseValue, ...Object.values(description.values)].some(hasText)
      ? null
      : { section: '04', message: 'Le descriptif principal est obligatoire avant publication.', tone: 'req' };
  },
  ({ draft }) => {
    // Same contract for the accroche: the public card/drawer leads with it.
    const chapo = draft.descriptions.object.chapo;
    return [chapo.baseValue, ...Object.values(chapo.values)].some(hasText)
      ? null
      : { section: '04', message: "L'accroche est obligatoire avant publication.", tone: 'req' };
  },
  ({ archetype, draft }) =>
    archetype === 'ITI' && !hasText(draft.itinerary.geometrySummary)
      ? { section: '05', message: 'Un itinéraire doit disposer d’une trace ou d’un résumé de tracé.', tone: 'req' }
      : null,
  ({ archetype, draft }) =>
    // §48 — mirror the saver: it drops occurrence rows with neither startAt nor endAt,
    // so an all-empty repeater must still block publication.
    archetype === 'FMA' && !hasText(draft.event.startDate) &&
    !draft.event.occurrences.some((occurrence) => hasText(occurrence.startAt) || hasText(occurrence.endAt))
      ? { section: '05', message: 'Un événement doit avoir une date de début ou au moins une occurrence.', tone: 'req' }
      : null,
  ({ archetype, draft }) =>
    // §05 HEB: an accommodation with no room inventory publishes silently otherwise.
    // Skipped when the rooms module is §46-gated (non-HEB types reaching this archetype).
    archetype === 'HEB' && !draft.rooms.unavailableReason && draft.rooms.items.length === 0
      ? { section: '05', message: "Ajoutez au moins un type de chambre ou d'unité locative.", tone: 'warn' }
      : null,
  ({ draft }) => {
    // A PMR room declared in §05 should be reflected in the §10 accessibility equipment
    // (the Explorer accessibility facet reads the amenity codes, not the room flag).
    if (draft.rooms.unavailableReason || !draft.rooms.items.some((item) => item.accessible)) {
      return null;
    }
    const accessibilityCodes = new Set(
      draft.characteristics.amenityGroups
        .filter((group) => group.familyCode === 'accessibility')
        .flatMap((group) => group.options.map((option) => option.code)),
    );
    const hasAccessibilityEquipment = draft.characteristics.selectedAmenityCodes
      .some((code) => accessibilityCodes.has(code));
    return hasAccessibilityEquipment
      ? null
      : {
          section: '10',
          message: 'Une chambre PMR est déclarée (§05) — sélectionnez les équipements d’accessibilité correspondants.',
          tone: 'warn',
        };
  },
  ({ draft }) =>
    hasLongDescription(draft)
      ? null
      : { section: '04', message: 'Le descriptif est court; ajoutez un texte éditorial plus complet.', tone: 'warn' },
  ({ draft }) =>
    draft.media.objectItems.length > 0
      ? null
      : { section: '06', message: 'Ajoutez au moins un média publié pour améliorer la fiche.', tone: 'warn' },
  ({ draft }) =>
    // An internal-only channel is not published — the public card needs a PUBLIC contact.
    draft.contacts.objectItems.some((item) => hasText(item.value) && item.isPublic)
      ? null
      : { section: '03', message: 'Ajoutez au moins un contact public (les canaux internes ne sont pas publiés).', tone: 'warn' },
  ({ draft }) => {
    const malformed = draft.contacts.objectItems.filter(
      (item) => !isContactValueWellFormed(item.kindCode, item.value),
    );
    return malformed.length === 0
      ? null
      : {
          section: '03',
          message: `${malformed.length} contact(s) au format invalide — vérifiez e-mail, téléphone ou URL.`,
          tone: 'warn',
        };
  },
  ({ draft }) =>
    draft.openings.periods.length > 0
      ? null
      : { section: '14', message: 'Renseignez une période d’ouverture ou une règle de disponibilité.', tone: 'warn' },
];

export function validateForPublication(
  draft: ObjectWorkspaceModules,
  permissions: ObjectWorkspacePermissions,
  archetype: ArchetypeCode,
): { blockers: Issue[]; warnings: Issue[] } {
  const issues = VALIDATION_RULES
    .map((rule) => rule({ draft, permissions, archetype }))
    .filter((issue): issue is Issue => issue !== null);

  return {
    blockers: issues.filter((issue) => issue.tone === 'req'),
    warnings: issues.filter((issue) => issue.tone === 'warn'),
  };
}

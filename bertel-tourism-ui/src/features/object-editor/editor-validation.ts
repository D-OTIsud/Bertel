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
  ({ draft }) =>
    hasLongDescription(draft)
      ? null
      : { section: '04', message: 'Le descriptif est court; ajoutez un texte éditorial plus complet.', tone: 'warn' },
  ({ draft }) =>
    draft.media.objectItems.length > 0
      ? null
      : { section: '06', message: 'Ajoutez au moins un média publié pour améliorer la fiche.', tone: 'warn' },
  ({ draft }) =>
    draft.contacts.objectItems.some((item) => hasText(item.value))
      ? null
      : { section: '03', message: 'Ajoutez un contact public ou opérationnel.', tone: 'warn' },
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

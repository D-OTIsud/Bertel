import type { ArchetypeCode } from './archetypes';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { readTranslatableField } from './sections/descriptions-field';
import { spokenCodeToDescKey } from './sections/spoken-languages';
import { hasText } from './editor-text';
import { isContactValueWellFormed } from './editor-contact-validation';

export type ValidationTone = 'req' | 'warn';

export interface Issue {
  /**
   * ⚠️ CHAMP SURCHARGÉ, et c'est délibéré : il porte un NUMÉRO de section pour les blocages de
   * publication et les alertes (regroupés par `groupIssuesBySection`), mais un LIBELLÉ DE MODULE
   * pour les erreurs d'enregistrement (un module couvre légitimement plusieurs sections).
   * Ne pas s'en servir pour naviguer — utiliser `nums`.
   */
  section: string;
  message: string;
  tone: ValidationTone;
  /**
   * Sections vers lesquelles sauter, dans l'ordre de pertinence (chantier 2026-08-28 n°4, lot C).
   *
   * C'est la SURCHARGE de `section` ci-dessus qui empêchait les erreurs d'enregistrement d'offrir
   * un bouton « Aller › » : leur `section` est un libellé, et `document.getElementById('section-'
   * + label)` ne désigne rien. Un champ séparé règle le problème sans toucher au regroupement
   * existant. Absent ⇒ pas de saut (une erreur qui ne se rattache à aucune section reste lisible,
   * elle n'offre simplement pas d'action).
   */
  nums?: string[];
}

type ValidationRule = (input: {
  draft: ObjectWorkspaceModules;
  permissions: ObjectWorkspacePermissions;
  archetype: ArchetypeCode;
}) => Issue | null;

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
  ({ draft, archetype }) =>
    hasText(draft.generalInfo.name)
      ? null
      : { section: '01', message: archetype === 'ITI' ? 'Le nom de l’itinéraire est obligatoire avant publication.' : 'Le nom commercial est obligatoire avant publication.', tone: 'req' },
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
  ({ draft, archetype }) => {
    // Each spoken language should have a complete translation (accroche + descriptif).
    // Non-blocking: missing translations can be drafted with AI in the descriptions section.
    const characteristics = draft.characteristics;
    if (archetype === 'ITI' || characteristics.unavailableReason) {
      return null;
    }
    const object = draft.descriptions.object;
    const local = 'fr'; // Canonical base text, independent of the account's language preference.
    const missing = characteristics.selectedLanguages
      .filter((lang) => {
        const key = spokenCodeToDescKey(lang.code);
        const hasChapo = hasText(readTranslatableField(object.chapo, key, local));
        const hasDescription = hasText(readTranslatableField(object.description, key, local));
        return !hasChapo || !hasDescription;
      })
      .map((lang) => lang.label);
    return missing.length === 0
      ? null
      : {
          section: '04',
          message: `Langues parlées sans traduction complète : ${missing.join(', ')} (accroche + descriptif attendus).`,
          tone: 'warn',
        };
  },
  ({ archetype, draft }) =>
    archetype === 'ITI' && !draft.itinerary.trackGeojson && !hasText(draft.itinerary.geometrySummary)
      ? { section: '06', message: 'Un itinéraire doit disposer d’une trace ou d’un résumé de tracé.', tone: 'req' }
      : null,
  ({ archetype, draft }) =>
    // §48 — mirror the saver: it drops occurrence rows with neither startAt nor endAt,
    // so an all-empty repeater must still block publication.
    archetype === 'FMA' && !hasText(draft.event.startDate) &&
    !draft.event.occurrences.some((occurrence) => hasText(occurrence.startAt) || hasText(occurrence.endAt))
      ? { section: '06', message: 'Un événement doit avoir une date de début ou au moins une occurrence.', tone: 'req' }
      : null,
  // §64 — plus de warn « ajoutez un type de chambre » : les chambres sont un détail OPTIONNEL
  // (485/497 HEB sont des locatifs entiers sans découpage par chambre). La capacité d'accueil
  // (capacité max en §06) est la donnée porteuse, pas l'inventaire des chambres.
  ({ draft, archetype }) => {
    // A PMR room declared in §05 should be reflected in the §10 accessibility equipment
    // (the Explorer accessibility facet reads the amenity codes, not the room flag).
    if (archetype !== 'HEB' || draft.rooms.unavailableReason || !draft.rooms.items.some((item) => item.accessible)) {
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
          section: '09',
          message: 'Une chambre PMR est déclarée (§06) — sélectionnez les équipements d’accessibilité correspondants.',
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
      : { section: '05', message: 'Ajoutez au moins un média publié pour améliorer la fiche.', tone: 'warn' },
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
  ({ draft, archetype }) =>
    archetype === 'ITI' || draft.openings.periods.length > 0
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

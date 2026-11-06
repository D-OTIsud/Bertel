import type { ArchetypeCode } from '../object-editor/archetypes';
import type { ObjectWorkspaceCharacteristicsModule, ObjectWorkspaceModules } from '../../services/object-workspace-parser';

export const PORTAL_DISABILITIES = [
  { code: 'motor', label: 'Mobilité', who: 'Les personnes en fauteuil roulant, les parents avec poussette, les seniors et les personnes avec des béquilles.', tip: 'Une rampe amovible ou une table accessible en fauteuil changent déjà beaucoup.' },
  { code: 'visual', label: 'Vision', who: 'Les personnes aveugles ou malvoyantes, et celles qui lisent mal les petits caractères.', tip: 'Proposer des documents en grands caractères est un premier geste simple.' },
  { code: 'hearing', label: 'Audition', who: 'Les personnes sourdes ou malentendantes, et celles qui entendent mal dans le bruit.', tip: 'Pouvoir échanger par écrit facilite déjà l’accueil.' },
  { code: 'cognitive', label: 'Compréhension', who: 'Les personnes avec un handicap mental ou psychique, autistes, fatiguées ou désorientées.', tip: 'Des pictogrammes et un coin calme peuvent aider vos visiteurs.' },
] as const;

const STAY_ONLY = new Set(['acc_adapted_bed_height', 'acc_room_clearance', 'acc_grab_bar_shower', 'acc_shower_seat', 'acc_walk_in_shower']);

export function portalAccessibilityOptions(module: ObjectWorkspaceCharacteristicsModule | undefined, archetype: ArchetypeCode) {
  return (module?.amenityGroups ?? []).filter((group) => group.familyCode === 'accessibility')
    .flatMap((group) => group.options)
    .filter((option) => archetype === 'HEB' || !STAY_ONLY.has(option.code));
}

export function isAccessibilityAmenity(module: ObjectWorkspaceCharacteristicsModule | undefined, code: string): boolean {
  return code.startsWith('acc_') || (module?.amenityGroups ?? []).some((group) => group.familyCode === 'accessibility' && group.options.some((option) => option.code === code));
}

/** Projections propres aux deux vues du même module ; les catalogues ne sont pas des saisies. */
export function portalAccessibilityFields(draft: ObjectWorkspaceModules, archetype: ArchetypeCode) {
  const module = draft.characteristics;
  const visible = new Set(portalAccessibilityOptions(module, archetype).map((option) => option.code));
  return [...(module?.selectedAmenityCodes ?? [])].filter((code) => visible.has(code)).sort();
}

export function portalEquipmentFields(draft: ObjectWorkspaceModules) {
  const module = draft.characteristics;
  return {
    amenities: [...(module?.selectedAmenityCodes ?? [])].filter((code) => !isAccessibilityAmenity(module, code)).sort(),
    payments: [...(module?.selectedPaymentCodes ?? [])].sort(),
  };
}

export function hasTourismeHandicapLabel(draft: ObjectWorkspaceModules): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return (draft.distinctions?.accessibilityLabels ?? []).some((item) => item.schemeCode === 'LBL_TOURISME_HANDICAP'
    && item.status === 'granted' && (!item.validUntil || item.validUntil >= today));
}

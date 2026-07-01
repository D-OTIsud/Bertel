// Labels + couleurs d'accent par type d'objet — module SANS 'use client', partageable entre
// le composant client (OtiTemplate) et le rendu serveur de l'email (ListEmail).

export type ListHue = 'teal' | 'terra' | 'green' | 'gold';

export const LABEL_BY_TYPE: Record<string, { fr: string; en: string }> = {
  HOT: { fr: 'Hébergement', en: 'Where to stay' }, HLO: { fr: 'Location', en: 'Rental' },
  HPA: { fr: 'Camping', en: 'Campsite' }, CAMP: { fr: 'Camping', en: 'Campsite' }, RVA: { fr: 'Village vacances', en: 'Holiday village' },
  RES: { fr: 'Table', en: 'Where to eat' },
  ACT: { fr: 'Activité', en: 'Activity' }, ASC: { fr: 'Activité', en: 'Activity' },
  ITI: { fr: 'Itinéraire', en: 'Trail' },
  VIS: { fr: 'À visiter', en: 'To visit' }, PCU: { fr: 'Patrimoine', en: 'Heritage' },
  PRD: { fr: 'Producteur', en: 'Producer' }, COM: { fr: 'Commerce', en: 'Shop' },
  SPU: { fr: 'Nature', en: 'Nature' }, PNA: { fr: 'Nature', en: 'Nature' }, LOI: { fr: 'Loisir', en: 'Leisure' },
  EVT: { fr: 'Événement', en: 'Event' }, FMA: { fr: 'Manifestation', en: 'Event' },
};

export const HUE_BY_TYPE: Record<string, ListHue> = {
  HOT: 'teal', HLO: 'teal', HPA: 'teal', CAMP: 'teal', RVA: 'teal',
  RES: 'terra', EVT: 'terra', FMA: 'terra',
  ACT: 'green', ASC: 'green', ITI: 'green', PNA: 'green',
  VIS: 'gold', PCU: 'gold', PRD: 'gold', COM: 'gold', SPU: 'gold', LOI: 'gold',
};

/** Accent → teinte principale (ink) en hex, pour l'email inline-styled. */
export const ACCENT_INK: Record<string, string> = {
  teal: '#006883', green: '#4f9c72', gold: '#c69a26', terra: '#b34b3d',
};

export function typeLabel(code: string, lang: 'fr' | 'en'): string {
  return LABEL_BY_TYPE[code]?.[lang] ?? code;
}

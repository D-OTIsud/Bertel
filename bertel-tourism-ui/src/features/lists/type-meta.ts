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

/** Palette OTI par accent (teinte principale / foncée / fond doux) — hex du design 019e20ac. */
export const OTI_ACCENTS: Record<string, { ink: string; deep: string; soft: string }> = {
  teal: { ink: '#006883', deep: '#024053', soft: '#e0eef1' },
  green: { ink: '#4f9c72', deep: '#3f7d5c', soft: '#e7f2ec' },
  gold: { ink: '#c69a26', deep: '#a07c18', soft: '#f7efd4' },
  terra: { ink: '#b34b3d', deep: '#8f3a2e', soft: '#f6e3df' },
};

/** Accent → teinte principale (ink) en hex, pour l'email inline-styled. */
export const ACCENT_INK: Record<string, string> = Object.fromEntries(
  Object.entries(OTI_ACCENTS).map(([k, v]) => [k, v.ink]),
);

export function typeLabel(code: string, lang: 'fr' | 'en'): string {
  return LABEL_BY_TYPE[code]?.[lang] ?? code;
}

/** URL cliquable d'un site web (les valeurs réelles mélangent domaines nus et http(s)://…). */
export function webHref(web: string): string {
  return /^https?:\/\//i.test(web) ? web : `https://${web}`;
}

/** Libellé court d'un site web : sans protocole ni slash final. */
export function webLabel(web: string): string {
  return web.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

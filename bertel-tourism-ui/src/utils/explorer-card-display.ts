/**
 * Projections d'AFFICHAGE de la carte résultat Explorer (impl. 3.1) — pures,
 * dérivées de la taxonomie unifiée (utils/labels.ts) et des données déjà portées
 * par l'ObjectCard (badges/labels/rating). Aucune donnée fabriquée : un champ
 * absent n'est pas inventé.
 *
 * - cardTypeDisplay : pastille de type (libellé FR + accent d'archétype).
 *   NB : la pastille « ouvert/fermé » est désormais pilotée par la DONNÉE
 *   (open_now tri-état, §128), pour TOUS les types — plus de porte par archétype.
 * - cardClassementRating : nombre + unité (étoile/épi/clé) — cocarde RÉSERVÉE aux HEB.
 * - cardLabelLogos : pastilles-logo des labels reconnus (granted ; le RPC carte
 *   ne projette que des distinctions accordées sur les fiches publiques).
 */
import type { ObjectCard } from '../types/domain';
import { resolveArchetype, resolveArchetypeAccentClass, resolveTypeLabel } from './labels';
import type { ArchetypeCode } from '../features/object-editor/archetypes';

export interface CardTypeDisplay {
  archetype: ArchetypeCode | null;
  accentClass: string;
  typeLabel: string;
}

export function cardTypeDisplay(card: ObjectCard): CardTypeDisplay {
  const archetype = resolveArchetype(card.type);
  return {
    archetype,
    accentClass: resolveArchetypeAccentClass(card.type),
    typeLabel: resolveTypeLabel(card.type),
  };
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Unité de cocarde : étoiles (hôtels/campings…), épis (Gîtes de France), clés (Clévacances). */
export type ClassementUnit = 'etoile' | 'epi' | 'cle';

export interface CardClassementRating {
  count: number;
  unit: ClassementUnit;
}

/** Étoiles/épis/clés d'un classement — cocarde réservée aux hébergements (HEB). */
const STAR_RE = /(\d+)\s*(etoile|epi|cle|star|key)/;

/** Jeton capturé (déjà normalisé sans accents) → unité de cocarde canonique. */
const UNIT_BY_TOKEN: Record<string, ClassementUnit> = {
  etoile: 'etoile',
  star: 'etoile',
  epi: 'epi',
  cle: 'cle',
  key: 'cle',
};

/**
 * Nombre + unité du classement le plus pertinent porté par les badges, pour la cocarde.
 * RÉSERVÉE aux hébergements (HEB) ; renvoie null hors HEB ou sans badge gradé reconnu.
 */
export function cardClassementRating(card: ObjectCard): CardClassementRating | null {
  if (resolveArchetype(card.type) !== 'HEB') {
    return null;
  }
  for (const badge of card.badges ?? []) {
    const match = STAR_RE.exec(normalize(badge?.label ?? badge?.name));
    if (match) {
      const n = Number(match[1]);
      if (n >= 1 && n <= 5) {
        return { count: n, unit: UNIT_BY_TOKEN[match[2]] };
      }
    }
  }
  return null;
}

export interface CardLabelLogo {
  key: string;
  logoClass: string;
  title: string;
}

/** Labels reconnus → (classe de pastille colorée, titre FR). Ordre = priorité de test. */
const KNOWN_LABELS: Array<{ test: (n: string) => boolean; logoClass: string; title: string }> = [
  { test: (n) => n.includes('clef verte') || n.includes('cle verte'), logoClass: 'lbl-clef-verte', title: 'Clef Verte' },
  { test: (n) => n.includes('ecolabel'), logoClass: 'lbl-ecolabel', title: 'Écolabel UE' },
  { test: (n) => n.includes('handicap'), logoClass: 'lbl-th', title: 'Tourisme & Handicap' },
  { test: (n) => n.includes('qualite tourisme'), logoClass: 'lbl-qualite', title: 'Qualité Tourisme' },
  { test: (n) => n.includes('destination excellence'), logoClass: 'lbl-excellence', title: 'Destination Excellence' },
];

export function cardLabelLogos(card: ObjectCard): CardLabelLogo[] {
  const sources: string[] = [
    ...(card.badges ?? []).map((b) => String(b?.label ?? b?.name ?? '')),
    ...(card.labels ?? []),
  ];
  const seen = new Set<string>();
  const logos: CardLabelLogo[] = [];
  for (const raw of sources) {
    const n = normalize(raw);
    if (!n) continue;
    const match = KNOWN_LABELS.find((entry) => entry.test(n));
    if (match && !seen.has(match.logoClass)) {
      seen.add(match.logoClass);
      logos.push({ key: match.logoClass, logoClass: match.logoClass, title: match.title });
    }
  }
  return logos;
}

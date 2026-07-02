import { defaultMarkerStyles } from '../../config/map-markers';
import type { ObjectTypeCode } from '../../types/domain';

/**
 * Composition d'un cluster carte : nombre de fiches par archétype, agrégé par
 * supercluster (`map`/`reduce`) au moment du clustering. Clés = codes d'archétype
 * Explorer ; les clés inconnues/vides sont ignorées au rendu.
 */
export type ClusterTypeCounts = Partial<Record<string, number>>;

/**
 * Ordre des segments de l'anneau = ordre de la LÉGENDE (`MapLegend`) — pour que
 * l'anneau soit décodable avec la même lecture que la légende, quelle que soit
 * l'ordre d'arrivée des comptes.
 */
const RING_ORDER: ObjectTypeCode[] = ['HOT', 'RES', 'ACT', 'ITI', 'VIS', 'SRV', 'EVT'];

/**
 * Construit le `conic-gradient` de composition d'un cluster : chaque archétype
 * présent occupe un secteur proportionnel à son nombre de fiches, dans les
 * couleurs de `defaultMarkerStyles` (mêmes couleurs que les pins statiques
 * `public/markers/*.png` ET que la légende — source unique, pas de divergence
 * possible). Un cluster mono-type → un seul secteur 0–100 % = disque plein de
 * la couleur du type (toujours signifiant).
 *
 * @returns la valeur CSS `conic-gradient(...)`, ou `null` si aucune composition
 *          résoluble (cluster vide ou uniquement des types inconnus).
 */
export function buildClusterCompositionGradient(counts: ClusterTypeCounts): string | null {
  const segments = RING_ORDER
    .map((code) => ({ code, n: counts[code] ?? 0 }))
    .filter((segment) => segment.n > 0);

  const total = segments.reduce((sum, segment) => sum + segment.n, 0);
  if (total <= 0) {
    return null;
  }

  const stops: string[] = [];
  let accumulated = 0;
  for (const { code, n } of segments) {
    const start = toPercent(accumulated, total);
    accumulated += n;
    const end = toPercent(accumulated, total);
    stops.push(`${defaultMarkerStyles[code].color} ${start}% ${end}%`);
  }

  return `conic-gradient(${stops.join(', ')})`;
}

/** Pourcentage borné à 2 décimales (évite les longs flottants dans le CSS). */
function toPercent(part: number, total: number): number {
  return Math.round((part / total) * 10000) / 100;
}

// Helpers purs de la carte récap du template OTI (MapRecap / OtiMapRecap).
// Séparés du composant pour rester testables sans maplibre.

/** Forme minimale d'un point localisable (structurel — évite l'import circulaire d'OtiPoi). */
export interface OtiMapPoint {
  lat: number | null;
  lon: number | null;
}

export interface LocatedPoi<T extends OtiMapPoint> {
  poi: T;
  /** Numéro de carte 1-based dans l'ordre de la liste — un item sans coordonnées crée un trou, comme la carte des étapes ITI. */
  n: number;
  lat: number;
  lon: number;
}

/** Cliché de la carte pour l'impression : le canvas WebGL ne peut pas se rendre dans le
 * portail print (display:none) ni s'imprimer fiablement — on fige une image + la position
 * des pins en % du conteneur (les markers DOM ne font pas partie du canvas). */
export interface OtiMapSnapshot {
  url: string;
  pins: Array<{ n: number; xPct: number; yPct: number }>;
}

export function locatedPois<T extends OtiMapPoint>(pois: T[]): Array<LocatedPoi<T>> {
  const out: Array<LocatedPoi<T>> = [];
  pois.forEach((poi, index) => {
    if (typeof poi.lat === 'number' && typeof poi.lon === 'number') {
      out.push({ poi, n: index + 1, lat: poi.lat, lon: poi.lon });
    }
  });
  return out;
}

/** [minLon, minLat, maxLon, maxLat] — null si vide. */
export function bboxOf(points: Array<{ lat: number; lon: number }>): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Projette les pins en pourcentages du conteneur ; écarte ceux hors champ (carte déplacée). */
export function projectPins(
  located: Array<{ n: number; lat: number; lon: number }>,
  project: (lngLat: [number, number]) => { x: number; y: number },
  width: number,
  height: number,
): OtiMapSnapshot['pins'] {
  if (width <= 0 || height <= 0) return [];
  const pins: OtiMapSnapshot['pins'] = [];
  for (const { n, lat, lon } of located) {
    const { x, y } = project([lon, lat]);
    const xPct = (x / width) * 100;
    const yPct = (y / height) * 100;
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) continue;
    pins.push({ n, xPct: Math.round(xPct * 100) / 100, yPct: Math.round(yPct * 100) / 100 });
  }
  return pins;
}

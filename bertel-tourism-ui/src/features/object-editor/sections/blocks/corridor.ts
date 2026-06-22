// §111 Section 06 ITI — stage placement corridor. A stage GPS point must sit within an adjustable
// distance (default 50 m) of the imported trace. Pure geo helpers over the trace coordinates.
import pointToLineDistance from '@turf/point-to-line-distance';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';

/** Drop any elevation (3rd coord) — turf line ops are 2D. */
function to2d(line: number[][]): [number, number][] {
  return line.map((c) => [c[0], c[1]] as [number, number]);
}

/** Distance in METERS from (lng,lat) to the trace polyline. Infinity if the line is degenerate. */
export function metersToTrack(lng: number, lat: number, line: number[][]): number {
  if (line.length < 2) return Infinity;
  return pointToLineDistance(point([lng, lat]), lineString(to2d(line)), { units: 'meters' });
}

/** True when (lng,lat) is within `widthM` meters of the trace. */
export function isInsideCorridor(lng: number, lat: number, line: number[][], widthM: number): boolean {
  return metersToTrack(lng, lat, line) <= widthM;
}

/** The closest point ON the trace to (lng,lat), as [lng,lat]. */
export function nearestOnTrack(lng: number, lat: number, line: number[][]): [number, number] {
  const snapped = nearestPointOnLine(lineString(to2d(line)), point([lng, lat]));
  const c = snapped.geometry.coordinates;
  return [c[0], c[1]];
}

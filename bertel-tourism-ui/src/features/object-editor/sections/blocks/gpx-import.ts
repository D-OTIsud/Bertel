// §111 Section 06 ITI — client-side GPX/KML parsing for the trace import. The merged LineString
// (elevation preserved as the 3rd coordinate) is sent to api.set_itinerary_track, which stores the
// 2D geometry and auto-derives distance / elevation / profile server-side (PostGIS).
import { gpx, kml } from '@tmcw/togeojson';

export interface TrackLineString {
  type: 'LineString';
  coordinates: number[][];
}

type GeoFeatureCollection = {
  features?: Array<{ geometry?: { type?: string; coordinates?: unknown } | null } | null>;
};

export type TrackFormat = 'gpx' | 'kml';

export function detectTrackFormat(filename: string): TrackFormat | null {
  if (/\.gpx$/i.test(filename)) return 'gpx';
  if (/\.kml$/i.test(filename)) return 'kml';
  return null;
}

/**
 * Pure: merge every LineString / MultiLineString in a GeoJSON FeatureCollection into ONE LineString,
 * concatenating coordinates in document order and preserving each point's elevation (3rd coordinate).
 * object_iti.geom is a single LineString, so multi-segment tracks (GPX <trkseg>) must be merged here.
 * Returns null when fewer than 2 points are found (no usable track).
 */
export function mergeFeaturesToLineString(fc: GeoFeatureCollection): TrackLineString | null {
  const coords: number[][] = [];
  for (const feature of fc.features ?? []) {
    const geom = feature?.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates as unknown[]) {
        if (Array.isArray(c) && c.length >= 2) coords.push(c as number[]);
      }
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const seg of geom.coordinates as unknown[]) {
        if (!Array.isArray(seg)) continue;
        for (const c of seg as unknown[]) {
          if (Array.isArray(c) && c.length >= 2) coords.push(c as number[]);
        }
      }
    }
  }
  if (coords.length < 2) return null;
  return { type: 'LineString', coordinates: coords };
}

/**
 * Browser/jsdom: parse a GPX or KML file's text into a single merged LineString.
 * Throws a user-facing message on an unsupported extension or a file with no track.
 */
export function parseTrackFile(fileText: string, filename: string): TrackLineString {
  const format = detectTrackFormat(filename);
  if (!format) {
    throw new Error('Format non supporté : choisissez un fichier .gpx ou .kml.');
  }
  const doc = new DOMParser().parseFromString(fileText, 'text/xml');
  const fc = (format === 'kml' ? kml(doc) : gpx(doc)) as GeoFeatureCollection;
  const line = mergeFeaturesToLineString(fc);
  if (!line) {
    throw new Error('Aucun tracé trouvé dans le fichier.');
  }
  return line;
}

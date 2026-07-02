import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString } from 'geojson';
import { mockObjectDetails } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

/**
 * D18 — tracés ITI pour la carte de l'Explorer.
 * La géométrie vit dans `object_iti.geom` et sort de `api.get_object_resource`
 * (`p_track_format:'geojson'` → `raw.itinerary.track`) ; les étapes numérotées
 * sortent de `raw.itinerary_details.stages` (lng/lat émis par §111).
 * ponytail: un fetch résolu PAR ITI visible (caché longuement côté React-Query) —
 * le plafond propre est un RPC batch léger `get_iti_tracks(ids)` ou la géométrie
 * simplifiée portée par le RPC markers (remonté à la session API).
 */

export interface ItiStagePoint {
  position: number;
  name: string;
  lat: number;
  lng: number;
}

export interface ItiTrack {
  id: string;
  name: string;
  /** Géométries linéaires du tracé (LineString/MultiLineString uniquement). */
  lines: Array<LineString | MultiLineString>;
  stages: ItiStagePoint[];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Coordonnée numérique stricte — `Number(null)` vaut 0 : une étape sans geom pointerait sur (0,0). */
function readCoord(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectLineGeometries(value: unknown, out: Array<LineString | MultiLineString>): void {
  if (!value || typeof value !== 'object') return;
  const node = value as { type?: unknown; features?: unknown; geometry?: unknown; geometries?: unknown };
  const type = typeof node.type === 'string' ? node.type : '';
  if (type === 'FeatureCollection' && Array.isArray(node.features)) {
    for (const feature of node.features) collectLineGeometries(feature, out);
    return;
  }
  if (type === 'Feature') {
    collectLineGeometries(node.geometry, out);
    return;
  }
  if (type === 'GeometryCollection' && Array.isArray(node.geometries)) {
    for (const geometry of node.geometries) collectLineGeometries(geometry, out);
    return;
  }
  if (type === 'LineString' || type === 'MultiLineString') {
    out.push(value as LineString | MultiLineString);
  }
  // Les Points (départ/arrivée) sont ignorés : les marqueurs les portent déjà.
}

/** Parse le `raw` d'une ressource objet en tracé carte. Pure — testée unitairement. */
export function parseItiTrack(objectId: string, raw: Record<string, unknown>): ItiTrack {
  const itinerary = readRecord(raw.itinerary);
  const details = readRecord(raw.itinerary_details);

  let trackValue: unknown = itinerary.track ?? raw.track ?? details.track ?? null;
  if (typeof trackValue === 'string' && trackValue.trim()) {
    try {
      trackValue = JSON.parse(trackValue);
    } catch {
      trackValue = null; // format non-geojson (ex. gpx brut) : pas de ligne, honnête.
    }
  }
  const lines: Array<LineString | MultiLineString> = [];
  collectLineGeometries(trackValue, lines);

  const stages: ItiStagePoint[] = (Array.isArray(details.stages) ? details.stages : [])
    .map((entry, index) => {
      const stage = readRecord(entry);
      const lat = readCoord(stage.lat);
      const lng = readCoord(stage.lng);
      if (lat == null || lng == null) return null;
      const position = Number(stage.position);
      return {
        position: Number.isFinite(position) && position > 0 ? position : index + 1,
        name: typeof stage.name === 'string' ? stage.name : '',
        lat,
        lng,
      };
    })
    .filter((stage): stage is ItiStagePoint => stage !== null)
    .sort((a, b) => a.position - b.position);

  return {
    id: objectId,
    name: typeof raw.name === 'string' ? raw.name : '',
    lines,
    stages,
  };
}

/** FeatureCollection des tracés chargés — une feature par géométrie, props {id, name}. */
export function buildItiTrackFeatureCollection(tracks: ItiTrack[]): FeatureCollection {
  const features: Feature[] = tracks.flatMap((track) =>
    track.lines.map((geometry) => ({
      type: 'Feature' as const,
      geometry: geometry as Geometry,
      properties: { id: track.id, name: track.name },
    })),
  );
  return { type: 'FeatureCollection', features };
}

/**
 * Charge le tracé d'UN ITI. Payload volontairement minimal : pas de rendu ni de
 * privé — seul `p_track_format:'geojson'` importe ici. En démo : mocks du drawer.
 */
export async function fetchItiTrack(objectId: string, langPrefs: string[]): Promise<ItiTrack> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return parseItiTrack(objectId, readRecord(mockObjectDetails[objectId]?.raw));
  }

  const { data, error } = await client.schema('api').rpc('get_object_resource', {
    p_object_id: objectId,
    p_lang_prefs: langPrefs,
    p_track_format: 'geojson',
    p_options: { render: false, include_private: false },
  });

  if (error) {
    throw error;
  }

  return parseItiTrack(objectId, readRecord(data));
}

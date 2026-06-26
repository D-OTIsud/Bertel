'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Layer, Map, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre';
import { DEFAULT_APP_MAP_STYLE } from '../../../lib/map-style';
import { REUNION_MAP_CENTER } from './location-coords';
import { parseTrackFile, type TrackLineString } from '../sections/blocks/gpx-import';
import { saveObjectWorkspaceItineraryTrack } from '../../../services/object-workspace';
import type { ObjectWorkspaceItineraryStageSummary } from '../../../services/object-workspace-parser';

export interface ItiTraceImport {
  distanceKm: string;
  elevationGain: string;
  elevationLoss: string;
  /** The imported trace geometry (null on clear) — flows into the draft so the stage map sees it too. */
  trackGeojson: { type: string; coordinates: number[][] } | null;
}

interface ItiTraceMapProps {
  objectId: string;
  initialTrack: { type: string; coordinates: number[][] } | null;
  /** §111 — the draft stages; those carrying a GPS point render as numbered markers on the map. */
  stages?: ObjectWorkspaceItineraryStageSummary[];
  /** Called after a successful import/clear with the server-derived metrics AND the geometry. */
  onImported: (result: ItiTraceImport) => void;
}

function bbox(coords: number[][]): [number, number, number, number] | null {
  if (coords.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of coords) {
    const x = c[0];
    const y = c[1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * §111 Section 06 ITI — the trace import zone (GPX/KML drag-and-drop + button) and the MapLibre map
 * that renders the trace. Importing parses the file client-side (single merged LineString, elevation
 * preserved), then api.set_itinerary_track stores the geometry and returns the auto-derived metrics.
 */
export function ItiTraceMap({ objectId, initialTrack, stages = [], onImported }: ItiTraceMapProps) {
  const mapRef = useRef<MapRef>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [track, setTrack] = useState<{ type: string; coordinates: number[][] } | null>(initialTrack);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Stages carrying a placed GPS point — keep the original index so marker numbers match the cards.
  const stagePoints = stages
    .map((stage, index) => ({ stage, index, lng: Number(stage.lng), lat: Number(stage.lat) }))
    .filter(({ stage, lng, lat }) => stage.lng !== '' && stage.lat !== '' && Number.isFinite(lng) && Number.isFinite(lat));

  const fitToCoords = useCallback((coords: number[][]) => {
    const map = mapRef.current?.getMap();
    const bb = bbox(coords);
    if (!map || !bb) return;
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 36, duration: 500, maxZoom: 15 });
  }, []);

  useEffect(() => {
    if (track && track.coordinates.length > 1) {
      fitToCoords(track.coordinates);
    } else if (stagePoints.length > 0) {
      // No trace, but stages have points — frame them so the markers are visible.
      fitToCoords(stagePoints.map((p) => [p.lng, p.lat]));
    }
    // initial fit only — subsequent fits happen in importFile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importFile(file: File) {
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      const line: TrackLineString = parseTrackFile(text, file.name);
      const metrics = await saveObjectWorkspaceItineraryTrack(objectId, line);
      setTrack(line);
      onImported({ distanceKm: metrics.distanceKm, elevationGain: metrics.elevationGain, elevationLoss: metrics.elevationLoss, trackGeojson: line });
      fitToCoords(line.coordinates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function clearTrack() {
    setBusy(true);
    setError('');
    try {
      await saveObjectWorkspaceItineraryTrack(objectId, null);
      setTrack(null);
      onImported({ distanceKm: '', elevationGain: '', elevationLoss: '', trackGeojson: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  }

  const center = track && track.coordinates.length > 0
    ? track.coordinates[0]
    : stagePoints.length > 0
      ? [stagePoints[0].lng, stagePoints[0].lat]
      : null;
  const trackData = track
    ? { type: 'Feature' as const, geometry: track as { type: 'LineString'; coordinates: number[][] }, properties: {} }
    : null;

  return (
    <div className="grid-1-2" style={{ marginBottom: 14 }}>
      <div
        className="dropzone"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{ borderStyle: 'dashed', background: dragOver ? 'var(--accent-soft, rgba(29,158,117,0.08))' : undefined }}
      >
        <span className="ico">GPX</span>
        <strong>{track ? 'Tracé importé' : 'Glissez un fichier GPX / KML'}</strong>
        <small>
          {busy ? 'Import en cours…' : 'Le tracé alimente automatiquement distance, dénivelé et profil.'}
        </small>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            Importer un fichier
          </button>
          {track && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => void clearTrack()}>
              Retirer le tracé
            </button>
          )}
        </div>
        {error && <small style={{ color: 'var(--danger, #a32d2d)', marginTop: 6 }} role="alert">{error}</small>}
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,.kml"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="map-mini" style={{ minHeight: 220, overflow: 'hidden' }}>
        <Map
          ref={mapRef}
          reuseMaps
          mapStyle={DEFAULT_APP_MAP_STYLE}
          initialViewState={{
            longitude: center ? center[0] : REUNION_MAP_CENTER.longitude,
            latitude: center ? center[1] : REUNION_MAP_CENTER.latitude,
            zoom: center ? 11 : 9,
          }}
          attributionControl={false}
          dragRotate={false}
          style={{ width: '100%', height: '100%' }}
        >
          {trackData && (
            <Source id="iti-track" type="geojson" data={trackData}>
              <Layer
                id="iti-track-line"
                type="line"
                paint={{ 'line-color': '#1d9e75', 'line-width': 4 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </Source>
          )}
          {/* §111 — each stage/POI with a placed point shows as a numbered marker (same order as the cards). */}
          {stagePoints.map(({ stage, index, lng, lat }) => (
            <Marker key={stage.recordId ?? stage.uid ?? `stage-${index}`} longitude={lng} latitude={lat} anchor="bottom">
              <span
                title={stage.name || `Étape ${index + 1}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#1d9e75',
                  color: '#fff',
                  border: '2px solid #fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {index + 1}
              </span>
            </Marker>
          ))}
          <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
        </Map>
      </div>
    </div>
  );
}

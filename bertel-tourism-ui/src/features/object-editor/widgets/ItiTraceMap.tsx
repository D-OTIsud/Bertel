'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Ellipsis, LocateFixed, Route, Upload } from 'lucide-react';
import { Layer, Map, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre';
import { DEFAULT_APP_MAP_STYLE } from '../../../lib/map-style';
import { REUNION_MAP_CENTER } from './location-coords';
import { parseTrackFile } from '../sections/blocks/gpx-import';
import { saveObjectWorkspaceItineraryTrack } from '../../../services/object-workspace';
import type { ObjectWorkspaceItineraryStageSummary } from '../../../services/object-workspace-parser';
import { ConfirmDialog } from '../primitives';
import { itineraryMapBounds, itineraryStagePoint } from './itinerary-map-utils';

export interface ItiTraceImport {
  distanceKm: string;
  elevationGain: string;
  elevationLoss: string;
  trackGeojson: { type: string; coordinates: number[][] } | null;
}

interface ItiTraceMapProps {
  objectId: string;
  initialTrack: { type: string; coordinates: number[][] } | null;
  stages?: ObjectWorkspaceItineraryStageSummary[];
  onImported: (result: ItiTraceImport) => void;
  onSelectStage?: (index: number) => void;
  selectedStageIndex?: number | null;
  placementActive?: boolean;
  placementError?: string;
  onPlacePoint?: (lng: number, lat: number) => boolean;
  readOnly?: boolean;
  importDisabled?: boolean;
  children?: ReactNode;
}

const FIT_PADDING = { top: 56, right: 70, bottom: 70, left: 40 };

export function ItiTraceMap({ objectId, initialTrack, stages = [], onImported, onSelectStage,
  selectedStageIndex = null, placementActive = false, placementError = '', onPlacePoint, readOnly = false, importDisabled = false, children }: ItiTraceMapProps) {
  const mapRef = useRef<MapRef>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [track, setTrack] = useState(initialTrack);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [filename, setFilename] = useState('');
  const fileActionsDisabled = readOnly || importDisabled;
  useEffect(() => { setTrack(initialTrack); }, [initialTrack]);
  useEffect(() => { if (placementActive) canvasRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [placementActive]);
  const stagePoints = stages.flatMap((stage, index) => {
    const point = itineraryStagePoint(stage);
    return point ? [{ stage, index, point }] : [];
  });
  const bounds = itineraryMapBounds([...(track?.coordinates ?? []), ...stagePoints.map(({ point }) => point)]);
  const west = bounds?.[0], south = bounds?.[1], east = bounds?.[2], north = bounds?.[3];
  // Primitive dependencies avoid resetting the map when an editor types a name.
  const fitRoute = useCallback(() => {
    if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
      mapRef.current?.fitBounds([west, south, east, north], { padding: FIT_PADDING, maxZoom: 16, duration: 0 });
    }
  }, [west, south, east, north]);
  useEffect(() => { if (!placementActive) fitRoute(); }, [fitRoute, placementActive]);

  async function importFile(file: File) {
    if (fileActionsDisabled || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const line = parseTrackFile(await file.text(), file.name);
      const metrics = await saveObjectWorkspaceItineraryTrack(objectId, line);
      setTrack(line); setFilename(file.name);
      onImported({ distanceKm: metrics.distanceKm, elevationGain: metrics.elevationGain, elevationLoss: metrics.elevationLoss, trackGeojson: line });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import impossible. Réessayez avec un fichier GPX ou KML.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function clearTrack() {
    if (fileActionsDisabled || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await saveObjectWorkspaceItineraryTrack(objectId, null);
      setTrack(null); setFilename('');
      onImported({ distanceKm: '', elevationGain: '', elevationLoss: '', trackGeojson: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le tracé n’a pas pu être retiré. Réessayez.');
    } finally { busyRef.current = false; setBusy(false); setConfirmClear(false); }
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragOver(false);
    if (fileActionsDisabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  }
  const trackData = track ? { type: 'Feature' as const, geometry: track as { type: 'LineString'; coordinates: number[][] }, properties: {} } : null;
  return (
    <div className="iti-workspace">
      <div className="iti-trace-toolbar">
        <div className="iti-trace-toolbar__file"><span className="iti-trace-toolbar__icon"><Route size={18} aria-hidden /></span><div>
          <strong>{track ? filename || 'Tracé du parcours importé' : 'Aucun tracé importé'}</strong>
          <small>{busy ? 'Enregistrement du tracé…' : readOnly ? 'Tracé en lecture seule' : importDisabled ? 'Étape en cours de modification' : track ? 'Distance et dénivelés issus du tracé' : 'Glissez un fichier GPX / KML sur la carte.'}</small>
        </div></div>
        <div className="iti-trace-toolbar__actions">
          <button type="button" className="btn sm" disabled={busy || fileActionsDisabled} onClick={() => inputRef.current?.click()}><Upload size={14} aria-hidden /> {track ? 'Remplacer le tracé' : 'Importer un fichier'}</button>
          {track && !fileActionsDisabled && <details className="iti-trace-menu"><summary aria-label="Autres actions sur le tracé"><Ellipsis size={18} aria-hidden /></summary><div>
            <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setConfirmClear(true); }}>Retirer le tracé</button>
          </div></details>}
        </div>
        <input ref={inputRef} type="file" accept=".gpx,.kml" hidden aria-label="Fichier de tracé GPX ou KML" onChange={(event) => {
          const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '';
        }} />
      </div>
      {error && <p className="iti-trace-error" role="alert">{error}</p>}
      <div className={`iti-workspace__body${children ? '' : ' iti-workspace__body--map-only'}`}>
        <div ref={canvasRef} className={`iti-trace-map${placementActive ? ' iti-trace-map--placing' : ''}${dragOver ? ' iti-trace-map--drop' : ''}`} role="group" aria-label="Carte du parcours et de ses étapes"
          onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); if (!fileActionsDisabled) setDragOver(true); } }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
          <Map ref={mapRef} mapStyle={DEFAULT_APP_MAP_STYLE}
            initialViewState={bounds ? { bounds, fitBoundsOptions: { padding: FIT_PADDING, maxZoom: 16 } } : { ...REUNION_MAP_CENTER, zoom: 9 }}
            onLoad={fitRoute} onResize={fitRoute} attributionControl={{ compact: true }} dragRotate={false} scrollZoom={false}
            cursor={placementActive ? 'crosshair' : 'grab'} onClick={(event) => { if (placementActive) onPlacePoint?.(event.lngLat.lng, event.lngLat.lat); }} style={{ width: '100%', height: '100%' }}>
            {trackData && <Source id="iti-track" type="geojson" data={trackData}>
              <Layer id="iti-track-outline" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 8 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              <Layer id="iti-track-line" type="line" paint={{ 'line-color': '#2a7a45', 'line-width': 4 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            </Source>}
            {stagePoints.map(({ stage, index, point }) => <Marker key={stage.recordId ?? stage.uid ?? `stage-${index}`} longitude={point[0]} latitude={point[1]} anchor="center">
              <button type="button" className={`iti-trace-point${selectedStageIndex === index ? ' is-selected' : ''}`} aria-label={`Étape ${index + 1}${stage.name ? ` : ${stage.name}` : ''}`} aria-pressed={selectedStageIndex === index}
                disabled={selectedStageIndex !== null && selectedStageIndex !== index} onClick={(event) => { event.stopPropagation(); onSelectStage?.(index); }}>{index + 1}</button>
            </Marker>)}
            <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
          </Map>
          <button type="button" className="btn sm iti-trace-map__recenter" onClick={fitRoute}><LocateFixed size={14} aria-hidden /> Recentrer le parcours</button>
          {placementActive && <div className={`iti-trace-map__notice${placementError ? ' iti-trace-map__notice--error' : ''}`} role={placementError ? 'alert' : 'status'}>{placementError || 'Cliquez sur la carte pour positionner l’étape'}</div>}
          {dragOver && <div className="iti-trace-map__drop-hint">Déposez le fichier GPX ou KML</div>}
        </div>
        {children}
      </div>
      <ConfirmDialog open={confirmClear} title="Retirer le tracé ?" message="Le tracé et ses mesures calculées seront retirés de cette fiche. Les étapes seront conservées."
        confirmLabel="Retirer le tracé" tone="danger" onConfirm={() => { void clearTrack(); }} onCancel={() => setConfirmClear(false)} />
    </div>
  );
}

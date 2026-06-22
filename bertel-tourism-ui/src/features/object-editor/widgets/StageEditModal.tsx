'use client';

import { useState } from 'react';
import { Layer, Map, Marker, NavigationControl, Source, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { DEFAULT_APP_MAP_STYLE } from '../../../lib/map-style';
import { REUNION_MAP_CENTER } from './location-coords';
import { EditorModal, Field, Input, ReferenceSelect } from '../primitives';
import { MarkdownCellField } from '../../../components/markdown/MarkdownCellField';
import type {
  ObjectWorkspaceItineraryStageSummary,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { isInsideCorridor, metersToTrack } from '../sections/blocks/corridor';

interface StageEditModalProps {
  open: boolean;
  stage: ObjectWorkspaceItineraryStageSummary;
  stageKindOptions: WorkspaceReferenceOption[];
  trackGeojson: { type: string; coordinates: number[][] } | null;
  onSave: (stage: ObjectWorkspaceItineraryStageSummary) => void;
  onClose: () => void;
}

const DEFAULT_CORRIDOR_M = 50;

/**
 * §111 C2 — detailed stage / POI editor. Type (iti_stage_kind), name, Markdown description, and a
 * GPS point placed on a map showing the imported trace. The point is constrained to an adjustable
 * corridor (default 50 m) around the trace; with no trace, placement is free. Photos are deferred
 * (object_iti_stage_media needs the §05 media-row creation contract). The parent keys this by the
 * edited stage so the draft resets on each open.
 */
export function StageEditModal({ open, stage, stageKindOptions, trackGeojson, onSave, onClose }: StageEditModalProps) {
  const [draft, setDraft] = useState(stage);
  const [corridorM, setCorridorM] = useState(DEFAULT_CORRIDOR_M);
  const [rejected, setRejected] = useState(false);

  const line = trackGeojson?.coordinates ?? null;
  const hasLine = !!line && line.length > 1;
  const lng = draft.lng ? Number(draft.lng) : null;
  const lat = draft.lat ? Number(draft.lat) : null;
  const hasPoint = lng != null && lat != null && Number.isFinite(lng) && Number.isFinite(lat);
  const distanceM = hasPoint && hasLine ? Math.round(metersToTrack(lng as number, lat as number, line as number[][])) : null;

  function tryPlace(nextLng: number, nextLat: number) {
    if (hasLine && !isInsideCorridor(nextLng, nextLat, line as number[][], corridorM)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    setDraft((d) => ({ ...d, lng: String(nextLng), lat: String(nextLat) }));
  }

  const trackData = trackGeojson
    ? { type: 'Feature' as const, geometry: trackGeojson as { type: 'LineString'; coordinates: number[][] }, properties: {} }
    : null;
  const initialCenter = hasPoint
    ? [lng as number, lat as number]
    : hasLine
      ? (line as number[][])[0]
      : [REUNION_MAP_CENTER.longitude, REUNION_MAP_CENTER.latitude];

  return (
    <EditorModal
      open={open}
      title="Étape / point d'intérêt"
      size="lg"
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={draft.name.trim() === ''}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Type">
            <ReferenceSelect
              value={draft.kind}
              options={stageKindOptions}
              onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
              allowEmpty
              emptyLabel="Étape"
              aria-label="Type d'étape"
            />
          </Field>
          <Field label="Nom">
            <Input value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
          </Field>
          <Field label="Description">
            <MarkdownCellField
              variant="inline"
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
              ariaLabel="Description de l'étape"
            />
          </Field>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Position sur la carte</div>
          <div className="map-mini" style={{ minHeight: 200, overflow: 'hidden' }}>
            <Map
              reuseMaps
              mapStyle={DEFAULT_APP_MAP_STYLE}
              initialViewState={{ longitude: initialCenter[0], latitude: initialCenter[1], zoom: hasLine || hasPoint ? 12 : 9 }}
              attributionControl={false}
              dragRotate={false}
              style={{ width: '100%', height: '100%' }}
              cursor="crosshair"
              onClick={(e: MapLayerMouseEvent) => tryPlace(e.lngLat.lng, e.lngLat.lat)}
            >
              {trackData && (
                <Source id="stage-track" type="geojson" data={trackData}>
                  <Layer id="stage-track-line" type="line" paint={{ 'line-color': '#1d9e75', 'line-width': 3 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                </Source>
              )}
              {hasPoint && (
                <Marker
                  longitude={lng as number}
                  latitude={lat as number}
                  anchor="bottom"
                  draggable
                  onDragEnd={(e) => tryPlace(e.lngLat.lng, e.lngLat.lat)}
                >
                  <span style={{ display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#1d9e75', border: '2px solid #fff' }} />
                </Marker>
              )}
              <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
            </Map>
          </div>

          {hasLine && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)' }}>
                <span>Largeur du corridor</span>
                <span style={{ fontWeight: 600 }}>{corridorM} m</span>
              </div>
              <input
                type="range"
                min={10}
                max={200}
                step={10}
                value={corridorM}
                onChange={(e) => setCorridorM(Number(e.target.value))}
                style={{ width: '100%' }}
                aria-label="Largeur du corridor en mètres"
              />
            </div>
          )}
          {distanceM != null && !rejected && (
            <small style={{ color: 'var(--success, #0f6e56)' }}>{distanceM} m du tracé</small>
          )}
          {rejected && (
            <small role="alert" style={{ color: 'var(--danger, #a32d2d)' }}>
              Au-delà de {corridorM} m du tracé — point refusé.
            </small>
          )}
          {!hasLine && (
            <small style={{ color: 'var(--ink-4)' }}>Importez un tracé pour contraindre le placement ; sinon, placement libre.</small>
          )}
          {hasPoint && (
            <button type="button" className="btn sm" onClick={() => { setDraft((d) => ({ ...d, lng: '', lat: '' })); setRejected(false); }}>
              Retirer le point
            </button>
          )}
        </div>
      </div>
    </EditorModal>
  );
}

'use client';

import { useState } from 'react';
import {
  Layer,
  Map,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import { DEFAULT_APP_MAP_STYLE } from '../../../lib/map-style';
import { REUNION_MAP_CENTER } from './location-coords';
import { Chip, ChipSet, Disclosure, EditorModal, Field, Input, ReferenceSelect } from '../primitives';
import { MarkdownCellField } from '../../../components/markdown/MarkdownCellField';
import type {
  ObjectWorkspaceItineraryStageSummary,
  WorkspaceMediaOption,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { isInsideCorridor, metersToTrack } from '../sections/blocks/corridor';
import { MediaLinkField } from './MediaLinkField';
import { resolveMediaLinks } from './media-links';
import './geography-media-modals.css';

interface StageEditModalProps {
  open: boolean;
  stage: ObjectWorkspaceItineraryStageSummary;
  stageKindOptions: WorkspaceReferenceOption[];
  /** §111 closeout — the object's §05 media rows; stage photos LINK these (object_iti_stage_media). */
  mediaOptions: WorkspaceMediaOption[];
  trackGeojson: { type: string; coordinates: number[][] } | null;
  onSave: (stage: ObjectWorkspaceItineraryStageSummary) => void;
  onClose: () => void;
}

const DEFAULT_CORRIDOR_M = 50;

/**
 * §111 C2 — detailed stage / POI editor. Type (iti_stage_kind), name, Markdown description, and a
 * GPS point placed on a map showing the imported trace. The point is constrained to an adjustable
 * corridor (default 50 m) around the trace; with no trace, placement is free. Photos LINK existing
 * object media rows (object_iti_stage_media) the same way RoomEditModal does — files upload only in
 * §05 Médias (single media-writer). The parent keys this by the edited stage so the draft resets on
 * each open.
 */
export function StageEditModal({
  open,
  stage,
  stageKindOptions,
  mediaOptions,
  trackGeojson,
  onSave,
  onClose,
}: StageEditModalProps) {
  const [draft, setDraft] = useState(stage);
  const [corridorM, setCorridorM] = useState(DEFAULT_CORRIDOR_M);
  const [rejected, setRejected] = useState(false);
  const linkedMediaCount = resolveMediaLinks(draft.mediaIds, mediaOptions).length;

  const line = trackGeojson?.coordinates ?? null;
  const hasLine = !!line && line.length > 1;
  const lng = draft.lng ? Number(draft.lng) : null;
  const lat = draft.lat ? Number(draft.lat) : null;
  const hasPoint = lng != null && lat != null && Number.isFinite(lng) && Number.isFinite(lat);
  const distanceM =
    hasPoint && hasLine ? Math.round(metersToTrack(lng as number, lat as number, line as number[][])) : null;

  function tryPlace(nextLng: number, nextLat: number) {
    if (hasLine && !isInsideCorridor(nextLng, nextLat, line as number[][], corridorM)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    setDraft((d) => ({ ...d, lng: String(nextLng), lat: String(nextLat) }));
  }

  const trackData = trackGeojson
    ? {
        type: 'Feature' as const,
        geometry: trackGeojson as { type: 'LineString'; coordinates: number[][] },
        properties: {},
      }
    : null;
  const initialCenter = hasPoint
    ? [lng as number, lat as number]
    : hasLine
      ? (line as number[][])[0]
      : [REUNION_MAP_CENTER.longitude, REUNION_MAP_CENTER.latitude];

  return (
    <EditorModal
      className="ed-record-modal--stage"
      open={open}
      title={stage.recordId ? 'Modifier l’étape' : 'Ajouter une étape'}
      eyebrow="Itinéraire · Étapes et points d’intérêt"
      size="xl"
      aside={
        <>
          <h3>Où sur le tracé ?</h3>{' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Position sur la carte</div>
            <div className="map-mini" style={{ height: 380, overflow: 'hidden' }}>
              <Map
                reuseMaps
                mapStyle={DEFAULT_APP_MAP_STYLE}
                initialViewState={{
                  longitude: initialCenter[0],
                  latitude: initialCenter[1],
                  zoom: hasLine || hasPoint ? 12 : 9,
                }}
                attributionControl={false}
                dragRotate={false}
                style={{ width: '100%', height: '100%' }}
                cursor="crosshair"
                onClick={(e: MapLayerMouseEvent) => tryPlace(e.lngLat.lng, e.lngLat.lat)}
              >
                {trackData && (
                  <Source id="stage-track" type="geojson" data={trackData}>
                    <Layer
                      id="stage-track-line"
                      type="line"
                      paint={{ 'line-color': '#1d9e75', 'line-width': 3 }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
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
                    <span
                      style={{
                        display: 'block',
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#1d9e75',
                        border: '2px solid #fff',
                      }}
                    />
                  </Marker>
                )}
                <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
              </Map>
            </div>

            {hasLine && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: 'var(--ink-3)',
                  }}
                >
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
              <small style={{ color: 'var(--ink-4)' }}>
                Importez un tracé pour contraindre le placement ; sinon, placement libre.
              </small>
            )}
            {hasPoint && (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setDraft((d) => ({ ...d, lng: '', lat: '' }));
                  setRejected(false);
                }}
              >
                Retirer le point
              </button>
            )}
          </div>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={Boolean(draft.name.trim())}>
              <span aria-hidden>{draft.name.trim() ? '✓' : '○'}</span> Nom
            </li>
            <li data-complete={hasPoint}>
              <span aria-hidden>{hasPoint ? '✓' : '!'}</span> Position
              <span className="ed-geography-check-note">recommandée</span>
            </li>
          </ul>
        </>
      }
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={draft.name.trim() === ''}
      saveLabel={stage.recordId ? 'Appliquer' : 'Ajouter'}
    >
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Type">
            <ChipSet>
              {stageKindOptions.slice(0, 8).map((option) => (
                <Chip
                  key={option.id || option.code}
                  label={option.label}
                  on={draft.kind === option.code}
                  onClick={() => setDraft((current) => ({ ...current, kind: option.code }))}
                />
              ))}
            </ChipSet>
            <Disclosure title="Autre type d’étape…">
              <ReferenceSelect
                value={draft.kind}
                options={stageKindOptions}
                onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
                allowEmpty
                emptyLabel="Étape"
                aria-label="Type d'étape"
              />
            </Disclosure>
          </Field>
          <Field label="Nom">
            <Input value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
          </Field>
          <Disclosure title="Description" defaultOpen={Boolean(draft.description)}>
            <Field label="Description">
              <MarkdownCellField
                variant="inline"
                value={draft.description}
                onChange={(description) => setDraft((d) => ({ ...d, description }))}
                ariaLabel="Description de l'étape"
              />
            </Field>
          </Disclosure>
        </div>
      </div>

      {/* Photos = curation of the object's §05 media (object_iti_stage_media). Files upload in §05;
          here we choose which existing photos illustrate this stage (single media-writer invariant). */}
      <Disclosure
        title="Photos et médias"
        summary={linkedMediaCount ? `${linkedMediaCount}` : undefined}
        defaultOpen={linkedMediaCount > 0}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            Photos &amp; médias{linkedMediaCount > 0 ? ` (${linkedMediaCount})` : ''}
          </div>
          <MediaLinkField
            mediaIds={draft.mediaIds}
            options={mediaOptions}
            onChange={(mediaIds) => setDraft((d) => ({ ...d, mediaIds }))}
            emptyLinkedHint="Aucune photo rattachée à cette étape."
          />
        </div>
      </Disclosure>
    </EditorModal>
  );
}

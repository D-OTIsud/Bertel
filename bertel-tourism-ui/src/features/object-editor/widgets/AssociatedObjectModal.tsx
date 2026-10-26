'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EditorModal, Field, Input, ReferenceSelect } from '../primitives';
import { RelationPicker } from './RelationPicker';
import type { ObjectSearchResult } from '../useObjectSearch';
import { listObjectMarkers } from '../../../services/rpc';
import { DEFAULT_EXPLORER_FILTERS } from '../../../utils/facets';
import { metersToTrack } from '../sections/blocks/corridor';
import type {
  ObjectWorkspaceItineraryAssocSummary,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

interface AssociatedObjectModalProps {
  open: boolean;
  objectId: string;
  roleOptions: WorkspaceReferenceOption[];
  trackGeojson?: { type: string; coordinates: number[][] } | null;
  onSave: (assoc: ObjectWorkspaceItineraryAssocSummary) => void;
  onClose: () => void;
}

/**
 * §111 C3 — link an existing tourism object to the itinerary (object_iti_associated_object).
 * Reuses the §15 RelationPicker to search any object, then asks for a role (ref_iti_assoc_role)
 * and an optional note. Saving hands the parent a full assoc summary.
 */
export function AssociatedObjectModal({
  open,
  objectId,
  roleOptions,
  trackGeojson,
  onSave,
  onClose,
}: AssociatedObjectModalProps) {
  const [picked, setPicked] = useState<ObjectSearchResult | null>(null);
  const [roleId, setRoleId] = useState('');
  const [note, setNote] = useState('');

  function reset() {
    setPicked(null);
    setRoleId('');
    setNote('');
  }

  function handleSave() {
    if (!picked || roleId === '') return;
    onSave({
      associatedObjectId: picked.id,
      roleId,
      note,
      targetName: picked.name,
      targetType: picked.type,
    });
    reset();
  }

  return (
    <EditorModal
      className="ed-record-modal--associated"
      open={open}
      title="Lier une fiche au parcours"
      eyebrow="Itinéraire · Objets liés"
      onClose={() => {
        reset();
        onClose();
      }}
      onSave={handleSave}
      saveLabel="Lier la fiche"
      saveDisabled={!picked || roleId === ''}
    >
      {!picked ? (
        <>
          <RelationPicker currentObjectId={objectId} onPick={setPicked} />
          {trackGeojson && trackGeojson.coordinates.length > 1 && (
            <NearbyObjects objectId={objectId} line={trackGeojson.coordinates} onPick={setPicked} />
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`rpick__type type-${picked.type.toLowerCase()}`}>{picked.type}</span>
            <strong>{picked.name}</strong>
            <button
              type="button"
              className="btn sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setPicked(null)}
            >
              Changer
            </button>
          </div>
          <Field label="Rôle" hint="Comment cet objet se rattache au parcours">
            {/* ReferenceSelect matches on `code`; the payload needs the role UUID, so key options by id. */}
            <ReferenceSelect
              value={roleId}
              options={roleOptions.map((option) => ({ id: option.id, code: option.id, label: option.label }))}
              onChange={(next) => setRoleId(next)}
              allowEmpty
              emptyLabel="Choisir un rôle…"
              aria-label="Rôle de l'objet lié"
            />
          </Field>
          <Field label="Note" hint="Optionnel">
            <Input value={note} onChange={setNote} />
          </Field>
        </div>
      )}
    </EditorModal>
  );
}

/** Bounded marker read, then true distance to the line; never changes itinerary order. */
function NearbyObjects({
  objectId,
  line,
  onPick,
}: {
  objectId: string;
  line: number[][];
  onPick: (result: ObjectSearchResult) => void;
}) {
  const bbox = line.reduce<[number, number, number, number]>(
    (bounds, [x, y]) => [
      Math.min(bounds[0], x),
      Math.min(bounds[1], y),
      Math.max(bounds[2], x),
      Math.max(bounds[3], y),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  bbox[0] -= 0.02;
  bbox[1] -= 0.02;
  bbox[2] += 0.02;
  bbox[3] += 0.02;
  const { data, isPending, isError } = useQuery({
    queryKey: ['itinerary-nearby-objects', objectId, bbox],
    queryFn: ({ signal }) =>
      listObjectMarkers(
        {
          ...DEFAULT_EXPLORER_FILTERS,
          common: { ...DEFAULT_EXPLORER_FILTERS.common, bbox, statuses: ['published', 'draft'] },
        },
        signal,
      ),
    staleTime: 60_000,
  });
  const nearby = (data ?? [])
    .filter(
      (card) =>
        card.id !== objectId && Number.isFinite(card.location?.lon) && Number.isFinite(card.location?.lat),
    )
    .map((card) => ({ card, distance: metersToTrack(card.location!.lon!, card.location!.lat!, line) }))
    .filter(({ distance }) => distance <= 2000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
  return (
    <section className="ed-modal__section">
      <h3>Proches du tracé · jusqu’à 2 km</h3>
      {isPending && <p className="muted">Recherche des fiches proches…</p>}
      {isError && (
        <p role="status" className="muted">
          Les fiches proches sont indisponibles. La recherche reste accessible ci-dessus.
        </p>
      )}
      {!isPending && !isError && nearby.length === 0 && (
        <p className="muted">Aucune fiche géolocalisée à moins de 2 km du tracé.</p>
      )}
      <div className="rpick__list">
        {nearby.map(({ card, distance }) => (
          <button
            type="button"
            className="rpick__row"
            key={card.id}
            onClick={() =>
              onPick({
                id: card.id,
                name: card.name,
                type: card.type,
                status: card.status ?? '',
                city: card.location?.city ?? '',
                code: card.id,
                card,
              })
            }
          >
            <span className={`rpick__type type-${card.type.toLowerCase()}`}>{card.type}</span>
            <span className="rpick__main">
              <strong>{card.name}</strong>
              <small>{card.location?.city}</small>
            </span>
            <span className="muted">
              {distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

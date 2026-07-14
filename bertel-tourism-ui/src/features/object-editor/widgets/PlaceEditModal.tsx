'use client';

import { useEffect, useState } from 'react';
import { EditorModal, Field, Input, ReferenceSelect, Select } from '../primitives';
import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';
import { useLocationReferenceOptionsQuery } from '../../../hooks/useExplorerQueries';
import type { ObjectWorkspacePlaceItem } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from '../sections/descriptions-field';
import { AddressBanCombobox } from './AddressBanCombobox';
import { LocationPinMap } from './LocationPinMap';
import { LocationReferenceCombobox } from './LocationReferenceCombobox';
import { PLACE_VISIBILITY_OPTIONS, normalizePlaceVisibility, type PlaceVisibility } from '../visibility-vocab';
import type { ObjectWorkspaceZoneOption } from '../../../services/object-workspace-parser';

interface PlaceEditModalProps {
  open: boolean;
  place: ObjectWorkspacePlaceItem;
  activeLanguage: string;
  localLanguage: string;
  zoneOptions: ObjectWorkspaceZoneOption[];
  readOnly?: boolean;
  onSave: (place: ObjectWorkspacePlaceItem) => void;
  onClose: () => void;
}

export function PlaceEditModal({
  open,
  place,
  activeLanguage,
  localLanguage,
  zoneOptions,
  readOnly = false,
  onSave,
  onClose,
}: PlaceEditModalProps) {
  const [draft, setDraft] = useState(place);
  const { data: locationReferences } = useLocationReferenceOptionsQuery();
  const communeOptions = zoneOptions.map((zone) => ({ id: zone.code, code: zone.code, label: zone.label }));
  const hasLat = Boolean(draft.location.latitude.trim());
  const hasLng = Boolean(draft.location.longitude.trim());
  const coordMismatch = hasLat !== hasLng;
  const latValue = Number.parseFloat(draft.location.latitude);
  const lngValue = Number.parseFloat(draft.location.longitude);
  const coordOutOfRange =
    hasLat && hasLng &&
    Number.isFinite(latValue) && Number.isFinite(lngValue) &&
    (latValue < -90 || latValue > 90 || lngValue < -180 || lngValue > 180);
  const coordInvalid = coordMismatch || coordOutOfRange;

  useEffect(() => {
    if (open) setDraft(place);
  }, [open, place]);

  function patchLocation(patch: Partial<ObjectWorkspacePlaceItem['location']>) {
    if (readOnly) return;
    setDraft((current) => ({ ...current, location: { ...current.location, ...patch } }));
  }

  function handleSave() {
    if (readOnly) {
      onClose();
      return;
    }
    if (!draft.label.trim() || coordInvalid) return;
    onSave({ ...draft, visibility: normalizePlaceVisibility(draft.visibility) as PlaceVisibility });
  }

  const descriptionValue = readTranslatableField(draft.description, activeLanguage, localLanguage);

  return (
    <EditorModal
      open={open}
      title={draft.recordId ? 'Modifier le site' : 'Ajouter un site secondaire'}
      size="xl"
      onClose={onClose}
      onSave={handleSave}
      saveDisabled={!readOnly && (!draft.label.trim() || coordInvalid)}
      saveLabel={readOnly ? 'Fermer' : 'Enregistrer'}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Nom du site" required>
            <Input
              value={draft.label}
              readOnly={readOnly}
              placeholder="ex. Site de départ"
              onChange={(label) => !readOnly && setDraft((d) => ({ ...d, label }))}
            />
          </Field>
          <Field label="Adresse">
            {readOnly ? (
              <Input value={draft.location.address1} readOnly onChange={() => undefined} />
            ) : (
              <AddressBanCombobox
                value={draft.location.address1}
                onChange={(address1) => patchLocation({ address1 })}
                onSelect={(hit) =>
                  patchLocation({
                    address1: hit.name || draft.location.address1,
                    postcode: hit.postcode || draft.location.postcode,
                    city: communeOptions.find((c) => c.code === hit.citycode)?.label ?? hit.city ?? draft.location.city,
                    codeInsee: hit.citycode || draft.location.codeInsee,
                    latitude: hit.latitude || draft.location.latitude,
                    longitude: hit.longitude || draft.location.longitude,
                  })
                }
              />
            )}
          </Field>
          <div className="grid-2">
            <Field label="Code postal">
              <Input value={draft.location.postcode} readOnly={readOnly} onChange={(postcode) => patchLocation({ postcode })} />
            </Field>
            <Field label="Commune">
              <ReferenceSelect
                value={draft.location.codeInsee}
                options={communeOptions}
                placeholder="Commune"
                onChange={(codeInsee) => {
                  const commune = communeOptions.find((c) => c.code === codeInsee);
                  patchLocation({ codeInsee, city: commune?.label ?? draft.location.city });
                }}
              />
            </Field>
          </div>
          <Field label="Lieu-dit">
            {readOnly ? (
              <Input value={draft.location.lieuDit} readOnly onChange={() => undefined} />
            ) : (
              <LocationReferenceCombobox
                value={draft.location.lieuDit}
                options={locationReferences?.lieuDits ?? []}
                onChange={(lieuDit) => patchLocation({ lieuDit })}
              />
            )}
          </Field>
          <Field label="Itinéraire d'accès">
            <MarkdownEditorLazy
              variant="block"
              ariaLabel="Itinéraire d'accès"
              value={draft.location.direction}
              onChange={(direction) => patchLocation({ direction })}
            />
          </Field>
          <Field label="Visibilité de la description">
            <Select
              value={normalizePlaceVisibility(draft.visibility)}
              options={PLACE_VISIBILITY_OPTIONS.map((o) => ({ v: o.v, l: o.l }))}
              onChange={(visibility) => !readOnly && setDraft((d) => ({ ...d, visibility: visibility as PlaceVisibility }))}
            />
          </Field>
          <Field label="Description">
            <MarkdownEditorLazy
              variant="block"
              ariaLabel="Description du site"
              value={descriptionValue}
              onChange={(value) =>
                !readOnly &&
                setDraft((d) => ({
                  ...d,
                  description: updateTranslatableField(d.description, activeLanguage, localLanguage, value),
                }))
              }
            />
          </Field>
        </div>
        <div>
          <Field label="Coordonnées GPS" hint="Latitude et longitude ensemble, ou aucune.">
            <div className="grid-2" style={{ marginBottom: 8 }}>
              <Input
                value={draft.location.latitude}
                mono
                readOnly={readOnly}
                placeholder="Latitude"
                onChange={(latitude) => patchLocation({ latitude })}
              />
              <Input
                value={draft.location.longitude}
                mono
                readOnly={readOnly}
                placeholder="Longitude"
                onChange={(longitude) => patchLocation({ longitude })}
              />
            </div>
            {coordMismatch && (
              <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 8px' }}>
                Renseignez les deux coordonnées ou aucune.
              </p>
            )}
            {coordOutOfRange && (
              <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 8px' }}>
                Coordonnées hors plage (latitude -90 à 90, longitude -180 à 180).
              </p>
            )}
            {!readOnly && (
              <LocationPinMap
                latitude={draft.location.latitude}
                longitude={draft.location.longitude}
                onCoordsChange={(latitude, longitude) => patchLocation({ latitude, longitude })}
              />
            )}
          </Field>
        </div>
      </div>
    </EditorModal>
  );
}

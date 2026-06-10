import { useState } from 'react';
import { useLocationReferenceOptionsQuery } from '../../../hooks/useExplorerQueries';
import { Fs, Field, Input, ReferenceSelect } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLocationForm } from '../../../services/object-workspace-parser';
import { LocationFormattedInput } from '../widgets/LocationFormattedInput';
import { LocationPinMap } from '../widgets/LocationPinMap';
import { LocationReferenceCombobox } from '../widgets/LocationReferenceCombobox';
import { PendingFieldControl } from '../widgets/PendingFieldControl';
import { dismissPendingFieldChange, findPendingFieldChange } from '../widgets/pending-field-change';

/** Diacritic-insensitive fold for snapping a legacy free-text city to its ref_commune option. */
function foldCommuneLabel(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Section 02 — address, commune, GPS. object_zone (multi-commune) is edited on itinerary sections, not here. */
export function SectionLocation({ editor, typeCode, folded }: SectionProps) {
  const location = editor.draft.location;
  const main = location.main;
  // Commune is a strict ref_commune select when the catalog is loaded (§41 seed);
  // legacy rows carry only a free-text city, so snap it to its option by folded label.
  const communeOptions = (location.zoneOptions ?? []).map((zone) => ({
    id: zone.code,
    code: zone.code,
    label: zone.label,
  }));
  const communeCode = main.codeInsee
    || (communeOptions.find((option) => foldCommuneLabel(option.label) === foldCommuneLabel(main.city))?.code ?? '');
  const [approvingLieuDit, setApprovingLieuDit] = useState(false);
  const pendingLieuDit = findPendingFieldChange(editor.draft.publication.moderation.items, 'lieuDit');
  const { data: locationReferences } = useLocationReferenceOptionsQuery();
  const lieuDitOptions = locationReferences?.lieuDits ?? [];
  const hasCoords = Boolean(main.latitude?.trim() && main.longitude?.trim());

  function patch(next: Partial<ObjectWorkspaceLocationForm>) {
    editor.replaceModule('location', { ...location, main: { ...main, ...next } });
  }

  function approveLieuDit() {
    if (!pendingLieuDit) {
      return;
    }
    setApprovingLieuDit(true);
    try {
      patch({ lieuDit: pendingLieuDit.afterValue || main.lieuDit });
      dismissPendingFieldChange(editor, pendingLieuDit);
    } finally {
      setApprovingLieuDit(false);
    }
  }

  return (
    <Fs
      num="02"
      title="Localisation"
      sub="Adresse postale, commune, lieu-dit, coordonnées GPS"
      folded={folded}
      pill={{ tone: hasCoords ? 'ok' : 'warn', label: hasCoords ? 'Géocodé' : 'GPS manquant' }}
    >
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Adresse" required>
          <LocationFormattedInput value={main.address1} onChange={(v) => patch({ address1: v })} />
        </Field>
        <Field label="Complément d'adresse">
          <LocationFormattedInput
            value={main.address2}
            onChange={(v) => patch({ address2: v })}
            placeholder="Appartement n° 3…"
          />
        </Field>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Code postal" required>
          <Input value={main.postcode} onChange={(v) => patch({ postcode: v })} mono />
        </Field>
        <Field label="Commune" required>
          {communeOptions.length > 0 ? (
            <ReferenceSelect
              value={communeCode}
              options={communeOptions}
              placeholder="Choisir une commune…"
              aria-label="Commune"
              onChange={(code, option) => patch({ codeInsee: code, city: option?.label ?? main.city })}
            />
          ) : (
            <Input value={main.city} onChange={(v) => patch({ city: v })} aria-label="Commune" />
          )}
        </Field>
      </div>

      <div className="map-shell-block">
        <div className="map-shell">
          <div className="map-shell__side">
            <Field
              label="Lieu-dit"
              hint="Corpus ou nouveau (majuscule en tête de mot)."
            >
              {pendingLieuDit?.status === 'pending' ? (
                <PendingFieldControl
                  value={main.lieuDit}
                  onChange={(v) => patch({ lieuDit: v })}
                  pending={pendingLieuDit}
                  onApprove={approveLieuDit}
                  approving={approvingLieuDit}
                  placeholder="Bras-Long"
                />
              ) : (
                <LocationReferenceCombobox
                  value={main.lieuDit}
                  options={lieuDitOptions}
                  onChange={(v) => patch({ lieuDit: v })}
                  placeholder="Bras-Long"
                  aria-label="Lieu-dit"
                />
              )}
            </Field>
            <div className="map-shell__gps">
              <div className="field__label map-shell__gps-head">
                <span>
                  Coordonnées GPS <span className="req"> *</span>
                </span>
                <button type="button" className="pill-mini" disabled title="Bientôt">
                  Géocoder l&apos;adresse
                </button>
              </div>
              <div className="map-shell__coords">
                <Field label="Latitude">
                  <Input value={main.latitude} onChange={(v) => patch({ latitude: v })} mono />
                </Field>
                <Field label="Longitude">
                  <Input value={main.longitude} onChange={(v) => patch({ longitude: v })} mono />
                </Field>
              </div>
            </div>
          </div>
          <LocationPinMap
            latitude={main.latitude}
            longitude={main.longitude}
            typeCode={typeCode}
            onCoordsChange={(nextLat, nextLng) => patch({ latitude: nextLat, longitude: nextLng })}
          />
        </div>
      </div>
    </Fs>
  );
}

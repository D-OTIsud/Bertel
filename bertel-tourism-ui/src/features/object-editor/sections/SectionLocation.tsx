import { useState } from 'react';
import { useLocationReferenceOptionsQuery } from '../../../hooks/useExplorerQueries';
import { Fs, Field, Input } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLocationForm } from '../../../services/object-workspace-parser';
import { LocationFormattedInput } from '../widgets/LocationFormattedInput';
import { LocationPinMap } from '../widgets/LocationPinMap';
import { LocationReferenceCombobox } from '../widgets/LocationReferenceCombobox';
import { PendingFieldControl } from '../widgets/PendingFieldControl';
import { dismissPendingFieldChange, findPendingFieldChange } from '../widgets/pending-field-change';

/** Section 02 — address, commune, GPS. object_zone (multi-commune) is edited on itinerary sections, not here. */
export function SectionLocation({ editor, typeCode, folded }: SectionProps) {
  const location = editor.draft.location;
  const main = location.main;
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
      sub="Adresse postale, commune, lieu-dit, zone touristique, coordonnées GPS"
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

      <div className="grid-4" style={{ marginBottom: 12 }}>
        <Field label="Code postal" required>
          <Input value={main.postcode} onChange={(v) => patch({ postcode: v })} mono />
        </Field>
        <Field label="Bureau postal" hint="Ex : Le Tampon">
          <Input value={main.address3} onChange={(v) => patch({ address3: v })} />
        </Field>
        <Field label="Commune">
          <Input value={main.city} onChange={(v) => patch({ city: v })} />
        </Field>
        <Field label="Zone touristique" hint="Secteur touristique associé">
          <Input value={main.zoneTouristique} onChange={(v) => patch({ zoneTouristique: v })} />
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

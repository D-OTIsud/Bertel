import { useState } from 'react';
import { Fs, Field, Input, Chip, ChipSet } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLocationForm } from '../../../services/object-workspace-parser';
import { LocationPinMap } from '../widgets/LocationPinMap';
import { PendingFieldControl } from '../widgets/PendingFieldControl';
import { dismissPendingFieldChange, findPendingFieldChange } from '../widgets/pending-field-change';

/** Section 03 — address, commune, GPS (design: edit-primitives + map-shell). */
export function SectionLocation({ editor, typeCode, folded }: SectionProps) {
  const location = editor.draft.location;
  const main = location.main;
  const [approvingLieuDit, setApprovingLieuDit] = useState(false);
  const pendingLieuDit = findPendingFieldChange(editor.draft.publication.moderation.items, 'lieuDit');
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
      num="03"
      title="Localisation"
      sub="Adresse postale, commune, lieu-dit, zone touristique, coordonnées GPS"
      folded={folded}
      pill={{ tone: hasCoords ? 'ok' : 'warn', label: hasCoords ? 'Géocodé' : 'GPS manquant' }}
    >
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Adresse" required>
          <Input value={main.address1} onChange={(v) => patch({ address1: v })} />
        </Field>
        <Field label="Complément d'adresse">
          <Input value={main.address2} onChange={(v) => patch({ address2: v })} placeholder="Bras-Long" />
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

      <Field label="Lieu-dit" hint="Nom local utilisé pour situer la fiche">
        <PendingFieldControl
          value={main.lieuDit}
          onChange={(v) => patch({ lieuDit: v })}
          pending={pendingLieuDit}
          onApprove={approveLieuDit}
          approving={approvingLieuDit}
          placeholder="Bras-Long"
        />
      </Field>

      <div style={{ marginTop: 12 }}>
        <div className="field__label" style={{ marginBottom: 5, display: 'flex', alignItems: 'center' }}>
          <span>
            Coordonnées GPS <span className="req"> *</span>
          </span>
          <button type="button" className="pill-mini" style={{ marginLeft: 'auto' }} disabled title="Bientôt">
            Géocoder l&apos;adresse
          </button>
        </div>
        <div className="map-shell">
          <div className="map-shell__side">
            <div className="map-shell__coords">
              <Field label="Latitude">
                <Input value={main.latitude} onChange={(v) => patch({ latitude: v })} mono />
              </Field>
              <Field label="Longitude">
                <Input value={main.longitude} onChange={(v) => patch({ longitude: v })} mono />
              </Field>
            </div>
            <div className="chip-group__label">Localisations</div>
            <ChipSet>
              {location.zoneCodes.length > 0 ? (
                location.zoneCodes.map((z) => <Chip key={z} label={z} on sm />)
              ) : (
                <Chip label="Aucune étiquette zone" sm />
              )}
            </ChipSet>
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

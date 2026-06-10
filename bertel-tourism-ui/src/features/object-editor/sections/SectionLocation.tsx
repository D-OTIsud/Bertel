import { useState } from 'react';
import { useLocationReferenceOptionsQuery } from '../../../hooks/useExplorerQueries';
import { Fs, Field, Input, ReferenceSelect } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLocationForm } from '../../../services/object-workspace-parser';
import { geocodeAddress, type GeocodeHit } from '../widgets/geocode-address';
import { AddressBanCombobox } from '../widgets/AddressBanCombobox';
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
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const pendingLieuDit = findPendingFieldChange(editor.draft.publication.moderation.items, 'lieuDit');
  const { data: locationReferences } = useLocationReferenceOptionsQuery();
  const lieuDitOptions = locationReferences?.lieuDits ?? [];
  const hasCoords = Boolean(main.latitude?.trim() && main.longitude?.trim());

  function patch(next: Partial<ObjectWorkspaceLocationForm>) {
    editor.replaceModule('location', { ...location, main: { ...main, ...next } });
  }

  // Below this BAN confidence, the matched street can be plain wrong — never write it silently.
  const BAN_CONFIDENT_SCORE = 0.6;

  /** Apply a BAN hit: standardized address + commune (ref_commune label wins) + GPS. */
  function applyBanHit(hit: GeocodeHit) {
    const communeLabel = communeOptions.find((option) => option.code === hit.citycode)?.label;
    patch({
      address1: hit.name || main.address1,
      postcode: hit.postcode || main.postcode,
      city: communeLabel ?? (hit.city || main.city),
      codeInsee: hit.citycode || main.codeInsee,
      latitude: hit.latitude,
      longitude: hit.longitude,
    });
  }

  // Address → standardized address + GPS via the BAN; the draggable pin stays the manual fallback.
  async function handleGeocode() {
    setGeocoding(true);
    setGeocodeMessage(null);
    try {
      const hit = await geocodeAddress({
        address1: main.address1,
        postcode: main.postcode,
        city: main.city,
      });
      if (!hit) {
        setGeocodeMessage('Adresse introuvable — placez le repère sur la carte.');
        return;
      }
      if (hit.score < BAN_CONFIDENT_SCORE) {
        setGeocodeMessage(
          `Correspondance incertaine : « ${hit.label} » — vérifiez l'adresse ou placez le repère sur la carte.`,
        );
        return;
      }
      applyBanHit(hit);
      setGeocodeMessage(`Adresse standardisée : ${hit.label}`);
    } catch {
      setGeocodeMessage('Géocodage indisponible — réessayez plus tard.');
    } finally {
      setGeocoding(false);
    }
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
        <Field label="Adresse" required hint="Tapez pour obtenir les suggestions de la Base Adresse Nationale">
          <AddressBanCombobox
            value={main.address1}
            onChange={(v) => patch({ address1: v })}
            onSelect={applyBanHit}
            aria-label="Adresse"
          />
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
                <button
                  type="button"
                  className="pill-mini"
                  disabled={!main.address1.trim() || geocoding}
                  onClick={() => void handleGeocode()}
                >
                  {geocoding ? 'Géocodage…' : "Géocoder l'adresse"}
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
              {geocodeMessage && (
                <p className="map-shell__geocode-note" role="status">{geocodeMessage}</p>
              )}
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

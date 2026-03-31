import { useEffect, useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import type { ObjectWorkspaceLocationModule } from '../../services/object-workspace-parser';
import { DEFAULT_APP_MAP_STYLE } from '../../lib/map-style';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceLocationPanelProps {
  value: ObjectWorkspaceLocationModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  onChange: (patch: Partial<ObjectWorkspaceLocationModule['main']>) => void;
  onSave: () => void;
}

interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

interface StructuredAddress {
  number: string;
  suffix: string;
  street: string;
  complement: string;
}

const DEFAULT_LOCATION_CENTER: LocationCoordinates = {
  latitude: -21.130568,
  longitude: 55.536384,
};

const DEFAULT_LOCATION_ZOOM = 10.2;
const FOCUSED_LOCATION_ZOOM = 15;

function parseCoordinate(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCoordinates(value: ObjectWorkspaceLocationModule['main']): LocationCoordinates | null {
  const latitude = parseCoordinate(value.latitude);
  const longitude = parseCoordinate(value.longitude);

  if (latitude == null || longitude == null) {
    return null;
  }

  return { latitude, longitude };
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeAddressSuffix(value: string): string {
  const compact = value.replace(/\s+/g, '').trim();
  if (!compact) {
    return '';
  }

  const lower = compact.toLowerCase();
  if (['bis', 'ter', 'quater', 'quinquies', 'sexies'].includes(lower)) {
    return lower;
  }

  return compact.toUpperCase();
}

function coordinatesMatch(left: LocationCoordinates, right: LocationCoordinates): boolean {
  return Math.abs(left.latitude - right.latitude) < 0.000001
    && Math.abs(left.longitude - right.longitude) < 0.000001;
}

function parseStructuredAddress(value: ObjectWorkspaceLocationModule['main']): StructuredAddress {
  if (value.address2 || value.address1Suite || value.address3) {
    return {
      number: value.address1.trim(),
      suffix: value.address1Suite.trim(),
      street: value.address2.trim(),
      complement: value.address3.trim(),
    };
  }

  const combined = value.address1.trim();
  if (!combined) {
    return {
      number: '',
      suffix: '',
      street: '',
      complement: value.address3.trim(),
    };
  }

  const compactMatch = combined.match(/^(\d+)([A-Za-z]+)\s+(.+)$/);
  if (compactMatch) {
    return {
      number: compactMatch[1] ?? '',
      suffix: (compactMatch[2] ?? '').trim(),
      street: (compactMatch[3] ?? '').trim(),
      complement: value.address3.trim(),
    };
  }

  const spacedMatch = combined.match(/^(\d+)\s+([A-Za-z]+)\s+(.+)$/);
  if (spacedMatch) {
    return {
      number: spacedMatch[1] ?? '',
      suffix: (spacedMatch[2] ?? '').trim(),
      street: (spacedMatch[3] ?? '').trim(),
      complement: value.address3.trim(),
    };
  }

  const simpleMatch = combined.match(/^(\d+)\s+(.+)$/);
  if (simpleMatch) {
    return {
      number: simpleMatch[1] ?? '',
      suffix: '',
      street: (simpleMatch[2] ?? '').trim(),
      complement: value.address3.trim(),
    };
  }

  return {
    number: '',
    suffix: value.address1Suite.trim(),
    street: combined,
    complement: value.address3.trim(),
  };
}

function buildStreetLine(address: StructuredAddress): string {
  const firstLine = [address.number, address.suffix, address.street].filter(Boolean).join(' ').trim();
  return [firstLine, address.complement].filter(Boolean).join(', ');
}

function buildAddressPreview(address: StructuredAddress, value: ObjectWorkspaceLocationModule['main']): string {
  const cityLine = [value.postcode, value.city].filter(Boolean).join(' ');
  return [buildStreetLine(address), value.lieuDit.trim(), cityLine].filter(Boolean).join(' · ');
}

export function ObjectWorkspaceLocationPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  onChange,
  onSave,
}: ObjectWorkspaceLocationPanelProps) {
  const parsedCoordinates = useMemo(
    () => readCoordinates(value.main),
    [value.main.latitude, value.main.longitude],
  );
  const structuredAddress = useMemo(
    () => parseStructuredAddress(value.main),
    [value.main.address1, value.main.address1Suite, value.main.address2, value.main.address3],
  );
  const addressPreview = useMemo(
    () => buildAddressPreview(structuredAddress, value.main),
    [structuredAddress, value.main.city, value.main.lieuDit, value.main.postcode],
  );
  const coordinatesAreBlank = value.main.latitude.trim() === '' && value.main.longitude.trim() === '';
  const hasRelatedPlaces = value.places.length > 0;
  const hasZoneCards = value.zoneCodes.length > 0;
  const canMovePin = !saveAction.disabled && !saving;
  const [mapCoordinates, setMapCoordinates] = useState<LocationCoordinates>(
    parsedCoordinates ?? DEFAULT_LOCATION_CENTER,
  );
  const [pendingCoordinates, setPendingCoordinates] = useState<LocationCoordinates | null>(null);

  useEffect(() => {
    if (parsedCoordinates) {
      setMapCoordinates(parsedCoordinates);
      return;
    }

    if (coordinatesAreBlank) {
      setMapCoordinates(DEFAULT_LOCATION_CENTER);
    }
  }, [coordinatesAreBlank, parsedCoordinates]);

  function patchStructuredAddress(patch: Partial<StructuredAddress>) {
    const nextAddress = {
      ...structuredAddress,
      ...patch,
    };

    onChange({
      address1: nextAddress.number,
      address1Suite: nextAddress.suffix,
      address2: nextAddress.street,
      address3: nextAddress.complement,
    });
  }

  function normalizeStructuredField(field: keyof StructuredAddress) {
    if (field === 'suffix') {
      patchStructuredAddress({ suffix: normalizeAddressSuffix(structuredAddress.suffix) });
      return;
    }

    patchStructuredAddress({ [field]: normalizeWhitespace(structuredAddress[field]) });
  }

  function handleMarkerDragEnd(nextCoordinates: LocationCoordinates) {
    if (parsedCoordinates && coordinatesMatch(parsedCoordinates, nextCoordinates)) {
      return;
    }

    if (!parsedCoordinates && coordinatesMatch(DEFAULT_LOCATION_CENTER, nextCoordinates)) {
      return;
    }

    setPendingCoordinates(nextCoordinates);
  }

  function confirmCoordinateUpdate() {
    if (!pendingCoordinates) {
      return;
    }

    onChange({
      latitude: formatCoordinate(pendingCoordinates.latitude),
      longitude: formatCoordinate(pendingCoordinates.longitude),
    });
    setPendingCoordinates(null);
  }

  function cancelCoordinateUpdate() {
    setPendingCoordinates(null);
  }

  return (
    <>
      <div className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <h2>Localisation</h2>
            </div>
            <div className="stack-list text-right">
              <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
                {saving ? 'Enregistrement...' : saveAction.label}
              </Button>
              {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
              {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
            </div>
          </div>

          <div className="drawer-location-form-grid">
            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-number">Numero</Label>
              <Input
                id="workspace-location-number"
                inputMode="numeric"
                value={structuredAddress.number}
                placeholder="Ex. 12"
                onChange={(event) => patchStructuredAddress({ number: event.target.value })}
                onBlur={() => normalizeStructuredField('number')}
              />
            </div>

            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-number-suffix">Suffixe</Label>
              <Input
                id="workspace-location-number-suffix"
                value={structuredAddress.suffix}
                placeholder="Ex. bis, ter, A, ABIS"
                onChange={(event) => patchStructuredAddress({ suffix: event.target.value })}
                onBlur={() => normalizeStructuredField('suffix')}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--full">
              <Label htmlFor="workspace-location-street">Voie</Label>
              <Input
                id="workspace-location-street"
                value={structuredAddress.street}
                placeholder="Ex. Rue Alfred Picard"
                onChange={(event) => patchStructuredAddress({ street: event.target.value })}
                onBlur={() => normalizeStructuredField('street')}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--full">
              <Label htmlFor="workspace-location-complement">Complement d'adresse</Label>
              <Input
                id="workspace-location-complement"
                value={structuredAddress.complement}
                placeholder="Ex. Batiment A, appartement 4"
                onChange={(event) => patchStructuredAddress({ complement: event.target.value })}
                onBlur={() => normalizeStructuredField('complement')}
              />
            </div>

            {addressPreview && (
              <p className="drawer-location-preview-inline">{addressPreview}</p>
            )}

            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-postcode">Code postal</Label>
              <Input
                id="workspace-location-postcode"
                value={value.main.postcode}
                placeholder="Ex. 97430"
                onChange={(event) => onChange({ postcode: event.target.value })}
              />
            </div>

            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-city">Ville</Label>
              <Input
                id="workspace-location-city"
                value={value.main.city}
                placeholder="Ex. Le Tampon"
                onChange={(event) => onChange({ city: event.target.value })}
              />
            </div>

            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-lieudit">Quartier / lieu-dit</Label>
              <Input
                id="workspace-location-lieudit"
                value={value.main.lieuDit}
                placeholder="Ex. La Plaine des Cafres"
                onChange={(event) => onChange({ lieuDit: event.target.value })}
              />
            </div>

            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-zone">Zone touristique</Label>
              <Input
                id="workspace-location-zone"
                value={value.main.zoneTouristique}
                placeholder="Ex. Sud sauvage"
                onChange={(event) => onChange({ zoneTouristique: event.target.value })}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--full">
              <Label htmlFor="workspace-location-direction">Indications d'acces</Label>
              <Input
                id="workspace-location-direction"
                value={value.main.direction}
                placeholder="Ex. Depuis Saint-Pierre, au rond-point apres la station..."
                onChange={(event) => onChange({ direction: event.target.value })}
              />
            </div>
          </div>
        </article>

        <article className="panel-card panel-card--nested drawer-location-map-card">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Carte interactive</span>
            </div>
          </div>

          <div className="drawer-location-map-toolbar">
            <div className="drawer-inline-field drawer-inline-field--compact">
              <Label htmlFor="workspace-location-latitude">Latitude</Label>
              <Input
                id="workspace-location-latitude"
                value={value.main.latitude}
                placeholder="-21.203853"
                onChange={(event) => onChange({ latitude: event.target.value })}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--compact">
              <Label htmlFor="workspace-location-longitude">Longitude</Label>
              <Input
                id="workspace-location-longitude"
                value={value.main.longitude}
                placeholder="55.578477"
                onChange={(event) => onChange({ longitude: event.target.value })}
              />
            </div>
          </div>

          <p className="drawer-location-map-note">
            Saisissez des coordonnees valides ou deplacez l epingle. Le point se recale automatiquement des que les deux valeurs sont exploitables.
          </p>

          <div className="detail-map-card__canvas drawer-location-map-card__canvas">
            <Map
              key={`${mapCoordinates.latitude}:${mapCoordinates.longitude}`}
              reuseMaps
              mapStyle={DEFAULT_APP_MAP_STYLE}
              initialViewState={{
                longitude: mapCoordinates.longitude,
                latitude: mapCoordinates.latitude,
                zoom: parsedCoordinates ? FOCUSED_LOCATION_ZOOM : DEFAULT_LOCATION_ZOOM,
              }}
              attributionControl={false}
              scrollZoom
              dragPan
              dragRotate={false}
              doubleClickZoom
              touchZoomRotate
              keyboard
              style={{ width: '100%', height: '100%' }}
            >
              <Marker
                longitude={mapCoordinates.longitude}
                latitude={mapCoordinates.latitude}
                anchor="bottom"
                draggable={canMovePin}
                onDragEnd={(event) => handleMarkerDragEnd({
                  latitude: event.lngLat.lat,
                  longitude: event.lngLat.lng,
                })}
              >
                <span className="drawer-location-pin" aria-hidden="true">
                  <span className="drawer-location-pin__glyph">
                    <MapPinned size={18} />
                  </span>
                </span>
              </Marker>
              <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
            </Map>
          </div>
        </article>

        {(hasRelatedPlaces || hasZoneCards) && (
          <div className="drawer-grid">
            {hasRelatedPlaces && (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Lieux rattaches</span>
                <div className="stack-list">
                  {value.places.map((place) => (
                    <article key={place.id} className="panel-card panel-card--nested">
                      <strong>{place.label}</strong>
                      <p>{place.locationLabel || 'Aucune localisation dediee remontee.'}</p>
                      {place.isPrimary && <small>Lieu principal</small>}
                    </article>
                  ))}
                </div>
              </article>
            )}

            {hasZoneCards && (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Zones touristiques</span>
                <div className="stack-list">
                  {value.zoneCodes.map((code) => (
                    <span key={code} className="drawer-header__chip">{code}</span>
                  ))}
                </div>
              </article>
            )}
          </div>
        )}
      </div>

      <Dialog open={pendingCoordinates !== null} onOpenChange={(nextOpen) => { if (!nextOpen) cancelCoordinateUpdate(); }}>
        <DialogContent className="max-w-md" showClose={false}>
          <DialogTitle>Confirmer la nouvelle position</DialogTitle>
          <DialogDescription>
            Le deplacement de l epingle mettra a jour la latitude et la longitude de cette fiche.
          </DialogDescription>
          {pendingCoordinates && (
            <div className="drawer-grid">
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Position actuelle</span>
                <strong>
                  {parsedCoordinates
                    ? `${formatCoordinate(parsedCoordinates.latitude)}, ${formatCoordinate(parsedCoordinates.longitude)}`
                    : 'Aucune coordonnee'}
                </strong>
              </article>
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Nouvelle position</span>
                <strong>{formatCoordinate(pendingCoordinates.latitude)}, {formatCoordinate(pendingCoordinates.longitude)}</strong>
              </article>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={cancelCoordinateUpdate}>
              Annuler
            </Button>
            <Button type="button" onClick={confirmCoordinateUpdate}>
              Confirmer la position
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

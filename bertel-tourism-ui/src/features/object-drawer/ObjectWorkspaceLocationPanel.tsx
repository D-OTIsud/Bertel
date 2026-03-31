import { useEffect, useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import type { ObjectWorkspaceLocationModule } from '../../services/object-workspace-parser';
import { env } from '../../lib/env';
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

function coordinatesMatch(left: LocationCoordinates, right: LocationCoordinates): boolean {
  return Math.abs(left.latitude - right.latitude) < 0.000001
    && Math.abs(left.longitude - right.longitude) < 0.000001;
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
  const coordinatesAreBlank = value.main.latitude.trim() === '' && value.main.longitude.trim() === '';
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

          <div className="drawer-location-layout">
            <div className="drawer-grid">
              <div className="field-block field-block--wide">
                <Label htmlFor="workspace-location-address1">Adresse principale</Label>
                <Input
                  id="workspace-location-address1"
                  value={value.main.address1}
                  onChange={(event) => onChange({ address1: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-postcode">Code postal</Label>
                <Input
                  id="workspace-location-postcode"
                  value={value.main.postcode}
                  onChange={(event) => onChange({ postcode: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-city">Ville</Label>
                <Input
                  id="workspace-location-city"
                  value={value.main.city}
                  onChange={(event) => onChange({ city: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-lieudit">Lieu-dit</Label>
                <Input
                  id="workspace-location-lieudit"
                  value={value.main.lieuDit}
                  onChange={(event) => onChange({ lieuDit: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-direction">Indications</Label>
                <Input
                  id="workspace-location-direction"
                  value={value.main.direction}
                  onChange={(event) => onChange({ direction: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-latitude">Latitude</Label>
                <Input
                  id="workspace-location-latitude"
                  value={value.main.latitude}
                  onChange={(event) => onChange({ latitude: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-longitude">Longitude</Label>
                <Input
                  id="workspace-location-longitude"
                  value={value.main.longitude}
                  onChange={(event) => onChange({ longitude: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor="workspace-location-zone">Zone touristique</Label>
                <Input
                  id="workspace-location-zone"
                  value={value.main.zoneTouristique}
                  onChange={(event) => onChange({ zoneTouristique: event.target.value })}
                />
              </div>
            </div>

            <article className="detail-map-card drawer-location-map-card">
              <div className="detail-map-card__canvas drawer-location-map-card__canvas">
                <Map
                  key={`${mapCoordinates.latitude}:${mapCoordinates.longitude}`}
                  reuseMaps
                  mapStyle={env.mapStyles.classic}
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

              <div className="detail-map-card__body">
                <div className="detail-map-card__address">
                  <span className="facet-title">Coordonnees</span>
                  {parsedCoordinates ? (
                    <p>{formatCoordinate(parsedCoordinates.latitude)}, {formatCoordinate(parsedCoordinates.longitude)}</p>
                  ) : coordinatesAreBlank ? (
                    <p>Aucune coordonnee enregistree pour le moment.</p>
                  ) : (
                    <p>Coordonnees en cours de saisie.</p>
                  )}
                  <small>
                    {canMovePin
                      ? "Deplacez l epingle pour proposer une nouvelle latitude et longitude."
                      : 'Les coordonnees restent en lecture seule pour votre profil.'}
                  </small>
                </div>
                {!parsedCoordinates && (
                  <p className="drawer-location-map-note">
                    La carte reste centree sur La Reunion tant qu aucune coordonnee exploitable n est renseignee.
                  </p>
                )}
              </div>
            </article>
          </div>
        </article>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Sous-lieux</span>
            <div className="stack-list">
              {value.places.length > 0 ? value.places.map((place) => (
                <article key={place.id} className="panel-card panel-card--nested">
                  <strong>{place.label}</strong>
                  <p>{place.locationLabel || 'Aucune localisation dediee remontee.'}</p>
                  {place.isPrimary && <small>Sous-lieu principal</small>}
                </article>
              )) : <p>Aucun sous-lieu.</p>}
            </div>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Zones</span>
            <div className="stack-list">
              {value.zoneCodes.length > 0 ? value.zoneCodes.map((code) => (
                <span key={code} className="drawer-header__chip">{code}</span>
              )) : <p>Aucune zone.</p>}
            </div>
          </article>
        </div>
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

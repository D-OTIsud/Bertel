import { useEffect, useMemo, useState } from 'react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import { MapPinned, Pin } from 'lucide-react';
import { env } from '../../lib/env';
import { getMarkerImageId } from '../../config/map-markers';
import type { ModifierPayload } from '../../services/modifier-payload';
import { Input } from '@/components/ui/input';
import { ModifierEmptyState, ModifierLabel, ModifierSectionHero } from './modifier-shared';

interface ObjectLocationPanelProps {
  payload: ModifierPayload;
  fields: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
}

interface PlacePinState {
  latitude: string;
  longitude: string;
}

function parseCoordinate(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ObjectLocationPanel({ payload, fields, onFieldChange }: ObjectLocationPanelProps) {
  const [selectedPinId, setSelectedPinId] = useState<string>('main');
  const [placePins, setPlacePins] = useState<Record<string, PlacePinState>>({});

  useEffect(() => {
    setSelectedPinId('main');
    setPlacePins(
      payload.location.places.reduce<Record<string, PlacePinState>>((accumulator, place) => {
        accumulator[place.id] = {
          latitude: place.latitude != null ? String(place.latitude) : '',
          longitude: place.longitude != null ? String(place.longitude) : '',
        };
        return accumulator;
      }, {}),
    );
  }, [payload.location.places]);

  const mainLatitude = fields['location.latitude'] ?? '';
  const mainLongitude = fields['location.longitude'] ?? '';
  const selectedPlace = selectedPinId === 'main'
    ? null
    : payload.location.places.find((place) => place.id === selectedPinId) ?? null;

  const selectedCoordinates = selectedPlace
    ? placePins[selectedPlace.id] ?? { latitude: '', longitude: '' }
    : { latitude: mainLatitude, longitude: mainLongitude };

  const mapCenter = useMemo(() => {
    const latitude = parseCoordinate(selectedCoordinates.latitude)
      ?? parseCoordinate(mainLatitude)
      ?? payload.parsed.location?.latitude
      ?? -21.115141;
    const longitude = parseCoordinate(selectedCoordinates.longitude)
      ?? parseCoordinate(mainLongitude)
      ?? payload.parsed.location?.longitude
      ?? 55.536384;

    return { latitude, longitude };
  }, [mainLatitude, mainLongitude, payload.parsed.location?.latitude, payload.parsed.location?.longitude, selectedCoordinates.latitude, selectedCoordinates.longitude]);

  const markerSrc = `/markers/${getMarkerImageId(payload.typeCode)}.png`;

  const updateSelectedCoordinates = (latitude: string, longitude: string) => {
    if (selectedPlace) {
      setPlacePins((current) => ({
        ...current,
        [selectedPlace.id]: {
          latitude,
          longitude,
        },
      }));
      return;
    }

    onFieldChange('location.latitude', latitude);
    onFieldChange('location.longitude', longitude);
  };

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Location & Places"
        title="Carte, zones et reperes nommes"
        description="Le pin principal reste editable sur carte, et les lieux nommes gardent leur propre lecture pour eviter les doublons entre adresse principale et micro-lieux."
        stats={[
          { label: 'Lieux', value: String(payload.location.places.length) },
          { label: 'Zones', value: String(payload.location.zones.length) },
          { label: 'Coordonnees', value: payload.location.coordinatesLabel || 'n/a' },
        ]}
        chips={payload.location.zones.slice(0, 4)}
      />

      <section className="panel-card panel-card--nested modifier-map-layout">
        <div className="modifier-map-sidebar">
          <div className="field-block">
            <ModifierLabel
              label="Pin actif"
              hint="Le pin principal alimente le detail et les exports. Les lieux nommes gardent leur propre point de contexte."
            />
            <div className="modifier-pin-switcher">
              <button
                type="button"
                className={selectedPinId === 'main' ? 'modifier-pin-chip modifier-pin-chip--active' : 'modifier-pin-chip'}
                onClick={() => setSelectedPinId('main')}
              >
                <Pin size={14} />
                Point principal
              </button>
              {payload.location.places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className={selectedPinId === place.id ? 'modifier-pin-chip modifier-pin-chip--active' : 'modifier-pin-chip'}
                  onClick={() => setSelectedPinId(place.id)}
                >
                  <MapPinned size={14} />
                  {place.label}
                </button>
              ))}
            </div>
          </div>

          <div className="drawer-grid modifier-form-grid">
            <div className="field-block field-block--wide">
              <ModifierLabel htmlFor="modifier-address1" label="Adresse" />
              <Input
                id="modifier-address1"
                value={fields['location.address1'] ?? ''}
                onChange={(event) => onFieldChange('location.address1', event.target.value)}
              />
            </div>

            <div className="field-block">
              <ModifierLabel htmlFor="modifier-postcode" label="Code postal" />
              <Input
                id="modifier-postcode"
                value={fields['location.postcode'] ?? ''}
                onChange={(event) => onFieldChange('location.postcode', event.target.value)}
              />
            </div>

            <div className="field-block">
              <ModifierLabel htmlFor="modifier-city" label="Ville" />
              <Input
                id="modifier-city"
                value={fields['location.city'] ?? ''}
                onChange={(event) => onFieldChange('location.city', event.target.value)}
              />
            </div>

            <div className="field-block">
              <ModifierLabel htmlFor="modifier-lieu-dit" label="Lieu-dit" />
              <Input
                id="modifier-lieu-dit"
                value={fields['location.lieuDit'] ?? ''}
                onChange={(event) => onFieldChange('location.lieuDit', event.target.value)}
              />
            </div>

            <div className="field-block">
              <ModifierLabel htmlFor="modifier-direction" label="Indication acces" />
              <Input
                id="modifier-direction"
                value={fields['location.direction'] ?? ''}
                onChange={(event) => onFieldChange('location.direction', event.target.value)}
              />
            </div>

            <div className="field-block">
              <ModifierLabel
                htmlFor="modifier-latitude"
                label="Latitude"
                hint="Drag le pin ou saisis une valeur precise manuellement."
              />
              <Input
                id="modifier-latitude"
                value={selectedCoordinates.latitude}
                onChange={(event) => updateSelectedCoordinates(event.target.value, selectedCoordinates.longitude)}
              />
            </div>

            <div className="field-block">
              <ModifierLabel htmlFor="modifier-longitude" label="Longitude" />
              <Input
                id="modifier-longitude"
                value={selectedCoordinates.longitude}
                onChange={(event) => updateSelectedCoordinates(selectedCoordinates.latitude, event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modifier-map-card">
          <div className="detail-map-card__canvas modifier-map-card__canvas">
            <Map
              key={`${selectedPinId}-${mapCenter.latitude}-${mapCenter.longitude}`}
              reuseMaps
              mapStyle={env.mapStyles.satellite}
              initialViewState={{
                longitude: mapCenter.longitude,
                latitude: mapCenter.latitude,
                zoom: 13,
              }}
              attributionControl={false}
              style={{ width: '100%', height: '100%' }}
            >
              {parseCoordinate(mainLatitude) != null && parseCoordinate(mainLongitude) != null && (
                <Marker
                  longitude={parseCoordinate(mainLongitude) ?? 0}
                  latitude={parseCoordinate(mainLatitude) ?? 0}
                  anchor="bottom"
                  draggable
                  onDragEnd={(event) => {
                    const nextLat = String(event.lngLat.lat.toFixed(6));
                    const nextLng = String(event.lngLat.lng.toFixed(6));
                    onFieldChange('location.latitude', nextLat);
                    onFieldChange('location.longitude', nextLng);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="detail-map-pin" src={markerSrc} alt="" aria-hidden="true" />
                </Marker>
              )}

              {payload.location.places.map((place) => {
                const pinState = placePins[place.id];
                const latitude = parseCoordinate(pinState?.latitude ?? '');
                const longitude = parseCoordinate(pinState?.longitude ?? '');

                if (latitude == null || longitude == null) {
                  return null;
                }

                return (
                  <Marker
                    key={place.id}
                    longitude={longitude}
                    latitude={latitude}
                    anchor="bottom"
                    draggable={selectedPinId === place.id}
                    onDragEnd={(event) => {
                      if (selectedPinId !== place.id) {
                        return;
                      }

                      setPlacePins((current) => ({
                        ...current,
                        [place.id]: {
                          latitude: String(event.lngLat.lat.toFixed(6)),
                          longitude: String(event.lngLat.lng.toFixed(6)),
                        },
                      }));
                    }}
                  >
                    <span className={`modifier-place-pin${selectedPinId === place.id ? ' modifier-place-pin--active' : ''}`}>
                      {place.label.slice(0, 1).toUpperCase()}
                    </span>
                  </Marker>
                );
              })}

              <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
            </Map>
          </div>
          <div className="modifier-map-card__footer">
            <strong>{selectedPlace ? selectedPlace.label : payload.parsed.location?.label || 'Point principal'}</strong>
            <p>{selectedPlace ? selectedPlace.address || 'Lieu sans adresse detaillee.' : payload.location.mainLabel || 'Adresse principale en cours d edition.'}</p>
          </div>
        </div>
      </section>

      {payload.location.places.length > 0 ? (
        <section className="panel-card panel-card--nested">
          <div className="modifier-card-list">
            {payload.location.places.map((place) => (
              <article key={place.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{place.label}</strong>
                  {place.type && <span className="detail-chip detail-chip--soft">{place.type}</span>}
                </div>
                <p className="detail-mini-card__meta">{place.address || 'Adresse de lieu non renseignee'}</p>
                {place.summary && <small>{place.summary}</small>}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <ModifierEmptyState
          title="Aucun lieu nomme"
          body="Le pin principal suffit pour le moment. Les lieux secondaires apparaitront ici des qu ils seront exposes par la fiche."
        />
      )}
    </div>
  );
}

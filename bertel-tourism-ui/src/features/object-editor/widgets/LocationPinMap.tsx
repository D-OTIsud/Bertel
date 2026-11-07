'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, type MapMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import { getMarkerImageId } from '../../../config/map-markers';
import { DEFAULT_APP_MAP_STYLE } from '../../../lib/map-style';
import {
  formatCoordString,
  LOCATION_MAP_DEFAULT_ZOOM,
  LOCATION_MAP_PIN_ZOOM,
  parseCoordString,
  REUNION_MAP_CENTER,
} from './location-coords';

export interface LocationPinMapProps {
  latitude: string;
  longitude: string;
  onCoordsChange: (latitude: string, longitude: string) => void;
  typeCode?: string;
}

type PendingCoords = { lat: number; lng: number };

/**
 * Interactive map for section 02 — same MapLibre stack as Explorer / fiche détail.
 * Click to place the pin; drag the pin to adjust coordinates.
 * Coordinates commit only after the user confirms the move.
 */
export function LocationPinMap({ latitude, longitude, onCoordsChange, typeCode }: LocationPinMapProps) {
  const mapRef = useRef<MapRef>(null);
  const committedLat = parseCoordString(latitude);
  const committedLng = parseCoordString(longitude);
  const [pending, setPending] = useState<PendingCoords | null>(null);

  const displayLat = pending?.lat ?? committedLat;
  const displayLng = pending?.lng ?? committedLng;
  const hasPin = displayLat != null && displayLng != null;
  const markerSrc = `/markers/${getMarkerImageId(typeCode ?? 'HOT')}.png`;

  useEffect(() => {
    if (pending) {
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map || committedLat == null || committedLng == null) {
      return;
    }
    map.flyTo({
      center: [committedLng, committedLat],
      zoom: Math.max(map.getZoom(), LOCATION_MAP_PIN_ZOOM),
      duration: 450,
    });
  }, [committedLat, committedLng, pending]);

  const queueCoordsChange = useCallback((nextLat: number, nextLng: number) => {
    const sameAsCommitted =
      committedLat != null
      && committedLng != null
      && formatCoordString(nextLat) === formatCoordString(committedLat)
      && formatCoordString(nextLng) === formatCoordString(committedLng);
    if (sameAsCommitted) {
      setPending(null);
      return;
    }
    setPending({ lat: nextLat, lng: nextLng });
  }, [committedLat, committedLng]);

  function confirmPending() {
    if (!pending) {
      return;
    }
    onCoordsChange(formatCoordString(pending.lat), formatCoordString(pending.lng));
    setPending(null);
  }

  function cancelPending() {
    setPending(null);
  }

  function handleMapClick(event: MapMouseEvent) {
    queueCoordsChange(event.lngLat.lat, event.lngLat.lng);
  }

  return (
    <div className="map-mini map-mini--interactive">
      <Map
        ref={mapRef}
        reuseMaps
        mapStyle={DEFAULT_APP_MAP_STYLE}
        initialViewState={{
          longitude: displayLng ?? REUNION_MAP_CENTER.longitude,
          latitude: displayLat ?? REUNION_MAP_CENTER.latitude,
          zoom: hasPin ? LOCATION_MAP_PIN_ZOOM : LOCATION_MAP_DEFAULT_ZOOM,
        }}
        attributionControl={false}
        scrollZoom
        dragPan
        dragRotate={false}
        doubleClickZoom
        touchZoomRotate
        style={{ width: '100%', height: '100%' }}
        cursor={hasPin ? 'grab' : 'crosshair'}
        onClick={handleMapClick}
      >
        {hasPin ? (
          <Marker
            longitude={displayLng}
            latitude={displayLat}
            anchor="bottom"
            draggable
            onDragEnd={(event) => queueCoordsChange(event.lngLat.lat, event.lngLat.lng)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="editor-map-pin" src={markerSrc} alt="" draggable={false} />
          </Marker>
        ) : null}
        <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
      </Map>
      {pending ? (
        <div className="map-mini__confirm" role="group" aria-label="Confirmer le déplacement du repère GPS">
          <p className="map-mini__confirm-text">
            Confirmer le nouveau repère GPS&nbsp;?
            <span className="map-mini__confirm-coords">
              {formatCoordString(pending.lat)}, {formatCoordString(pending.lng)}
            </span>
          </p>
          <div className="map-mini__confirm-actions">
            <button type="button" className="btn sm" onClick={cancelPending}>
              Non
            </button>
            <button type="button" className="btn sm primary" onClick={confirmPending}>
              Oui
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

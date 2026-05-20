'use client';

import { useCallback, useEffect, useRef } from 'react';
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

/**
 * Interactive map for section 03 — same MapLibre stack as Explorer / fiche détail.
 * Click to place the pin; drag the pin to adjust coordinates.
 */
export function LocationPinMap({ latitude, longitude, onCoordsChange, typeCode }: LocationPinMapProps) {
  const mapRef = useRef<MapRef>(null);
  const lat = parseCoordString(latitude);
  const lng = parseCoordString(longitude);
  const hasPin = lat != null && lng != null;
  const markerSrc = `/markers/${getMarkerImageId(typeCode ?? 'HOT')}.png`;

  const applyCoords = useCallback(
    (nextLat: number, nextLng: number) => {
      onCoordsChange(formatCoordString(nextLat), formatCoordString(nextLng));
    },
    [onCoordsChange],
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || lat == null || lng == null) {
      return;
    }
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), LOCATION_MAP_PIN_ZOOM),
      duration: 450,
    });
  }, [lat, lng]);

  function handleMapClick(event: MapMouseEvent) {
    applyCoords(event.lngLat.lat, event.lngLat.lng);
  }

  return (
    <div className="map-mini map-mini--interactive">
      <Map
        ref={mapRef}
        reuseMaps
        mapStyle={DEFAULT_APP_MAP_STYLE}
        initialViewState={{
          longitude: lng ?? REUNION_MAP_CENTER.longitude,
          latitude: lat ?? REUNION_MAP_CENTER.latitude,
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
            longitude={lng}
            latitude={lat}
            anchor="bottom"
            draggable
            onDragEnd={(event) => applyCoords(event.lngLat.lat, event.lngLat.lng)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="editor-map-pin" src={markerSrc} alt="" draggable={false} />
          </Marker>
        ) : null}
        <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
      </Map>
      <p className="map-mini__hint">
        {hasPin ? 'Déplacez le repère ou cliquez ailleurs sur la carte' : 'Cliquez sur la carte pour placer le repère'}
      </p>
    </div>
  );
}

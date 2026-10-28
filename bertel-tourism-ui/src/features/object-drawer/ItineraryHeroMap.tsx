import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Images, Route } from 'lucide-react';
import { Layer, Map, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre';
import { DEFAULT_APP_MAP_STYLE } from '../../lib/map-style';
import type { ParsedLocation } from '../../services/object-detail-parser';
import type { ItineraryStageRow } from './itinerary-stages';
import type { ItineraryTrackGeoJson } from './utils';

interface ItineraryHeroMapProps {
  name: string;
  track: ItineraryTrackGeoJson | null;
  stages: ItineraryStageRow[];
  location: ParsedLocation | null;
  mediaCount: number;
  onOpenGallery: () => void;
}

// Leave room for the zoom controls and wrapped attribution on narrow maps.
const ROUTE_PADDING = { top: 40, right: 80, bottom: 84, left: 40 };

export function ItineraryHeroMap({ name, track, stages, location, mediaCount, onOpenGallery }: ItineraryHeroMapProps) {
  const mapRef = useRef<MapRef>(null);
  // Number before filtering: a stage without GPS still occupies its place in the description.
  const stagePoints = useMemo(() => stages
    .map((stage, index) => ({ stage, number: index + 1 }))
    .filter(({ stage }) => stage.coordinates !== null), [stages]);

  const bounds = useMemo(() => {
    const coordinates = [
      ...(track?.coordinates ?? []),
      ...stagePoints.map(({ stage }) => stage.coordinates!),
    ];
    if (coordinates.length === 0 && location?.longitude != null && location.latitude != null
      && Number.isFinite(location.longitude) && Number.isFinite(location.latitude)
      && Math.abs(location.longitude) <= 180 && Math.abs(location.latitude) <= 90) {
      coordinates.push([location.longitude, location.latitude]);
    }
    if (coordinates.length === 0) return null;
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const [longitude, latitude] of coordinates) {
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }
    return [west, south, east, north] as [number, number, number, number];
  }, [track, stagePoints, location]);

  const fitRoute = useCallback(() => {
    if (bounds) mapRef.current?.fitBounds(bounds, { padding: ROUTE_PADDING, maxZoom: 15, duration: 0 });
  }, [bounds]);

  useEffect(() => { fitRoute(); }, [fitRoute]);

  const trackData = useMemo(() => track
    ? { type: 'Feature' as const, geometry: track, properties: {} }
    : null, [track]);

  return (
    <section id="detail-section-hero" className="detail-hero detail-itinerary-hero" aria-label="Carte du parcours">
      <h1 className="sr-only">{name}</h1>
      <div className="detail-itinerary-hero__map">
        <Map
          ref={mapRef}
          mapStyle={DEFAULT_APP_MAP_STYLE}
          initialViewState={bounds
            ? { bounds, fitBoundsOptions: { padding: ROUTE_PADDING, maxZoom: 15 } }
            : { longitude: 55.536384, latitude: -21.130568, zoom: 9 }}
          onLoad={fitRoute}
          onResize={fitRoute}
          attributionControl={{ compact: true }}
          dragRotate={false}
          scrollZoom={false}
          touchZoomRotate
          keyboard
          style={{ width: '100%', height: '100%' }}
        >
          {trackData ? (
            <Source id="detail-itinerary-track" type="geojson" data={trackData}>
              <Layer
                id="detail-itinerary-track-outline"
                type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 7 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
              <Layer
                id="detail-itinerary-track-line"
                type="line"
                paint={{ 'line-color': '#2a7a45', 'line-width': 4 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </Source>
          ) : null}
          {stagePoints.map(({ stage, number }) => (
            <Marker key={stage.key} longitude={stage.coordinates![0]} latitude={stage.coordinates![1]} anchor="center">
              <button
                type="button"
                className="detail-itinerary-hero__marker"
                aria-label={`${stage.positionLabel}${stage.name ? ` : ${stage.name}` : ''}`}
                aria-controls={stage.anchorId}
                title={stage.name || stage.positionLabel}
                onClick={() => {
                  const target = document.getElementById(stage.anchorId);
                  target?.scrollIntoView({ block: 'center' });
                  target?.focus({ preventScroll: true });
                }}
              >
                {number}
              </button>
            </Marker>
          ))}
          <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
        </Map>
      </div>
      <div className="detail-itinerary-hero__footer">
        <p className="detail-itinerary-hero__legend">
          <Route size={16} aria-hidden />
          <span>{track ? 'Tracé du sentier' : 'Tracé non renseigné'}{stages.length > 0 ? ` · ${stages.length} étape${stages.length > 1 ? 's' : ''}` : ''}</span>
        </p>
        {mediaCount > 0 ? (
          <button type="button" className="detail-itinerary-hero__gallery" onClick={onOpenGallery}>
            <Images size={16} aria-hidden />
            Voir les photos ({mediaCount})
          </button>
        ) : null}
      </div>
    </section>
  );
}

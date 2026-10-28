import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LocateFixed } from 'lucide-react';
import { AttributionControl, Layer, Map, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre';
import { MarkdownContent } from '../../components/markdown/MarkdownContent';
import { DEFAULT_APP_MAP_STYLE } from '../../lib/map-style';
import type { ParsedLocation } from '../../services/object-detail-parser';
import { ItineraryStageCard } from './ItineraryStageCard';
import type { ItineraryStageRow } from './itinerary-stages';
import type { ItineraryTrackGeoJson } from './utils';

interface ItineraryHeroMapProps {
  name: string;
  track: ItineraryTrackGeoJson | null;
  stages: ItineraryStageRow[];
  location: ParsedLocation | null;
  metrics?: ReactNode;
}

const ROUTE_PADDING = { top: 58, right: 58, bottom: 58, left: 42 };

export function ItineraryHeroMap({ name, track, stages, location, metrics }: ItineraryHeroMapProps) {
  const mapRef = useRef<MapRef>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const fitButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [selectedKey, setSelectedKey] = useState(stages[0]?.key ?? null);
  const [cardOpen, setCardOpen] = useState(true);
  const selectedStage = stages.find((stage) => stage.key === selectedKey) ?? stages[0] ?? null;

  // A stage without GPS keeps its number and its description in the ordered list.
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
    if (!bounds) return;
    const mapHeight = mapContainerRef.current?.clientHeight ?? 440;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
    // Keep the whole trail above the selected-step card, including on narrow drawers.
    const bottom = cardHeight > 0
      ? Math.max(58, Math.min(cardHeight + 32, Math.max(58, mapHeight - 130)))
      : ROUTE_PADDING.bottom;
    mapRef.current?.fitBounds(bounds, { padding: { ...ROUTE_PADDING, bottom }, maxZoom: 15, duration: 0 });
  }, [bounds]);

  useEffect(() => { fitRoute(); }, [fitRoute, selectedStage?.key, cardOpen]);

  const trackData = useMemo(() => track
    ? { type: 'Feature' as const, geometry: track, properties: {} }
    : null, [track]);

  const selectStage = (stage: ItineraryStageRow, fromMap = false) => {
    setSelectedKey(stage.key);
    setCardOpen(true);
    if (!fromMap) return;
    const target = document.getElementById(stage.anchorId);
    const list = listRef.current;
    if (target && list && getComputedStyle(list).overflowY !== 'visible') {
      // Scroll only the adjacent list: a click on a marker must not move the map away.
      const itemRect = target.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      if (itemRect.top < listRect.top) list.scrollTop += itemRect.top - listRect.top;
      else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
    } else {
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    target?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  };

  return (
    <section id="detail-section-hero" className="detail-hero detail-itinerary-hero" aria-label="Carte du parcours">
      <h1 className="sr-only">{name}</h1>
      <div className={`detail-itinerary-hero__workspace${stages.length === 0 ? ' detail-itinerary-hero__workspace--map-only' : ''}`}>
        <div className="detail-itinerary-hero__map-column">
          <div id="detail-itinerary-map" className="detail-itinerary-hero__map" ref={mapContainerRef} tabIndex={-1} role="group" aria-label="Carte du sentier">
            <Map
              ref={mapRef}
              mapStyle={DEFAULT_APP_MAP_STYLE}
              initialViewState={bounds
                ? { bounds, fitBoundsOptions: { padding: ROUTE_PADDING, maxZoom: 15 } }
                : { longitude: 55.536384, latitude: -21.130568, zoom: 9 }}
              onLoad={() => {
                fitRoute();
                // MapLibre opens its compact credits initially; keep the disclosure available, but closed.
                const attribution = mapContainerRef.current?.querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib');
                attribution?.classList.remove('maplibregl-compact-show');
                attribution?.removeAttribute('open');
              }}
              onResize={fitRoute}
              attributionControl={false}
              dragRotate={false}
              scrollZoom={false}
              touchZoomRotate
              keyboard
              style={{ width: '100%', height: '100%' }}
            >
              {trackData ? (
                <Source id="detail-itinerary-track" type="geojson" data={trackData}>
                  <Layer id="detail-itinerary-track-outline" type="line"
                    paint={{ 'line-color': '#ffffff', 'line-width': 7 }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                  <Layer id="detail-itinerary-track-line" type="line"
                    paint={{ 'line-color': '#2a7a45', 'line-width': 4 }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                </Source>
              ) : null}
              {stagePoints.map(({ stage, number }) => (
                <Marker key={stage.key} longitude={stage.coordinates![0]} latitude={stage.coordinates![1]} anchor="center">
                  <button
                    type="button"
                    className={`detail-itinerary-hero__marker${stage.key === selectedStage?.key ? ' is-selected' : ''}`}
                    aria-label={`${stage.positionLabel}${stage.name ? ` : ${stage.name}` : ''}`}
                    aria-controls={stage.anchorId}
                    aria-pressed={stage.key === selectedStage?.key}
                    title={stage.name || stage.positionLabel}
                    onClick={() => selectStage(stage, true)}
                  >
                    {number}
                  </button>
                </Marker>
              ))}
              <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
              <AttributionControl position="top-right" compact />
            </Map>
            {bounds ? (
              <button type="button" className="detail-itinerary-hero__fit" ref={fitButtonRef} onClick={fitRoute}>
                <LocateFixed size={15} aria-hidden />Tout le parcours
              </button>
            ) : null}
            {selectedStage && cardOpen ? (
              <ItineraryStageCard key={selectedStage.key} stage={selectedStage} cardRef={cardRef} onSizeChange={fitRoute}
                onClose={() => {
                  setCardOpen(false);
                  (fitButtonRef.current ?? mapContainerRef.current)?.focus({ preventScroll: true });
                }} />
            ) : null}
          </div>
          {metrics}
        </div>
        {stages.length > 0 ? (
          <aside id="detail-section-stages" className="detail-itinerary-stages" aria-labelledby="detail-itinerary-stages-title">
            <header className="detail-itinerary-stages__header">
              <div className="detail-itinerary-stages__heading">
                <h2 id="detail-itinerary-stages-title">Étapes du parcours</h2>
                <span className="detail-itinerary-stages__count">{stages.length}</span>
              </div>
              <p>Les repères de la carte, dans l’ordre du parcours.</p>
            </header>
            <ol className="detail-waypoints" ref={listRef}>
              {stages.map((stage, index) => (
                <li key={stage.key} id={stage.anchorId} className={`detail-waypoint${stage.key === selectedStage?.key ? ' is-selected' : ''}`} tabIndex={-1}>
                  <button type="button" className="detail-waypoint__select"
                    aria-label={`Sélectionner l’étape ${index + 1}${stage.name ? ` : ${stage.name}` : ''}`}
                    aria-pressed={stage.key === selectedStage?.key} aria-controls="detail-itinerary-map"
                    onClick={() => selectStage(stage)}>
                    <span className="detail-waypoint__num" aria-hidden>{index + 1}</span>
                    <span className="detail-waypoint__body">
                      <span className="detail-waypoint__position">{stage.positionLabel}{stage.kindLabel ? ` · ${stage.kindLabel}` : ''}</span>
                      {stage.name ? <strong className="detail-waypoint__name">{stage.name}</strong> : null}
                    </span>
                  </button>
                  {stage.descriptionMd ? <MarkdownContent markdown={stage.descriptionMd} className="detail-waypoint__desc" />
                    : stage.description ? <p className="detail-waypoint__desc">{stage.description}</p> : null}
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

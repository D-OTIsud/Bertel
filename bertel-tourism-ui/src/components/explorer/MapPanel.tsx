'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { SlidersHorizontal } from 'lucide-react';
import { Layer, Map, Marker, NavigationControl, Popup, Source, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  defaultMarkerStyles,
  getMarkerImageId,
  objectTypeOptions,
} from '../../config/map-markers';
import { env } from '../../lib/env';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { GeoPolygon, ObjectCard } from '../../types/domain';
import { buildObjectFeatureCollection } from './map-source';
import { normalizeExplorerObjectType } from '../../utils/facets';

const OBJECT_SOURCE_ID = 'objects-source';
const OBJECT_FALLBACK_LAYER_ID = 'objects-fallback';
const OBJECT_LABEL_LAYER_ID = 'objects-labels';

function polygonToBounds(polygon: GeoPolygon): [number, number, number, number] {
  const coords = polygon.coordinates[0] ?? [];
  const lons = coords.map((coord) => coord[0]);
  const lats = coords.map((coord) => coord[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function MapDrawControl() {
  const { map } = useMap();
  const polygon = useExplorerStore((state) => state.common.polygon);
  const setPolygon = useExplorerStore((state) => state.setPolygon);
  const resetSpatialFilter = useExplorerStore((state) => state.resetSpatialFilter);
  const drawRef = useRef<MapboxDraw | null>(null);
  const lastPolygonRef = useRef<string | null>(null);
  const drawDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;
    let isMounted = true;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    drawRef.current = draw;

    const syncDraw = () => {
      if (!isMounted) return;
      if (drawDebounceRef.current != null) {
        window.clearTimeout(drawDebounceRef.current);
      }
      drawDebounceRef.current = window.setTimeout(() => {
        if (!isMounted) return;
      const features = draw.getAll().features;
      const geom = features[0]?.geometry;
      if (!geom || geom.type !== 'Polygon') {
        resetSpatialFilter();
        return;
      }
      const typed: GeoPolygon = {
        type: 'Polygon',
        coordinates: geom.coordinates as number[][][],
      };
        const nextKey = JSON.stringify(typed.coordinates);
        if (lastPolygonRef.current === nextKey) {
          return;
        }
        lastPolygonRef.current = nextKey;
        setPolygon(typed, polygonToBounds(typed));
      }, 150);
    };

    const onLoad = () => {
      if (!isMounted) return;
      map.addControl(draw as unknown as { onAdd: () => HTMLElement; onRemove: () => void }, 'top-left');
      (map as unknown as { on: (e: string, cb: () => void) => void }).on('draw.create', syncDraw);
      (map as unknown as { on: (e: string, cb: () => void) => void }).on('draw.update', syncDraw);
      (map as unknown as { on: (e: string, cb: () => void) => void }).on('draw.delete', resetSpatialFilter);
      if (polygon) {
        draw.deleteAll();
        draw.add({ type: 'Feature', properties: {}, geometry: polygon });
      }
    };

    if (map.isStyleLoaded()) onLoad();
    else map.once('load', onLoad);

    return () => {
      isMounted = false;
      if (drawDebounceRef.current != null) {
        window.clearTimeout(drawDebounceRef.current);
        drawDebounceRef.current = null;
      }
      (map as unknown as { off: (e: string, cb: () => void) => void }).off('draw.create', syncDraw);
      (map as unknown as { off: (e: string, cb: () => void) => void }).off('draw.update', syncDraw);
      (map as unknown as { off: (e: string, cb: () => void) => void }).off('draw.delete', resetSpatialFilter);
      if (drawRef.current) {
        map.removeControl(drawRef.current as unknown as { onAdd: () => HTMLElement; onRemove: () => void });
        drawRef.current = null;
      }
    };
  }, [map, resetSpatialFilter, setPolygon]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !map) return;

    const currentFeatures = draw.getAll().features;
    const currentGeom = currentFeatures[0]?.geometry;
    const storeGeomString = polygon ? JSON.stringify(polygon.coordinates) : null;
    const mapGeomString = currentGeom ? JSON.stringify((currentGeom as GeoPolygon).coordinates) : null;

    if (storeGeomString !== mapGeomString) {
      draw.deleteAll();
      if (polygon) {
        draw.add({ type: 'Feature', properties: {}, geometry: polygon });
      }
    }
  }, [map, polygon]);

  return null;
}

type HoverPopupState = {
  lngLat: [number, number];
  id: string;
  name: string;
  image?: string;
};

interface MapPanelProps {
  objects: ObjectCard[];
  headerActions?: ReactNode;
}

export function MapPanel({ objects, headerActions }: MapPanelProps) {
  const mapLayer = useUiStore((state) => state.mapLayer);
  const markerStyles = useUiStore((state) => state.markerStyles);
  const setMapLayer = useUiStore((state) => state.setMapLayer);

  const selectCard = useExplorerStore((state) => state.selectCard);
  const [hoverPopupState, setHoverPopupState] = useState<HoverPopupState | null>(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  const geojsonData = useMemo(() => buildObjectFeatureCollection(objects), [objects]);
  const mapStyle = env.mapStyles[mapLayer];
  const fallbackCircleColor = useMemo(() => {
    const entries = objectTypeOptions.flatMap((item) => [item.code, (markerStyles[item.code] ?? defaultMarkerStyles[item.code]).color] as const);
    return ['match', ['get', 'type'], ...entries, '#327090'] as const;
  }, [markerStyles]);
  const markerPoints = useMemo(
    () =>
      objects.flatMap((card) => {
        const lat = card.location?.lat;
        const lon = card.location?.lon;
        if (lat == null || lon == null) return [];

        const type = normalizeExplorerObjectType(card.type);
        const imageId = getMarkerImageId(type);
        const color = (markerStyles[type] ?? defaultMarkerStyles[type]).color;
        return [{ card, lat, lon, imageSrc: `/markers/${imageId}.png`, color }];
      }),
    [markerStyles, objects],
  );

  const collapseHeader = useCallback(() => {
    setHeaderExpanded(false);
  }, []);
  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearHoverTimer();
    },
    [clearHoverTimer],
  );

  const handleMarkerEnter = useCallback(
    (card: ObjectCard, lng: number, lat: number) => {
      clearHoverTimer();
      hoverTimerRef.current = window.setTimeout(() => {
        setHoverPopupState({
          id: card.id,
          name: card.name,
          image: card.image ?? undefined,
          lngLat: [lng, lat],
        });
      }, 300);
    },
    [clearHoverTimer],
  );

  const handleMarkerLeave = useCallback(
    (markerId: string) => {
      clearHoverTimer();
      setHoverPopupState((prev) => (prev?.id === markerId ? null : prev));
    },
    [clearHoverTimer],
  );

  const handleMarkerClick = useCallback(
    (cardId: string) => {
      clearHoverTimer();
      setHoverPopupState(null);
      selectCard(cardId);
    },
    [clearHoverTimer, selectCard],
  );

  return (
    <section className="map-panel panel-card panel-card--map">
      <div className={`map-panel__header-actions-wrap ${headerExpanded ? 'map-panel__header-actions-wrap--expanded' : ''}`}>
        {headerExpanded ? (
          <div className="map-panel__header-actions" role="toolbar" onClick={collapseHeader}>
            {headerActions}
            <div className="segmented-control">
              <button type="button" className={mapLayer === 'classic' ? 'chip chip--active' : 'chip'} onClick={() => setMapLayer('classic')}>
                Plan
              </button>
              <button type="button" className={mapLayer === 'satellite' ? 'chip chip--active' : 'chip'} onClick={() => setMapLayer('satellite')}>
                Satellite
              </button>
              <button type="button" className={mapLayer === 'topo' ? 'chip chip--active' : 'chip'} onClick={() => setMapLayer('topo')}>
                Topo
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="map-panel__header-trigger"
            onClick={() => setHeaderExpanded(true)}
            aria-label="Ouvrir les outils carte"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="map-canvas">
        <Map
          mapStyle={mapStyle}
          initialViewState={{
            longitude: 55.536384,
            latitude: -21.130568,
            zoom: 10.2,
          }}
          attributionControl={false}
          cursor="default"
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <MapDrawControl />
          {markerPoints.map((point) => (
            <Marker key={point.card.id} longitude={point.lon} latitude={point.lat} anchor="bottom">
              <button
                type="button"
                className="map-marker-pin"
                style={{ backgroundColor: point.color }}
                onMouseEnter={() => handleMarkerEnter(point.card, point.lon, point.lat)}
                onMouseLeave={() => handleMarkerLeave(point.card.id)}
                onClick={() => handleMarkerClick(point.card.id)}
                aria-label={`Ouvrir ${point.card.name}`}
              >
                <img src={point.imageSrc} alt={point.card.name} className="map-marker-pin__img" />
              </button>
            </Marker>
          ))}
          <Source id={OBJECT_SOURCE_ID} type="geojson" data={geojsonData}>
            <Layer
              id={OBJECT_FALLBACK_LAYER_ID}
              type="circle"
              paint={{
                'circle-color': fallbackCircleColor as unknown as string,
                'circle-opacity': 0.22,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 0.9,
                // Make demo points easy to hover/click while pins are loading.
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3, 11, 4, 15, 5],
              }}
            />
            <Layer
              id={OBJECT_LABEL_LAYER_ID}
              type="symbol"
              minzoom={12}
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 12,
                'text-anchor': 'top',
                'text-offset': [0, 1.8],
                'text-optional': true,
              }}
              paint={{
                'text-color': '#18313B',
                'text-halo-color': '#FFFDF8',
                'text-halo-width': 1.2,
              }}
            />
          </Source>
          {hoverPopupState && (
            <Popup
              longitude={hoverPopupState.lngLat[0]}
              latitude={hoverPopupState.lngLat[1]}
              onClose={() => setHoverPopupState(null)}
              offset={18}
              closeButton={false}
              closeOnClick={false}
            >
              <div className="map-hover-card">
                <img
                  className="map-hover-card__img"
                  src={hoverPopupState.image ?? ''}
                  alt={hoverPopupState.name}
                />
                <strong className="map-hover-card__name">{hoverPopupState.name}</strong>
              </div>
            </Popup>
          )}
        </Map>
      </div>
    </section>
  );
}


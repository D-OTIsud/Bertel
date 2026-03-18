'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { SlidersHorizontal } from 'lucide-react';
import { Layer, Map, NavigationControl, Popup, Source, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  buildMarkerSvg,
  defaultMarkerStyles,
  getMarkerImageId,
  objectTypeOptions,
  type MarkerStyle,
} from '../../config/map-markers';
import { env } from '../../lib/env';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { GeoPolygon, ObjectCard, ObjectTypeCode } from '../../types/domain';
import { buildObjectFeatureCollection } from './map-source';

const OBJECT_SOURCE_ID = 'objects-source';
const OBJECT_FALLBACK_LAYER_ID = 'objects-fallback';
const OBJECT_ICON_LAYER_ID = 'objects-icons';
const OBJECT_LABEL_LAYER_ID = 'objects-labels';

function polygonToBounds(polygon: GeoPolygon): [number, number, number, number] {
  const coords = polygon.coordinates[0] ?? [];
  const lons = coords.map((coord) => coord[0]);
  const lats = coords.map((coord) => coord[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(64, 80);
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossible de charger l icone SVG du marker.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function loadPngImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(64, 80);
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger l icone PNG du marker: ${url}`));
    image.src = url;
  });
}

function MapMarkerImages({ markerStyles }: { markerStyles: Record<ObjectTypeCode, MarkerStyle> }) {
  const { map } = useMap();

  useEffect(() => {
    if (!map) return;
    let isMounted = true;

    const upsertImage = async (code: ObjectTypeCode) => {
      const imageId = getMarkerImageId(code);
      const style = markerStyles[code] ?? defaultMarkerStyles[code];
      try {
        // Prefer static PNG assets to avoid CSP issues with `data:image/svg+xml` in prod.
        if (style.mode === 'preset') {
          const pngUrl = `/markers/${imageId}.png`;
          const pngImage = await loadPngImage(pngUrl);
          if (!isMounted) return;
          if (map.hasImage(imageId)) {
            map.updateImage(imageId, pngImage);
          } else {
            map.addImage(imageId, pngImage, { pixelRatio: 2 });
          }
          return;
        }

        const svg = buildMarkerSvg(style);
        const image = await loadSvgImage(svg);
        if (!isMounted) return;
        if (map.hasImage(imageId)) {
          map.updateImage(imageId, image);
        } else {
          map.addImage(imageId, image, { pixelRatio: 2 });
        }
      } catch {
        // If a specific marker SVG cannot be loaded, keep the map usable.
        // The fallback circle layer will still render points.
      }
    };

    const syncImages = async () => {
      if (!isMounted || !map) return;
      if (!map.isStyleLoaded()) return;
      await Promise.allSettled(objectTypeOptions.map(async ({ code }) => upsertImage(code)));
    };

    const onStyleImageMissing = (event: { id?: string }) => {
      const missingId = String(event.id ?? '');
      let type = objectTypeOptions.find((item) => getMarkerImageId(item.code) === missingId)?.code;

      // Be tolerant to unexpected casing/format (MapLibre sometimes reports ids in a different casing).
      if (!type && missingId.toLowerCase().startsWith('marker-')) {
        const candidate = missingId.slice('marker-'.length).toUpperCase() as ObjectTypeCode;
        if (candidate in defaultMarkerStyles) {
          type = candidate;
        }
      }

      if (!type) return;
      void upsertImage(type);
    };

    const onLoad = () => {
      void syncImages();
    };
    // MapLibre reliably emits `load` on first style load; `styledata` can be missed on initial mount
    // depending on timing, so listen to both and also sync immediately when possible.
    if (map.isStyleLoaded()) void syncImages();
    map.once('load', onLoad);
    map.on('styledata', onLoad);
    map.on('styleimagemissing', onStyleImageMissing as unknown as (...args: unknown[]) => void);

    return () => {
      isMounted = false;
      map.off('load', onLoad);
      map.off('styledata', onLoad);
      map.off('styleimagemissing', onStyleImageMissing as unknown as (...args: unknown[]) => void);
    };
  }, [map, markerStyles]);

  return null;
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

function MapMarkerInteractions({
  cardById,
  selectCard,
  setHoverPopupState,
}: {
  cardById: Map<string, ObjectCard>;
  selectCard: (id: string) => void;
  setHoverPopupState: (next: HoverPopupState | null) => void;
}) {
  const { map } = useMap();

  const cardByIdRef = useRef(cardById);
  useEffect(() => {
    cardByIdRef.current = cardById;
  }, [cardById]);

  useEffect(() => {
    if (!map) return;

    let hoverTimer: number | null = null;
    let hoveredId: string | null = null;
    let boundIcon = false;
    let boundLabel = false;
    let boundFallback = false;

    const clearHover = () => {
      if (hoverTimer != null) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      hoveredId = null;
      setHoverPopupState(null);
    };

    const resolveIdAtPoint = (point: unknown): string | null => {
      const features = map.queryRenderedFeatures(point as any, {
        layers: [OBJECT_ICON_LAYER_ID, OBJECT_LABEL_LAYER_ID, OBJECT_FALLBACK_LAYER_ID],
      }) as Array<{ properties?: { id?: unknown } }> | undefined;

      // Pick the first feature that actually carries `properties.id`.
      for (const feature of features ?? []) {
        const id = feature.properties?.id;
        if (typeof id === 'string') return id;
      }
      return null;
    };

    const showTooltipForId = (id: string, lngLat: { lng: number; lat: number }) => {
      const card = cardByIdRef.current.get(id);
      if (!card) return;
      setHoverPopupState({
        lngLat: [lngLat.lng, lngLat.lat],
        id,
        name: card.name,
        image: card.image ?? undefined,
      });
    };

    const onEnter = (e: any) => {
      (map.getCanvas() as HTMLCanvasElement).style.cursor = 'pointer';
      const id = resolveIdAtPoint(e.point);
      if (!id) return;
      hoveredId = id;

      if (hoverTimer != null) window.clearTimeout(hoverTimer);

      const lngLat = e.lngLat as { lng: number; lat: number };
      hoverTimer = window.setTimeout(() => {
        // If we moved to another marker before the delay, don't show.
        if (hoveredId !== id) return;
        showTooltipForId(id, lngLat);
      }, 300);
    };

    const onLeave = () => {
      (map.getCanvas() as HTMLCanvasElement).style.cursor = '';
      clearHover();
    };

    const onClick = (e: any) => {
      const id = resolveIdAtPoint(e.point);
      if (!id) return;
      clearHover();
      selectCard(id);
    };

    const bindIfLayersExist = () => {
      const hasIcon = Boolean(map.getLayer(OBJECT_ICON_LAYER_ID));
      const hasLabel = Boolean(map.getLayer(OBJECT_LABEL_LAYER_ID));
      const hasFallback = Boolean(map.getLayer(OBJECT_FALLBACK_LAYER_ID));

      if (hasIcon && !boundIcon) {
        map.on('mouseenter', OBJECT_ICON_LAYER_ID, onEnter as any);
        map.on('mouseleave', OBJECT_ICON_LAYER_ID, onLeave as any);
        map.on('click', OBJECT_ICON_LAYER_ID, onClick as any);
        boundIcon = true;
      }
      if (hasLabel && !boundLabel) {
        map.on('mouseenter', OBJECT_LABEL_LAYER_ID, onEnter as any);
        map.on('mouseleave', OBJECT_LABEL_LAYER_ID, onLeave as any);
        map.on('click', OBJECT_LABEL_LAYER_ID, onClick as any);
        boundLabel = true;
      }
      if (hasFallback && !boundFallback) {
        map.on('mouseenter', OBJECT_FALLBACK_LAYER_ID, onEnter as any);
        map.on('mouseleave', OBJECT_FALLBACK_LAYER_ID, onLeave as any);
        map.on('click', OBJECT_FALLBACK_LAYER_ID, onClick as any);
        boundFallback = true;
      }
    };

    const tryBind = () => bindIfLayersExist();

    const onLoad = () => tryBind();
    if (map.isStyleLoaded()) tryBind();
    map.on('load', onLoad);
    map.on('styledata', tryBind);

    // Layers can be added after the initial style load; poll briefly to ensure bindings happen.
    const interval = window.setInterval(() => {
      tryBind();
      // Stop once at least fallback is bound; pins hover/click work as soon as icons bind.
      if (boundFallback) window.clearInterval(interval);
    }, 250);

    return () => {
      clearHover();
      map.off('styledata', tryBind);
      map.off('load', onLoad);
      window.clearInterval(interval);
      // Off only the handlers we may have bound.
      map.off('mouseenter', OBJECT_ICON_LAYER_ID, onEnter as any);
      map.off('mouseleave', OBJECT_ICON_LAYER_ID, onLeave as any);
      map.off('click', OBJECT_ICON_LAYER_ID, onClick as any);

      map.off('mouseenter', OBJECT_LABEL_LAYER_ID, onEnter as any);
      map.off('mouseleave', OBJECT_LABEL_LAYER_ID, onLeave as any);
      map.off('click', OBJECT_LABEL_LAYER_ID, onClick as any);

      map.off('mouseenter', OBJECT_FALLBACK_LAYER_ID, onEnter as any);
      map.off('mouseleave', OBJECT_FALLBACK_LAYER_ID, onLeave as any);
      map.off('click', OBJECT_FALLBACK_LAYER_ID, onClick as any);
    };
  }, [map, selectCard, setHoverPopupState]);

  return null;
}

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

  const geojsonData = useMemo(() => buildObjectFeatureCollection(objects), [objects]);
  const cardById = useMemo(() => {
    const map = new globalThis.Map<string, ObjectCard>();
    for (const card of objects) {
      map.set(card.id, card);
    }
    return map;
  }, [objects]);
  const mapStyle = env.mapStyles[mapLayer];
  const fallbackCircleColor = useMemo(() => {
    const entries = objectTypeOptions.flatMap((item) => [item.code, (markerStyles[item.code] ?? defaultMarkerStyles[item.code]).color] as const);
    return ['match', ['get', 'type'], ...entries, '#327090'] as const;
  }, [markerStyles]);

  const collapseHeader = useCallback(() => {
    setHeaderExpanded(false);
  }, []);

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
          interactiveLayerIds={[OBJECT_FALLBACK_LAYER_ID, OBJECT_ICON_LAYER_ID, OBJECT_LABEL_LAYER_ID]}
          cursor="default"
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <MapMarkerImages markerStyles={markerStyles} />
          <MapDrawControl />
          <MapMarkerInteractions
            cardById={cardById}
            selectCard={selectCard}
            setHoverPopupState={(next) => setHoverPopupState(next)}
          />
          <Source id={OBJECT_SOURCE_ID} type="geojson" data={geojsonData}>
            <Layer
              id={OBJECT_FALLBACK_LAYER_ID}
              type="circle"
              paint={{
                'circle-color': fallbackCircleColor as unknown as string,
                'circle-opacity': 0.85,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.2,
                // Make demo points easy to hover/click while pins are loading.
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 8, 11, 10, 15, 12],
              }}
            />
            <Layer
              id={OBJECT_ICON_LAYER_ID}
              type="symbol"
              layout={{
                'icon-image': ['get', 'markerIcon'],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.55, 11, 0.72, 15, 0.92],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
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


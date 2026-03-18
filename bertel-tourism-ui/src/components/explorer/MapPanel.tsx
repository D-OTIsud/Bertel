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
import { buildObjectFeatureCollection, type MapFeatureProperties } from './map-source';

const OBJECT_SOURCE_ID = 'objects-source';
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

function MapMarkerImages({ markerStyles }: { markerStyles: Record<ObjectTypeCode, MarkerStyle> }) {
  const { map } = useMap();

  useEffect(() => {
    if (!map) return;
    let isMounted = true;

    const upsertImage = async (code: ObjectTypeCode) => {
      const imageId = getMarkerImageId(code);
      const style = markerStyles[code] ?? defaultMarkerStyles[code];
      const svg = buildMarkerSvg(style);
      const image = await loadSvgImage(svg);
      if (!isMounted) return;
      if (map.hasImage(imageId)) {
        map.updateImage(imageId, image);
      } else {
        map.addImage(imageId, image, { pixelRatio: 2 });
      }
    };

    const syncImages = async () => {
      if (!isMounted || !map?.getStyle()) return;
      await Promise.allSettled(objectTypeOptions.map(async ({ code }) => upsertImage(code)));
    };

    const onStyleImageMissing = (event: { id?: string }) => {
      const missingId = String(event.id ?? '');
      const type = objectTypeOptions.find((item) => getMarkerImageId(item.code) === missingId)?.code;
      if (!type) {
        return;
      }
      void upsertImage(type);
    };

    const onLoad = () => void syncImages();
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

interface MapPanelProps {
  objects: ObjectCard[];
  headerActions?: ReactNode;
}

export function MapPanel({ objects, headerActions }: MapPanelProps) {
  const mapLayer = useUiStore((state) => state.mapLayer);
  const markerStyles = useUiStore((state) => state.markerStyles);
  const setMapLayer = useUiStore((state) => state.setMapLayer);
  const openDrawer = useUiStore((state) => state.openDrawer);

  const [popupState, setPopupState] = useState<{
    lngLat: [number, number];
    properties: MapFeatureProperties;
  } | null>(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  const geojsonData = useMemo(() => buildObjectFeatureCollection(objects), [objects]);
  const mapStyle = env.mapStyles[mapLayer];

  const handleClick = useCallback(
    (e: { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: unknown }> }) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
        return;
      }
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const props = (feature.properties ?? {}) as Partial<MapFeatureProperties>;
      const id = typeof props.id === 'string' ? props.id : '';
      setPopupState({
        lngLat: [lon, lat],
        properties: {
          id,
          name: props.name ?? 'Sans nom',
          type: props.type ?? '',
          address: props.address ?? 'Sans adresse',
          city: props.city ?? '',
          price: props.price ?? '',
          rating: props.rating ?? '',
          markerIcon: props.markerIcon ?? '',
        },
      });
      if (id) openDrawer(id);
    },
    [openDrawer],
  );

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
          onClick={handleClick}
          interactiveLayerIds={[OBJECT_ICON_LAYER_ID, OBJECT_LABEL_LAYER_ID]}
          cursor="default"
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <MapMarkerImages markerStyles={markerStyles} />
          <MapDrawControl />
          <Source id={OBJECT_SOURCE_ID} type="geojson" data={geojsonData}>
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
          {popupState && (
            <Popup
              longitude={popupState.lngLat[0]}
              latitude={popupState.lngLat[1]}
              onClose={() => setPopupState(null)}
              offset={18}
              closeButton
              closeOnClick={false}
            >
              <div className="map-popup">
                <strong>{popupState.properties.name}</strong>
                <span>{popupState.properties.address || 'Sans adresse'}</span>
                {popupState.properties.price ? <div>{popupState.properties.price}</div> : null}
                {popupState.properties.rating ? <div>Note: {popupState.properties.rating}</div> : null}
              </div>
            </Popup>
          )}
        </Map>
      </div>
    </section>
  );
}


'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import {
  Map,
  Source,
  Layer,
  Popup,
  NavigationControl,
  useMap,
} from 'react-map-gl/maplibre';
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
import type { GeoPolygon, MapObject, ObjectTypeCode } from '../../types/domain';
import {
  buildObjectFeatureCollection,
  type MapFeatureProperties,
} from './map-source';

const OBJECT_SOURCE_ID = 'objects-source';
const OBJECT_ICON_LAYER_ID = 'objects-icons';
const OBJECT_LABEL_LAYER_ID = 'objects-labels';

function polygonToBounds(polygon: GeoPolygon): [number, number, number, number] {
  const coords = polygon.coordinates[0] ?? [];
  const lons = coords.map((coord) => coord[0]);
  const lats = coords.map((coord) => coord[1]);
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(64, 80);
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('Impossible de charger l icone SVG du marker.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function MapMarkerImages({
  markerStyles,
}: {
  markerStyles: Record<ObjectTypeCode, MarkerStyle>;
}) {
  const { map } = useMap();

  const syncImages = useCallback(async () => {
    if (!map?.getStyle()) return;
    await Promise.all(
      objectTypeOptions.map(async ({ code }) => {
        const imageId = getMarkerImageId(code);
        const style = markerStyles[code] ?? defaultMarkerStyles[code];
        const svg = buildMarkerSvg(style);
        const image = await loadSvgImage(svg);
        if (map.hasImage(imageId)) {
          map.updateImage(imageId, image);
        } else {
          map.addImage(imageId, image, { pixelRatio: 2 });
        }
      }),
    );
  }, [map, markerStyles]);

  useEffect(() => {
    if (!map) return;
    if (map.isStyleLoaded()) {
      void syncImages();
      return;
    }
    const onLoad = () => void syncImages();
    map.once('styledata', onLoad);
    return () => {
      map.off('styledata', onLoad);
    };
  }, [map, syncImages]);

  return null;
}

function MapDrawControl() {
  const { map } = useMap();
  const polygon = useExplorerStore((state) => state.polygon);
  const setPolygon = useExplorerStore((state) => state.setPolygon);
  const resetSpatialFilter = useExplorerStore((state) => state.resetSpatialFilter);
  const drawRef = useRef<MapboxDraw | null>(null);

  useEffect(() => {
    if (!map) return;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    drawRef.current = draw;

    const syncDraw = () => {
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
      setPolygon(typed, polygonToBounds(typed));
    };

    const onLoad = () => {
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
    draw.deleteAll();
    if (polygon) {
      draw.add({ type: 'Feature', properties: {}, geometry: polygon });
    }
  }, [map, polygon]);

  return null;
}

interface MapPanelProps {
  objects: MapObject[];
}

export function MapPanel({ objects }: MapPanelProps) {
  const mapLayer = useUiStore((state) => state.mapLayer);
  const markerStyles = useUiStore((state) => state.markerStyles);
  const setMapLayer = useUiStore((state) => state.setMapLayer);
  const openDrawer = useUiStore((state) => state.openDrawer);

  const [popupState, setPopupState] = useState<{
    lngLat: [number, number];
    properties: MapFeatureProperties;
  } | null>(null);

  const geojsonData = useMemo(
    () => buildObjectFeatureCollection(objects),
    [objects],
  );

  const mapStyle = env.mapStyles[mapLayer];

  const handleClick = useCallback(
    (e: { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: unknown }>; lngLat: { lng: number; lat: number } }) => {
      const feature = e.features?.[0];
      if (
        !feature ||
        feature.geometry?.type !== 'Point' ||
        !Array.isArray(feature.geometry.coordinates)
      ) {
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

  return (
    <section className="map-panel panel-card panel-card--map">
      <div className="panel-heading panel-heading--overlay">
        <div>
          <span className="eyebrow">Panneau 3</span>
          <h2>Carte interactive</h2>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            className={mapLayer === 'classic' ? 'chip chip--active' : 'chip'}
            onClick={() => setMapLayer('classic')}
          >
            Plan
          </button>
          <button
            type="button"
            className={mapLayer === 'satellite' ? 'chip chip--active' : 'chip'}
            onClick={() => setMapLayer('satellite')}
          >
            Satellite
          </button>
          <button
            type="button"
            className={mapLayer === 'topo' ? 'chip chip--active' : 'chip'}
            onClick={() => setMapLayer('topo')}
          >
            Topo
          </button>
        </div>
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
          <NavigationControl position="top-right" showCompass={false} />
          <MapMarkerImages markerStyles={markerStyles} />
          <MapDrawControl />
          <Source id={OBJECT_SOURCE_ID} type="geojson" data={geojsonData}>
            <Layer
              id={OBJECT_ICON_LAYER_ID}
              type="symbol"
              layout={{
                'icon-image': ['get', 'markerIcon'],
                'icon-size': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  7,
                  0.55,
                  11,
                  0.72,
                  15,
                  0.92,
                ],
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
                'text-color': '#2b1f18',
                'text-halo-color': '#fffaf4',
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
              <div>
                <strong>{popupState.properties.name}</strong>
                <div>
                  {popupState.properties.address || 'Sans adresse'}
                </div>
                {popupState.properties.price && (
                  <div>{popupState.properties.price}</div>
                )}
                {popupState.properties.rating && (
                  <div>Note: {popupState.properties.rating}</div>
                )}
              </div>
            </Popup>
          )}
        </Map>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { buildMarkerSvg, defaultMarkerStyles, getMarkerImageId, objectTypeOptions, type MarkerStyle } from '../../config/map-markers';
import { env } from '../../lib/env';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { GeoPolygon, MapObject, ObjectTypeCode } from '../../types/domain';
import { buildObjectFeatureCollection, type MapFeatureProperties } from './map-source';

interface MapPanelProps {
  objects: MapObject[];
}

const OBJECT_SOURCE_ID = 'objects-source';
const OBJECT_ICON_LAYER_ID = 'objects-icons';
const OBJECT_LABEL_LAYER_ID = 'objects-labels';

function polygonToBounds(polygon: GeoPolygon): [number, number, number, number] {
  const coords = polygon.coordinates[0] ?? [];
  const lons = coords.map((coord) => coord[0]);
  const lats = coords.map((coord) => coord[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function createPopupContent(properties: MapFeatureProperties): HTMLDivElement {
  const wrapper = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = properties.name;

  const address = document.createElement('div');
  address.textContent = properties.address || 'Sans adresse';
  wrapper.append(title, address);

  if (properties.price) {
    const price = document.createElement('div');
    price.textContent = properties.price;
    wrapper.append(price);
  }

  if (properties.rating) {
    const rating = document.createElement('div');
    rating.textContent = `Note: ${properties.rating}`;
    wrapper.append(rating);
  }

  return wrapper;
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(64, 80);
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossible de charger l icone SVG du marker.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function syncMarkerImages(
  map: maplibregl.Map,
  markerStyles: Record<ObjectTypeCode, MarkerStyle>,
): Promise<void> {
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
}

function ensureObjectLayers(map: maplibregl.Map) {
  if (!map.getSource(OBJECT_SOURCE_ID)) {
    map.addSource(OBJECT_SOURCE_ID, {
      type: 'geojson',
      data: buildObjectFeatureCollection([]),
    });
  }

  if (!map.getLayer(OBJECT_ICON_LAYER_ID)) {
    map.addLayer({
      id: OBJECT_ICON_LAYER_ID,
      type: 'symbol',
      source: OBJECT_SOURCE_ID,
      layout: {
        'icon-image': ['get', 'markerIcon'],
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 0.55,
          11, 0.72,
          15, 0.92,
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
  }

  if (!map.getLayer(OBJECT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: OBJECT_LABEL_LAYER_ID,
      type: 'symbol',
      source: OBJECT_SOURCE_ID,
      minzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 1.8],
        'text-optional': true,
      },
      paint: {
        'text-color': '#2b1f18',
        'text-halo-color': '#fffaf4',
        'text-halo-width': 1.2,
      },
    });
  }
}

function updateObjectSource(map: maplibregl.Map, objects: MapObject[]) {
  ensureObjectLayers(map);
  const source = map.getSource(OBJECT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData(buildObjectFeatureCollection(objects));
}

export function MapPanel({ objects }: MapPanelProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const objectsRef = useRef<MapObject[]>(objects);
  const polygonRef = useRef<GeoPolygon | null>(null);
  const openDrawerRef = useRef<(objectId: string) => void>(() => undefined);
  const markerStylesRef = useRef<Record<ObjectTypeCode, MarkerStyle>>(defaultMarkerStyles);
  const mapLayer = useUiStore((state) => state.mapLayer);
  const markerStyles = useUiStore((state) => state.markerStyles);
  const setMapLayer = useUiStore((state) => state.setMapLayer);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const polygon = useExplorerStore((state) => state.polygon);
  const setPolygon = useExplorerStore((state) => state.setPolygon);
  const resetSpatialFilter = useExplorerStore((state) => state.resetSpatialFilter);

  const markerSignature = useMemo(
    () => objectTypeOptions.map(({ code }) => `${code}:${markerStyles[code].color}:${markerStyles[code].icon}:${markerStyles[code].mode}:${markerStyles[code].customSvg ?? ''}`).join('|'),
    [markerStyles],
  );

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => {
    polygonRef.current = polygon ?? null;
  }, [polygon]);

  useEffect(() => {
    openDrawerRef.current = openDrawer;
  }, [openDrawer]);

  useEffect(() => {
    markerStylesRef.current = markerStyles;
  }, [markerStyles]);

  useEffect(() => {
    if (!mapNodeRef.current) {
      return undefined;
    }

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: env.mapStyles[mapLayer],
      center: [55.536384, -21.130568],
      zoom: 10.2,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    const syncDraw = () => {
      const features = draw.getAll().features;
      const featureGeometry = features[0]?.geometry;
      if (!featureGeometry || featureGeometry.type !== 'Polygon') {
        resetSpatialFilter();
        return;
      }

      const typedPolygon: GeoPolygon = {
        type: 'Polygon',
        coordinates: featureGeometry.coordinates as number[][][],
      };
      setPolygon(typedPolygon, polygonToBounds(typedPolygon));
    };

    const handleFeatureClick = (event: maplibregl.MapMouseEvent & { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: unknown }> }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
        return;
      }

      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const properties = (feature.properties ?? {}) as Partial<MapFeatureProperties>;
      const featureId = typeof properties.id === 'string' ? properties.id : '';

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ offset: 18 })
        .setLngLat([lon, lat])
        .setDOMContent(createPopupContent({
          id: featureId,
          name: properties.name ?? 'Sans nom',
          type: properties.type ?? '',
          address: properties.address ?? 'Sans adresse',
          city: properties.city ?? '',
          price: properties.price ?? '',
          rating: properties.rating ?? '',
          markerIcon: properties.markerIcon ?? '',
        }))
        .addTo(map);

      if (featureId) {
        openDrawerRef.current(featureId);
      }
    };

    const showPointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const hidePointer = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('load', () => {
      void syncMarkerImages(map, markerStylesRef.current).then(() => {
        map.addControl(draw as unknown as maplibregl.IControl, 'top-left');
        drawRef.current = draw;
        updateObjectSource(map, objectsRef.current);

        if (polygonRef.current) {
          draw.deleteAll();
          draw.add({ type: 'Feature', properties: {}, geometry: polygonRef.current });
        }
      });
    });

    (map as unknown as { on: (event: string, cb: () => void) => void }).on('draw.create', syncDraw);
    (map as unknown as { on: (event: string, cb: () => void) => void }).on('draw.update', syncDraw);
    (map as unknown as { on: (event: string, cb: () => void) => void }).on('draw.delete', resetSpatialFilter);
    map.on('click', OBJECT_ICON_LAYER_ID, handleFeatureClick);
    map.on('click', OBJECT_LABEL_LAYER_ID, handleFeatureClick);
    map.on('mouseenter', OBJECT_ICON_LAYER_ID, showPointer);
    map.on('mouseenter', OBJECT_LABEL_LAYER_ID, showPointer);
    map.on('mouseleave', OBJECT_ICON_LAYER_ID, hidePointer);
    map.on('mouseleave', OBJECT_LABEL_LAYER_ID, hidePointer);

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      drawRef.current = null;
      mapRef.current = null;
      map.off('click', OBJECT_ICON_LAYER_ID, handleFeatureClick);
      map.off('click', OBJECT_LABEL_LAYER_ID, handleFeatureClick);
      map.off('mouseenter', OBJECT_ICON_LAYER_ID, showPointer);
      map.off('mouseenter', OBJECT_LABEL_LAYER_ID, showPointer);
      map.off('mouseleave', OBJECT_ICON_LAYER_ID, hidePointer);
      map.off('mouseleave', OBJECT_LABEL_LAYER_ID, hidePointer);
      map.remove();
    };
  }, [mapLayer, resetSpatialFilter, setPolygon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const syncSource = () => {
      updateObjectSource(map, objects);
    };

    if (map.isStyleLoaded()) {
      syncSource();
      return;
    }

    map.once('load', syncSource);
  }, [mapLayer, objects]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    void syncMarkerImages(map, markerStyles);
  }, [markerSignature, markerStyles]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }

    draw.deleteAll();
    if (polygon) {
      draw.add({ type: 'Feature', properties: {}, geometry: polygon });
    }
  }, [polygon]);

  return (
    <section className="map-panel panel-card panel-card--map">
      <div className="panel-heading panel-heading--overlay">
        <div>
          <span className="eyebrow">Panneau 3</span>
          <h2>Carte interactive</h2>
        </div>
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
      <div ref={mapNodeRef} className="map-canvas" />
    </section>
  );
}

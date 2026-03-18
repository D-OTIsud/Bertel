'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { SlidersHorizontal } from 'lucide-react';
import { Layer, Map, Marker, NavigationControl, Popup, Source, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  defaultMarkerStyles,
  getMarkerImageId,
} from '../../config/map-markers';
import { env } from '../../lib/env';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { GeoPolygon, ObjectCard } from '../../types/domain';
import { buildObjectFeatureCollection } from './map-source';
import useSupercluster from 'use-supercluster';
import type { BBox } from 'geojson';
import { normalizeExplorerObjectType } from '../../utils/facets';

const OBJECT_SOURCE_ID = 'objects-source';
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
  const popupHoveredRef = useRef(false);
  const markerHoveredRef = useRef(false);
  const mapRef = useRef<any>(null);
  const [bounds, setBounds] = useState<BBox | null>(null);
  const [zoom, setZoom] = useState<number>(10.2);

  const geojsonData = useMemo(() => buildObjectFeatureCollection(objects), [objects]);
  const mapStyle = env.mapStyles[mapLayer];
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

  const points = useMemo(() => {
    return markerPoints.map((mp) => ({
      type: 'Feature' as const,
      properties: { cluster: false, cardId: mp.card.id, card: mp.card, imageSrc: mp.imageSrc, color: mp.color },
      geometry: { type: 'Point' as const, coordinates: [mp.lon, mp.lat] as [number, number] },
    }));
  }, [markerPoints]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds || undefined,
    zoom,
    options: { radius: 50, maxZoom: 14 },
  });

  const collapseHeader = useCallback(() => {
    setHeaderExpanded(false);
  }, []);
  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const schedulePopupClose = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      // Close only if the mouse is not over marker and not over the tooltip.
      if (popupHoveredRef.current || markerHoveredRef.current) return;
      setHoverPopupState(null);
    }, 300);
  }, [clearHoverTimer]);

  useEffect(
    () => () => {
      clearHoverTimer();
    },
    [clearHoverTimer],
  );

  const handleMarkerEnter = useCallback(
    (card: ObjectCard, lng: number, lat: number) => {
      markerHoveredRef.current = true;
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
    () => {
      markerHoveredRef.current = false;
      schedulePopupClose();
    },
    [schedulePopupClose],
  );

  const handlePopupEnter = useCallback(() => {
    popupHoveredRef.current = true;
    clearHoverTimer();
  }, [clearHoverTimer]);

  const handlePopupLeave = useCallback(() => {
    popupHoveredRef.current = false;
    schedulePopupClose();
  }, [schedulePopupClose]);

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
          ref={mapRef}
          mapStyle={mapStyle}
          initialViewState={{
            longitude: 55.536384,
            latitude: -21.130568,
            zoom: 10.2,
          }}
          attributionControl={false}
          cursor="default"
          onLoad={(e) => {
            const b = e.target.getBounds().toArray().flat() as BBox;
            setBounds(b);
            setZoom(e.target.getZoom());
          }}
          onMove={(e) => {
            const b = e.target.getBounds().toArray().flat() as BBox;
            setBounds(b);
            setZoom(e.viewState.zoom);
          }}
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <MapDrawControl />
          {clusters.map((cluster) => {
            const [longitude, latitude] = cluster.geometry.coordinates;
            const props = cluster.properties as any;
            const isCluster = props.cluster;
            const pointCount = props.point_count;

            if (isCluster) {
              return (
                <Marker key={`cluster-${cluster.id}`} longitude={longitude} latitude={latitude}>
                  <div
                    className="map-cluster-pin"
                    onClick={(e) => {
                      e.stopPropagation();
                      const expansionZoom = Math.min(supercluster?.getClusterExpansionZoom(cluster.id as number) ?? 20, 20);
                      mapRef.current?.easeTo({
                        center: [longitude, latitude],
                        zoom: expansionZoom,
                        duration: 500,
                      });
                    }}
                  >
                    {pointCount}
                  </div>
                </Marker>
              );
            }

            const { card, imageSrc, color } = props;
            return (
              <Marker key={card.id} longitude={longitude} latitude={latitude} anchor="bottom">
                <button
                  type="button"
                  className="map-marker-pin"
                  style={{ backgroundColor: color }}
                  onMouseEnter={() => handleMarkerEnter(card, longitude, latitude)}
                  onMouseLeave={() => handleMarkerLeave()}
                  onClick={() => handleMarkerClick(card.id)}
                  aria-label={`Ouvrir ${card.name}`}
                >
                  <img src={imageSrc} alt={card.name} className="map-marker-pin__img" />
                </button>
              </Marker>
            );
          })}
          <Source id={OBJECT_SOURCE_ID} type="geojson" data={geojsonData}>
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
              <div className="map-hover-card" onMouseEnter={handlePopupEnter} onMouseLeave={handlePopupLeave}>
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


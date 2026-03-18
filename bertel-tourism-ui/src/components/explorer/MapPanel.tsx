'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { SlidersHorizontal } from 'lucide-react';
import { Layer, Map, NavigationControl, Popup, Source, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMarkerImageId, objectTypeOptions } from '../../config/map-markers';
import { env } from '../../lib/env';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { GeoPolygon, ObjectCard } from '../../types/domain';
import { buildObjectFeatureCollection } from './map-source';

const OBJECT_SOURCE_ID = 'objects-source';
const OBJECT_LABEL_LAYER_ID = 'objects-labels';
const COMPACT_EXPLORER_BREAKPOINT = '(max-width: 1180px)';
const MARKER_IMAGE_PREFIX = '/markers/';

const CLUSTER_LAYER_ID = 'clusters';
const CLUSTER_COUNT_LAYER_ID = 'cluster-count';
const UNCLUSTERED_POINT_LAYER_ID = 'unclustered-points';

function MarkerImagesPreloader({ setImagesReady }: { setImagesReady: (ready: boolean) => void }) {
  const { map } = useMap();

  useEffect(() => {
    if (!map) return;

    const imageIds = objectTypeOptions.map((t) => getMarkerImageId(t.code));

    let cancelled = false;

    const loadImageIfMissing = (imageId: string) => {
      if (map.hasImage(imageId)) return Promise.resolve();

      const url = `${MARKER_IMAGE_PREFIX}${imageId}.png`;

      return new Promise<void>((resolve) => {
        // maplibre's loadImage signature is not fully typed via react-map-gl.
        (map as unknown as {
          loadImage: (u: string, cb: (err: unknown, img: unknown) => void) => void;
        }).loadImage(url, (err, img) => {
          if (!err && img && !map.hasImage(imageId)) {
            map.addImage(imageId, img as any, { pixelRatio: 2 });
          }
          resolve();
        });
      });
    };

    const loadAll = async () => {
      if (!map.isStyleLoaded()) return;
      setImagesReady(false);

      for (const imageId of imageIds) {
        // Sequential to avoid bursty parallel loads; only 7 images total.
        // eslint-disable-next-line no-await-in-loop
        await loadImageIfMissing(imageId);
      }

      if (!cancelled) setImagesReady(true);
    };

    loadAll();

    // Reload images after style changes (mapLayer switching).
    const onStyleData = () => loadAll();
    map.on('styledata', onStyleData);

    return () => {
      cancelled = true;
      map.off('styledata', onStyleData);
    };
  }, [map]);

  return null;
}

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
  const setMapLayer = useUiStore((state) => state.setMapLayer);

  const selectCard = useExplorerStore((state) => state.selectCard);
  const clearSelectedCard = useExplorerStore((state) => state.clearSelectedCard);
  const [hoverPopupState, setHoverPopupState] = useState<HoverPopupState | null>(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [mapCursor, setMapCursor] = useState<'default' | 'pointer'>('default');
  const hoverTimerRef = useRef<number | null>(null);
  const popupHoveredRef = useRef(false);
  const markerHoveredRef = useRef(false);
  const autoClearSelectedCardTimerRef = useRef<number | null>(null);
  const isCompactExplorer = useMediaQuery(COMPACT_EXPLORER_BREAKPOINT);
  const hoveredPointIdRef = useRef<string | null>(null);

  const geojsonData = useMemo(() => buildObjectFeatureCollection(objects), [objects]);
  const cardById = useMemo(() => new globalThis.Map(objects.map((card) => [card.id, card] as const)), [objects]);
  const [markerImagesReady, setMarkerImagesReady] = useState(false);
  const mapStyle = env.mapStyles[mapLayer];

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
      if (autoClearSelectedCardTimerRef.current != null) {
        window.clearTimeout(autoClearSelectedCardTimerRef.current);
        autoClearSelectedCardTimerRef.current = null;
      }
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

  const handleMarkerLeave = useCallback(() => {
    markerHoveredRef.current = false;
    schedulePopupClose();
  }, [schedulePopupClose]);

  const handleMarkerClick = useCallback(
    (cardId: string) => {
      clearHoverTimer();
      setHoverPopupState(null);
      selectCard(cardId);
      if (autoClearSelectedCardTimerRef.current != null) {
        window.clearTimeout(autoClearSelectedCardTimerRef.current);
        autoClearSelectedCardTimerRef.current = null;
      }

      // On desktop we want the visual highlight to disappear automatically.
      // On mobile, we keep the bottom sheet open until the user closes it.
      if (!isCompactExplorer) {
        autoClearSelectedCardTimerRef.current = window.setTimeout(() => {
          clearSelectedCard();
        }, 5000);
      }
    },
    [clearHoverTimer, clearSelectedCard, isCompactExplorer, selectCard],
  );
  const handlePopupEnter = useCallback(() => {
    popupHoveredRef.current = true;
    clearHoverTimer();
  }, [clearHoverTimer]);
  const handlePopupLeave = useCallback(() => {
    popupHoveredRef.current = false;
    schedulePopupClose();
  }, [schedulePopupClose]);

  const handleUnclusteredHover = useCallback(
    (feature: any, lng: number, lat: number) => {
      const id = String(feature?.properties?.id ?? '');
      if (!id) return;

      // Avoid resetting the tooltip timer on every mouse move.
      if (hoveredPointIdRef.current === id) return;
      hoveredPointIdRef.current = id;

      const card = cardById.get(id);
      if (!card) return;
      handleMarkerEnter(card, lng, lat);
    },
    [cardById, handleMarkerEnter],
  );

  const handleHoverLeave = useCallback(() => {
    hoveredPointIdRef.current = null;
    setMapCursor('default');
    handleMarkerLeave();
  }, [handleMarkerLeave]);

  const handleMapMove = useCallback(
    (event: any) => {
      const features = event?.features;
      const lng = event?.lngLat?.lng;
      const lat = event?.lngLat?.lat;
      if (typeof lng !== 'number' || typeof lat !== 'number') return;

      const hoveredUnclustered = features?.find((f: any) => f?.layer?.id === UNCLUSTERED_POINT_LAYER_ID);
      const hoveredCluster = features?.find((f: any) => f?.layer?.id === CLUSTER_LAYER_ID || f?.layer?.id === CLUSTER_COUNT_LAYER_ID);

      if (hoveredUnclustered) {
        setMapCursor('pointer');
        handleUnclusteredHover(hoveredUnclustered, lng, lat);
        return;
      }

      if (hoveredCluster) {
        // Cluster hover: just show pointer cursor; no tooltip.
        setMapCursor('pointer');
        if (hoveredPointIdRef.current) {
          hoveredPointIdRef.current = null;
          handleMarkerLeave();
        }
        return;
      }

      // Not over an interactive point.
      if (hoveredPointIdRef.current) {
        handleHoverLeave();
      } else {
        setMapCursor('default');
      }
    },
    [handleHoverLeave, handleMarkerLeave, handleUnclusteredHover],
  );

  const handleMapClick = useCallback(
    (event: any) => {
      const features = event?.features;
      if (!features || features.length === 0) return;

      const clickedFeature = features[0];
      const props = clickedFeature?.properties ?? {};
      const clusterId = props?.cluster_id;
      const pointId = props?.id;

      if (clusterId != null) {
        const map = event.target as any;
        const source = map?.getSource?.(OBJECT_SOURCE_ID) as any;
        if (source?.getClusterExpansionZoom) {
          source.getClusterExpansionZoom(clusterId, (err: unknown, zoom: number) => {
            if (err) return;
            if (typeof zoom !== 'number') return;
            map.easeTo({ center: event.lngLat, zoom });
          });
        }
        return;
      }

      if (pointId != null) {
        handleMarkerClick(String(pointId));
      }
    },
    [handleMarkerClick],
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
          cursor={mapCursor}
          interactiveLayerIds={[CLUSTER_LAYER_ID, CLUSTER_COUNT_LAYER_ID, UNCLUSTERED_POINT_LAYER_ID]}
          onClick={handleMapClick}
          onMouseMove={handleMapMove}
          onMouseLeave={handleHoverLeave}
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <MapDrawControl />
          <MarkerImagesPreloader setImagesReady={setMarkerImagesReady} />
          <Source
            id={OBJECT_SOURCE_ID}
            type="geojson"
            data={geojsonData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer
              id={CLUSTER_LAYER_ID}
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color': '#18313B',
                'circle-stroke-color': '#FFFDF8',
                'circle-stroke-width': 2,
                'circle-radius': [
                  'step',
                  ['coalesce', ['get', 'point_count'], 0],
                  14,
                  10,
                  18,
                  30,
                  22,
                  60,
                  26,
                ],
              }}
            />
            <Layer
              id={CLUSTER_COUNT_LAYER_ID}
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size': 12,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': '#FFFDF8',
                'text-halo-color': '#18313B',
                'text-halo-width': 1,
              }}
            />
            {markerImagesReady ? (
              <Layer
                id={UNCLUSTERED_POINT_LAYER_ID}
                type="symbol"
                filter={['!', ['has', 'point_count']]}
                layout={{
                  'icon-image': ['get', 'markerIcon'],
                  'icon-size': 0.52,
                  'icon-anchor': 'bottom',
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                }}
              />
            ) : null}
            <Layer
              id={OBJECT_LABEL_LAYER_ID}
              type="symbol"
              minzoom={12}
              filter={['!', ['has', 'point_count']]}
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
              anchor="bottom"
              offset={12}
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


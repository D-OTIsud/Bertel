'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowUpRight, LassoSelect, Maximize, MapPin, PanelRightClose } from 'lucide-react';
import { Layer, Map, Marker, NavigationControl, Popup, Source } from 'react-map-gl/maplibre';
import {
  defaultMarkerStyles,
  getMarkerImageId,
} from '../../config/map-markers';
import { getAppMapStyle, MAP_LAYER_OPTIONS } from '../../lib/map-style';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';
import { tagChipStyle } from '../../utils/explorer-card';
import { buildObjectFeatureCollection } from './map-source';
import { buildClusterCompositionGradient, type ClusterTypeCounts } from './cluster-composition';
import useSupercluster from 'use-supercluster';
import type { BBox } from 'geojson';
import {
  EXPLORER_BUCKET_OPTIONS,
  EXPLORER_BUCKET_TYPE_MAP,
  normalizeExplorerObjectType,
} from '../../utils/facets';
import type { BackendObjectTypeCode, ExplorerBucketKey } from '../../types/domain';
import { getObjectIdsInsidePolygon, type LngLatPoint } from '../../utils/explorer-selection';
import { cn } from '@/lib/utils';
import { SelectionBar } from './SelectionBar';
import { MapLegend } from './MapLegend';
import { useItiTracks } from '../../hooks/useItiTracks';
import { buildItiTrackFeatureCollection } from '../../services/iti-tracks';

const OBJECT_SOURCE_ID = 'objects-source';
const OBJECT_LABEL_LAYER_ID = 'objects-labels';
// D18 : tracés ITI — visibles au zoom île par défaut (10.2), masqués très dézoomé.
const ITI_TRACK_SOURCE_ID = 'iti-tracks-source';
const ITI_TRACK_LAYER_ID = 'iti-tracks';
const ITI_TRACK_MIN_ZOOM = 9;
const LASSO_POINT_MIN_DISTANCE = 6;
const DEFAULT_MAP_CENTER: [number, number] = [55.536384, -21.130568];
const DEFAULT_MAP_ZOOM = 10.2;
const SINGLE_POINT_ZOOM = 13;
const MAP_FIT_PADDING = 48;
/** Hover-intent: ignore brief cursor passes over pins (reduces flicker). */
const HOVER_INTENT_DELAY_MS = 250;
/** Once open, keep the pin info popup visible at least this long so the user can reach it. */
const POPUP_MIN_VISIBLE_MS = 3000;
/** After leaving both pin and popup, wait this long before closing (never before min-visible). */
const POPUP_CLOSE_GRACE_MS = 1500;

type ScreenPoint = {
  x: number;
  y: number;
};

function getOverlayPoint(event: ReactPointerEvent<HTMLDivElement>): ScreenPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function toSvgPointString(points: ScreenPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/** Cluster bubble size / shade tiers (Explorer map, supercluster point_count). */
type ClusterDensityTier = 'small' | 'medium' | 'large';

function getClusterDensityTier(pointCount: unknown): ClusterDensityTier {
  const n = Math.max(0, Math.floor(Number(pointCount) || 0));
  if (n >= 25) return 'large';
  if (n >= 10) return 'medium';
  return 'small';
}

/**
 * Agrégation supercluster (impl. 3.3) : chaque feuille sème son archétype, et le
 * reducer fusionne les comptes → chaque cluster porte `typeCounts` (nombre de
 * fiches par type), qui alimente l'anneau de composition (`buildClusterCompositionGradient`).
 * Réf. de module stable ⇒ l'index n'est pas reconstruit à chaque rendu.
 */
const CLUSTER_MAP = (props: { type?: string }): { typeCounts: Record<string, number> } => ({
  typeCounts: { [String(props.type ?? '')]: 1 },
});
const CLUSTER_REDUCE = (
  accumulated: { typeCounts: Record<string, number> },
  props: { typeCounts: Record<string, number> },
): void => {
  for (const key of Object.keys(props.typeCounts)) {
    accumulated.typeCounts[key] = (accumulated.typeCounts[key] ?? 0) + props.typeCounts[key];
  }
};
const CLUSTER_OPTIONS = { radius: 30, maxZoom: 12, map: CLUSTER_MAP, reduce: CLUSTER_REDUCE };

type HoverPopupState = {
  lngLat: [number, number];
  id: string;
  name: string;
  image?: string;
  city?: string;
  typeLabel?: string;
  openNow?: boolean | null;
  chips?: { label: string; color?: string; slug?: string }[];
};

/**
 * Hover chips: the colored §09 tags first (with their global hex), then neutral labels — deduped,
 * capped at 2. Mirrors the result card's color story so the map tells the same story as the list.
 */
function buildHoverChips(card: ObjectCard): { label: string; color?: string; slug?: string }[] {
  const colored = (card.tagChips ?? []).map((chip) => ({ label: chip.label, color: chip.color, slug: chip.slug }));
  const neutral = (Array.isArray(card.labels) ? card.labels : []).map((label) => ({ label }));
  const seen = new Set<string>();
  const out: { label: string; color?: string; slug?: string }[] = [];
  for (const chip of [...colored, ...neutral]) {
    const key = chip.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
    if (out.length >= 2) break;
  }
  return out;
}

/** Resolve a card's display category label (matches the result-card pill). */
function getCategoryLabel(type: string): string {
  const code = normalizeExplorerObjectType(type) as BackendObjectTypeCode;
  for (const [bucket, types] of Object.entries(EXPLORER_BUCKET_TYPE_MAP) as [ExplorerBucketKey, BackendObjectTypeCode[]][]) {
    if (types.includes(code)) {
      const opt = EXPLORER_BUCKET_OPTIONS.find((o) => o.code === bucket);
      if (opt) return opt.label;
    }
  }
  return code;
}

interface MapPanelProps {
  objects: ObjectCard[];
  variant?: 'panel' | 'column';
  /** D16 : rend un bouton « Replier » dans l'en-tête (mode split → vue liste). */
  onCollapse?: () => void;
  /** Actions injectées dans l'en-tête colonne (ex. ExplorerViewSwitch en vue Carte). */
  headerActions?: ReactNode;
}

export function MapPanel({ objects, variant = 'panel', onCollapse, headerActions }: MapPanelProps) {
  const markerStyles = useUiStore((state) => state.markerStyles);
  const openDrawer = useUiStore((state) => state.openDrawer);

  const selectCard = useExplorerStore((state) => state.selectCard);
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectedCardId = useExplorerStore((state) => state.selectedCardId);
  const hoveredCardId = useExplorerStore((state) => state.hoveredCardId);
  const addSelectedObjects = useExplorerStore((state) => state.addSelectedObjects);
  const toggleTag = useExplorerStore((state) => state.toggleTag);
  const [hoverPopupState, setHoverPopupState] = useState<HoverPopupState | null>(null);
  const [lassoArmed, setLassoArmed] = useState(false);
  const [lassoDrawing, setLassoDrawing] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<ScreenPoint[]>([]);
  const [lassoFeedback, setLassoFeedback] = useState<string | null>(null);
  // D18 : tracés ITI — géométries chargées à la demande pour les ITI visibles.
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const itiObjectIds = useMemo(
    () => objects.filter((o) => normalizeExplorerObjectType(o.type) === 'ITI').map((o) => o.id),
    [objects],
  );
  const { tracks: itiTracks } = useItiTracks(itiObjectIds);
  const itiTrackData = useMemo(() => buildItiTrackFeatureCollection(itiTracks), [itiTracks]);
  // Tracé « actif » (survol prioritaire, sinon fiche sélectionnée) : surbrillance + étapes numérotées.
  const activeTrackId = hoveredTrackId ?? (itiTracks.some((t) => t.id === selectedCardId) ? selectedCardId : null);
  const activeTrack = itiTracks.find((t) => t.id === activeTrackId) ?? null;
  const isColumn = variant === 'column';
  const geoZoneCount = useMemo(
    () => objects.filter((o) => typeof o.location?.lat === 'number' && typeof o.location?.lon === 'number').length,
    [objects],
  );
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  /** Popup must not auto-close before this timestamp (ms since epoch). */
  const minVisibleUntilRef = useRef(0);
  const popupContainerRef = useRef<HTMLDivElement | null>(null);
  const popupHoveredRef = useRef(false);
  const markerHoveredRef = useRef(false);
  const lassoPointsRef = useRef<ScreenPoint[]>([]);
  const mapRef = useRef<any>(null);
  const lastFitSignatureRef = useRef<string | null>(null);
  /**
   * Once true, the user owns the camera: auto-fit-on-filter is frozen and the
   * view only changes via explicit gestures or the toolbar "reset zoom" tool.
   * Set on the first real interaction with the map surface (see effect below).
   */
  const hasUserInteractedRef = useRef(false);
  const [bounds, setBounds] = useState<BBox | null>(null);
  const [zoom, setZoom] = useState<number>(DEFAULT_MAP_ZOOM);
  const [mapLoaded, setMapLoaded] = useState(false);

  const geojsonData = useMemo(() => buildObjectFeatureCollection(objects), [objects]);
  // D19 : le fond suit la préférence persistée (ui-store.mapLayer) — l'état existait sans UI.
  const mapLayer = useUiStore((state) => state.mapLayer);
  const setMapLayer = useUiStore((state) => state.setMapLayer);
  const mapStyle = getAppMapStyle(mapLayer);
  const markerPoints = useMemo(
    () =>
      objects.flatMap((card) => {
        const lat = card.location?.lat;
        const lon = card.location?.lon;
        if (lat == null || lon == null) return [];

        const type = normalizeExplorerObjectType(card.type);
        const imageId = getMarkerImageId(type);
        const color = (markerStyles[type] ?? defaultMarkerStyles[type]).color;
        return [{ card, lat, lon, imageSrc: `/markers/${imageId}.png`, color, type }];
      }),
    [markerStyles, objects],
  );

  const points = useMemo(() => {
    return markerPoints.map((mp) => ({
      type: 'Feature' as const,
      properties: { cluster: false, cardId: mp.card.id, card: mp.card, imageSrc: mp.imageSrc, color: mp.color, type: mp.type },
      geometry: { type: 'Point' as const, coordinates: [mp.lon, mp.lat] as [number, number] },
    }));
  }, [markerPoints]);
  const markerCoordinates = useMemo(() => markerPoints.map(({ lon, lat }) => [lon, lat] as const), [markerPoints]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds || undefined,
    zoom,
    options: CLUSTER_OPTIONS,
  });
  const selectedObjectIdSet = useMemo(() => new Set(selectedObjectIds), [selectedObjectIds]);
  const lassoSvgPoints = useMemo(() => toSvgPointString(lassoPoints), [lassoPoints]);

  const resetLassoPath = useCallback(() => {
    lassoPointsRef.current = [];
    setLassoPoints([]);
    setLassoDrawing(false);
  }, []);

  const disableLasso = useCallback(() => {
    setLassoArmed(false);
    resetLassoPath();
  }, [resetLassoPath]);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearPopupTimers = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
  }, [clearOpenTimer, clearCloseTimer]);

  const dismissHoverPopup = useCallback(() => {
    clearPopupTimers();
    minVisibleUntilRef.current = 0;
    setHoverPopupState(null);
  }, [clearPopupTimers]);

  const schedulePopupClose = useCallback(() => {
    clearCloseTimer();
    const untilMin = minVisibleUntilRef.current - Date.now();
    const waitMs = Math.max(POPUP_CLOSE_GRACE_MS, untilMin);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (popupHoveredRef.current || markerHoveredRef.current) return;
      minVisibleUntilRef.current = 0;
      setHoverPopupState(null);
    }, waitMs);
  }, [clearCloseTimer]);

  useEffect(
    () => () => {
      clearPopupTimers();
    },
    [clearPopupTimers],
  );

  /** Close popup immediately on click outside the card and outside any map pin. */
  useEffect(() => {
    if (!hoverPopupState) return undefined;

    const onDocPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupContainerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.map-marker-pin')) return;
      dismissHoverPopup();
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [hoverPopupState, dismissHoverPopup]);

  /** Move the camera to frame the given marker coordinates (single point → centered zoom). */
  const fitToCoordinates = useCallback(
    (coordinates: readonly (readonly [number, number])[]) => {
      if (coordinates.length === 0) {
        return;
      }

      const mapInstance = mapRef.current?.getMap?.() ?? mapRef.current;
      if (!mapInstance) {
        return;
      }

      if (coordinates.length === 1) {
        const [longitude, latitude] = coordinates[0];
        mapInstance.easeTo({
          center: [longitude, latitude],
          zoom: SINGLE_POINT_ZOOM,
          duration: 500,
        });
        return;
      }

      const [minLng, minLat, maxLng, maxLat] = coordinates.reduce(
        (acc, [lon, lat]) => [
          Math.min(acc[0], lon),
          Math.min(acc[1], lat),
          Math.max(acc[2], lon),
          Math.max(acc[3], lat),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
      );

      mapInstance.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: MAP_FIT_PADDING,
          duration: 500,
          maxZoom: SINGLE_POINT_ZOOM,
        },
      );
    },
    [],
  );

  // Auto-fit the camera to the visible markers — but ONLY until the user takes
  // control of the map. On first load (no interaction yet) the view fits the
  // current set, and keeps fitting as data/filters change. Once the user has
  // zoomed/panned (hasUserInteractedRef), filtering must NOT move the camera:
  // they keep their chosen view and re-frame on demand via the toolbar tool.
  useEffect(() => {
    if (!mapLoaded || hasUserInteractedRef.current) {
      return;
    }

    if (markerCoordinates.length === 0) {
      lastFitSignatureRef.current = null;
      return;
    }

    const nextSignature = markerCoordinates.map(([lon, lat]) => `${lon}:${lat}`).join('|');
    if (lastFitSignatureRef.current === nextSignature) {
      return;
    }

    lastFitSignatureRef.current = nextSignature;
    fitToCoordinates(markerCoordinates);
  }, [mapLoaded, markerCoordinates, fitToCoordinates]);

  // Freeze auto-fit on the first genuine interaction with the map surface.
  // Capture-phase native listeners catch every camera-affecting gesture —
  // drag/click (pointerdown), scroll & pinch zoom (wheel/pointerdown),
  // NavigationControl +/- and cluster drill-in (bubble through the container),
  // and keyboard pan/zoom — regardless of React's synthetic stopPropagation.
  useEffect(() => {
    if (!mapLoaded) {
      return undefined;
    }

    const mapInstance = mapRef.current?.getMap?.() ?? mapRef.current;
    const container: HTMLElement | undefined = mapInstance?.getContainer?.();
    if (!container) {
      return undefined;
    }

    const markInteracted = () => {
      hasUserInteractedRef.current = true;
    };
    const passiveCapture: AddEventListenerOptions = { capture: true, passive: true };
    const capture: AddEventListenerOptions = { capture: true };
    container.addEventListener('pointerdown', markInteracted, passiveCapture);
    container.addEventListener('wheel', markInteracted, passiveCapture);
    container.addEventListener('keydown', markInteracted, capture);

    return () => {
      container.removeEventListener('pointerdown', markInteracted, passiveCapture);
      container.removeEventListener('wheel', markInteracted, passiveCapture);
      container.removeEventListener('keydown', markInteracted, capture);
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!lassoFeedback) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setLassoFeedback(null);
    }, 3600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [lassoFeedback]);

  const handleMarkerEnter = useCallback(
    (card: ObjectCard, lng: number, lat: number) => {
      markerHoveredRef.current = true;
      // D20 : survol croisé — la carte-résultat correspondante se surligne dans la liste.
      useExplorerStore.getState().setHoveredCard(card.id);
      clearCloseTimer();
      clearOpenTimer();
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        minVisibleUntilRef.current = Date.now() + POPUP_MIN_VISIBLE_MS;
        setHoverPopupState({
          id: card.id,
          name: card.name,
          image: card.image ?? undefined,
          city: card.location?.city ?? undefined,
          typeLabel: getCategoryLabel(card.type),
          openNow: card.open_now ?? null,
          chips: buildHoverChips(card),
          lngLat: [lng, lat],
        });
      }, HOVER_INTENT_DELAY_MS);
    },
    [clearCloseTimer, clearOpenTimer],
  );

  const handleMarkerLeave = useCallback(() => {
    markerHoveredRef.current = false;
    useExplorerStore.getState().setHoveredCard(null);
    clearOpenTimer();
    schedulePopupClose();
  }, [clearOpenTimer, schedulePopupClose]);

  const handlePopupEnter = useCallback(() => {
    popupHoveredRef.current = true;
    clearCloseTimer();
  }, [clearCloseTimer]);

  const handlePopupLeave = useCallback(() => {
    popupHoveredRef.current = false;
    schedulePopupClose();
  }, [schedulePopupClose]);

  const handleMarkerClick = useCallback(
    (cardId: string) => {
      dismissHoverPopup();
      selectCard(cardId);
    },
    [dismissHoverPopup, selectCard],
  );

  const handlePopupClick = useCallback(
    (cardId: string) => {
      dismissHoverPopup();
      openDrawer(cardId);
    },
    [dismissHoverPopup, openDrawer],
  );

  const appendLassoPoint = useCallback((point: ScreenPoint) => {
    const lastPoint = lassoPointsRef.current[lassoPointsRef.current.length - 1];
    if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < LASSO_POINT_MIN_DISTANCE) {
      return;
    }

    const nextPoints = [...lassoPointsRef.current, point];
    lassoPointsRef.current = nextPoints;
    setLassoPoints(nextPoints);
  }, []);

  const finishLassoSelection = useCallback(() => {
    const drawnPoints = lassoPointsRef.current;

    if (drawnPoints.length < 3) {
      setLassoFeedback('Tracez une zone plus large pour lancer une selection.');
      disableLasso();
      return;
    }

    const polygon = drawnPoints.flatMap((point) => {
      const lngLat = mapRef.current?.unproject?.([point.x, point.y]) ?? mapRef.current?.getMap?.()?.unproject?.([point.x, point.y]);

      if (!lngLat) {
        return [];
      }

      return [[lngLat.lng, lngLat.lat] as LngLatPoint];
    });

    if (polygon.length < 3) {
      setLassoFeedback('La zone n a pas pu etre lue sur la carte.');
      disableLasso();
      return;
    }

    const matchingIds = getObjectIdsInsidePolygon(objects, polygon);
    if (matchingIds.length === 0) {
      setLassoFeedback('Aucun marqueur dans cette zone.');
      disableLasso();
      return;
    }

    const alreadySelected = new Set(selectedObjectIds);
    const addedCount = matchingIds.filter((id) => !alreadySelected.has(id)).length;
    addSelectedObjects(matchingIds);
    setLassoFeedback(
      addedCount > 0
        ? `${addedCount} marqueur${addedCount > 1 ? 's' : ''} ajoute${addedCount > 1 ? 's' : ''} a la selection.`
        : 'Ces marqueurs sont deja dans la selection.',
    );
    disableLasso();
  }, [addSelectedObjects, disableLasso, objects, selectedObjectIds]);

  const handleToggleLasso = useCallback(() => {
    dismissHoverPopup();
    setLassoFeedback(null);

    if (lassoArmed) {
      disableLasso();
      return;
    }

    resetLassoPath();
    setLassoArmed(true);
  }, [disableLasso, dismissHoverPopup, lassoArmed, resetLassoPath]);

  const handleLassoPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!lassoArmed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dismissHoverPopup();
      setLassoDrawing(true);
      setLassoFeedback(null);
      lassoPointsRef.current = [];
      setLassoPoints([]);
      appendLassoPoint(getOverlayPoint(event));
    },
    [appendLassoPoint, dismissHoverPopup, lassoArmed],
  );

  const handleLassoPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!lassoDrawing) {
        return;
      }

      event.preventDefault();
      appendLassoPoint(getOverlayPoint(event));
    },
    [appendLassoPoint, lassoDrawing],
  );

  const handleLassoPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!lassoDrawing) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      appendLassoPoint(getOverlayPoint(event));

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      finishLassoSelection();
    },
    [appendLassoPoint, finishLassoSelection, lassoDrawing],
  );

  const handleLassoPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!lassoDrawing) {
        return;
      }

      event.preventDefault();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setLassoFeedback('Selection par zone annulee.');
      disableLasso();
    },
    [disableLasso, lassoDrawing],
  );

  const handleResetZoom = useCallback(() => {
    dismissHoverPopup();
    fitToCoordinates(markerCoordinates);
  }, [dismissHoverPopup, fitToCoordinates, markerCoordinates]);

  const resetZoomLabel = 'Réinitialiser le zoom (voir tous les objets)';
  const hasGeolocatedObjects = markerCoordinates.length > 0;
  const resetZoomButton = (
    <button
      type="button"
      className="map-panel__tool-button"
      onClick={handleResetZoom}
      title={resetZoomLabel}
      aria-label={resetZoomLabel}
      disabled={!hasGeolocatedObjects}
    >
      <Maximize className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  const lassoTooltip = lassoArmed ? 'Annuler la selection par lasso' : 'Selection par lasso';
  const lassoButton = (
    <button
      type="button"
      className={cn('map-panel__tool-button', lassoArmed && 'map-panel__tool-button--active')}
      onClick={handleToggleLasso}
      title={lassoTooltip}
      aria-label={lassoTooltip}
      aria-pressed={lassoArmed}
    >
      <LassoSelect className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  return (
    <section
      className={cn(
        'map-panel flex min-h-0 min-w-0 flex-col',
        isColumn ? 'map-panel--column relative flex-1 overflow-hidden border-l border-line bg-surface' : 'panel-card panel-card--map',
      )}
    >
      {isColumn ? (
        <div className="relative flex h-14 flex-none items-center border-b border-line bg-surface px-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[13px] font-bold tracking-tight text-ink">Carte</span>
            {/* D19 : divulgation honnête — seules les fiches géolocalisées sont épinglées. */}
            <span
              className="font-sans text-xs font-medium text-ink-3"
              title="Les fiches sans coordonnées n'apparaissent pas sur la carte (badge « non localisé » dans la liste)."
            >
              {geoZoneCount} localisée{geoZoneCount > 1 ? 's' : ''}
            </span>
          </div>
          <div
            className="map-panel__toolbar absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            role="toolbar"
            aria-label="Outils carte"
          >
            {resetZoomButton}
            {lassoButton}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* D19 : sélecteur de fond visible (l'état mapLayer existait sans UI). */}
            <div className="view-switch" role="group" aria-label="Fond de carte">
              {MAP_LAYER_OPTIONS.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  className={cn('view-switch__btn', mapLayer === mode && 'is-on')}
                  aria-pressed={mapLayer === mode}
                  onClick={() => setMapLayer(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            {onCollapse ? (
              <button
                type="button"
                className="ghost-button results-table__tool"
                title="Replier la carte (vue liste pleine largeur)"
                onClick={onCollapse}
              >
                <PanelRightClose size={13} aria-hidden />
                Replier
              </button>
            ) : null}
            {headerActions}
          </div>
        </div>
      ) : null}
      {!isColumn ? (
        <div className="map-panel__header-actions-wrap">
          <div className="map-panel__toolbar" role="toolbar" aria-label="Outils carte">
            {resetZoomButton}
            {lassoButton}
          </div>
        </div>
      ) : null}

      {/* D19 (WCAG 1.1.1) : région nommée — role=region (PAS img : la carte contient des
          contrôles interactifs qu'un role=img aplatirait) ; la liste est l'équivalent accessible. */}
      <div
        className={cn('map-canvas', isColumn && 'min-h-0 flex-1')}
        role="region"
        aria-label="Carte interactive des résultats — la liste des résultats en est l'équivalent accessible"
      >
        <Map
          ref={mapRef}
          mapStyle={mapStyle}
          initialViewState={{
            longitude: DEFAULT_MAP_CENTER[0],
            latitude: DEFAULT_MAP_CENTER[1],
            zoom: DEFAULT_MAP_ZOOM,
          }}
          attributionControl={false}
          cursor={lassoArmed ? 'crosshair' : hoveredTrackId ? 'pointer' : 'default'}
          interactiveLayerIds={itiTrackData.features.length > 0 ? [ITI_TRACK_LAYER_ID] : undefined}
          onMouseMove={(e) => {
            // D18 : survol d'un tracé ITI → surbrillance (les marqueurs restent des éléments DOM).
            const feature = e.features?.[0];
            const id = feature ? String(feature.properties?.id ?? '') : '';
            setHoveredTrackId(id || null);
          }}
          onMouseOut={() => setHoveredTrackId(null)}
          onClick={(e) => {
            const feature = e.features?.[0];
            const id = feature ? String(feature.properties?.id ?? '') : '';
            if (id) {
              selectCard(id);
              openDrawer(id);
            }
          }}
          onLoad={(e) => {
            setMapLoaded(true);
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
          <NavigationControl position="top-right" showCompass={false} />
          {/* D18 : tracés des itinéraires — casing blanc + ligne couleur ITI (celle des pins),
              tracé actif (survol/sélection) plus épais et opaque. */}
          {itiTrackData.features.length > 0 ? (
            <Source id={ITI_TRACK_SOURCE_ID} type="geojson" data={itiTrackData}>
              <Layer
                id={`${ITI_TRACK_LAYER_ID}-casing`}
                type="line"
                minzoom={ITI_TRACK_MIN_ZOOM}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': 0.75 }}
              />
              <Layer
                id={ITI_TRACK_LAYER_ID}
                type="line"
                minzoom={ITI_TRACK_MIN_ZOOM}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': markerStyles.ITI?.color ?? defaultMarkerStyles.ITI.color,
                  'line-width': ['case', ['==', ['get', 'id'], activeTrackId ?? ''], 4.5, 3],
                  'line-opacity': ['case', ['==', ['get', 'id'], activeTrackId ?? ''], 1, 0.8],
                }}
              />
            </Source>
          ) : null}
          {/* Étapes numérotées du tracé actif (§111 : lng/lat émis par le RPC). */}
          {activeTrack?.stages.map((stage) => (
            <Marker
              key={`iti-stage-${activeTrack.id}-${stage.position}`}
              longitude={stage.lng}
              latitude={stage.lat}
              anchor="center"
            >
              <span className="iti-stage-pin" title={stage.name || `Étape ${stage.position}`}>
                {stage.position}
              </span>
            </Marker>
          ))}
          {clusters.map((cluster) => {
            const [longitude, latitude] = cluster.geometry.coordinates;
            const props = cluster.properties as any;
            const isCluster = props.cluster;
            const pointCount = props.point_count;

            if (isCluster) {
              const densityTier = getClusterDensityTier(pointCount);
              // Anneau de composition (impl. 3.3) : secteurs proportionnels aux types
              // groupés (agrégés dans `typeCounts`). `null` ⇒ repli couleur pleine via CSS.
              const gradient = buildClusterCompositionGradient((props.typeCounts as ClusterTypeCounts) ?? {});
              return (
                <Marker key={`cluster-${cluster.id}`} longitude={longitude} latitude={latitude}>
                  <div
                    className={cn('map-cluster-pin', `map-cluster-pin--density-${densityTier}`)}
                    style={gradient ? { background: gradient } : undefined}
                    aria-label={`Groupe de ${pointCount} fiches — cliquer pour agrandir`}
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
                    <span className="map-cluster-pin__count">{pointCount}</span>
                  </div>
                </Marker>
              );
            }

            const { card, imageSrc } = props;
            return (
              <Marker key={card.id} longitude={longitude} latitude={latitude} anchor="bottom">
                <button
                  type="button"
                  className={cn(
                    'map-marker-pin',
                    selectedObjectIdSet.has(card.id) && 'map-marker-pin--selected',
                    hoveredCardId === card.id && 'map-marker-pin--hovered',
                  )}
                  onPointerEnter={() => handleMarkerEnter(card, longitude, latitude)}
                  onPointerLeave={() => handleMarkerLeave()}
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
              onClose={dismissHoverPopup}
              offset={18}
              closeButton={false}
              closeOnClick={false}
              className="map-hover-popup"
            >
              <div
                ref={popupContainerRef}
                className="map-hover-card-wrap"
                onPointerEnter={handlePopupEnter}
                onPointerLeave={handlePopupLeave}
              >
                <button
                  type="button"
                  className="map-hover-card map-hover-card--button"
                  onClick={() => handlePopupClick(hoverPopupState.id)}
                  aria-label={`Ouvrir la fiche ${hoverPopupState.name}`}
                >
                  <span className="map-hover-card__media">
                    {hoverPopupState.image ? (
                      <img className="map-hover-card__img" src={hoverPopupState.image} alt="" />
                    ) : null}
                    {hoverPopupState.openNow != null ? (
                      <span
                        className={cn(
                          'map-hover-card__status',
                          hoverPopupState.openNow
                            ? 'map-hover-card__status--open'
                            : 'map-hover-card__status--closed',
                        )}
                      >
                        <span className="map-hover-card__dot" aria-hidden="true" />
                        {hoverPopupState.openNow ? 'Ouvert' : 'Ferme'}
                      </span>
                    ) : null}
                  </span>
                  <span className="map-hover-card__body">
                    <strong className="map-hover-card__name">{hoverPopupState.name}</strong>
                    {(hoverPopupState.city || hoverPopupState.typeLabel) ? (
                      <span className="map-hover-card__meta">
                        {hoverPopupState.city ? (
                          <span className="map-hover-card__city">
                            <MapPin className="map-hover-card__city-icon" aria-hidden="true" />
                            {hoverPopupState.city}
                          </span>
                        ) : null}
                        {hoverPopupState.city && hoverPopupState.typeLabel ? (
                          <span className="map-hover-card__sep" aria-hidden="true">·</span>
                        ) : null}
                        {hoverPopupState.typeLabel ? (
                          <span className="map-hover-card__type">{hoverPopupState.typeLabel}</span>
                        ) : null}
                      </span>
                    ) : null}
                    {hoverPopupState.chips && hoverPopupState.chips.length > 0 ? (
                      <span className="map-hover-card__tags">
                        {hoverPopupState.chips.map((chip) => {
                          // A colored §09 tag with a slug → click filters the Explorer. The popup is
                          // itself a <button>, so this is a role=button <span> (nested <button> is
                          // invalid) with stopPropagation so it doesn't open the drawer.
                          if (chip.slug && chip.color) {
                            const slug = chip.slug;
                            const color = chip.color;
                            const filterByTag = () => toggleTag({ slug, name: chip.label, color });
                            return (
                              <span
                                key={chip.label}
                                role="button"
                                tabIndex={0}
                                className="map-hover-card__tag"
                                style={{ ...tagChipStyle(color), cursor: 'pointer' }}
                                title={`Filtrer par le tag ${chip.label}`}
                                aria-label={`Filtrer par le tag ${chip.label}`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  filterByTag();
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    filterByTag();
                                  }
                                }}
                              >
                                {chip.label}
                              </span>
                            );
                          }
                          return (
                            <span
                              key={chip.label}
                              className="map-hover-card__tag"
                              style={chip.color ? tagChipStyle(chip.color) : undefined}
                            >
                              {chip.label}
                            </span>
                          );
                        })}
                      </span>
                    ) : null}
                    <span className="map-hover-card__cta">
                      Ouvrir la fiche
                      <ArrowUpRight className="map-hover-card__cta-icon" aria-hidden="true" />
                    </span>
                  </span>
                </button>
              </div>
            </Popup>
          )}
        </Map>
        <MapLegend />
        {lassoArmed ? (
          <div
            className="map-panel__lasso-overlay"
            onPointerDown={handleLassoPointerDown}
            onPointerMove={handleLassoPointerMove}
            onPointerUp={handleLassoPointerUp}
            onPointerCancel={handleLassoPointerCancel}
          >
            <svg className="map-panel__lasso-svg" aria-hidden="true">
              {lassoPoints.length > 2 ? <polygon className="map-panel__lasso-fill" points={lassoSvgPoints} /> : null}
              {lassoPoints.length > 1 ? <polyline className="map-panel__lasso-line" points={lassoSvgPoints} /> : null}
            </svg>
          </div>
        ) : null}
        {lassoArmed || lassoFeedback ? (
          <div className="map-panel__lasso-toast" role="status">
            {lassoArmed
              ? lassoDrawing
                ? 'Relachez pour selectionner'
                : 'Tracez une zone sur la carte'
              : lassoFeedback}
          </div>
        ) : null}
        <SelectionBar />
      </div>
    </section>
  );
}


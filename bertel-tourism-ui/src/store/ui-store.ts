import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { coerceMarkerStyles, defaultMarkerStyles, normalizeMarkerIcon, sanitizeCustomMarkerSvg, sanitizeMarkerColor, type MarkerStyle } from '../config/map-markers';
import type { MapLayerMode, NetworkStatus, ObjectTypeCode, PresenceMember } from '../types/domain';

interface UiState {
  drawerObjectId: string | null;
  mapLayer: MapLayerMode;
  networkStatus: NetworkStatus;
  liveMembers: PresenceMember[];
  markerStyles: Record<ObjectTypeCode, MarkerStyle>;
  /** D24 : palette de commandes ⌘K (état de session, non persisté). */
  commandPaletteOpen: boolean;
  /** D12 : tiroir de navigation mobile (bouton Menu de la TopBar). */
  mobileNavOpen: boolean;
  openDrawer: (objectId: string) => void;
  closeDrawer: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setMapLayer: (layer: MapLayerMode) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  setLivePresence: (members: PresenceMember[]) => void;
  setMarkerStyles: (styles: unknown) => void;
  setMarkerColor: (type: ObjectTypeCode, color: string) => void;
  setMarkerIcon: (type: ObjectTypeCode, icon: string) => void;
  setMarkerMode: (type: ObjectTypeCode, mode: 'preset' | 'custom') => void;
  setCustomMarkerSvg: (type: ObjectTypeCode, svg: string) => void;
  clearCustomMarkerSvg: (type: ObjectTypeCode) => void;
  resetMarkerStyles: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      drawerObjectId: null,
      mapLayer: 'satellite',
      networkStatus: 'connected',
      liveMembers: [],
      markerStyles: defaultMarkerStyles,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      openDrawer: (objectId) => set({ drawerObjectId: objectId }),
      closeDrawer: () => set({ drawerObjectId: null }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setMapLayer: (layer) => set({ mapLayer: layer }),
      setNetworkStatus: (status) => set({ networkStatus: status }),
      setLivePresence: (members) => set({ liveMembers: members }),
      setMarkerStyles: (styles) => set({ markerStyles: coerceMarkerStyles(styles) }),
      setMarkerColor: (type, color) =>
        set((state) => ({
          markerStyles: {
            ...state.markerStyles,
            [type]: {
              ...state.markerStyles[type],
              color: sanitizeMarkerColor(color, defaultMarkerStyles[type].color),
            },
          },
        })),
      setMarkerIcon: (type, icon) =>
        set((state) => ({
          markerStyles: {
            ...state.markerStyles,
            [type]: {
              ...state.markerStyles[type],
              icon: normalizeMarkerIcon(icon, defaultMarkerStyles[type].icon),
              mode: state.markerStyles[type].mode === 'custom' && state.markerStyles[type].customSvg ? 'custom' : 'preset',
            },
          },
        })),
      setMarkerMode: (type, mode) =>
        set((state) => ({
          markerStyles: {
            ...state.markerStyles,
            [type]: {
              ...state.markerStyles[type],
              mode: mode === 'custom' && state.markerStyles[type].customSvg ? 'custom' : 'preset',
            },
          },
        })),
      setCustomMarkerSvg: (type, svg) => {
        const sanitized = sanitizeCustomMarkerSvg(svg);
        if (!sanitized) {
          return;
        }

        set((state) => ({
          markerStyles: {
            ...state.markerStyles,
            [type]: {
              ...state.markerStyles[type],
              customSvg: sanitized,
              mode: 'custom',
            },
          },
        }));
      },
      clearCustomMarkerSvg: (type) =>
        set((state) => ({
          markerStyles: {
            ...state.markerStyles,
            [type]: {
              ...state.markerStyles[type],
              customSvg: null,
              mode: 'preset',
            },
          },
        })),
      resetMarkerStyles: () => set({ markerStyles: defaultMarkerStyles }),
    }),
    {
      name: 'bertel-ui-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        mapLayer: state.mapLayer,
        markerStyles: state.markerStyles,
      }),
      merge: (persisted, current) => {
        const persistedState = (persisted as Partial<UiState> | undefined) ?? {};
        return {
          ...current,
          ...persistedState,
          markerStyles: coerceMarkerStyles(persistedState.markerStyles),
        };
      },
    },
  ),
);

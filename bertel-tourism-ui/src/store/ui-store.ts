import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { coerceMarkerStyles, defaultMarkerStyles, normalizeMarkerIcon, sanitizeCustomMarkerSvg, sanitizeMarkerColor, type MarkerStyle } from '../config/map-markers';
import type { MapLayerMode, NetworkStatus, ObjectTypeCode } from '../types/domain';

export type FooterActionMode = 'default' | 'explorer' | 'drawer';

interface UiState {
  drawerObjectId: string | null;
  mapLayer: MapLayerMode;
  networkStatus: NetworkStatus;
  liveUsersCount: number;
  footerActionMode: FooterActionMode;
  markerStyles: Record<ObjectTypeCode, MarkerStyle>;
  openDrawer: (objectId: string) => void;
  closeDrawer: () => void;
  setMapLayer: (layer: MapLayerMode) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  setLiveUsersCount: (count: number) => void;
  setFooterActionMode: (mode: FooterActionMode) => void;
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
      mapLayer: 'classic',
      networkStatus: 'connected',
      liveUsersCount: 3,
      footerActionMode: 'default',
      markerStyles: defaultMarkerStyles,
      openDrawer: (objectId) => set({ drawerObjectId: objectId }),
      closeDrawer: () => set({ drawerObjectId: null }),
      setMapLayer: (layer) => set({ mapLayer: layer }),
      setNetworkStatus: (status) => set({ networkStatus: status }),
      setLiveUsersCount: (count) => set({ liveUsersCount: count }),
      setFooterActionMode: (mode) => set((state) => (state.footerActionMode === mode ? state : { footerActionMode: mode })),
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

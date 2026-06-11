import { create } from 'zustand';
import type { DashboardFilters, DashboardTabKey } from '../types/dashboard';

interface DashboardFilterState {
  filters: DashboardFilters;
  /** Onglet actif — survit à resetFilters (le reset porte sur les filtres, pas la navigation). */
  activeTab: DashboardTabKey;
  sidebarCollapsed: boolean;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
  setActiveTab: (tab: DashboardTabKey) => void;
  toggleSidebar: () => void;
}

const DEFAULT_FILTERS: DashboardFilters = { status: ['published'] };

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  activeTab: 'quality',
  sidebarCollapsed: false,
  setFilters: (patch) =>
    set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

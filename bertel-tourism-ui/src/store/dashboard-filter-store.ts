import { create } from 'zustand';
import type { DashboardFilters } from '../types/dashboard';

interface DashboardFilterState {
  filters: DashboardFilters;
  sidebarCollapsed: boolean;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
  toggleSidebar: () => void;
}

const DEFAULT_FILTERS: DashboardFilters = { status: ['published'] };

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  sidebarCollapsed: false,
  setFilters: (patch) =>
    set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

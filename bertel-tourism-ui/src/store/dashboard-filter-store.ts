import { create } from 'zustand';
import type { DashboardFilters } from '../types/dashboard';

interface DashboardFilterState {
  filters: DashboardFilters;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: DashboardFilters = { status: ['published'] };

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilters: (patch) =>
    set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));

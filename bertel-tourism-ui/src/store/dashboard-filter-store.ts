import { create } from 'zustand';
import type { DashboardTabKey } from '../types/dashboard';

interface DashboardFilterState {
  /** Période (updated_at) — UNIQUE filtre propre au Dashboard (les autres = instance Explorer). */
  updatedAtFrom: string | null;
  updatedAtTo: string | null;
  activeTab: DashboardTabKey;
  setPeriod: (from: string | null, to: string | null) => void;
  clearPeriod: () => void;
  setActiveTab: (tab: DashboardTabKey) => void;
}

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  updatedAtFrom: null,
  updatedAtTo: null,
  activeTab: 'quality',
  setPeriod: (from, to) => set({ updatedAtFrom: from, updatedAtTo: to }),
  clearPeriod: () => set({ updatedAtFrom: null, updatedAtTo: null }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

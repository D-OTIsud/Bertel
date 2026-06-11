import { useDashboardFilterStore } from './dashboard-filter-store';

describe('dashboard-filter-store — onglets', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({
      filters: { status: ['published'] },
      activeTab: 'quality',
      sidebarCollapsed: false,
    });
  });

  it("démarre sur l'onglet Qualité", () => {
    expect(useDashboardFilterStore.getState().activeTab).toBe('quality');
  });

  it("change d'onglet via setActiveTab", () => {
    useDashboardFilterStore.getState().setActiveTab('offer');
    expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
  });

  it("resetFilters ne touche pas l'onglet actif", () => {
    useDashboardFilterStore.getState().setActiveTab('activity');
    useDashboardFilterStore.getState().setFilters({ types: ['HOT'] });
    useDashboardFilterStore.getState().resetFilters();
    expect(useDashboardFilterStore.getState().activeTab).toBe('activity');
    expect(useDashboardFilterStore.getState().filters).toEqual({ status: ['published'] });
  });
});

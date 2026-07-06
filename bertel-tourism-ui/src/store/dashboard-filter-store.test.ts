import { useDashboardFilterStore } from './dashboard-filter-store';

beforeEach(() => useDashboardFilterStore.getState().clearPeriod());

it('setPeriod / clearPeriod', () => {
  useDashboardFilterStore.getState().setPeriod('2026-01-01', '2026-02-01');
  expect(useDashboardFilterStore.getState().updatedAtFrom).toBe('2026-01-01');
  expect(useDashboardFilterStore.getState().updatedAtTo).toBe('2026-02-01');
  useDashboardFilterStore.getState().clearPeriod();
  expect(useDashboardFilterStore.getState().updatedAtFrom).toBeNull();
});

it('activeTab par défaut = quality et est modifiable', () => {
  expect(useDashboardFilterStore.getState().activeTab).toBe('quality');
  useDashboardFilterStore.getState().setActiveTab('offer');
  expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
});

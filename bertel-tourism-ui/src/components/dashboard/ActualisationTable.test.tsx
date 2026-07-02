import { render, screen, fireEvent } from '@testing-library/react';
import { ActualisationTable } from './ActualisationTable';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

const data = {
  threshold_days: 90,
  rows: [
    { type: 'HOT' as const, total: 10, up_to_date: 7, to_review: 2, stale: 1, rate: 70, weekly_rates: null },
  ],
};

describe('ActualisationTable — drill-down', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality', sidebarCollapsed: false });
  });

  it('clic sur la cellule type filtre sur ce type', () => {
    render(<ActualisationTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hôtel' }));
    expect(useDashboardFilterStore.getState().filters.types).toEqual(['HOT']);
  });

  it('re-clic retire le type (toggle off)', () => {
    useDashboardFilterStore.setState({ filters: { status: ['published'], types: ['HOT'] }, activeTab: 'quality', sidebarCollapsed: false });
    render(<ActualisationTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hôtel' }));
    expect(useDashboardFilterStore.getState().filters.types).toBeUndefined();
  });
});

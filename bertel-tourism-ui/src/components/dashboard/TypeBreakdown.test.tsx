import { render, screen, fireEvent } from '@testing-library/react';
import { TypeBreakdown } from './TypeBreakdown';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

const data = {
  total: 10,
  rows: [
    { type: 'HOT' as const, count: 6, published: 5, draft: 1, archived: 0, pct_of_total: 60 },
    { type: 'RES' as const, count: 4, published: 4, draft: 0, archived: 0, pct_of_total: 40 },
  ],
};

describe('TypeBreakdown — drill-down', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality', sidebarCollapsed: false });
  });

  it('clic sur une ligne ajoute le type au filtre (toggle on)', () => {
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Hotel/ }));
    expect(useDashboardFilterStore.getState().filters.types).toEqual(['HOT']);
  });

  it('re-clic retire le type (toggle off)', () => {
    useDashboardFilterStore.setState({ filters: { status: ['published'], types: ['HOT'] }, activeTab: 'quality', sidebarCollapsed: false });
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Hotel/ }));
    expect(useDashboardFilterStore.getState().filters.types).toBeUndefined();
  });
});

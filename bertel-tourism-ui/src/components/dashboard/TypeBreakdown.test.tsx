import { render, screen, fireEvent } from '@testing-library/react';
import { TypeBreakdown } from './TypeBreakdown';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

// HOT → archétype Hébergement, RES → archétype Restaurant : la barre replie les
// types DB sur leurs archétypes ; le drill-down (dé)sélectionne les types de la famille.
const data = {
  total: 10,
  rows: [
    { type: 'HOT' as const, count: 6, published: 5, draft: 1, archived: 0, pct_of_total: 60 },
    { type: 'RES' as const, count: 4, published: 4, draft: 0, archived: 0, pct_of_total: 40 },
  ],
};

describe('TypeBreakdown — barre empilée par archétype', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality', sidebarCollapsed: false });
  });

  it('rend une légende par archétype (libellés FR, pas de codes)', () => {
    render(<TypeBreakdown data={data} />);
    expect(screen.getByRole('button', { name: /Hébergement/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restaurant/ })).toBeInTheDocument();
  });

  it('clic sur une famille ajoute ses types au filtre (toggle on)', () => {
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Hébergement/ }));
    expect(useDashboardFilterStore.getState().filters.types).toEqual(['HOT']);
  });

  it('re-clic retire la famille (toggle off)', () => {
    useDashboardFilterStore.setState({ filters: { status: ['published'], types: ['HOT'] }, activeTab: 'quality', sidebarCollapsed: false });
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Hébergement/ }));
    expect(useDashboardFilterStore.getState().filters.types).toBeUndefined();
  });
});

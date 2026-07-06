import { render, screen, fireEvent, act } from '@testing-library/react';
import { TypeBreakdown } from './TypeBreakdown';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { activeDrilldownTypes } from '../../lib/dashboard-type-drilldown';

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
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('rend une légende par archétype (libellés FR, pas de codes)', () => {
    render(<TypeBreakdown data={data} />);
    expect(screen.getByRole('button', { name: /Hébergement/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restaurant/ })).toBeInTheDocument();
  });

  it('clic sur une famille ajoute ses types au filtre (toggle on)', () => {
    render(<TypeBreakdown data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Hébergement/ }));
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).toContain('HOT');
  });

  it('re-clic retire la famille (toggle off)', () => {
    render(<TypeBreakdown data={data} />);
    const btn = screen.getByRole('button', { name: /Hébergement/ });
    fireEvent.click(btn); // on
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).toContain('HOT');
    fireEvent.click(btn); // off
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).not.toContain('HOT');
  });
});

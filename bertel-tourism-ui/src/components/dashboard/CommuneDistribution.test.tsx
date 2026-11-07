import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommuneDistribution } from './CommuneDistribution';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import type { DashboardCityDistribution } from '../../types/dashboard';

const data: DashboardCityDistribution = {
  rows: [
    { city: 'Le Tampon', count: 5, delta_30d: 1 },
    { city: 'Entre-Deux', count: 3, delta_30d: 0 },
  ],
};

describe('CommuneDistribution — drill-down', () => {
  beforeEach(() => {
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('clic sur une commune l’ajoute à common.cities', () => {
    render(<CommuneDistribution data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Le Tampon/ }));
    expect(useDashboardExplorerStore.getState().common.cities).toEqual(['Le Tampon']);
  });

  it('re-clic retire la commune', () => {
    render(<CommuneDistribution data={data} />);
    const btn = screen.getByRole('button', { name: /Le Tampon/ });
    fireEvent.click(btn); // on
    expect(useDashboardExplorerStore.getState().common.cities).toEqual(['Le Tampon']);
    fireEvent.click(btn); // off
    expect(useDashboardExplorerStore.getState().common.cities).toEqual([]);
  });

  it('« Autres » n’est pas filtrable', () => {
    render(<CommuneDistribution data={data} />);
    expect(screen.getByRole('button', { name: /Autres/ })).toBeDisabled();
  });
});

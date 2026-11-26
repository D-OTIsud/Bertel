import { render, screen, act, fireEvent } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { dashboardStatsParams } from '../../lib/dashboard-stats-params';

function resetDash() {
  act(() => useDashboardExplorerStore.getState().resetAll());
}

describe('FiltersPanel — instance Dashboard', () => {
  beforeEach(resetDash);

  it('lit/écrit le store passé en prop (indépendant du singleton)', () => {
    act(() => useDashboardExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel useStore={useDashboardExplorerStore} typeSpecificFacets />);
    // La section type-spécifique Hébergements est visible en mono-bucket.
    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
  });

  it('masque les sections spécifiques par type quand typeSpecificFacets=false', () => {
    act(() => useDashboardExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel useStore={useDashboardExplorerStore} typeSpecificFacets={false} />);
    expect(screen.queryByText("Type d'hébergement")).not.toBeInTheDocument();
  });

  it('ne filtre aucun statut au départ et permet de retirer la dernière sélection', () => {
    act(() => useSessionStore.setState({ canEditObjects: true }));
    render(<FiltersPanel useStore={useDashboardExplorerStore} contextPage="dashboard" />);
    expect(screen.getByRole('button', { name: 'Publié' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Brouillon' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Hors ligne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archivé' })).not.toBeInTheDocument();
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['published', 'draft']);
    fireEvent.click(screen.getByRole('button', { name: 'Brouillon' }));
    expect(useDashboardExplorerStore.getState().common.statuses).toEqual(['draft']);
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['draft']);
    fireEvent.click(screen.getByRole('button', { name: 'Brouillon' }));
    expect(useDashboardExplorerStore.getState().common.statuses).toEqual([]);
    expect(screen.getByRole('button', { name: 'Brouillon' })).toHaveAttribute('aria-pressed', 'false');
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['published', 'draft']);
    fireEvent.click(screen.getByRole('button', { name: 'Publié' }));
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(useDashboardExplorerStore.getState().common.statuses).toEqual([]);
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['published', 'draft']);
  });
});

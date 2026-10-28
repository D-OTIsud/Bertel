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

  it('part du défaut Publié puis stocke explicitement Publié+Brouillon', () => {
    act(() => useSessionStore.setState({ canEditObjects: true }));
    render(<FiltersPanel useStore={useDashboardExplorerStore} includeArchivedStatus={false} contextPage="dashboard" />);
    expect(screen.getByRole('button', { name: 'Publié' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Brouillon' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Brouillon' }));
    expect(useDashboardExplorerStore.getState().common.statuses).toEqual(['published', 'draft']);
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['published', 'draft']);
    fireEvent.click(screen.getByRole('button', { name: 'Publié' }));
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['draft']);
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_status).toEqual(['published']);
  });
});

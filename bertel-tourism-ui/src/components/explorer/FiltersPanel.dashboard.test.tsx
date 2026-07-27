import { render, screen, act } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';
import { useDashboardExplorerStore } from '../../store/explorer-store';

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
});

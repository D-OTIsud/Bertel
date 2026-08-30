import { render, screen, act } from '@testing-library/react';
import { ExplorerActiveFilters } from './ExplorerActiveFilters';
import { useDashboardExplorerStore, useExplorerStore } from '../../store/explorer-store';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('ExplorerActiveFilters — pont dashboard', () => {
  beforeEach(() => {
    act(() => useDashboardExplorerStore.getState().resetAll());
    act(() => useExplorerStore.getState().resetAll());
  });

  it('sur le dashboard, la barre reste rendue même sans aucune puce', () => {
    render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} showExplorerBridge />);
    expect(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ })).toBeInTheDocument();
  });

  it('dans l’Explorateur, la barre se masque toujours quand il n’y a aucune puce', () => {
    const { container } = render(<ExplorerActiveFilters />);
    expect(container).toBeEmptyDOMElement();
  });
});

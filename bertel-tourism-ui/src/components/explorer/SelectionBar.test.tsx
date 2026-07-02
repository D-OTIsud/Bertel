import { render, screen } from '@testing-library/react';
import { SelectionBar } from './SelectionBar';
import { useExplorerStore } from '../../store/explorer-store';

// La barre importe le routeur App Router et les services (chaîne supabase) : on les
// neutralise — ce test ne couvre que le rendu adaptatif de la barre.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/lists', () => ({ createListFromSelection: jest.fn() }));
jest.mock('@/services/selection-export', () => ({ exportSelectedObjectsCsv: jest.fn() }));
jest.mock('../../services/rpc', () => ({ getObjectResource: jest.fn() }));

describe('SelectionBar — barre adaptative', () => {
  beforeEach(() => {
    useExplorerStore.setState({ selectedObjectIds: [], visibleObjectIds: [] });
  });

  it('sans sélection : seuls le compteur et « Sélection » existent (pas de CTA qui déborde)', () => {
    render(<SelectionBar />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sélection/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer une liste/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Imprimer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Vider/ })).toBeNull();
  });

  it('avec sélection : les actions apparaissent, « Créer une liste » compris', () => {
    useExplorerStore.setState({ selectedObjectIds: ['obj-1', 'obj-2'] });
    render(<SelectionBar />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Imprimer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vider/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Créer une liste/ })).toBeInTheDocument();
  });
});

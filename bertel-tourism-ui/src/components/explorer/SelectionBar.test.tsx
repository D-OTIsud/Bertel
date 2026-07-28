import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionBar } from './SelectionBar';
import { MAX_PRINT_SELECTION } from './selection-print';
import { getObjectResource } from '../../services/rpc';
import { useExplorerStore } from '../../store/explorer-store';

// La barre importe le routeur App Router et les services (chaîne supabase) : on les
// neutralise — ce test ne couvre que le rendu adaptatif de la barre.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/lists', () => ({ createListFromSelection: jest.fn() }));
jest.mock('@/services/selection-export', () => ({ exportSelectedObjectsCsv: jest.fn() }));
jest.mock('../../services/rpc', () => ({ getObjectResource: jest.fn() }));

describe('SelectionBar — barre adaptative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  // Le plafond protège la préparation (une ressource complète chargée PAR fiche) : au-delà,
  // le bouton est désactivé AVEC sa raison et aucun chargement n'est lancé.
  it(`au-delà de ${MAX_PRINT_SELECTION} fiches : « Imprimer » désactivé avec sa raison, aucun chargement`, async () => {
    const ids = Array.from({ length: MAX_PRINT_SELECTION + 1 }, (_, index) => `obj-${index}`);
    useExplorerStore.setState({ selectedObjectIds: ids });
    render(<SelectionBar />);

    const print = screen.getByRole('button', { name: new RegExp(`Imprimer \\(max ${MAX_PRINT_SELECTION}\\)`) });
    expect(print).toBeDisabled();
    expect(print).toHaveAttribute('title', expect.stringContaining(`${MAX_PRINT_SELECTION} fiches`));

    await userEvent.click(print);
    expect(getObjectResource).not.toHaveBeenCalled();
    // Les autres actions restent disponibles — le plafond ne vise QUE l'impression.
    expect(screen.getByRole('button', { name: /Créer une liste/ })).toBeEnabled();
  });

  it(`exactement ${MAX_PRINT_SELECTION} fiches : « Imprimer » reste disponible (le plafond est inclusif)`, () => {
    const ids = Array.from({ length: MAX_PRINT_SELECTION }, (_, index) => `obj-${index}`);
    useExplorerStore.setState({ selectedObjectIds: ids });
    render(<SelectionBar />);

    expect(screen.getByRole('button', { name: /^Imprimer$/ })).toBeEnabled();
  });
});

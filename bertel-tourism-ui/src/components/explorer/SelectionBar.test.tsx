import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionBar } from './SelectionBar';
import { MAX_PRINT_SELECTION } from './selection-print';
import { getObjectResource } from '../../services/rpc';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';

// La barre importe le routeur App Router et les services (chaîne supabase) : on les
// neutralise — ce test ne couvre que le rendu adaptatif de la barre.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/lists', () => ({ createListFromSelection: jest.fn() }));
jest.mock('../../services/rpc', () => ({ getObjectResource: jest.fn() }));
jest.mock('@/features/explorer/export/ExportExcelModal', () => ({
  ExportExcelModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Exporter en Excel" /> : null,
}));

describe('SelectionBar — barre adaptative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExplorerStore.setState({ selectedObjectIds: [], visibleObjectIds: [] });
    useSessionStore.setState({ canEditObjects: true, role: 'super_admin' });
  });

  it('sans sélection : seuls le compteur et « Sélection » existent (pas de CTA qui déborde)', () => {
    render(<SelectionBar />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sélection/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer une liste/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Imprimer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Excel/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Vider/ })).toBeNull();
  });

  it('avec sélection : les actions apparaissent, « Créer une liste » compris', () => {
    useExplorerStore.setState({ selectedObjectIds: ['obj-1', 'obj-2'] });
    render(<SelectionBar />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Imprimer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vider/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Créer une liste/ })).toBeInTheDocument();
  });

  it('« Excel » ouvre la modale de sélection de colonnes', async () => {
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    await userEvent.click(screen.getByRole('button', { name: /Excel/ }));
    expect(screen.getByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
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

  it('un éditeur avec sélection voit le bouton E-mails', () => {
    useSessionStore.setState({ canEditObjects: true });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.getByRole('button', { name: /E-mails/ })).toBeInTheDocument();
  });

  it('un lecteur seul ne voit PAS le bouton E-mails, même avec une sélection', () => {
    useSessionStore.setState({ canEditObjects: false });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.queryByRole('button', { name: /E-mails/ })).toBeNull();
  });
});

// 17l — « Créer une liste » est réservé au superuser plateforme : `api.create_list` rend 42501
// pour tout le monde d'autre. Le bouton doit DISPARAÎTRE, pas échouer après le clic.
describe('SelectionBar — création de liste réservée au superuser (17l)', () => {
  it('un membre ordinaire ne voit pas « Créer une liste », mais garde les autres actions', () => {
    useSessionStore.setState({ canEditObjects: true, role: 'tourism_agent' });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1', 'obj-2'] });
    render(<SelectionBar />);
    expect(screen.queryByRole('button', { name: /Créer une liste/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Imprimer/ })).toBeInTheDocument();
  });

  it('un superuser plateforme le voit', () => {
    useSessionStore.setState({ canEditObjects: true, role: 'super_admin' });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.getByRole('button', { name: /Créer une liste/ })).toBeInTheDocument();
  });
});

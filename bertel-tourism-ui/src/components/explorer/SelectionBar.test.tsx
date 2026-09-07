import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { SelectionBar } from './SelectionBar';
import { MAX_PRINT_SELECTION } from './selection-print';
import { getObjectResource } from '../../services/rpc';
import { createListFromSelection } from '@/services/lists';
import { queryClient } from '@/app/query-client';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';

// La barre importe le routeur App Router et les services (chaîne supabase) : on les
// neutralise — ce test ne couvre que le rendu adaptatif de la barre.
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  createListFromSelection: jest.fn(),
}));
jest.mock('../../services/rpc', () => ({ getObjectResource: jest.fn() }));
jest.mock('@/features/explorer/export/ExportExcelModal', () => ({
  ExportExcelModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Exporter en Excel" /> : null,
}));

describe('SelectionBar — barre adaptative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExplorerStore.setState({ selectedObjectIds: [], visibleObjectIds: [] });
    useSessionStore.setState({ canEditObjects: true, role: 'super_admin', orgId: 'org-1' });
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

// Listes 2026-09-07 règle 1 — création ouverte à tout membre connecté d'une organisation, y
// compris un lecteur ; seule l'absence d'organisation active masque le bouton (ex-garde 17l
// superuser-only, retirée).
describe('SelectionBar — création de liste ouverte à tout membre d’une organisation', () => {
  it('un lecteur ordinaire voit « Créer une liste » dès qu’il a une organisation active', () => {
    useSessionStore.setState({ canEditObjects: false, role: 'tourism_agent', orgId: 'org-1' });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1', 'obj-2'] });
    render(<SelectionBar />);
    expect(screen.getByRole('button', { name: /Créer une liste/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Imprimer/ })).toBeInTheDocument();
  });

  it('un superuser plateforme le voit aussi', () => {
    useSessionStore.setState({ canEditObjects: true, role: 'super_admin', orgId: 'org-1' });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.getByRole('button', { name: /Créer une liste/ })).toBeInTheDocument();
  });

  it('sans organisation active, le bouton disparaît', () => {
    useSessionStore.setState({ canEditObjects: false, role: 'tourism_agent', orgId: null });
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    expect(screen.queryByRole('button', { name: /Créer une liste/ })).not.toBeInTheDocument();
  });
});

// Revue finale (§listes 2026-09-07) — handleCreateList n'avait aucun catch : un échec restait
// une rejection non gérée, sans retour visible pour l'utilisateur.
describe('SelectionBar — création de liste : erreurs et invalidation (revue finale)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'], visibleObjectIds: [] });
    useSessionStore.setState({ canEditObjects: true, role: 'tourism_agent', orgId: 'org-1', userId: 'user-1' });
  });

  it('un échec de création affiche un message visible (toast), pas de crash silencieux', async () => {
    jest.mocked(createListFromSelection).mockRejectedValue(new Error('réseau indisponible'));
    const errorSpy = jest.spyOn(toast, 'error').mockImplementation(() => '');
    render(<SelectionBar />);

    await userEvent.click(screen.getByRole('button', { name: /Créer une liste/ }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('réseau indisponible'));
    expect(push).not.toHaveBeenCalled();
  });

  it('une création réussie invalide la grille « mes listes » avant de naviguer', async () => {
    jest.mocked(createListFromSelection).mockResolvedValue('new-list-id');
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    render(<SelectionBar />);

    await userEvent.click(screen.getByRole('button', { name: /Créer une liste/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/listes/new-list-id'));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['my-lists', 'org-1', 'user-1'] }),
    );
    invalidateSpy.mockRestore();
  });
});

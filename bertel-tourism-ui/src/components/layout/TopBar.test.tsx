// TopBar — le champ de recherche change de CIBLE selon la page (PO 2026-07-27).
// L'enjeu du test : les deux recherches (Explorer / CRM) ne doivent JAMAIS se contaminer.
// Écrire la recherche CRM dans le store Explorer casserait la conservation de la recherche
// Explorer au retour sur l'Explorer.
import type { ReactNode } from 'react';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopBar } from './TopBar';
import { useExplorerStore } from '../../store/explorer-store';
import { useCrmSearchStore } from '../../store/crm-search-store';
import { useUiStore } from '../../store/ui-store';
import { searchObjectsByName } from '../../services/name-search';

const pathnameMock = jest.fn<string, []>();
jest.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));
// Le bouton « Créer une fiche » sonde les permissions (réseau) : hors sujet ici.
jest.mock('../../features/object-editor/create/CreateObjectButton', () => ({
  CreateObjectButton: () => null,
}));
jest.mock('./LivePresenceIndicator', () => ({ LivePresenceIndicator: () => null }));
// Le menu de concordances (spec 2026-08-26) interroge le serveur : on borne au service.
jest.mock('../../services/name-search', () => ({
  ...jest.requireActual('../../services/name-search'),
  searchObjectsByName: jest.fn().mockResolvedValue([]),
}));

const searchObjectsByNameMock = searchObjectsByName as jest.MockedFunction<typeof searchObjectsByName>;

// Depuis la spec 2026-08-26 la TopBar consomme un hook TanStack Query (les concordances
// directes) : sans Provider elle ne monte plus du tout.
function render(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  searchObjectsByNameMock.mockResolvedValue([]);
  useCrmSearchStore.setState({ search: '' });
  useExplorerStore.getState().setSearch('');
  useUiStore.getState().closeDrawer();
});

describe('TopBar — cible du champ de recherche', () => {
  it('sur /crm : la frappe alimente la recherche CRM et NE touche PAS celle de l’Explorer', () => {
    pathnameMock.mockReturnValue('/crm');
    render(<TopBar />);

    fireEvent.change(screen.getByLabelText('Rechercher un acteur'), { target: { value: 'hoareau' } });

    expect(useCrmSearchStore.getState().search).toBe('hoareau');
    expect(useExplorerStore.getState().common.search).toBe('');
  });

  it('hors /crm : la frappe alimente l’Explorer et NE touche PAS la recherche CRM', () => {
    pathnameMock.mockReturnValue('/explorer');
    render(<TopBar />);

    fireEvent.change(screen.getByLabelText('Rechercher une fiche'), { target: { value: 'cilaos' } });

    expect(useExplorerStore.getState().common.search).toBe('cilaos');
    expect(useCrmSearchStore.getState().search).toBe('');
  });

  it('affiche un placeholder qui annonce le périmètre réel de la recherche acteurs', () => {
    pathnameMock.mockReturnValue('/crm');
    render(<TopBar />);
    const input = screen.getByLabelText('Rechercher un acteur');
    expect(input).toHaveAttribute(
      'placeholder',
      'Rechercher un acteur : nom, prénom, établissement, téléphone, e-mail…',
    );
  });

  it('rend la valeur du store correspondant à la page (pas celle de l’autre)', () => {
    useCrmSearchStore.setState({ search: 'payet' });
    useExplorerStore.getState().setSearch('saint-pierre');

    pathnameMock.mockReturnValue('/crm');
    const { unmount } = render(<TopBar />);
    expect(screen.getByLabelText('Rechercher un acteur')).toHaveValue('payet');
    unmount();

    pathnameMock.mockReturnValue('/dashboard');
    render(<TopBar />);
    expect(screen.getByLabelText('Rechercher une fiche')).toHaveValue('saint-pierre');
  });
});

// Concordances directes (spec 2026-08-26) — l'enjeu : choisir une fiche est de la
// NAVIGATION. Elle ne doit RIEN changer aux filtres, sans quoi l'utilisateur perdrait
// la recherche en cours en cliquant sur une suggestion.
describe('TopBar — menu de concordances directes', () => {
  const match = {
    id: 'HLORUN00000001CA',
    name: 'Le Jardin Créole',
    type: 'HLO',
    status: 'published',
    city: 'Saint-Joseph',
    imageUrl: null,
  };

  it('sur l’Explorer : choisir une concordance ouvre la fiche SANS toucher aux filtres', async () => {
    searchObjectsByNameMock.mockResolvedValue([match]);
    pathnameMock.mockReturnValue('/explorer');
    useExplorerStore.getState().setSearch('le jardin');
    render(<TopBar />);

    fireEvent.focus(screen.getByLabelText('Rechercher une fiche'));
    const option = await screen.findByRole('option', { name: /Le Jardin Créole/ });
    fireEvent.mouseDown(option);

    expect(useUiStore.getState().drawerObjectId).toBe('HLORUN00000001CA');
    // Le terme de recherche est INCHANGÉ : les filtres n'ont pas bougé.
    expect(useExplorerStore.getState().common.search).toBe('le jardin');
  });

  it('sur l’Explorer : le champ annonce la combobox aux lecteurs d’écran', async () => {
    searchObjectsByNameMock.mockResolvedValue([match]);
    pathnameMock.mockReturnValue('/explorer');
    useExplorerStore.getState().setSearch('le jardin');
    render(<TopBar />);

    const input = screen.getByLabelText('Rechercher une fiche');
    expect(input).toHaveAttribute('role', 'combobox');
    fireEvent.focus(input);
    await screen.findByRole('option', { name: /Le Jardin Créole/ });
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('sur /crm : aucun menu de concordances, et le service n’est jamais appelé', () => {
    searchObjectsByNameMock.mockResolvedValue([match]);
    pathnameMock.mockReturnValue('/crm');
    useCrmSearchStore.setState({ search: 'hoareau' });
    render(<TopBar />);

    fireEvent.focus(screen.getByLabelText('Rechercher un acteur'));

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByLabelText('Rechercher un acteur')).not.toHaveAttribute('role', 'combobox');
    expect(searchObjectsByNameMock).not.toHaveBeenCalled();
  });
});

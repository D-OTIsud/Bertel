// TopBar — le champ de recherche change de CIBLE selon la page (PO 2026-07-27).
// L'enjeu du test : les deux recherches (Explorer / CRM) ne doivent JAMAIS se contaminer.
// Écrire la recherche CRM dans le store Explorer casserait la conservation de la recherche
// Explorer au retour sur l'Explorer.
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from './TopBar';
import { useExplorerStore } from '../../store/explorer-store';
import { useCrmSearchStore } from '../../store/crm-search-store';

const pathnameMock = jest.fn<string, []>();
jest.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));
// Le bouton « Créer une fiche » sonde les permissions (réseau) : hors sujet ici.
jest.mock('../../features/object-editor/create/CreateObjectButton', () => ({
  CreateObjectButton: () => null,
}));
jest.mock('./LivePresenceIndicator', () => ({ LivePresenceIndicator: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  useCrmSearchStore.setState({ search: '' });
  useExplorerStore.getState().setSearch('');
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

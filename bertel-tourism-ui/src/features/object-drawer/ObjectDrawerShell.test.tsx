import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ObjectDrawerShell } from './ObjectDrawerShell';
import { useSessionStore } from '../../store/session-store';

// Le tiroir est en LECTURE SEULE : il ne doit consommer que le chargeur léger
// (1 RPC), jamais le chargeur d'espace de travail (~85 requêtes) qui n'existe
// que pour peupler les sélecteurs de l'éditeur. Cette garde échoue si quelqu'un
// re-branche le tiroir sur useObjectWorkspaceQuery.
const detailSpy = jest.fn();
const workspaceSpy = jest.fn();
const prefetchWorkspaceSpy = jest.fn();

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectDetailQuery: (objectId: string | null) => {
    detailSpy(objectId);
    return {
      data: { id: 'RESRUN0000000001', name: 'Chez Testeur', type: 'RES', raw: {} },
      isError: false,
      error: null,
      isLoading: false,
    };
  },
  useObjectWorkspaceQuery: (objectId: string | null) => {
    workspaceSpy(objectId);
    return { data: undefined, isError: false, error: null, isLoading: true };
  },
  usePrefetchObjectWorkspace: () => prefetchWorkspaceSpy,
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [] }),
}));

const mockPrefetch = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: (...args: unknown[]) => mockPrefetch(...args) }),
}));

jest.mock('./ObjectDetailView', () => ({
  ObjectDetailView: ({ data }: { data: { name: string } }) => (
    <div data-testid="detail-view">{data.name}</div>
  ),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ObjectDrawerShell', () => {
  beforeEach(() => {
    detailSpy.mockClear();
    workspaceSpy.mockClear();
    mockPrefetch.mockClear();
    prefetchWorkspaceSpy.mockClear();
    // `canEditObjects` gate le prechargement ET le bouton « Modifier ».
    useSessionStore.setState({ role: 'tourism_agent', canEditObjects: true });
  });

  test('consomme le chargeur léger et jamais le chargeur d espace de travail', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(detailSpy).toHaveBeenCalledWith('RESRUN0000000001');
    expect(workspaceSpy).not.toHaveBeenCalled();
  });

  test('affiche le nom et le type de la fiche depuis le payload léger', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Chez Testeur' })).toBeInTheDocument();
    expect(screen.getByTestId('detail-view')).toHaveTextContent('Chez Testeur');
  });

  test('precharge la route editeur a l ouverture du tiroir', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(mockPrefetch).toHaveBeenCalledWith('/objects/RESRUN0000000001/edit');
  });

  test('ne precharge les DONNEES de l editeur qu au survol de « Modifier »', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    // Le simple affichage du tiroir ne doit PAS declencher le chargeur lourd :
    // sinon toutes les fiches consultees paieraient les ~85 requetes.
    expect(prefetchWorkspaceSpy).not.toHaveBeenCalled();

    fireEvent.mouseEnter(screen.getByRole('button', { name: /modifier/i }));

    expect(prefetchWorkspaceSpy).toHaveBeenCalledWith('RESRUN0000000001');
  });

  test('un membre en lecture seule ne voit pas Modifier et ne declenche aucun prechargement', () => {
    // canEditObjects=false = membre d ORG sans droit d edition. `role !== null`
    // ne le distinguait PAS d un editeur : il voyait le bouton et aurait paye le
    // prechargement d un editeur qu il ne peut pas utiliser.
    useSessionStore.setState({ role: 'tourism_agent', canEditObjects: false });

    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(mockPrefetch).not.toHaveBeenCalled();
    expect(prefetchWorkspaceSpy).not.toHaveBeenCalled();
  });
});

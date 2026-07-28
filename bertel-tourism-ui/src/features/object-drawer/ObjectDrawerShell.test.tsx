import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ObjectDrawerShell } from './ObjectDrawerShell';

// Le tiroir est en LECTURE SEULE : il ne doit consommer que le chargeur léger
// (1 RPC), jamais le chargeur d'espace de travail (~85 requêtes) qui n'existe
// que pour peupler les sélecteurs de l'éditeur. Cette garde échoue si quelqu'un
// re-branche le tiroir sur useObjectWorkspaceQuery.
const detailSpy = jest.fn();
const workspaceSpy = jest.fn();

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
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [] }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
});

import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectDrawer } from './ObjectDrawer';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

const mockPush = jest.fn();
const mockUseObjectDetailQuery = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: jest.fn() }),
}));

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectDetailQuery: (...args: unknown[]) => mockUseObjectDetailQuery(...args),
  usePrefetchObjectWorkspace: () => jest.fn(),
  useLocationReferenceOptionsQuery: () => ({ data: {}, isLoading: false, isError: false, error: null }),
  useSaveObjectWorkspaceModuleMutation: () => ({ mutateAsync: jest.fn() }),
  usePublishObjectWorkspaceMutation: () => ({ mutateAsync: jest.fn() }),
  useAddObjectPrivateNoteMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateObjectPrivateNoteMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteObjectPrivateNoteMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useObjectPrivateNoteWriteAccessQuery: () => ({ data: true, isSuccess: true, isError: false }),
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: [],
    me: { userId: 'me', name: 'Me', avatar: 'ME', color: '#000' },
    lockedFields: {},
    typingUsers: [],
    lockField: jest.fn(),
    unlockField: jest.fn(),
    announceTyping: jest.fn(),
  }),
}));

// Le tiroir est view-only : il ne consomme que le payload de la fiche
// (useObjectDetailQuery). Le decor workspace (modules / permissions) a ete
// retire avec la bascule — il ne decrivait plus rien de ce que le composant lit.
function buildObjectDetail(params: { id: string; name: string; type?: string; description?: string }) {
  return {
    id: params.id,
    name: params.name,
    type: params.type ?? 'HOT',
    raw: {
      description: params.description ?? '',
      status: 'published',
    },
  };
}

describe('ObjectDrawer view-only shell', () => {
  beforeEach(() => {
    mockPush.mockReset();
    useUiStore.setState({ drawerObjectId: 'obj-1' });
    useObjectDrawerStore.setState({ dirtyObjects: {} });
    useSessionStore.setState({ role: 'tourism_agent', status: 'ready' });
    mockUseObjectDetailQuery.mockReset();
  });

  it('shows a loading skeleton instead of the object technical id while fetching', () => {
    mockUseObjectDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="LOIRUN000000000W" />);

    expect(screen.getByTestId('drawer-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('LOIRUN000000000W')).not.toBeInTheDocument();
  });

  it('renders the detail preview when the workspace is loaded', () => {
    mockUseObjectDetailQuery.mockReturnValue({
      data: buildObjectDetail({ id: 'obj-1', name: 'Hotel A', description: 'Vue mer' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);

    expect(screen.getAllByRole('heading', { name: 'Hotel A' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Vue mer')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /navigation workspace objet/i })).not.toBeInTheDocument();
  });

  it('navigates to the full-page editor when Modifier is clicked', () => {
    mockUseObjectDetailQuery.mockReturnValue({
      data: buildObjectDetail({ id: 'obj-1', name: 'Hotel A' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));

    expect(mockPush).toHaveBeenCalledWith('/objects/obj-1/edit');
  });

  it('PLAN 6 : rend le panneau ORG (pas d’éditeur, renvoi vers /team) pour une ORG', () => {
    mockUseObjectDetailQuery.mockReturnValue({
      data: buildObjectDetail({ id: 'org-1', name: 'OTI du Sud', type: 'ORG' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="org-1" />);

    // Panneau ORG explicite au lieu de la fiche touristique.
    expect(screen.getByText(/administration des équipes/i)).toBeInTheDocument();
    // Le bouton « Modifier » (éditeur d'objet) est masqué pour une ORG, même éditeur autorisé.
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    // « Ouvrir l'administration » ferme le drawer puis navigue vers /team.
    fireEvent.click(screen.getByRole('button', { name: /ouvrir l.administration/i }));
    expect(mockPush).toHaveBeenCalledWith('/team');
  });
});

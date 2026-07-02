// Modal « Partager par lien » (ListComposeView) : le clic ouvre un modal avec le lien à
// copier ; un lien déjà actif n'est PLUS désactivé par le clic (régression du toggle
// surprise) — la désactivation est un bouton explicite dans le modal.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { getList, shareList, type ObjectListDetail } from '@/services/lists';

jest.mock('@/services/lists', () => ({
  getList: jest.fn(),
  shareList: jest.fn(),
  updateList: jest.fn(),
  setListItems: jest.fn(),
  deleteList: jest.fn(),
  sendListByEmail: jest.fn(),
  moveListItem: jest.fn((arr: unknown[]) => arr),
}));

jest.mock('@/features/object-editor/useObjectSearch', () => ({
  useObjectSearch: () => ({ results: [], loading: false }),
}));

jest.mock('@/store/session-store', () => ({
  useSessionStore: (selector: (state: { userName: string }) => unknown) => selector({ userName: 'Conseiller' }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Aperçu brandé hors sujet ici (et lourd) : rendus neutres.
jest.mock('@/features/lists/OtiTemplate', () => ({
  __esModule: true,
  default: () => <div data-testid="oti-template" />,
  itemsToOtiPois: () => [],
}));
jest.mock('@/features/lists/ChannelFrame', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const baseDetail: ObjectListDetail = {
  id: 'list-1',
  kind: 'dynamic',
  name: 'Ma sélection',
  nameEn: null,
  recipientLabel: null,
  introFr: null,
  introEn: null,
  template: 'carnet',
  accent: 'teal',
  lang: 'fr',
  coverUrl: null,
  showMap: false,
  status: 'draft',
  filters: null,
  filtersUrl: null,
  shareToken: null,
  shareEnabled: false,
  shareExpiresAt: null,
  updatedAt: null,
  resolvedFrom: 'filters',
  items: [],
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListComposeView listId="list-1" />
    </QueryClientProvider>,
  );
}

describe('ListComposeView — modal « Partager par lien »', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('active le partage et ouvre le modal avec le lien à copier', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail);
    jest.mocked(shareList).mockResolvedValue({
      shareToken: 'tok123',
      shareUrlPath: '/l/tok123',
      shareEnabled: true,
      shareExpiresAt: null,
    });
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /partager par lien/i }));

    await waitFor(() => expect(shareList).toHaveBeenCalledWith('list-1', true));
    const dialog = await screen.findByRole('dialog', { name: /partager par lien/i });
    expect(await within(dialog).findByText('http://localhost/l/tok123')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /copier/i })).toBeInTheDocument();
  });

  it("n'éteint plus un lien déjà actif : le clic rouvre le modal sans muter", async () => {
    jest.mocked(getList).mockResolvedValue({ ...baseDetail, shareEnabled: true, shareToken: 'tok123' });
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /lien actif/i }));

    const dialog = await screen.findByRole('dialog', { name: /partager par lien/i });
    expect(within(dialog).getByText('http://localhost/l/tok123')).toBeInTheDocument();
    expect(shareList).not.toHaveBeenCalled();
  });

  it('désactive le lien via le bouton explicite du modal', async () => {
    jest.mocked(getList).mockResolvedValue({ ...baseDetail, shareEnabled: true, shareToken: 'tok123' });
    jest.mocked(shareList).mockResolvedValue({
      shareToken: null,
      shareUrlPath: null,
      shareEnabled: false,
      shareExpiresAt: null,
    });
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /lien actif/i }));
    const dialog = await screen.findByRole('dialog', { name: /partager par lien/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /désactiver le lien/i }));

    await waitFor(() => expect(shareList).toHaveBeenCalledWith('list-1', false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

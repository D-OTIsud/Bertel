// Revue finale (§listes 2026-09-07) — la palette « Ajouter un lieu » ne doit proposer que des
// fiches PUBLIÉES (la base rejette désormais un brouillon), et la réconciliation post-envoi doit
// distinguer un id ENVOYÉ mais rejeté (à retirer + signaler) d'un ajout local survenu APRÈS le
// snapshot envoyé (à conserver) — pas seulement le cas idéal où tout est accepté.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { getList, setListItems, type ObjectListDetail, type ObjectListItem } from '@/services/lists';
import { useObjectSearch } from '@/features/object-editor/useObjectSearch';

jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  getList: jest.fn(),
  updateList: jest.fn(),
  setListItems: jest.fn(),
  deleteList: jest.fn(),
  shareList: jest.fn(),
  sendListByEmail: jest.fn(),
}));

jest.mock('@/features/object-editor/useObjectSearch', () => ({ useObjectSearch: jest.fn() }));

jest.mock('@/store/session-store', () => ({
  useSessionStore: (selector: (state: { userName: string; email: string; avatarUrl: string | null }) => unknown) =>
    selector({ userName: 'Conseiller', email: 'conseiller@example.com', avatarUrl: null }),
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/features/lists/OtiTemplate', () => ({
  __esModule: true,
  default: () => <div data-testid="oti-template" />,
  itemsToOtiPois: () => [],
}));
jest.mock('@/features/lists/ChannelFrame', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function candidateCard(id: string, name: string, status: 'published' | 'draft') {
  return {
    id,
    name,
    type: 'HOT',
    status,
    city: '',
    code: id,
    card: { id, name, type: 'HOT', image: null, description: null },
  };
}

function baseDetail(overrides: Partial<ObjectListDetail> = {}): ObjectListDetail {
  return {
    id: 'list-1',
    kind: 'static',
    name: 'Ma sélection',
    nameEn: null,
    recipientLabel: null,
    introFr: null,
    introEn: null,
    template: 'carnet',
    accent: 'teal',
    lang: 'fr',
    coverUrl: null,
    effectiveCoverUrl: null,
    showMap: false,
    status: 'draft',
    filters: null,
    filtersUrl: null,
    shareToken: null,
    shareEnabled: false,
    shareExpiresAt: null,
    updatedAt: null,
    resolvedFrom: 'items',
    items: [],
    createdBy: 'user-1',
    creatorName: null,
    orgObjectId: 'ORG1',
    lastActivityAt: null,
    isArchived: false,
    isFeatured: false,
    featureRequestedAt: null,
    canEdit: true,
    canManageFeature: false,
    canProposeFeature: false,
    canRestore: false,
    canManageSharing: true,
    ...overrides,
  };
}

function detailWith(items: ObjectListItem[]): ObjectListDetail {
  return baseDetail({ items });
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListComposeView listId="list-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useObjectSearch).mockReturnValue({ results: [], loading: false, error: null });
});

describe('ListComposeView — palette « Ajouter un lieu » restreinte aux publiés', () => {
  it('un brouillon renvoyé par la recherche globale n’apparaît PAS comme candidat', async () => {
    jest.mocked(getList).mockResolvedValue(detailWith([]));
    jest.mocked(useObjectSearch).mockReturnValue({
      results: [candidateCard('D1', 'Brouillon caché', 'draft'), candidateCard('P1', 'Fiche publiée', 'published')],
      loading: false,
      error: null,
    });

    renderView();
    const input = await screen.findByPlaceholderText('Ajouter un lieu (nom, commune…)');
    fireEvent.change(input, { target: { value: 'fi' } });

    expect(await screen.findByText('Fiche publiée')).toBeInTheDocument();
    expect(screen.queryByText('Brouillon caché')).not.toBeInTheDocument();
  });
});

describe('ListComposeView — réconciliation post-enregistrement (rejet vs ajout plus récent)', () => {
  it('retire un lieu ENVOYÉ mais rejeté par le serveur (ex. devenu brouillon) et le signale, tout en gardant un ajout survenu pendant le round-trip', async () => {
    jest.mocked(getList).mockResolvedValue(detailWith([]));
    jest.mocked(useObjectSearch).mockReturnValue({
      results: [candidateCard('A', 'Alpha', 'published')],
      loading: false,
      error: null,
    });

    let resolveFirstSave: ((v: ObjectListDetail) => void) | undefined;
    jest.mocked(setListItems).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstSave = (v) => resolve(v); }),
    );

    renderView();
    const input = await screen.findByPlaceholderText('Ajouter un lieu (nom, commune…)');
    fireEvent.change(input, { target: { value: 'al' } });
    fireEvent.click(await screen.findByText('Alpha'));

    // Le premier enregistrement (Alpha seul) est parti et reste en attente.
    await waitFor(() => expect(setListItems).toHaveBeenCalledTimes(1));
    expect(setListItems).toHaveBeenNthCalledWith(1, 'list-1', [
      expect.objectContaining({ object_id: 'A' }),
    ]);

    // Pendant l'attente, un second lieu est ajouté localement (jamais encore envoyé).
    jest.mocked(useObjectSearch).mockReturnValue({
      results: [candidateCard('B', 'Beta', 'published')],
      loading: false,
      error: null,
    });
    fireEvent.change(input, { target: { value: 'be' } });
    fireEvent.click(await screen.findByText('Beta'));
    await screen.findByText('Beta');

    // Le SECOND envoi (déclenché par l'ajout de Beta, encore en file derrière le premier) enverra
    // [A, B] — le serveur y persiste B et rejette A : la file consomme cet impl en second.
    jest.mocked(setListItems).mockResolvedValueOnce(
      detailWith([
        {
          objectId: 'B',
          position: 0,
          noteFr: null,
          noteEn: null,
          card: { id: 'B', name: 'Beta', type: 'HOT', image: null, city: null, description: null, raw: {} },
          phone: null,
          web: null,
        },
      ]),
    );

    // Le serveur répond au PREMIER envoi en rejetant Alpha (ex. redevenu brouillon entre-temps) :
    // fresh.items ne contient plus A.
    resolveFirstSave?.(detailWith([]));

    // Alpha (envoyé, rejeté) disparaît et un avertissement apparaît ; Beta (ajouté après l'envoi,
    // jamais rejeté) reste affiché.
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/n'a pas pu être enregistré/);
  });
});

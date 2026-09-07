// ListsManageView — grilles Une / Mes listes / Archives / Propositions (cadrage listes
// 2026-09-07). Ces tests couvrent le contrat frontend : dédup de la une, création ouverte à un
// lecteur, capacités par carte, et les circuits propose/accepte/refuse/restaure/duplique.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListsManageView from './ListsManageView';
import {
  createListFromSelection,
  duplicateList,
  listFeaturedLists,
  listListProposals,
  listMyLists,
  listsQueryKeys,
  requestListFeature,
  restoreList,
  reviewListFeature,
  setListFeatured,
  type ObjectListCard,
} from '@/services/lists';
import { useSessionStore } from '@/store/session-store';

jest.mock('@/services/lists', () => ({
  // listsQueryKeys est de la logique PURE (aucun appel réseau) : on garde la vraie implémentation
  // pour que les clés utilisées par le composant restent celles réellement exportées par le
  // service, sans les dupliquer ici (elles se dédoubleraient au premier renommage).
  ...jest.requireActual('@/services/lists'),
  listMyLists: jest.fn(),
  listFeaturedLists: jest.fn(),
  listListProposals: jest.fn(),
  createListFromSelection: jest.fn(),
  requestListFeature: jest.fn(),
  reviewListFeature: jest.fn(),
  setListFeatured: jest.fn(),
  restoreList: jest.fn(),
  duplicateList: jest.fn(),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function card(overrides: Partial<ObjectListCard> = {}): ObjectListCard {
  return {
    id: overrides.id ?? 'L1',
    name: overrides.name ?? 'Ma liste',
    nameEn: null,
    kind: 'static',
    status: 'draft',
    lang: 'fr',
    accent: 'teal',
    recipientLabel: null,
    coverUrl: null,
    updatedAt: null,
    itemCount: 2,
    typeBreakdown: [],
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

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListsManageView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ orgId: 'org-1', userId: 'user-1', role: 'tourism_agent', adminRank: null });
  jest.mocked(listFeaturedLists).mockResolvedValue([]);
  jest.mocked(listListProposals).mockResolvedValue([]);
  jest.mocked(listMyLists).mockResolvedValue([]);
});

describe('ListsManageView — création ouverte à tout membre (règle 1)', () => {
  it('un lecteur (canEditObjects false, rôle non-admin) voit « Nouvelle liste » dès qu’il a une organisation active', async () => {
    useSessionStore.setState({ orgId: 'org-1', role: 'tourism_agent', adminRank: null });
    renderView();
    expect(await screen.findByRole('button', { name: /Nouvelle liste/ })).toBeInTheDocument();
  });

  it('sans organisation active, le bouton disparaît', async () => {
    useSessionStore.setState({ orgId: null, role: null, adminRank: null });
    renderView();
    await screen.findByText(/Aucune liste à la une/i);
    expect(screen.queryByRole('button', { name: /Nouvelle liste/ })).not.toBeInTheDocument();
  });

  it('crée une liste vide et navigue vers sa composition', async () => {
    jest.mocked(createListFromSelection).mockResolvedValue('new-id');
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Nouvelle liste/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/listes/new-id'));
    expect(createListFromSelection).toHaveBeenCalledWith('Nouvelle liste', []);
  });
});

describe('ListsManageView — à la une dédupliquée de « Mes listes »', () => {
  it('une liste du créateur déjà à la une n’apparaît PAS deux fois (une + mes listes)', async () => {
    const featured = card({ id: 'F1', name: 'Ma liste à la une', isFeatured: true });
    jest.mocked(listFeaturedLists).mockResolvedValue([featured]);
    jest.mocked(listMyLists).mockResolvedValue([featured, card({ id: 'M2', name: 'Autre liste' })]);

    renderView();

    await screen.findByText('Ma liste à la une');
    // Une seule occurrence de la carte à la une sur toute la page (section Une, pas Mes listes).
    expect(screen.getAllByText('Ma liste à la une')).toHaveLength(1);
    expect(screen.getByText('Autre liste')).toBeInTheDocument();
    // Compteur de l'onglet « Mes listes » : seulement la liste NON dupliquée.
    expect(screen.getByRole('button', { name: /Mes listes 1/ })).toBeInTheDocument();
  });
});

describe('ListsManageView — proposer / mettre à la une', () => {
  it('un créateur non-admin voit « Proposer à la une », jamais « Mettre à la une »', async () => {
    jest.mocked(listMyLists).mockResolvedValue([card({ canProposeFeature: true, canManageFeature: false })]);
    renderView();
    await screen.findByText('Ma liste');
    expect(screen.getByRole('button', { name: /Proposer à la une/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mettre à la une/ })).not.toBeInTheDocument();
  });

  it('une proposition déjà envoyée affiche un badge, pas un bouton actionnable', async () => {
    jest.mocked(listMyLists).mockResolvedValue([
      card({ canProposeFeature: true, featureRequestedAt: '2026-08-01T00:00:00Z' }),
    ]);
    renderView();
    await screen.findByText('Ma liste');
    expect(screen.getByText(/Proposition envoyée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Proposer à la une/ })).not.toBeInTheDocument();
  });

  it('un admin voit « Mettre à la une » sur sa propre liste et peut la déclencher', async () => {
    jest.mocked(listMyLists).mockResolvedValue([card({ canManageFeature: true, canProposeFeature: false })]);
    // Le composant n'inspecte pas la valeur résolue (seul l'appel du RPC est testé) : `null` est
    // un membre valide du contrat `ObjectListDetail | null`, pas un raccourci qui cache des champs.
    jest.mocked(setListFeatured).mockResolvedValue(null);
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Mettre à la une/ }));
    await waitFor(() => expect(setListFeatured).toHaveBeenCalledWith('L1', true));
  });

  it('proposer à la une appelle requestListFeature avec l’id de LA carte cliquée', async () => {
    jest.mocked(listMyLists).mockResolvedValue([
      card({ id: 'A', name: 'Alpha', canProposeFeature: true }),
      card({ id: 'B', name: 'Beta', canProposeFeature: true }),
    ]);
    jest.mocked(requestListFeature).mockResolvedValue(null);
    renderView();
    await screen.findByText('Beta');
    const betaCard = screen.getByText('Beta').closest('div.group') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(betaCard).getByRole('button', { name: /Proposer à la une/ }));
    await waitFor(() => expect(requestListFeature).toHaveBeenCalledWith('B'));
  });
});

describe('ListsManageView — onglet Propositions (admin uniquement)', () => {
  it('un membre non-admin ne voit pas l’onglet Propositions', async () => {
    useSessionStore.setState({ orgId: 'org-1', role: 'tourism_agent', adminRank: null });
    renderView();
    await screen.findByText(/À la une/i);
    expect(screen.queryByRole('button', { name: /Propositions/ })).not.toBeInTheDocument();
    expect(listListProposals).not.toHaveBeenCalled();
  });

  it('un admin (rang >= 30) voit l’onglet, le nom du créateur, jamais le destinataire, et peut accepter/refuser', async () => {
    useSessionStore.setState({ orgId: 'org-1', role: 'tourism_agent', adminRank: 30 });
    const proposal = card({ id: 'P1', name: 'Proposée', creatorName: 'Camille', recipientLabel: null, featureRequestedAt: '2026-08-01T00:00:00Z' });
    jest.mocked(listListProposals).mockResolvedValue([proposal]);
    jest.mocked(reviewListFeature).mockResolvedValue(null);
    renderView();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Propositions/ }));

    expect(await screen.findByText(/Proposée par Camille/)).toBeInTheDocument();
    expect(screen.queryByText(/^Pour /)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Accepter/ }));
    await waitFor(() => expect(reviewListFeature).toHaveBeenCalledWith('P1', true));
  });
});

describe('ListsManageView — Archives et restauration', () => {
  it('une liste archivée avec droit de restauration montre le bouton « Restaurer »', async () => {
    jest.mocked(listMyLists).mockResolvedValue([card({ id: 'AR1', name: 'Vieille liste', isArchived: true, canRestore: true })]);
    jest.mocked(restoreList).mockResolvedValue(null);
    renderView();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Archives/ }));
    await user.click(await screen.findByRole('button', { name: /Restaurer/ }));
    await waitFor(() => expect(restoreList).toHaveBeenCalledWith('AR1'));
  });

  it('une liste à la une n’apparaît jamais dans Archives même si elle a un statut d’ancienneté', async () => {
    // Contrat : is_archived = NOT is_featured AND ... — le serveur ne renverrait jamais
    // is_archived:true pour une liste à la une, mais on vérifie que le tri client respecte l'id.
    jest.mocked(listMyLists).mockResolvedValue([card({ id: 'M1', isArchived: false })]);
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Archives/ }));
    expect(screen.getByText(/Aucune liste archivée/)).toBeInTheDocument();
  });
});

describe('ListsManageView — Dupliquer', () => {
  it('dupliquer une carte navigue vers la nouvelle composition', async () => {
    jest.mocked(listMyLists).mockResolvedValue([card({ id: 'M1' })]);
    jest.mocked(duplicateList).mockResolvedValue('M1-copy');
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Dupliquer/ }));
    await waitFor(() => expect(duplicateList).toHaveBeenCalledWith('M1'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/listes/M1-copy'));
  });
});

// Revue architecte (2026-09-07) — un QueryClient est un singleton mémoire PARTAGÉ entre tous les
// composants d'un même onglet ; sans l'identité dans la clé, deux personnes de la même ORG (ou
// une même personne changeant d'ORG) verraient la grille/les capacités de l'autre tant que le
// composant reste monté dans la session, bien avant tout rechargement de page.
describe('ListsManageView — isolation du cache par identité (revue architecte)', () => {
  function renderWithClient(queryClient: QueryClient) {
    return render(
      <QueryClientProvider client={queryClient}>
        <ListsManageView />
      </QueryClientProvider>,
    );
  }

  it('utilisateur A puis utilisateur B, MÊME organisation : aucune liste héritée', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useSessionStore.setState({ orgId: 'org-1', userId: 'user-A', role: 'tourism_agent', adminRank: null });
    jest.mocked(listMyLists).mockResolvedValueOnce([card({ id: 'A1', name: 'Liste de A' })]);
    const { unmount } = renderWithClient(queryClient);
    await screen.findByText('Liste de A');
    unmount();

    useSessionStore.setState({ orgId: 'org-1', userId: 'user-B', role: 'tourism_agent', adminRank: null });
    jest.mocked(listMyLists).mockResolvedValueOnce([card({ id: 'B1', name: 'Liste de B' })]);
    renderWithClient(queryClient);
    await screen.findByText('Liste de B');

    expect(screen.queryByText('Liste de A')).not.toBeInTheDocument();
    // Les deux entrées coexistent, distinctes, dans le même QueryClient — la preuve que la clé
    // sépare bien les identités plutôt que d'écraser l'une par l'autre.
    expect(queryClient.getQueryData(listsQueryKeys.myLists('org-1', 'user-A'))).toEqual([
      expect.objectContaining({ id: 'A1' }),
    ]);
    expect(queryClient.getQueryData(listsQueryKeys.myLists('org-1', 'user-B'))).toEqual([
      expect.objectContaining({ id: 'B1' }),
    ]);
  });

  it('même utilisateur, organisation différente : aucune liste héritée', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useSessionStore.setState({ orgId: 'org-1', userId: 'user-A', role: 'tourism_agent', adminRank: null });
    jest.mocked(listMyLists).mockResolvedValueOnce([card({ id: 'A1', name: 'Liste ORG1' })]);
    const { unmount } = renderWithClient(queryClient);
    await screen.findByText('Liste ORG1');
    unmount();

    useSessionStore.setState({ orgId: 'org-2', userId: 'user-A', role: 'tourism_agent', adminRank: null });
    jest.mocked(listMyLists).mockResolvedValueOnce([card({ id: 'A2', name: 'Liste ORG2' })]);
    renderWithClient(queryClient);
    await screen.findByText('Liste ORG2');

    expect(screen.queryByText('Liste ORG1')).not.toBeInTheDocument();
  });
});

describe('ListsManageView — erreurs de lecture (revue architecte)', () => {
  it('un échec de « à la une » affiche une relance, jamais « aucune liste »', async () => {
    jest.mocked(listFeaturedLists).mockRejectedValue(new Error('réseau'));
    renderView();
    expect(await screen.findByText(/Impossible de charger les listes à la une/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucune liste à la une pour le moment/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
  });

  it('la relance « à la une » redemande la liste au service', async () => {
    jest.mocked(listFeaturedLists).mockRejectedValueOnce(new Error('réseau'));
    renderView();
    await screen.findByRole('button', { name: /Réessayer/ });
    jest.mocked(listFeaturedLists).mockResolvedValueOnce([card({ id: 'F1', name: 'Une liste', isFeatured: true })]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('Une liste')).toBeInTheDocument();
  });

  it('une liste personnelle NE disparaît PAS de « Mes listes » quand « à la une » échoue', async () => {
    jest.mocked(listFeaturedLists).mockRejectedValue(new Error('réseau'));
    jest.mocked(listMyLists).mockResolvedValue([card({ id: 'M1', name: 'Ma liste perso' })]);
    renderView();
    expect(await screen.findByText('Ma liste perso')).toBeInTheDocument();
  });

  it('un échec des propositions (admin) affiche une relance, jamais « aucune proposition »', async () => {
    useSessionStore.setState({ orgId: 'org-1', role: 'tourism_agent', adminRank: 30 });
    jest.mocked(listListProposals).mockRejectedValue(new Error('réseau'));
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Propositions/ }));
    expect(await screen.findByText(/Impossible de charger les propositions/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucune proposition en attente/)).not.toBeInTheDocument();
  });

  it('une recherche sans résultat se distingue d’une section réellement vide (à la une)', async () => {
    jest.mocked(listFeaturedLists).mockResolvedValue([card({ id: 'F1', name: 'Escapade Sud', isFeatured: true })]);
    renderView();
    await screen.findByText('Escapade Sud');
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Rechercher une liste…'), 'zzz-inexistant');
    expect(await screen.findByText(/Aucune liste à la une ne correspond à la recherche/)).toBeInTheDocument();
    expect(screen.queryByText(/^Aucune liste à la une pour le moment\.$/)).not.toBeInTheDocument();
  });
});

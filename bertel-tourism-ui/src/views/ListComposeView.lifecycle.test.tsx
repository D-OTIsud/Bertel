// ListComposeView — corrections de revue architecte (§listes 2026-09-07) :
//  1) une même liste (même listId) ne garde pas les champs locaux d'une identité précédente
//     quand l'utilisateur/l'organisation change dans le même onglet ;
//  3) le droit de LIRE une proposition (get_list) n'est pas le droit de l'UTILISER — imprimer,
//     envoyer, partager et dupliquer restent bloqués tant qu'elle n'est pas acceptée à la une.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import {
  duplicateList,
  ensureListShareLink,
  getList,
  listsQueryKeys,
  reviewListFeature,
  sendListByEmail,
  setListFeatured,
  setListItems,
  shareList,
  updateList,
  type ObjectListDetail,
} from '@/services/lists';
import { useSessionStore } from '@/store/session-store';

jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  getList: jest.fn(),
  updateList: jest.fn(),
  setListItems: jest.fn(),
  deleteList: jest.fn(),
  shareList: jest.fn(),
  ensureListShareLink: jest.fn(),
  sendListByEmail: jest.fn(),
  duplicateList: jest.fn(),
  restoreList: jest.fn(),
  requestListFeature: jest.fn(),
  reviewListFeature: jest.fn(),
  setListFeatured: jest.fn(),
}));

jest.mock('@/features/object-editor/useObjectSearch', () => ({
  useObjectSearch: () => ({ results: [], loading: false }),
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

function baseDetail(overrides: Partial<ObjectListDetail> = {}): ObjectListDetail {
  return {
    id: 'list-1',
    kind: 'static',
    name: 'Nom par défaut',
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

function renderWithClient(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ListComposeView listId="list-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ListComposeView — isolation du cache par identité sur le MÊME listId (revue architecte §1)', () => {
  it("un changement d'utilisateur (même organisation, même liste) ne garde pas le nom/destinataire de l'ancien", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValueOnce(baseDetail({ name: 'Nom de A', recipientLabel: 'Pour A', createdBy: 'user-A' }));
    const { unmount } = renderWithClient(queryClient);
    expect(await screen.findByDisplayValue('Nom de A')).toBeInTheDocument();
    unmount();

    useSessionStore.setState({ userId: 'user-B', orgId: 'org-1', userName: 'B', email: 'b@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValueOnce(baseDetail({ name: 'Nom de B', recipientLabel: 'Pour B', createdBy: 'user-B' }));
    renderWithClient(queryClient);

    expect(await screen.findByDisplayValue('Nom de B')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Nom de A')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Pour A')).not.toBeInTheDocument();
  });
});

describe('ListComposeView — droit d’UTILISATION distinct du droit de lecture (revue architecte §3)', () => {
  it('un admin examinant une proposition NON acceptée ne peut ni imprimer, ni envoyer, ni partager, ni dupliquer', async () => {
    useSessionStore.setState({ userId: 'admin-1', orgId: 'org-1', userName: 'Admin', email: 'admin@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(
      baseDetail({
        createdBy: 'someone-else',
        canEdit: false,
        canManageFeature: false,
        isFeatured: false,
        featureRequestedAt: '2026-08-01T00:00:00Z',
      }),
    );
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    await screen.findByText(/en cours d'examen/);
    expect(screen.getByRole('button', { name: /^Imprimer$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Envoyer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Partager par lien/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Dupliquer/ })).toBeDisabled();
  });

  it('un membre lisant une liste À LA UNE (non créateur, non éditeur) garde imprimer/envoyer/partager/dupliquer', async () => {
    useSessionStore.setState({ userId: 'member-1', orgId: 'org-1', userName: 'Membre', email: 'membre@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(
      baseDetail({
        createdBy: 'someone-else',
        canEdit: false,
        isFeatured: true,
        recipientLabel: 'Pour la famille',
        introFr: 'Bienvenue !',
        items: [
          {
            objectId: 'obj-1',
            position: 0,
            noteFr: 'Un coup de cœur',
            noteEn: null,
            card: { id: 'obj-1', name: 'Le Piton', type: 'HLO', image: null, city: 'Saint-Denis', description: null, raw: {} },
            phone: null,
            web: null,
          },
        ],
      }),
    );
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    await screen.findByDisplayValue('Nom par défaut');
    expect(screen.queryByText(/en cours d'examen/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Imprimer$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Envoyer/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Partager par lien/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Dupliquer/ })).toBeEnabled();
    // Mais l'édition reste fermée : ce n'est pas un éditeur — nom, destinataire, intro, notes et
    // toutes les commandes persistantes (modèle, carte, accent) sont verrouillés, même si
    // `disabled={locked}` seul les aurait laissés ouverts à la saisie (correctif §listes 2026-09-07).
    expect(screen.getByLabelText('Nom de la liste')).toBeDisabled();
    expect(screen.getByLabelText('Destinataire')).toBeDisabled();
    expect(screen.getByLabelText("Mot d'introduction")).toBeDisabled();
    expect(screen.getByLabelText('Note pour Le Piton')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Carnet' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Carte récap du parcours/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Accent Teal/ })).toBeDisabled();
  });

  it('le créateur garde le droit d’utiliser sa propre liste même si `canEdit` est momentanément faux', async () => {
    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: false, isFeatured: false }));
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    await screen.findByDisplayValue('Nom par défaut');
    expect(screen.getByRole('button', { name: /Envoyer/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Dupliquer/ })).toBeEnabled();
  });
});

// Régressions relevées en revue finale (§listes 2026-09-07, checkpoint R2/R3) — cas discriminants,
// pas des miroirs des tests ci-dessus.
describe('ListComposeView — Accepter/Refuser une proposition depuis le détail (revue R2)', () => {
  function proposalDetail() {
    return baseDetail({
      createdBy: 'someone-else',
      canEdit: false,
      canManageFeature: true,
      isFeatured: false,
      featureRequestedAt: '2026-08-01T00:00:00Z',
    });
  }

  beforeEach(() => {
    useSessionStore.setState({ userId: 'admin-1', orgId: 'org-1', userName: 'Admin', email: 'admin@example.com', avatarUrl: null, canEditObjects: true });
  });

  it('« Accepter » sur une proposition d’un COLLÈGUE appelle reviewListFeature(id, true), jamais setListFeatured', async () => {
    jest.mocked(getList).mockResolvedValue(proposalDetail());
    jest.mocked(reviewListFeature).mockResolvedValue(null);
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    fireEvent.click(await screen.findByRole('button', { name: /Accepter/ }));

    await waitFor(() => expect(reviewListFeature).toHaveBeenCalledWith('list-1', true));
    expect(setListFeatured).not.toHaveBeenCalled();
  });

  it('« Refuser » sur une proposition d’un COLLÈGUE appelle reviewListFeature(id, false), jamais setListFeatured', async () => {
    jest.mocked(getList).mockResolvedValue(proposalDetail());
    jest.mocked(reviewListFeature).mockResolvedValue(null);
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    fireEvent.click(await screen.findByRole('button', { name: /Refuser/ }));

    await waitFor(() => expect(reviewListFeature).toHaveBeenCalledWith('list-1', false));
    expect(setListFeatured).not.toHaveBeenCalled();
  });
});

describe('ListComposeView — perte de canEdit avec un brouillon local (revue R2)', () => {
  it('un refetch qui repasse canEdit à faux pendant une frappe locale bloque TOUTE écriture à l’envoi', async () => {
    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: true }));
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: true });
    jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ListComposeView listId="list-1" />
      </QueryClientProvider>,
    );

    const nameInput = await screen.findByLabelText('Nom de la liste');
    fireEvent.change(nameInput, { target: { value: 'Brouillon jamais enregistré' } });
    // Pas de blur : la frappe reste locale. Le droit d'édition est retiré ENTRE-TEMPS (ex. mise à
    // la une par un admin) — simulé par un refetch qui met à jour directement le cache.
    act(() => {
      queryClient.setQueryData(
        listsQueryKeys.detail('list-1', 'user-A', 'org-1'),
        baseDetail({ createdBy: 'user-A', canEdit: false }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Envoyer/ }));

    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledWith('list-1', 'voyageur@example.com'));
    expect(updateList).not.toHaveBeenCalled();
    expect(setListItems).not.toHaveBeenCalled();
  });
});

describe('ListComposeView — revalidation de can_edit à l’exécution de queueBackgroundSave (correctif §listes 2026-09-07)', () => {
  it('une autosave mise en file DERRIÈRE une autre, qui perd canEdit avant son tour, n’appelle jamais updateList', async () => {
    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: true }));
    let resolveFirstSave: ((v: ObjectListDetail) => void) | undefined;
    jest.mocked(updateList).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstSave = resolve; }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ListComposeView listId="list-1" />
      </QueryClientProvider>,
    );

    // Première autosave (nom) : blur RÉEL, pas un simple change — c'est le blur qui met en file.
    const nameInput = await screen.findByLabelText('Nom de la liste');
    fireEvent.change(nameInput, { target: { value: 'Nom modifié' } });
    fireEvent.blur(nameInput);
    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));

    // Seconde autosave (destinataire), par blur également : elle se met en file DERRIÈRE la
    // première, encore en vol, et n'a donc pas encore exécuté sa propre revalidation.
    const recipientInput = screen.getByLabelText('Destinataire');
    fireEvent.change(recipientInput, { target: { value: 'Pour Camille' } });
    fireEvent.blur(recipientInput);

    // Les droits sont retirés PENDANT que la seconde attend son tour (ex. admin qui retire la
    // liste de la une pendant le round-trip de la première).
    act(() => {
      queryClient.setQueryData(
        listsQueryKeys.detail('list-1', 'user-A', 'org-1'),
        baseDetail({ createdBy: 'user-A', canEdit: false, name: 'Nom modifié' }),
      );
    });

    // La première résout avec le même verdict serveur (canEdit repassé à faux) : le cache que la
    // seconde tâche va lire à SON tour d'exécution porte donc bien canEdit=false.
    await act(async () => {
      resolveFirstSave?.(baseDetail({ createdBy: 'user-A', canEdit: false, name: 'Nom modifié' }));
    });

    // La bascule en lecture seule confirme que la seconde tâche a eu l'occasion de s'exécuter.
    await screen.findByText('Lecture seule');
    expect(updateList).toHaveBeenCalledTimes(1);
    expect(setListItems).not.toHaveBeenCalled();
  });
});

describe('ListComposeView — lien de partage expiré/révoqué pour un lecteur (revue R2)', () => {
  it('un lien EXPIRÉ pour un lecteur affiche le message clair, sans jamais appeler share_list ni proposer de copie', async () => {
    useSessionStore.setState({ userId: 'member-1', orgId: 'org-1', userName: 'Membre', email: 'membre@example.com', avatarUrl: null, canEditObjects: true });
    const expired = new Date(Date.now() - 60_000).toISOString();
    jest.mocked(getList).mockResolvedValue(
      baseDetail({
        createdBy: 'someone-else',
        canEdit: false,
        canManageSharing: false,
        isFeatured: true,
        shareEnabled: true,
        shareToken: 'tok-old',
        shareExpiresAt: expired,
      }),
    );
    jest.mocked(ensureListShareLink).mockRejectedValue(
      new Error('Ce lien a été désactivé ou a expiré — seul un éditeur peut le réactiver depuis les réglages de partage.'),
    );
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    fireEvent.click(await screen.findByRole('button', { name: /Partager par lien/ }));

    // Le même message apparaît aussi dans la bannière d'erreur globale (onError d'ensureShare) —
    // on vérifie ICI précisément qu'il est visible DANS le modal de partage, pas ailleurs.
    const dialog = await screen.findByRole('dialog', { name: /Partager par lien/ });
    expect(within(dialog).getByText(/seul un éditeur peut le réactiver/)).toBeInTheDocument();
    expect(shareList).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Copier$/ })).not.toBeInTheDocument();
  });
});

describe('ListComposeView — duplication d’un brouillon (revue R2)', () => {
  beforeEach(() => {
    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
  });

  it('dupliquer avec une frappe non enregistrée sauvegarde D’ABORD (flush lent) — champs et actions verrouillés, duplicateList PAS appelée avant résolution', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: true }));
    let resolveUpdate: ((v: ObjectListDetail) => void) | undefined;
    jest.mocked(updateList).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve; }),
    );
    jest.mocked(duplicateList).mockResolvedValue('new-id');
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const nameInput = await screen.findByLabelText('Nom de la liste');
    fireEvent.change(nameInput, { target: { value: 'Nom modifié' } });
    fireEvent.click(screen.getByRole('button', { name: /Dupliquer/ }));

    // Le flush (updateList) est parti mais n'a pas encore résolu : tant qu'il est en vol, AUCUNE
    // frappe supplémentaire ne doit pouvoir partir en autosave, et duplicateList ne doit PAS
    // encore avoir été appelée — sinon elle figerait une version périmée.
    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
    expect(duplicateList).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nom de la liste')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Dupliquer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Envoyer/ })).toBeDisabled();

    await act(async () => {
      resolveUpdate?.(baseDetail({ createdBy: 'user-A', canEdit: true, name: 'Nom modifié' }));
    });

    await waitFor(() => expect(duplicateList).toHaveBeenCalledWith('list-1'));
    const updateOrder = jest.mocked(updateList).mock.invocationCallOrder[0];
    const duplicateOrder = jest.mocked(duplicateList).mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(duplicateOrder);
    // Le verrou se relâche une fois l'opération entièrement terminée.
    await waitFor(() => expect(screen.getByLabelText('Nom de la liste')).not.toBeDisabled());
  });

  it('un échec du flush (updateList rejeté) bloque la duplication — aucun appel à duplicateList', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: true }));
    jest.mocked(updateList).mockRejectedValue(new Error('Réseau indisponible.'));
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const nameInput = await screen.findByLabelText('Nom de la liste');
    fireEvent.change(nameInput, { target: { value: 'Nom modifié' } });
    fireEvent.click(screen.getByRole('button', { name: /Dupliquer/ }));

    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
    expect(duplicateList).not.toHaveBeenCalled();
    // Le verrou se relâche après l'échec — l'utilisateur peut réessayer.
    await waitFor(() => expect(screen.getByRole('button', { name: /Dupliquer/ })).not.toBeDisabled());
    expect(duplicateList).not.toHaveBeenCalled();
  });
});

describe('ListComposeView — copier le lien revérifie AU CLIC, jamais depuis le cache (revue finale)', () => {
  function mockClipboard() {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  it('lien actif et NON expiré en cache : un rejet d’ensureListShareLink AU CLIC « Copier » n’écrit rien, ne réactive jamais via share_list, et affiche le message dans le modal', async () => {
    useSessionStore.setState({ userId: 'member-1', orgId: 'org-1', userName: 'Membre', email: 'membre@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(
      baseDetail({
        createdBy: 'someone-else',
        canEdit: false,
        canManageSharing: false,
        isFeatured: true,
        shareEnabled: true,
        shareToken: 'tok-active',
        shareExpiresAt: null,
      }),
    );
    jest.mocked(ensureListShareLink).mockRejectedValue(
      new Error('Ce lien a été désactivé ou a expiré — seul un éditeur peut le réactiver depuis les réglages de partage.'),
    );
    const writeText = mockClipboard();
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    // Le lien est déjà actif ET non expiré : le clic sur le bouton d'en-tête n'a rien à
    // acquérir (needsAcquire faux) — ensure n'est appelé qu'au clic sur « Copier » dans le modal.
    fireEvent.click(await screen.findByRole('button', { name: /Lien actif/ }));
    expect(ensureListShareLink).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: /Partager par lien/ });

    fireEvent.click(within(dialog).getByRole('button', { name: /^Copier$/ }));

    await waitFor(() => expect(ensureListShareLink).toHaveBeenCalledWith('list-1'));
    expect(writeText).not.toHaveBeenCalled();
    expect(shareList).not.toHaveBeenCalled();
    expect(within(dialog).queryByText(/^Copié$/)).not.toBeInTheDocument();
    expect(await within(dialog).findByText(/seul un éditeur peut le réactiver/)).toBeInTheDocument();
  });

  it('succès : le token FRAIS renvoyé par ensureListShareLink est celui effectivement copié', async () => {
    useSessionStore.setState({ userId: 'member-1', orgId: 'org-1', userName: 'Membre', email: 'membre@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(
      baseDetail({
        createdBy: 'someone-else',
        canEdit: false,
        canManageSharing: false,
        isFeatured: true,
        shareEnabled: true,
        shareToken: 'tok-stale',
        shareExpiresAt: null,
      }),
    );
    jest.mocked(ensureListShareLink).mockResolvedValue({
      shareToken: 'tok-fresh',
      shareUrlPath: '/l/tok-fresh',
      shareEnabled: true,
      shareExpiresAt: null,
    });
    const writeText = mockClipboard();
    renderWithClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    fireEvent.click(await screen.findByRole('button', { name: /Lien actif/ }));
    const dialog = await screen.findByRole('dialog', { name: /Partager par lien/ });

    fireEvent.click(within(dialog).getByRole('button', { name: /^Copier$/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/l/tok-fresh'));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('tok-stale'));
    expect(shareList).not.toHaveBeenCalled();
    expect(await within(dialog).findByText('Copié')).toBeInTheDocument();
  });
});

describe('ListComposeView — confirmation avant duplication d’un brouillon abandonné (revue finale point 3)', () => {
  function renderWithDirtyDraftAfterCanEditLost(queryClient: QueryClient) {
    render(
      <QueryClientProvider client={queryClient}>
        <ListComposeView listId="list-1" />
      </QueryClientProvider>,
    );
  }

  it('refus de la confirmation : aucun duplicateList ni navigation, le brouillon reste affiché', async () => {
    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: true }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithDirtyDraftAfterCanEditLost(queryClient);

    const nameInput = await screen.findByLabelText('Nom de la liste');
    fireEvent.change(nameInput, { target: { value: 'Brouillon perdu' } });
    act(() => {
      queryClient.setQueryData(
        listsQueryKeys.detail('list-1', 'user-A', 'org-1'),
        baseDetail({ createdBy: 'user-A', canEdit: false }),
      );
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /Dupliquer/ }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(duplicateList).not.toHaveBeenCalled();
    // Refus ⇒ pas de réhydratation : le brouillon reste affiché tel quel.
    expect(screen.getByDisplayValue('Brouillon perdu')).toBeInTheDocument();
  });

  it('acceptation de la confirmation : duplique la version SERVEUR, sans updateList ni setListItems', async () => {
    useSessionStore.setState({ userId: 'user-A', orgId: 'org-1', userName: 'A', email: 'a@example.com', avatarUrl: null, canEditObjects: true });
    jest.mocked(getList).mockResolvedValue(baseDetail({ createdBy: 'user-A', canEdit: true }));
    jest.mocked(duplicateList).mockResolvedValue('new-id');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithDirtyDraftAfterCanEditLost(queryClient);

    const nameInput = await screen.findByLabelText('Nom de la liste');
    fireEvent.change(nameInput, { target: { value: 'Brouillon perdu' } });
    act(() => {
      queryClient.setQueryData(
        listsQueryKeys.detail('list-1', 'user-A', 'org-1'),
        baseDetail({ createdBy: 'user-A', canEdit: false }),
      );
    });

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Dupliquer/ }));

    await waitFor(() => expect(duplicateList).toHaveBeenCalledWith('list-1'));
    expect(updateList).not.toHaveBeenCalled();
    expect(setListItems).not.toHaveBeenCalled();
  });
});

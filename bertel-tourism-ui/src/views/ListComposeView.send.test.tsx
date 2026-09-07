// MET-02/MET-03/MET-04/A11Y-01/A11Y-07 — l'envoi doit persister la version confirmée
// (nom, destinataire, intro, notes, ordre) avant sendListByEmail, ne jamais faire la course
// avec un autosave en vol, et le réordonnancement doit être accessible au clavier/clic.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import {
  getList,
  sendListByEmail,
  setListItems,
  updateList,
  type ObjectListDetail,
  type ObjectListItem,
} from '@/services/lists';

jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  getList: jest.fn(),
  updateList: jest.fn(),
  setListItems: jest.fn(),
  deleteList: jest.fn(),
  shareList: jest.fn(),
  sendListByEmail: jest.fn(),
}));

jest.mock('@/features/object-editor/useObjectSearch', () => ({
  useObjectSearch: () => ({ results: [], loading: false }),
}));

jest.mock('@/store/session-store', () => ({
  useSessionStore: (selector: (state: { userName: string; email: string; avatarUrl: string | null }) => unknown) =>
    selector({ userName: 'Conseiller', email: 'conseiller@example.com', avatarUrl: null }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/features/lists/OtiTemplate', () => ({
  __esModule: true,
  default: () => <div data-testid="oti-template" />,
  itemsToOtiPois: () => [],
}));
jest.mock('@/features/lists/ChannelFrame', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function item(objectId: string, name: string, noteFr: string | null = null): ObjectListItem {
  return {
    objectId,
    position: 0,
    noteFr,
    noteEn: null,
    card: { id: objectId, name, type: 'HOT', image: null, city: null, description: null, raw: {} },
    phone: null,
    web: null,
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
    // Ces tests couvrent le flux ÉDITEUR (MET-02/A11Y) — canEdit doit rester vrai, sans quoi
    // le nouveau garde-fou lecture-seule (§listes 2026-09-07) désactiverait les champs testés.
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
      <ListComposeView listId="list-1" />
    </QueryClientProvider>,
  );
}

describe('ListComposeView — envoi et sauvegarde confirmée (MET-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('attend une sauvegarde différée avant d’envoyer', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail({ introFr: 'Ancienne intro' }));
    let resolveUpdate: ((v: ObjectListDetail) => void) | undefined;
    jest.mocked(updateList).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve; }),
    );
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: true });
    jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');

    renderView();
    const intro = await screen.findByLabelText("Mot d'introduction");
    fireEvent.change(intro, { target: { value: 'Nouvelle intro' } });
    fireEvent.blur(intro);

    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(sendListByEmail).not.toHaveBeenCalled();

    // La file réelle démarre le thunk de blur sur une micro-tâche (pas synchrone) : on attend
    // que `updateList` soit effectivement appelé (donc `resolveUpdate` affecté) avant de résoudre.
    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
    expect(sendListByEmail).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpdate?.(baseDetail({ introFr: 'Nouvelle intro' }));
    });

    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledWith('list-1', 'voyageur@example.com'));
    expect(updateList).toHaveBeenCalledTimes(1);
  });

  it('après un envoi SMTP accepté dont le marquage échoue : un seul envoi, avertissement fidèle, pas de renvoi auto', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail());
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: false });
    jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');

    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledTimes(1));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('voyageur@example.com');
    expect(notice).toHaveTextContent(/historique/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Pas de renvoi automatique : un second clic doit redemander une adresse, pas relancer seul.
    expect(sendListByEmail).toHaveBeenCalledTimes(1);
  });

  it('quand le marquage réussit après un envoi SMTP accepté : avertissement absent', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail());
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: true });
    jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');

    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /envoyer/i }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('voyageur@example.com');
    expect(notice).not.toHaveTextContent(/historique/i);
  });

  it('un échec de sauvegarde bloque l’envoi et conserve le brouillon', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail({ introFr: 'Ancienne intro' }));
    jest.mocked(updateList).mockRejectedValue(new Error('Réseau indisponible.'));
    jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');

    renderView();
    const intro = await screen.findByLabelText("Mot d'introduction");
    fireEvent.change(intro, { target: { value: 'Nouvelle intro' } });
    fireEvent.blur(intro);

    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Réseau indisponible.'));
    expect(sendListByEmail).not.toHaveBeenCalled();
    expect(intro).toHaveValue('Nouvelle intro');
  });

  it('persiste nom, ordre et note courants avant l’envoi', async () => {
    jest.mocked(getList).mockResolvedValue(
      baseDetail({ items: [item('obj-a', 'Alpha'), item('obj-b', 'Beta')] }),
    );
    jest.mocked(updateList).mockResolvedValue(baseDetail({ name: 'Nouveau nom' }));
    jest.mocked(setListItems).mockResolvedValue(baseDetail());
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: true });
    jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');

    renderView();
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /descendre alpha/i }));
    const note = await screen.findByLabelText('Note pour Alpha');
    fireEvent.change(note, { target: { value: 'Coup de cœur !' } });

    const name = screen.getByLabelText('Nom de la liste');
    fireEvent.change(name, { target: { value: 'Nouveau nom' } });

    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(sendListByEmail).toHaveBeenCalled());
    expect(updateList).toHaveBeenCalledWith('list-1', expect.objectContaining({ name: 'Nouveau nom' }));
    expect(setListItems).toHaveBeenCalledWith(
      'list-1',
      expect.arrayContaining([
        expect.objectContaining({ object_id: 'obj-b', position: 0 }),
        expect.objectContaining({ object_id: 'obj-a', position: 1, note_fr: 'Coup de cœur !' }),
      ]),
    );
  });

  it('sérialise deux autosaves : le second ne démarre qu’une fois le premier réglé', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail());
    let resolveRecipient: (() => void) | undefined;
    const started: string[] = [];
    jest.mocked(updateList).mockImplementation((_id, patch) => {
      if ('recipient_label' in patch) {
        started.push('recipient');
        return new Promise((resolve) => {
          resolveRecipient = () => resolve(baseDetail({ recipientLabel: patch.recipient_label ?? null }));
        });
      }
      started.push('intro');
      return Promise.resolve(baseDetail({ introFr: patch.intro_fr ?? null }));
    });

    renderView();
    const recipient = await screen.findByLabelText('Destinataire');
    fireEvent.change(recipient, { target: { value: 'Camille' } });
    fireEvent.blur(recipient); // met la sauvegarde LENTE (destinataire) en tête de file

    const intro = screen.getByLabelText("Mot d'introduction");
    fireEvent.change(intro, { target: { value: 'Bonjour' } });
    fireEvent.blur(intro); // demandée ensuite, mais volontairement plus « rapide »

    await waitFor(() => expect(started).toContain('recipient'));
    // Laisse encore quelques micro-tâches se dérouler : si la file n'était qu'un pointeur
    // (régression), le second appel réseau serait déjà parti ici, car la note « rapide » ne
    // dépendrait de rien. Une vraie file interdit à `intro` de démarrer avant le règlement de
    // `recipient`, qu'on maintient volontairement en attente.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(started).toEqual(['recipient']);

    resolveRecipient?.();
    await waitFor(() => expect(started).toEqual(['recipient', 'intro']));
  });

  it("n'envoie pas deux fois tant qu'un envoi est en cours", async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail());
    jest.mocked(sendListByEmail).mockImplementation(() => new Promise(() => {}));
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('voyageur@example.com');

    renderView();
    const sendButton = await screen.findByRole('button', { name: /envoyer/i });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    await waitFor(() => expect(sendButton).toBeDisabled());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(sendListByEmail).toHaveBeenCalledTimes(1);
  });
});

describe('ListComposeView — ordre des Hooks (chargement → résolu)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ne change pas le nombre de Hooks quand la requête passe de "en cours" à "résolue"', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveList: ((v: ObjectListDetail) => void) | undefined;
    jest.mocked(getList).mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));

    renderView();
    expect(screen.getByText(/chargement de la liste/i)).toBeInTheDocument();

    await act(async () => {
      resolveList?.(baseDetail({ items: [item('obj-a', 'Alpha')] }));
    });

    await screen.findByText('Alpha');
    const hookOrderError = errorSpy.mock.calls.some(([message]) =>
      typeof message === 'string' &&
      (message.includes('Rendered more hooks') || message.includes('change in the order of Hooks')),
    );
    expect(hookOrderError).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('ListComposeView — réordonnancement clavier (A11Y-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('désactive les bornes et annonce la nouvelle position', async () => {
    jest.mocked(getList).mockResolvedValue(
      baseDetail({ items: [item('obj-a', 'Alpha'), item('obj-b', 'Beta'), item('obj-c', 'Gamma')] }),
    );

    renderView();
    await screen.findByText('Alpha');

    expect(screen.getByRole('button', { name: /monter alpha/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /descendre gamma/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /descendre alpha/i }));

    await waitFor(() =>
      expect(screen.getByText(/Alpha déplacé en position 2 sur 3\./)).toBeInTheDocument(),
    );
    expect(document.activeElement).toHaveAttribute('data-move-item', 'obj-a');
    expect(document.activeElement).toHaveAttribute('data-move-dir', 'down');
  });
});

describe('ListComposeView — changement de langue (A11Y-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('préserve le texte de la langue quittée avant de basculer', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail({ introFr: null, introEn: 'Hello EN' }));
    jest.mocked(updateList).mockResolvedValue(
      baseDetail({ lang: 'en', introFr: 'Bonjour brouillon', introEn: 'Hello EN' }),
    );

    renderView();
    const intro = await screen.findByLabelText("Mot d'introduction");
    fireEvent.change(intro, { target: { value: 'Bonjour brouillon' } });

    fireEvent.click(screen.getByRole('button', { name: 'Éditer en anglais' }));

    await waitFor(() =>
      expect(updateList).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ lang: 'en', intro_fr: 'Bonjour brouillon' }),
      ),
    );
    await waitFor(() => expect(screen.getByLabelText("Mot d'introduction")).toHaveValue('Hello EN'));
  });

  it('verrouille les champs pendant la bascule pour ne jamais écraser une frappe plus récente', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail({ introFr: null, introEn: 'Hello EN' }));
    let resolveLang: ((v: ObjectListDetail) => void) | undefined;
    jest.mocked(updateList).mockImplementation(
      () => new Promise((resolve) => { resolveLang = resolve; }),
    );

    renderView();
    const intro = await screen.findByLabelText("Mot d'introduction");
    fireEvent.change(intro, { target: { value: 'Bonjour brouillon' } });

    fireEvent.click(screen.getByRole('button', { name: 'Éditer en anglais' }));

    // Pendant l'attente, le champ doit être verrouillé : une frappe supplémentaire ne doit
    // avoir aucune chance d'être écrasée silencieusement par la résolution EN à venir.
    await waitFor(() => expect(screen.getByLabelText("Mot d'introduction")).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Éditer en français' })).toBeDisabled();
    // S'assure que `updateList` a bien été appelé (donc `resolveLang` affecté) avant de résoudre.
    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveLang?.(baseDetail({ lang: 'en', introFr: 'Bonjour brouillon', introEn: 'Hello EN' }));
    });

    await waitFor(() => expect(screen.getByLabelText("Mot d'introduction")).not.toBeDisabled());
    expect(screen.getByLabelText("Mot d'introduction")).toHaveValue('Hello EN');
  });
});

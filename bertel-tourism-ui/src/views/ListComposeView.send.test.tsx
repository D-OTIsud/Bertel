// MET-02/MET-03/MET-04/A11Y-01/A11Y-07 — l'envoi doit persister la version confirmée
// (nom, destinataire, intro, notes, ordre) avant sendListByEmail, ne jamais faire la course
// avec un autosave en vol, et le réordonnancement doit être accessible au clavier/clic.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { useSessionStore } from '@/store/session-store';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import {
  getList,
  ListEmailUnknownError,
  LIST_EMAIL_UNKNOWN_MESSAGE,
  LIST_EMAIL_RESEND_CONFIRMATION,
  sendListByEmail,
  setListItems,
  updateList,
  type ObjectListDetail,
  type ObjectListItem,
} from '@/services/lists';

// `lists` imports this service directly; mock it before requireActual so the lightweight
// session fixture used by this view suite does not need Zustand's static store methods.
jest.mock('@/services/service-availability', () => ({
  getServiceAvailability: jest.fn(() => Promise.resolve({ translation: false, imageAnalysis: false, email: true })),
}));
jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  getList: jest.fn(),
  getListEmailContext: jest.fn(async () => ({ generations: {} })),
  updateList: jest.fn(),
  setListItems: jest.fn(),
  deleteList: jest.fn(),
  shareList: jest.fn(),
  sendListByEmail: jest.fn(),
}));

jest.mock('@/features/object-editor/useObjectSearch', () => ({
  useObjectSearch: () => ({ results: [], loading: false }),
}));
jest.mock('@/hooks/useServiceAvailability', () => ({ useServiceAvailability: jest.fn() }));

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
  const ui = (listId: string) => <QueryClientProvider client={queryClient}><ListComposeView listId={listId} /></QueryClientProvider>;
  const view = render(ui('list-1'));
  return { ...view, showList: (listId: string) => view.rerender(ui(listId)) };
}

describe('ListComposeView — envoi et sauvegarde confirmée (MET-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ status: 'ready', userId: 'user-1', orgId: 'ORG1', role: 'tourism_agent', userName: 'Conseiller', email: 'conseiller@example.invalid', avatarUrl: null, demoMode: false });
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.mocked(useServiceAvailability).mockReturnValue({ translation: false, imageAnalysis: false, email: true });
  });

  it('sans SMTP, le bouton Envoyer disparaît', async () => {
    jest.mocked(getList).mockResolvedValue(baseDetail());
    jest.mocked(useServiceAvailability).mockReturnValue({ translation: false, imageAnalysis: false, email: false });
    renderView();
    await screen.findByLabelText('Nom de la liste');
    expect(screen.queryByRole('button', { name: /^envoyer$/i })).not.toBeInTheDocument();
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

    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledWith('list-1', 'voyageur@example.com', expect.objectContaining({ operationId: expect.any(String) })));
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


describe('ListComposeView — durable uncertainty and current scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ status: 'ready', userId: 'user-1', orgId: 'ORG1', role: 'tourism_agent', demoMode: false });
    jest.mocked(useServiceAvailability).mockReturnValue({ translation: false, imageAnalysis: false, email: true });
    jest.mocked(getList).mockResolvedValue(baseDetail());
    jest.spyOn(window, 'prompt').mockReturnValue('recipient@example.invalid');
  });
  it('never resends an unknown result automatically; cancel preserves it and confirmation creates a new intention', async () => {
    const previous = 'd2000000-0000-4000-8000-000000000001';
    jest.mocked(sendListByEmail).mockRejectedValueOnce(new ListEmailUnknownError(previous)).mockResolvedValue({ trackingUpdated: true });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /^envoyer$/i }));
    expect(await screen.findByText(LIST_EMAIL_UNKNOWN_MESSAGE)).toBeInTheDocument();
    expect(sendListByEmail).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled();
    const original = jest.mocked(sendListByEmail).mock.calls[0][2]!.operationId;
    fireEvent.click(screen.getByRole('button', { name: /^envoyer$/i }));
    expect(confirm).toHaveBeenCalledWith(LIST_EMAIL_RESEND_CONFIRMATION);
    expect(sendListByEmail).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /^envoyer$/i }));
    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledTimes(2));
    const next = jest.mocked(sendListByEmail).mock.calls[1][2]!;
    expect(next.operationId).not.toBe(original); expect(next.confirmedPreviousOperationId).toBe(previous);
    expect(await screen.findByRole('status')).toHaveTextContent('E-mail envoyé');
  });
  it('A→B→A without intermediate render cancels a deferred flush before any SMTP request, then allows a fresh gesture', async () => {
    let resolve!: (detail: ObjectListDetail) => void;
    jest.mocked(updateList).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: true });
    renderView();
    fireEvent.change(await screen.findByLabelText("Mot d'introduction"), { target: { value: 'Synthetic draft C' } });
    fireEvent.click(screen.getByRole('button', { name: /^envoyer$/i }));
    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
    act(() => { useSessionStore.setState({ userId: 'user-B', orgId: 'ORGB' }); useSessionStore.setState({ userId: 'user-1', orgId: 'ORG1' }); });
    await act(async () => { resolve(baseDetail({ introFr: 'Synthetic draft C' })); });
    expect(sendListByEmail).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mot d'introduction")).toHaveValue('Synthetic draft C');
    // The old actor generation's ACK was intentionally not adopted. A fresh
    // gesture must save the retained C under the current identity before SMTP.
    jest.mocked(updateList).mockResolvedValue(baseDetail({ introFr: 'Synthetic draft C' }));
    fireEvent.click(screen.getByRole('button', { name: /^envoyer$/i }));
    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledTimes(1));
    expect(updateList).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent('E-mail envoyé');
  });
  it('a late SMTP result after account ABA cannot display an old notice or leave the new view locked', async () => {
    let resolve!: (result: { trackingUpdated: boolean }) => void;
    jest.mocked(sendListByEmail).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /^envoyer$/i }));
    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledTimes(1));
    const intent = jest.mocked(sendListByEmail).mock.calls[0][2]!;
    act(() => { useSessionStore.setState({ userId: 'user-B' }); useSessionStore.setState({ userId: 'user-1' }); });
    expect(intent.isCurrent?.()).toBe(false); expect(intent.signal?.aborted).toBe(true);
    await act(async () => { resolve({ trackingUpdated: true }); });
    expect(screen.queryByText(/E-mail envoyé à/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^envoyer$/i })).not.toBeDisabled();
  });
  it('navigation during a deferred flush never sends list A through the new list B view', async () => {
    let resolve!: (detail: ObjectListDetail) => void;
    jest.mocked(getList).mockImplementation(async (id) => baseDetail({ id }));
    jest.mocked(updateList).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    jest.mocked(sendListByEmail).mockResolvedValue({ trackingUpdated: true });
    const view = renderView();
    fireEvent.change(await screen.findByLabelText("Mot d'introduction"), { target: { value: 'Synthetic list A draft' } });
    fireEvent.click(screen.getByRole('button', { name: /^envoyer$/i }));
    await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
    view.showList('list-B');
    await screen.findByLabelText('Nom de la liste');
    await act(async () => { resolve(baseDetail({ introFr: 'Synthetic list A draft' })); });
    expect(sendListByEmail).not.toHaveBeenCalled();
    jest.mocked(updateList).mockResolvedValue(baseDetail({ id: 'list-B' }));
    fireEvent.click(screen.getByRole('button', { name: /^envoyer$/i }));
    await waitFor(() => expect(sendListByEmail).toHaveBeenCalledWith('list-B', 'recipient@example.invalid', expect.any(Object)));
    expect(await screen.findByRole('status')).toHaveTextContent('E-mail envoyé');
  });

});

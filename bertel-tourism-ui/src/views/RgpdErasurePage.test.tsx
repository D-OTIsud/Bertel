import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { useLayoutEffect } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RgpdErasurePage from './RgpdErasurePage';
import { useSessionStore } from '@/store/session-store';
import { toast } from 'sonner';
import { rgpdStartReferenceKey } from '@/services/rgpd-start-reference';

let mockSession: { access_token: string; user: { id: string } } | null = null;

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: mockSession } }) },
  }),
}));
jest.mock('@/services/object-workspace', () => ({
  searchActors: jest.fn().mockResolvedValue([]),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID_B = '44444444-4444-4444-8444-444444444444';
const RESUME_BUTTON = 'Reprendre le nettoyage de cette opération';
const UNCONFIRMED_TITLE = 'Statut non confirmé';
const KEY_A = rgpdStartReferenceKey(USER_A);
const KEY_B = rgpdStartReferenceKey(USER_B);
const REFERENCE_A = JSON.stringify({ version: 1, requestId: REQUEST_ID, fingerprint: 'a'.repeat(64) });
const REFERENCE_B = JSON.stringify({ version: 1, requestId: REQUEST_ID_B, fingerprint: 'b'.repeat(64) });

type Body = Record<string, unknown>;
type Kind = 'start' | 'lookup' | 'resume';
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };

function kindOf(body: Body): Kind {
  if ('subjectKind' in body) return 'start';
  return 'operationId' in body ? 'resume' : 'lookup';
}

function reply(payload: unknown, status = 200): Reply {
  return { ok: status < 300, status, json: async () => payload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function completedFor(requestId: string) {
  return {
    ok: true,
    status: 'completed' as const,
    operationId: OPERATION_ID,
    report: { startRequestId: requestId },
    tasks: [],
    cleanupStatusUnavailable: false,
    counts: { total: 0, succeeded: 0, pending: 0, failed: 0 },
  };
}

function partialFor(requestId: string) {
  return {
    ...completedFor(requestId),
    ok: false,
    status: 'partial' as const,
    counts: { total: 2, succeeded: 1, pending: 1, failed: 0 },
  };
}

function unexpected(name: string) {
  return async (): Promise<Reply> => {
    throw new Error(`Appel inattendu : ${name}`);
  };
}

let handlers: Record<Kind, (body: Body) => Promise<Reply>>;
const fetchMock = jest.fn((_url: string, init: RequestInit) => {
  const body = JSON.parse(init.body as string) as Body;
  return handlers[kindOf(body)](body);
});

function calls(kind: Kind): Body[] {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse(init.body as string) as Body)
    .filter((body) => kindOf(body) === kind);
}

function identity(userId: string, epoch = 1) {
  mockSession = { access_token: `synthetic-token-${userId}`, user: { id: userId } };
  useSessionStore.setState({
    authAuthority: { userId, epoch, hydrated: true },
    userId,
    role: 'super_admin',
    status: 'ready',
    demoMode: false,
  });
}

function setUuidSubject() {
  fireEvent.click(screen.getByText(/coller un UUID/i));
  fireEvent.change(screen.getByLabelText(/Identifiant du sujet/i), { target: { value: VALID_UUID } });
}

function reasonField() {
  return screen.getByLabelText(/Motif/i);
}

async function openAnonymizeDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));
  return screen.findByRole('dialog');
}

async function confirmAnonymize() {
  const dialog = await openAnonymizeDialog();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function installLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, callback: () => unknown) => {
        const run = tail.then(() => callback());
        tail = run.catch(() => undefined);
        return run;
      },
    },
  });
}

function failRgpdWrites() {
  const realSetItem = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(this: Storage, key: string, value: string) {
    if (key.startsWith('bertel-rgpd-start:')) throw new Error('quota');
    realSetItem.call(this, key, value);
  });
}

function hideRgpdReadback() {
  const realGetItem = Storage.prototype.getItem;
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(this: Storage, key: string) {
    return key.startsWith('bertel-rgpd-start:') ? null : realGetItem.call(this, key);
  });
}

describe('RgpdErasurePage', () => {
  const realFetch = global.fetch;

  beforeAll(() => {
    Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
    global.TextEncoder = NodeTextEncoder as typeof TextEncoder;
  });

  beforeEach(() => {
    window.localStorage.clear();
    installLocks();
    fetchMock.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
    handlers = {
      start: async (body) => reply(completedFor(body.requestId as string)),
      lookup: unexpected('lookup'),
      resume: unexpected('resume'),
    };
    identity(USER_A);
    (toast.success as jest.Mock).mockClear();
    (toast.warning as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  describe('parcours existants', () => {
    it('rend une carte « accès refusé » (role=alert) pour un non-référent', () => {
      useSessionStore.setState({ role: 'tourism_agent' });
      render(<RgpdErasurePage />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Accès réservé/i)).toBeInTheDocument();
    });

    it("le clic sur Soumettre ouvre la modale sans appel réseau ni référence", async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      expect(await openAnonymizeDialog()).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
    });

    it('confirmer en anonymisation envoie un seul START (pas de garde de saisie)', async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(calls('start')).toHaveLength(1));
      expect(calls('start')[0]).toEqual({
        requestId: expect.any(String),
        subjectKind: 'actor',
        subjectId: VALID_UUID,
        mode: 'anonymize',
        reason: null,
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it('en suppression, la confirmation exige la saisie-pour-confirmer', async () => {
      render(<RgpdErasurePage />);
      fireEvent.click(screen.getByRole('radio', { name: /Supprimer/i }));
      setUuidSubject();
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer le sujet' }));
      const dialog = await screen.findByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: 'Supprimer le sujet' });
      expect(confirmBtn).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(confirmBtn);
      await flush();
      expect(calls('start')).toHaveLength(0);
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
      fireEvent.change(within(dialog).getByLabelText(/SUPPRIMER/i), { target: { value: 'SUPPRIMER' } });
      expect(confirmBtn).not.toHaveAttribute('aria-disabled');
      fireEvent.click(confirmBtn);
      await waitFor(() => expect(calls('start')).toHaveLength(1));
      expect(calls('start')[0].mode).toBe('delete');
    });

    it('un résultat partial affiche un warning, ne réinitialise pas le formulaire et propose la reprise', async () => {
      handlers.start = async (body) => reply(partialFor(body.requestId as string), 207);
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();

      expect(await screen.findByRole('button', { name: RESUME_BUTTON })).toBeInTheDocument();
      expect(toast.warning).toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/Identifiant du sujet/i)).toHaveValue(VALID_UUID);
    });

    it('la reprise après partial fait lookup puis RESUME du vrai operationId, jamais un second START', async () => {
      let requestId = '';
      handlers.start = async (body) => {
        requestId = body.requestId as string;
        return reply(partialFor(requestId), 207);
      };
      handlers.lookup = async () => reply({ requestId, operationId: OPERATION_ID });
      handlers.resume = async () => reply(completedFor(requestId));

      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      fireEvent.click(await screen.findByRole('button', { name: RESUME_BUTTON }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Nettoyage repris et terminé.'));
      expect(calls('lookup')).toEqual([{ requestId }]);
      expect(calls('resume')).toEqual([{ operationId: OPERATION_ID }]);
      expect(calls('start')).toHaveLength(1);
      expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: `Bearer synthetic-token-${USER_A}` });
      expect(screen.getByText('Sujet anonymisé')).toBeInTheDocument();
    });
  });

  describe('(1) admission fermée', () => {
    it("une écriture refusée n'émet aucun START", async () => {
      failRgpdWrites();
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("une relecture différente n'émet aucun START", async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      hideRgpdReadback();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("WebCrypto indisponible : ni référence ni START", async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: undefined });
      try {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        await flush();
      } finally {
        Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
    });

    it("une valeur existante invalide bloque sans modale, sans réécriture et sans START", async () => {
      window.localStorage.setItem(KEY_A, '{"version":1}');
      render(<RgpdErasurePage />);
      setUuidSubject();
      fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBe('{"version":1}');
    });

    it("une référence non résolue n'est jamais remplacée et n'ouvre pas de START", async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      render(<RgpdErasurePage />);
      setUuidSubject();
      fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
    });

    it("une référence écrite par un autre onglet après l'ouverture bloque le START", async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
    });

    it('un double clic de confirmation émet un seul START', async () => {
      const start = deferred<Reply>();
      handlers.start = () => start.promise;
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      const confirm = within(dialog).getByRole('button', { name: 'Anonymiser' });
      fireEvent.click(confirm);
      fireEvent.click(confirm);

      await waitFor(() => expect(calls('start')).toHaveLength(1));
      await flush();
      expect(calls('start')).toHaveLength(1);
      await act(async () => start.resolve(reply(completedFor(calls('start')[0].requestId as string))));
    });

    it('un jeton appartenant à un autre compte ne crée ni référence ni START', async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      mockSession = { access_token: 'synthetic-token-other', user: { id: USER_B } };
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Session expirée — reconnectez-vous.'));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
    });
  });

  describe('(2) réponse START perdue', () => {
    it('après reload : même requestId, lookup puis RESUME de la même opération, aucun second START', async () => {
      handlers.start = async () => {
        throw new TypeError('network down');
      };
      const first = render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(calls('start')).toHaveLength(1));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());

      const requestId = calls('start')[0].requestId as string;
      expect(JSON.parse(window.localStorage.getItem(KEY_A) as string).requestId).toBe(requestId);
      expect(toast.success).not.toHaveBeenCalled();
      expect(await screen.findByText(UNCONFIRMED_TITLE)).toBeInTheDocument();

      first.unmount();
      fetchMock.mockClear();
      handlers.start = unexpected('START après reload');
      handlers.lookup = async () => reply({ requestId, operationId: OPERATION_ID });
      handlers.resume = async () => reply(completedFor(requestId));
      render(<RgpdErasurePage />);

      expect(await screen.findByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
      expect(screen.getByText(requestId)).toBeInTheDocument();
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: RESUME_BUTTON }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Nettoyage repris et terminé.'));

      expect(calls('lookup')).toEqual([{ requestId }]);
      expect(calls('resume')).toEqual([{ operationId: OPERATION_ID }]);
      expect(calls('start')).toHaveLength(0);
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
      const panel = within(screen.getByRole('status'));
      expect(panel.getByText('Nettoyage repris et terminé.')).toBeInTheDocument();
      expect(panel.queryByText('Mode')).not.toBeInTheDocument();
      expect(panel.queryByText('Sujet')).not.toBeInTheDocument();
    });

    it("une reprise ne réutilise pas le formulaire en cours", async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      handlers.lookup = async () => reply({ requestId: REQUEST_ID, operationId: OPERATION_ID });
      handlers.resume = async () => reply(partialFor(REQUEST_ID), 207);
      render(<RgpdErasurePage />);
      setUuidSubject();
      fireEvent.change(reasonField(), { target: { value: 'motif en cours' } });

      fireEvent.click(await screen.findByRole('button', { name: RESUME_BUTTON }));
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      expect(calls('resume')).toEqual([{ operationId: OPERATION_ID }]);
      const panel = within(screen.getByRole('status'));
      expect(panel.queryByText('Mode')).not.toBeInTheDocument();
      expect(panel.queryByText('Sujet')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Identifiant du sujet/i)).toHaveValue(VALID_UUID);
      expect(reasonField()).toHaveValue('motif en cours');
      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
    });
  });

  describe('(3) lookup absent ou en erreur', () => {
    it.each<[string, () => Promise<Reply>]>([
      ['404', async () => reply({ error: 'operation_not_found' }, 404)],
      ['500', async () => reply({ error: 'operation_lookup_failed' }, 500)],
      ['transport', async () => { throw new TypeError('network down'); }],
      ['enveloppe invalide', async () => reply({ requestId: REQUEST_ID, operationId: OPERATION_ID, extra: true })],
    ])('%s : référence conservée, zéro START, zéro RESUME', async (_label, lookup) => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      handlers.lookup = lookup;
      render(<RgpdErasurePage />);

      fireEvent.click(await screen.findByRole('button', { name: RESUME_BUTTON }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      await flush();

      expect(calls('lookup')).toEqual([{ requestId: REQUEST_ID }]);
      expect(calls('start')).toHaveLength(0);
      expect(calls('resume')).toHaveLength(0);
      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
      expect(screen.getByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
    });

    it('aucun lookup ni START au montage', async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      render(<RgpdErasurePage />);
      expect(await screen.findByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('(4) comptes et epochs', () => {
    it.each([
      { account: 'B', userId: USER_B, epoch: 2 },
      { account: 'A dans une nouvelle epoch', userId: USER_A, epoch: 3 },
    ])('ne rend aucun champ de A au premier commit de $account, avant les effets passifs', ({ userId, epoch }) => {
      const observed: { reason: string; subject: string | null; startDisabled: boolean }[] = [];
      function ObserveAccountCommit() {
        const ownerKey = useSessionStore((state) => `${state.authAuthority?.epoch}:${state.authAuthority?.userId}`);
        useLayoutEffect(() => {
          if (ownerKey !== `${epoch}:${userId}`) return;
          observed.push({
            reason: (reasonField() as HTMLTextAreaElement).value,
            subject: (screen.queryByLabelText(/Identifiant du sujet/i) as HTMLInputElement | null)?.value ?? null,
            startDisabled: (screen.getByRole('button', { name: 'Anonymiser le sujet' }) as HTMLButtonElement).disabled,
          });
        }, [ownerKey]);
        return <RgpdErasurePage />;
      }
      render(<ObserveAccountCommit />);
      setUuidSubject();
      fireEvent.change(reasonField(), { target: { value: 'Motif synthétique du compte A' } });

      act(() => identity(userId, epoch));

      expect(observed).toEqual([{ reason: '', subject: null, startDisabled: true }]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("une vieille réponse START de A n'affiche rien et ne touche ni A ni B", async () => {
      window.localStorage.setItem(KEY_B, REFERENCE_B);
      const start = deferred<Reply>();
      handlers.start = () => start.promise;
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(calls('start')).toHaveLength(1));
      const requestIdA = calls('start')[0].requestId as string;
      const storedA = window.localStorage.getItem(KEY_A);

      act(() => identity(USER_B, 2));
      expect(await screen.findByText(REQUEST_ID_B)).toBeInTheDocument();
      expect(screen.queryByText(requestIdA)).not.toBeInTheDocument();

      await act(async () => start.resolve(reply(completedFor(requestIdA))));
      await flush();

      expect(window.localStorage.getItem(KEY_A)).toBe(storedA);
      expect(window.localStorage.getItem(KEY_B)).toBe(REFERENCE_B);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByText(OPERATION_ID)).not.toBeInTheDocument();
      expect(screen.getByText(REQUEST_ID_B)).toBeInTheDocument();
      expect(screen.getByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
    });

    it('ABA : la réponse de la première epoch de A reste sans effet', async () => {
      const start = deferred<Reply>();
      handlers.start = () => start.promise;
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(calls('start')).toHaveLength(1));
      const requestIdA = calls('start')[0].requestId as string;
      const storedA = window.localStorage.getItem(KEY_A);

      act(() => identity(USER_B, 2));
      act(() => identity(USER_A, 3));
      expect(await screen.findByText(requestIdA)).toBeInTheDocument();

      await act(async () => start.resolve(reply(completedFor(requestIdA))));
      await flush();

      expect(window.localStorage.getItem(KEY_A)).toBe(storedA);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByText(OPERATION_ID)).not.toBeInTheDocument();
      expect(screen.getByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
    });

    it("A vers invité masque l'état de A sans effacer sa référence", async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      render(<RgpdErasurePage />);
      expect(await screen.findByText(REQUEST_ID)).toBeInTheDocument();

      act(() => useSessionStore.getState().setGuest());

      expect(screen.queryByText(REQUEST_ID)).not.toBeInTheDocument();
      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
    });

    it("un lookup tardif de A n'appelle pas RESUME pour B", async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      window.localStorage.setItem(KEY_B, REFERENCE_B);
      const lookup = deferred<Reply>();
      handlers.lookup = () => lookup.promise;
      render(<RgpdErasurePage />);
      fireEvent.click(await screen.findByRole('button', { name: RESUME_BUTTON }));
      await waitFor(() => expect(calls('lookup')).toHaveLength(1));

      act(() => identity(USER_B, 2));
      await act(async () => lookup.resolve(reply({ requestId: REQUEST_ID, operationId: OPERATION_ID })));
      await flush();

      expect(calls('resume')).toHaveLength(0);
      expect(toast.success).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
      expect(window.localStorage.getItem(KEY_B)).toBe(REFERENCE_B);
    });

    it('un changement de compte avant confirmation ferme la modale sans START', async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      await openAnonymizeDialog();

      act(() => identity(USER_B, 2));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await flush();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
      expect(window.localStorage.getItem(KEY_B)).toBeNull();
    });
  });

  describe('(5) saisie concurrente', () => {
    it('un changement entre confirmation et admission ne crée ni référence ni START', async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      fireEvent.change(reasonField(), { target: { value: 'nouveau motif' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      await flush();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
      expect(reasonField()).toHaveValue('nouveau motif');
    });

    it('la modale affiche le snapshot confirmé, pas la saisie qui change derrière', async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      const dialog = await openAnonymizeDialog();
      fireEvent.change(screen.getByLabelText(/Identifiant du sujet/i), { target: { value: '' } });
      expect(within(dialog).getByText(VALID_UUID)).toBeInTheDocument();
    });

    it("un retour tardif ne vide pas une saisie différente et n'envoie que le snapshot", async () => {
      const start = deferred<Reply>();
      handlers.start = () => start.promise;
      render(<RgpdErasurePage />);
      setUuidSubject();
      fireEvent.change(reasonField(), { target: { value: 'motif confirmé' } });
      await confirmAnonymize();
      await waitFor(() => expect(calls('start')).toHaveLength(1));
      const body = calls('start')[0];
      expect(body.reason).toBe('motif confirmé');

      fireEvent.change(reasonField(), { target: { value: 'saisie suivante' } });
      await act(async () => start.resolve(reply(completedFor(body.requestId as string))));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      expect(reasonField()).toHaveValue('saisie suivante');
      expect(screen.getByLabelText(/Identifiant du sujet/i)).toHaveValue(VALID_UUID);
      expect(calls('start')).toHaveLength(1);
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
    });

    it('un retour completed vide le formulaire quand la saisie est restée celle du snapshot', async () => {
      render(<RgpdErasurePage />);
      fireEvent.change(reasonField(), { target: { value: 'motif' } });
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      await waitFor(() => expect(reasonField()).toHaveValue(''));
    });
  });

  describe('(6) cycle de vie de la référence', () => {
    it('un completed lié retire la référence', async () => {
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(window.localStorage.getItem(KEY_A)).toBeNull();
      expect(screen.getByText('Sujet anonymisé')).toBeInTheDocument();
    });

    it.each<[string, (requestId: string) => unknown]>([
      ['partial', (requestId) => partialFor(requestId)],
      ['failed', (requestId) => ({ ...partialFor(requestId), status: 'failed' })],
      ['cleanupStatusUnavailable', (requestId) => ({ ...partialFor(requestId), cleanupStatusUnavailable: true })],
    ])('%s conserve la référence et ne montre aucun succès', async (_label, build) => {
      handlers.start = async (body) => reply(build(body.requestId as string), 207);
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      const stored = JSON.parse(window.localStorage.getItem(KEY_A) as string);
      expect(stored.requestId).toBe(calls('start')[0].requestId);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByText('Sujet anonymisé')).not.toBeInTheDocument();
      // findBy : la modale en fondu de sortie masque encore le reste de la page aux rôles ARIA.
      expect(await screen.findByRole('button', { name: RESUME_BUTTON })).toBeInTheDocument();
    });

    it.each<[string, number, unknown]>([
      ['une erreur HTTP', 500, { error: 'erase_failed' }],
      ['une réponse hors contrat', 200, { ok: true }],
    ])('%s conserve la référence et affiche Statut non confirmé', async (_label, status, payload) => {
      handlers.start = async () => reply(payload, status);
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(toast.error).toHaveBeenCalled());

      expect(window.localStorage.getItem(KEY_A)).not.toBeNull();
      expect(toast.success).not.toHaveBeenCalled();
      expect(await screen.findByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
    });

    it('un completed lié à un autre START ne retire rien et ne montre aucun succès', async () => {
      handlers.start = async () => reply(completedFor(REQUEST_ID_B));
      render(<RgpdErasurePage />);
      setUuidSubject();
      await confirmAnonymize();
      await waitFor(() => expect(toast.error).toHaveBeenCalled());

      expect(window.localStorage.getItem(KEY_A)).not.toBeNull();
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByText('Sujet anonymisé')).not.toBeInTheDocument();
      expect(await screen.findByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
    });

    it('une reprise partial conserve la référence', async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      handlers.lookup = async () => reply({ requestId: REQUEST_ID, operationId: OPERATION_ID });
      handlers.resume = async () => reply(partialFor(REQUEST_ID), 207);
      render(<RgpdErasurePage />);

      fireEvent.click(await screen.findByRole('button', { name: RESUME_BUTTON }));
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
      expect(screen.getByText(/nettoyage incomplet/i)).toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("une reprise completed d'une autre opération ne retire rien", async () => {
      window.localStorage.setItem(KEY_A, REFERENCE_A);
      handlers.lookup = async () => reply({ requestId: REQUEST_ID, operationId: OPERATION_ID });
      handlers.resume = async () => reply({ ...completedFor(REQUEST_ID), operationId: VALID_UUID });
      render(<RgpdErasurePage />);

      fireEvent.click(await screen.findByRole('button', { name: RESUME_BUTTON }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());

      expect(window.localStorage.getItem(KEY_A)).toBe(REFERENCE_A);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText(UNCONFIRMED_TITLE)).toBeInTheDocument();
    });
  });

  describe('(7) contenu du stockage', () => {
    it('ne contient que les trois champs techniques exacts', async () => {
      const start = deferred<Reply>();
      handlers.start = () => start.promise;
      const reason = 'motif-synthetique-confidentiel';
      render(<RgpdErasurePage />);
      setUuidSubject();
      fireEvent.change(reasonField(), { target: { value: `  ${reason}  ` } });
      await confirmAnonymize();
      await waitFor(() => expect(calls('start')).toHaveLength(1));

      const requestId = calls('start')[0].requestId as string;
      const raw = window.localStorage.getItem(KEY_A) as string;
      const expectedFingerprint = createHash('sha256')
        .update(JSON.stringify(['actor', VALID_UUID, 'anonymize', reason]))
        .digest('hex');

      expect(window.localStorage).toHaveLength(1);
      expect(raw).toBe(JSON.stringify({ version: 1, requestId, fingerprint: expectedFingerprint }));
      expect(raw).not.toContain(reason);
      expect(raw).not.toContain(VALID_UUID);
      expect(raw).not.toContain('synthetic-token');
      expect(raw).not.toContain('/api/');

      await act(async () => start.resolve(reply(completedFor(requestId))));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });
  });
});

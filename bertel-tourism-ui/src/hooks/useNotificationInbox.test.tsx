// Garde de la veille des notifications (16w). Le point le plus facile à casser sans que
// personne ne s'en aperçoive : la PREMIÈRE lecture ne doit annoncer AUCUNE notification.
// Sinon chaque rechargement de page rejouerait toutes les non-lues en toasts — exactement
// le bruit que la règle « on ne se notifie pas soi-même » cherche déjà à éviter.
//
// Le rafraîchissement est piloté ICI par un `refetchQueries` explicite plutôt que par un
// évènement de focus : on éprouve la LOGIQUE d'annonce, pas le gestionnaire de focus de
// React Query (le tester reviendrait à tester la librairie, avec la flakiness en prime).

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNotificationInbox } from './useNotificationInbox';
import { useSessionStore } from '../store/session-store';
import * as notifications from '../services/notifications';

jest.mock('../services/notifications', () => ({
  ...jest.requireActual('../services/notifications'),
  listMyNotifications: jest.fn(),
  countMyUnreadNotifications: jest.fn(),
}));

const info = jest.fn();
jest.mock('./useToast', () => ({
  useToast: () => ({ info, success: jest.fn(), error: jest.fn(), warning: jest.fn() }),
}));

const mocked = notifications as jest.Mocked<typeof notifications>;

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Simule un tick de la veille (le vrai déclencheur est l'intervalle ou le retour d'onglet). */
async function pollAgain() {
  await act(async () => {
    await client.refetchQueries({ queryKey: ['notifications'] });
  });
}

function inboxItem(id: string) {
  return {
    id,
    kind: 'crm_task_assigned' as const,
    createdAt: '2026-08-28T10:00:00Z',
    readAt: null,
    taskId: 't1',
    taskTitle: `Tâche ${id}`,
    objectId: 'obj-1',
    objectName: 'Hôtel Test',
    createdById: 'u-jean',
    createdByName: 'Jean P.',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState({ userId: 'u-me', demoMode: false } as never);
  mocked.countMyUnreadNotifications.mockResolvedValue(0);
  mocked.listMyNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
});

it('la PREMIÈRE lecture ne toaste rien, même avec des non-lues en attente', async () => {
  mocked.countMyUnreadNotifications.mockResolvedValue(3);
  mocked.listMyNotifications.mockResolvedValue({ items: [inboxItem('n1')], unreadCount: 3 });
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(3));
  // Un relevé SILENCIEUX part pour mémoriser les ids déjà là…
  await waitFor(() => expect(mocked.listMyNotifications).toHaveBeenCalledTimes(1));
  // …et rien n'est annoncé : ces 3 non-lues existaient avant l'ouverture de l'onglet.
  expect(info).not.toHaveBeenCalled();
});

it('boîte vide à l’ouverture : pas même de relevé (aucun id à mémoriser)', async () => {
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(mocked.countMyUnreadNotifications).toHaveBeenCalled());
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  expect(mocked.listMyNotifications).not.toHaveBeenCalled();
  expect(info).not.toHaveBeenCalled();
});

it('les non-lues DÉJÀ là ne sont pas rejouées quand une neuve arrive', async () => {
  // Le cas qui rend le relevé initial nécessaire : trois non-lues traînent depuis hier.
  // Sans lui, la première arrivée réelle produirait QUATRE toasts au lieu d'un.
  mocked.countMyUnreadNotifications.mockResolvedValue(3);
  mocked.listMyNotifications.mockResolvedValue({
    items: [inboxItem('vieille-1'), inboxItem('vieille-2'), inboxItem('vieille-3')],
    unreadCount: 3,
  });
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(mocked.listMyNotifications).toHaveBeenCalledTimes(1));
  expect(info).not.toHaveBeenCalled();

  mocked.countMyUnreadNotifications.mockResolvedValue(4);
  mocked.listMyNotifications.mockResolvedValue({
    items: [inboxItem('neuve'), inboxItem('vieille-1'), inboxItem('vieille-2'), inboxItem('vieille-3')],
    unreadCount: 4,
  });
  await pollAgain();
  await waitFor(() => expect(result.current.unreadCount).toBe(4));
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche neuve');
});

it('une notification qui ARRIVE ensuite est annoncée, une seule fois', async () => {
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(mocked.countMyUnreadNotifications).toHaveBeenCalled());
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  expect(info).not.toHaveBeenCalled();

  // Le compteur MONTE : la sonde d'ids part et nomme la nouvelle.
  mocked.countMyUnreadNotifications.mockResolvedValue(1);
  mocked.listMyNotifications.mockResolvedValue({ items: [inboxItem('n-neuve')], unreadCount: 1 });
  await pollAgain();
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  await waitFor(() => expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche n-neuve'));
  expect(info).toHaveBeenCalledTimes(1);

  // Le compteur remonte encore, mais la boîte porte le MÊME id : pas de seconde annonce.
  mocked.countMyUnreadNotifications.mockResolvedValue(2);
  mocked.listMyNotifications.mockResolvedValue({ items: [inboxItem('n-neuve')], unreadCount: 2 });
  await pollAgain();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  expect(info).toHaveBeenCalledTimes(1);
});

it('n’annonce que les NON LUES : une déjà lue dans la sonde reste muette', async () => {
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(mocked.countMyUnreadNotifications).toHaveBeenCalled());
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  mocked.countMyUnreadNotifications.mockResolvedValue(1);
  mocked.listMyNotifications.mockResolvedValue({
    items: [{ ...inboxItem('n-lue'), readAt: '2026-08-28T11:00:00Z' }, inboxItem('n-fraiche')],
    unreadCount: 1,
  });
  await pollAgain();
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche n-fraiche');
});

it('un compteur qui BAISSE (lecture ailleurs) n’annonce rien', async () => {
  mocked.countMyUnreadNotifications.mockResolvedValue(4);
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(4));
  mocked.countMyUnreadNotifications.mockResolvedValue(1);
  const probesBefore = mocked.listMyNotifications.mock.calls.length;
  await pollAgain();
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  expect(info).not.toHaveBeenCalled();
  // Aucune sonde SUPPLÉMENTAIRE : une baisse ne demande aucun id.
  expect(mocked.listMyNotifications).toHaveBeenCalledTimes(probesBefore);
});

it('sans identité de session : aucune requête (une boîte anonyme n’existe pas)', async () => {
  useSessionStore.setState({ userId: null } as never);
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  expect(mocked.countMyUnreadNotifications).not.toHaveBeenCalled();
});

it('l’échec de la sonde d’ids ne casse pas la pastille (elle vient du compteur)', async () => {
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(mocked.countMyUnreadNotifications).toHaveBeenCalled());
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  mocked.countMyUnreadNotifications.mockResolvedValue(2);
  mocked.listMyNotifications.mockRejectedValue(new Error('réseau coupé'));
  await pollAgain();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  expect(info).not.toHaveBeenCalled();
});

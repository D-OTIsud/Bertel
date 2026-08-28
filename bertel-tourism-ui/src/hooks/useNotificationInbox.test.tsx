// Garde de la veille des notifications (16w).
//
// Deux propriétés, et la seconde est celle qu'une revue a trouvée manquante :
//  1. la PREMIÈRE lecture n'annonce RIEN — sinon chaque rechargement de page rejouerait
//     toutes les non-lues en attente ;
//  2. une arrivée est annoncée **même quand le nombre de non-lues ne bouge pas**. La
//     première rédaction déduisait « il y a du neuf » d'une HAUSSE du compteur : lire une
//     ancienne notification pendant qu'une neuve arrive laisse le compte identique, et la
//     neuve passait à la trappe, sans erreur. On observe donc les ids, pas la cardinalité.

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNotificationInbox } from './useNotificationInbox';
import { useSessionStore } from '../store/session-store';
import * as notifications from '../services/notifications';

jest.mock('../services/notifications', () => ({
  ...jest.requireActual('../services/notifications'),
  listMyNotifications: jest.fn(),
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

function item(id: string, readAt: string | null = null) {
  return {
    id,
    kind: 'crm_task_assigned' as const,
    createdAt: '2026-08-28T10:00:00Z',
    readAt,
    taskId: 't1',
    taskTitle: `Tâche ${id}`,
    objectId: 'obj-1',
    objectName: 'Hôtel Test',
    createdById: 'u-jean',
    createdByName: 'Jean P.',
  };
}

const inbox = (items: ReturnType<typeof item>[]) => ({
  items,
  unreadCount: items.filter((i) => !i.readAt).length,
});

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState({ userId: 'u-me', demoMode: false } as never);
  mocked.listMyNotifications.mockResolvedValue(inbox([]));
});

it('la PREMIÈRE lecture ne toaste rien, même avec des non-lues en attente', async () => {
  mocked.listMyNotifications.mockResolvedValue(inbox([item('n1'), item('n2'), item('n3')]));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(3));
  // La pastille dit 3… et rien n'est annoncé : ces 3 existaient avant l'ouverture de l'onglet.
  expect(info).not.toHaveBeenCalled();
});

it('les non-lues DÉJÀ là ne sont pas rejouées quand une neuve arrive', async () => {
  mocked.listMyNotifications.mockResolvedValue(inbox([item('vieille-1'), item('vieille-2')]));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(2));

  mocked.listMyNotifications.mockResolvedValue(inbox([item('neuve'), item('vieille-1'), item('vieille-2')]));
  await pollAgain();
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche neuve');
});

// ── Le défaut trouvé en revue ────────────────────────────────────────────────────────────
it('annonce une arrivée même quand le NOMBRE de non-lues ne bouge pas', async () => {
  mocked.listMyNotifications.mockResolvedValue(inbox([item('a'), item('b')]));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  expect(info).not.toHaveBeenCalled();

  // « a » est lue ailleurs ET « c » arrive dans le même intervalle : le compte reste 2.
  // Une veille qui déduit le neuf d'une hausse ne verrait RIEN ici.
  mocked.listMyNotifications.mockResolvedValue(inbox([item('c'), item('a', '2026-08-28T11:00:00Z'), item('b')]));
  await pollAgain();
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche c');
  expect(result.current.unreadCount).toBe(2);
});

it('annonce même quand le compte BAISSE, si un id neuf est apparu', async () => {
  mocked.listMyNotifications.mockResolvedValue(inbox([item('a'), item('b'), item('c')]));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(3));

  // Deux lues, une neuve : 3 → 2, et pourtant « d » doit être annoncée.
  mocked.listMyNotifications.mockResolvedValue(
    inbox([item('d'), item('a', '2026-08-28T11:00:00Z'), item('b', '2026-08-28T11:00:00Z'), item('c')]),
  );
  await pollAgain();
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche d');
});

it('une notification n’est annoncée qu’UNE fois, même si la boîte est relue', async () => {
  // On part d'une boîte NON VIDE : `unreadCount` vaut 0 aussi pendant que la requête est en
  // vol, donc l'attendre à 0 ne prouverait pas que le relevé initial a eu lieu.
  mocked.listMyNotifications.mockResolvedValue(inbox([item('deja-la')]));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  mocked.listMyNotifications.mockResolvedValue(inbox([item('n'), item('deja-la')]));
  await pollAgain();
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  await pollAgain();
  await pollAgain();
  expect(info).toHaveBeenCalledTimes(1);
});

it('n’annonce que les NON LUES : une ligne déjà lue reste muette', async () => {
  mocked.listMyNotifications.mockResolvedValue(inbox([item('deja-la')]));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  mocked.listMyNotifications.mockResolvedValue(
    inbox([item('lue', '2026-08-28T11:00:00Z'), item('fraiche'), item('deja-la')]),
  );
  await pollAgain();
  await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
  expect(info).toHaveBeenCalledWith('Nouvelle tâche assignée', 'Tâche fraiche');
});

it('la pastille vient du SERVEUR, pas du nombre de lignes rendues', async () => {
  // `unread_count` porte sur toute la boîte ; la page, elle, est plafonnée.
  mocked.listMyNotifications.mockResolvedValue({ items: [item('a')], unreadCount: 137 });
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(137));
});

it('sans identité de session : aucune requête (une boîte anonyme n’existe pas)', async () => {
  useSessionStore.setState({ userId: null } as never);
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  expect(mocked.listMyNotifications).not.toHaveBeenCalled();
});

it('une erreur de chargement ne casse rien et n’annonce rien', async () => {
  mocked.listMyNotifications.mockRejectedValue(new Error('réseau coupé'));
  const { result } = renderHook(() => useNotificationInbox(), { wrapper });
  await waitFor(() => expect(mocked.listMyNotifications).toHaveBeenCalled());
  expect(result.current.unreadCount).toBe(0);
  expect(info).not.toHaveBeenCalled();
});

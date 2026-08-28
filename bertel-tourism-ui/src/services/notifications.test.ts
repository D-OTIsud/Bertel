// Garde du service notifications (16w) : contrat RPC réellement envoyé + parsing défensif.
// Aucune de ces fonctions ne doit pouvoir viser la boîte de quelqu'un d'autre — le
// destinataire est décidé serveur (auth.uid()) et n'apparaît DANS AUCUN paramètre.

import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  parseAppNotification,
  parseAppNotificationInbox,
} from './notifications';
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

jest.mock('../lib/supabase', () => ({
  ...jest.requireActual('../lib/supabase'),
  getApiClient: jest.fn(),
}));

const mockedGetApiClient = jest.mocked(getApiClient);

function fakeRpcClient(result: unknown = null) {
  const rpc = jest.fn(async () => ({ data: result, error: null }));
  mockedGetApiClient.mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as unknown as ReturnType<typeof getApiClient>);
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ demoMode: false, userId: 'u-me' } as never);
});

describe('parsing défensif', () => {
  it('parse une notification complète', () => {
    expect(
      parseAppNotification({
        id: 'n1',
        kind: 'crm_task_assigned',
        created_at: '2026-08-28T10:00:00Z',
        read_at: null,
        task_id: 't1',
        task_title: 'Rappeler le directeur',
        object_id: 'obj-1',
        object_name: 'Hôtel Test',
        created_by_id: 'u-jean',
        created_by_name: 'Jean P.',
      }),
    ).toEqual({
      id: 'n1',
      kind: 'crm_task_assigned',
      createdAt: '2026-08-28T10:00:00Z',
      readAt: null,
      taskId: 't1',
      taskTitle: 'Rappeler le directeur',
      objectId: 'obj-1',
      objectName: 'Hôtel Test',
      createdById: 'u-jean',
      createdByName: 'Jean P.',
    });
  });

  it('une ligne sans id est ignorée : elle n’est pas adressable', () => {
    expect(parseAppNotification({ kind: 'crm_task_assigned' })).toBeNull();
  });

  it('un émetteur inconnu reste null — jamais deviné', () => {
    const parsed = parseAppNotification({ id: 'n1', created_by_name: null, task_title: null });
    expect(parsed?.createdByName).toBeNull();
    expect(parsed?.taskTitle).toBeNull();
  });

  it('une enveloppe absente/malformée rend une boîte vide plutôt qu’une exception', () => {
    expect(parseAppNotificationInbox(null)).toEqual({ items: [], unreadCount: 0 });
    expect(parseAppNotificationInbox({ items: 'pas-un-tableau' })).toEqual({ items: [], unreadCount: 0 });
    expect(parseAppNotificationInbox({})).toEqual({ items: [], unreadCount: 0 });
  });

  it('une seule ligne abîmée ne fait pas tomber toute la boîte', () => {
    const inbox = parseAppNotificationInbox({
      items: [{ id: 'ok' }, null, 'texte', { kind: 'crm_task_assigned' }],
      unread_count: 1,
    });
    expect(inbox.items.map((n) => n.id)).toEqual(['ok']);
    expect(inbox.unreadCount).toBe(1);
  });

  it('un compteur non numérique retombe à 0 (jamais NaN dans la pastille)', () => {
    expect(parseAppNotificationInbox({ items: [], unread_count: 'beaucoup' }).unreadCount).toBe(0);
  });
});

describe('contrat RPC', () => {
  it('list : envoie le plafond demandé et AUCUN identifiant de destinataire', async () => {
    const rpc = fakeRpcClient({ items: [{ id: 'n1' }], unread_count: 1 });
    const inbox = await listMyNotifications(25);
    expect(rpc).toHaveBeenCalledWith('list_my_notifications', { p_limit: 25 });
    // Le destinataire est décidé serveur (auth.uid()) : aucun argument ne le nomme.
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain('u-me');
    expect(inbox.items).toHaveLength(1);
    // La pastille se lit ICI : il n'existe plus de RPC de comptage séparé (une cardinalité
    // interrogée seule ne dit pas de QUOI la boîte est faite — cf. useNotificationInbox).
    expect(inbox.unreadCount).toBe(1);
  });

  it('mark one : passe l’id et rend le nombre de lignes réellement marquées', async () => {
    const rpc = fakeRpcClient({ updated: 1 });
    await expect(markNotificationRead('n1')).resolves.toBe(1);
    expect(rpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' });
  });

  it('mark one : 0 pour un id inconnu OU celui d’autrui — même réponse, aucune sonde', async () => {
    fakeRpcClient({ updated: 0 });
    await expect(markNotificationRead('n-inconnue')).resolves.toBe(0);
  });

  it('mark all : sans paramètre, rend le nombre marqué', async () => {
    const rpc = fakeRpcClient({ updated: 3 });
    await expect(markAllNotificationsRead()).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith('mark_all_notifications_read', {});
  });

  it('une erreur RPC remonte : une boîte muette vaut pire qu’une boîte en erreur', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: new Error('boom') }));
    mockedGetApiClient.mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as unknown as ReturnType<typeof getApiClient>);
    await expect(listMyNotifications()).rejects.toThrow('boom');
  });
});

describe('mode démo', () => {
  it('boîte vide et aucun appel réseau : pas de pastille factice (ce que D26 avait retiré)', async () => {
    useSessionStore.setState({ demoMode: true } as never);
    const rpc = fakeRpcClient({ items: [{ id: 'n1' }], unread_count: 9 });
    await expect(listMyNotifications()).resolves.toEqual({ items: [], unreadCount: 0 });
    await expect(markNotificationRead('n1')).resolves.toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('clés de cache', () => {
  it('porte l’id utilisateur : une boîte ne survit pas à un changement de compte', () => {
    expect(notificationKeys.inbox('u-a')).not.toEqual(notificationKeys.inbox('u-b'));
    expect(notificationKeys.inbox('u-a')[1]).toBe('u-a');
    expect(notificationKeys.inbox('u-a')[0]).toBe('notifications');
  });
});

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
      // 18a — l'espèce historique ne porte PAS de payload de résolution : les deux clés
      // existent quand même, à null. Une clé absente selon l'espèce obligerait chaque
      // consommateur à re-tester la forme de l'objet plutôt que la valeur.
      outcome: null,
      submissionId: null,
    });
  });

  it('une ligne sans id est ignorée : elle n’est pas adressable', () => {
    expect(parseAppNotification({ kind: 'crm_task_assigned' })).toBeNull();
  });

  it('un émetteur inconnu reste null — jamais deviné', () => {
    const parsed = parseAppNotification({ id: 'n1', kind: 'crm_task_assigned', created_by_name: null, task_title: null });
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
      items: [{ id: 'ok', kind: 'crm_task_assigned' }, null, 'texte', { kind: 'crm_task_assigned' }],
      unread_count: 1,
    });
    expect(inbox.items.map((n) => n.id)).toEqual(['ok']);
    expect(inbox.unreadCount).toBe(1);
  });

  it('un compteur non numérique retombe à 0 (jamais NaN dans la pastille)', () => {
    expect(parseAppNotificationInbox({ items: [], unread_count: 'beaucoup' }).unreadCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// 18a — la SECONDE espèce : « votre fiche a été vérifiée ».
//
// Fait VÉRIFIÉ dans le corps live de `api.list_my_notifications` (migration_crm_task_multi_
// assignee_notifications.sql:729-780) : ce RPC émet le `payload` jsonb BRUT, et AUCUNE clé
// `outcome` / `submission_id` de premier niveau — contrairement à
// `api.claim_unmailed_notifications`, qui les aplatit pour le relais e-mail. Les deux
// contrats sont donc différents, et c'est le payload qu'il faut lire ici.
// ═══════════════════════════════════════════════════════════════════════════════════════
describe('espèce fiche_submission_reviewed', () => {
  it('lit l’issue et la soumission DANS le payload (c’est là que le RPC les met)', () => {
    const parsed = parseAppNotification({
      id: 'n2',
      kind: 'fiche_submission_reviewed',
      created_at: '2026-09-03T08:00:00Z',
      read_at: null,
      task_id: 't-verif',
      task_title: 'Vérifier la fiche',
      object_id: 'obj-9',
      object_name: 'Villa Vanille',
      created_by_id: null,
      created_by_name: null,
      payload: { submission_id: 'sub-1', outcome: 'partial', object_id: 'obj-9' },
    });
    expect(parsed?.kind).toBe('fiche_submission_reviewed');
    expect(parsed?.outcome).toBe('partial');
    expect(parsed?.submissionId).toBe('sub-1');
  });

  it('payload absent ou malformé : issue inconnue, jamais une issue inventée', () => {
    expect(parseAppNotification({ id: 'n3', kind: 'fiche_submission_reviewed' })?.outcome).toBeNull();
    expect(
      parseAppNotification({ id: 'n3', kind: 'fiche_submission_reviewed', payload: 'texte' })?.outcome,
    ).toBeNull();
  });

  it('une issue hors des trois connues n’est PAS retenue — on ne devine pas un verdict', () => {
    const parsed = parseAppNotification({
      id: 'n4',
      kind: 'fiche_submission_reviewed',
      payload: { outcome: 'peut_etre' },
    });
    expect(parsed?.outcome).toBeNull();
  });

  it('une espèce INCONNUE est écartée : mieux vaut ne rien afficher qu’un mauvais libellé', () => {
    // Un kind neuf côté serveur, pas encore connu du front, serait sinon rendu sous le
    // gabarit « X vous a assigné une tâche » et enverrait son lecteur sur /crm. C'est la
    // MÊME doctrine que la garde du drain e-mail : on ne compose pas ce qu'on ne sait pas.
    expect(parseAppNotification({ id: 'n5', kind: 'un_kind_du_futur' })).toBeNull();
    // Et le kind ABSENT n'est pas un repli non plus : app_notification.kind est NOT NULL,
    // une ligne sans kind est une ligne malformée.
    expect(parseAppNotification({ id: 'n6' })).toBeNull();
  });
});

describe('contrat RPC', () => {
  it('list : envoie le plafond demandé et AUCUN identifiant de destinataire', async () => {
    const rpc = fakeRpcClient({ items: [{ id: 'n1', kind: 'crm_task_assigned' }], unread_count: 1 });
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

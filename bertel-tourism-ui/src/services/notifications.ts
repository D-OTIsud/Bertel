// Service notifications (16w) — boîte de réception applicative de l'utilisateur connecté.
// Comme les tables crm_*, `app_notification` n'est PAS lisible en PostgREST direct : tout
// passe par les RPCs `api.*` DEFINER dont le destinataire est TOUJOURS `auth.uid()`, jamais
// un paramètre. Ne jamais ajouter de `client.from('app_notification')` ici.
//
// Parsing défensif au même standard que services/crm.ts : une ligne malformée est IGNORÉE,
// elle ne fait pas tomber toute la boîte.
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

type GenericRecord = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Espèces de notification rendues par l'UI. Le serveur en refuse toute autre (CHECK). */
export type AppNotificationKind = 'crm_task_assigned';

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  createdAt: string | null;
  /** `null` = non lue. Porte l'instant de lecture, pas un simple booléen. */
  readAt: string | null;
  taskId: string | null;
  taskTitle: string | null;
  objectId: string | null;
  objectName: string | null;
  /** Qui a déclenché la notification. `null` = inconnu — ne jamais le deviner. */
  createdById: string | null;
  createdByName: string | null;
}

export interface AppNotificationInbox {
  items: AppNotification[];
  unreadCount: number;
}

const EMPTY_INBOX: AppNotificationInbox = { items: [], unreadCount: 0 };

export function parseAppNotification(record: GenericRecord): AppNotification | null {
  const id = readNullableString(record.id);
  if (!id) return null; // une ligne sans id n'est pas adressable : on l'ignore
  return {
    id,
    kind: (readString(record.kind) || 'crm_task_assigned') as AppNotificationKind,
    createdAt: readNullableString(record.created_at),
    readAt: readNullableString(record.read_at),
    taskId: readNullableString(record.task_id),
    taskTitle: readNullableString(record.task_title),
    objectId: readNullableString(record.object_id),
    objectName: readNullableString(record.object_name),
    createdById: readNullableString(record.created_by_id),
    createdByName: readNullableString(record.created_by_name),
  };
}

export function parseAppNotificationInbox(payload: unknown): AppNotificationInbox {
  if (!payload || typeof payload !== 'object') return EMPTY_INBOX;
  const record = payload as GenericRecord;
  const items = Array.isArray(record.items)
    ? record.items
        .filter((row): row is GenericRecord => !!row && typeof row === 'object')
        .map(parseAppNotification)
        .filter((row): row is AppNotification => row !== null)
    : [];
  const unread = typeof record.unread_count === 'number' ? record.unread_count : 0;
  return { items, unreadCount: unread };
}

/**
 * Client des notifications. En mode démo il n'y a PAS de backend de notification : la boîte
 * est vide plutôt que peuplée de faux — une pastille factice est exactement ce que D26 avait
 * retiré de la sidebar, en attendant ce backend.
 */
function requireNotificationClient() {
  const session = useSessionStore.getState();
  if (session.demoMode) return null;
  return getApiClient();
}

export async function listMyNotifications(limit = 50): Promise<AppNotificationInbox> {
  const client = requireNotificationClient();
  if (!client) return EMPTY_INBOX;
  const { data, error } = await client.schema('api').rpc('list_my_notifications', { p_limit: limit });
  if (error) throw error;
  return parseAppNotificationInbox(data);
}

export async function countMyUnreadNotifications(): Promise<number> {
  const client = requireNotificationClient();
  if (!client) return 0;
  const { data, error } = await client.schema('api').rpc('count_my_unread_notifications', {});
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/**
 * Marque UNE notification lue. Un id inconnu et un id appartenant à quelqu'un d'autre
 * rendent tous deux `0` côté serveur : il n'y a aucun moyen de sonder l'existence d'une
 * notification d'autrui. On renvoie donc le compte, pas un succès/échec.
 */
export async function markNotificationRead(id: string): Promise<number> {
  const client = requireNotificationClient();
  if (!client) return 0;
  const { data, error } = await client.schema('api').rpc('mark_notification_read', { p_id: id });
  if (error) throw error;
  const updated = (data as GenericRecord | null)?.updated;
  return typeof updated === 'number' ? updated : 0;
}

export async function markAllNotificationsRead(): Promise<number> {
  const client = requireNotificationClient();
  if (!client) return 0;
  const { data, error } = await client.schema('api').rpc('mark_all_notifications_read', {});
  if (error) throw error;
  const updated = (data as GenericRecord | null)?.updated;
  return typeof updated === 'number' ? updated : 0;
}

/**
 * Clés de cache — TOUJOURS portées par l'id utilisateur. Une boîte de réception ne doit
 * jamais survivre à un changement de compte dans le même onglet : sans l'id dans la clé,
 * le cache React Query de l'utilisateur précédent serait re-servi au suivant.
 */
export const notificationKeys = {
  inbox: (userId: string | null) => ['notifications', userId, 'inbox'] as const,
  unread: (userId: string | null) => ['notifications', userId, 'unread'] as const,
};

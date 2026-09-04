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
export type AppNotificationKind = 'crm_task_assigned' | 'fiche_submission_reviewed';

const KNOWN_KINDS: readonly string[] = ['crm_task_assigned', 'fiche_submission_reviewed'];

/**
 * Issue d'une vérification de fiche (18a) — le CHECK de `fiche_submission` moins `pending`.
 * `partial` n'est ni une acceptation ni un refus : l'office a retenu une partie du travail.
 */
export type SubmissionOutcome = 'approved' | 'rejected' | 'partial';

const KNOWN_OUTCOMES: readonly string[] = ['approved', 'rejected', 'partial'];

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
  /**
   * 18a — l'issue d'une vérification, pour l'espèce `fiche_submission_reviewed` seulement.
   * `null` sur l'espèce historique, ET sur une issue que ce front ne connaît pas : un verdict
   * ne se devine pas. Toujours présente (à null) plutôt qu'absente selon l'espèce — sinon
   * chaque consommateur devrait re-tester la FORME de l'objet au lieu de la valeur.
   */
  outcome: SubmissionOutcome | null;
  /** 18a — la vérification concernée. Identifiant technique, jamais affiché. */
  submissionId: string | null;
}

export interface AppNotificationInbox {
  items: AppNotification[];
  unreadCount: number;
}

const EMPTY_INBOX: AppNotificationInbox = { items: [], unreadCount: 0 };

export function parseAppNotification(record: GenericRecord): AppNotification | null {
  const id = readNullableString(record.id);
  if (!id) return null; // une ligne sans id n'est pas adressable : on l'ignore
  // 18a — validation STRICTE de l'espèce, à la place de l'ancien repli sur
  // 'crm_task_assigned'. Le repli était sûr tant qu'il n'existait qu'une espèce ; avec deux
  // (et un jour trois), il rendrait une notification INCONNUE sous le gabarit « X vous a
  // assigné une tâche » et l'enverrait sur /crm. Un mauvais libellé trompe ; une ligne
  // absente, non — la pastille (comptée serveur) reste le signal qu'il y a du neuf.
  // `app_notification.kind` est NOT NULL + CHECK : une ligne sans kind est malformée.
  const kind = readString(record.kind);
  if (!KNOWN_KINDS.includes(kind)) return null;
  // Le payload BRUT, tel que `api.list_my_notifications` l'émet (corps live vérifié :
  // ce RPC rend `payload` entier et AUCUNE clé outcome/submission_id de premier niveau —
  // contrairement à `api.claim_unmailed_notifications`, qui les aplatit pour le relais).
  const payload = record.payload && typeof record.payload === 'object' ? (record.payload as GenericRecord) : {};
  const outcome = readString(payload.outcome);
  return {
    id,
    kind: kind as AppNotificationKind,
    createdAt: readNullableString(record.created_at),
    readAt: readNullableString(record.read_at),
    taskId: readNullableString(record.task_id),
    taskTitle: readNullableString(record.task_title),
    objectId: readNullableString(record.object_id),
    objectName: readNullableString(record.object_name),
    createdById: readNullableString(record.created_by_id),
    createdByName: readNullableString(record.created_by_name),
    // Une issue hors des trois connues rend `null` : le libellé dira « vérifiées », neutre
    // et vrai, plutôt qu'un verdict inventé.
    outcome: KNOWN_OUTCOMES.includes(outcome) ? (outcome as SubmissionOutcome) : null,
    submissionId: readNullableString(payload.submission_id),
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
 * Clé de cache — UNE seule, TOUJOURS portée par l'id utilisateur. La pastille et le tiroir
 * partagent cette entrée : deux requêtes distinctes pourraient afficher deux vérités.
 * Elle est TOUJOURS portée par l'id utilisateur. Une boîte de réception ne doit
 * jamais survivre à un changement de compte dans le même onglet : sans l'id dans la clé,
 * le cache React Query de l'utilisateur précédent serait re-servi au suivant.
 */
export const notificationKeys = {
  inbox: (userId: string | null) => ['notifications', userId, 'inbox'] as const,
};

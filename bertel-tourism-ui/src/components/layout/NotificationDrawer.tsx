'use client';

// Boîte de réception (16w) — le tiroir de la cloche de la sidebar. D26 avait RETIRÉ une
// cloche factice (pastille sans backend) en attendant `app_notification` : elle revient ici,
// adossée à de vraies lignes.
//
// Lecture par RPC, JAMAIS par abonnement Realtime : `app_notification` n'est pas exposée en
// PostgREST direct et n'est pas publiée en Realtime — ajouter un canal exigerait des grants
// et une publication qui ouvriraient la table bien au-delà de ce tiroir.
//
// La liste complète n'est chargée QUE tiroir ouvert ; le compteur non-lues, lui, est
// interrogé en fond par AppShell (c'est lui qui porte la pastille).

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck, X } from 'lucide-react';
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  type AppNotification,
} from '../../services/notifications';
import { useSessionStore } from '../../store/session-store';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { SkeletonBlock } from '../common/SkeletonBlock';

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Date lisible et complète — une notification datée « il y a 3 j » perd son heure. */
function formatWhen(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Phrase d'une notification. Un émetteur inconnu se DIT, il ne se devine pas. */
export function notificationLabel(notification: AppNotification): string {
  const who = notification.createdByName ?? 'Quelqu’un';
  const title = notification.taskTitle ?? 'une tâche';
  return `${who} vous a assigné « ${title} »`;
}

export function NotificationDrawer({ open, onOpenChange }: NotificationDrawerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);

  // Chargée seulement tiroir ouvert (`enabled`) : une boîte fermée ne coûte rien.
  const inboxQuery = useQuery({
    queryKey: notificationKeys.inbox(userId),
    queryFn: () => listMyNotifications(50),
    enabled: open && Boolean(userId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.inbox(userId) });
    void queryClient.invalidateQueries({ queryKey: notificationKeys.unread(userId) });
  }

  const readOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });
  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });

  const items = inboxQuery.data?.items ?? [];
  const unread = inboxQuery.data?.unreadCount ?? 0;

  function openTask(notification: AppNotification) {
    // Marquer lu AVANT de naviguer, mais sans attendre : la navigation ne doit pas dépendre
    // d'un aller-retour réseau, et l'échec du marquage laisse simplement la ligne non lue.
    if (!notification.readAt) readOneMutation.mutate(notification.id);
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
    router.push('/crm?tab=taches');
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showClose={false}
        aria-describedby={undefined}
        className="profile-drawer w-full max-w-[420px] border-0 p-0 sm:max-w-[420px]"
      >
        <SheetTitle className="sr-only">Notifications</SheetTitle>
        <SheetDescription className="sr-only">
          Notifications reçues : tâches qui vous ont été assignées.
        </SheetDescription>
        <div className="profile-drawer__inner">
          <div className="profile-drawer__header">
            <span className="eyebrow">Notifications</span>
            <button
              type="button"
              className="topbar-icon-button"
              onClick={() => onOpenChange(false)}
              aria-label="Fermer les notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {unread > 0 && (
            <button
              type="button"
              className="ghost-button"
              disabled={readAllMutation.isPending}
              onClick={() => readAllMutation.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              Tout marquer comme lu
            </button>
          )}

          {inboxQuery.isLoading && (
            <div role="status" aria-busy="true" aria-label="Chargement des notifications">
              <SkeletonBlock className="h-12 w-full rounded-shellMd" />
              <SkeletonBlock className="h-12 w-full rounded-shellMd" />
            </div>
          )}

          {inboxQuery.isError && (
            <div className="inline-alert" role="alert">
              Échec du chargement des notifications : {(inboxQuery.error as Error).message}
              <button type="button" className="ghost-button" onClick={() => void inboxQuery.refetch()}>
                Réessayer
              </button>
            </div>
          )}

          {!inboxQuery.isLoading && !inboxQuery.isError && items.length === 0 && (
            <p className="profile-drawer__empty">
              <BellOff className="h-4 w-4" aria-hidden /> Aucune notification.
            </p>
          )}

          {items.length > 0 && (
            <ul className="notif-list">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`notif-item${notification.readAt ? '' : ' is-unread'}`}
                    onClick={() => openTask(notification)}
                  >
                    <span className="notif-item__title">
                      {!notification.readAt && <span className="notif-item__dot" aria-hidden />}
                      {notificationLabel(notification)}
                    </span>
                    <span className="notif-item__meta">
                      {notification.objectName ?? '—'}
                      {formatWhen(notification.createdAt) ? ` · ${formatWhen(notification.createdAt)}` : ''}
                    </span>
                    {!notification.readAt && <span className="sr-only">Non lue</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {readAllMutation.isError && (
            <div className="inline-alert" role="alert">
              Échec du marquage : {(readAllMutation.error as Error).message}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

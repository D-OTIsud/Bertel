'use client';

// Veille des notifications (16w) — alimente la pastille de la cloche et le toast d'arrivée.
//
// Deux appels, chacun pour ce qu'il sait faire :
//   • le compteur `count_my_unread_notifications` est un comptage sur index — c'est LUI qui
//     est interrogé toutes les 30 s et au retour d'onglet ;
//   • la liste (jointures tâche/établissement/profil) n'est demandée que lorsque le compteur
//     MONTE, c'est-à-dire quand il y a réellement quelque chose de neuf à nommer.
// Interroger la liste en boucle pour la seule pastille ferait payer les jointures toutes les
// 30 s à chaque utilisateur connecté, toute la journée.
//
// Pas de Realtime dans cette première version : `app_notification` n'est ni exposée en
// PostgREST direct ni publiée en Realtime, et l'y ajouter demanderait des grants qui
// ouvriraient la table bien au-delà de ce besoin.

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  countMyUnreadNotifications,
  listMyNotifications,
  notificationKeys,
} from '../services/notifications';
import { useSessionStore } from '../store/session-store';
import { useToast } from './useToast';

/** Cadence de la veille. 30 s : assez vif pour une affectation, assez calme pour une journée. */
export const UNREAD_POLL_MS = 30_000;
/** Taille de la sonde d'ids : on ne nomme que ce qui vient d'arriver, pas tout l'historique. */
const PROBE_LIMIT = 10;

export interface NotificationInbox {
  unreadCount: number;
}

export function useNotificationInbox(): NotificationInbox {
  const userId = useSessionStore((state) => state.userId);
  const toast = useToast();
  // `toast` est lu DEPUIS UN REF, jamais depuis les dépendances de l'effet. Si une
  // identité instable entrait dans ces dépendances, chaque rendu ré-exécuterait l'effet —
  // donc son nettoyage — et ANNULERAIT la sonde d'ids en vol : plus aucune annonce, sans
  // la moindre erreur. (Vérifié rouge : le test échoue si `toast` revient en dépendance.)
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // `null` tant qu'aucun compte n'a été observé : la PREMIÈRE lecture ne doit jamais
  // déclencher de toast, sinon chaque rechargement de page rejouerait toutes les non-lues.
  const lastCountRef = useRef<number | null>(null);
  // Ids déjà annoncés dans cet onglet — évite de re-nommer la même notification si le
  // compteur redescend puis remonte.
  const announcedRef = useRef<Set<string>>(new Set());
  const prevUserRef = useRef<string | null | undefined>(undefined);

  // Remise à zéro PENDANT LE RENDU, pas dans un effet : deux effets du même commit lisent
  // tous deux l'état d'AVANT, donc un effet de veille placé plus haut repartirait avec le
  // compteur de l'utilisateur PRÉCÉDENT et pourrait annoncer une notification qui n'est pas
  // la sienne. Muter un ref au rendu est sans effet de bord ici (aucun re-rendu attendu).
  if (prevUserRef.current !== userId) {
    prevUserRef.current = userId;
    lastCountRef.current = null;
    announcedRef.current = new Set();
  }

  const unreadQuery = useQuery({
    queryKey: notificationKeys.unread(userId),
    queryFn: countMyUnreadNotifications,
    enabled: Boolean(userId),
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const unreadCount = unreadQuery.data ?? 0;
  const hasCount = unreadQuery.isSuccess;

  useEffect(() => {
    if (!hasCount || !userId) return;
    const previous = lastCountRef.current;
    lastCountRef.current = unreadCount;

    // Première observation de la session. Si des non-lues sont DÉJÀ là, on relève leurs ids
    // EN SILENCE : sans ce relevé, la première arrivée réelle déclencherait un toast par
    // non-lue en attente (six toasts pour une seule nouvelle tâche, chez qui laisse traîner
    // sa boîte). Compter ne suffit pas — il faut connaître les ids pour distinguer « déjà
    // là » de « vient d'arriver ».
    const isSeeding = previous === null;
    if (isSeeding ? unreadCount === 0 : unreadCount <= previous) return;

    let cancelled = false;
    void (async () => {
      try {
        // Appel DIRECT, hors cache React Query : cette sonde veut toujours du frais, et la
        // mettre en cache sous le préfixe `notifications` la ferait re-jouer à chaque
        // invalidation du tiroir (marquer lu en relancerait une pour rien).
        const inbox = await listMyNotifications(PROBE_LIMIT);
        if (cancelled) return;
        for (const notification of inbox.items) {
          if (notification.readAt) continue;
          if (announcedRef.current.has(notification.id)) continue;
          announcedRef.current.add(notification.id);
          if (isSeeding) continue; // relevé initial : mémorisé, jamais annoncé
          toastRef.current.info(
            'Nouvelle tâche assignée',
            notification.taskTitle ?? notification.objectName ?? undefined,
          );
        }
      } catch {
        // La sonde d'ids est un confort : son échec ne doit pas casser la pastille, qui
        // reste juste (elle vient du compteur, pas de cette liste). Un relevé initial raté
        // ne peut au pire que produire un toast de rattrapage à la prochaine hausse.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasCount, unreadCount, userId]);

  return { unreadCount };
}

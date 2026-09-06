'use client';

// Veille des notifications (16w) — alimente la pastille de la cloche et le toast d'arrivée.
//
// UNE seule requête, qui OBSERVE la boîte. Première rédaction : un compteur bon marché
// interrogé toutes les 30 s, et la liste demandée seulement quand ce compteur MONTAIT. C'était
// faux, et silencieusement : une **cardinalité ne dit pas de quoi la boîte est faite**. Lire
// une ancienne notification pendant qu'une neuve arrive laisse le compte identique — la neuve
// n'était jamais annoncée. Aucune garde de compteur ne peut rattraper ça : il faut regarder
// les ids. Le coût prétendument évité était de toute façon négligeable (une page de 50 lignes
// jointes, une fois par demi-minute et par utilisateur connecté).
//
// `unread_count` vient du serveur et porte sur TOUTES les non-lues, pas seulement sur la page
// rendue : la pastille reste juste même si la boîte dépasse la fenêtre ci-dessous.
//
// Pas de Realtime dans cette première version : `app_notification` n'est ni exposée en
// PostgREST direct ni publiée en Realtime, et l'y ajouter demanderait des grants qui
// ouvriraient la table bien au-delà de ce besoin.

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMyNotifications, notificationKeys } from '../services/notifications';
import { useSessionStore } from '../store/session-store';
import { useToast } from './useToast';

/** Cadence de la veille. 30 s : assez vif pour une affectation, assez calme pour une journée. */
export const NOTIFICATION_POLL_MS = 30_000;
/**
 * Fenêtre observée. Plafond assumé : au-delà de 50 non-lues, les plus anciennes sortent de la
 * fenêtre ; si l'une d'elles y ré-entrait (parce que de plus récentes ont été lues), elle
 * serait annoncée comme neuve. La pastille, elle, reste exacte — elle vient du serveur.
 */
export const NOTIFICATION_WINDOW = 50;

/**
 * Options PARTAGÉES par la veille et le tiroir : une seule requête en cache pour les deux, donc
 * le tiroir s'ouvre déjà rempli et ne peut pas diverger de la pastille.
 */
export function notificationInboxQueryOptions(userId: string | null) {
  return {
    queryKey: notificationKeys.inbox(userId),
    queryFn: () => listMyNotifications(NOTIFICATION_WINDOW),
    enabled: Boolean(userId),
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  };
}

export interface NotificationInbox {
  unreadCount: number;
}

export function useNotificationInbox(): NotificationInbox {
  const userId = useSessionStore((state) => state.userId);
  const toast = useToast();
  // `toast` est lu DEPUIS UN REF, jamais depuis les dépendances de l'effet : une identité
  // instable en dépendance ferait ré-exécuter l'effet à chaque rendu, ce qui n'annoncerait
  // rien de plus mais brouillerait le raisonnement. (Vérifié rouge en revue précédente.)
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Les ids déjà connus de cet onglet. Le PREMIER relevé est SILENCIEUX : sans lui, chaque
  // rechargement de page rejouerait toutes les non-lues en attente.
  const announcedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const prevUserRef = useRef<string | null | undefined>(undefined);

  // Remise à zéro PENDANT LE RENDU, pas dans un effet : deux effets du même commit lisent
  // tous deux l'état d'AVANT, donc l'effet d'annonce repartirait avec les ids de
  // l'utilisateur PRÉCÉDENT. Muter un ref au rendu est sans effet de bord ici.
  if (prevUserRef.current !== userId) {
    prevUserRef.current = userId;
    announcedRef.current = new Set();
    seededRef.current = false;
  }

  const inboxQuery = useQuery(notificationInboxQueryOptions(userId));
  const items = inboxQuery.data?.items;

  useEffect(() => {
    if (!items) return;
    const unread = items.filter((notification) => !notification.readAt);
    // Premier passage : on mémorise ce qui était DÉJÀ là, sans rien dire.
    const silent = !seededRef.current;
    seededRef.current = true;
    for (const notification of unread) {
      if (announcedRef.current.has(notification.id)) continue;
      announcedRef.current.add(notification.id);
      if (silent) continue;
      // 18a — le toast suit l'ESPÈCE. Il annonçait « Nouvelle tâche assignée » pour toute
      // espèce : un membre d'équipe qui est AUSSI acteur d'une fiche aurait vu le retour de
      // vérification de sa propre fiche annoncé comme une tâche à faire, et serait allé la
      // chercher dans un kanban où elle n'est pas. Le sous-titre suit : pour un retour, le
      // titre de la tâche de vérification (« Vérifier la fiche ») ne veut rien dire pour son
      // destinataire — c'est le nom de SA fiche qui l'identifie.
      const isReview = notification.kind === 'fiche_submission_reviewed';
      toastRef.current.info(
        isReview ? 'Votre office a vérifié votre fiche' : 'Nouvelle tâche assignée',
        (isReview ? notification.objectName : notification.taskTitle ?? notification.objectName) ?? undefined,
      );
    }
  }, [items]);

  return { unreadCount: inboxQuery.data?.unreadCount ?? 0 };
}

'use client';
import { useEffect, useState } from 'react';

export const portalWelcomeKey = (userId: string) => `portal-welcome:${userId}`;

/** Simple préférence de présentation, sans saisie ni données de fiche. Elle reste
 * après la déconnexion pour ne pas réafficher le premier passage à chaque visite. */
export function usePortalWelcome(userId: string | null) {
  const [state, setState] = useState<{ userId: string | null; seen: boolean; ready: boolean }>({ userId: null, seen: false, ready: false });
  useEffect(() => {
    let seen = !userId;
    try { if (userId) seen = window.localStorage.getItem(portalWelcomeKey(userId)) === '1'; } catch { /* L'accueil reste utilisable sans stockage. */ }
    setState({ userId, seen, ready: true });
  }, [userId]);
  const ready = !userId || state.userId === userId && state.ready;
  return { ready, show: Boolean(userId && ready && !state.seen), dismiss() {
    if (userId) { try { window.localStorage.setItem(portalWelcomeKey(userId), '1'); } catch { /* La fiche doit s'ouvrir même si l'appareil est plein. */ } }
    setState({ userId, seen: true, ready: true });
  } };
}

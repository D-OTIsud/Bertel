'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';

const OFFLINE_BANNER_EXIT_MS = 140;

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Bandeau global « hors ligne » (D4), piloté par navigator.onLine seul : le
 * statut réseau du store (présence realtime) couvre d'autres dégradations et
 * a déjà sa pastille dans la TopBar ; ici on ne signale que la coupure réelle.
 * Motion pass : usePresence garde le bandeau monté le temps de la sortie
 * (140ms) pour que l'annonce role="status" reste lisible aux lecteurs d'écran
 * au lieu de disparaître sur le même rendu que le retour en ligne.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const { shouldRender, phase } = usePresence(!isOnline, OFFLINE_BANNER_EXIT_MS);

  if (!shouldRender) {
    return null;
  }

  return (
    <div role="status" className="offline-banner motion-status-enter" data-motion-phase={phase}>
      <WifiOff size={14} aria-hidden />
      <span>Hors ligne — vos modifications ne peuvent pas être enregistrées.</span>
    </div>
  );
}

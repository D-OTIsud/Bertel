'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

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
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (isOnline) {
    return null;
  }

  return (
    <div role="status" className="offline-banner">
      <WifiOff size={14} aria-hidden />
      <span>Hors ligne — vos modifications ne peuvent pas être enregistrées.</span>
    </div>
  );
}

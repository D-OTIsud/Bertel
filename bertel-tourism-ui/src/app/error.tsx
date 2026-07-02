'use client';

import { useEffect, useMemo } from 'react';
import { ErrorFallback, makeIncidentRef } from '@/components/common/ErrorFallback';

/**
 * Limite d'erreur des segments de route (D4) : capte les throws RSC/Suspense
 * que l'ErrorBoundary client des Providers ne voit pas. `digest` (fourni par
 * Next pour les erreurs serveur) sert de référence d'incident quand il existe.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RouteError]', error);
  }, [error]);

  const incidentRef = useMemo(() => error.digest ?? makeIncidentRef(), [error]);

  return <ErrorFallback incidentRef={incidentRef} onRetry={reset} />;
}

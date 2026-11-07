'use client';

import { Home, RefreshCw, TriangleAlert } from 'lucide-react';

interface ErrorFallbackProps {
  /** Référence d'incident à communiquer au support (digest Next ou générée côté client). */
  incidentRef: string;
  /** Relance le rendu (reset du boundary) ; à défaut le bouton recharge la page. */
  onRetry?: () => void;
}

/**
 * Écran de repli commun aux limites d'erreur (app/error.tsx + ErrorBoundary des Providers).
 * Lien accueil en <a> natif : après un crash de rendu le routeur client n'est plus fiable.
 */
export function ErrorFallback({ incidentRef, onRetry }: ErrorFallbackProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    window.location.reload();
  };

  return (
    <main className="error-fallback" aria-labelledby="error-fallback-title">
      <div role="alert" className="error-fallback__card">
        <TriangleAlert size={28} className="error-fallback__icon" aria-hidden />
        <h1 id="error-fallback-title" className="error-fallback__title">
          Une erreur est survenue
        </h1>
        <p className="error-fallback__text">
          L&apos;affichage de cette page a échoué. Vos données ne sont pas perdues : vous pouvez
          réessayer ou revenir à l&apos;accueil.
        </p>
        <p className="error-fallback__ref">
          Référence incident : <code>{incidentRef}</code>
        </p>
        <div className="error-fallback__actions">
          <button type="button" className="primary-button" onClick={handleRetry}>
            <RefreshCw size={14} aria-hidden />
            Réessayer
          </button>
          <a href="/" className="ghost-button">
            <Home size={14} aria-hidden />
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}

/** Référence courte lisible pour corréler un signalement utilisateur aux logs. */
export function makeIncidentRef(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}`;
}

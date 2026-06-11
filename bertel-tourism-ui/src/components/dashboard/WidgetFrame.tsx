"use client";

import type { ReactNode } from 'react';

interface WidgetFrameProps {
  isLoading: boolean;
  error: unknown;
  /** true quand la donnée est chargée mais vide pour les filtres courants. */
  isEmpty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * Enveloppe d'état des widgets dashboard : fin des erreurs avalées en
 * console.error — chaque widget montre explicitement chargement / erreur / vide.
 */
export function WidgetFrame({
  isLoading,
  error,
  isEmpty = false,
  emptyLabel = 'Aucun objet ne correspond aux filtres.',
  onRetry,
  children,
}: WidgetFrameProps) {
  if (isLoading) {
    return (
      <article className="kpi-panel kpi-panel--state" role="status" aria-live="polite">
        <span className="dashboard-widget-state">Chargement…</span>
      </article>
    );
  }
  if (error) {
    return (
      <article className="kpi-panel kpi-panel--state" role="alert">
        <span className="dashboard-widget-state dashboard-widget-state--error">
          Impossible de charger ce widget.
        </span>
        {onRetry && (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Réessayer
          </button>
        )}
      </article>
    );
  }
  if (isEmpty) {
    return (
      <article className="kpi-panel kpi-panel--state">
        <span className="dashboard-widget-state">{emptyLabel}</span>
      </article>
    );
  }
  return <>{children}</>;
}

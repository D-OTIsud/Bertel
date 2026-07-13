"use client";

import type { ReactNode } from 'react';
import { SkeletonBlock } from '../common/SkeletonBlock';

interface WidgetFrameProps {
  /**
   * Pass q.isPending from useDashboardQuery — spinner on initial fetch only;
   * background refetches intentionally keep showing stale data.
   */
  isPending: boolean;
  error: unknown;
  /** true quand la donnée est chargée mais vide pour les filtres courants. */
  isEmpty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  /** Skeleton shape matching this widget's real layout. Falls back to a generic
   * placeholder when omitted so existing callers don't need to migrate at once. */
  skeleton?: ReactNode;
  children: ReactNode;
}

function GenericWidgetSkeleton() {
  return (
    <div className="dashboard-widget-skeleton" aria-hidden="true">
      <SkeletonBlock className="h-4 w-1/3 rounded-shellSm" />
      <SkeletonBlock className="h-24 w-full rounded-shellMd" />
    </div>
  );
}

/**
 * Enveloppe d'état des widgets dashboard : fin des erreurs avalées en
 * console.error — chaque widget montre explicitement chargement / erreur / vide.
 */
export function WidgetFrame({
  isPending,
  error,
  isEmpty = false,
  emptyLabel = 'Aucun objet ne correspond aux filtres.',
  onRetry,
  skeleton,
  children,
}: WidgetFrameProps) {
  if (isPending) {
    return (
      <article className="kpi-panel kpi-panel--state" role="status" aria-busy="true" aria-label="Chargement du widget">
        {skeleton ?? <GenericWidgetSkeleton />}
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
      <article className="kpi-panel kpi-panel--state" role="status" aria-live="polite">
        <span className="dashboard-widget-state">{emptyLabel}</span>
      </article>
    );
  }
  return <div className="motion-content-reveal">{children}</div>;
}

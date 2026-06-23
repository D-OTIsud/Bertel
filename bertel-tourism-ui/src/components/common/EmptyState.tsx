"use client";

import type { ReactNode } from 'react';
import { Inbox, FilterX, Clock, CloudOff } from 'lucide-react';

export type EmptyStateMode = 'no-data' | 'filtered' | 'coming-soon' | 'error';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

interface EmptyStateProps {
  /**
   * Distingue « aucune donnée saisie » (no-data, CTA créer) de « rien pour ces
   * filtres » (filtered, CTA réinitialiser), « module à venir » (coming-soon,
   * pas de CTA) et « erreur de chargement » (error, bannière + Réessayer).
   */
  mode: EmptyStateMode;
  title: string;
  description?: string;
  /** Icône lucide ; un défaut par mode est fourni sinon. */
  icon?: ReactNode;
  action?: EmptyStateAction;
  /** Texte du badge en mode coming-soon (défaut « Bientôt »). */
  badge?: string;
  className?: string;
}

const DEFAULT_ICON: Record<EmptyStateMode, ReactNode> = {
  'no-data': <Inbox aria-hidden />,
  filtered: <FilterX aria-hidden />,
  'coming-soon': <Clock aria-hidden />,
  error: <CloudOff aria-hidden />,
};

/**
 * État vide / erreur réutilisable qui enseigne au lieu de constater. Remplace
 * les « Aucun X » nus. Le mode pilote l'icône, la présence/le style du CTA et,
 * en mode error, le rôle ARIA `alert` pour annoncer l'échec.
 */
export function EmptyState({
  mode,
  title,
  description,
  icon,
  action,
  badge = 'Bientôt',
  className,
}: EmptyStateProps) {
  const resolvedIcon = icon ?? DEFAULT_ICON[mode];

  if (mode === 'error') {
    return (
      <div className={`ui-empty-banner${className ? ` ${className}` : ''}`} role="alert">
        <span className="ui-empty-banner__icon">{resolvedIcon}</span>
        <div className="ui-empty-banner__body">
          <strong className="ui-empty-banner__title">{title}</strong>
          {description && <p className="ui-empty-banner__text">{description}</p>}
        </div>
        {action && (
          <button type="button" className="ghost-button" onClick={action.onClick}>
            {action.icon}
            {action.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`ui-empty ui-empty--${mode}${className ? ` ${className}` : ''}`}>
      <div className="ui-empty__icon">{resolvedIcon}</div>
      <p className="ui-empty__title">{title}</p>
      {description && <p className="ui-empty__text">{description}</p>}
      {mode === 'coming-soon' && <span className="badge badge--info">{badge}</span>}
      {mode !== 'coming-soon' && action && (
        <button
          type="button"
          className={mode === 'no-data' ? 'primary-button' : 'ghost-button'}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}

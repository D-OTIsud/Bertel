'use client';

import { Component, type ReactNode } from 'react';
import { ErrorFallback, makeIncidentRef } from './ErrorFallback';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  incidentRef: string | null;
}

/**
 * Limite d'erreur client autour de l'arbre applicatif (D4) : un throw de rendu
 * (bootstrap thème/session compris) affiche l'écran de repli au lieu d'une page
 * blanche. Classe requise : React n'a pas d'équivalent fonctionnel.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { incidentRef: null };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { incidentRef: makeIncidentRef() };
  }

  componentDidCatch(error: Error): void {
    // Journalisation console uniquement : la référence permet de corréler un signalement.
    console.error(`[ErrorBoundary] ${this.state.incidentRef ?? ''}`, error);
  }

  handleRetry = (): void => {
    this.setState({ incidentRef: null });
  };

  render(): ReactNode {
    if (this.state.incidentRef) {
      return <ErrorFallback incidentRef={this.state.incidentRef} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

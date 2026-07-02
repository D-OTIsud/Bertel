'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

interface PermissionDeniedProps {
  /** Id du titre, pour un aria-labelledby posé par le parent (landmark). */
  headingId?: string;
  title?: string;
  /** Explication + voie de recours (qui contacter). Un défaut générique est fourni. */
  description?: ReactNode;
}

/**
 * Panneau « accès réservé » réutilisable (D4) : à afficher à la place d'un
 * formulaire ou d'un module que le rôle courant ne peut pas utiliser, plutôt
 * que de laisser l'utilisateur découvrir le refus au premier appel serveur.
 * (UX uniquement — l'autorisation réelle reste côté RLS/RPC.)
 */
export function PermissionDenied({
  headingId,
  title = 'Accès réservé',
  description = 'Cette page est réservée à un rôle disposant des droits requis. Contactez votre administrateur si vous pensez devoir y accéder.',
}: PermissionDeniedProps) {
  return (
    <div role="alert" className="space-y-2 rounded-shellXl border border-line bg-surface p-5 text-center">
      <Lock size={28} className="mx-auto text-ink-3" aria-hidden />
      <h1 id={headingId} className="text-lg font-semibold text-ink">
        {title}
      </h1>
      <p className="text-sm text-ink-2">{description}</p>
    </div>
  );
}

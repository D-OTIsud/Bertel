'use client';

// Panneau de navigation CRM objet⇄acteur, autonome et ANCRÉ sur UN établissement.
// Réplique minimale de la machine de nav de CrmPage SANS localStorage, SANS route, SANS
// useUiStore. Il monte les VRAIES vues /crm (CrmObjectView ⇄ CrmActorFiche) telles quelles
// → fidélité visuelle garantie. Ancrage strict (décision PO 2026-06-16) : on ne déroule
// jamais un AUTRE établissement — onOpenObject ramène toujours à l'établissement édité.

import { useState } from 'react';
import { CrmObjectView } from './CrmObjectView';
import { CrmActorFiche } from './CrmActorFiche';

export function CrmEstablishmentPanel({
  objectId,
  canWrite,
  onClose,
  initialActorId = null,
}: {
  objectId: string;
  canWrite: boolean;
  /** Ferme le tiroir hôte : le bouton retour de la vue établissement est la racine du tiroir. */
  onClose: () => void;
  /** Ouvre directement la fiche de cet acteur (deep-link depuis une carte prestataire §19). */
  initialActorId?: string | null;
}) {
  // null = vue établissement (par défaut) ; set = fiche de cet acteur (sous-vue glissée).
  const [actorId, setActorId] = useState<string | null>(initialActorId);

  if (actorId) {
    return (
      <CrmActorFiche
        actorId={actorId}
        canWrite={canWrite}
        backLabel="Retour à l'établissement"
        onBack={() => setActorId(null)}
        // Ancrage strict : tout clic établissement (même un tiers) ramène à l'objet ancre.
        onOpenObject={() => setActorId(null)}
      />
    );
  }

  return (
    <CrmObjectView
      objectId={objectId}
      backLabel="Suivi CRM"
      canWrite={canWrite}
      hideOpenEditor
      onBack={onClose}
      onOpenActor={(aid) => setActorId(aid)}
    />
  );
}

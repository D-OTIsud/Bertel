'use client';

import { useSessionStore } from '../../store/session-store';

/**
 * Bandeau « bac à sable » — affiché quand le compte appartient à une organisation
 * de test (`api.current_user_test_realm()`).
 *
 * POURQUOI IL EXISTE. Le corpus de test est *délibérément* réaliste : noms
 * plausibles, communes réelles, équipements et tarifs empruntés aux vraies fiches
 * du même type. C'est ce qui le rend utile — et strictement indiscernable de la
 * production à l'œil. Sans ce bandeau, un testeur ne peut pas savoir s'il vient
 * de modifier une fiche jetable ou l'hôtel d'un vrai prestataire.
 *
 * Il n'a AUCUN rôle de sécurité : le cloisonnement est fait par la base
 * (`migration_test_org_isolation.sql`). Le masquer ne donnerait accès à rien.
 */
export function SandboxBanner() {
  const isTestRealm = useSessionStore((state) => state.isTestRealm);
  const orgName = useSessionStore((state) => state.orgName);

  if (!isTestRealm) {
    return null;
  }

  return (
    <div className="sandbox-banner" role="status">
      <span className="sandbox-banner__dot" aria-hidden="true" />
      <span className="sandbox-banner__label">Bac à sable</span>
      <span className="sandbox-banner__text">
        Données de test uniquement{orgName ? ` — ${orgName}` : ''}. Le corpus réel n’est pas
        visible ici, et rien de ce que vous modifiez ne part à l’API partenaire.
      </span>
    </div>
  );
}

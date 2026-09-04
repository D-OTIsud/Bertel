'use client';

// Accueil de l'Espace partenaire (18a, D10) : une carte par fiche, avec son état EN MOTS.
//
// Cas majoritaire — UNE seule fiche : on ouvre directement la fiche. Cet accueil n'existe
// que pour les partenaires qui en ont plusieurs ; imposer un écran de choix à qui n'a rien à
// choisir est un pas de plus vers l'appel téléphonique à l'office.
//
// Aucune ouverture de fiche ici : charger une fiche complète coûte ~38 requêtes à froid. L'état
// affiché vient de `list_my_portal_fiches` SEUL ; ce qui reste à compléter se lit dans la fiche.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronRight, Clock, Pencil } from 'lucide-react';
import { listMyPortalFiches, type PortalFiche } from '../services/portal';
import { EmptyState } from '../components/common/EmptyState';
import { PageSkeleton } from '../components/common/PageSkeleton';
import { portalTypeLabel } from '../features/portal/portal-rubrics';
import { useSessionStore } from '../store/session-store';
import { hasPortalDraft } from '../features/portal/usePortalDraft';

interface FicheBadge {
  label: string;
  className: string;
  Icon: typeof Check;
}

/**
 * L'état d'une fiche, EN MOTS, dans l'ordre où il compte pour le partenaire.
 *
 * L'envoi en cours passe avant tout : tant que l'office vérifie, il n'y a rien à faire.
 * Vient ensuite le dernier retour — `approved` est le seul qui clôt vraiment ; `rejected`
 * ET `partial` laissent du travail, d'où le test sur la NON-acceptation plutôt qu'une liste
 * de refus qui manquerait `partial` (l'office a retenu une partie et refusé le reste).
 */
export function ficheBadge(fiche: PortalFiche, hasDraft: boolean): FicheBadge {
  if (fiche.openSubmission) {
    return { label: 'Envoyé — en vérification', className: 'badge--info', Icon: Clock };
  }
  if (fiche.lastResolved && fiche.lastResolved.status !== 'approved') {
    return { label: 'À reprendre', className: 'badge--danger', Icon: AlertTriangle };
  }
  if (hasDraft) {
    return { label: 'Modifications à envoyer', className: 'badge--warn', Icon: Pencil };
  }
  return { label: 'À jour', className: 'badge--ok', Icon: Check };
}

/** Le prénom, pour saluer. Une adresse e-mail n'est pas un prénom : on ne salue alors personne. */
function firstName(userName: string): string {
  const first = userName.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 && !first.includes('@') ? first : '';
}

export function PortalHomePage() {
  const router = useRouter();
  const userName = useSessionStore((state) => state.userName);
  const userId = useSessionStore((state) => state.userId);
  const fichesQuery = useQuery({ queryKey: ['portal-fiches'], queryFn: listMyPortalFiches });
  const fiches = fichesQuery.data ?? [];
  const single = fiches.length === 1 ? fiches[0] : null;

  useEffect(() => {
    if (single) router.replace(`/espace/fiches/${single.id}`);
  }, [single, router]);

  if (fichesQuery.isLoading) return <PageSkeleton variant="list" />;
  if (fichesQuery.isError) {
    return (
      <EmptyState
        mode="error"
        title="Nous n’avons pas pu afficher vos fiches."
        description="Vérifiez votre connexion, puis réessayez."
        action={{ label: 'Réessayer', onClick: () => void fichesQuery.refetch() }}
      />
    );
  }
  // Redirection en cours : surtout pas la liste, que le partenaire verrait clignoter.
  // `role="status"` : sur un réseau lent cet écran dure, et un lecteur d'écran n'en serait
  // pas averti — l'utilisateur croirait la page vide.
  if (single)
    return (
      <p className="muted" role="status">
        Ouverture de votre fiche…
      </p>
    );

  const prenom = firstName(userName);
  return (
    <section className="portal-home">
      <h1 className="portal-h1">{prenom ? `Bonjour ${prenom},` : 'Bonjour,'}</h1>
      <p className="portal-lead">Voici vos fiches. Ouvrez une fiche pour la compléter ou la mettre à jour.</p>
      {fiches.length === 0 ? (
        <EmptyState
          mode="no-data"
          title="Aucune fiche n’est encore reliée à votre compte"
          description="Votre office de tourisme relie vos fiches à votre compte. Contactez-le si vous pensez qu’il manque une fiche."
        />
      ) : (
        <ul className="portal-fiches">
          {fiches.map((fiche) => {
            const badge = ficheBadge(fiche, hasPortalDraft(userId, fiche.id));
            return (
              <li key={fiche.id}>
                <Link className="portal-card portal-fiche" href={`/espace/fiches/${fiche.id}`}>
                  <span className="portal-fiche__body">
                    <span className="portal-fiche__name">{fiche.name}</span>
                    {/* Le type en toutes lettres, et RIEN si on ne sait pas le dire : replier
                        sur le code (HOT, RES, ASC…) mettrait du jargon interne à l'écran.
                        `portalTypeLabel` porte les DEUX règles — il surcharge les libellés au
                        vocabulaire proscrit (TYPE_LABEL.PSV vaut littéralement « Prestataire »,
                        sans toucher à la taxonomie partagée qu'Explorer, CRM et éditeur lisent)
                        et rend '' sur un code inconnu. Une seule garde, dans la fonction. */}
                    {portalTypeLabel(fiche.objectType) ? (
                      <span className="muted">{portalTypeLabel(fiche.objectType)}</span>
                    ) : null}
                  </span>
                  <span className={`badge ${badge.className}`}>
                    <badge.Icon size={14} aria-hidden /> {badge.label}
                  </span>
                  <ChevronRight size={20} aria-hidden className="portal-fiche__chevron" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

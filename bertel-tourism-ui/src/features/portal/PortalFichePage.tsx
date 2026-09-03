'use client';

/**
 * Le chargement d'une fiche du portail, et les gardes AVANT tout écran de saisie.
 *
 * LA LANGUE EST FORCÉE À `['fr']`. `useObjectWorkspaceQuery` lit les préférences de la
 * session : un compte à préférence anglaise ferait rendre `descriptions.localLanguage`
 * ailleurs que la colonne française, et la présentation saisie n'atteindrait jamais la
 * fiche publiée.
 *
 * `listMySubmissions` est appelée AVEC l'id de la fiche, et la clé de cache le porte.
 * Sans le paramètre, la vérification en cours de CETTE fiche peut sortir des vingt
 * dernières lignes d'un partenaire multi-fiches — les rubriques resteraient muettes, sans
 * la moindre erreur. Sans l'id dans la clé, une fiche rendrait l'historique d'une autre.
 * L'invalidation, elle, reste par PRÉFIXE `['portal-submissions']`.
 *
 * La garde de type est `resolvePortalArchetype`, fail-CLOSED — pas `getArchetypeMeta`, qui
 * rend une identité visuelle et ne dit rien de la gouvernance.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState } from '../../components/common/EmptyState';
import { PageSkeleton } from '../../components/common/PageSkeleton';
import { PortalFicheEditor } from './PortalFicheEditor';
import { resolvePortalArchetype } from './portal-rubrics';
import { loadObjectWorkspace } from '../../hooks/useExplorerQueries';
import { getPortalSectionVisibility, listMyPortalFiches, listMySubmissions } from '../../services/portal';

/** La langue de saisie du portail. Constante de module : la clé de cache doit être stable. */
const PORTAL_LANGS = ['fr'];

/** Assez pour traverser un aller-retour hub → rubrique sans re-payer le chargeur lourd. */
const WORKSPACE_STALE_MS = 60_000;

export function PortalFichePage({ objectId }: { objectId: string }) {
  const queryClient = useQueryClient();

  const workspace = useQuery({
    queryKey: ['object-workspace', objectId, PORTAL_LANGS],
    queryFn: () => loadObjectWorkspace(queryClient, objectId, PORTAL_LANGS),
    staleTime: WORKSPACE_STALE_MS,
  });
  const visibility = useQuery({
    queryKey: ['portal-visibility', objectId],
    queryFn: () => getPortalSectionVisibility(objectId),
  });
  const submissions = useQuery({
    queryKey: ['portal-submissions', objectId],
    queryFn: () => listMySubmissions(20, objectId),
  });
  const fiches = useQuery({ queryKey: ['portal-fiches'], queryFn: listMyPortalFiches });

  if (workspace.isLoading || visibility.isLoading) {
    return (
      <>
        <p className="muted" role="status">
          Nous préparons votre fiche…
        </p>
        <PageSkeleton variant="form" />
      </>
    );
  }

  if (workspace.isError || visibility.isError || !workspace.data) {
    return (
      <EmptyState
        mode="error"
        title="Nous n’avons pas pu ouvrir votre fiche."
        description="Vérifiez votre connexion, puis réessayez."
        action={{
          label: 'Réessayer',
          onClick: () => {
            void workspace.refetch();
            void visibility.refetch();
          },
        }}
      />
    );
  }

  const resource = workspace.data;
  const archetype = resolvePortalArchetype(resource.type);

  if (!archetype) {
    return (
      <section className="portal-card portal-managed">
        <h1 className="portal-h1">{resource.name}</h1>
        <p className="notice">Cette fiche est gérée par l’office.</p>
        <p className="muted">Contactez-le pour la modifier.</p>
        <Link className="ghost-button" href="/espace">
          Retour à vos fiches
        </Link>
      </section>
    );
  }

  const list = fiches.data ?? [];
  return (
    <PortalFicheEditor
      // La clé garantit un état d'édition NEUF par fiche : `useObjectEditorState` est
      // init-once et ne resynchronise jamais.
      key={objectId}
      objectId={objectId}
      archetype={archetype}
      resource={resource}
      visibility={visibility.data ?? { floorModules: [], maskedModules: [] }}
      submissions={submissions.data ?? []}
      fiche={list.find((entry) => entry.id === objectId) ?? null}
      ficheCount={list.length}
    />
  );
}

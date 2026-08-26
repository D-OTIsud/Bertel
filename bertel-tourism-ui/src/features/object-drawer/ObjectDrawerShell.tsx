'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Printer, X } from 'lucide-react';
import { AvatarStack } from '../../components/common/AvatarStack';
import { StatusPill } from '../../components/common/StatusPill';
import { useObjectDetailQuery, usePrefetchObjectWorkspace } from '../../hooks/useExplorerQueries';
import { usePresenceRoom } from '../../hooks/usePresenceRoom';
import { useSessionStore } from '../../store/session-store';
import { resolveTypeLabel } from '../../utils/labels';
import { ObjectDetailView } from './ObjectDetailView';
import { parseTaxonomyEyebrow } from './utils';

/**
 * Delai avant le prechargement automatique de l'editeur, en millisecondes.
 * Assez court pour que l'editeur soit chaud au clic, assez long pour que le
 * tiroir ait peint. A remonter si la mesure montre qu'il concurrence le rendu.
 */
const AUTO_PREFETCH_DELAY_MS = 300;

interface ObjectDrawerShellProps {
  objectId: string | null;
  onClose: () => void;
}

/**
 * Panneau ORG (PLAN 6). Une organisation n'est pas une fiche touristique
 * (structure institutionnelle) : le drawer n'affiche ni ruban de type ni
 * sections génériques, mais un renvoi explicite vers l'administration des
 * équipes. Rendu à la place d'ObjectDetailView quand `type === 'ORG'`.
 */
function OrgUnsupportedPanel({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  return (
    <div className="drawer-unsupported">
      <h3 className="drawer-unsupported__title">Organisation</h3>
      <p className="drawer-unsupported__message">
        Les organisations sont gérées depuis l’administration des équipes.
      </p>
      <button type="button" className="drawer-header__btn-primary drawer-unsupported__action" onClick={onOpenAdmin}>
        Ouvrir l’administration
      </button>
    </div>
  );
}

function DrawerHeaderSkeleton() {
  return (
    <div className="drawer-loading-heading" aria-hidden="true">
      <span className="drawer-skeleton drawer-skeleton--eyebrow" />
      <span className="drawer-skeleton drawer-skeleton--title" />
      <div className="drawer-header__meta drawer-header__meta--loading">
        <span className="drawer-skeleton drawer-skeleton--chip" />
        <span className="drawer-skeleton drawer-skeleton--chip" />
        <span className="drawer-skeleton drawer-skeleton--chip drawer-skeleton--chip-wide" />
      </div>
    </div>
  );
}

function DrawerPreviewSkeleton() {
  return (
    <div className="drawer-loading-preview" data-testid="drawer-loading-skeleton" aria-hidden="true">
      <div className="drawer-loading-layout">
        <div className="drawer-loading-main">
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--hero" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--section-lg" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--section-md" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--section-md" />
        </div>
        <div className="drawer-loading-aside">
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--media" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--side" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--map" />
        </div>
      </div>
    </div>
  );
}

export function ObjectDrawerShell({ objectId, onClose }: ObjectDrawerShellProps) {
  const router = useRouter();
  // Le tiroir est en LECTURE SEULE : il ne consomme que `detail`, jamais
  // `modules` ni `permissions`. Il charge donc le RPC seul (1 aller-retour) au
  // lieu du chargeur d'espace de travail (~85 requetes dont aucune n'etait lue).
  // L'invariant §103 (« l'objet editable complet = getObjectWorkspaceResource »)
  // ne s'applique pas ici : il protege l'editeur, pas le tiroir.
  const { data, isError, error, isLoading } = useObjectDetailQuery(objectId);
  const { peers, typingUsers } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId) },
  );
  // `canEditObjects` = api.current_user_can_edit_objects() : superuser plateforme,
  // admin d'ORG, ou l'une des permissions editables. Il remplace `role !== null`,
  // qui n'excluait meme pas un membre d'ORG en LECTURE SEULE.
  //
  // ATTENTION — il signifie « peut modifier AU MOINS UN objet », PAS « peut
  // modifier CETTE fiche ». C'est un bon filtre pour decider d'un prechargement ;
  // ce n'est PAS une autorisation. L'autorisation par fiche est
  // api.user_can_write_object_canonical, resolue par le chargeur d'espace de
  // travail et imposee par les policies d'ecriture — le tiroir ne l'a pas.
  const canEdit = useSessionStore((state) => state.canEditObjects);
  const prefetchWorkspace = usePrefetchObjectWorkspace();

  const resolvedData = data ?? null;
  const isShellLoading = isLoading || !resolvedData;
  const previewRaw = resolvedData?.raw ?? {};

  // PLAN 6 : une ORG n'est pas une fiche touristique — pas d'éditeur d'objet,
  // pas de ruban/sections génériques ; on renvoie vers /team.
  const isOrg = resolvedData?.type === 'ORG';

  const typeLabel = resolveTypeLabel(resolvedData?.type);
  const typeLineUpper = typeLabel ? typeLabel.toUpperCase() : '';
  const title = resolvedData?.name ?? 'Chargement…';

  // Nature/sous-catégorie taxonomique (demande CES) : le type seul ne dit pas si
  // une fiche HLO est un meublé, une chambre d'hôtes… On n'affiche pas une nature
  // qui répète mot pour mot le libellé de type (« RESTAURANT · Restaurant »).
  const taxonomyEyebrow = resolvedData ? parseTaxonomyEyebrow(previewRaw as Record<string, unknown>) : null;
  const natureChip =
    taxonomyEyebrow && taxonomyEyebrow.label.trim().toLowerCase() !== typeLabel.trim().toLowerCase()
      ? taxonomyEyebrow
      : null;

  // Le bouton « Modifier » est un <button> + router.push, donc Next ne precharge
  // PAS la route (il ne le fait que pour les <Link>). Le bundle de l'editeur
  // (~253 Ko JS+CSS, 20-21 sections importees statiquement) partait au clic. On
  // le telecharge pendant que l'utilisateur lit la fiche.
  useEffect(() => {
    if (!objectId || !canEdit) {
      return;
    }
    router.prefetch(`/objects/${objectId}/edit`);
  }, [canEdit, objectId, router]);

  // §NN — mesure terrain : ~80 % des ouvertures de fiche par un editeur sont
  // suivies d'un clic sur « Modifier ». A ce taux de conversion, l'editeur est la
  // navigation ATTENDUE, pas une hypothese : on precharge sans attendre le survol
  // du bouton (qui reste, pour les 20 % restants et pour le clavier).
  //
  // La temporisation courte n'est PAS un filtre d'intention (contrairement aux
  // 200 ms des cartes de resultat) : elle laisse simplement le tiroir peindre
  // avant que ~20 requetes ne partent en concurrence.
  //
  // Cout d'un prechargement inutilise : les catalogues sont deja en cache de
  // session et le gros RPC est mutualise avec celui du tiroir (loadObjectWorkspace),
  // donc il ne reste que les selects par objet.
  const hasDetail = Boolean(resolvedData);
  useEffect(() => {
    if (!objectId || !canEdit || isOrg || !hasDetail) {
      return;
    }
    const timer = setTimeout(() => prefetchWorkspace(objectId), AUTO_PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canEdit, hasDetail, isOrg, objectId, prefetchWorkspace]);

  function openFullPageEditor() {
    if (!objectId) {
      return;
    }
    onClose();
    router.push(`/objects/${objectId}/edit`);
  }

  function openTeamAdmin() {
    onClose(); // ferme le drawer AVANT de naviguer
    router.push('/team');
  }

  return (
    <div key={objectId} className="drawer-shell__inner">
      <div className="drawer-header" aria-busy={isShellLoading}>
        {isShellLoading ? (
          <DrawerHeaderSkeleton />
        ) : (
          <div className="drawer-header__left">
            {resolvedData && (
              <div className="drawer-header__eyebrow-row" aria-label="Type et catégorie">
                <span className="drawer-header__type-line">{typeLineUpper}</span>
                {natureChip && (
                  <span className="drawer-header__nature" title={natureChip.title}>
                    {natureChip.label}
                  </span>
                )}
              </div>
            )}
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
          </div>
        )}
        <div className="drawer-header__actions">
          <StatusPill tone="green">{peers.length} live</StatusPill>
          <AvatarStack people={peers} />
          {/* D26 : l'étoile « favoris » (useState transitoire, jamais persistée) est retirée —
              elle promettait un favori qui n'existait pas. Reviendra avec la table
              workspace_user_favorites (backend, remonté à la session API). */}
          <button type="button" className="drawer-header__btn-secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" strokeWidth={2} />
            <span>Imprimer</span>
          </button>
          {canEdit && !isOrg && (
            <button
              type="button"
              className="drawer-header__btn-primary"
              onMouseEnter={() => objectId && prefetchWorkspace(objectId)}
              onFocus={() => objectId && prefetchWorkspace(objectId)}
              onClick={openFullPageEditor}
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
              Modifier
            </button>
          )}
          <button type="button" className="drawer-header__icon-btn drawer-header__icon-btn--plain" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="drawer-status-row">
        {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
      </div>
      {isError && <div className="panel-card panel-card--warning panel-card--nested">{(error as Error).message}</div>}

      <div className="drawer__content drawer__content--preview">
        {isShellLoading && <DrawerPreviewSkeleton />}
        {resolvedData && (
          <section id="object-drawer-preview" className="drawer__preview-area">
            {isOrg ? (
              <OrgUnsupportedPanel onOpenAdmin={openTeamAdmin} />
            ) : (
              <ObjectDetailView data={resolvedData} raw={previewRaw as Record<string, unknown>} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

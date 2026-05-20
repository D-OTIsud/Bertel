'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Printer, Star, X } from 'lucide-react';
import { AvatarStack } from '../../components/common/AvatarStack';
import { StatusPill } from '../../components/common/StatusPill';
import { useObjectWorkspaceQuery } from '../../hooks/useExplorerQueries';
import { usePresenceRoom } from '../../hooks/usePresenceRoom';
import { useSessionStore } from '../../store/session-store';
import { ObjectDetailView } from './ObjectDetailView';

interface ObjectDrawerShellProps {
  objectId: string | null;
  onClose: () => void;
}

const DRAWER_TYPE_LABELS: Record<string, string> = {
  HOT: 'Hotel',
  HPA: 'Hebergement plein air',
  HLO: 'Hebergement loisir',
  CAMP: 'Camping',
  RVA: 'Residence vacances',
  RES: 'Restaurant',
  ITI: 'Itineraire',
  FMA: 'Manifestation',
  ASC: 'Activite',
  ACT: 'Activite',
  LOI: 'Loisir',
  PCU: 'Patrimoine',
  PNA: 'Site naturel',
  PSV: 'Prestataire',
  SRV: 'Service',
  VIL: 'Ville',
  COM: 'Commerce',
};

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
  const [headerFavorite, setHeaderFavorite] = useState(false);
  const { data, isError, error, isLoading } = useObjectWorkspaceQuery(objectId);
  const { peers, typingUsers } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId), syncGlobalStatus: false },
  );
  const role = useSessionStore((state) => state.role);
  const canEdit = role !== null;

  const resolvedData = data ?? null;
  const isShellLoading = isLoading || !resolvedData;
  const previewRaw = resolvedData?.detail.raw ?? {};

  const typeLabel = resolvedData?.type ? DRAWER_TYPE_LABELS[resolvedData.type] ?? resolvedData.type : '';
  const typeLineUpper = typeLabel ? typeLabel.toUpperCase() : '';
  const title = resolvedData?.name ?? 'Chargement…';

  function openFullPageEditor() {
    if (!objectId) {
      return;
    }
    onClose();
    router.push(`/objects/${objectId}/edit`);
  }

  return (
    <div key={objectId} className="drawer-shell__inner">
      <div className="drawer-header" aria-busy={isShellLoading}>
        {isShellLoading ? (
          <DrawerHeaderSkeleton />
        ) : (
          <div className="drawer-header__left">
            {resolvedData && (
              <div className="drawer-header__eyebrow-row" aria-label="Type">
                <span className="drawer-header__type-line">{typeLineUpper}</span>
              </div>
            )}
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
          </div>
        )}
        <div className="drawer-header__actions">
          <StatusPill tone="green">{peers.length} live</StatusPill>
          <AvatarStack people={peers} />
          <button
            type="button"
            className={`drawer-header__icon-btn${headerFavorite ? ' drawer-header__icon-btn--active' : ''}`}
            onClick={() => setHeaderFavorite((v) => !v)}
            aria-label={headerFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={headerFavorite}
          >
            <Star className="h-4 w-4" strokeWidth={2} fill={headerFavorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="drawer-header__btn-secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" strokeWidth={2} />
            <span>Imprimer</span>
          </button>
          {canEdit && (
            <button type="button" className="drawer-header__btn-primary" onClick={openFullPageEditor}>
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
            <ObjectDetailView data={resolvedData.detail} raw={previewRaw as Record<string, unknown>} />
          </section>
        )}
      </div>
    </div>
  );
}

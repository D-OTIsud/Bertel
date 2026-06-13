"use client";

// Vue ÉTABLISSEMENT / OBJET (§61, design v2 + rectif PO point 3) — le CONTEXTE de la
// relation. Montre les acteurs liés (avec leur rôle, actor_object_role) et tout
// l'historique CRM de l'objet, tous acteurs confondus (le QUI par carte).
// « Nouvelle interaction » ouvre le modal partagé avec contexte FIXÉ (cet objet) et
// acteur optionnel parmi les acteurs liés. Données réelles : api.list_object_crm ;
// le nom/type de l'objet est résolu depuis l'annuaire (le RPC objet ne porte pas ces
// champs). Gating page-wide write_crm_notes (no-write-trap).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Plus } from 'lucide-react';
import { listCrmDirectory, listDemandTopics, listObjectCrm } from '../../services/crm';
import { CrmTimeline, Pav, TypeTag, type CrmTimelineCardItem } from './crm-primitives';
import { CrmInteractionModal } from './CrmInteractionModal';
import { CRM_READ_ONLY_REASON } from './crm-view-utils';

export function CrmObjectView({
  objectId,
  backLabel,
  canWrite,
  onBack,
  onOpenActor,
}: {
  objectId: string;
  backLabel: string;
  canWrite: boolean;
  onBack: () => void;
  onOpenActor: (actorId: string) => void;
}) {
  const queryClient = useQueryClient();
  const objectQuery = useQuery({ queryKey: ['crm-object', objectId], queryFn: () => listObjectCrm(objectId) });
  // Cache partagé avec l'annuaire — sert uniquement à résoudre nom + type de l'objet.
  const directoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: () => listCrmDirectory() });
  const topicsQuery = useQuery({ queryKey: ['crm-demand-topics'], queryFn: listDemandTopics });
  const [composerOpen, setComposerOpen] = useState(false);

  const resolved = useMemo(() => {
    for (const entry of directoryQuery.data ?? []) {
      const match = entry.objects.find((object) => object.objectId === objectId);
      if (match) return { name: match.objectName, type: match.objectType };
    }
    return null;
  }, [directoryQuery.data, objectId]);

  const objectName = resolved?.name ?? objectId;
  const objectType = resolved?.type ?? '';

  const snapshot = objectQuery.data;
  // Rectif PO v5 point 5 : la carte de l'historique objet ouvre la fiche acteur. list_object_crm
  // porte désormais actor_id par interaction ⇒ on l'utilise DIRECTEMENT (plus de résolution
  // fragile par nom). actorId null ⇒ carte non cliquable (dégradation silencieuse, jamais de
  // faux lien — une interaction peut être ancrée au seul objet, sans acteur).
  const timelineItems = useMemo<CrmTimelineCardItem[]>(
    () =>
      (snapshot?.interactions ?? []).map((item) => ({
        id: item.id,
        interactionType: item.interactionType,
        subject: item.subject,
        body: item.body,
        occurredAt: item.occurredAt,
        topicName: item.topicName,
        sentimentCode: item.sentimentCode,
        sentimentName: item.sentimentName,
        objectId: null,
        objectName: null,
        ownerName: item.ownerName,
        actorName: item.actorName,
        actorId: item.actorId,
      })),
    [snapshot],
  );

  if (objectQuery.isLoading) {
    return <div className="crm-loading">Chargement de la vue établissement…</div>;
  }
  if (objectQuery.isError || !snapshot) {
    return (
      <div className="crm-body">
        <button type="button" className="crm-back" onClick={onBack}>
          <ChevronLeft size={12} aria-hidden /> {backLabel}
        </button>
        <div className="inline-alert">
          Échec du chargement : {(objectQuery.error as Error | null)?.message ?? 'données indisponibles'}
        </div>
      </div>
    );
  }

  const actors = snapshot.actors;

  return (
    <div className="crm-body">
      <button type="button" className="crm-back" onClick={onBack}>
        <ChevronLeft size={12} aria-hidden /> {backLabel}
      </button>

      <div className="crm-hero">
        <Pav name={objectName} tintKey={objectType || objectName} lg />
        <div className="crm-hero__main">
          <div className="crm-hero__name">
            {objectName}
            <TypeTag objectType={objectType} />
          </div>
          <div className="crm-hero__meta">
            <span>vue CRM de l&apos;établissement — tous acteurs confondus</span>
          </div>
          <div className="crm-hero__pills">
            <span className="pill-mini">
              {actors.length} acteur{actors.length > 1 ? 's' : ''} lié{actors.length > 1 ? 's' : ''}
            </span>
            <span className="pill-mini">
              {snapshot.interactions.length} interaction{snapshot.interactions.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="crm-hero__actions">
          <Link className="crm-btn" href={`/objects/${objectId}/edit`}>
            <ExternalLink size={13} aria-hidden /> Ouvrir dans l&apos;éditeur
          </Link>
          <button
            type="button"
            className="crm-btn primary"
            disabled={!canWrite}
            title={canWrite ? undefined : CRM_READ_ONLY_REASON}
            onClick={() => setComposerOpen(true)}
          >
            <Plus size={13} aria-hidden /> Nouvelle interaction
          </button>
        </div>
      </div>

      <div className="crm-fgrid">
        <div className="crm-panel">
          <div className="crm-panel__head">
            <h3>Historique CRM de l&apos;établissement</h3>
          </div>
          <div className="crm-panel__body">
            <CrmTimeline
              items={timelineItems}
              showActor
              showContext={false}
              onOpenActor={onOpenActor}
              emptyLabel="Aucune interaction enregistrée pour cet établissement."
            />
          </div>
        </div>

        <div className="crm-rail">
          <div className="rcard" role="group" aria-label="Acteurs liés">
            <h4>Acteurs liés</h4>
            {actors.map((actor) => (
              <button key={actor.actorId} type="button" className="rel-row" onClick={() => onOpenActor(actor.actorId)}>
                <Pav name={actor.displayName} tintKey={actor.actorId} photoUrl={actor.photoUrl} />
                <span className="who">
                  <strong>{actor.displayName}</strong>
                  <small>{actor.roleName ?? '—'}</small>
                </span>
                {actor.isPrimary && <span className="pill-mini principal">principal</span>}
                <span className="crm-row__go" aria-hidden>
                  <ChevronRight size={12} />
                </span>
              </button>
            ))}
            {actors.length === 0 && <p className="crm-rail__empty">Aucun acteur lié à cet établissement.</p>}
            <p className="crm-rail__note">
              L&apos;établissement est le contexte de la relation — les interactions appartiennent aux acteurs.
            </p>
          </div>
        </div>
      </div>

      {composerOpen && canWrite && (
        <CrmInteractionModal
          fixedContext={{ objectId, objectName }}
          actorOptions={actors.map((actor) => ({ actorId: actor.actorId, displayName: actor.displayName }))}
          topics={topicsQuery.data ?? []}
          onClose={() => setComposerOpen(false)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['crm-object', objectId] })}
        />
      )}
    </div>
  );
}

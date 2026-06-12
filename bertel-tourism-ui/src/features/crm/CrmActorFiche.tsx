"use client";

// Fiche ACTEUR 360° (§61, design v2 + rectifs PO points 3+4) — l'historique CRM complet
// d'une personne ou organisation À TRAVERS tous ses contextes (établissements).
// Données réelles : api.list_actor_crm (+ canaux), api.save_crm_interaction /
// save_crm_task / save_crm_actor / save_actor_channel via services/crm.
// Le composer inline a déménagé dans le modal « Nouvelle interaction » (hero) ; la fiche
// permet aussi « Nouvelle tâche » (ancrée sur un établissement de l'acteur, rattachée à
// l'acteur) et l'édition identité + coordonnées (« Modifier »). Gating page-wide
// write_crm_notes : boutons désactivés AVEC raison (no-write-trap).

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, Globe, Link2, Mail, Pencil, Phone, Plus } from 'lucide-react';
import { listActorCrm, listDemandTopics } from '../../services/crm';
import { CrmTimeline, Kpi, Pav, TypeTag, type CrmTimelineCardItem } from './crm-primitives';
import { CrmInteractionModal } from './CrmInteractionModal';
import { CrmTaskModal } from './CrmTaskModal';
import { CrmActorEditModal } from './CrmActorModals';
import { CRM_READ_ONLY_REASON, formatRelative, formatShort } from './crm-view-utils';

const YEAR_MS = 365 * 86_400_000;

// Icône par kind_code de canal — fallback générique pour les kinds moins courants
// (whatsapp, messenger…) dont le libellé réel (kindName) reste affiché.
const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  mobile: Phone,
  website: Globe,
};

function errorMessageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (code === '42501') return 'Acteur hors de votre périmètre.';
    if (typeof message === 'string') return message;
  }
  return 'Échec du chargement CRM.';
}

type FicheModal = 'interaction' | 'task' | 'edit' | null;

export function CrmActorFiche({
  actorId,
  canWrite,
  onBack,
  onOpenObject,
}: {
  actorId: string;
  canWrite: boolean;
  onBack: () => void;
  onOpenObject: (objectId: string) => void;
}) {
  const queryClient = useQueryClient();
  const actorQuery = useQuery({ queryKey: ['crm-actor', actorId], queryFn: () => listActorCrm(actorId) });
  const topicsQuery = useQuery({ queryKey: ['crm-demand-topics'], queryFn: listDemandTopics });

  // 'all' | 'general' | <objectId> — filtre de contexte de la timeline.
  const [ctxFilter, setCtxFilter] = useState<string>('all');
  const [modal, setModal] = useState<FicheModal>(null);

  const snapshot = actorQuery.data;
  const interactions = useMemo(() => snapshot?.interactions ?? [], [snapshot]);
  const objects = snapshot?.objects ?? [];
  const channels = snapshot?.channels ?? [];

  const typeByObjectId = useMemo(() => {
    const map = new Map<string, string>();
    for (const object of objects) map.set(object.objectId, object.objectType);
    return map;
  }, [objects]);

  const timelineItems = useMemo<CrmTimelineCardItem[]>(
    () =>
      interactions
        .filter((item) => {
          if (ctxFilter === 'all') return true;
          if (ctxFilter === 'general') return item.objectId === null;
          return item.objectId === ctxFilter;
        })
        .map((item) => ({
          id: item.id,
          interactionType: item.interactionType,
          subject: item.subject,
          body: item.body,
          occurredAt: item.occurredAt,
          topicName: item.topicName,
          sentimentCode: item.sentimentCode,
          sentimentName: item.sentimentName,
          objectId: item.objectId,
          objectName: item.objectName,
          objectType: item.objectId ? typeByObjectId.get(item.objectId) ?? null : null,
          ownerName: item.ownerName,
        })),
    [interactions, ctxFilter, typeByObjectId],
  );

  if (actorQuery.isLoading) {
    return <div className="crm-loading">Chargement de la fiche acteur…</div>;
  }
  if (actorQuery.isError || !snapshot) {
    return (
      <div className="crm-body">
        <button type="button" className="crm-back" onClick={onBack}>
          <ChevronLeft size={12} aria-hidden /> Annuaire des acteurs
        </button>
        <div className="inline-alert">{errorMessageOf(actorQuery.error)}</div>
      </div>
    );
  }

  const now = Date.now();
  const occurredTimestamps = interactions
    .map((item) => (item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp));
  const last12Months = occurredTimestamps.filter((timestamp) => now - timestamp <= YEAR_MS).length;
  const lastContactAt = occurredTimestamps.length > 0 ? new Date(Math.max(...occurredTimestamps)).toISOString() : null;
  const topicOptions = topicsQuery.data ?? [];
  const identitySubline = [snapshot.actor.firstName, snapshot.actor.lastName].filter(Boolean).join(' ');

  return (
    <div className="crm-body">
      <button type="button" className="crm-back" onClick={onBack}>
        <ChevronLeft size={12} aria-hidden /> Annuaire des acteurs
      </button>

      <div className="crm-hero">
        <Pav name={snapshot.actor.displayName} tintKey={snapshot.actor.id} lg />
        <div className="crm-hero__main">
          <div className="crm-hero__name">{snapshot.actor.displayName}</div>
          {identitySubline && identitySubline !== snapshot.actor.displayName && (
            <div className="crm-hero__meta">
              <span>{identitySubline}</span>
            </div>
          )}
          <div className="crm-hero__pills">
            <span className="pill-mini">
              {objects.length} établissement{objects.length > 1 ? 's' : ''}
            </span>
            <span className="pill-mini">
              {interactions.length} interaction{interactions.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="crm-hero__actions">
          <button
            type="button"
            className="crm-btn"
            disabled={!canWrite}
            title={canWrite ? undefined : CRM_READ_ONLY_REASON}
            onClick={() => setModal('task')}
          >
            <CalendarPlus size={13} aria-hidden /> Nouvelle tâche
          </button>
          <button
            type="button"
            className="crm-btn primary"
            disabled={!canWrite}
            title={canWrite ? undefined : CRM_READ_ONLY_REASON}
            onClick={() => setModal('interaction')}
          >
            <Plus size={13} aria-hidden /> Nouvelle interaction
          </button>
        </div>
      </div>
      {!canWrite && <p className="crm-readonly-note">{CRM_READ_ONLY_REASON}</p>}

      <div className="crm-stats">
        <Kpi label="Interactions · 12 mois" value={String(last12Months)} hint="tous contextes confondus" />
        <Kpi
          label="Dernier contact"
          value={lastContactAt ? formatShort(lastContactAt) : '—'}
          hint={lastContactAt ? formatRelative(lastContactAt) : 'aucune interaction'}
        />
        <Kpi label="Sujets distincts" value={String(snapshot.topics.length)} hint="sujets normalisés demand_topic" />
        <Kpi label="Établissements" value={String(objects.length)} hint="contextes de la relation" />
      </div>

      <div className="crm-fgrid">
        <div className="crm-panel">
          <div className="crm-panel__body">
            <div className="chip-row crm-ctx-filters" role="group" aria-label="Filtrer par contexte">
              <button
                type="button"
                className={'crm-chip' + (ctxFilter === 'all' ? ' is-on' : '')}
                aria-pressed={ctxFilter === 'all'}
                onClick={() => setCtxFilter('all')}
              >
                Tous
              </button>
              {objects.map((object) => (
                <button
                  key={object.objectId}
                  type="button"
                  className={'crm-chip' + (ctxFilter === object.objectId ? ' is-on' : '')}
                  aria-pressed={ctxFilter === object.objectId}
                  onClick={() => setCtxFilter(object.objectId)}
                >
                  {object.objectName}
                </button>
              ))}
              <button
                type="button"
                className={'crm-chip' + (ctxFilter === 'general' ? ' is-on' : '')}
                aria-pressed={ctxFilter === 'general'}
                onClick={() => setCtxFilter('general')}
              >
                Général
              </button>
            </div>

            <CrmTimeline items={timelineItems} onOpenObject={onOpenObject} />
          </div>
        </div>

        <div className="crm-rail">
          {/* Coordonnées EN PREMIER (rectif PO point 4) : ce qu'on sait de la personne. */}
          <div className="rcard" role="group" aria-label="Coordonnées">
            <h4>
              Coordonnées
              <button
                type="button"
                className="crm-btn sm"
                disabled={!canWrite}
                title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                onClick={() => setModal('edit')}
              >
                <Pencil size={11} aria-hidden /> Modifier
              </button>
            </h4>
            {channels.map((channel) => {
              const Icon = CHANNEL_ICONS[channel.kindCode] ?? Link2;
              return (
                <div key={channel.id} className="coord-row" title={channel.kindName}>
                  <Icon size={13} aria-hidden />
                  <span className="val">{channel.value}</span>
                  {channel.isPrimary && <span className="pill-mini principal">principal</span>}
                </div>
              );
            })}
            {channels.length === 0 && <p className="crm-rail__empty">Aucun canal renseigné.</p>}
          </div>

          <div className="rcard" role="group" aria-label="Établissements & rôles">
            <h4>Établissements &amp; rôles</h4>
            {objects.map((object) => (
              <button key={object.objectId} type="button" className="rel-row" onClick={() => onOpenObject(object.objectId)}>
                <TypeTag objectType={object.objectType} />
                <span className="who">
                  <strong>{object.objectName}</strong>
                  <small>{object.roleName ?? '—'}</small>
                </span>
                {object.isPrimary && <span className="pill-mini principal">principal</span>}
              </button>
            ))}
            {objects.length === 0 && <p className="crm-rail__empty">Aucun établissement lié.</p>}
          </div>

          {snapshot.topics.length > 0 && (
            <div className="rcard">
              <h4>Sujets récurrents</h4>
              <div className="chip-row">
                {snapshot.topics.map((topic) => (
                  <span key={topic.code} className="topic-chip">
                    {topic.name} — {topic.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {modal === 'interaction' && canWrite && (
        <CrmInteractionModal
          actorId={actorId}
          contexts={objects.map((object) => ({ objectId: object.objectId, objectName: object.objectName }))}
          topics={topicOptions}
          onClose={() => setModal(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['crm-actor', actorId] })}
        />
      )}
      {modal === 'task' && canWrite && (
        <CrmTaskModal
          actorId={actorId}
          picker="select"
          objectOptions={objects.map((object) => ({ objectId: object.objectId, objectName: object.objectName }))}
          onClose={() => setModal(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] })}
        />
      )}
      {modal === 'edit' && canWrite && (
        <CrmActorEditModal
          actor={snapshot.actor}
          channels={channels}
          onClose={() => setModal(null)}
          onSaved={() => {
            // La fiche ET l'annuaire (display_name) — le préfixe ['crm-directory'] couvre
            // aussi les clés filtrées de l'annuaire.
            void queryClient.invalidateQueries({ queryKey: ['crm-actor', actorId] });
            void queryClient.invalidateQueries({ queryKey: ['crm-directory'] });
          }}
        />
      )}
    </div>
  );
}

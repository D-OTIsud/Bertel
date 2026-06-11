"use client";

// Fiche ACTEUR 360° (§61, design v2) — l'historique CRM complet d'une personne
// ou organisation À TRAVERS tous ses contextes (établissements). Données réelles :
// api.list_actor_crm + api.save_crm_interaction via services/crm. Le composer est
// gated page-wide par write_crm_notes (no-write-trap : désactivé AVEC raison).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Mail, MapPin, Phone, Plus, StickyNote } from 'lucide-react';
import { listActorCrm, listDemandTopics, saveCrmInteraction } from '../../services/crm';
import { CrmTimeline, Kpi, Pav, TypeTag, type CrmTimelineCardItem } from './crm-primitives';
import { CRM_READ_ONLY_REASON, CRM_SENTIMENT_OPTIONS, formatRelative, formatShort } from './crm-view-utils';

const YEAR_MS = 365 * 86_400_000;

// Kinds du composer v2 : Appel / E-mail / Visite terrain / Note interne.
const COMPOSER_KINDS = [
  { code: 'call', label: 'Appel', Icon: Phone },
  { code: 'email', label: 'E-mail', Icon: Mail },
  { code: 'visit', label: 'Visite terrain', Icon: MapPin },
  { code: 'note', label: 'Note interne', Icon: StickyNote },
] as const;

function errorMessageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (code === '42501') return 'Acteur hors de votre périmètre.';
    if (typeof message === 'string') return message;
  }
  return 'Échec du chargement CRM.';
}

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
  const [kind, setKind] = useState<string>('call');
  const [ctx, setCtx] = useState<string>('');
  const [topicCode, setTopicCode] = useState<string>('');
  const [sentimentCode, setSentimentCode] = useState<string>('');
  const [body, setBody] = useState<string>('');

  const consignMutation = useMutation({
    mutationFn: () =>
      saveCrmInteraction({
        actorId,
        ...(ctx ? { objectId: ctx } : {}),
        interactionType: kind,
        body: body.trim(),
        ...(topicCode ? { topicCode } : {}),
        ...(sentimentCode ? { sentimentCode } : {}),
      }),
    onSuccess: () => {
      // Écriture confirmée : vider la saisie AVANT le refresh (un échec de rechargement
      // ne doit pas se lire comme un échec de save — pattern §19).
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['crm-actor', actorId] });
    },
  });

  const snapshot = actorQuery.data;
  const interactions = useMemo(() => snapshot?.interactions ?? [], [snapshot]);
  const objects = snapshot?.objects ?? [];

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

  return (
    <div className="crm-body">
      <button type="button" className="crm-back" onClick={onBack}>
        <ChevronLeft size={12} aria-hidden /> Annuaire des acteurs
      </button>

      <div className="crm-hero">
        <Pav name={snapshot.actor.displayName} tintKey={snapshot.actor.id} lg />
        <div className="crm-hero__main">
          <div className="crm-hero__name">{snapshot.actor.displayName}</div>
          <div className="crm-hero__pills">
            <span className="pill-mini">
              {objects.length} établissement{objects.length > 1 ? 's' : ''}
            </span>
            <span className="pill-mini">
              {interactions.length} interaction{interactions.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

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
            <div className="composer">
              {!canWrite && <p className="crm-readonly-note">{CRM_READ_ONLY_REASON}</p>}
              <div className="composer__kinds">
                {COMPOSER_KINDS.map(({ code, label, Icon }) => (
                  <button
                    key={code}
                    type="button"
                    className={'kind-chip' + (kind === code ? ' is-on' : '')}
                    aria-pressed={kind === code}
                    disabled={!canWrite}
                    onClick={() => setKind(code)}
                  >
                    <Icon size={12} aria-hidden /> {label}
                  </button>
                ))}
                <select
                  className="crm-select"
                  aria-label="Contexte"
                  value={ctx}
                  disabled={!canWrite}
                  onChange={(event) => setCtx(event.target.value)}
                >
                  <option value="">Contexte : général</option>
                  {objects.map((object) => (
                    <option key={object.objectId} value={object.objectId}>
                      {object.objectName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="composer__row">
                <select
                  className="crm-select"
                  aria-label="Sujet normalisé"
                  value={topicCode}
                  disabled={!canWrite}
                  onChange={(event) => setTopicCode(event.target.value)}
                >
                  <option value="">— Sujet —</option>
                  {topicOptions.map((topic) => (
                    <option key={topic.code} value={topic.code}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <select
                  className="crm-select"
                  aria-label="Sentiment"
                  value={sentimentCode}
                  disabled={!canWrite}
                  onChange={(event) => setSentimentCode(event.target.value)}
                >
                  <option value="">— Sentiment —</option>
                  {CRM_SENTIMENT_OPTIONS.map((sentiment) => (
                    <option key={sentiment.code} value={sentiment.code}>
                      {sentiment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="composer__row">
                <input
                  className="note"
                  placeholder="Consigner une interaction… (résumé)"
                  value={body}
                  disabled={!canWrite}
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && body.trim() && !consignMutation.isPending) consignMutation.mutate();
                  }}
                />
                <button
                  type="button"
                  className="crm-btn primary"
                  disabled={!canWrite || !body.trim() || consignMutation.isPending}
                  title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                  onClick={() => consignMutation.mutate()}
                >
                  <Plus size={12} aria-hidden /> Consigner
                </button>
              </div>
              {consignMutation.isError && (
                <div className="inline-alert" role="alert">
                  Échec de la consignation : {(consignMutation.error as Error).message}
                </div>
              )}
            </div>

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
    </div>
  );
}

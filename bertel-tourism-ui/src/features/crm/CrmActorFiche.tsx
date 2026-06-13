"use client";

// Fiche ACTEUR 360° (§61, design v2 + rectifs PO) — l'historique CRM complet d'une personne
// ou organisation À TRAVERS tous ses contextes (établissements).
// Données réelles : api.list_actor_crm (+ canaux), api.save_crm_interaction /
// save_crm_task / save_crm_actor / save_actor_channel via services/crm.
//
// Mise en page deux colonnes (rectif PO §66+ ; colonnes INVERSÉES) :
//  - COLONNE GAUCHE (.crm-actor-grid__side, rail) : la carte acteur (avatar, nom, identité,
//    Coordonnées cliquables verticales, « Modifier ») PUIS les KPI compacts PUIS « Établissements
//    & rôles » PUIS « Sujets récurrents ». (Placée en colonne 1 via `order` — voir styles.css.)
//  - COLONNE DROITE (.crm-actor-grid__main) : les actions (« Nouvelle tâche » / « Nouvelle
//    interaction ») PUIS l'historique d'interactions (timeline + chips de contexte + fils).
// Mobile (≤ ~720px) : une seule colonne, la carte acteur EN PREMIER (toujours visible), le reste
// du rail (KPI + Établissements + Sujets) replié derrière un toggle « Voir les indicateurs »,
// puis les actions + la timeline en dessous. Le repli est piloté par JS sur mobile et FORCÉ
// déplié au-dessus du breakpoint par media query (desktop ignore l'état JS).
// Gating page-wide write_crm_notes : boutons désactivés AVEC raison (no-write-trap).

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronDown, ChevronLeft, Globe, Link2, Mail, Pencil, Phone, Plus } from 'lucide-react';
import { listActorCrm, listDemandTopics, saveCrmInteraction } from '../../services/crm';
import { CrmTimeline, Kpi, Pav, TypeTag, type CrmTimelineCardItem } from './crm-primitives';
import { CrmInteractionModal } from './CrmInteractionModal';
import { CrmTaskModal } from './CrmTaskModal';
import { CrmActorEditModal } from './CrmActorModals';
import { CRM_READ_ONLY_REASON, channelHrefOf, formatRelative, formatShort, topicTintOf } from './crm-view-utils';

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

/** Un canal de coordonnées tel que servi par list_actor_crm. */
interface ActorChannel {
  id: string;
  kindCode: string;
  kindName: string;
  value: string;
  isPrimary: boolean;
}

/**
 * Une ligne de coordonnées — UN canal par ligne (liste verticale, rectif PO §66+). Le canal
 * devient cliquable selon son kind (mailto / tel / lien externe) via channelHrefOf ; le texte
 * du lien EST la valeur (accessible). Un kind non actionnable retombe sur du texte brut. L'icône
 * de kind et le badge « principal » sont conservés.
 */
function CoordRow({ channel }: { channel: ActorChannel }) {
  const Icon = CHANNEL_ICONS[channel.kindCode] ?? Link2;
  const { href, external } = channelHrefOf(channel.kindCode, channel.value);
  return (
    <li className="coord-row" title={channel.kindName}>
      <Icon size={13} aria-hidden />
      {href ? (
        <a
          className="val"
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {channel.value}
        </a>
      ) : (
        <span className="val">{channel.value}</span>
      )}
      {channel.isPrimary && <span className="pill-mini principal">principal</span>}
    </li>
  );
}

/**
 * Carte acteur (rail droit, toujours visible) : avatar, nom, sous-ligne d'identité réelle,
 * Coordonnées cliquables EN VERTICAL, bouton « Modifier » gaté. Sur mobile, c'est l'unique bloc
 * du rail affiché avant repli ; le toggle des indicateurs vit juste en dessous (hors carte).
 */
function CrmActorCard({
  displayName,
  actorId,
  photoUrl,
  identitySubline,
  channels,
  canWrite,
  onEdit,
}: {
  displayName: string;
  actorId: string;
  photoUrl: string | null;
  identitySubline: string;
  channels: ActorChannel[];
  canWrite: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="crm-actor-card">
      <div className="crm-actor-card__head">
        <Pav name={displayName} tintKey={actorId} photoUrl={photoUrl} lg />
        <div className="crm-actor-card__id">
          <div className="crm-actor-card__name">{displayName}</div>
          {identitySubline && identitySubline !== displayName && (
            <div className="crm-actor-card__sub">{identitySubline}</div>
          )}
        </div>
      </div>
      <ul className="crm-actor-coords" aria-label="Coordonnées">
        {channels.map((channel) => (
          <CoordRow key={channel.id} channel={channel} />
        ))}
        {channels.length === 0 && (
          <li className="crm-actor-coords__empty">Aucun canal renseigné.</li>
        )}
      </ul>
      <button
        type="button"
        className="crm-btn sm crm-actor-card__edit"
        disabled={!canWrite}
        title={canWrite ? undefined : CRM_READ_ONLY_REASON}
        onClick={onEdit}
      >
        <Pencil size={11} aria-hidden /> Modifier
      </button>
    </div>
  );
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
  const [modal, setModal] = useState<FicheModal>(null);
  // Repli mobile (rectif PO §66+) : sur petit écran, seule la carte acteur est visible ; ce toggle
  // déplie KPI + Établissements + Sujets. Défaut REPLIÉ (mobile). Au-dessus du breakpoint, une media
  // query force la région visible et masque le toggle ⇒ le desktop ignore cet état JS.
  const [sideExpanded, setSideExpanded] = useState(false);

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
          // §65/§66 — fil de discussion + fix « par Système » + statut de la demande.
          interlocutorEmail: item.interlocutorEmail,
          source: item.source,
          status: item.status,
          resolvedAt: item.resolvedAt,
          replies: item.replies,
        })),
    [interactions, ctxFilter, typeByObjectId],
  );

  // Fil de discussion (§65/§66) : répondre + basculer le statut depuis la timeline de la fiche.
  // Une réponse hérite le contexte acteur/objet de la racine (ne PAS re-passer actorId/objectId) ;
  // le toggle de statut pose/efface resolved_at. Refetch list_actor_crm après écriture confirmée.
  const refetchActor = () => queryClient.invalidateQueries({ queryKey: ['crm-actor', actorId] });
  const handleReply = async (rootId: string, body: string, sentimentCode?: string) => {
    await saveCrmInteraction({ parentInteractionId: rootId, body, ...(sentimentCode ? { sentimentCode } : {}) });
    await refetchActor();
  };
  const handleResolve = async (rootId: string, done: boolean) => {
    await saveCrmInteraction({ id: rootId, status: done ? 'done' : 'planned' });
    await refetchActor();
  };

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

      {/* Deux colonnes INVERSÉES (rectif PO) : rail (acteur + KPI + listes) à GAUCHE, main (actions
          + timeline) à DROITE — placement via `order` en CSS. Sur mobile la grille s'effondre en
          1 colonne avec le rail (order: 0) AVANT la colonne main — voir styles.css .crm-actor-grid. */}
      <div className="crm-actor-grid">
        <div className="crm-actor-grid__main">
          {!canWrite && <p className="crm-readonly-note">{CRM_READ_ONLY_REASON}</p>}
          {/* Actions en tête de la colonne principale. */}
          <div className="crm-actor-actions">
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

              <CrmTimeline
                items={timelineItems}
                onOpenObject={onOpenObject}
                canWrite={canWrite}
                readOnlyReason={CRM_READ_ONLY_REASON}
                onReply={handleReply}
                onResolve={handleResolve}
              />
            </div>
          </div>
        </div>

        <aside className="crm-actor-grid__side crm-rail" aria-label="Synthèse de l'acteur">
          {/* La carte acteur est TOUJOURS visible (y compris mobile replié). */}
          <CrmActorCard
            displayName={snapshot.actor.displayName}
            actorId={snapshot.actor.id}
            photoUrl={snapshot.actor.photoUrl}
            identitySubline={identitySubline}
            channels={channels}
            canWrite={canWrite}
            onEdit={() => setModal('edit')}
          />

          {/* Toggle MOBILE-ONLY (masqué ≥ breakpoint par media query) : déplie KPI + listes. */}
          <button
            type="button"
            className="crm-actor-side-toggle"
            aria-expanded={sideExpanded}
            aria-controls="crm-actor-side-collapsible"
            onClick={() => setSideExpanded((open) => !open)}
          >
            {sideExpanded ? 'Masquer les indicateurs' : 'Voir les indicateurs'}
            <ChevronDown size={13} aria-hidden className={'chev' + (sideExpanded ? ' is-open' : '')} />
          </button>

          {/* Région repliable : KPI + Établissements + Sujets. Sur mobile l'état JS pilote
              l'affichage ; ≥ breakpoint la media query la force visible (is-open ignoré). */}
          <div
            id="crm-actor-side-collapsible"
            className={'crm-actor-collapsible' + (sideExpanded ? ' is-open' : '')}
          >
            {/* KPI compacts (rectif PO §66+) — 4 accents cyclés teal / orange / bleu / prune. */}
            <div className="crm-actor-kpis">
              <Kpi label="Interactions · 12 mois" value={String(last12Months)} hint="tous contextes confondus" accent="teal" />
              <Kpi
                label="Dernier contact"
                value={lastContactAt ? formatShort(lastContactAt) : '—'}
                hint={lastContactAt ? formatRelative(lastContactAt) : 'aucune interaction'}
                accent="orange"
              />
              <Kpi label="Sujets distincts" value={String(snapshot.topics.length)} hint="sujets normalisés demand_topic" accent="blue" />
              <Kpi label="Établissements" value={String(objects.length)} hint="contextes de la relation" accent="plum" />
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
                  {/* Rectif PO v5 point 1 : teinte de sujet stable par code (cohérente partout). */}
                  {snapshot.topics.map((topic) => (
                    <span key={topic.code} className={`topic-chip topic-pill topic--${topicTintOf(topic.code)}`}>
                      {topic.name} — {topic.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
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

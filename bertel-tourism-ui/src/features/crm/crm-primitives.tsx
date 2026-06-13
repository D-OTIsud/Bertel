"use client";

// Primitives partagées du module CRM acteur-centré (§61, design v2).
// Présentation pure : aucun accès service ici — les vues passent les données.
// Pav = avatar (acteur ou objet) teinté ; TypeTag = pastille type d'objet ;
// CtxTag = tag de contexte objet d'une interaction (« Général » si null) ;
// Timeline/TlCard = flux d'interactions groupé par mois (forme tl du design).

import { useEffect, useState, type ReactNode } from 'react';
import { Check, CornerDownRight, Mail, MapPin, Phone, RotateCcw, StickyNote } from 'lucide-react';
import type { CrmInteractionReply } from '../../types/domain';
import {
  CRM_SENTIMENT_OPTIONS,
  formatShort,
  initialsOf,
  interactionAuthorOf,
  interactionTypeLabelOf,
  monthLabelOf,
  moodToneOf,
  pavTintOf,
  tlIcoClassOf,
} from './crm-view-utils';

/**
 * Callbacks d'écriture du fil (§65/§66) — fournis par les consommateurs qui ont la query +
 * la permission. `onReply` consigne une réponse sous la racine puis invalide la query ;
 * `onResolve` bascule le statut (done/planned). Absents ⇒ carte en lecture seule (pas de
 * contrôle rendu). `canWrite=false` ⇒ contrôles RENDUS mais désactivés avec raison
 * (no-write-trap) — on ne masque PAS l'affordance, on l'explique.
 */
export interface CrmThreadActions {
  canWrite?: boolean;
  readOnlyReason?: string;
  onReply?: (rootId: string, body: string, sentimentCode?: string) => Promise<void> | void;
  onResolve?: (rootId: string, done: boolean) => Promise<void> | void;
}

/**
 * Avatar carré arrondi teinté (acteur via actor_id, objet via object_type).
 * Portrait acteur (PO point 4) : quand `photoUrl` est fourni, on rend la photo (object-fit
 * cover, même rayon/taille que la tuile d'initiales) ; sinon on garde les initiales teintées.
 * Repli (revue) : une photo cassée/404 (le GC des orphelins storage est différé ⇒ ça arrivera)
 * retombe sur les initiales via `onError` — jamais de tuile vide. L'état d'erreur est remis à
 * zéro quand `photoUrl` change pour qu'un acteur cassé ne « colle » pas au suivant.
 */
export function Pav({ name, tintKey, lg, photoUrl }: { name: string; tintKey: string; lg?: boolean; photoUrl?: string | null }) {
  const tint = pavTintOf(tintKey);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [photoUrl]);
  if (photoUrl && !imgFailed) {
    return (
      <span className={'pav pav--photo' + (lg ? ' lg' : '')} aria-hidden>
        {/* alt vide : décoratif (le nom est rendu à côté) ; cover = jamais déformé. */}
        <img src={photoUrl} alt="" onError={() => setImgFailed(true)} />
      </span>
    );
  }
  return (
    <span className={'pav' + (lg ? ' lg' : '')} style={{ background: tint.bg, color: tint.fg }} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}

/** Pastille code type d'objet (HOT, RES, HLO…), teintée par type. */
export function TypeTag({ objectType }: { objectType: string }) {
  if (!objectType) return null;
  const tint = pavTintOf(objectType);
  return (
    <span className="type-tag" style={{ background: tint.bg, color: tint.fg }}>
      {objectType}
    </span>
  );
}

/** Tag de contexte objet d'une interaction — « Général » quand object_id est null. */
export function CtxTag({
  objectId,
  objectName,
  objectType,
  onOpen,
}: {
  objectId: string | null;
  objectName: string | null;
  objectType?: string | null;
  onOpen?: (objectId: string) => void;
}) {
  if (!objectId || !objectName) {
    return <span className="ctx-tag none">Général</span>;
  }
  const tint = pavTintOf(objectType || objectName);
  const clickable = Boolean(onOpen);
  return (
    <button
      type="button"
      className="ctx-tag"
      style={{ background: tint.bg, color: tint.fg }}
      title={clickable ? 'Ouvrir la vue établissement' : undefined}
      disabled={!clickable}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.(objectId);
      }}
    >
      <i style={{ background: tint.fg }} aria-hidden></i>
      {objectName}
    </button>
  );
}

/**
 * Pastille humeur — ton 6 couleurs dérivé du code sentiment (peps PO point 1), libellé =
 * sentimentName réel. Pas de pastille quand l'interaction n'a NI code NI libellé sentiment
 * (ne pas afficher un « neutre » fantôme sur les notes sans sentiment).
 */
export function Mood({ sentimentCode, sentimentName }: { sentimentCode: string | null; sentimentName: string | null }) {
  if (!sentimentCode && !sentimentName) return null;
  const tone = moodToneOf(sentimentCode);
  return <span className={'mood mood--' + tone}>{sentimentName ?? tone}</span>;
}

/** Avatar agent (owner) — initiales teintées par nom. */
export function AgAv({ name, md }: { name: string | null; md?: boolean }) {
  if (!name) {
    return (
      <span className={'agav' + (md ? ' md' : '')} style={{ background: 'var(--ink-4)' }} aria-hidden>
        —
      </span>
    );
  }
  const tint = pavTintOf(name);
  return (
    <span className={'agav' + (md ? ' md' : '')} style={{ background: tint.fg }} title={name} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}

/** Les 4 accents KPI cyclés (peps PO point 1) — barre + valeur colorées, surface calme. */
export type KpiAccent = 'teal' | 'orange' | 'blue' | 'plum';
export const KPI_ACCENTS: KpiAccent[] = ['teal', 'orange', 'blue', 'plum'];

/**
 * Carte indicateur (bandeau KPI / stats fiche). `accent` colore la barre de gauche et la
 * valeur ; non fourni = teal (compat). Les vues passent KPI_ACCENTS[i % 4] pour répartir
 * la gamme au lieu du tout-teal monochrome.
 */
export function Kpi({
  label,
  value,
  hint,
  accent = 'teal',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: KpiAccent;
}) {
  return (
    <div className={'crm-kpi crm-kpi--' + accent}>
      <span className="crm-kpi__label">{label}</span>
      <span className="crm-kpi__value">{value}</span>
      {hint ? <span className="crm-kpi__hint">{hint}</span> : null}
    </div>
  );
}

/** Segmented control (filtre agent des tâches). */
export function Seg({ items, value, onChange }: { items: string[]; value: string; onChange: (item: string) => void }) {
  return (
    <div className="seg" role="group">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={value === item ? 'is-on' : ''}
          aria-pressed={value === item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** Forme normalisée d'une carte timeline — couvre timeline org, fiche acteur et vue objet. */
export interface CrmTimelineCardItem {
  id: string;
  interactionType: string;
  subject: string;
  body: string | null;
  occurredAt: string | null;
  topicName: string | null;
  sentimentCode: string | null;
  sentimentName: string | null;
  objectId: string | null;
  objectName: string | null;
  objectType?: string | null;
  ownerName: string | null;
  actorName?: string | null;
  /** Acteur de l'interaction (rectif PO v5 point 5) — clic carte → fiche acteur. */
  actorId?: string | null;
  /** Interlocuteur connu (§65/§66) — alimente interactionAuthorOf (fix « par Système »). */
  interlocutorEmail?: string | null;
  /** Source (import_*…) — alimente interactionAuthorOf. */
  source?: string | null;
  /** Statut de la demande (§65/§66) : 'planned' = en attente, 'done' = traitée. */
  status?: string | null;
  /** Timestamp de résolution (§65/§66) — affiché sur la chip « Traitée ». */
  resolvedAt?: string | null;
  /** Fil de discussion (§65/§66) — réponses NICHÉES sous la carte ; [] = rien rendu. */
  replies?: CrmInteractionReply[];
}

const TL_ICONS = {
  call: Phone,
  mail: Mail,
  field: MapPin,
  sys: StickyNote,
} as const;

/**
 * Composer de réponse inline (§65/§66) — un textarea + sentiment optionnel + Envoyer / Annuler,
 * rendu sous la carte racine. stopPropagation sur tous les contrôles : cliquer dedans ne
 * navigue PAS vers l'acteur (la carte est cliquable). Double-submit gardé (busy) ; erreur
 * inline, saisie conservée ; fermeture/vidage au succès.
 */
function TlReplyComposer({
  rootId,
  onReply,
  onClose,
}: {
  rootId: string;
  onReply: (rootId: string, body: string, sentimentCode?: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [sentimentCode, setSentimentCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = body.trim().length > 0 && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onReply(rootId, body.trim(), sentimentCode || undefined);
      setBody('');
      setSentimentCode('');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Échec de l'envoi de la réponse.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tl-reply-composer" onClick={(event) => event.stopPropagation()}>
      <textarea
        className="tl-reply-composer__area"
        rows={3}
        placeholder="Votre réponse…"
        aria-label="Réponse"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="tl-reply-composer__row">
        <select
          className="crm-select"
          aria-label="Sentiment de la réponse"
          value={sentimentCode}
          onChange={(event) => setSentimentCode(event.target.value)}
          onClick={(event) => event.stopPropagation()}
        >
          <option value="">— Sentiment —</option>
          {CRM_SENTIMENT_OPTIONS.map((sentiment) => (
            <option key={sentiment.code} value={sentiment.code}>
              {sentiment.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="crm-btn primary sm"
          disabled={!canSend}
          onClick={(event) => {
            event.stopPropagation();
            void send();
          }}
        >
          Envoyer
        </button>
        <button
          type="button"
          className="crm-btn sm"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          Annuler
        </button>
      </div>
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Boutons « Répondre » + « Marquer traitée / Rouvrir » (§65/§66) — gatés, stopPropagation. */
function TlThreadActions({
  rootId,
  isResolved,
  actions,
  onOpenComposer,
}: {
  rootId: string;
  isResolved: boolean;
  actions: CrmThreadActions;
  onOpenComposer: () => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const { canWrite, readOnlyReason, onReply, onResolve } = actions;
  const gateTitle = canWrite === false ? readOnlyReason : undefined;

  async function toggleResolve() {
    if (!onResolve || resolving) return;
    setResolving(true);
    setResolveError(null);
    try {
      await onResolve(rootId, !isResolved);
    } catch (caught) {
      setResolveError(caught instanceof Error ? caught.message : 'Échec de la mise à jour du statut.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="tl-actions" onClick={(event) => event.stopPropagation()}>
      {onReply ? (
        <button
          type="button"
          className="crm-btn sm"
          disabled={canWrite === false}
          title={gateTitle}
          onClick={(event) => {
            event.stopPropagation();
            onOpenComposer();
          }}
        >
          <CornerDownRight size={11} aria-hidden /> Répondre
        </button>
      ) : null}
      {onResolve ? (
        <button
          type="button"
          className="crm-btn sm"
          disabled={canWrite === false || resolving}
          title={gateTitle}
          onClick={(event) => {
            event.stopPropagation();
            void toggleResolve();
          }}
        >
          {isResolved ? (
            <>
              <RotateCcw size={11} aria-hidden /> Rouvrir
            </>
          ) : (
            <>
              <Check size={11} aria-hidden /> Marquer traitée
            </>
          )}
        </button>
      ) : null}
      {resolveError ? (
        <span className="inline-alert" role="alert">
          {resolveError}
        </span>
      ) : null}
    </div>
  );
}

function TlCard({
  item,
  showActor,
  showContext,
  onOpenObject,
  onOpenActor,
  actions,
}: {
  item: CrmTimelineCardItem;
  showActor?: boolean;
  showContext?: boolean;
  onOpenObject?: (objectId: string) => void;
  /** Rectif PO v5 point 5 : clic sur la carte → fiche acteur (timeline org + vue objet). */
  onOpenActor?: (actorId: string) => void;
  /** Écriture du fil (§65/§66) — réponse + bascule de statut, gatées. Absent ⇒ lecture seule. */
  actions?: CrmThreadActions;
}) {
  const icoClass = tlIcoClassOf(item.interactionType);
  const Icon = TL_ICONS[icoClass];
  // Titre = le SUJET (rectif PO v5 point 4) : le sujet normalisé (topicName) prime, puis le
  // subject brut (les lignes importées sans sujet retombent sur « Note interne »), puis le
  // libellé du type en dernier recours. Le type n'est PLUS le titre — il devient une petite
  // pastille secondaire.
  const title = item.topicName || item.subject || interactionTypeLabelOf(item.interactionType);
  // Peps PO point 1 : la COULEUR de la ligne vient du SENTIMENT (le type pilote le glyphe).
  // Liseré gauche de la carte + anneau de l'icône teintés par le ton — la timeline varie
  // ligne à ligne même quand chaque interaction est une « note ».
  const tone = moodToneOf(item.sentimentCode);
  // Carte cliquable → fiche acteur (rectif PO v5 point 5) quand un callback + un actorId sont
  // fournis. La fiche acteur ne passe PAS onOpenActor (on y est déjà) ⇒ pas d'auto-lien.
  const actorId = item.actorId;
  const clickable = Boolean(onOpenActor && actorId);
  const openActor = () => {
    if (onOpenActor && actorId) onOpenActor(actorId);
  };
  // Auteur affiché du pied (fix « par Système ») : agent ayant consigné, à défaut interlocuteur,
  // à défaut étiquette de source d'import, à défaut seulement « Système ».
  const author = interactionAuthorOf({
    ownerName: item.ownerName,
    interlocutorEmail: item.interlocutorEmail ?? null,
    source: item.source ?? null,
  });
  // Statut de la demande (§65/§66) — chip discrète : 'planned' = à traiter, 'done' = traitée.
  const status = item.status ?? null;
  const replies = item.replies ?? [];
  // Résolu = statut 'done' OU (statut absent ET resolvedAt posé) — la vue objet ne porte pas
  // de `status` mais peut porter `resolvedAt`, d'où la dérivation par repli.
  const isResolved = status === 'done' || (status == null && Boolean(item.resolvedAt));
  // Composer de réponse inline : ouvert par carte (state local). Les actions du fil ne sont
  // rendues que si un consommateur passe des callbacks (onReply/onResolve).
  const [composerOpen, setComposerOpen] = useState(false);
  const hasThreadActions = Boolean(actions && (actions.onReply || actions.onResolve));
  return (
    <div className="tl-item">
      <span className={'tl-item__ico ' + icoClass + ' tone--' + tone} aria-hidden>
        <Icon size={14} />
      </span>
      <div
        className={'tl-card tone--' + tone + (clickable ? ' is-clickable' : '')}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        title={clickable ? "Ouvrir la fiche de l'acteur" : undefined}
        onClick={clickable ? openActor : undefined}
        onKeyDown={
          clickable
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openActor();
                }
              }
            : undefined
        }
      >
        <div className="tl-card__top">
          <strong>{title}</strong>
          {/* Type = pastille secondaire (plus le titre, rectif PO v5 point 4). */}
          <span className="pill-mini">{interactionTypeLabelOf(item.interactionType)}</span>
          <Mood sentimentCode={item.sentimentCode} sentimentName={item.sentimentName} />
          {/* Statut de la demande (§65/§66) : « En attente » (planned) / « Traitée » (done). */}
          {status === 'planned' ? <span className="tl-status tl-status--open">En attente</span> : null}
          {status === 'done' ? (
            <span className="tl-status tl-status--done" title={item.resolvedAt ? `Traitée le ${formatShort(item.resolvedAt)}` : undefined}>
              Traitée
            </span>
          ) : null}
          <span className="tl-card__when">{formatShort(item.occurredAt)}</span>
        </div>
        {item.body ? <p className="tl-card__sum">{item.body}</p> : null}

        {/* Fil de discussion (§65/§66) : réponses NICHÉES sous le corps, retrait + liseré gauche. */}
        {replies.length > 0 ? (
          <div className="tl-replies">
            {replies.map((reply) => {
              const replyAuthor = interactionAuthorOf({
                ownerName: reply.ownerName,
                interlocutorEmail: reply.interlocutorEmail,
                source: reply.source,
              });
              return (
                <div key={reply.id} className="tl-reply">
                  <div className="tl-reply__head">
                    <span className="tl-reply__author">{replyAuthor}</span>
                    <span className="tl-reply__when">· {formatShort(reply.occurredAt)}</span>
                    <Mood sentimentCode={reply.sentimentCode} sentimentName={reply.sentimentName} />
                  </div>
                  {reply.body ? <p className="tl-reply__body">{reply.body}</p> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="tl-card__foot">
          {/* WHO : acteur de l'interaction (affichage). */}
          {showActor && item.actorName ? <span className="tl-card__actor">{item.actorName}</span> : null}
          {/* RÉFÉRENT : auteur réel (fix « par Système ») — agent, interlocuteur ou source d'import. */}
          <span className="tl-card__owner">par {author}</span>
          {showContext !== false && (
            <span style={{ marginLeft: 'auto' }}>
              <CtxTag
                objectId={item.objectId}
                objectName={item.objectName}
                objectType={item.objectType}
                onOpen={onOpenObject}
              />
            </span>
          )}
        </div>

        {/* Actions du fil (§65/§66) : Répondre + Marquer traitée/Rouvrir, gatées. */}
        {hasThreadActions && actions ? (
          <TlThreadActions
            rootId={item.id}
            isResolved={isResolved}
            actions={actions}
            onOpenComposer={() => setComposerOpen(true)}
          />
        ) : null}
        {composerOpen && actions?.onReply ? (
          <TlReplyComposer rootId={item.id} onReply={actions.onReply} onClose={() => setComposerOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}

/** Timeline groupée par mois (tl-month) — les items arrivent triés du plus récent au plus ancien. */
export function CrmTimeline({
  items,
  showActor,
  showContext,
  onOpenObject,
  onOpenActor,
  emptyLabel,
  canWrite,
  readOnlyReason,
  onReply,
  onResolve,
}: {
  items: CrmTimelineCardItem[];
  showActor?: boolean;
  showContext?: boolean;
  onOpenObject?: (objectId: string) => void;
  /** Rectif PO v5 point 5 : carte cliquable → fiche acteur (non passé sur la fiche acteur). */
  onOpenActor?: (actorId: string) => void;
  emptyLabel?: string;
} & CrmThreadActions) {
  // Les callbacks d'écriture du fil (§65/§66) sont passés à chaque carte racine. Absents ⇒
  // chaque carte reste en lecture seule (pas de contrôle Répondre / Marquer traitée).
  const threadActions: CrmThreadActions | undefined =
    onReply || onResolve ? { canWrite, readOnlyReason, onReply, onResolve } : undefined;
  let lastMonth: string | null = null;
  return (
    <div className="tl">
      {items.map((item) => {
        const month = monthLabelOf(item.occurredAt);
        const head = month !== lastMonth ? <div className="tl-month">{month}</div> : null;
        lastMonth = month;
        return (
          <div key={item.id}>
            {head}
            <TlCard
              item={item}
              showActor={showActor}
              showContext={showContext}
              onOpenObject={onOpenObject}
              onOpenActor={onOpenActor}
              actions={threadActions}
            />
          </div>
        );
      })}
      {items.length === 0 && <p className="tl-empty">{emptyLabel ?? 'Aucune interaction dans ce contexte.'}</p>}
    </div>
  );
}

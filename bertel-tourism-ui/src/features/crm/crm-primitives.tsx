"use client";

// Primitives partagées du module CRM acteur-centré (§61, design v2).
// Présentation pure : aucun accès service ici — les vues passent les données.
// Pav = avatar (acteur ou objet) teinté ; TypeTag = pastille type d'objet ;
// CtxTag = tag de contexte objet d'une interaction (« Général » si null) ;
// Timeline/TlCard = flux d'interactions groupé par mois (forme tl du design).

import type { ReactNode } from 'react';
import { Mail, MapPin, Phone, StickyNote } from 'lucide-react';
import {
  formatShort,
  initialsOf,
  interactionTypeLabelOf,
  monthLabelOf,
  moodToneOf,
  pavTintOf,
  tlIcoClassOf,
} from './crm-view-utils';

/** Avatar carré arrondi teinté (acteur via actor_id, objet via object_type). */
export function Pav({ name, tintKey, lg }: { name: string; tintKey: string; lg?: boolean }) {
  const tint = pavTintOf(tintKey);
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
}

const TL_ICONS = {
  call: Phone,
  mail: Mail,
  field: MapPin,
  sys: StickyNote,
} as const;

function TlCard({
  item,
  showActor,
  showContext,
  onOpenObject,
}: {
  item: CrmTimelineCardItem;
  showActor?: boolean;
  showContext?: boolean;
  onOpenObject?: (objectId: string) => void;
}) {
  const icoClass = tlIcoClassOf(item.interactionType);
  const Icon = TL_ICONS[icoClass];
  const title = item.subject || item.topicName || interactionTypeLabelOf(item.interactionType);
  // Peps PO point 1 : la COULEUR de la ligne vient du SENTIMENT (le type pilote le glyphe).
  // Liseré gauche de la carte + anneau de l'icône teintés par le ton — la timeline varie
  // ligne à ligne même quand chaque interaction est une « note ».
  const tone = moodToneOf(item.sentimentCode);
  return (
    <div className="tl-item">
      <span className={'tl-item__ico ' + icoClass + ' tone--' + tone} aria-hidden>
        <Icon size={14} />
      </span>
      <div className={'tl-card tone--' + tone}>
        <div className="tl-card__top">
          <strong>{title}</strong>
          <span className="pill-mini">{interactionTypeLabelOf(item.interactionType)}</span>
          <Mood sentimentCode={item.sentimentCode} sentimentName={item.sentimentName} />
          <span className="tl-card__when">{formatShort(item.occurredAt)}</span>
        </div>
        {item.body ? <p className="tl-card__sum">{item.body}</p> : null}
        <div className="tl-card__foot">
          {/* WHO : acteur de l'interaction — affichage seul (les RPCs timeline/objet
              ne renvoient pas d'actor_id, seulement le nom). */}
          {showActor && item.actorName ? <span className="tl-card__actor">{item.actorName}</span> : null}
          <span>{item.ownerName ?? 'Système'}</span>
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
  emptyLabel,
}: {
  items: CrmTimelineCardItem[];
  showActor?: boolean;
  showContext?: boolean;
  onOpenObject?: (objectId: string) => void;
  emptyLabel?: string;
}) {
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
            <TlCard item={item} showActor={showActor} showContext={showContext} onOpenObject={onOpenObject} />
          </div>
        );
      })}
      {items.length === 0 && <p className="tl-empty">{emptyLabel ?? 'Aucune interaction dans ce contexte.'}</p>}
    </div>
  );
}

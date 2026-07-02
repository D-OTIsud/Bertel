import type { ReactNode } from 'react';
import type { ObjectCard } from '../../types/domain';
import type { ExplorerTableSort } from '../../store/explorer-view-store';
import { resolveTypeLabel } from '../../utils/labels';
import { csvCell } from '@/lib/safe-output';

/**
 * D17 — registre des colonnes de la vue Table de l'Explorer : une définition
 * par colonne (libellé, rendu, valeur de tri, valeur CSV). Toute nouvelle
 * colonne s'ajoute ICI + dans ALL_TABLE_COLUMN_IDS (store) — jamais en dur
 * dans le composant.
 * NB « Complétude » attend que le RPC cards émette le score (backend, remonté
 * à la session API) — ObjectCard ne le porte pas aujourd'hui.
 */

const STATUS_LABELS: Record<string, string> = {
  published: 'Publiée',
  draft: 'Brouillon',
  hidden: 'Hors ligne',
  archived: 'Archivée',
};

const STATUS_BADGE: Record<string, string> = {
  published: 'badge--ok',
  draft: 'badge--warn',
  hidden: 'badge--muted',
  archived: 'badge--muted',
};

const UPDATED_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function updatedTimestamp(card: ObjectCard): number | null {
  const raw = card.updated_at;
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : time;
}

function formatUpdated(card: ObjectCard): string {
  const time = updatedTimestamp(card);
  return time == null ? '—' : UPDATED_FORMAT.format(time);
}

function labelsSummary(card: ObjectCard): string[] {
  const neutral = Array.isArray(card.labels) ? card.labels : [];
  const tags = (card.tagChips ?? []).map((tag) => tag.label);
  return [...neutral, ...tags];
}

export interface TableColumnDef {
  id: string;
  label: string;
  /** Valeur comparable pour le tri client ; absent = colonne non triable. */
  sortValue?: (card: ObjectCard) => string | number | null;
  csvValue: (card: ObjectCard) => string;
  render: (card: ObjectCard) => ReactNode;
  /** Alignement numérique (droite). */
  numeric?: boolean;
}

export const TABLE_COLUMNS: Record<string, TableColumnDef> = {
  name: {
    id: 'name',
    label: 'Nom',
    sortValue: (card) => card.name ?? '',
    csvValue: (card) => card.name ?? '',
    render: (card) => card.name,
  },
  type: {
    id: 'type',
    label: 'Type',
    sortValue: (card) => resolveTypeLabel(card.type),
    csvValue: (card) => resolveTypeLabel(card.type),
    render: (card) => resolveTypeLabel(card.type),
  },
  city: {
    id: 'city',
    label: 'Commune',
    sortValue: (card) => card.location?.city ?? null,
    csvValue: (card) => card.location?.city ?? '',
    render: (card) => card.location?.city?.trim() || '—',
  },
  status: {
    id: 'status',
    label: 'Statut',
    sortValue: (card) => card.status ?? null,
    csvValue: (card) => STATUS_LABELS[card.status ?? ''] ?? card.status ?? '',
    render: (card) => {
      const status = card.status ?? '';
      if (!status) return '—';
      return (
        <span className={`badge ${STATUS_BADGE[status] ?? 'badge--muted'}`}>
          {STATUS_LABELS[status] ?? status}
        </span>
      );
    },
  },
  updated: {
    id: 'updated',
    label: 'Mise à jour',
    sortValue: updatedTimestamp,
    csvValue: formatUpdated,
    render: formatUpdated,
  },
  rating: {
    id: 'rating',
    label: 'Note',
    numeric: true,
    sortValue: (card) => card.rating ?? null,
    csvValue: (card) => (card.rating == null ? '' : String(card.rating)),
    render: (card) =>
      card.rating == null ? (
        '—'
      ) : (
        <>
          {card.rating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
          {card.review_count ? <span className="results-table__dim"> ({card.review_count})</span> : null}
        </>
      ),
  },
  price: {
    id: 'price',
    label: 'Prix min',
    numeric: true,
    sortValue: (card) => card.min_price ?? null,
    csvValue: (card) => (card.min_price == null ? '' : String(card.min_price)),
    render: (card) => (card.min_price == null ? '—' : `${card.min_price.toLocaleString('fr-FR')} €`),
  },
  open: {
    id: 'open',
    label: 'Ouvert',
    sortValue: (card) => (card.open_now == null ? null : card.open_now ? 1 : 0),
    csvValue: (card) => (card.open_now == null ? '' : card.open_now ? 'Ouvert' : 'Fermé'),
    // Tri-état §133 : null = aucune donnée d'ouverture → aucune pastille.
    render: (card) =>
      card.open_now == null ? (
        '—'
      ) : card.open_now ? (
        <span className="badge badge--ok">Ouvert</span>
      ) : (
        <span className="badge badge--muted">Fermé</span>
      ),
  },
  labels: {
    id: 'labels',
    label: 'Labels & tags',
    csvValue: (card) => labelsSummary(card).join(' | '),
    render: (card) => {
      const all = labelsSummary(card);
      if (all.length === 0) return '—';
      const shown = all.slice(0, 2);
      const rest = all.length - shown.length;
      return (
        <span className="results-table__labels" title={all.join(' · ')}>
          {shown.join(' · ')}
          {rest > 0 ? <span className="results-table__dim"> +{rest}</span> : null}
        </span>
      );
    },
  },
};

const FR_COLLATOR = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * Tri CLIENT des cartes chargées.
 * ponytail: ne trie que les pages déjà chargées (§125 pagination lazy) — un tri
 * serveur exige `p_sort_field/p_sort_dir` sur le RPC de pages (remonté à la
 * session API) ; à son arrivée, remplacer cet appel par le paramètre RPC.
 * Les valeurs nulles vont en fin de liste quel que soit le sens.
 */
export function sortCards(cards: ObjectCard[], sort: ExplorerTableSort | null): ObjectCard[] {
  if (!sort) return cards;
  const column = TABLE_COLUMNS[sort.columnId];
  const sortValue = column?.sortValue;
  if (!sortValue) return cards;
  const factor = sort.dir === 'desc' ? -1 : 1;
  return [...cards].sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
    return FR_COLLATOR.compare(String(va), String(vb)) * factor;
  });
}

/** CSV des lignes affichées (colonnes visibles) — cellules via csvCell (SEC-2). */
export function buildTableCsv(cards: ObjectCard[], columnIds: string[]): string {
  const columns = columnIds.map((id) => TABLE_COLUMNS[id]).filter(Boolean);
  const header = ['id', ...columns.map((column) => column.label)].map(csvCell).join(';');
  const rows = cards.map((card) =>
    [card.id, ...columns.map((column) => column.csvValue(card))].map(csvCell).join(';'),
  );
  return [header, ...rows].join('\n');
}

'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, Rows3, Settings2 } from 'lucide-react';
import { useExplorerStore } from '../../store/explorer-store';
import {
  ALL_TABLE_COLUMN_IDS,
  useExplorerViewStore,
} from '../../store/explorer-view-store';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';
import { EmptyState } from '../common/EmptyState';
import { buildTableCsv, sortCards, TABLE_COLUMNS } from './table-columns';
import { cn } from '@/lib/utils';

interface ResultsTableViewProps {
  cards: ObjectCard[];
  loading: boolean;
  isRefreshing?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  labelRankCounts?: { labelled: number; equivalent: number };
  /** Actions injectées dans le header (ex. ExplorerViewSwitch — plus de barre dédiée). */
  headerActions?: ReactNode;
}

/** Gestionnaire de colonnes (visibilité + ordre) — popover maison, fermé à l'Escape / clic dehors. */
function ColumnManager() {
  const tableColumns = useExplorerViewStore((state) => state.tableColumns);
  const toggleTableColumn = useExplorerViewStore((state) => state.toggleTableColumn);
  const moveTableColumn = useExplorerViewStore((state) => state.moveTableColumn);
  const resetTableColumns = useExplorerViewStore((state) => state.resetTableColumns);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="ghost-button results-table__tool"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 size={13} aria-hidden />
        Colonnes
      </button>
      {open ? (
        <div className="column-manager" role="dialog" aria-label="Colonnes du tableau">
          <p className="column-manager__title">Colonnes affichées</p>
          <ul className="column-manager__list">
            {ALL_TABLE_COLUMN_IDS.map((columnId) => {
              const column = TABLE_COLUMNS[columnId];
              if (!column) return null;
              const visibleIndex = tableColumns.indexOf(columnId);
              const isVisible = visibleIndex >= 0;
              return (
                <li key={columnId} className="column-manager__row">
                  <label className="column-manager__check">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleTableColumn(columnId)}
                    />
                    {column.label}
                  </label>
                  {isVisible ? (
                    <span className="column-manager__order">
                      <button
                        type="button"
                        className="ghost-button refcode-icon-btn"
                        aria-label={`Avancer ${column.label}`}
                        disabled={visibleIndex === 0}
                        onClick={() => moveTableColumn(columnId, -1)}
                      >
                        <ChevronUp size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="ghost-button refcode-icon-btn"
                        aria-label={`Reculer ${column.label}`}
                        disabled={visibleIndex === tableColumns.length - 1}
                        onClick={() => moveTableColumn(columnId, 1)}
                      >
                        <ChevronDown size={12} aria-hidden />
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <button type="button" className="ghost-button column-manager__reset" onClick={resetTableColumns}>
            Réinitialiser
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * D17 — vue Table dense de l'Explorer (~30 lignes/écran vs ~9 cartes) :
 * colonnes configurables (visibilité/ordre, registre table-columns), tri client
 * sur les pages chargées (ponytail — cf. sortCards), densité, sélection de
 * masse (même store que les cartes → la SelectionBar suit), export CSV des
 * lignes affichées, clic ligne = fiche (le nom reste un vrai bouton clavier).
 */
export function ResultsTableView({
  cards,
  loading,
  isRefreshing = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  headerActions,
}: ResultsTableViewProps) {
  const openDrawer = useUiStore((state) => state.openDrawer);
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const toggleSelectedObject = useExplorerStore((state) => state.toggleSelectedObject);
  const addSelectedObjects = useExplorerStore((state) => state.addSelectedObjects);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const resetAllFilters = useExplorerStore((state) => state.resetAll);
  const tableColumns = useExplorerViewStore((state) => state.tableColumns);
  const tableDensity = useExplorerViewStore((state) => state.tableDensity);
  const tableSort = useExplorerViewStore((state) => state.tableSort);
  const cycleTableSort = useExplorerViewStore((state) => state.cycleTableSort);
  const setTableDensity = useExplorerViewStore((state) => state.setTableDensity);

  const columns = tableColumns.map((id) => TABLE_COLUMNS[id]).filter(Boolean);
  const sortedCards = useMemo(() => sortCards(cards, tableSort), [cards, tableSort]);
  const allLoadedSelected = cards.length > 0 && cards.every((card) => selectedObjectIds.includes(card.id));

  function handleExportCsv() {
    const csv = buildTableCsv(sortedCards, tableColumns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `explorer_table_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line bg-surface px-4">
        <div className="flex min-w-0 items-baseline gap-2 font-display text-[13px] font-bold tracking-tight text-ink">
          <span className="truncate">Résultats</span>
          <span className="truncate font-sans text-xs font-medium text-ink-3">
            {cards.length} fiches{isRefreshing ? ' · mise à jour…' : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="ghost-button results-table__tool"
            aria-pressed={tableDensity === 'compact'}
            title={tableDensity === 'compact' ? 'Densité confort' : 'Densité compacte'}
            onClick={() => setTableDensity(tableDensity === 'compact' ? 'confort' : 'compact')}
          >
            <Rows3 size={13} aria-hidden />
            {tableDensity === 'compact' ? 'Compact' : 'Confort'}
          </button>
          <ColumnManager />
          <button
            type="button"
            className="ghost-button results-table__tool"
            onClick={handleExportCsv}
            aria-disabled={sortedCards.length === 0 || undefined}
          >
            <Download size={13} aria-hidden />
            CSV
          </button>
          {headerActions}
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-sm text-ink-3" aria-hidden="true">
          Chargement des fiches…
        </div>
      ) : null}

      {!loading && cards.length === 0 ? (
        /* D29 : même EmptyState « filtered » que la vue cartes. */
        <div className="p-3">
          <EmptyState
            mode="filtered"
            title="Aucun résultat pour ces filtres"
            description="Essayez d'élargir la recherche ou de relâcher les contraintes (carte, statuts, équipements)."
            action={{ label: 'Réinitialiser les filtres', onClick: () => resetAllFilters() }}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className={cn('results-table', tableDensity === 'compact' && 'results-table--compact')}>
          <thead>
            <tr>
              <th scope="col" className="results-table__check-col">
                <input
                  type="checkbox"
                  aria-label={
                    allLoadedSelected ? 'Désélectionner les fiches chargées' : 'Sélectionner les fiches chargées'
                  }
                  checked={allLoadedSelected}
                  onChange={() => {
                    if (allLoadedSelected) {
                      clearSelection();
                    } else {
                      addSelectedObjects(cards.map((card) => card.id));
                    }
                  }}
                />
              </th>
              {columns.map((column) => {
                const isSorted = tableSort?.columnId === column.id;
                const ariaSort = isSorted ? (tableSort?.dir === 'asc' ? 'ascending' : 'descending') : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(column.numeric && 'results-table__num')}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className="results-table__sort"
                        onClick={() => cycleTableSort(column.id)}
                        title={`Trier par ${column.label}`}
                      >
                        {column.label}
                        {isSorted ? (
                          tableSort?.dir === 'asc' ? (
                            <ArrowUp size={11} aria-hidden />
                          ) : (
                            <ArrowDown size={11} aria-hidden />
                          )
                        ) : null}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedCards.map((card) => {
              const inSelection = selectedObjectIds.includes(card.id);
              return (
                <tr
                  key={card.id}
                  className={cn(inSelection && 'is-selected')}
                  aria-selected={inSelection}
                  onClick={() => openDrawer(card.id)}
                >
                  <td
                    className="results-table__check-col"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={inSelection ? `Retirer ${card.name} de la sélection` : `Ajouter ${card.name} à la sélection`}
                      checked={inSelection}
                      onChange={() => toggleSelectedObject(card.id)}
                    />
                  </td>
                  {columns.map((column, columnIndex) => (
                    <td key={column.id} className={cn(column.numeric && 'results-table__num')}>
                      {columnIndex === 0 ? (
                        <button
                          type="button"
                          className="results-table__open"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDrawer(card.id);
                          }}
                        >
                          {column.render(card)}
                        </button>
                      ) : (
                        column.render(card)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {hasMore && onLoadMore ? (
          <div className="flex justify-center p-3">
            <button
              type="button"
              className="ghost-button text-xs"
              aria-disabled={isLoadingMore || undefined}
              onClick={() => {
                if (isLoadingMore) return;
                onLoadMore();
              }}
            >
              {isLoadingMore ? 'Chargement…' : 'Charger plus de résultats'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

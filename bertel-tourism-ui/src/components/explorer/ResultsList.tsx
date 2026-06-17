import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useExplorerStore } from '../../store/explorer-store';
import type { ObjectCard } from '../../types/domain';
import { flyStarToSelection } from '../../utils/fly-to-selection';
import { ResultCardView } from './ResultCardView';

interface ResultsListProps {
  cards: ObjectCard[];
  loading: boolean;
  isRefreshing?: boolean;
  headerActions?: ReactNode;
  variant?: 'panel' | 'column';
}

function toResultCardDomId(cardId: string): string {
  return `result-card-${String(cardId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function ResultsListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`results-skeleton-${index}`}
          className="grid h-[116px] shrink-0 grid-cols-[96px_minmax(0,1fr)_28px] gap-3 rounded-shellMd border border-line bg-surface p-2.5"
        >
          <div className="h-24 w-24 rounded-[10px] bg-surface2 drawer-skeleton" />
          <div className="flex min-w-0 flex-col gap-2 py-0.5">
            <div className="h-4 w-[70%] rounded bg-surface2 drawer-skeleton" />
            <div className="h-3 w-[55%] rounded bg-surface2 drawer-skeleton" />
            <div className="mt-auto flex gap-1">
              <div className="h-5 w-20 rounded-[5px] bg-surface2 drawer-skeleton" />
              <div className="h-5 w-14 rounded-[5px] bg-surface2 drawer-skeleton" />
            </div>
          </div>
          <div className="flex w-7 flex-col items-start justify-start py-0.5">
            <div className="h-6 w-6 rounded-[8px] bg-surface2 drawer-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsList({ cards, loading, isRefreshing = false, headerActions, variant = 'column' }: ResultsListProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const toggleLabel = useExplorerStore((state) => state.toggleLabel);
  const toggleTag = useExplorerStore((state) => state.toggleTag);
  const toggleSelectedObject = useExplorerStore((state) => state.toggleSelectedObject);
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectedCardId = useExplorerStore((state) => state.selectedCardId);
  const visibleCards = hasMounted ? cards : [];
  const showLoading = loading || !hasMounted;

  const orderedCards = useMemo(() => {
    if (selectedObjectIds.length === 0) {
      return visibleCards;
    }
    const cardsById = new Map(visibleCards.map((card) => [card.id, card] as const));
    const selectedCards = selectedObjectIds.flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [card] : [];
    });
    const selectedSet = new Set(selectedCards.map((card) => card.id));
    return [...selectedCards, ...visibleCards.filter((card) => !selectedSet.has(card.id))];
  }, [selectedObjectIds, visibleCards]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedCardId) return;
    const el = document.getElementById(toResultCardDomId(selectedCardId));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedCardId]);

  if (variant === 'panel') {
    return (
      <section className="results-panel">
        <div className="panel-heading">
          <div className="results-panel__title-row">
            <span className="eyebrow">Resultats</span>
            <span className="results-count">{visibleCards.length} fiches</span>
            {isRefreshing ? <span className="results-refreshing">Mise a jour...</span> : null}
          </div>
          {headerActions ? <div className="results-panel__meta">{headerActions}</div> : null}
        </div>
        {showLoading ? <ResultsListSkeleton /> : null}
        <p className="p-4 text-sm text-ink-3">Vue liste classique non utilisee.</p>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line bg-surface px-4">
        <div className="flex min-w-0 items-baseline gap-2 font-display text-[13px] font-bold tracking-tight text-ink">
          <span className="truncate">Resultats</span>
          <span className="truncate font-sans text-xs font-medium text-ink-3">{visibleCards.length} fiches</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerActions}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[9px] border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink-3 hover:bg-surface2"
            disabled
            title="Tri : bientot disponible"
          >
            Trier · Pertinence
          </button>
        </div>
      </div>

      {showLoading ? <ResultsListSkeleton /> : null}

      {!showLoading && !isRefreshing && visibleCards.length === 0 ? (
        <div className="m-3 rounded-shellMd border border-dashed border-line bg-surface2 p-4 text-sm text-ink-3">
          <strong className="text-ink">Aucun resultat pour ces filtres</strong>
          <p className="mt-1">Essayez d elargir la recherche ou de relacher les contraintes sur la carte.</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {orderedCards.map((card) => {
          const isSelected = selectedObjectIds.includes(card.id) || selectedCardId === card.id;
          const inSelection = selectedObjectIds.includes(card.id);
          return (
            <ResultCardView
              key={card.id}
              card={card}
              domId={toResultCardDomId(card.id)}
              isSelected={isSelected}
              inSelection={inSelection}
              onOpen={() => openDrawer(card.id)}
              onToggleLabel={toggleLabel}
              onToggleTag={toggleTag}
              onToggleSelect={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!inSelection) {
                  flyStarToSelection(event.currentTarget);
                }
                toggleSelectedObject(card.id);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

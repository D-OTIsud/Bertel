import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { MapPin, ShoppingBag, Star } from 'lucide-react';
import { buildMarkerDataUri, defaultMarkerStyles } from '../../config/map-markers';
import { useUiStore } from '../../store/ui-store';
import { useExplorerStore } from '../../store/explorer-store';
import type { ObjectCard } from '../../types/domain';
import { normalizeExplorerObjectType } from '../../utils/facets';
import { cn } from '@/lib/utils';

const MAX_TAGS_COLUMN = 2;

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

function getResultCardBadgeIcon(type: string): { label: string; src: string } {
  const normalizedType = normalizeExplorerObjectType(type);
  return {
    label: normalizedType,
    src: buildMarkerDataUri(defaultMarkerStyles[normalizedType]),
  };
}

function ResultsListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`results-skeleton-${index}`}
          className="grid h-[116px] grid-cols-[96px_1fr_auto] gap-3 rounded-shellMd border border-line bg-surface p-2.5"
        >
          <div className="h-24 w-24 rounded-shell bg-surface2 drawer-skeleton" />
          <div className="flex min-w-0 flex-col gap-2 py-0.5">
            <div className="h-4 w-[70%] rounded bg-surface2 drawer-skeleton" />
            <div className="h-3 w-[45%] rounded bg-surface2 drawer-skeleton" />
            <div className="mt-auto flex gap-1">
              <div className="h-5 w-16 rounded-[5px] bg-surface2 drawer-skeleton" />
              <div className="h-5 w-12 rounded-[5px] bg-surface2 drawer-skeleton" />
            </div>
          </div>
          <div className="flex w-7 flex-col items-center justify-between py-0.5">
            <div className="h-7 w-7 rounded-[8px] bg-surface2 drawer-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsList({ cards, loading, isRefreshing = false, headerActions, variant = 'column' }: ResultsListProps) {
  const openDrawer = useUiStore((state) => state.openDrawer);
  const toggleLabel = useExplorerStore((state) => state.toggleLabel);
  const toggleSelectedObject = useExplorerStore((state) => state.toggleSelectedObject);
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectedCardId = useExplorerStore((state) => state.selectedCardId);

  const orderedCards = useMemo(() => {
    if (selectedObjectIds.length === 0) {
      return cards;
    }
    const cardsById = new Map(cards.map((card) => [card.id, card] as const));
    const selectedCards = selectedObjectIds.flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [card] : [];
    });
    const selectedSet = new Set(selectedCards.map((card) => card.id));
    return [...selectedCards, ...cards.filter((card) => !selectedSet.has(card.id))];
  }, [cards, selectedObjectIds]);

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
            <span className="results-count">{cards.length} fiches</span>
            {isRefreshing ? <span className="results-refreshing">Mise a jour...</span> : null}
          </div>
          {headerActions ? <div className="results-panel__meta">{headerActions}</div> : null}
        </div>
        {loading ? <ResultsListSkeleton /> : null}
        <p className="p-4 text-sm text-ink-3">Vue liste classique non utilisee.</p>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r border-line bg-[rgba(255,253,248,0.55)]">
      <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line bg-[rgba(255,253,248,0.5)] px-4">
        <div className="flex min-w-0 items-baseline gap-2 font-display text-[13px] font-bold tracking-tight text-ink">
          <span className="truncate">Resultats</span>
          <span className="truncate font-sans text-xs font-medium text-ink-3">
            {cards.length} fiches · {selectedObjectIds.length} selectionnees
          </span>
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

      {loading ? <ResultsListSkeleton /> : null}

      {!loading && !isRefreshing && cards.length === 0 ? (
        <div className="m-3 rounded-shellMd border border-dashed border-line bg-surface2/60 p-4 text-sm text-ink-3">
          <strong className="text-ink">Aucun resultat pour ces filtres</strong>
          <p className="mt-1">Essayez d elargir la recherche ou de relacher les contraintes sur la carte.</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {orderedCards.map((card) => {
          const badge = getResultCardBadgeIcon(card.type);
          const typeLabel = normalizeExplorerObjectType(card.type);
          const city = card.location?.city ?? '—';
          const labels = Array.isArray(card.labels) ? card.labels : [];
          const tags = labels.slice(0, MAX_TAGS_COLUMN);
          const extraCount = Math.max(0, labels.length - MAX_TAGS_COLUMN);
          const isSelected = selectedObjectIds.includes(card.id) || selectedCardId === card.id;
          const isOpen = Boolean(card.open_now);

          return (
            <div
              key={card.id}
              id={toResultCardDomId(card.id)}
              role="button"
              tabIndex={0}
              onClick={() => openDrawer(card.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openDrawer(card.id);
                }
              }}
              className={cn(
                'grid h-[116px] cursor-pointer grid-cols-[96px_1fr_auto] items-stretch gap-3 rounded-shellMd border border-line bg-surface p-2.5 text-left shadow-s transition hover:-translate-y-px hover:border-lineStrong hover:shadow-m',
                isSelected && 'border-teal shadow-[0_0_0_3px_rgba(23,107,106,0.14),var(--shadow-s)]',
              )}
            >
              <div
                className="relative h-24 w-24 flex-none rounded-shell bg-surface2 bg-cover bg-center"
                style={
                  card.image
                    ? {
                        backgroundImage: `linear-gradient(180deg, rgba(24,49,59,0.06), rgba(24,49,59,0.14)), url(${card.image})`,
                      }
                    : undefined
                }
              >
                <span
                  className="absolute left-1.5 top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-surface shadow-s"
                  aria-hidden
                >
                  <img src={badge.src} alt="" className="h-3.5 w-3.5 object-contain" />
                </span>
              </div>

              <div className="flex min-w-0 flex-col gap-1 overflow-hidden py-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      isOpen ? 'bg-brand-green shadow-[0_0_0_3px_rgba(44,163,111,0.16)]' : 'bg-brand-red shadow-[0_0_0_3px_rgba(200,92,72,0.14)]',
                    )}
                    title={isOpen ? 'Ouvert' : 'Fermeture'}
                  />
                  <h3 className="m-0 truncate font-display text-sm font-semibold leading-tight tracking-tight text-ink">
                    {card.name}
                  </h3>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0 text-ink-4" aria-hidden />
                    {city}
                  </span>
                  <span className="text-ink-4">·</span>
                  <span className="shrink-0">{typeLabel}</span>
                </div>
                <div className="mt-auto flex min-w-0 flex-nowrap items-center gap-1">
                  {tags.map((label) => (
                    <button
                      key={label}
                      type="button"
                      title={label}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleLabel(label);
                      }}
                      className="inline-flex h-5 max-w-[9rem] shrink items-center truncate rounded-[5px] bg-teal-soft px-1.5 text-[11px] font-semibold tracking-wide text-teal-2"
                    >
                      {label}
                    </button>
                  ))}
                  {extraCount > 0 ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-line px-1.5 text-[11px] font-semibold text-ink-3">
                      +{extraCount}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col items-center justify-between gap-1.5 py-0.5">
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-[8px] text-ink-4 hover:bg-orange-soft hover:text-orange"
                  aria-label="Favori (bientot disponible)"
                  title="Favori"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-[8px] border border-line text-ink-3 hover:border-teal hover:text-teal',
                    selectedObjectIds.includes(card.id) && 'border-teal bg-teal-tint text-teal',
                  )}
                  aria-label={selectedObjectIds.includes(card.id) ? 'Retirer de la selection' : 'Ajouter a la selection'}
                  aria-pressed={selectedObjectIds.includes(card.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSelectedObject(card.id);
                  }}
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

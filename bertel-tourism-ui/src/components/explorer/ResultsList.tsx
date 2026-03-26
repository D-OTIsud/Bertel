import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { ShoppingBag } from 'lucide-react';
import { StatusPill } from '../common/StatusPill';
import { buildMarkerDataUri, defaultMarkerStyles } from '../../config/map-markers';
import { useUiStore } from '../../store/ui-store';
import { useExplorerStore } from '../../store/explorer-store';
import type { ObjectCard } from '../../types/domain';
import { normalizeExplorerObjectType } from '../../utils/facets';
import { cn } from '@/lib/utils';

interface ResultsListProps {
  cards: ObjectCard[];
  loading: boolean;
  headerActions?: ReactNode;
}

function hashLabel(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function toResultCardDomId(cardId: string): string {
  // HTML ids cannot contain every possible backend character; normalize to a safe subset.
  return `result-card-${String(cardId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function getResultCardBadgeIcon(type: string): { label: string; src: string } {
  const normalizedType = normalizeExplorerObjectType(type);
  return {
    label: normalizedType,
    src: buildMarkerDataUri(defaultMarkerStyles[normalizedType]),
  };
}

export function ResultsList({ cards, loading, headerActions }: ResultsListProps) {
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

  return (
    <section className="results-panel">
      <div className="panel-heading">
        <div className="results-panel__title-row">
          <span className="eyebrow">Resultats</span>
          <span className="results-count">{cards.length} fiches</span>
        </div>
        {headerActions ? <div className="results-panel__meta">{headerActions}</div> : null}
      </div>

      {loading && <div className="panel-card panel-card--nested">Chargement des cartes...</div>}

      {!loading && cards.length === 0 ? (
        <div className="panel-card panel-card--nested empty-state">
          <strong>Aucun resultat pour ces filtres</strong>
          <p>Essayez d elargir la recherche ou de relacher les contraintes sur la carte.</p>
        </div>
      ) : null}

      <div className="results-list">
        {orderedCards.map((card) => {
          const badge = getResultCardBadgeIcon(card.type);

          return (
            <div
              key={card.id}
              id={toResultCardDomId(card.id)}
              className={cn(
                'result-card',
                selectedObjectIds.includes(card.id) && 'result-card--selected',
                selectedCardId === card.id && 'result-card--selected',
              )}
              role="button"
              tabIndex={0}
              onClick={() => openDrawer(card.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openDrawer(card.id);
                }
              }}
            >
              <div
                className="result-card__media"
                style={{ backgroundImage: `linear-gradient(180deg, rgba(24, 49, 59, 0.04), rgba(24, 49, 59, 0.18)), url(${card.image ?? ''})` }}
              >
                <span className="result-card__badge" role="img" aria-label={`Type ${badge.label}`}>
                  <img className="result-card__badge-icon" src={badge.src} alt="" aria-hidden="true" />
                </span>
              </div>
              <div className="result-card__body">
                <div className="result-card__title-row">
                  <div className="result-card__title-copy">
                    <h3>{card.name}</h3>
                    <span className="result-type">{card.location?.city ?? 'Territoire non renseigne'}</span>
                  </div>
                  <button
                    type="button"
                    className={cn('result-card__select-btn', selectedObjectIds.includes(card.id) && 'result-card__select-btn--active')}
                    aria-label={selectedObjectIds.includes(card.id) ? 'Retirer de la selection' : 'Ajouter a la selection'}
                    aria-pressed={selectedObjectIds.includes(card.id)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleSelectedObject(card.id);
                    }}
                  >
                    <ShoppingBag className="h-4 w-4" />
                  </button>
                  {(() => {
                    const labels = Array.isArray(card.labels) ? card.labels : [];
                    const hasLabels = labels.length > 0;
                    const visibleCount = Math.min(labels.length, 3);
                    const showOverflow = labels.length > 3;
                    const stackRows = Math.max(1, visibleCount + (showOverflow ? 1 : 0));

                    return (
                      <span className="label-stack" aria-label={hasLabels ? `Labels: ${labels.join(', ')}` : 'Aucun label'}>
                        <span className="label-stack__deck" style={{ ['--label-stack-rows' as never]: stackRows }}>
                          {labels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              className="label-stack__badge result-card__label-badge"
                              data-tone={String(hashLabel(label) % 6)}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleLabel(label);
                              }}
                            >
                              {label}
                            </span>
                          ))}
                          {showOverflow ? (
                            <span
                              className="label-stack__badge label-stack__badge--overflow result-card__label-badge"
                              data-tone="overflow"
                            >
                              +{labels.length - 3}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    );
                  })()}
                </div>
                <div className="result-card__footer">
                  <strong className="result-card__location">{card.location?.address ?? 'Adresse a completer'}</strong>
                  <StatusPill tone={card.open_now ? 'green' : 'neutral'}>{card.open_now ? 'Ouvert' : 'Fermeture'}</StatusPill>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

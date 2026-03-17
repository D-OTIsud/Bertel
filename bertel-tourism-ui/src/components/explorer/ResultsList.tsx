import { useEffect, useRef, type ReactNode } from 'react';
import { StatusPill } from '../common/StatusPill';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';

interface ResultsListProps {
  cards: ObjectCard[];
  loading: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  headerActions?: ReactNode;
}

export function ResultsList({ cards, loading, hasNextPage, fetchNextPage, isFetchingNextPage, headerActions }: ResultsListProps) {
  const openDrawer = useUiStore((state) => state.openDrawer);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: '180px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <section className="results-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Resultats</span>
        </div>
        <div className="results-panel__meta">
          {headerActions}
          <span className="results-count">{cards.length} fiches</span>
        </div>
      </div>

      {loading && <div className="panel-card panel-card--nested">Chargement des cartes...</div>}

      {!loading && cards.length === 0 ? (
        <div className="panel-card panel-card--nested empty-state">
          <strong>Aucun resultat pour ces filtres</strong>
          <p>Essayez d elargir la recherche ou de relacher les contraintes sur la carte.</p>
        </div>
      ) : null}

      <div className="results-list">
        {cards.map((card) => (
          <button key={card.id} type="button" className="result-card" onClick={() => openDrawer(card.id)}>
            <div
              className="result-card__media"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(24, 49, 59, 0.04), rgba(24, 49, 59, 0.18)), url(${card.image ?? ''})` }}
            >
              <span className="result-card__badge">{card.type}</span>
            </div>
            <div className="result-card__body">
              <div className="result-card__title-row">
                <div>
                  <h3>{card.name}</h3>
                  <span className="result-type">{card.location?.city ?? 'Territoire non renseigne'}</span>
                </div>
                {Array.isArray(card.labels) && card.labels.length > 0 ? (
                  <span className="result-card__label-badge">{card.labels[0]}</span>
                ) : null}
              </div>
              <div className="result-card__footer">
                <strong className="result-card__location">{card.location?.address ?? 'Adresse a completer'}</strong>
                <StatusPill tone={card.open_now ? 'green' : 'neutral'}>{card.open_now ? 'Ouvert' : 'Fermeture'}</StatusPill>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div ref={sentinelRef} className="list-sentinel" />
      {isFetchingNextPage && <div className="panel-card panel-card--nested">Chargement de la page suivante...</div>}
    </section>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard, PresenceMember } from '../../types/domain';
import { formatObjectPrice, formatObjectRating } from '../../utils/format';
import { AvatarStack } from '../common/AvatarStack';

interface ResultsListProps {
  cards: ObjectCard[];
  loading: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  peers: PresenceMember[];
}

export function ResultsList({ cards, loading, hasNextPage, fetchNextPage, isFetchingNextPage, peers }: ResultsListProps) {
  const openDrawer = useUiStore((state) => state.openDrawer);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) {
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
  }, [fetchNextPage, hasNextPage]);

  const liveCardIds = useMemo(() => new Set(cards.slice(0, peers.length).map((card) => card.id)), [cards, peers.length]);

  return (
    <section className="results-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Panneau 2</span>
          <h2>Liste des resultats</h2>
        </div>
        <span className="results-count">{cards.length} fiches chargees</span>
      </div>

      {loading && <div className="panel-card">Chargement des cartes...</div>}

      <div className="results-list">
        {cards.map((card) => (
          <button key={card.id} type="button" className="result-card" onClick={() => openDrawer(card.id)}>
            <div className="result-card__media" style={{ backgroundImage: `url(${card.image ?? ''})` }} />
            <div className="result-card__body">
              <div className="result-card__title-row">
                <div>
                  <span className="result-type">{card.type}</span>
                  <h3>{card.name}</h3>
                </div>
                {liveCardIds.has(card.id) && peers.length > 0 ? <AvatarStack people={peers.slice(0, 1)} /> : null}
              </div>
              <p>{card.description}</p>
              <div className="result-meta-grid">
                <span>{card.location?.city ?? 'Sans ville'}</span>
                <span>{formatObjectRating(card)}</span>
                <span>{formatObjectPrice(card)}</span>
                <span className={card.open_now ? 'open-pill open-pill--open' : 'open-pill'}>
                  {card.open_now ? 'Ouvert' : 'Fermeture'}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div ref={sentinelRef} className="list-sentinel" />
      {isFetchingNextPage && <div className="panel-card">Chargement de la page suivante...</div>}
    </section>
  );
}
import { useEffect, useMemo, useRef } from 'react';
import { StatusPill } from '../common/StatusPill';
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
          <span className="eyebrow">Shortlist</span>
          <h2>Liste des resultats</h2>
          <p>Conservez une lecture dense des fiches sans perdre les signaux importants.</p>
        </div>
        <div className="results-panel__meta">
          <span className="results-count">{cards.length} fiches</span>
          {peers.length > 0 ? <AvatarStack people={peers.slice(0, 3)} /> : null}
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
                  <span className="result-type">{card.location?.city ?? 'Territoire non renseigne'}</span>
                  <h3>{card.name}</h3>
                </div>
                {liveCardIds.has(card.id) ? <AvatarStack people={peers.slice(0, 2)} /> : null}
              </div>
              <p className="result-card__excerpt">{card.description}</p>
              <div className="result-meta-grid">
                <span>{formatObjectRating(card)}</span>
                <span>{formatObjectPrice(card)}</span>
                <span>{card.review_count ? `${card.review_count} avis` : 'Sans volume avis'}</span>
                <span>{card.render?.updated_at ?? 'Mise a jour recente'}</span>
              </div>
              <div className="result-card__footer">
                <div className="result-card__footer-copy">
                  <strong>{card.location?.address ?? 'Adresse a completer'}</strong>
                  <span>Ouvrir la fiche detaillee</span>
                </div>
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

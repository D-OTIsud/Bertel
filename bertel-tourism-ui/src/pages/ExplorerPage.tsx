import { Suspense, lazy } from 'react';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ResultsList } from '../components/explorer/ResultsList';
import { useExplorerInfiniteQuery, useMapObjectsQuery } from '../hooks/useExplorerQueries';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { useUiStore } from '../store/ui-store';

const MapPanel = lazy(async () => ({ default: (await import('../components/explorer/MapPanel')).MapPanel }));

function MapFallback() {
  return (
    <section className="panel-card panel-card--map">
      <div className="panel-heading panel-heading--overlay">
        <div>
          <span className="eyebrow">Atlas</span>
          <h2>Chargement de la carte</h2>
          <p>Preparation du fond cartographique et des marqueurs...</p>
        </div>
      </div>
    </section>
  );
}

export function ExplorerPage() {
  const mobileSheetOpen = useUiStore((state) => state.mobileSheetOpen);
  const setMobileSheetOpen = useUiStore((state) => state.setMobileSheetOpen);
  const pageQuery = useExplorerInfiniteQuery();
  const mapQuery = useMapObjectsQuery();
  const { peers } = usePresenceRoom('room:explorer', { syncGlobalStatus: true });

  const cards = pageQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const openNowCount = cards.filter((card) => card.open_now).length;

  if (pageQuery.isError) {
    return <section className="panel-card panel-card--wide">{(pageQuery.error as Error).message}</section>;
  }

  if (mapQuery.isError) {
    return <section className="panel-card panel-card--wide">{(mapQuery.error as Error).message}</section>;
  }

  return (
    <section className="page-grid explorer-page">
      <article className="hero-panel explorer-hero">
        <div className="explorer-hero__copy">
          <span className="eyebrow">Explorer</span>
          <h2>Carte, resultats et filtres dans un seul poste de travail</h2>
          <p>Conservez une lecture rapide du territoire tout en gardant la collaboration et le detail de chaque fiche a portee de clic.</p>
        </div>
        <div className="explorer-hero__stats">
          <article className="stat-card stat-card--compact stat-card--highlight">
            <span>Fiches chargees</span>
            <strong>{cards.length}</strong>
          </article>
          <article className="stat-card stat-card--compact">
            <span>Ouvertes maintenant</span>
            <strong>{openNowCount}</strong>
          </article>
          <article className="stat-card stat-card--compact">
            <span>Editeurs presents</span>
            <strong>{peers.length}</strong>
          </article>
        </div>
      </article>

      <section className="explorer-layout desktop-explorer-layout">
        <FiltersPanel />
        <ResultsList
          cards={cards}
          loading={pageQuery.isLoading}
          hasNextPage={Boolean(pageQuery.hasNextPage)}
          fetchNextPage={() => void pageQuery.fetchNextPage()}
          isFetchingNextPage={pageQuery.isFetchingNextPage}
          peers={peers}
        />
        <Suspense fallback={<MapFallback />}>
          <MapPanel objects={mapQuery.data ?? []} />
        </Suspense>
      </section>

      <section className="explorer-layout mobile-explorer-layout">
        <Suspense fallback={<MapFallback />}>
          <MapPanel objects={mapQuery.data ?? []} />
        </Suspense>
        <button type="button" className="fab-button" onClick={() => setMobileSheetOpen(!mobileSheetOpen)}>
          {mobileSheetOpen ? 'Fermer la liste' : 'Liste & filtres'}
        </button>
        {mobileSheetOpen && (
          <div className="mobile-sheet">
            <FiltersPanel compact />
            <ResultsList
              cards={cards}
              loading={pageQuery.isLoading}
              hasNextPage={Boolean(pageQuery.hasNextPage)}
              fetchNextPage={() => void pageQuery.fetchNextPage()}
              isFetchingNextPage={pageQuery.isFetchingNextPage}
              peers={peers}
            />
          </div>
        )}
      </section>
    </section>
  );
}

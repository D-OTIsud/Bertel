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
          <span className="eyebrow">Carte</span>
          <h2>Chargement de la carte</h2>
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

  if (pageQuery.isError) {
    return <section className="panel-card panel-card--wide">{(pageQuery.error as Error).message}</section>;
  }

  if (mapQuery.isError) {
    return <section className="panel-card panel-card--wide">{(mapQuery.error as Error).message}</section>;
  }

  return (
    <>
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
    </>
  );
}

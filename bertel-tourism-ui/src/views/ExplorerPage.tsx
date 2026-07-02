"use client";

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ResultsList } from '../components/explorer/ResultsList';
import { ResultsTableView } from '../components/explorer/ResultsTableView';
import { ExplorerViewSwitch } from '../components/explorer/ExplorerViewSwitch';
import { SelectionBar } from '../components/explorer/SelectionBar';
import { useExplorerCardsQuery, useExplorerMarkersQuery, useExplorerReferencesQuery } from '../hooks/useExplorerQueries';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useExplorerStore } from '../store/explorer-store';
import { useExplorerViewStore, type ExplorerViewMode } from '../store/explorer-view-store';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { EmptyState } from '../components/common/EmptyState';
import { ExplorerActiveFilters } from '../components/explorer/ExplorerActiveFilters';
import { buildExplorerErrorBanner } from './explorer-error';
import { cn } from '@/lib/utils';

const MapPanel = lazy(async () => ({ default: (await import('../components/explorer/MapPanel')).MapPanel }));

// D16 : colonnes de grille par mode (littéraux complets — requis par le JIT Tailwind).
const GRID_BY_MODE: Record<ExplorerViewMode, string> = {
  split: 'grid-cols-[296px_minmax(320px,0.8fr)_minmax(420px,1.4fr)]',
  liste: 'grid-cols-[296px_minmax(0,1fr)]',
  table: 'grid-cols-[296px_minmax(0,1fr)]',
  carte: 'grid-cols-[296px_minmax(0,1fr)]',
};

function MapFallback() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-line bg-surface">
      <div className="flex h-14 flex-none items-center border-b border-line bg-surface px-4">
        <span className="font-display text-[13px] font-bold tracking-tight text-ink">Carte</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-3">Chargement de la carte...</div>
    </div>
  );
}

const COMPACT_EXPLORER_BREAKPOINT = '(max-width: 1180px)';
type ExplorerPanelKey = 'filters' | 'results' | 'map';

const panelLabels: Record<ExplorerPanelKey, string> = {
  filters: 'Filtres',
  results: 'Liste',
  map: 'Carte',
};

export default function ExplorerPage() {
  const isCompactExplorer = useMediaQuery(COMPACT_EXPLORER_BREAKPOINT);
  const [activeMobilePanel, setActiveMobilePanel] = useState<ExplorerPanelKey>('results');
  // D16 : mode de vue (Liste / Table / Carte / Split) — préférence persistée.
  // Le mobile garde ses onglets (la table est un outil desktop, repli D17 <960px).
  const viewMode = useExplorerViewStore((state) => state.viewMode);
  const setViewMode = useExplorerViewStore((state) => state.setViewMode);
  const cardsQuery = useExplorerCardsQuery();
  const markersQuery = useExplorerMarkersQuery();
  const referencesQuery = useExplorerReferencesQuery();

  const cards = cardsQuery.data ?? [];
  // §125 — the map is fed by its own lightweight markers query (the full matching
  // geolocated set), decoupled from the lazily-paginated card list.
  const markers = useMemo(() => markersQuery.data ?? [], [markersQuery.data]);
  const isInitialLoading = (cardsQuery.isLoading || referencesQuery.isLoading) && cards.length === 0;
  const isRefreshing = cardsQuery.isRefreshing;

  const setVisibleObjectIds = useExplorerStore((state) => state.setVisibleObjectIds);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const selectedCardId = useExplorerStore((state) => state.selectedCardId);
  const clearSelectedCard = useExplorerStore((state) => state.clearSelectedCard);

  // A card selected from the map may not be in the lazily-loaded list yet — fall back to markers.
  const selectedCard = selectedCardId
    ? cards.find((card) => card.id === selectedCardId) ?? markers.find((m) => m.id === selectedCardId) ?? null
    : null;
  const mobileSheetOpen = isCompactExplorer && Boolean(selectedCard);

  // "Visible" = the full matching geolocated set (markers, the map's set), so selection
  // tools ("select all", lasso) cover everything shown — not just the loaded list pages.
  useEffect(() => {
    setVisibleObjectIds(markers.map((m) => m.id));
  }, [markers, setVisibleObjectIds]);

  useEffect(() => {
    return () => {
      clearSelection();
    };
  }, [clearSelection]);

  // Audit S10 : une requête en échec ne remplace PLUS tout l'Explorateur. On
  // affiche un bandeau inline et on conserve la dernière donnée valide (les cards
  // viennent d'un cache local, cf. useExplorerCardsQuery) ; « Réessayer » ne
  // relance que la requête fautive.
  const errorBanner = buildExplorerErrorBanner(cardsQuery.isError || markersQuery.isError, referencesQuery.isError);
  const retryFailedQueries = () => {
    if (cardsQuery.isError) void cardsQuery.refetch();
    if (markersQuery.isError) void markersQuery.refetch();
    if (referencesQuery.isError) void referencesQuery.refetch();
  };

  const renderMobilePanel = (panel: ExplorerPanelKey) => {
    if (panel === 'filters') {
      return <FiltersPanel compact={isCompactExplorer} references={referencesQuery.data} variant="column" />;
    }
    if (panel === 'results') {
      return (
        <ResultsList
          cards={cards}
          loading={isInitialLoading}
          isRefreshing={isRefreshing}
          variant="column"
          hasMore={cardsQuery.hasNextPage}
          isLoadingMore={cardsQuery.isFetchingNextPage}
          onLoadMore={() => void cardsQuery.fetchNextPage()}
        />
      );
    }
    return (
      <Suspense fallback={<MapFallback />}>
        <MapPanel objects={markers} variant="column" />
      </Suspense>
    );
  };

  return (
    <section className="explorer-workspace flex h-full min-h-0 w-full min-w-0 flex-col">
      {errorBanner ? (
        <div className="flex-none px-4 pt-3">
          <EmptyState
            mode="error"
            title={errorBanner.title}
            description={errorBanner.description}
            action={{ label: 'Réessayer', onClick: retryFailedQueries }}
          />
        </div>
      ) : null}
      <ExplorerActiveFilters />
      <Sheet
        open={mobileSheetOpen}
        onOpenChange={(open) => {
          if (!open) clearSelectedCard();
        }}
      >
        <SheetContent side="bottom" showClose={true} className="border-0 bg-transparent p-0 shadow-none">
          {selectedCard ? (
            <div className="panel-card panel-card--nested" style={{ padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {selectedCard.image ? (
                  <img
                    src={selectedCard.image}
                    alt={selectedCard.name}
                    style={{
                      width: 64,
                      height: 80,
                      borderRadius: 16,
                      objectFit: 'cover',
                      flex: 'none',
                    }}
                  />
                ) : null}
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <div className="eyebrow">Fiche</div>
                  <strong style={{ fontSize: 18, lineHeight: 1.2 }}>{selectedCard.name}</strong>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      {isCompactExplorer ? (
        <section className="explorer-layout explorer-layout--mobile grid min-h-0 w-full min-w-0 gap-3">
          <nav className="explorer-mobile-tabs flex flex-wrap gap-2" aria-label="Panneaux mobile explorateur">
            {(['filters', 'results', 'map'] as ExplorerPanelKey[]).map((panel) => (
              <button
                key={panel}
                type="button"
                className={activeMobilePanel === panel ? 'chip chip--active explorer-mobile-tab' : 'chip explorer-mobile-tab'}
                onClick={() => setActiveMobilePanel(panel)}
              >
                {panelLabels[panel]}
              </button>
            ))}
          </nav>
          <div className="explorer-layout__mobile-panel min-h-0 flex-1 overflow-hidden">
            {renderMobilePanel(activeMobilePanel)}
          </div>
        </section>
      ) : (
        <>
          <div className="flex flex-none items-center justify-end border-b border-line bg-surface px-4 py-1.5">
            <ExplorerViewSwitch />
          </div>
          <div
            className={cn(
              'relative grid min-h-0 min-w-0 flex-1 gap-0 overflow-hidden',
              GRID_BY_MODE[viewMode],
            )}
          >
            <FiltersPanel references={referencesQuery.data} variant="column" />
            {viewMode === 'split' || viewMode === 'liste' ? (
              <ResultsList
                cards={cards}
                loading={isInitialLoading}
                isRefreshing={isRefreshing}
                variant="column"
                hasMore={cardsQuery.hasNextPage}
                isLoadingMore={cardsQuery.isFetchingNextPage}
                onLoadMore={() => void cardsQuery.fetchNextPage()}
              />
            ) : null}
            {viewMode === 'table' ? (
              <ResultsTableView
                cards={cards}
                loading={isInitialLoading}
                isRefreshing={isRefreshing}
                hasMore={cardsQuery.hasNextPage}
                isLoadingMore={cardsQuery.isFetchingNextPage}
                onLoadMore={() => void cardsQuery.fetchNextPage()}
              />
            ) : null}
            {viewMode === 'split' || viewMode === 'carte' ? (
              <Suspense fallback={<MapFallback />}>
                <MapPanel
                  objects={markers}
                  variant="column"
                  onCollapse={viewMode === 'split' ? () => setViewMode('liste') : undefined}
                />
              </Suspense>
            ) : null}
            {/* Sans carte, la barre de sélection (portée par MapPanel) doit rester : les
                actions de masse suivent la sélection dans TOUTES les vues. */}
            {viewMode === 'liste' || viewMode === 'table' ? <SelectionBar /> : null}
          </div>
        </>
      )}
    </section>
  );
}

export { ExplorerPage };

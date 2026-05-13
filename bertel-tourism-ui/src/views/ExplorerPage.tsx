"use client";

import { Suspense, lazy, useEffect, useState } from 'react';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ResultsList } from '../components/explorer/ResultsList';
import { SelectionBar } from '../components/explorer/SelectionBar';
import { useExplorerCardsQuery, useExplorerReferencesQuery } from '../hooks/useExplorerQueries';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { useExplorerStore } from '../store/explorer-store';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const MapPanel = lazy(async () => ({ default: (await import('../components/explorer/MapPanel')).MapPanel }));

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
  const cardsQuery = useExplorerCardsQuery();
  const referencesQuery = useExplorerReferencesQuery();
  usePresenceRoom('room:explorer', { syncGlobalStatus: true });

  const cards = cardsQuery.data ?? [];
  const isInitialLoading = (cardsQuery.isLoading || referencesQuery.isLoading) && cards.length === 0;
  const isRefreshing = cardsQuery.isRefreshing;

  const setVisibleObjectIds = useExplorerStore((state) => state.setVisibleObjectIds);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const selectedCardId = useExplorerStore((state) => state.selectedCardId);
  const clearSelectedCard = useExplorerStore((state) => state.clearSelectedCard);

  const selectedCard = selectedCardId ? cards.find((card) => card.id === selectedCardId) : null;
  const mobileSheetOpen = isCompactExplorer && Boolean(selectedCard);

  useEffect(() => {
    setVisibleObjectIds(cards.map((c) => c.id));
  }, [cards, setVisibleObjectIds]);

  useEffect(() => {
    return () => {
      clearSelection();
    };
  }, [clearSelection]);

  if (cardsQuery.isError) {
    return <section className="panel-card panel-card--wide m-4">{(cardsQuery.error as Error).message}</section>;
  }

  if (referencesQuery.isError) {
    return <section className="panel-card panel-card--wide m-4">{(referencesQuery.error as Error).message}</section>;
  }

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
        />
      );
    }
    return (
      <Suspense fallback={<MapFallback />}>
        <MapPanel objects={cards} variant="column" />
      </Suspense>
    );
  };

  return (
    <section className="explorer-workspace flex h-full min-h-0 w-full min-w-0 flex-col">
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
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[296px_minmax(380px,1fr)_minmax(420px,1.2fr)] gap-0 overflow-hidden">
            <FiltersPanel references={referencesQuery.data} variant="column" />
            <ResultsList cards={cards} loading={isInitialLoading} isRefreshing={isRefreshing} variant="column" />
            <Suspense fallback={<MapFallback />}>
              <MapPanel objects={cards} variant="column" />
            </Suspense>
          </div>
          <SelectionBar />
        </div>
      )}
    </section>
  );
}

export { ExplorerPage };

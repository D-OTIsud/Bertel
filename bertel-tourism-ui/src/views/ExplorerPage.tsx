"use client";

import { Suspense, lazy, useEffect, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ResultsList } from '../components/explorer/ResultsList';
import { useExplorerCardsQuery, useExplorerReferencesQuery } from '../hooks/useExplorerQueries';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useExplorerStore } from '../store/explorer-store';
import { Sheet, SheetContent } from '@/components/ui/sheet';

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

const COMPACT_EXPLORER_BREAKPOINT = '(max-width: 1180px)';
type ExplorerPanelKey = 'filters' | 'results' | 'map';

const panelLabels: Record<ExplorerPanelKey, string> = {
  filters: 'Filtres',
  results: 'Liste',
  map: 'Carte',
};

function ExpandPanelButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ghost-button explorer-panel__expand" onClick={onClick} aria-label={`Agrandir le panneau ${label}`}>
      <Maximize2 className="h-4 w-4" />
      <span className="sr-only">Agrandir {label}</span>
    </button>
  );
}

function PanelPlaceholder({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <section className="panel-card explorer-panel-placeholder">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Panneau agrandi</span>
          <h2>{label}</h2>
          <p>Ce panneau est actuellement affiche dans une vue agrandie au-dessus de l espace de travail.</p>
        </div>
        <button type="button" className="ghost-button" onClick={onRestore}>
          Revenir au canevas
        </button>
      </div>
    </section>
  );
}

export default function ExplorerPage() {
  const isCompactExplorer = useMediaQuery(COMPACT_EXPLORER_BREAKPOINT);
  const [activeMobilePanel, setActiveMobilePanel] = useState<ExplorerPanelKey>('results');
  const [expandedPanel, setExpandedPanel] = useState<ExplorerPanelKey | null>(null);
  const cardsQuery = useExplorerCardsQuery();
  const referencesQuery = useExplorerReferencesQuery();
  usePresenceRoom('room:explorer', { syncGlobalStatus: true });

  const cards = cardsQuery.data ?? [];

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
    return <section className="panel-card panel-card--wide">{(cardsQuery.error as Error).message}</section>;
  }

  if (referencesQuery.isError) {
    return <section className="panel-card panel-card--wide">{(referencesQuery.error as Error).message}</section>;
  }

  const renderPanel = (panel: ExplorerPanelKey, mode: 'inline' | 'modal') => {
    const headerActions = mode === 'inline'
      ? <ExpandPanelButton label={panelLabels[panel]} onClick={() => setExpandedPanel(panel)} />
      : null;

    if (panel === 'filters') {
      return <FiltersPanel headerActions={headerActions} compact={isCompactExplorer} references={referencesQuery.data} />;
    }

    if (panel === 'results') {
      return (
        <ResultsList
          cards={cards}
          loading={cardsQuery.isLoading || referencesQuery.isLoading}
          headerActions={headerActions}
        />
      );
    }

    return (
      <Suspense fallback={<MapFallback />}>
        <MapPanel objects={cards} headerActions={headerActions} />
      </Suspense>
    );
  };

  const renderInlinePanel = (panel: ExplorerPanelKey) =>
    expandedPanel === panel
      ? <PanelPlaceholder label={panelLabels[panel]} onRestore={() => setExpandedPanel(null)} />
      : renderPanel(panel, 'inline');

  return (
    <section className="explorer-workspace">
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
        <section className="explorer-layout explorer-layout--mobile">
          <nav className="explorer-mobile-tabs" aria-label="Panneaux mobile explorateur">
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
          <div className="explorer-layout__mobile-panel">
            {renderInlinePanel(activeMobilePanel)}
          </div>
        </section>
      ) : (
        <section className="explorer-layout explorer-layout--desktop">
          <div className="explorer-layout__panel explorer-layout__panel--filters">{renderInlinePanel('filters')}</div>
          <div className="explorer-layout__panel explorer-layout__panel--results">{renderInlinePanel('results')}</div>
          <div className="explorer-layout__panel explorer-layout__panel--map">{renderInlinePanel('map')}</div>
        </section>
      )}

      <Dialog open={expandedPanel !== null} onOpenChange={(open) => { if (!open) setExpandedPanel(null); }}>
        <DialogContent className="explorer-panel-dialog w-[min(1400px,calc(100vw-32px))] max-w-[min(1400px,calc(100vw-32px))] border-0 bg-transparent p-0 shadow-none" showClose>
          <DialogTitle className="sr-only">{expandedPanel ? panelLabels[expandedPanel] : 'Panneau explorateur'}</DialogTitle>
          <DialogDescription className="sr-only">
            Vue agrandie d un panneau de l explorateur sans dupliquer les donnees ou la carte.
          </DialogDescription>
          {expandedPanel ? renderPanel(expandedPanel, 'modal') : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export { ExplorerPage };

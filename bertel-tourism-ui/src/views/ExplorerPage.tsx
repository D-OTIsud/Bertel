"use client";

import { Suspense, lazy, useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ResultsList } from '../components/explorer/ResultsList';
import { useExplorerInfiniteQuery, useMapObjectsQuery } from '../hooks/useExplorerQueries';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

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

const MOBILE_BREAKPOINT = '(max-width: 768px)';
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
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const [activeMobilePanel, setActiveMobilePanel] = useState<ExplorerPanelKey>('results');
  const [expandedPanel, setExpandedPanel] = useState<ExplorerPanelKey | null>(null);
  const pageQuery = useExplorerInfiniteQuery();
  const mapQuery = useMapObjectsQuery();
  const { peers } = usePresenceRoom('room:explorer', { syncGlobalStatus: true });

  const cards = useMemo(
    () => pageQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [pageQuery.data],
  );
  const openNowCount = useMemo(() => cards.filter((card) => card.open_now).length, [cards]);

  if (pageQuery.isError) {
    return <section className="panel-card panel-card--wide">{(pageQuery.error as Error).message}</section>;
  }

  if (mapQuery.isError) {
    return <section className="panel-card panel-card--wide">{(mapQuery.error as Error).message}</section>;
  }

  const renderPanel = (panel: ExplorerPanelKey, mode: 'inline' | 'modal') => {
    const headerActions = mode === 'inline'
      ? <ExpandPanelButton label={panelLabels[panel]} onClick={() => setExpandedPanel(panel)} />
      : null;

    if (panel === 'filters') {
      return <FiltersPanel headerActions={headerActions} compact={isMobile} />;
    }

    if (panel === 'results') {
      return (
        <ResultsList
          cards={cards}
          loading={pageQuery.isLoading}
          hasNextPage={Boolean(pageQuery.hasNextPage)}
          fetchNextPage={pageQuery.fetchNextPage}
          isFetchingNextPage={pageQuery.isFetchingNextPage}
          peers={peers}
          headerActions={headerActions}
        />
      );
    }

    return (
      <Suspense fallback={<MapFallback />}>
        <MapPanel objects={mapQuery.data ?? []} headerActions={headerActions} />
      </Suspense>
    );
  };

  const renderInlinePanel = (panel: ExplorerPanelKey) =>
    expandedPanel === panel
      ? <PanelPlaceholder label={panelLabels[panel]} onRestore={() => setExpandedPanel(null)} />
      : renderPanel(panel, 'inline');

  return (
    <section className="explorer-workspace">
      <div className="explorer-workspace__summary">
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

      {isMobile ? (
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

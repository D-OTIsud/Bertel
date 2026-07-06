import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useExplorerStore } from '../../store/explorer-store';
import type { ObjectCard } from '../../types/domain';
import { flyStarToSelection } from '../../utils/fly-to-selection';
import { buildResultSections, buildGradeSections } from '../../utils/explorer-result-sections';
import { EmptyState } from '../common/EmptyState';
import { ResultCardView } from './ResultCardView';
import { cn } from '@/lib/utils';

interface ResultsListProps {
  cards: ObjectCard[];
  loading: boolean;
  isRefreshing?: boolean;
  headerActions?: ReactNode;
  variant?: 'panel' | 'column';
  /** Lazy pagination (§125): load the next server page when the user nears the bottom. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  labelRankCounts?: { labelled: number; equivalent: number };
  /**
   * Vrai total du corpus (COUNT serveur, avant pagination) affiché comme « N fiches ». Découplé
   * de `cards` (chargées paresseusement au scroll) : le header doit annoncer le total réel, pas
   * le nombre de lignes chargées. Absent (undefined) ⇒ repli sur le nombre de cartes chargées.
   */
  totalCount?: number;
  /**
   * §174 — quand un scheme de classement gradué est actif (≥2 valeurs résolues côté
   * ExplorerPage), les sections deviennent des niveaux de classement (buildGradeSections)
   * au lieu des sections §173 labellisés/équivalents. Mutuellement exclusif avec le
   * regroupement §173 : quand présent, il remplace entièrement `labelRankCounts`.
   */
  gradeSection?: { schemeCode: string; values: { code: string; name: string }[] } | null;
}

function toResultCardDomId(cardId: string): string {
  return `result-card-${String(cardId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** D25 : offset de scroll conservé par onglet (sessionStorage) — « ne plus perdre sa place ». */
const SCROLL_STORAGE_KEY = 'bertel-explorer-scroll';

function ResultsListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`results-skeleton-${index}`}
          className="grid h-[116px] shrink-0 grid-cols-[96px_minmax(0,1fr)_28px] gap-3 rounded-shellMd border border-line bg-surface p-2.5"
        >
          <div className="h-24 w-24 rounded-[10px] bg-surface2 drawer-skeleton" />
          <div className="flex min-w-0 flex-col gap-2 py-0.5">
            <div className="h-4 w-[70%] rounded bg-surface2 drawer-skeleton" />
            <div className="h-3 w-[55%] rounded bg-surface2 drawer-skeleton" />
            <div className="mt-auto flex gap-1">
              <div className="h-5 w-20 rounded-[5px] bg-surface2 drawer-skeleton" />
              <div className="h-5 w-14 rounded-[5px] bg-surface2 drawer-skeleton" />
            </div>
          </div>
          <div className="flex w-7 flex-col items-start justify-start py-0.5">
            <div className="h-6 w-6 rounded-[8px] bg-surface2 drawer-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsList({
  cards,
  loading,
  isRefreshing = false,
  headerActions,
  variant = 'column',
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  labelRankCounts,
  totalCount,
  gradeSection,
}: ResultsListProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const toggleLabel = useExplorerStore((state) => state.toggleLabel);
  const toggleTag = useExplorerStore((state) => state.toggleTag);
  const toggleSelectedObject = useExplorerStore((state) => state.toggleSelectedObject);
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectedCardId = useExplorerStore((state) => state.selectedCardId);
  const hoveredCardId = useExplorerStore((state) => state.hoveredCardId);
  const setHoveredCard = useExplorerStore((state) => state.setHoveredCard);
  const resetAllFilters = useExplorerStore((state) => state.resetAll);
  const visibleCards = hasMounted ? cards : [];
  const showLoading = loading || !hasMounted;
  // « N fiches » = total réel du corpus quand il est connu (page 0), sinon le nombre de cartes
  // chargées. `?? ` (et non `||`) pour qu'un corpus légitimement vide affiche « 0 fiches ».
  const resultCount = totalCount ?? visibleCards.length;

  const orderedCards = useMemo(() => {
    if (selectedObjectIds.length === 0) {
      return visibleCards;
    }
    const cardsById = new Map(visibleCards.map((card) => [card.id, card] as const));
    const selectedCards = selectedObjectIds.flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [card] : [];
    });
    const selectedSet = new Set(selectedCards.map((card) => card.id));
    return [...selectedCards, ...visibleCards.filter((card) => !selectedSet.has(card.id))];
  }, [selectedObjectIds, visibleCards]);

  // §labelsect Task 10 : sections « labellisés / actions compatibles » quand le filtre
  // label rank est actif ET les deux groupes sont non-vides (cf. buildResultSections).
  // Une section forte et un float de sélection sont contradictoires — le float est
  // suspendu tant que la vue est groupée (voir orderedCards ci-dessus, non consommé ici).
  // §174 — quand un scheme classé est actif (gradeSection, résolu par ExplorerPage),
  // les sections deviennent des niveaux de classement à la place des sections §173 ;
  // les deux modes sont mutuellement exclusifs (jamais combinés).
  const sections = useMemo(
    () =>
      gradeSection
        ? buildGradeSections(visibleCards, gradeSection.schemeCode, gradeSection.values)
        : buildResultSections(visibleCards, labelRankCounts),
    [gradeSection, visibleCards, labelRankCounts],
  );

  // §174 — état de repli des sections, local à la vue (pas store/URL) : purement une
  // préférence d'affichage temporaire. Les sections §173 partagent le même rendu
  // d'en-tête et deviennent donc repliables elles aussi (cohérent, pas de régression).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedCardId) return;
    const el = document.getElementById(toResultCardDomId(selectedCardId));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedCardId]);

  // D25 — restauration du scroll : une seule fois, quand la liste a du contenu
  // (revenir de l'éditeur ou d'un autre module ne perd plus la position).
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current || showLoading || visibleCards.length === 0) return;
    scrollRestoredRef.current = true;
    const saved = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY) ?? '');
    if (Number.isFinite(saved) && saved > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = saved;
    }
  }, [showLoading, visibleCards.length]);

  // D25 — sauvegarde au fil du scroll (throttle par frame, listener passif).
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sessionStorage.setItem(SCROLL_STORAGE_KEY, String(node.scrollTop));
        ticking = false;
      });
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, []);

  // §125 — infinite scroll: fetch the next server page when the bottom sentinel nears the
  // viewport (rootMargin prefetches before the user hits the end). Re-armed whenever the
  // page state changes so a freshly-loaded page that leaves the sentinel in view keeps loading.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore || !onLoadMore) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { root, rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore, cards.length]);

  const renderCard = (card: ObjectCard) => {
    const isSelected = selectedObjectIds.includes(card.id) || selectedCardId === card.id;
    const inSelection = selectedObjectIds.includes(card.id);
    return (
      <ResultCardView
        key={card.id}
        card={card}
        domId={toResultCardDomId(card.id)}
        isSelected={isSelected}
        isHovered={hoveredCardId === card.id}
        inSelection={inSelection}
        onOpen={() => openDrawer(card.id)}
        onHoverChange={(hovered) => setHoveredCard(hovered ? card.id : null)}
        onToggleLabel={toggleLabel}
        onToggleTag={toggleTag}
        onToggleSelect={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!inSelection) {
            flyStarToSelection(event.currentTarget);
          }
          toggleSelectedObject(card.id);
        }}
      />
    );
  };

  if (variant === 'panel') {
    return (
      <section className="results-panel">
        <div className="panel-heading">
          <div className="results-panel__title-row">
            <span className="eyebrow">Résultats</span>
            <span className="results-count">{resultCount} fiches</span>
            {isRefreshing ? <span className="results-refreshing">Mise à jour…</span> : null}
          </div>
          {headerActions ? <div className="results-panel__meta">{headerActions}</div> : null}
        </div>
        {showLoading ? <ResultsListSkeleton /> : null}
        <p className="p-4 text-sm text-ink-3">Vue liste classique non utilisee.</p>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line bg-surface px-4">
        <div className="flex min-w-0 items-baseline gap-2 font-display text-[13px] font-bold tracking-tight text-ink">
          <span className="truncate">Résultats</span>
          <span className="truncate font-sans text-xs font-medium text-ink-3">{resultCount} fiches</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
        </div>
      </div>

      {showLoading ? <ResultsListSkeleton /> : null}

      {!showLoading && !isRefreshing && visibleCards.length === 0 ? (
        /* D29 : l'EmptyState « filtered » existant (icône + CTA) remplace le bloc nu —
           « Réinitialiser les filtres » remet l'Explorer à zéro en un clic. */
        <div className="p-3">
          <EmptyState
            mode="filtered"
            title="Aucun résultat pour ces filtres"
            description="Essayez d'élargir la recherche ou de relâcher les contraintes (carte, statuts, équipements)."
            action={{ label: 'Réinitialiser les filtres', onClick: () => resetAllFilters() }}
          />
        </div>
      ) : null}

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {sections.grouped
          ? sections.groups.map((grp) => (
              <div key={grp.group} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(grp.group)}
                  className="sticky top-0 z-[1] -mx-3 flex items-center justify-between gap-2 border-b border-line bg-surface2/95 px-3 py-1.5 backdrop-blur"
                >
                  <span className="flex items-center gap-1.5">
                    <ChevronDown className={cn('h-4 w-4 transition', collapsed.has(grp.group) && '-rotate-90')} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{grp.label}</span>
                  </span>
                  <span className="rounded-[6px] bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-4">{grp.count}</span>
                </button>
                {!collapsed.has(grp.group) && grp.cards.map(renderCard)}
              </div>
            ))
          : orderedCards.map(renderCard)}
        {hasMore ? (
          <div ref={sentinelRef} className="flex h-10 flex-none items-center justify-center" aria-hidden="true">
            {isLoadingMore ? <span className="text-xs text-ink-3">Chargement…</span> : null}
          </div>
        ) : null}
        {/* D8 : la sentinelle IntersectionObserver est souris/molette-only — repli clavier
            (et lecteur d'écran) : un bouton sr-only qui devient visible au focus. */}
        {hasMore && !isLoadingMore && onLoadMore ? (
          <button
            type="button"
            className="ghost-button sr-only text-xs focus:not-sr-only focus:static"
            onClick={() => onLoadMore()}
          >
            Charger plus de résultats
          </button>
        ) : null}
      </div>
    </div>
  );
}

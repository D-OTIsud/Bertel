'use client';

import { useEffect, useMemo, useState, Fragment, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useExplorerStore } from '../../store/explorer-store';
import { useCrmSearchStore } from '../../store/crm-search-store';
import { useUiStore } from '../../store/ui-store';
import { Input } from '@/components/ui/input';
import { LivePresenceIndicator } from './LivePresenceIndicator';
import { CreateObjectButton } from '../../features/object-editor/create/CreateObjectButton';
import { ExplorerSearchSuggestions, shouldShowSuggestions } from './ExplorerSearchSuggestions';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import type { NameMatch } from '../../services/name-search';

const SUGGESTIONS_LISTBOX_ID = 'explorer-search-suggestions';

function pageLabelFromPath(pathname: string | null): string {
  if (!pathname || pathname === '/') return 'Accueil';
  const seg = pathname.replace(/^\//, '').split('/')[0] ?? '';
  const map: Record<string, string> = {
    explorer: 'Explorer',
    dashboard: 'Dashboard',
    crm: 'CRM',
    moderation: 'Moderation',
    audits: 'Audits',
    publications: 'Publications',
    settings: 'Paramètres',
    login: 'Connexion',
  };
  return map[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}

// Le champ du header change de CIBLE selon la page (PO 2026-07-27) : sur /crm il pilotait
// l'Explorer, donc il n'y servait à rien. Il y devient la recherche ACTEURS de l'annuaire.
// Deux états distincts, jamais fusionnés : la recherche Explorer est conservée au retour sur
// l'Explorer, la recherche CRM ne doit pas l'écraser (et réciproquement).
const CRM_SEARCH_PLACEHOLDER = 'Rechercher un acteur : nom, prénom, établissement, téléphone, e-mail…';
const EXPLORER_SEARCH_PLACEHOLDER = 'Rechercher : nom, ville, équipement, plat, label...';

function isCrmPath(pathname: string | null): boolean {
  return pathname === '/crm' || Boolean(pathname?.startsWith('/crm/'));
}

export function TopBar() {
  const pathname = usePathname();
  const pageLabel = pageLabelFromPath(pathname);
  const isCrm = isCrmPath(pathname);
  const explorerSearch = useExplorerStore((state) => state.common.search);
  const setExplorerSearch = useExplorerStore((state) => state.setSearch);
  const crmSearch = useCrmSearchStore((state) => state.search);
  const setCrmSearch = useCrmSearchStore((state) => state.setSearch);
  const search = isCrm ? crmSearch : explorerSearch;
  const setSearch = isCrm ? setCrmSearch : setExplorerSearch;
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const drawerDirty = useObjectDrawerStore((state) =>
    drawerObjectId ? Boolean(state.dirtyObjects[drawerObjectId]) : false,
  );

  // ---------------------------------------------------------------------------
  // Concordances directes (spec 2026-08-26) — EXPLOREUR SEULEMENT. Le CRM garde sa
  // recherche serveur d'acteurs (§195) : `isCrm` coupe tout ce bloc.
  //
  // La liste vit dans ExplorerSearchSuggestions, mais le CLAVIER vit ici : c'est
  // l'`<Input>` qui porte le focus, et un menu ne doit jamais le lui voler.
  // ---------------------------------------------------------------------------
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const suggestionTerm = isCrm ? '' : search;
  // Même hook, même clé de requête que le composant : TanStack sert les deux depuis
  // le cache, il n'y a donc pas de second aller-retour.
  const { data: suggestions } = useNameMatchQuery(suggestionsOpen ? suggestionTerm : '');
  const suggestionsVisible = !isCrm && shouldShowSuggestions(suggestionsOpen, suggestionTerm, suggestions.length);

  // Remise à zéro de l'index QUAND LE TERME CHANGE, faite PENDANT LE RENDU et non
  // dans un `useEffect` (doctrine §213) : deux effets du même commit liraient tous
  // deux l'état d'AVANT, et une flèche pressée juste après une frappe viserait la
  // ligne de la saisie précédente. L'ajustement d'état re-rend immédiatement.
  const [prevSuggestionTerm, setPrevSuggestionTerm] = useState(suggestionTerm);
  if (prevSuggestionTerm !== suggestionTerm) {
    setPrevSuggestionTerm(suggestionTerm);
    setSuggestionIndex(-1);
  }

  const closeSuggestions = () => {
    setSuggestionsOpen(false);
    setSuggestionIndex(-1);
  };

  const pickSuggestion = (match: NameMatch) => {
    // Ouvre la fiche SANS toucher aux filtres : c'est de la navigation. L'URL
    // `?fiche=` suit toute seule (mécanique D25) — rien à écrire ici.
    openDrawer(match.id);
    closeSuggestions();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestionsVisible) {
      // Échap ferme le menu même quand il vient de disparaître ; les autres touches
      // suivent leur cours normal (la recherche complète reste pilotée par le store).
      if (event.key === 'Escape') {
        closeSuggestions();
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setSuggestionIndex((prev) => (prev + delta + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      const picked = suggestionIndex >= 0 ? suggestions[suggestionIndex] : undefined;
      if (picked) {
        // Une ligne est sélectionnée : Entrée y va. Sinon on ne fait RIEN de
        // spécial — la recherche complète continue, le store porte déjà le terme.
        event.preventDefault();
        pickSuggestion(picked);
      } else {
        closeSuggestions();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSuggestions();
    }
  };

  const [now, setNow] = useState(() => new Date());
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(now),
    [now],
  );
  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(now),
    [now],
  );
  const safeTimeLabel = isMounted ? timeLabel : '--:--';
  const safeDateLabel = isMounted ? dateLabel : '--';

  return (
    <Fragment>
      {drawerObjectId ? (
        <div className="flex flex-none items-center justify-between gap-3 border-b border-line bg-[rgba(255,253,248,0.88)] px-5 py-2 backdrop-blur-xl">
          <span className="truncate text-xs font-semibold text-ink-3">
            {drawerDirty ? 'Modifications locales non enregistrees' : 'Fiche ouverte'}
          </span>
          <button
            type="button"
            onClick={() => closeDrawer()}
            className="shrink-0 rounded-shell border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface2"
          >
            Fermer la fiche
          </button>
        </div>
      ) : null}

      <header className="relative z-40 grid h-14 flex-none grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line bg-[rgba(255,253,248,0.72)] px-5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-tight">
          {/* D12 : ouvre le tiroir de navigation mobile (le rail est masqué < 768px). */}
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-3 hover:bg-surface2 hover:text-ink md:hidden"
            aria-label="Ouvrir la navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-ink">{pageLabel}</span>
        </div>

        <label className="relative flex h-10 w-full max-w-[860px] items-center gap-2 justify-self-center rounded-shellMd border border-line bg-bgTint px-3.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={closeSuggestions}
            onKeyDown={handleSearchKeyDown}
            placeholder={isCrm ? CRM_SEARCH_PLACEHOLDER : EXPLORER_SEARCH_PLACEHOLDER}
            aria-label={isCrm ? 'Rechercher un acteur' : 'Rechercher une fiche'}
            role={isCrm ? undefined : 'combobox'}
            aria-expanded={isCrm ? undefined : suggestionsVisible}
            aria-controls={isCrm ? undefined : SUGGESTIONS_LISTBOX_ID}
            aria-activedescendant={
              suggestionsVisible && suggestionIndex >= 0
                ? `${SUGGESTIONS_LISTBOX_ID}-${suggestionIndex}`
                : undefined
            }
            className="h-auto border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {/* D24 : le raccourci affiché n'est plus décoratif — il ouvre la palette. */}
          <button
            type="button"
            className="hidden shrink-0 rounded-[6px] border border-line bg-surface px-1.5 py-px font-sans text-[11px] text-ink-3 hover:bg-surface2 hover:text-ink sm:inline-block"
            aria-label="Ouvrir la palette de commandes (Ctrl+K)"
            title="Palette de commandes (Ctrl+K)"
            onClick={() => setCommandPaletteOpen(true)}
          >
            ⌘K
          </button>
          {isCrm ? null : (
            <ExplorerSearchSuggestions
              query={suggestionTerm}
              open={suggestionsOpen}
              activeIndex={suggestionIndex}
              onPick={pickSuggestion}
              listboxId={SUGGESTIONS_LISTBOX_ID}
            />
          )}
        </label>

        <div className="flex items-center gap-2">
          <CreateObjectButton />
          <LivePresenceIndicator />
          <button
            type="button"
            className="hidden h-7 shrink-0 items-center rounded-[8px] border border-line bg-surface px-2.5 text-[12px] font-semibold text-ink hover:bg-surface2 sm:inline-flex"
            suppressHydrationWarning
          >
            {safeDateLabel} · {safeTimeLabel}
          </button>
        </div>
      </header>
    </Fragment>
  );
}

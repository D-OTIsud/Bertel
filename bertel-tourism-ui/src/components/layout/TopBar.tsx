'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import { Input } from '@/components/ui/input';
import { StatusPill } from '../common/StatusPill';

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
    settings: 'Parametres',
    login: 'Connexion',
  };
  return map[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function TopBar() {
  const pathname = usePathname();
  const pageLabel = pageLabelFromPath(pathname);
  const search = useExplorerStore((state) => state.common.search);
  const setSearch = useExplorerStore((state) => state.setSearch);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const drawerDirty = useObjectDrawerStore((state) =>
    drawerObjectId ? Boolean(state.dirtyObjects[drawerObjectId]) : false,
  );
  const networkTone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';

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

      <header className="grid h-14 flex-none grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line bg-[rgba(255,253,248,0.72)] px-5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-tight">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-[9px] text-ink-3 hover:bg-surface2 hover:text-ink md:hidden"
            aria-label="Menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="hidden font-medium text-ink-4 sm:inline">Tourism</span>
          <span className="hidden text-ink-4 sm:inline">/</span>
          <span className="text-ink">{pageLabel}</span>
        </div>

        <label className="mx-auto flex h-9 max-w-[520px] flex-1 items-center gap-2 justify-self-center rounded-shellMd border border-line bg-bgTint px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une fiche, une ville ou une action..."
            className="h-auto border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <kbd className="hidden shrink-0 rounded-[6px] border border-line bg-surface px-1.5 py-px font-sans text-[11px] text-ink-3 sm:inline-block">
            ⌘K
          </kbd>
        </label>

        <div className="flex items-center gap-2">
          {networkStatus !== 'connected' ? (
            <StatusPill tone={networkTone}>{networkStatus}</StatusPill>
          ) : null}
          <StatusPill tone={networkTone}>
            {liveUsersCount} live
          </StatusPill>
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

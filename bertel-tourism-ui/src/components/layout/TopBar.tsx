'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, Menu, Search } from 'lucide-react';
import { useSessionStore } from '../../store/session-store';
import { useExplorerStore } from '../../store/explorer-store';
import { useThemeStore } from '../../store/theme-store';
import { Input } from '@/components/ui/input';

function initialsFromName(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'BT';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

interface TopBarProps {
  onOpenMenu: () => void;
  onOpenProfile: () => void;
}

export function TopBar({ onOpenMenu, onOpenProfile }: TopBarProps) {
  const userName = useSessionStore((state) => state.userName);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const search = useExplorerStore((state) => state.common.search);
  const setSearch = useExplorerStore((state) => state.setSearch);
  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
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
    <header className="topbar-shell">
      <div className="topbar-zone topbar-zone--menu">
        <button type="button" className="topbar-icon-button" aria-label="Ouvrir le menu principal" onClick={onOpenMenu}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="topbar-zone topbar-zone--brand">
        <Link href="/explorer" className="topbar-brand" aria-label="Retour a l explorateur">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="topbar-brand__logo" />
          ) : (
            <span className="topbar-brand__mark">{brandName.slice(0, 1)}</span>
          )}
          <div className="topbar-brand__copy">
            <strong>{brandName}</strong>
            <span>Explorer</span>
          </div>
        </Link>
      </div>

      <div className="topbar-zone topbar-zone--search">
        <label className="topbar-search" aria-label="Recherche globale">
          <Search className="h-4 w-4" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une fiche, une ville ou une action..."
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </label>
      </div>

      <div className="topbar-zone topbar-zone--clock">
        <div className="topbar-clock">
          <Clock3 className="h-4 w-4" />
          <div>
            <strong suppressHydrationWarning>{safeTimeLabel}</strong>
            <span suppressHydrationWarning>{safeDateLabel}</span>
          </div>
        </div>
      </div>

      <div className="topbar-zone topbar-zone--profile">
        <button type="button" className="topbar-user-button" aria-label="Ouvrir le profil et les parametres" onClick={onOpenProfile}>
          <span className="topbar-user__avatar">{initials}</span>
          <span className="sr-only">
            Profil de {userLabel}
          </span>
        </button>
      </div>
    </header>
  );
}

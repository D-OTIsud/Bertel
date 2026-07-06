'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, Settings2 } from 'lucide-react';
import { NAV_ITEMS, visibleNavItems } from '../../config/nav-items';
import { listPendingChanges } from '../../services/rpc';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { cn } from '@/lib/utils';

function isActivePath(pathname: string | null, target: string): boolean {
  if (!pathname) {
    return false;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

function initialsFromName(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'BT';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

interface SidebarProps {
  onOpenProfile: () => void;
}

export function Sidebar({ onOpenProfile }: SidebarProps) {
  const pathname = usePathname();
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const userName = useSessionStore((state) => state.userName);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const items = visibleNavItems(role, demoMode);
  const navItems = items.filter((item) => item.to !== '/settings' && item.to !== '/aide');

  // §120 — badge de modération : compte des suggestions en attente que l'appelant peut
  // modérer. Même clé de cache que ModerationPage (invalidée par approve/reject) ⇒ le badge
  // se met à jour après chaque action. Le RPC est auto-autorisé : un non-modérateur reçoit []
  // (badge invisible). Requête désactivée si l'entrée Modération n'est pas visible pour le rôle.
  const isModerationVisible = navItems.some((item) => item.to === '/moderation');
  const pendingModerationQuery = useQuery({
    queryKey: ['pending-changes', 'pending'],
    queryFn: () => listPendingChanges('pending'),
    enabled: isModerationVisible,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const pendingModerationCount = pendingModerationQuery.data?.length ?? 0;

  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
  const settingsLabel = NAV_ITEMS.find((item) => item.to === '/settings')?.label ?? 'Paramètres';

  return (
    <aside className="app-sidebar" aria-label="Navigation principale">
      <div className="app-sidebar__panel">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__logo">
            {logoUrl ? <img src={logoUrl} alt={brandName} /> : brandName.slice(0, 1)}
          </span>
          <span className="app-sidebar__label app-sidebar__brand-name">{brandName}</span>
        </div>

        <nav className="app-sidebar__nav" aria-label="Modules">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn('app-sidebar__item', active && 'app-sidebar__item--active')}
              >
                <span className="app-sidebar__iconbox">
                  <Icon className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
                  {item.to === '/moderation' && pendingModerationCount > 0 && (
                    <span
                      className="app-sidebar__badge"
                      aria-label={`${pendingModerationCount} suggestion${pendingModerationCount > 1 ? 's' : ''} en attente de modération`}
                    >
                      {pendingModerationCount > 99 ? '99+' : pendingModerationCount}
                    </span>
                  )}
                </span>
                <span className="app-sidebar__label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar__divider" />

        <Link
          href="/settings"
          title="Paramètres"
          aria-current={isActivePath(pathname, '/settings') ? 'page' : undefined}
          className={cn('app-sidebar__item', isActivePath(pathname, '/settings') && 'app-sidebar__item--active')}
        >
          <span className="app-sidebar__iconbox">
            <Settings2 className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
          </span>
          <span className="app-sidebar__label">{settingsLabel}</span>
        </Link>

        <div className="app-sidebar__footer">
          <Link
            href="/aide"
            title="Aide"
            aria-current={isActivePath(pathname, '/aide') ? 'page' : undefined}
            className={cn('app-sidebar__item', isActivePath(pathname, '/aide') && 'app-sidebar__item--active')}
          >
            <span className="app-sidebar__iconbox">
              <CircleHelp className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="app-sidebar__label">Aide</span>
          </Link>
          {/* D26 : la cloche « Notifications » (aucun handler, pastille factice) est retirée —
              elle reviendra avec la table notification (D27, backend, remonté session API). */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="app-sidebar__profile"
            aria-label={`Profil ${userLabel}`}
            title={userLabel}
          >
            <span className="app-sidebar__avatarbox">
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
                ? <img className="app-sidebar__avatar app-sidebar__avatar--photo" src={avatarUrl} alt="" />
                : <span className="app-sidebar__avatar">{initials}</span>}
            </span>
            <span className="app-sidebar__label app-sidebar__profile-name">{userLabel}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  CircleHelp,
  ClipboardList,
  Files,
  LayoutDashboard,
  MapPinned,
  Settings2,
  ShieldCheck,
  UserX,
  Users,
  UsersRound,
} from 'lucide-react';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import type { UserRole } from '../../types/domain';
import { isDemoOnlyModule } from '../../utils/features';
import { cn } from '@/lib/utils';
import { canAdministerTeam } from '@/store/session-selectors';

const allItems: Array<{
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
  icon: typeof MapPinned;
}> = [
  { to: '/explorer', label: 'Explorer', caption: 'Carte, filtres et fiches', roles: ['super_admin', 'tourism_agent'], icon: MapPinned },
  { to: '/dashboard', label: 'Dashboard', caption: 'Vue globale du reseau', roles: ['owner', 'super_admin', 'tourism_agent'], icon: LayoutDashboard },
  { to: '/crm', label: 'CRM', caption: 'Interactions et suivis', roles: ['super_admin', 'tourism_agent'], icon: Users },
  { to: '/moderation', label: 'Moderation', caption: 'Validation editoriale', roles: ['super_admin', 'tourism_agent'], icon: ShieldCheck },
  { to: '/audits', label: 'Audits', caption: 'Terrain et incidents', roles: ['super_admin', 'tourism_agent'], icon: ClipboardList },
  { to: '/publications', label: 'Publications', caption: 'Exports et mises en page', roles: ['super_admin', 'tourism_agent'], icon: Files },
  { to: '/team', label: 'Équipe', caption: 'Membres et permissions', roles: ['owner', 'super_admin', 'tourism_agent'], icon: UsersRound },
  { to: '/rgpd', label: 'RGPD', caption: 'Effacement & droits des personnes', roles: ['owner', 'super_admin'], icon: UserX },
  { to: '/settings', label: 'Settings', caption: 'Branding et environnement', roles: ['owner', 'super_admin', 'tourism_agent'], icon: Settings2 },
];

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
  const adminRank = useSessionStore((state) => state.adminRank);
  const demoMode = useSessionStore((state) => state.demoMode);
  const userName = useSessionStore((state) => state.userName);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const items = role
    ? allItems.filter((item) => item.roles.includes(role) && (demoMode || !isDemoOnlyModule(item.to)))
    : [];
  const teamVisible = canAdministerTeam({ role, adminRank });
  const navItems = items
    .filter((item) => item.to !== '/settings')
    .filter((item) => item.to !== '/team' || teamVisible);
  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
  const settingsLabel = allItems.find((item) => item.to === '/settings')?.label ?? 'Parametres';

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
                </span>
                <span className="app-sidebar__label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar__divider" />

        <Link
          href="/settings"
          title="Parametres"
          aria-current={isActivePath(pathname, '/settings') ? 'page' : undefined}
          className={cn('app-sidebar__item', isActivePath(pathname, '/settings') && 'app-sidebar__item--active')}
        >
          <span className="app-sidebar__iconbox">
            <Settings2 className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
          </span>
          <span className="app-sidebar__label">{settingsLabel}</span>
        </Link>

        <div className="app-sidebar__footer">
          <button type="button" className="app-sidebar__item" aria-label="Aide" title="Aide">
            <span className="app-sidebar__iconbox">
              <CircleHelp className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="app-sidebar__label">Aide</span>
          </button>
          <button type="button" className="app-sidebar__item" aria-label="Notifications" title="Notifications">
            <span className="app-sidebar__iconbox">
              <Bell className="app-sidebar__icon" strokeWidth={1.8} aria-hidden />
              <span className="app-sidebar__dot" aria-hidden />
            </span>
            <span className="app-sidebar__label">Notifications</span>
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            className="app-sidebar__profile"
            aria-label={`Profil ${userLabel}`}
            title={userLabel}
          >
            <span className="app-sidebar__avatarbox">
              <span className="app-sidebar__avatar">{initials}</span>
            </span>
            <span className="app-sidebar__label app-sidebar__profile-name">{userLabel}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

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
  Users,
} from 'lucide-react';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import type { UserRole } from '../../types/domain';
import { isDemoOnlyModule } from '../../utils/features';
import { cn } from '@/lib/utils';

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
  const demoMode = useSessionStore((state) => state.demoMode);
  const userName = useSessionStore((state) => state.userName);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const items = role
    ? allItems.filter((item) => item.roles.includes(role) && (demoMode || !isDemoOnlyModule(item.to)))
    : [];
  const navItems = items.filter((item) => item.to !== '/settings');
  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);

  return (
    <aside
      className="flex flex-col items-center gap-1 border-r border-line bg-[rgba(255,253,248,0.72)] px-0 py-3.5 backdrop-blur-xl"
      style={{ width: 'var(--sidebar-w)' }}
      aria-label="Navigation principale"
    >
      <div className="mb-3.5 grid h-[38px] w-[38px] place-items-center overflow-hidden rounded-[11px] bg-surface2">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="font-display text-sm font-bold text-teal">{brandName.slice(0, 1)}</span>
        )}
      </div>

      <nav className="flex flex-col items-center gap-1" aria-label="Modules">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.to);
          return (
            <Link
              key={item.to}
              href={item.to}
              title={item.label}
              className={cn(
                'grid h-10 w-10 place-items-center rounded-[11px] text-ink-3 transition-colors hover:bg-surface2 hover:text-ink',
                active && 'bg-teal text-white hover:bg-teal hover:text-white',
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </Link>
          );
        })}
      </nav>

      <div className="my-2 h-px w-6 bg-line" />

      <Link
        href="/settings"
        title="Parametres"
        className={cn(
          'grid h-10 w-10 place-items-center rounded-[11px] text-ink-3 transition-colors hover:bg-surface2 hover:text-ink',
          isActivePath(pathname, '/settings') && 'bg-teal text-white hover:bg-teal hover:text-white',
        )}
      >
        <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </Link>

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          title="Aide"
          className="grid h-10 w-10 place-items-center rounded-[11px] text-ink-3 transition-colors hover:bg-surface2 hover:text-ink"
          aria-label="Aide"
        >
          <CircleHelp className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          title="Notifications"
          className="relative grid h-10 w-10 place-items-center rounded-[11px] text-ink-3 transition-colors hover:bg-surface2 hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="mt-1 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-orange to-orange-2 font-display text-[13px] font-bold text-white shadow-s"
          aria-label={`Profil ${userLabel}`}
          title={userLabel}
        >
          {initials}
        </button>
      </div>
    </aside>
  );
}

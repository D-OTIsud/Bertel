import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  Files,
  LayoutDashboard,
  MapPinned,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { StatusPill } from '../common/StatusPill';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { useUiStore } from '../../store/ui-store';
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

export function Sidebar() {
  const pathname = usePathname();
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  const items = role
    ? allItems.filter((item) => item.roles.includes(role) && (demoMode || !isDemoOnlyModule(item.to)))
    : [];

  return (
    <aside className="sidebar-shell">
      <div className="sidebar-brand">
        <span className="sidebar-kicker">Bertel command center</span>
        <div className="sidebar-brand__identity">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="sidebar-brand__logo" />
          ) : (
            <div className="sidebar-brand__logo sidebar-brand__logo--fallback">{brandName.slice(0, 1)}</div>
          )}
          <div>
            <h1>{brandName}</h1>
            <p>Tourism operations with a calmer, clearer cockpit.</p>
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <span className="sidebar-section__label">Navigation</span>
        <nav className="sidebar-nav">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.to);
            return (
              <Link key={item.to} href={item.to} className={cn('sidebar-link', active && 'sidebar-link--active')}>
                <span className="sidebar-link__icon" aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="sidebar-link__copy">
                  <strong>{item.label}</strong>
                  <small>{item.caption}</small>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-meta">
        <div className="sidebar-meta__row">
          <div>
            <span>Mode</span>
            <strong>{demoMode ? 'Demo' : 'Live'}</strong>
          </div>
          <StatusPill tone={networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red'}>
            {networkStatus}
          </StatusPill>
        </div>
        <div className="sidebar-meta__row sidebar-meta__row--tight">
          <div>
            <span>Role</span>
            <strong>{role ?? 'guest'}</strong>
          </div>
          <div>
            <span>Live users</span>
            <strong>{liveUsersCount}</strong>
          </div>
        </div>
      </div>
    </aside>
  );
}

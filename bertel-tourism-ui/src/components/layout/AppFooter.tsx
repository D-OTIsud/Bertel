'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Compass, Users } from 'lucide-react';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useUiStore } from '../../store/ui-store';
import { StatusPill } from '../common/StatusPill';
import { cn } from '@/lib/utils';

const footerLinks = [
  { href: '/explorer', label: 'Accueil', icon: Compass },
  { href: '/dashboard', label: 'Stats', icon: BarChart3 },
  { href: '/crm', label: 'CRM', icon: Users },
];

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppFooter() {
  const pathname = usePathname();
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  const footerActionMode = useUiStore((state) => state.footerActionMode);
  const drawerDirty = useObjectDrawerStore((state) =>
    drawerObjectId ? Boolean(state.draftsByObject[drawerObjectId]?.dirty) : false,
  );
  const networkTone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';

  return (
    <div className="app-footer" role="contentinfo">
      <nav className="app-footer__nav" aria-label="Raccourcis principaux">
        {footerLinks.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);

          return (
            <Link key={item.href} href={item.href} className={cn('app-footer__link', active && 'app-footer__link--active')}>
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-footer__context">
        {footerActionMode === 'drawer' && drawerObjectId ? (
          <>
            <span className="app-footer__chip">{drawerDirty ? 'Modification locale' : 'Fiche ouverte'}</span>
            <button type="button" className="ghost-button app-footer__action" onClick={closeDrawer}>
              Fermer la fiche
            </button>
          </>
        ) : footerActionMode === 'explorer' ? (
          <>
            <span className="app-footer__chip">Explorer actif</span>
            <strong className="app-footer__label">Carte, liste et filtres synchronises</strong>
          </>
        ) : (
          <>
            <span className="app-footer__chip">Shell</span>
            <strong className="app-footer__label">{pathname?.replace('/', '') || 'Accueil'}</strong>
          </>
        )}
      </div>

      <div className="app-footer__status">
        <StatusPill tone={networkTone}>{networkStatus}</StatusPill>
        <StatusPill tone="neutral">{liveUsersCount} live</StatusPill>
      </div>
    </div>
  );
}

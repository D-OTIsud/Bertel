'use client';

import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useUiStore } from '../../store/ui-store';
import { AppFooter } from './AppFooter';
import { ProfileDrawer } from './ProfileDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const setFooterActionMode = useUiStore((state) => state.setFooterActionMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const nextMode = drawerObjectId ? 'drawer' : pathname?.startsWith('/explorer') ? 'explorer' : 'default';
    setFooterActionMode(nextMode);
  }, [drawerObjectId, pathname, setFooterActionMode]);

  return (
    <div className="app-shell">
      <TopBar onOpenMenu={() => setMenuOpen(true)} onOpenProfile={() => setProfileOpen(true)} />
      <div className="app-shell__viewport">
        <main className="workspace">{children}</main>
      </div>
      <AppFooter />
      <Sidebar open={menuOpen} onOpenChange={setMenuOpen} />
      <ProfileDrawer open={profileOpen} onOpenChange={setProfileOpen} />
      <Suspense fallback={null}>
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

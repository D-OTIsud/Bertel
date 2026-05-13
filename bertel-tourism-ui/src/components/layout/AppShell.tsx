'use client';

import { Suspense, lazy, useState, type ReactNode } from 'react';
import { useUiStore } from '../../store/ui-store';
import { ProfileDrawer } from './ProfileDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell({ children }: { children: ReactNode }) {
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar onOpenProfile={() => setProfileOpen(true)} />
      <div className="app-shell__viewport">
        <TopBar />
        <main className="workspace">{children}</main>
      </div>
      <ProfileDrawer open={profileOpen} onOpenChange={setProfileOpen} />
      <Suspense fallback={null}>
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

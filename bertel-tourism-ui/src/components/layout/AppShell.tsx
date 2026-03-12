import { Suspense, lazy } from 'react';
import { Outlet } from 'react-router-dom';
import { useUiStore } from '../../store/ui-store';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell() {
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar />
        <main className="workspace">
          <Outlet />
        </main>
      </div>
      <Suspense fallback={null}>
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

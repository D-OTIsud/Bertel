import { Suspense, lazy, type ReactNode } from 'react';
import { useUiStore } from '../../store/ui-store';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell({ children }: { children: ReactNode }) {
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="workspace-shell">
        <TopBar />
        <main className="workspace">{children}</main>
      </div>
      <Suspense fallback={null}>
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

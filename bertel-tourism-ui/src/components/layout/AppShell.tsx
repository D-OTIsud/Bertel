import { Suspense, lazy, type ReactNode } from 'react';
import { useUiStore } from '../../store/ui-store';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell({ children }: { children: ReactNode }) {
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);

  return (
    <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)]">
      <Sidebar />
      <div className="min-w-0">
        <TopBar />
        <main className="p-5">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

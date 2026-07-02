'use client';

import { Suspense, lazy, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useUiStore } from '../../store/ui-store';
import { CommandPalette } from './CommandPalette';
import { ProfileDrawer } from './ProfileDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const [profileOpen, setProfileOpen] = useState(false);
  const isObjectEdit =
    pathname != null && /^\/objects\/[^/]+\/edit\/?$/.test(pathname);

  return (
    <div className="app-shell">
      {/* D11 : premier élément tabbable — évite de traverser toute la sidebar à chaque page. */}
      <a href="#main-content" className="skip-link">
        Aller au contenu principal
      </a>
      <Sidebar onOpenProfile={() => setProfileOpen(true)} />
      <div className={`app-shell__viewport${isObjectEdit ? ' app-shell__viewport--object-edit' : ''}`}>
        {!isObjectEdit ? <TopBar /> : null}
        <main
          id="main-content"
          tabIndex={-1}
          className={`workspace${isObjectEdit ? ' workspace--object-edit' : ''}`}
        >
          {children}
        </main>
      </div>
      <ProfileDrawer open={profileOpen} onOpenChange={setProfileOpen} />
      {/* D24 : palette ⌘K globale (écouteur clavier + modale + dialogs associés). */}
      <CommandPalette />
      <Suspense fallback={null}>
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

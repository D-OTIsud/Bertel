'use client';

import { Suspense, lazy, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useUiStore } from '../../store/ui-store';
import { useNotificationInbox } from '../../hooks/useNotificationInbox';
import { CommandPalette } from './CommandPalette';
import { MobileNavDrawer } from './MobileNavDrawer';
import { NotificationDrawer } from './NotificationDrawer';
import { ProfileDrawer } from './ProfileDrawer';
import { RouteMotion } from './RouteMotion';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const ObjectDrawer = lazy(async () => ({ default: (await import('../editor/ObjectDrawer')).ObjectDrawer }));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const [profileOpen, setProfileOpen] = useState(false);
  // 16w — l'état du tiroir de notifications vit ici, à côté de `profileOpen` : la coquille
  // possède ses tiroirs, la sidebar ne fait que demander l'ouverture.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // La veille (pastille + toast d'arrivée) tourne au niveau de la coquille, indépendamment
  // de l'ouverture du tiroir : une notification doit se signaler tiroir fermé.
  const { unreadCount } = useNotificationInbox();
  const isObjectEdit =
    pathname != null && /^\/objects\/[^/]+\/edit\/?$/.test(pathname);

  return (
    <div className="app-shell">
      {/* D11 : premier élément tabbable — évite de traverser toute la sidebar à chaque page. */}
      <a href="#main-content" className="skip-link">
        Aller au contenu principal
      </a>
      <Sidebar
        onOpenProfile={() => setProfileOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        unreadNotifications={unreadCount}
      />
      <div className={`app-shell__viewport${isObjectEdit ? ' app-shell__viewport--object-edit' : ''}`}>
        {!isObjectEdit ? <TopBar /> : null}
        <main
          id="main-content"
          tabIndex={-1}
          className={`workspace${isObjectEdit ? ' workspace--object-edit' : ''}`}
        >
          <RouteMotion>{children}</RouteMotion>
        </main>
      </div>
      <ProfileDrawer open={profileOpen} onOpenChange={setProfileOpen} />
      {/* 16w — boîte de réception (la cloche factice retirée en D26 revient avec son backend). */}
      <NotificationDrawer open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      {/* D24 : palette ⌘K globale (écouteur clavier + modale + dialogs associés). */}
      <CommandPalette />
      {/* D12 : tiroir de navigation mobile (rail masqué < 768px). */}
      <MobileNavDrawer />
      <Suspense
        fallback={
          drawerObjectId ? (
            <div className="drawer-panel-fallback" role="status" aria-busy="true" aria-label="Chargement de la fiche" />
          ) : null
        }
      >
        <ObjectDrawer objectId={drawerObjectId} />
      </Suspense>
    </div>
  );
}

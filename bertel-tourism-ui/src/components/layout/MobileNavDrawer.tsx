'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, UserRound } from 'lucide-react';
import { visibleNavItems } from '../../config/nav-items';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { Modal } from '../common/Modal';
import { cn } from '@/lib/utils';

interface MobileNavDrawerProps {
  /** UX-01 — mêmes callbacks que la Sidebar : la coquille possède les tiroirs, ici on ne fait que les demander. */
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  unreadNotifications: number;
}

/**
 * D12 — navigation mobile : le rail latéral est masqué < 768px (il mangeait
 * 64px de viewport) ; le bouton Menu de la TopBar ouvre ce tiroir, bâti sur le
 * Modal maison variant=drawer (D1 : trap focus, scroll-lock, Échap).
 */
export function MobileNavDrawer({ onOpenProfile, onOpenNotifications, unreadNotifications }: MobileNavDrawerProps) {
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const pathname = usePathname();

  const items = visibleNavItems(role, demoMode, canEditObjects);

  // UX-01 — le tiroir de navigation doit se fermer avant qu'un autre tiroir s'ouvre :
  // deux tiroirs superposés (D1, trap focus) se marcheraient dessus.
  const openNotifications = () => {
    setOpen(false);
    onOpenNotifications();
  };
  const openProfile = () => {
    setOpen(false);
    onOpenProfile();
  };

  return (
    <Modal title="Navigation" variant="drawer" open={open} onOpenChange={setOpen}>
      <nav aria-label="Modules" className="mobile-nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname?.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              href={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn('mobile-nav__item', active && 'mobile-nav__item--active')}
              onClick={() => setOpen(false)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden />
              <span className="mobile-nav__body">
                <span className="mobile-nav__label">{item.label}</span>
                <span className="mobile-nav__caption">{item.caption}</span>
              </span>
            </Link>
          );
        })}
        <div className="mobile-nav__divider" role="separator" />
        <button
          type="button"
          className="mobile-nav__item mobile-nav__item--action"
          onClick={openNotifications}
          aria-label={
            unreadNotifications > 0
              ? `Notifications, ${unreadNotifications} non lue${unreadNotifications > 1 ? 's' : ''}`
              : 'Notifications'
          }
        >
          <Bell size={16} strokeWidth={1.8} aria-hidden />
          <span className="mobile-nav__body">
            <span className="mobile-nav__label">Notifications</span>
            <span className="mobile-nav__caption">
              {unreadNotifications > 0 ? `${unreadNotifications} non lue${unreadNotifications > 1 ? 's' : ''}` : 'À jour'}
            </span>
          </span>
          {unreadNotifications > 0 && (
            <span className="mobile-nav__badge" aria-hidden>
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>
        <button
          type="button"
          className="mobile-nav__item mobile-nav__item--action"
          onClick={openProfile}
          aria-label="Profil"
        >
          <UserRound size={16} strokeWidth={1.8} aria-hidden />
          <span className="mobile-nav__body">
            <span className="mobile-nav__label">Profil</span>
          </span>
        </button>
      </nav>
    </Modal>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleNavItems } from '../../config/nav-items';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { Modal } from '../common/Modal';
import { cn } from '@/lib/utils';

/**
 * D12 — navigation mobile : le rail latéral est masqué < 768px (il mangeait
 * 64px de viewport) ; le bouton Menu de la TopBar ouvre ce tiroir, bâti sur le
 * Modal maison variant=drawer (D1 : trap focus, scroll-lock, Échap).
 */
export function MobileNavDrawer() {
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const pathname = usePathname();

  if (!open) {
    return null;
  }

  const items = visibleNavItems(role, demoMode);

  return (
    <Modal title="Navigation" variant="drawer" onClose={() => setOpen(false)}>
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
      </nav>
    </Modal>
  );
}

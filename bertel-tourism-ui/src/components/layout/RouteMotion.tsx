'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Wraps only the routed page content — never Sidebar/TopBar/CommandPalette/
 * drawers, which live as siblings in AppShell, outside this wrapper. Keying by
 * pathname remounts (and re-animates) the wrapper on real navigation only;
 * usePathname() ignores query-string changes, so in-page filter/search updates
 * do not trigger a re-animation.
 */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="motion-page-enter flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      {children}
    </div>
  );
}

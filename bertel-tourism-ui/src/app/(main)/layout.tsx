'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { AppShell } from '@/components/layout/AppShell';
import { getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useSessionStore((state) => state.status);

  useEffect(() => {
    if (status === 'guest') {
      router.replace(getLoginPath(pathname));
    }
  }, [status, router, pathname]);

  if (status === 'guest') {
    return null; // redirecting
  }
  if (status !== 'ready') {
    return <SessionScreen />;
  }
  return <AppShell>{children}</AppShell>;
}

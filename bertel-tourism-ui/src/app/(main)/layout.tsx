'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { AppShell } from '@/components/layout/AppShell';
import { getDefaultAppPath, getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  // 18a — un partenaire n'entre JAMAIS dans le back-office. Ce renvoi est de
  // l'ERGONOMIE, pas une barrière : il tourne côté client, après hydratation, et
  // n'empêche personne de demander la page. La frontière réelle reste la RLS et les
  // RPC côté base, qui ne rendent rien à un partenaire.
  const isActor = status === 'ready' && role === 'actor';

  useEffect(() => {
    if (status === 'guest') {
      router.replace(getLoginPath(pathname));
      return;
    }
    if (isActor) {
      router.replace(getDefaultAppPath('actor'));
    }
  }, [status, isActor, router, pathname]);

  if (status === 'guest') {
    return null; // redirection en cours vers /login
  }
  if (isActor) {
    return null; // redirection en cours vers l'Espace partenaire
  }
  if (status !== 'ready') {
    return <SessionScreen />;
  }
  return <AppShell>{children}</AppShell>;
}

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

function SessionFallback() {
  const status = useSessionStore((state) => state.status);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  return (
    <section className="page-grid">
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <h2>{status === 'booting' ? 'Initialisation de la session' : 'Session invalide'}</h2>
        </div>
        <p>{status === 'booting' ? 'Chargement de la session Supabase...' : errorMessage}</p>
      </article>
    </section>
  );
}

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
    return <SessionFallback />;
  }
  return <AppShell>{children}</AppShell>;
}

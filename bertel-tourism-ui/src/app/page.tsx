'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';
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

export default function HomePage() {
  const router = useRouter();
  useBootstrapSession();
  useNetworkMonitor();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/login');
      return;
    }
    if (status === 'ready') {
      router.replace(role === 'owner' ? '/dashboard' : '/explorer');
    }
  }, [status, role, router]);

  if (status === 'guest') return null;
  if (status !== 'ready') return <SessionFallback />;
  return null;
}

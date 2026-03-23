'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getPostLoginPath } from '@/lib/auth-routing';
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
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/login');
      return;
    }
    if (status === 'ready') {
      const from =
        typeof window !== 'undefined' ? sessionStorage.getItem('auth_redirect_from') : null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('auth_redirect_from');
      }
      router.replace(getPostLoginPath(role, from));
    }
  }, [status, role, router]);

  if (status === 'guest') return null;
  if (status !== 'ready') return <SessionFallback />;
  return null;
}

'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ExplorerPageComponent from '@/views/ExplorerPage';
import { useExplorerUrlSync } from '@/hooks/useExplorerUrlSync';
import { useExplorerContextSync } from '@/hooks/useExplorerContextSync';
import { useSessionStore } from '@/store/session-store';

function ExplorerContent() {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);

  useExplorerUrlSync();
  // D25 : deep-link de la fiche ouverte (?fiche=<id>) — restauration au chargement,
  // écriture à l'ouverture/fermeture du drawer.
  useExplorerContextSync();

  useEffect(() => {
    if (role === 'owner') {
      router.replace('/dashboard');
    }
  }, [role, router]);

  if (role === 'owner') return null;
  return <ExplorerPageComponent />;
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={<div className="panel-card panel-card--wide">Chargement de l'explorateur...</div>}>
      <ExplorerContent />
    </Suspense>
  );
}

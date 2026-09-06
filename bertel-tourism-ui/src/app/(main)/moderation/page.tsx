'use client';

// D5 : la garde « demo-only » est retirée — la modération est branchée sur ses
// RPC réels (P2.1 §120) et doit être accessible en production.
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useSessionStore } from '@/store/session-store';
import ModerationPageComponent from '@/views/ModerationPage';
import { PageSkeleton } from '../../../components/common/PageSkeleton';

export default function ModerationPage() {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (role === 'owner') router.replace('/dashboard');
  }, [role, router]);

  if (role === 'owner') return null;
  // 18a — la vue lit `?object=` via useSearchParams, qui exige une frontière Suspense côté App
  // Router (convention du dépôt : aide/page.tsx). `loading.tsx` en crée déjà une implicite pour
  // cette route, mais compter dessus, c'est faire dépendre le build d'un fichier voisin.
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <ModerationPageComponent />
    </Suspense>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ExplorerPageComponent from '@/views/ExplorerPage';
import { useExplorerUrlSync } from '@/hooks/useExplorerUrlSync';
import { useSessionStore } from '@/store/session-store';

export default function ExplorerPage() {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);

  useExplorerUrlSync();

  useEffect(() => {
    if (role === 'owner') {
      router.replace('/dashboard');
    }
  }, [role, router]);

  if (role === 'owner') return null;
  return <ExplorerPageComponent />;
}

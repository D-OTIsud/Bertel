'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getDefaultAppPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export default function HomePage() {
  const router = useRouter();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (status !== 'ready') return;
    router.replace(getDefaultAppPath(role));
  }, [status, role, router]);

  return null;
}

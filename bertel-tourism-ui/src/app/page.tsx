'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { getPostLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

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
  if (status !== 'ready') return <SessionScreen />;
  return null;
}

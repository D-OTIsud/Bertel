'use client';

// D5 : la garde « demo-only » est retirée — la modération est branchée sur ses
// RPC réels (P2.1 §120) et doit être accessible en production.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session-store';
import ModerationPageComponent from '@/views/ModerationPage';

export default function ModerationPage() {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (role === 'owner') router.replace('/dashboard');
  }, [role, router]);

  if (role === 'owner') return null;
  return <ModerationPageComponent />;
}

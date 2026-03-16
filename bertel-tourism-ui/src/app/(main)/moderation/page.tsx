'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session-store';
import { isDemoOnlyModule } from '@/utils/features';
import { ModerationPage as ModerationPageComponent } from '@/pages/ModerationPage';

function FeatureUnavailable({ path }: { path: string }) {
  return (
    <section className="page-grid">
      <article className="panel-card panel-card--warning panel-card--wide">
        <div className="panel-heading">
          <h2>Module non branche</h2>
        </div>
        <p>
          Le module <strong>{path}</strong> est reserve au mode demo tant que ses RPC backend ne sont pas implementes.
        </p>
      </article>
    </section>
  );
}

export default function ModerationPage() {
  const router = useRouter();
  const demoMode = useSessionStore((state) => state.demoMode);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (role === 'owner') router.replace('/dashboard');
  }, [role, router]);

  if (role === 'owner') return null;
  if (!demoMode && isDemoOnlyModule('/moderation')) return <FeatureUnavailable path="/moderation" />;
  return <ModerationPageComponent />;
}

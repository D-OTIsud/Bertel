'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session-store';
import { isDemoOnlyModule } from '@/utils/features';
import CrmPageComponent from '@/views/CrmPage';

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

export default function CrmPage() {
  const router = useRouter();
  const demoMode = useSessionStore((state) => state.demoMode);
  const role = useSessionStore((state) => state.role);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);

  // CRM = surface « métier » réservée aux profils qui peuvent agir. Un membre en
  // lecture seule (canEditObjects=false) n'y a pas accès — miroir du masquage de
  // l'entrée CRM dans le menu/palette/nav mobile (registre nav-items). Le MainLayout
  // ne monte cette page qu'en session `ready`, donc canEditObjects est déjà résolu
  // (pas de course au bootstrap qui éjecterait un éditeur légitime). Les RPC CRM sont
  // de toute façon authorize-once côté serveur : ceci est la couche UX, pas la frontière.
  const redirectAway = role === 'owner' || !canEditObjects;

  useEffect(() => {
    if (redirectAway) router.replace(role === 'owner' ? '/dashboard' : '/explorer');
  }, [redirectAway, role, router]);

  if (redirectAway) return null;
  if (!demoMode && isDemoOnlyModule('/crm')) return <FeatureUnavailable path="/crm" />;
  return <CrmPageComponent />;
}

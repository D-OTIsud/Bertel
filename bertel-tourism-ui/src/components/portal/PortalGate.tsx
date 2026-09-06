'use client';

// Garde cliente de l'Espace partenaire (18a) — miroir du gate `(main)`, avec `PortalShell`
// à la place d'`AppShell`. Rien à démonter en entrant : seul `(main)/layout.tsx` monte
// l'AppShell, et le bootstrap de session vit à la racine (`app/layout.tsx` → Providers →
// AppBootstrap). Le groupe `(portal)` est donc nativement hors back-office.
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SessionScreen } from '@/components/auth/SessionScreen';
import { PortalShell } from '@/components/portal/PortalShell';
import { getLoginPath } from '@/lib/auth-routing';
import { useSessionStore } from '@/store/session-store';

export function PortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);

  useEffect(() => {
    if (status === 'guest') {
      router.replace(getLoginPath(pathname));
      return;
    }
    // Miroir du gate (main) : seul un partenaire entre ici. Un membre d'équipe qui tape
    // /espace retourne à son back-office (ergonomie ; RLS reste la barrière). Refuser les
    // personas owner/super_admin est aussi ce qui empêche des permissions d'écriture
    // directe d'entrer dans un écran taillé pour la file de vérification de l'office.
    if (status === 'ready' && role !== 'actor') {
      router.replace('/');
    }
  }, [status, role, router, pathname]);

  if (status === 'guest') return null;
  if (status === 'ready' && role !== 'actor') return null;
  if (status !== 'ready') return <SessionScreen />;
  return <PortalShell>{children}</PortalShell>;
}

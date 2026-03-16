import { useRouter } from 'next/navigation';
import { signOut } from '../../services/auth';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { useUiStore } from '../../store/ui-store';
import { StatusPill } from '../common/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TopBar() {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);
  const userName = useSessionStore((state) => state.userName);
  const sessionStatus = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-card/50 px-6 py-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {logoUrl ? <img src={logoUrl} alt={brandName} className="h-14 w-14 rounded-2xl border border-border bg-card object-contain p-1.5" /> : null}
        <div>
          <strong className="block font-medium">{brandName}</strong>
          <span className="text-xs text-muted-foreground">Ctrl+K pour rechercher partout</span>
        </div>
      </div>

      <label className="flex flex-1 max-w-md flex-col gap-1">
        <span className="text-xs text-muted-foreground">Recherche globale</span>
        <Input type="search" placeholder="Ctrl+K, nom, fiche, acteur, publication..." className="h-9" />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red'}>{networkStatus}</StatusPill>
        <StatusPill tone="neutral">{liveUsersCount} en direct</StatusPill>
        <StatusPill tone="neutral">Role: {role ?? 'indetermine'}</StatusPill>
        <StatusPill tone="neutral">Session: {sessionStatus}</StatusPill>
        <span className="rounded-full border border-border bg-card/80 px-3 py-1.5 text-sm">{userName || 'Utilisateur non charge'}</span>
        {!demoMode && sessionStatus === 'ready' ? (
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            Deconnexion
          </Button>
        ) : null}
      </div>
    </header>
  );
}


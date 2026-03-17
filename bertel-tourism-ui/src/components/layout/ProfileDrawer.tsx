'use client';

import Link from 'next/link';
import { LogOut, Settings2, Users, Wifi, WifiOff, X } from 'lucide-react';
import { signOut } from '../../services/auth';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { StatusPill } from '../common/StatusPill';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

interface ProfileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initialsFromName(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'BT';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function ProfileDrawer({ open, onOpenChange }: ProfileDrawerProps) {
  const role = useSessionStore((state) => state.role);
  const userName = useSessionStore((state) => state.userName);
  const sessionStatus = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
  const statusTone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';

  async function handleSignOut() {
    await signOut();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="profile-drawer w-full max-w-[420px] border-0 p-0 sm:max-w-[420px]"
      >
        <SheetTitle className="sr-only">Profil utilisateur</SheetTitle>
        <SheetDescription className="sr-only">Profil, etat reseau et acces aux parametres applicatifs.</SheetDescription>
        <div className="profile-drawer__inner">
          <div className="profile-drawer__header">
            <div>
              <span className="eyebrow">Profil</span>
              <h2>{userLabel}</h2>
              <p>Retrouvez votre session, le statut live et l acces direct aux parametres.</p>
            </div>
            <button type="button" className="topbar-icon-button" onClick={() => onOpenChange(false)} aria-label="Fermer le profil">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="profile-drawer__card">
            <span className="profile-drawer__avatar">{initials}</span>
            <div>
              <strong>{userLabel}</strong>
              <span>{role ?? 'guest'} · {sessionStatus}</span>
            </div>
          </div>

          <div className="profile-drawer__status">
            <StatusPill tone={statusTone}>{networkStatus}</StatusPill>
            <StatusPill tone="neutral">{liveUsersCount} live</StatusPill>
            <span className="profile-drawer__mode">
              {networkStatus === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {demoMode ? 'Demo workspace' : 'Secure workspace'}
            </span>
          </div>

          <div className="profile-drawer__actions">
            <Link href="/settings" className="ghost-button" onClick={() => onOpenChange(false)}>
              <Settings2 className="h-4 w-4" />
              Parametres
            </Link>
            <Link href="/crm" className="ghost-button" onClick={() => onOpenChange(false)}>
              <Users className="h-4 w-4" />
              Espace equipe
            </Link>
          </div>

          {!demoMode && sessionStatus === 'ready' ? (
            <Button type="button" variant="ghost" className="profile-drawer__logout" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" />
              Se deconnecter
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

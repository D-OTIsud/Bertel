'use client';

// Hub personnel (spec 2026-07-03) — le tiroir de la pastille utilisateur devient un espace
// personnel : identité éditable (ProfileEditModal), collègues en ligne (presence globale
// useGlobalPresence), tâches CRM assignées, modération en attente, raccourcis réels.
// Les blocs dynamiques sont tolérants à l'échec (query en erreur ⇒ bloc masqué) :
// identité + pied ne dépendent d'aucun réseau.

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Pencil, Settings2, ShieldCheck, Users, WifiOff, X } from 'lucide-react';
import { visibleNavItems } from '../../config/nav-items';
import { signOut } from '../../services/auth';
import { listCrmTasks } from '../../services/crm';
import { listPendingChanges } from '../../services/rpc';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { canAdministerTeam } from '@/store/session-selectors';
import { resolveUserRoleLabel, resolveUserRoleTone } from '../../utils/user-role-label';
import { ProfileEditModal } from '../../features/settings/ProfileEditModal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { CrmTask } from '../../types/domain';

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
  if (parts.length === 0) return 'BT';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Tâches ouvertes assignées à l'utilisateur : todo/in_progress, échéance croissante (nulls en dernier), 4 max. */
export function selectMyOpenTasks(tasks: CrmTask[], userId: string | null): CrmTask[] {
  if (!userId) return [];
  return tasks
    .filter((task) => task.ownerId === userId && (task.status === 'todo' || task.status === 'in_progress'))
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    })
    .slice(0, 4);
}

/** Échéance dépassée (badge « En retard »). */
export function isTaskOverdue(task: CrmTask, now: number = Date.now()): boolean {
  return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now);
}

function formatSince(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDue(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ProfileDrawer({ open, onOpenChange }: ProfileDrawerProps) {
  const role = useSessionStore((state) => state.role);
  const adminRank = useSessionStore((state) => state.adminRank);
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const email = useSessionStore((state) => state.email);
  const orgName = useSessionStore((state) => state.orgName);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);
  const sessionStatus = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveMembers = useUiStore((state) => state.liveMembers);
  const [editOpen, setEditOpen] = useState(false);

  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
  const roleLabel = resolveUserRoleLabel(role, adminRank);
  const roleTone = resolveUserRoleTone(role);
  const colleagues = liveMembers.filter((memberEntry) => memberEntry.userId !== userId);
  const showTeamLink = canAdministerTeam({ role, adminRank });

  // Mêmes clés de cache que CrmPage / le badge Sidebar (aucune double charge réseau) ;
  // fetch uniquement panneau ouvert. Query en erreur ⇒ data undefined ⇒ bloc masqué.
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks, enabled: open, staleTime: 60_000 });
  const moderationVisible = visibleNavItems(role, demoMode, canEditObjects).some((item) => item.to === '/moderation');
  const pendingQuery = useQuery({
    queryKey: ['pending-changes', 'pending'],
    queryFn: () => listPendingChanges('pending'),
    enabled: open && moderationVisible,
    staleTime: 60_000,
  });
  const myTasks = selectMyOpenTasks(tasksQuery.data ?? [], userId);
  const pendingCount = pendingQuery.data?.length ?? 0;

  const close = () => onOpenChange(false);

  async function handleSignOut() {
    await signOut();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showClose={false}
          aria-describedby={undefined}
          className="profile-drawer w-full max-w-[420px] border-0 p-0 sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">Mon espace</SheetTitle>
          <SheetDescription className="sr-only">
            Identité, collègues en ligne, tâches assignées et raccourcis personnels.
          </SheetDescription>
          <div className="profile-drawer__inner">
            <div className="profile-drawer__header">
              <span className="eyebrow">Mon espace</span>
              <button type="button" className="topbar-icon-button" onClick={close} aria-label="Fermer le panneau">
                <X className="h-4 w-4" />
              </button>
            </div>

            {networkStatus !== 'connected' ? (
              <p className="profile-drawer__network" role="status">
                <WifiOff className="h-4 w-4" aria-hidden />
                {networkStatus === 'degraded'
                  ? 'Connexion dégradée — certaines données peuvent être obsolètes.'
                  : 'Hors ligne — les données affichées peuvent être obsolètes.'}
              </p>
            ) : null}

            <div className="profile-drawer__card">
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
                ? <img className="profile-drawer__avatar profile-drawer__avatar--photo" src={avatarUrl} alt="" />
                : <span className="profile-drawer__avatar">{initials}</span>}
              <div className="profile-drawer__identity">
                <strong>{userLabel}</strong>
                {email ? <span>{email}</span> : null}
                <span className="profile-drawer__meta">
                  {orgName ? <span>{orgName}</span> : null}
                  <span className={`badge badge--${roleTone}`}>{roleLabel}</span>
                </span>
              </div>
            </div>
            <button type="button" className="ghost-button" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Modifier mon profil
            </button>

            <section className="profile-drawer__block" aria-label="Collègues en ligne">
              <h3 className="profile-drawer__block-title">En ligne maintenant</h3>
              {colleagues.length === 0 ? (
                <p className="profile-drawer__empty">Vous êtes le seul connecté.</p>
              ) : (
                <ul className="profile-drawer__presence">
                  {colleagues.map((memberEntry) => (
                    <li
                      key={memberEntry.userId}
                      title={memberEntry.onlineSince ? `En ligne depuis ${formatSince(memberEntry.onlineSince)}` : 'En ligne'}
                    >
                      <span className="profile-drawer__presence-avatar" style={{ background: memberEntry.color }} aria-hidden>
                        {memberEntry.avatar}
                      </span>
                      <span>{memberEntry.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {myTasks.length > 0 ? (
              <section className="profile-drawer__block" aria-label="Mes tâches">
                <h3 className="profile-drawer__block-title">Mes tâches</h3>
                <ul className="profile-drawer__tasks">
                  {myTasks.map((task) => (
                    <li key={task.id}>
                      <Link href="/crm?tab=taches" className="profile-drawer__task" onClick={close}>
                        <span className="profile-drawer__task-title">{task.title}</span>
                        <span className="profile-drawer__task-meta">
                          {task.objectName}
                          {task.dueAt ? ` · ${formatDue(task.dueAt)}` : ''}
                          {isTaskOverdue(task) ? <span className="badge badge--warn">En retard</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/crm?tab=taches" className="profile-drawer__more" onClick={close}>
                  Toutes mes tâches
                </Link>
              </section>
            ) : null}

            {moderationVisible && pendingCount > 0 ? (
              <section className="profile-drawer__block" aria-label="Modération">
                <Link href="/moderation" className="profile-drawer__task" onClick={close}>
                  <span className="profile-drawer__task-title">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    {pendingCount} suggestion{pendingCount > 1 ? 's' : ''} en attente de modération
                  </span>
                </Link>
              </section>
            ) : null}

            <div className="profile-drawer__actions">
              {showTeamLink ? (
                <Link href="/settings?section=team" className="ghost-button" onClick={close}>
                  <Users className="h-4 w-4" />
                  Mon équipe
                </Link>
              ) : null}
              <Link href="/settings" className="ghost-button" onClick={close}>
                <Settings2 className="h-4 w-4" />
                Paramètres
              </Link>
            </div>

            {!demoMode && sessionStatus === 'ready' ? (
              <Button type="button" variant="ghost" className="profile-drawer__logout" onClick={() => void handleSignOut()}>
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <ProfileEditModal open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

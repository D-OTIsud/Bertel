import { create } from 'zustand';
import { env } from '../lib/env';
import type { UserRole } from '../types/domain';

type SessionStatus = 'booting' | 'ready' | 'guest' | 'error';

// Initiales (≤ 2) dérivées du nom — repli d'avatar quand aucune photo. Même logique que
// useBootstrapSession/ProfileDrawer/Sidebar (dette pré-existante à consolider un jour).
function initialsFromName(name: string): string {
  const parts = name.split(' ').map((p) => p.trim()).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '--';
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

interface SessionState {
  status: SessionStatus;
  role: UserRole | null;
  userId: string | null;
  email: string;
  userName: string;
  /** Initiales dérivées du nom (fallback quand aucune photo de profil). */
  avatar: string;
  /** URL publique de la photo de profil (app_user_profile.avatar_url), null si aucune. */
  avatarUrl: string | null;
  langPrefs: string[];
  demoMode: boolean;
  errorMessage: string | null;
  /**
   * Capability flag: TRUE if the current user can edit at least one object
   * within their active organisation (super_admin, owner, ORG admin role, or
   * holder of any of the create/edit/publish permissions).
   * Source of truth is the SQL helper `api.current_user_can_edit_objects()`,
   * resolved once at session bootstrap. Used (today) to broaden the Explorer
   * to non-published statuses for users that can act on them. RLS still gates
   * which non-published rows are actually returned.
   */
  canEditObjects: boolean;
  /**
   * Capability flag: TRUE if the current user can CREATE objects — i.e. has an
   * active ORG membership AND the `create_object` permission. Source of truth is
   * the SQL helper `api.user_can_create_object()`, resolved once at session
   * bootstrap. Strictly narrower than `canEditObjects` (which is true for anyone
   * who can edit *something*). Gates the "Créer une fiche" CTA so only users who
   * can actually create a fiche see it; the RPC re-checks server-side.
   */
  canCreateObjects: boolean;
  /**
   * The current user's active organisation id and display name, resolved at
   * session bootstrap via `api.current_user_active_org()`. Used for UI labels
   * (e.g. scope switch "Mon organisation · <orgName>"). Degrades to null when
   * the user has no active org or the helper is unavailable.
   */
  orgId: string | null;
  orgName: string | null;
  /**
   * The current user's admin rank (integer ≥ 10 means they hold a team-admin
   * role), resolved at session bootstrap via `api.current_user_admin_rank()`.
   * NULL when the user has no admin role or the helper is unavailable.
   */
  adminRank: number | null;
  /**
   * The current user's admin role code (e.g. 'ADMIN_ORG'), resolved at session
   * bootstrap via `api.current_user_admin_role_code()`. NULL when the user has
   * no admin role or the helper is unavailable.
   */
  adminRoleCode: string | null;
  setDemoRole: (role: UserRole) => void;
  setLangPrefs: (langPrefs: string[]) => void;
  /**
   * Applique une mise à jour du profil courant (nom / photo) depuis « Mon compte »
   * sans re-bootstrapper la session. Recalcule les initiales quand le nom change.
   */
  applyProfile: (patch: { userName?: string; avatarUrl?: string | null }) => void;
  hydrateFromAuth: (payload: {
    role: UserRole;
    userId: string;
    email: string;
    userName: string;
    avatar: string;
    avatarUrl: string | null;
    langPrefs: string[];
    canEditObjects: boolean;
    canCreateObjects: boolean;
    orgId: string | null;
    orgName: string | null;
    adminRank: number | null;
    adminRoleCode: string | null;
  }) => void;
  setBooting: () => void;
  setGuest: (message?: string | null) => void;
  setSessionError: (message: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: env.demoMode ? 'ready' : 'booting',
  role: env.demoMode ? 'tourism_agent' : null,
  userId: env.demoMode ? 'usr-local-marie' : null,
  email: env.demoMode ? 'marie@example.com' : '',
  userName: env.demoMode ? 'Marie D.' : '',
  avatar: env.demoMode ? 'MA' : '--',
  avatarUrl: null,
  langPrefs: ['fr', 'en'],
  demoMode: env.demoMode,
  errorMessage: null,
  // Demo mode: show drafts so the showcase reflects the editor experience.
  // Real auth: must wait for the SQL capability check to resolve before
  // broadening the Explorer.
  canEditObjects: env.demoMode,
  canCreateObjects: env.demoMode,
  orgId: env.demoMode ? 'ORG-DEMO' : null,
  orgName: env.demoMode ? 'OTI du Sud' : null,
  adminRank: null,
  adminRoleCode: null,
  setDemoRole: (role) => {
    const state = useSessionStore.getState();
    if (!state.demoMode) {
      return;
    }
    set({
      role,
      // In demo mode the capability flags track the role: tourism_agent
      // is treated as a read-only persona, super_admin/owner can edit + create.
      canEditObjects: role !== 'tourism_agent',
      canCreateObjects: role !== 'tourism_agent',
    });
  },
  setLangPrefs: (langPrefs) => set({ langPrefs }),
  applyProfile: ({ userName, avatarUrl }) =>
    set((state) => ({
      userName: userName ?? state.userName,
      avatar: userName ? initialsFromName(userName) : state.avatar,
      avatarUrl: avatarUrl === undefined ? state.avatarUrl : avatarUrl,
    })),
  hydrateFromAuth: ({ role, userId, email, userName, avatar, avatarUrl, langPrefs, canEditObjects, canCreateObjects, orgId, orgName, adminRank, adminRoleCode }) =>
    set({
      status: 'ready',
      role,
      userId,
      email,
      userName,
      avatar,
      avatarUrl,
      langPrefs,
      canEditObjects,
      canCreateObjects,
      orgId,
      orgName,
      adminRank,
      adminRoleCode,
      errorMessage: null,
    }),
  setBooting: () => set((state) => ({ status: state.status === 'ready' ? 'ready' : 'booting', errorMessage: null })),
  setGuest: (message = null) => {
    set({
      status: 'guest',
      errorMessage: message,
      role: null,
      userId: null,
      email: '',
      userName: '',
      avatar: '--',
      avatarUrl: null,
      canEditObjects: false,
      canCreateObjects: false,
      orgId: null,
      orgName: null,
      adminRank: null,
      adminRoleCode: null,
    });
  },
  setSessionError: (message) => {
    set({
      status: 'error',
      errorMessage: message,
      role: null,
      userId: null,
      email: '',
      userName: '',
      avatar: '--',
      avatarUrl: null,
      canEditObjects: false,
      canCreateObjects: false,
      orgId: null,
      orgName: null,
      adminRank: null,
      adminRoleCode: null,
    });
  },
}));

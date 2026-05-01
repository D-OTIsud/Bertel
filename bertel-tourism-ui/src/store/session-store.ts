import { create } from 'zustand';
import { env } from '../lib/env';
import type { UserRole } from '../types/domain';

type SessionStatus = 'booting' | 'ready' | 'guest' | 'error';

interface SessionState {
  status: SessionStatus;
  role: UserRole | null;
  userId: string | null;
  email: string;
  userName: string;
  avatar: string;
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
  setDemoRole: (role: UserRole) => void;
  setLangPrefs: (langPrefs: string[]) => void;
  hydrateFromAuth: (payload: {
    role: UserRole;
    userId: string;
    email: string;
    userName: string;
    avatar: string;
    langPrefs: string[];
    canEditObjects: boolean;
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
  langPrefs: ['fr', 'en'],
  demoMode: env.demoMode,
  errorMessage: null,
  // Demo mode: show drafts so the showcase reflects the editor experience.
  // Real auth: must wait for the SQL capability check to resolve before
  // broadening the Explorer.
  canEditObjects: env.demoMode,
  setDemoRole: (role) =>
    set((state) =>
      state.demoMode
        ? {
            role,
            // In demo mode the capability flag tracks the role: tourism_agent
            // is treated as a read-only persona, super_admin/owner can edit.
            canEditObjects: role !== 'tourism_agent',
          }
        : state,
    ),
  setLangPrefs: (langPrefs) => set({ langPrefs }),
  hydrateFromAuth: ({ role, userId, email, userName, avatar, langPrefs, canEditObjects }) =>
    set({
      status: 'ready',
      role,
      userId,
      email,
      userName,
      avatar,
      langPrefs,
      canEditObjects,
      errorMessage: null,
    }),
  setBooting: () => set((state) => ({ status: state.status === 'ready' ? 'ready' : 'booting', errorMessage: null })),
  setGuest: (message = null) =>
    set({
      status: 'guest',
      errorMessage: message,
      role: null,
      userId: null,
      email: '',
      userName: '',
      avatar: '--',
      canEditObjects: false,
    }),
  setSessionError: (message) =>
    set({
      status: 'error',
      errorMessage: message,
      role: null,
      userId: null,
      email: '',
      userName: '',
      avatar: '--',
      canEditObjects: false,
    }),
}));

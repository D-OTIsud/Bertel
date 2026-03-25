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
  setDemoRole: (role: UserRole) => void;
  setLangPrefs: (langPrefs: string[]) => void;
  hydrateFromAuth: (payload: {
    role: UserRole;
    userId: string;
    email: string;
    userName: string;
    avatar: string;
    langPrefs: string[];
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
  setDemoRole: (role) => set((state) => (state.demoMode ? { role } : state)),
  setLangPrefs: (langPrefs) => set({ langPrefs }),
  hydrateFromAuth: ({ role, userId, email, userName, avatar, langPrefs }) =>
    set({
      status: 'ready',
      role,
      userId,
      email,
      userName,
      avatar,
      langPrefs,
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
    }),
}));

import { create } from 'zustand';
import { useDashboardExplorerStore, useExplorerStore } from './explorer-store';
import { saveProviderPreference } from '../services/provider-preference';

let sessionGeneration = 0;

function applyScope(enabled: boolean) {
  useExplorerStore.getState().setProviderOnly(enabled);
  useDashboardExplorerStore.getState().setProviderOnly(enabled);
}

interface ProviderScopeState {
  userId: string | null;
  enabled: boolean;
  saving: boolean;
  error: string | null;
  initialize: (userId: string, enabled: boolean) => void;
  clear: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
}

// Seul le choix explicite de ce périmètre est partagé entre les deux pages.
// Le profil est la source durable, indépendamment du poste de travail.
export const useProviderScopeStore = create<ProviderScopeState>((set, get) => ({
  userId: null,
  enabled: false,
  saving: false,
  error: null,
  initialize: (userId, enabled) => {
    // Un renouvellement du jeton ne doit pas écraser un clic en cours ni
    // le périmètre temporaire porté par une URL partagée.
    if (get().userId === userId) return;
    sessionGeneration += 1;
    set({ userId, enabled, saving: false, error: null });
    applyScope(enabled);
  },
  clear: () => {
    sessionGeneration += 1;
    set({ userId: null, enabled: false, saving: false, error: null });
    applyScope(false);
  },
  setEnabled: async (enabled) => {
    if (get().saving) return;
    const userId = get().userId;
    if (!userId) {
      set({ error: 'Votre session est indisponible. Reconnectez-vous pour mémoriser ce choix.' });
      return;
    }
    const previous = get().enabled;
    const generation = sessionGeneration;
    const explorer = useExplorerStore.getState().common.providerOnly === true;
    const dashboard = useDashboardExplorerStore.getState().common.providerOnly === true;
    set({ enabled, saving: true, error: null });
    applyScope(enabled);
    try {
      await saveProviderPreference(enabled);
      if (sessionGeneration === generation) set({ saving: false });
    } catch {
      if (sessionGeneration !== generation) return;
      set({ enabled: previous, saving: false, error: 'Ce choix n’a pas pu être mémorisé. Réessayez.' });
      if (useExplorerStore.getState().common.providerOnly === enabled) useExplorerStore.getState().setProviderOnly(explorer);
      if (useDashboardExplorerStore.getState().common.providerOnly === enabled) useDashboardExplorerStore.getState().setProviderOnly(dashboard);
    }
  },
}));

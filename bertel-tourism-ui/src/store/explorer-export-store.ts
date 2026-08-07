import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  CLOSED_ACTOR_CAPS, EXPORT_COLUMN_IDS, presetColumnIds,
  type ActorCapabilities, type ExportPresetId,
} from '../services/export/export-columns';

/**
 * §208 — préférences de l'export Excel, mémorisées SUR LE POSTE (même mécanique
 * que explorer-view-store : persist + merge qui filtre les ids inconnus et
 * retombe sur le défaut si vide ; garde « jamais 0 colonne »).
 * Le préréglage « diffusion » n'est JAMAIS restauré tel quel : la modale le
 * recalcule du code à chaque ouverture (préréglage verrouillé).
 */
interface ExplorerExportState {
  presetId: ExportPresetId;
  columnIds: string[];
  /** R2.1 — `caps` vient du préflight serveur ; fermé par défaut (aucune colonne acteur cochée avant sa réponse). */
  applyPreset: (
    presetId: ExportPresetId,
    session: { orgId: string | null; canEditObjects: boolean; role: string | null },
    caps?: ActorCapabilities,
  ) => void;
  toggleColumn: (id: string) => void;
  setColumns: (ids: string[]) => void;
}

function sanitize(ids: string[]): string[] {
  return ids.filter((id) => EXPORT_COLUMN_IDS.includes(id));
}

export const useExplorerExportStore = create<ExplorerExportState>()(
  persist(
    (set) => ({
      presetId: 'essentiel',
      columnIds: [],
      applyPreset: (presetId, session, caps = CLOSED_ACTOR_CAPS) =>
        set({ presetId, columnIds: presetId === 'custom' ? [] : presetColumnIds(presetId, session, caps) }),
      toggleColumn: (id) =>
        set((state) => {
          if (!EXPORT_COLUMN_IDS.includes(id)) return state;
          if (state.columnIds.includes(id)) {
            if (state.columnIds.length === 1) return state; // jamais 0 colonne
            return { presetId: 'custom', columnIds: state.columnIds.filter((x) => x !== id) };
          }
          // ré-insertion à la position canonique du registre (même geste que la vue Table)
          const canonical = EXPORT_COLUMN_IDS.indexOf(id);
          const at = state.columnIds.findIndex((x) => EXPORT_COLUMN_IDS.indexOf(x) > canonical);
          const columnIds = at < 0 ? [...state.columnIds, id] : [...state.columnIds.slice(0, at), id, ...state.columnIds.slice(at)];
          return { presetId: 'custom', columnIds };
        }),
      setColumns: (ids) => set({ presetId: 'custom', columnIds: sanitize(ids) }),
    }),
    {
      name: 'bertel-explorer-export',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ presetId: state.presetId, columnIds: state.columnIds }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ExplorerExportState> | undefined) ?? {};
        const columnIds = Array.isArray(saved.columnIds) ? sanitize(saved.columnIds) : current.columnIds;
        return { ...current, ...saved, columnIds };
      },
    },
  ),
);

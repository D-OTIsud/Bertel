import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  CLOSED_ACTOR_CAPS, EXPORT_COLUMN_IDS, presetColumnIds,
  type ActorCapabilities, type ExportPresetId,
} from '../services/export/export-columns';

/**
 * §208 — préférences de l'export Excel, mémorisées SUR LE POSTE (même mécanique
 * que explorer-view-store : persist + merge qui filtre les ids inconnus).
 * Garde « jamais 0 colonne » tenue à QUATRE endroits : `merge` (rehydratation —
 * repli sur `essentialFallback()` si le disque ne contient plus aucun id valide),
 * `setColumns` (repli sur l'état précédent si la liste proposée est entièrement
 * périmée), `toggleColumn` (refuse de décocher la dernière colonne) et
 * `applyPreset('custom')` (rien à recalculer pour 'custom' ⇒ la sélection en
 * cours est conservée telle quelle, jamais vidée).
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

/**
 * Repli statique de la garde « jamais 0 colonne ». Ni `merge` (rehydratation) ni
 * `setColumns` n'ont de session appelante sous la main : on ne DEVINE donc pas une
 * session, on retombe sur le préréglage essentiel calculé pour une session fermée
 * (même politique fail-closed que `caps = CLOSED_ACTOR_CAPS`). Les 16 ids
 * d'ESSENTIEL_IDS sont tous de clearance 'public' (cf. export-columns.ts) : ce
 * repli est donc stable et non vide indépendamment de la session réelle.
 */
const UNPRIVILEGED_SESSION = { orgId: null, canEditObjects: false, role: null };
function essentialFallback(): string[] {
  return presetColumnIds('essentiel', UNPRIVILEGED_SESSION, CLOSED_ACTOR_CAPS);
}

export const useExplorerExportStore = create<ExplorerExportState>()(
  persist(
    (set) => ({
      presetId: 'essentiel',
      columnIds: [],
      applyPreset: (presetId, session, caps = CLOSED_ACTOR_CAPS) =>
        set((state) => ({
          presetId,
          // 'custom' n'a rien à recalculer depuis le code : la sélection en cours
          // est conservée telle quelle, jamais vidée (revue §208 tâche 9, finding 3).
          columnIds: presetId === 'custom' ? state.columnIds : presetColumnIds(presetId, session, caps),
        })),
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
      setColumns: (ids) =>
        set((state) => {
          const columnIds = sanitize(ids);
          // jamais 0 colonne : une liste entièrement périmée garde l'état précédent
          // plutôt que de vider la sélection (revue §208 tâche 9, finding 2).
          if (columnIds.length === 0) return state;
          return { presetId: 'custom', columnIds };
        }),
    }),
    {
      name: 'bertel-explorer-export',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ presetId: state.presetId, columnIds: state.columnIds }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ExplorerExportState> | undefined) ?? {};
        const sanitized = Array.isArray(saved.columnIds) ? sanitize(saved.columnIds) : current.columnIds;
        // jamais 0 colonne au réveil : un id disparu du registre entre deux sessions
        // ne doit pas rehydrater un état sans aucune colonne cochée (finding 1).
        const columnIds = sanitized.length > 0 ? sanitized : essentialFallback();
        return { ...current, ...saved, columnIds };
      },
    },
  ),
);

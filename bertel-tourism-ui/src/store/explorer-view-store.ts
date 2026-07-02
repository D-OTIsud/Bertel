import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * D16/D17 (revue UX) — préférences de VUE de l'Explorer, séparées du store de
 * filtres (les filtres vivent dans l'URL ; la vue est une préférence durable).
 * ponytail: persistance localStorage en intérim — la cible serveur est
 * `app_user_profile.preferences` (JSONB existant, D28) quand un RPC de prefs
 * existera ; le jour venu, ce store hydrate depuis le profil au lieu du disque.
 */

export type ExplorerViewMode = 'liste' | 'table' | 'carte' | 'split';
export type ExplorerTableDensity = 'confort' | 'compact';

export interface ExplorerTableSort {
  columnId: string;
  dir: 'asc' | 'desc';
}

/** Ordre canonique des colonnes (ids résolus par le registre du composant). */
export const DEFAULT_TABLE_COLUMNS = ['name', 'type', 'city', 'status', 'updated', 'rating', 'labels'] as const;
/** Colonnes proposées mais masquées par défaut. */
export const OPTIONAL_TABLE_COLUMNS = ['price', 'open'] as const;
export const ALL_TABLE_COLUMN_IDS = [...DEFAULT_TABLE_COLUMNS, ...OPTIONAL_TABLE_COLUMNS] as string[];

interface ExplorerViewState {
  viewMode: ExplorerViewMode;
  /** Colonnes VISIBLES, dans l'ordre d'affichage. */
  tableColumns: string[];
  tableDensity: ExplorerTableDensity;
  tableSort: ExplorerTableSort | null;
  setViewMode: (mode: ExplorerViewMode) => void;
  toggleTableColumn: (columnId: string) => void;
  moveTableColumn: (columnId: string, direction: -1 | 1) => void;
  setTableDensity: (density: ExplorerTableDensity) => void;
  /** Cycle tri : asc → desc → aucun (piloté par l'en-tête de colonne). */
  cycleTableSort: (columnId: string) => void;
  resetTableColumns: () => void;
}

/** Ré-insère une colonne re-cochée à sa position canonique parmi les visibles. */
function insertAtCanonicalPosition(visible: string[], columnId: string): string[] {
  const canonicalIndex = ALL_TABLE_COLUMN_IDS.indexOf(columnId);
  if (canonicalIndex < 0) return visible;
  const insertAt = visible.findIndex((id) => ALL_TABLE_COLUMN_IDS.indexOf(id) > canonicalIndex);
  if (insertAt < 0) return [...visible, columnId];
  return [...visible.slice(0, insertAt), columnId, ...visible.slice(insertAt)];
}

export const useExplorerViewStore = create<ExplorerViewState>()(
  persist(
    (set) => ({
      viewMode: 'split',
      tableColumns: [...DEFAULT_TABLE_COLUMNS],
      tableDensity: 'confort',
      tableSort: null,

      setViewMode: (mode) => set({ viewMode: mode }),
      toggleTableColumn: (columnId) =>
        set((state) => {
          if (!ALL_TABLE_COLUMN_IDS.includes(columnId)) return state;
          if (state.tableColumns.includes(columnId)) {
            // Garde : jamais 0 colonne visible.
            if (state.tableColumns.length === 1) return state;
            const tableColumns = state.tableColumns.filter((id) => id !== columnId);
            const tableSort = state.tableSort?.columnId === columnId ? null : state.tableSort;
            return { ...state, tableColumns, tableSort };
          }
          return { ...state, tableColumns: insertAtCanonicalPosition(state.tableColumns, columnId) };
        }),
      moveTableColumn: (columnId, direction) =>
        set((state) => {
          const index = state.tableColumns.indexOf(columnId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= state.tableColumns.length) return state;
          const tableColumns = [...state.tableColumns];
          [tableColumns[index], tableColumns[target]] = [tableColumns[target], tableColumns[index]];
          return { ...state, tableColumns };
        }),
      setTableDensity: (tableDensity) => set({ tableDensity }),
      cycleTableSort: (columnId) =>
        set((state) => {
          if (state.tableSort?.columnId !== columnId) {
            return { ...state, tableSort: { columnId, dir: 'asc' } };
          }
          if (state.tableSort.dir === 'asc') {
            return { ...state, tableSort: { columnId, dir: 'desc' } };
          }
          return { ...state, tableSort: null };
        }),
      resetTableColumns: () =>
        set({ tableColumns: [...DEFAULT_TABLE_COLUMNS], tableSort: null, tableDensity: 'confort' }),
    }),
    {
      name: 'bertel-explorer-view',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        tableColumns: state.tableColumns,
        tableDensity: state.tableDensity,
        tableSort: state.tableSort,
      }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ExplorerViewState> | undefined) ?? {};
        // Colonnes inconnues (renommage futur) filtrées au chargement.
        const tableColumns = Array.isArray(saved.tableColumns)
          ? saved.tableColumns.filter((id) => ALL_TABLE_COLUMN_IDS.includes(id))
          : current.tableColumns;
        return {
          ...current,
          ...saved,
          tableColumns: tableColumns.length > 0 ? tableColumns : [...DEFAULT_TABLE_COLUMNS],
        };
      },
    },
  ),
);

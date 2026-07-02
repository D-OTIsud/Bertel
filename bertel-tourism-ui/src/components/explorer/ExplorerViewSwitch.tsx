'use client';

import { Columns2, List, Map as MapIcon, Table2 } from 'lucide-react';
import { useExplorerViewStore, type ExplorerViewMode } from '../../store/explorer-view-store';
import { cn } from '@/lib/utils';

const MODES: Array<{ key: ExplorerViewMode; label: string; icon: typeof List }> = [
  { key: 'liste', label: 'Liste', icon: List },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'carte', label: 'Carte', icon: MapIcon },
  { key: 'split', label: 'Split', icon: Columns2 },
];

/**
 * D16 — sélecteur de vue de l'Explorer (Liste / Table / Carte / Split).
 * La carte devient UNE vue parmi quatre au lieu du plus grand panneau permanent ;
 * « replier la carte » = passer en Liste/Table (un seul état, pas de flag dédié).
 */
export function ExplorerViewSwitch() {
  const viewMode = useExplorerViewStore((state) => state.viewMode);
  const setViewMode = useExplorerViewStore((state) => state.setViewMode);

  return (
    <div className="view-switch" role="group" aria-label="Mode d'affichage des résultats">
      {MODES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={cn('view-switch__btn', viewMode === key && 'is-on')}
          aria-pressed={viewMode === key}
          onClick={() => setViewMode(key)}
        >
          <Icon size={13} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

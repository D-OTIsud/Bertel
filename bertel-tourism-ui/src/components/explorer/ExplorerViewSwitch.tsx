'use client';

import { useLayoutEffect, useRef, useState } from 'react';
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
 * Vit dans le header h-14 du panneau résultats/carte (plus de barre dédiée) —
 * icônes seules pour tenir dans la colonne liste du mode Split (min 320px),
 * libellés portés par title + aria-label.
 * Motion pass : indicateur glissant mesuré via ref (les boutons sont icon-only,
 * leur largeur dépend du padding — pas une hypothèse de largeur fixe/4).
 */
export function ExplorerViewSwitch() {
  const viewMode = useExplorerViewStore((state) => state.viewMode);
  const setViewMode = useExplorerViewStore((state) => state.setViewMode);
  const groupRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const activeButton = group.querySelector<HTMLButtonElement>('.view-switch__btn.is-on');
    if (!activeButton) return;
    setIndicatorStyle({ left: activeButton.offsetLeft, width: activeButton.offsetWidth });
  }, [viewMode]);

  return (
    <div
      ref={groupRef}
      className="view-switch view-switch--icons view-switch--indicator"
      role="group"
      aria-label="Mode d'affichage des résultats"
    >
      {indicatorStyle && (
        <span
          className="view-switch__indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${indicatorStyle.left}px)`, width: indicatorStyle.width }}
        />
      )}
      {MODES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={cn('view-switch__btn', viewMode === key && 'is-on')}
          aria-pressed={viewMode === key}
          aria-label={label}
          title={label}
          onClick={() => setViewMode(key)}
        >
          <Icon size={14} aria-hidden />
        </button>
      ))}
    </div>
  );
}

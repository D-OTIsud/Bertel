'use client';

import { useRef, useState } from 'react';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import type { DashboardTabKey } from '../../types/dashboard';

const TABS: { key: DashboardTabKey; label: string }[] = [
  { key: 'quality', label: 'Qualité de la base' },
  { key: 'offer', label: 'Offre du territoire' },
  { key: 'activity', label: 'Activité équipe' },
];

export function DashboardTabs() {
  const activeTab = useDashboardFilterStore((s) => s.activeTab);
  const setActiveTab = useDashboardFilterStore((s) => s.setActiveTab);
  const listRef = useRef<HTMLDivElement>(null);
  // D8 — roving tabindex (APG tabs) : UN seul arrêt Tab ; les flèches déplacent le
  // focus, Entrée/Espace active (activation manuelle : chaque panneau déclenche un fetch).
  const [focusKey, setFocusKey] = useState<DashboardTabKey | null>(null);
  const rovingKey = focusKey ?? activeTab;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = TABS.findIndex((tab) => tab.key === rovingKey);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    const key = TABS[next].key;
    setFocusKey(key);
    listRef.current?.querySelector<HTMLElement>(`#dashboard-tab-${key}`)?.focus();
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    // Sortie du tablist : Tab ré-entrera sur l'onglet actif, pas le dernier survolé.
    if (!listRef.current?.contains(event.relatedTarget as Node | null)) {
      setFocusKey(null);
    }
  }

  return (
    <div
      ref={listRef}
      className="dashboard-tabs"
      role="tablist"
      aria-label="Sections du tableau de bord"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          id={`dashboard-tab-${tab.key}`}
          aria-controls={`dashboard-panel-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          tabIndex={rovingKey === tab.key ? 0 : -1}
          className={activeTab === tab.key ? 'dashboard-tab dashboard-tab--active' : 'dashboard-tab'}
          onFocus={() => setFocusKey(tab.key)}
          onClick={() => setActiveTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

'use client';

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

  return (
    <div className="dashboard-tabs" role="tablist" aria-label="Sections du tableau de bord">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={activeTab === tab.key ? 'dashboard-tab dashboard-tab--active' : 'dashboard-tab'}
          onClick={() => setActiveTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

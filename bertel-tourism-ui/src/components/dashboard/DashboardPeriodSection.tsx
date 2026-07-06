'use client';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import { FilterColumnGroup } from '../common/FilterColumnGroup';

const DATE_PRESETS: { label: string; days: number }[] = [
  { label: '7 j', days: 7 }, { label: '30 j', days: 30 }, { label: '3 mois', days: 90 }, { label: '1 an', days: 365 },
];
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoNDaysAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };

export function DashboardPeriodSection() {
  const { updatedAtFrom, updatedAtTo, setPeriod, clearPeriod } = useDashboardFilterStore();
  return (
    <FilterColumnGroup label="Période">
      <div className="space-y-3">
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Préréglages</span>
          <div className="chip-grid">
            {DATE_PRESETS.map(({ label, days }) => {
              const from = isoNDaysAgo(days);
              const active = updatedAtFrom === from && updatedAtTo === isoToday();
              return (
                <button key={label} type="button" className={active ? 'chip chip--active' : 'chip'}
                  onClick={() => (active ? clearPeriod() : setPeriod(from, isoToday()))}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Plage personnalisée</span>
          <div className="dashboard-filter-date-grid">
            <div>
              <label className="facet-title" htmlFor="dash-period-from">Du</label>
              <input id="dash-period-from" type="date" className="dashboard-filter-input"
                value={updatedAtFrom ?? ''} onChange={(e) => setPeriod(e.target.value || null, updatedAtTo)} />
            </div>
            <div>
              <label className="facet-title" htmlFor="dash-period-to">Au</label>
              <input id="dash-period-to" type="date" className="dashboard-filter-input"
                value={updatedAtTo ?? ''} onChange={(e) => setPeriod(updatedAtFrom, e.target.value || null)} />
            </div>
          </div>
        </div>
      </div>
    </FilterColumnGroup>
  );
}

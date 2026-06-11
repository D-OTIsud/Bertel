"use client";

import type { DashboardTypeBreakdown } from '../../types/dashboard';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

interface Props {
  data: DashboardTypeBreakdown;
}

export function TypeBreakdown({ data }: Props) {
  const setFilters = useDashboardFilterStore((s) => s.setFilters);
  const activeTypes = useDashboardFilterStore((s) => s.filters.types) ?? [];

  // Drill-down en toggle — même pattern que CommuneDistribution (communes).
  function handleType(type: Props['data']['rows'][number]['type']) {
    const next = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];
    setFilters({ types: next.length > 0 ? next : undefined });
  }

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Répartition</span>
          <h2>Par type d'objet</h2>
        </div>
        <span className="kpi-panel__total">{data.total.toLocaleString('fr-FR')} fiches</span>
      </div>

      <div className="type-breakdown">
        {data.rows.map((row) => {
          const isActive = activeTypes.includes(row.type);
          return (
            <button
              key={row.type}
              type="button"
              title={`Filtrer : ${row.type}`}
              className={`type-breakdown__row type-breakdown__row--clickable${isActive ? ' type-breakdown__row--active' : ''}`}
              onClick={() => handleType(row.type)}
            >
              <span className="type-breakdown__label">{row.type}</span>
              <div className="type-breakdown__bar-wrap">
                <div
                  className="type-breakdown__bar"
                  style={{ width: `${row.pct_of_total}%` }}
                  title={`${row.pct_of_total} %`}
                />
              </div>
              <span className="type-breakdown__count">{row.count.toLocaleString('fr-FR')}</span>
              <span className="type-breakdown__pct">{row.pct_of_total} %</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

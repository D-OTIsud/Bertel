"use client";

import type { DashboardTypeBreakdown } from '../../types/dashboard';

interface Props {
  data: DashboardTypeBreakdown;
}

export function TypeBreakdown({ data }: Props) {
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
        {data.rows.map((row) => (
          <div key={row.type} className="type-breakdown__row">
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
          </div>
        ))}
      </div>
    </article>
  );
}

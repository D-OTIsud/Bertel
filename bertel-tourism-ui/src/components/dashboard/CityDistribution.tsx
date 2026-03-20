"use client";

import type { DashboardCityDistribution } from '../../types/dashboard';

interface Props {
  data: DashboardCityDistribution;
}

export function CityDistribution({ data }: Props) {
  const maxCount = data.rows[0]?.count ?? 1;

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Géographie</span>
          <h2>Top villes</h2>
        </div>
      </div>

      <ol className="city-list">
        {data.rows.map((row, i) => (
          <li key={row.city} className="city-list__row">
            <span className="city-list__rank">{i + 1}</span>
            <span className="city-list__name">{row.city}</span>
            <div className="city-list__bar-wrap">
              <div
                className="city-list__bar"
                style={{ width: `${(row.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="city-list__count">{row.count}</span>
            {row.delta_30d > 0 && (
              <span className="city-list__delta">+{row.delta_30d}</span>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}

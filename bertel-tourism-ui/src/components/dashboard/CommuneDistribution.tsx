"use client";

import type { DashboardCityDistribution } from '../../types/dashboard';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

// Ordre fixe des communes OTI Sud. "Autres" agrège tout hors-territoire.
const OTI_COMMUNES = ['Le Tampon', 'Entre-Deux', 'Saint-Joseph', 'Saint-Philippe', 'Autres'];

interface Props {
  data: DashboardCityDistribution;
}

export function CommuneDistribution({ data }: Props) {
  const setFilters = useDashboardFilterStore((s) => s.setFilters);
  const cities = useDashboardFilterStore((s) => s.filters.cities);
  const activeCommunes = cities ?? [];

  // Indexer les données reçues par commune
  const byCommune = Object.fromEntries(data.rows.map((r) => [r.city, r]));
  const total = data.rows.reduce((s, r) => s + r.count, 0) || 1;

  function handleCommune(name: string) {
    if (name === 'Autres') return; // "Autres" n'est pas filtrable
    const next = activeCommunes.includes(name)
      ? activeCommunes.filter((c) => c !== name)
      : [...activeCommunes, name];
    setFilters({ cities: next.length > 0 ? next : undefined });
  }

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Territoire OTI Sud</span>
          <h2>Par commune</h2>
        </div>
      </div>

      <ol className="commune-list">
        {OTI_COMMUNES.map((name) => {
          const row = byCommune[name];
          const count = row?.count ?? 0;
          const delta = row?.delta_30d ?? 0;
          const isOthers = name === 'Autres';
          const isActive = !isOthers && activeCommunes.includes(name);

          return (
            <li key={name} className={`commune-list__row${isActive ? ' commune-list__row--active' : ''}`}>
              <button
                type="button"
                className="commune-list__btn"
                onClick={() => handleCommune(name)}
                disabled={isOthers}
              >
                <span className="commune-list__name">{name}</span>
                <div className="commune-list__bar-wrap">
                  <div
                    className="commune-list__bar"
                    style={{ width: `${Math.round((count / total) * 100)}%` }}
                  />
                </div>
                <span className="commune-list__count">{count.toLocaleString('fr-FR')}</span>
                {delta > 0 && (
                  <span className="commune-list__delta">+{delta}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

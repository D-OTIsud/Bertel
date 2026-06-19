"use client";

import type { DashboardCompleteness } from '../../types/dashboard';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

interface Props {
  data: DashboardCompleteness;
}

/** Clés d'essentiels (api.get_dashboard_completeness) → libellés FR. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nom',
  subcategory: 'Sous-catégorie',
  location: 'Lieu',
  contact: 'Contact',
  description: 'Description',
  photos: 'Photos',
  type_block: 'Équipements / type',
  tags: 'Tags',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function CompleteBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--warning)' : '#c85c48';
  return (
    <div className="rate-bar">
      <div className="rate-bar__fill" style={{ width: `${pct}%`, background: color }} />
      <span className="rate-bar__label">{pct} %</span>
    </div>
  );
}

export function CompletenessTable({ data }: Props) {
  const setFilters = useDashboardFilterStore((s) => s.setFilters);
  const activeTypes = useDashboardFilterStore((s) => s.filters.types) ?? [];

  // Drill-down en toggle — même pattern que ActualisationTable / CommuneDistribution.
  function handleType(type: Props['data']['rows'][number]['type']) {
    const next = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];
    setFilters({ types: next.length > 0 ? next : undefined });
  }

  return (
    <article className="kpi-panel kpi-panel--wide">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Qualité</span>
          <h2>Complétude perçue visiteur</h2>
          <p>Part des fiches qui ne paraissent jamais incomplètes (tous les essentiels présents).</p>
        </div>
      </div>

      <div className="actualisation-table-wrap">
        <table className="actualisation-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Total</th>
              <th>Complètes</th>
              <th>Richesse moy.</th>
              <th>À compléter</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.type}>
                <td className="actualisation-table__type">
                  <button
                    type="button"
                    className={`actualisation-table__type-btn${activeTypes.includes(row.type) ? ' actualisation-table__type-btn--active' : ''}`}
                    title={`Filtrer : ${row.type}`}
                    onClick={() => handleType(row.type)}
                    aria-pressed={activeTypes.includes(row.type)}
                  >
                    {row.type}
                  </button>
                </td>
                <td>{row.total}</td>
                <td className="actualisation-table__rate-cell">
                  <CompleteBar pct={row.complete_pct} />
                </td>
                <td>{row.avg_score} %</td>
                <td>
                  {row.missing_top_field ? (
                    <span className="pill-mini">{fieldLabel(row.missing_top_field)}</span>
                  ) : (
                    <span className="actualisation-table__ok">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

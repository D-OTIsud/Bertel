"use client";

import type { DashboardCompleteness } from '../../types/dashboard';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import { meterZone } from './meter-zone';
import { TypePill } from './TypePill';

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

/** Jauge de complétude (richesse perçue visiteur 0–100) — D7 : couleur + zone écrite (WCAG 1.4.1). */
function Meter({ score, completePct }: { score: number; completePct: number }) {
  const zone = meterZone(score, 50);
  return (
    <span
      className="meter-cell"
      role="img"
      aria-label={`Complétude ${score} % — ${zone.label} ; ${completePct} % des fiches complètes`}
      title={`${completePct} % des fiches complètes`}
    >
      <span className="meter" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${score}%`, background: zone.color }} />
      </span>
      <span className="meter__pct" aria-hidden="true">
        {score} %
      </span>
      <span className="meter__zone" style={{ color: zone.color }} aria-hidden="true">
        {zone.label}
      </span>
    </span>
  );
}

interface Props {
  data: DashboardCompleteness;
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
          <h2>Complétude par type</h2>
          <p>Richesse perçue visiteur et premier essentiel manquant, par famille.</p>
        </div>
      </div>

      <div className="actualisation-table-wrap">
        <table className="actualisation-table completeness-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Fiches</th>
              <th className="completeness-table__meter-col">Complétude</th>
              <th>Champ manquant n°1</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.type}>
                <td className="actualisation-table__type">
                  <button
                    type="button"
                    className={`type-cell-btn${activeTypes.includes(row.type) ? ' type-cell-btn--active' : ''}`}
                    title={`Filtrer : ${row.type}`}
                    onClick={() => handleType(row.type)}
                    aria-pressed={activeTypes.includes(row.type)}
                  >
                    <TypePill type={row.type} />
                  </button>
                </td>
                <td>{row.total.toLocaleString('fr-FR')}</td>
                <td className="completeness-table__meter-col">
                  <Meter score={row.avg_score} completePct={row.complete_pct} />
                </td>
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

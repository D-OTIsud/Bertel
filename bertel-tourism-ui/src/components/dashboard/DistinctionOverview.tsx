"use client";

import type { DashboardDistinctionOverview, DistinctionDisplayGroup, DistinctionSchemeRow } from '../../types/dashboard';

interface Props {
  data: DashboardDistinctionOverview;
}

const GROUP_LABELS: Record<DistinctionDisplayGroup, string> = {
  official_classification: 'Classements officiels',
  quality_label:           'Labels et marques qualité',
  environmental_label:     'Labels environnementaux',
  accessibility_label:     'Accessibilité',
};

const GROUP_ORDER: DistinctionDisplayGroup[] = [
  'official_classification',
  'quality_label',
  'environmental_label',
  'accessibility_label',
];

export function DistinctionOverview({ data }: Props) {
  // Group rows by display_group; ungrouped rows go to a fallback bucket
  const grouped = new Map<string, DistinctionSchemeRow[]>();
  for (const row of data.by_scheme) {
    const key = row.display_group ?? '__other__';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  function groupTotal(key: string): number {
    return grouped.get(key)?.reduce((s, r) => s + r.count, 0) || 1;
  }

  const renderRow = (row: DistinctionSchemeRow, denominator: number) => (
    <li key={row.scheme_code} className="distinction-overview__row">
      <span className="distinction-overview__name">{row.scheme_name}</span>
      <div className="distinction-overview__bar-wrap">
        <div
          className="distinction-overview__bar"
          style={{ width: `${Math.round((row.count / denominator) * 100)}%` }}
        />
      </div>
      <span className="distinction-overview__count">
        {row.count.toLocaleString('fr-FR')}
      </span>
    </li>
  );

  return (
    <article className="kpi-panel distinction-overview">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Qualifications & labels</span>
          <h2>Distinctions</h2>
        </div>
      </div>

      <div className="distinction-overview__hero">
        <strong className="distinction-overview__pct">{data.distinction_pct} %</strong>
        <span className="distinction-overview__sub">
          {data.with_distinction.toLocaleString('fr-FR')} objets distingués
          {' / '}
          {data.total_scoped.toLocaleString('fr-FR')} au total
        </span>
      </div>

      <div className="distinction-overview__groups">
        {GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => {
          const denom = groupTotal(g);
          return (
            <section key={g} className="distinction-overview__group">
              <h3 className="distinction-overview__group-label">{GROUP_LABELS[g]}</h3>
              <ol className="distinction-overview__list">
                {grouped.get(g)!.map((row) => renderRow(row, denom))}
              </ol>
            </section>
          );
        })}
        {grouped.has('__other__') && (
          <section className="distinction-overview__group">
            <h3 className="distinction-overview__group-label">Autres</h3>
            <ol className="distinction-overview__list">
              {grouped.get('__other__')!.map((row) => renderRow(row, groupTotal('__other__')))}
            </ol>
          </section>
        )}
      </div>
    </article>
  );
}

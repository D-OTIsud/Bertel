"use client";

import type { DashboardScorecards } from '../../types/dashboard';

interface Props {
  data: DashboardScorecards;
}

export function ScorecardStrip({ data }: Props) {
  const deltaSign = data.delta_pct !== null && data.delta_pct >= 0 ? '+' : '';
  const deltaClass =
    data.delta_pct === null
      ? ''
      : data.delta_pct >= 0
      ? 'scorecard-card__delta--up'
      : 'scorecard-card__delta--down';

  return (
    <div className="scorecard-strip">
      <article className="scorecard-card scorecard-card--highlight">
        <span className="scorecard-card__label">Total fiches</span>
        <strong className="scorecard-card__value">{data.total.toLocaleString('fr-FR')}</strong>
      </article>

      <article className="scorecard-card">
        <span className="scorecard-card__label">Publiées</span>
        <strong className="scorecard-card__value">{data.published.toLocaleString('fr-FR')}</strong>
        <span className="scorecard-card__sub">{data.published_pct} %</span>
      </article>

      <article className="scorecard-card">
        <span className="scorecard-card__label">Créées (30 j)</span>
        <strong className="scorecard-card__value">{data.delta_30d}</strong>
        {data.delta_pct !== null && (
          <span className={`scorecard-card__delta ${deltaClass}`}>
            {deltaSign}{data.delta_pct} % vs période préc.
          </span>
        )}
      </article>

      <article className="scorecard-card scorecard-card--warning">
        <span className="scorecard-card__label">Modifications en attente</span>
        <strong className="scorecard-card__value">{data.pending_changes}</strong>
      </article>
    </div>
  );
}

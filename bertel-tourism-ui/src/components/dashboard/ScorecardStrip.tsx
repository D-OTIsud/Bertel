"use client";

import type { DashboardScorecards } from '../../types/dashboard';

interface Props {
  data: DashboardScorecards;
}

export function ScorecardStrip({ data }: Props) {
  const deltaSign = data.delta_pct !== null && data.delta_pct >= 0 ? '+' : '';
  const deltaClass =
    data.delta_pct === null ? ''
    : data.delta_pct >= 0 ? 'scorecard-card__delta--up'
    : 'scorecard-card__delta--down';

  return (
    <div className="scorecard-strip">

      {/* 1 — Total inscrits SIT */}
      <article className="scorecard-card scorecard-card--highlight">
        <span className="scorecard-card__label">Inscrits SIT</span>
        <strong className="scorecard-card__value">{data.total.toLocaleString('fr-FR')}</strong>
      </article>

      {/* 2 — Publiés */}
      <article className="scorecard-card">
        <span className="scorecard-card__label">Publiés</span>
        <strong className="scorecard-card__value">{data.published.toLocaleString('fr-FR')}</strong>
        <span className="scorecard-card__sub">{data.published_pct} %</span>
      </article>

      {/* 3 — Demandes en cours */}
      <article className={`scorecard-card${data.pending_changes > 0 ? ' scorecard-card--warning' : ''}`}>
        <span className="scorecard-card__label">Demandes en cours</span>
        <strong className="scorecard-card__value">{data.pending_changes}</strong>
      </article>

      {/* 4 — Nouvelles fiches 30 j */}
      <article className="scorecard-card">
        <span className="scorecard-card__label">Nouvelles fiches (30 j)</span>
        <strong className="scorecard-card__value">{data.delta_30d}</strong>
        {data.delta_pct !== null && (
          <span className={`scorecard-card__delta ${deltaClass}`}>
            {deltaSign}{data.delta_pct} % vs période préc.
          </span>
        )}
      </article>

      {/* 5 — Délai moyen de traitement */}
      <article className="scorecard-card">
        <span className="scorecard-card__label">Délai moyen traitement</span>
        <strong className="scorecard-card__value">
          {data.avg_processing_days != null
            ? `${data.avg_processing_days} j`
            : '—'}
        </strong>
      </article>

      {/* 6 — Remplissage BD — NULL Phase 2A, calculé en Phase 2C */}
      <article className="scorecard-card">
        <span className="scorecard-card__label">Remplissage BD</span>
        <strong className="scorecard-card__value">
          {data.avg_completeness != null ? `${data.avg_completeness} %` : '—'}
        </strong>
        <span className="scorecard-card__sub">Phase 2C</span>
      </article>

    </div>
  );
}

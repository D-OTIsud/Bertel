"use client";

import type { DashboardActualisation } from '../../types/dashboard';

interface Props {
  data: DashboardActualisation;
}

function RateBar({ rate }: { rate: number }) {
  const color =
    rate >= 80 ? 'var(--teal)' : rate >= 60 ? 'var(--warning)' : '#c85c48';
  return (
    <div className="rate-bar">
      <div className="rate-bar__fill" style={{ width: `${rate}%`, background: color }} />
      <span className="rate-bar__label">{rate} %</span>
    </div>
  );
}

export function ActualisationTable({ data }: Props) {
  return (
    <article className="kpi-panel kpi-panel--wide">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Fraîcheur</span>
          <h2>Taux d'actualisation</h2>
          <p>Seuil : {data.threshold_days} jours</p>
        </div>
      </div>

      <div className="actualisation-table-wrap">
        <table className="actualisation-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Total</th>
              <th>À jour</th>
              <th>À revoir</th>
              <th>Obsolète</th>
              <th>Taux</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.type}>
                <td className="actualisation-table__type">{row.type}</td>
                <td>{row.total}</td>
                <td className="actualisation-table__ok">{row.up_to_date}</td>
                <td className="actualisation-table__warn">{row.to_review}</td>
                <td className="actualisation-table__bad">{row.stale}</td>
                <td className="actualisation-table__rate-cell">
                  <RateBar rate={row.rate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

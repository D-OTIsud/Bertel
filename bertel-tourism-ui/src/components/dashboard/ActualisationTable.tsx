"use client";

import { useMemo } from 'react';
import type { DashboardActualisation } from '../../types/dashboard';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { activeDrilldownTypes, toggleDrilldownType } from '../../lib/dashboard-type-drilldown';
import { meterZone } from './meter-zone';
import { resolveTypeLabel } from '../../utils/labels';

interface Props {
  data: DashboardActualisation;
}

/** D7 : couleur + zone écrite (WCAG 1.4.1) ; tokens à la place des hex. */
function RateBar({ rate }: { rate: number }) {
  const zone = meterZone(rate, 60);
  return (
    <div className="rate-bar" role="img" aria-label={`Taux d'actualisation ${rate} % — ${zone.label}`}>
      <div className="rate-bar__fill" style={{ width: `${rate}%`, background: zone.color }} aria-hidden="true" />
      <span className="rate-bar__label" aria-hidden="true">
        {rate} %
      </span>
      <span className="rate-bar__zone" style={{ color: zone.color }} aria-hidden="true">
        {zone.label}
      </span>
    </div>
  );
}

export function ActualisationTable({ data }: Props) {
  const selectedBuckets = useDashboardExplorerStore((s) => s.selectedBuckets);
  const hot = useDashboardExplorerStore((s) => s.hot);
  const vis = useDashboardExplorerStore((s) => s.vis);
  const srv = useDashboardExplorerStore((s) => s.srv);
  // `activeDrilldownTypes` only reads selectedBuckets + hot/vis/srv subtypes, so these deps are complete.
  const activeTypes = useMemo(
    () => activeDrilldownTypes(useDashboardExplorerStore.getState()),
    [selectedBuckets, hot, vis, srv],
  );

  // Drill-down en toggle — même pattern que CommuneDistribution (communes).
  function handleType(type: Props['data']['rows'][number]['type']) {
    toggleDrilldownType(useDashboardExplorerStore, type);
  }

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
                <td className="actualisation-table__type">
                  <button
                    type="button"
                    className={`actualisation-table__type-btn${activeTypes.includes(row.type) ? ' actualisation-table__type-btn--active' : ''}`}
                    title={`Filtrer : ${resolveTypeLabel(row.type)}`}
                    onClick={() => handleType(row.type)}
                    aria-pressed={activeTypes.includes(row.type)}
                  >
                    {resolveTypeLabel(row.type)}
                  </button>
                </td>
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

"use client";

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { DashboardCompleteness, CompletenessRow } from '../../types/dashboard';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { activeDrilldownTypes, toggleDrilldownType } from '../../lib/dashboard-type-drilldown';
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
      aria-label={`Remplissage ${score} % — ${zone.label} ; ${completePct} % des fiches complètes`}
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

/** Fiches sous 80 pour un type — la donnée arrive déjà dans la réponse, on ne la refetch pas. */
function BelowList({ rows }: { rows: CompletenessRow['below_80'] }) {
  return (
    <div className="below-list">
      <span className="below-list__head">
        {rows.length} fiche{rows.length > 1 ? 's' : ''} sous 80 % · triées par score croissant
      </span>
      <ul className="below-list__items">
        {[...rows]
          .sort((a, b) => a.score - b.score)
          .map((fiche) => (
            <li key={fiche.id} className="below-item">
              <span className="below-item__score" style={{ color: meterZone(fiche.score, 50).color }}>
                {fiche.score}
              </span>
              <span className="below-item__name">{fiche.name}</span>
              <span className="below-item__missing">
                {fiche.missing_fields.map((field) => (
                  <span key={field} className="below-item__tag">
                    {fieldLabel(field)}
                  </span>
                ))}
              </span>
              <Link href={`/objects/${fiche.id}/edit`} className="below-item__edit">
                Corriger
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}

interface Props {
  data: DashboardCompleteness;
}

export function CompletenessTable({ data }: Props) {
  const selectedBuckets = useDashboardExplorerStore((s) => s.selectedBuckets);
  const hot = useDashboardExplorerStore((s) => s.hot);
  const vis = useDashboardExplorerStore((s) => s.vis);
  const srv = useDashboardExplorerStore((s) => s.srv);
  // `activeDrilldownTypes` only reads selectedBuckets + hot/vis/srv subtypes, so these deps are complete.
  const activeTypes = useMemo(
    () => activeDrilldownTypes(useDashboardExplorerStore.getState()),
    [selectedBuckets, hot, vis, srv],
  );

  // Une seule ligne dépliée à la fois : le tableau reste lisible et la comparaison
  // entre types garde du sens (préférence produit : vues compactes, détail à la demande).
  const [openType, setOpenType] = useState<string | null>(null);

  // Drill-down en toggle — même pattern que ActualisationTable / CommuneDistribution.
  function handleType(type: Props['data']['rows'][number]['type']) {
    toggleDrilldownType(useDashboardExplorerStore, type);
  }

  return (
    <article className="kpi-panel kpi-panel--wide">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Qualité</span>
          <h2>Remplissage par type</h2>
          <p>Richesse perçue visiteur et premier essentiel manquant, par famille.</p>
        </div>
      </div>

      <div className="actualisation-table-wrap">
        <table className="actualisation-table completeness-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Fiches</th>
              <th className="completeness-table__meter-col">Remplissage</th>
              <th>Champ manquant n°1</th>
              <th>À corriger</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <Fragment key={row.type}>
                <tr>
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
                  <td>
                    {row.below_80.length > 0 ? (
                      <button
                        type="button"
                        className="below-toggle"
                        aria-expanded={openType === row.type}
                        onClick={() => setOpenType(openType === row.type ? null : row.type)}
                      >
                        <ChevronRight aria-hidden="true" />
                        {row.below_80.length} fiche{row.below_80.length > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="actualisation-table__ok">—</span>
                    )}
                  </td>
                </tr>
                {openType === row.type && (
                  <tr className="below-row">
                    <td colSpan={5}>
                      <BelowList rows={row.below_80} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

'use client';

import type { MetricSnapshotPoint } from '../../types/metric-snapshot';

interface Props {
  points: MetricSnapshotPoint[];
  /** Libellé de la métrique — sert l'accessibilité et l'infobulle. */
  label: string;
  color?: string;
  unit?: string;
  decimals?: number;
  height?: number;
}

const W = 900;
const PAD = { left: 52, right: 16, top: 14, bottom: 26 };

function frMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Courbe SVG maison. Le projet n'embarque aucune librairie de graphique et n'en
 * ajoute pas : la jauge .meter et la barre .rate-bar sont déjà dessinées à la main.
 *
 * L'axe vertical est ADAPTATIF (amplitude réelle + 45 % de marge). Les séries du
 * registre sont volontairement peu amples — la complétude bouge de 92,3 à 91,4 sur
 * 73 jours — et un axe partant de zéro les afficherait comme un trait plat.
 */
export function TimeseriesChart({
  points,
  label,
  color = 'var(--teal)',
  unit = '',
  decimals = 0,
  height = 210,
}: Props) {
  if (points.length === 0) {
    return <p className="dashboard-widget-state">Aucun relevé sur cette période.</p>;
  }

  const iw = W - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Série constante : amplitude 1 par défaut, sinon la division rendrait NaN.
  const spread = rawMax - rawMin || 1;
  const min = rawMin - spread * 0.45;
  const max = rawMax + spread * 0.45;

  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v: number) => PAD.top + ih * (1 - (v - min) / (max - min));

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `M${PAD.left},${PAD.top + ih} L${line.split(' ').join(' L')} L${PAD.left + iw},${PAD.top + ih} Z`;

  const gridValues = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const last = points[points.length - 1];

  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`${label} : ${points.length} relevés, de ${frMonth(points[0].bucket_date)} à ${frMonth(last.bucket_date)}`}
      className="timeseries-chart"
    >
      <path d={area} fill={color} fillOpacity="0.10" />
      {gridValues.map((gv) => (
        <g key={gv}>
          <line x1={PAD.left} y1={y(gv)} x2={PAD.left + iw} y2={y(gv)} className="timeseries-chart__grid" />
          <text x={PAD.left - 9} y={y(gv) + 4} textAnchor="end" className="timeseries-chart__axis">
            {gv.toFixed(decimals).replace('.', ',')}
            {unit}
          </text>
        </g>
      ))}
      {ticks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 7}
          textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
          className="timeseries-chart__axis"
        >
          {frMonth(points[i].bucket_date)}
        </text>
      ))}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2.5" />
    </svg>
  );
}

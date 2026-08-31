'use client';

/**
 * Histogramme SVG maison, une à deux séries, **partant de zéro**.
 *
 * POURQUOI PAS `TimeseriesChart`. Celui-ci recule sa borne basse de 45 % de l'amplitude
 * (`min = rawMin - spread * 0.45`), un choix DÉLIBÉRÉ et documenté pour les séries de
 * complétude, qui bougent de 92,3 à 91,4 sur 73 jours et s'afficheraient sinon comme un trait
 * plat. Ici on compte des JOURS et des DEMANDES : un axe qui ne part pas de zéro rendrait une
 * semaine à 1 quasi invisible à côté d'une semaine à 3, c'est-à-dire mentirait sur les
 * proportions. Son état vide ne se déclenche par ailleurs que sur `points.length === 0`,
 * jamais sur « douze mois tous à zéro », et son axe X formate en jour + mois court.
 *
 * Le projet n'embarque aucune librairie de graphique et n'en ajoute pas : la jauge `.meter`,
 * la barre `.rate-bar` et `TimeseriesChart` sont déjà dessinées à la main.
 */

const W = 900;
const PAD = { left: 44, right: 12, top: 14, bottom: 26 };

export interface BarSeriesPoint {
  /** Étiquette d'axe, déjà formatée par l'appelant — ce composant ne sait rien des dates. */
  label: string;
  /** Une valeur par série déclarée, dans le même ordre. */
  values: number[];
}

export interface BarSeriesDef {
  key: string;
  label: string;
  color: string;
}

export function BarSeriesChart({
  bars,
  series,
  ariaLabel,
  emptyLabel = 'Aucune donnée sur cette période.',
  height = 210,
}: {
  bars: BarSeriesPoint[];
  series: BarSeriesDef[];
  /** Description complète du graphique — il est annoncé comme une image. */
  ariaLabel: string;
  emptyLabel?: string;
  height?: number;
}) {
  if (bars.length === 0) {
    return <p className="dashboard-widget-state">{emptyLabel}</p>;
  }

  const iw = W - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;

  // Borne haute : le maximum réel, jamais moins de 1 — une série entièrement à zéro
  // diviserait sinon par zéro et rendrait des hauteurs NaN.
  const max = Math.max(1, ...bars.flatMap((b) => b.values));
  const slot = iw / bars.length;
  const gap = Math.min(10, slot * 0.22);
  const barW = Math.max(2, (slot - gap) / series.length);

  const gridValues = [0, 1, 2, 3].map((k) => (max * k) / 3);

  // Trois graduations d'axe X seulement : au-delà, elles se chevauchent sur douze points.
  const ticks = [0, Math.floor((bars.length - 1) / 2), bars.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      className="bar-series"
    >
      {gridValues.map((gv) => (
        <g key={gv}>
          <line
            x1={PAD.left}
            y1={PAD.top + ih * (1 - gv / max)}
            x2={PAD.left + iw}
            y2={PAD.top + ih * (1 - gv / max)}
            className="timeseries-chart__grid"
          />
          <text
            x={PAD.left - 9}
            y={PAD.top + ih * (1 - gv / max) + 4}
            textAnchor="end"
            className="timeseries-chart__axis"
          >
            {Math.round(gv)}
          </text>
        </g>
      ))}

      {bars.map((bar, i) =>
        series.map((serie, s) => {
          const value = bar.values[s] ?? 0;
          const h = ih * (value / max);
          return (
            <rect
              key={`${bar.label}-${serie.key}`}
              className="bar-series__bar"
              x={PAD.left + slot * i + gap / 2 + barW * s}
              y={PAD.top + ih - h}
              width={barW}
              height={h}
              fill={serie.color}
              rx="2"
            >
              {/* La couleur n'est pas une information accessible : chaque barre porte son
                  couple (période, série, valeur) en clair. */}
              <title>{`${bar.label} — ${serie.label} : ${value}`}</title>
            </rect>
          );
        }),
      )}

      {ticks.map((i) => (
        <text
          key={i}
          x={PAD.left + slot * i + slot / 2}
          y={height - 7}
          textAnchor={i === 0 ? 'start' : i === bars.length - 1 ? 'end' : 'middle'}
          className="timeseries-chart__axis"
        >
          {bars[i].label}
        </text>
      ))}
    </svg>
  );
}

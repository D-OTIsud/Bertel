'use client';

import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useMetricSnapshotSeries } from '../../hooks/useMetricSnapshotSeries';
import { TimeseriesChart } from './TimeseriesChart';
import { WidgetFrame } from './WidgetFrame';
import type { MetricSnapshotPoint } from '../../types/metric-snapshot';

interface MetricOption {
  key: string;
  label: string;
  unit?: string;
  decimals?: number;
  color?: string;
}

interface Props {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: MetricOption[];
  scope: 'global' | 'type' | 'category' | 'commune' | 'status';
  /** false tant que l'onglet porteur n'est pas affiché — évite une requête inutile. */
  enabled: boolean;
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * Widget de série temporelle lisant le registre metric_snapshot.
 *
 * Deux mentions d'honnêteté sont OBLIGATOIRES et ne doivent pas être retirées :
 * la série est globale (elle ne suit pas le panneau de filtres, contrairement à
 * tout le reste de l'écran), et l'historique est jeune (une courbe presque plate
 * est la réalité du corpus, pas une panne d'affichage).
 */
export function TimeseriesWidget({ eyebrow, title, subtitle, metrics, scope, enabled }: Props) {
  const [active, setActive] = useState(metrics[0].key);
  const metric = metrics.find((m) => m.key === active) ?? metrics[0];

  const query = useMetricSnapshotSeries({ metricKey: metric.key, scope, grain: 'week' }, enabled);

  // Chaque métrique porte sa PROPRE clé de requête : basculer le sélecteur retombe
  // donc en `isPending` le temps du fetch. Sans cette mémoire, WidgetFrame remplacerait
  // toute la carte — sélecteur compris — par un squelette à chaque clic, ce qui referme
  // le sélecteur qu'on vient d'ouvrir. On garde le dernier relevé connu à l'écran
  // (lecture stale-while-revalidate) et on ne montre le squelette qu'au tout premier
  // chargement du widget.
  const lastPointsRef = useRef<MetricSnapshotPoint[]>([]);
  if (query.data) lastPointsRef.current = query.data.points;
  const hasLoadedOnceRef = useRef(false);
  if (query.data) hasLoadedOnceRef.current = true;

  const points = query.data?.points ?? lastPointsRef.current;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.value - first.value : 0;

  return (
    <WidgetFrame
      isPending={query.isPending && enabled && !hasLoadedOnceRef.current}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <article className="kpi-panel kpi-panel--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {metrics.length > 1 && (
            <div className="timeseries-metrics" role="group" aria-label="Métrique affichée">
              {metrics.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="timeseries-metrics__btn"
                  aria-pressed={m.key === active}
                  onClick={() => setActive(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {last && (
          <div className="timeseries-value">
            <strong>
              {nf.format(last.value)}
              {metric.unit ?? ''}
            </strong>
            <span>
              {delta >= 0 ? '+' : '−'}
              {nf.format(Math.abs(delta))}
              {metric.unit ?? ''} depuis le premier relevé
            </span>
          </div>
        )}

        <TimeseriesChart
          points={points}
          label={metric.label}
          unit={metric.unit ?? ''}
          decimals={metric.decimals ?? 0}
          color={metric.color ?? 'var(--teal)'}
        />

        <div className="timeseries-notes">
          <span className="timeseries-note">
            <Info aria-hidden="true" />
            Série <strong>globale</strong> : elle n’obéit pas au panneau de filtres.
          </span>
          <span className="timeseries-note">
            <Info aria-hidden="true" />
            {points.length} relevé{points.length > 1 ? 's' : ''} d’historique — la comparaison
            année sur année s’activera en 2027.
          </span>
        </div>
      </article>
    </WidgetFrame>
  );
}

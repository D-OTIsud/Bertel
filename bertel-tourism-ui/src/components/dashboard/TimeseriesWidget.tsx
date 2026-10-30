'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { useMetricSnapshotSeries } from '../../hooks/useMetricSnapshotSeries';
import { TimeseriesChart } from './TimeseriesChart';
import { WidgetFrame } from './WidgetFrame';

interface MetricOption {
  key: string;
  label: string;
  unit?: string;
  decimals?: number;
  color?: string;
}

interface Props {
  providerOnly?: boolean;
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
 * Durée réellement couverte entre le premier et le dernier relevé source.
 * Les dates de buckets hebdomadaires et l'horloge du navigateur ne mesurent
 * pas cette durée : un relevé du vendredi appartient au bucket du lundi.
 */
function historyDepthDays(firstDate: string, lastDate: string): number | null {
  const start = Date.parse(`${firstDate}T00:00:00Z`);
  const end = Date.parse(`${lastDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Widget de série temporelle lisant le registre metric_snapshot.
 *
 * Deux mentions d'honnêteté sont OBLIGATOIRES et ne doivent pas être retirées :
 * la série est globale (elle ne suit pas le panneau de filtres, contrairement à
 * tout le reste de l'écran), et l'historique est jeune (une courbe presque plate
 * est la réalité du corpus, pas une panne d'affichage).
 */
export function TimeseriesWidget({ eyebrow, title, subtitle, metrics, scope, enabled, providerOnly = false }: Props) {
  const [active, setActive] = useState(metrics[0].key);
  const metric = metrics.find((m) => m.key === active) ?? metrics[0];

  const query = useMetricSnapshotSeries({ metricKey: metric.key, scope, grain: 'week' }, enabled && !providerOnly);

  // Chaque métrique porte sa PROPRE clé de requête : basculer le sélecteur
  // changerait donc `status` en "pending" le temps du fetch si on ne faisait
  // rien — WidgetFrame remplacerait toute la carte, sélecteur compris, par un
  // squelette à chaque clic. Le hook fixe déjà ça via `placeholderData:
  // keepPreviousData` : `isPending` ne redevient vrai qu'au tout premier
  // chargement du widget, donc `WidgetFrame` peut le lire tel quel.
  //
  // Mais garder l'ancien relevé affiché pendant le fetch a un coût : tant que
  // `query.isPlaceholderData` est vrai, les points en main sont ceux de
  // l'ANCIENNE métrique alors que `metric` (libellé, unité, décimales) a déjà
  // basculé sur la nouvelle. On ne montre donc la valeur courante et la
  // courbe QUE lorsque les points appartiennent bien à la métrique active —
  // sinon on afficherait un pourcentage sous une unité "fiches", ou l'inverse.
  const showMetricData = !query.isPlaceholderData;
  const points = showMetricData ? (query.data?.points ?? []) : [];
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.value - first.value : 0;
  const historyDays = first && query.data?.firstSnapshotDate && query.data?.lastSnapshotDate
    ? historyDepthDays(query.data.firstSnapshotDate, query.data.lastSnapshotDate)
    : null;

  if (providerOnly) {
    return (
      <article className="kpi-panel kpi-panel--wide">
        <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>
        <p className="text-[13px] text-ink-3">Historique indisponible pour ce périmètre : les relevés passés ne distinguent pas les objets rattachés à un prestataire.</p>
      </article>
    );
  }

  return (
    <WidgetFrame
      isPending={query.isPending && enabled}
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

        {showMetricData ? (
          <>
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
              {historyDays !== null && (
                <span className="timeseries-note">
                  <Info aria-hidden="true" />
                  {historyDays === 0
                    ? 'Premier relevé disponible — l’historique débute.'
                    : `${historyDays} jour${historyDays > 1 ? 's' : ''} d’historique — la comparaison année sur année s’activera en 2027.`}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="dashboard-widget-state" aria-live="polite">
            Chargement de {metric.label}…
          </p>
        )}
      </article>
    </WidgetFrame>
  );
}

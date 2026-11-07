/** Granularité de lecture du registre metric_snapshot. */
export type MetricGrain = 'day' | 'week' | 'month';

/** Un point de série : valeur au dernier relevé du bucket (stock), pas une somme. */
export interface MetricSnapshotPoint {
  /** ISO date, début du bucket */
  bucket_date: string;
  value: number;
  /** Dénominateur du relevé quand il en porte un (ex. total de fiches). Sinon null. */
  denominator: number | null;
}

export interface MetricSnapshotSeries {
  points: MetricSnapshotPoint[];
  /** Dates des relevés quotidiens sources, indépendantes des buckets d'affichage. */
  firstSnapshotDate: string | null;
  lastSnapshotDate: string | null;
}

export interface MetricSeriesArgs {
  metricKey: string;
  scope: 'global' | 'type' | 'category' | 'commune' | 'status';
  scopeKey?: string;
  from?: string;
  to?: string;
  grain?: MetricGrain;
}

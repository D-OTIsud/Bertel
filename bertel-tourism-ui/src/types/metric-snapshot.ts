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
}

export interface MetricSeriesArgs {
  metricKey: string;
  scope: 'global' | 'type' | 'category' | 'commune' | 'status';
  scopeKey?: string;
  from?: string;
  to?: string;
  grain?: MetricGrain;
}

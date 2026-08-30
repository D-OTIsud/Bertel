import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { MetricSeriesArgs, MetricSnapshotSeries } from '../types/metric-snapshot';

function requireClient() {
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configuré. Activez le mode demo pour utiliser les données mock.');
  }
  return client;
}

/** Ligne brute telle que rendue par api.get_metric_snapshot_series côté serveur. */
interface MetricSnapshotRow {
  bucket: string;
  value: number;
  denominator: number | null;
}

/**
 * La RPC rend un tableau de lignes NU (colonne `bucket`), pas une enveloppe
 * `{ points: [...] }`. Le contrat client garde `bucket_date` (nom explicite) :
 * cet adaptateur est le seul endroit qui fait la conversion.
 */
function toSeries(rows: MetricSnapshotRow[] | null): MetricSnapshotSeries {
  if (!rows) return { points: [] };
  return {
    points: rows.map((row) => ({
      bucket_date: row.bucket,
      value: row.value,
      denominator: row.denominator,
    })),
  };
}

/**
 * Lit le registre metric_snapshot (relevé quotidien figé depuis le 19/06/2026).
 *
 * En mode démo la série est VIDE, pas simulée : le principe « real DB data » veut
 * qu'un widget sans données affiche son état vide plutôt qu'une courbe inventée.
 */
export async function getMetricSnapshotSeries(args: MetricSeriesArgs): Promise<MetricSnapshotSeries> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) return { points: [] };

  const client = requireClient();
  const { data, error } = await client.schema('api').rpc('get_metric_snapshot_series', {
    p_metric_key: args.metricKey,
    p_scope: args.scope,
    p_scope_key: args.scopeKey ?? '',
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    p_grain: args.grain ?? 'month',
  });

  if (error) throw error;
  return toSeries(data as MetricSnapshotRow[] | null);
}

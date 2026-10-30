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

interface MetricSnapshotPayload {
  points: MetricSnapshotRow[];
  first_snapshot_date: string | null;
  last_snapshot_date: string | null;
}

/** L'enveloppe ajoute les dates sources sans modifier l'ancienne RPC tabulaire. */
function toSeries(data: MetricSnapshotPayload | null): MetricSnapshotSeries {
  return {
    points: (data?.points ?? []).map((row) => ({
      bucket_date: row.bucket,
      value: row.value,
      denominator: row.denominator,
    })),
    firstSnapshotDate: data?.first_snapshot_date ?? null,
    lastSnapshotDate: data?.last_snapshot_date ?? null,
  };
}

/**
 * Lit les relevés quotidiens du périmètre réel/test de l'utilisateur.
 * Les archives de remplissage vérifiées sont réintégrées au réel. Les autres
 * agrégats historiques non segmentés restent archivés hors de ces séries.
 *
 * En mode démo la série est VIDE, pas simulée : le principe « real DB data » veut
 * qu'un widget sans données affiche son état vide plutôt qu'une courbe inventée.
 */
export async function getMetricSnapshotSeries(args: MetricSeriesArgs): Promise<MetricSnapshotSeries> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) return { points: [], firstSnapshotDate: null, lastSnapshotDate: null };

  const client = requireClient();
  const { data, error } = await client.schema('api').rpc('get_metric_snapshot_series_with_bounds', {
    p_metric_key: args.metricKey,
    p_scope: args.scope,
    p_scope_key: args.scopeKey ?? '',
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    p_grain: args.grain ?? 'month',
  });

  if (error) throw error;
  return toSeries(data as MetricSnapshotPayload | null);
}

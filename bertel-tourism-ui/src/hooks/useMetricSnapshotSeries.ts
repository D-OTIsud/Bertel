import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getMetricSnapshotSeries } from '../services/metric-snapshot-rpc';
import type { MetricSeriesArgs, MetricSnapshotSeries } from '../types/metric-snapshot';

/**
 * Séries du registre metric_snapshot.
 *
 * La clé de cache ne porte PAS les filtres du dashboard : ces séries sont
 * GLOBALES et n'obéissent pas au panneau de filtres. Le widget l'affiche.
 * staleTime long (5 min) : le registre ne bouge qu'une fois par nuit.
 */
export const METRIC_SERIES_STALE_TIME_MS = 300_000;

export function useMetricSnapshotSeries(
  args: MetricSeriesArgs,
  enabled = true,
): UseQueryResult<MetricSnapshotSeries> {
  return useQuery<MetricSnapshotSeries>({
    queryKey: ['metric-snapshot', args],
    queryFn: () => getMetricSnapshotSeries(args),
    staleTime: METRIC_SERIES_STALE_TIME_MS,
    enabled,
    // Changer de métrique change la queryKey : sans placeholderData, `status`
    // repasserait à "pending" le temps du fetch. keepPreviousData garde le
    // dernier résultat connu, bascule `status` à "success" et pose
    // `isPlaceholderData = true` — c'est ce signal que le widget lit pour
    // savoir que les points en main ne sont PAS ceux de la métrique active.
    placeholderData: keepPreviousData,
  });
}

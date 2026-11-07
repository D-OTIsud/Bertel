import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardStatsParams } from '../lib/dashboard-stats-params';

// React Query hash la queryKey en JSON à clés triées : passer l'objet params
// directement suffit pour que deux états de filtres identiques partagent le cache.
// gcTime inherits the shared QueryClient default (24 h). Dashboard entries are
// in-memory only (no meta.persist), so 24 h is intentional — entries evict on
// cache clear or page unload, not sooner.
export const DASHBOARD_STALE_TIME_MS = 60_000;

export function useDashboardQuery<T>(
  widget: string,
  params: DashboardStatsParams,
  fetcher: (params: DashboardStatsParams) => Promise<T>,
  enabled = true,
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: ['dashboard', widget, params],
    queryFn: () => fetcher(params),
    staleTime: DASHBOARD_STALE_TIME_MS,
    enabled,
  });
}

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardFilters } from '../types/dashboard';

// React Query hash la queryKey en JSON à clés triées : passer l'objet filters
// directement suffit pour que deux états de filtres identiques partagent le cache.
// gcTime inherits the shared QueryClient default (24 h). Dashboard entries are
// in-memory only (no meta.persist), so 24 h is intentional — entries evict on
// cache clear or page unload, not sooner.
export const DASHBOARD_STALE_TIME_MS = 60_000;

export function useDashboardQuery<T>(
  widget: string,
  filters: DashboardFilters,
  fetcher: (filters: DashboardFilters) => Promise<T>,
  enabled = true,
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: ['dashboard', widget, filters],
    queryFn: () => fetcher(filters),
    staleTime: DASHBOARD_STALE_TIME_MS,
    enabled,
  });
}

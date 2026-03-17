import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import { getObjectResource, listExplorerPage, listMapObjects } from '../services/rpc';

export function useExplorerInfiniteQuery() {
  const selectedTypes = useExplorerStore((state) => state.selectedTypes);
  const search = useExplorerStore((state) => state.search);
  const labels = useExplorerStore((state) => state.labels);
  const amenities = useExplorerStore((state) => state.amenities);
  const openNow = useExplorerStore((state) => state.openNow);
  const capacityMetricCode = useExplorerStore((state) => state.capacityMetricCode);
  const capacityMin = useExplorerStore((state) => state.capacityMin);
  const capacityMax = useExplorerStore((state) => state.capacityMax);
  const itineraryDifficultyMin = useExplorerStore((state) => state.itineraryDifficultyMin);
  const itineraryDifficultyMax = useExplorerStore((state) => state.itineraryDifficultyMax);
  const elevationGainMin = useExplorerStore((state) => state.elevationGainMin);
  const bbox = useExplorerStore((state) => state.bbox);
  const polygon = useExplorerStore((state) => state.polygon);
  const view = useExplorerStore((state) => state.view);
  const filters = useMemo(
    () => ({
      selectedTypes,
      search,
      labels,
      amenities,
      openNow,
      capacityMetricCode,
      capacityMin,
      capacityMax,
      itineraryDifficultyMin,
      itineraryDifficultyMax,
      elevationGainMin,
      bbox,
      polygon,
      view,
    }),
    [
      amenities,
      bbox,
      capacityMax,
      capacityMetricCode,
      capacityMin,
      elevationGainMin,
      itineraryDifficultyMax,
      itineraryDifficultyMin,
      labels,
      openNow,
      polygon,
      search,
      selectedTypes,
      view,
    ],
  );
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useInfiniteQuery({
    queryKey: ['explorer-page', filters, langPrefs],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listExplorerPage({
        cursor: pageParam,
        pageSize: 12,
        filters,
        langPrefs,
      }),
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
  });
}

export function useMapObjectsQuery() {
  const selectedTypes = useExplorerStore((state) => state.selectedTypes);
  const search = useExplorerStore((state) => state.search);
  const labels = useExplorerStore((state) => state.labels);
  const amenities = useExplorerStore((state) => state.amenities);
  const openNow = useExplorerStore((state) => state.openNow);
  const capacityMetricCode = useExplorerStore((state) => state.capacityMetricCode);
  const capacityMin = useExplorerStore((state) => state.capacityMin);
  const capacityMax = useExplorerStore((state) => state.capacityMax);
  const itineraryDifficultyMin = useExplorerStore((state) => state.itineraryDifficultyMin);
  const itineraryDifficultyMax = useExplorerStore((state) => state.itineraryDifficultyMax);
  const elevationGainMin = useExplorerStore((state) => state.elevationGainMin);
  const bbox = useExplorerStore((state) => state.bbox);
  const polygon = useExplorerStore((state) => state.polygon);
  const view = useExplorerStore((state) => state.view);
  const filters = useMemo(
    () => ({
      selectedTypes,
      search,
      labels,
      amenities,
      openNow,
      capacityMetricCode,
      capacityMin,
      capacityMax,
      itineraryDifficultyMin,
      itineraryDifficultyMax,
      elevationGainMin,
      bbox,
      polygon,
      view,
    }),
    [
      amenities,
      bbox,
      capacityMax,
      capacityMetricCode,
      capacityMin,
      elevationGainMin,
      itineraryDifficultyMax,
      itineraryDifficultyMin,
      labels,
      openNow,
      polygon,
      search,
      selectedTypes,
      view,
    ],
  );
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    queryKey: ['map-objects', filters, langPrefs],
    queryFn: () => listMapObjects(filters, langPrefs),
  });
}

export function useObjectDetailQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    queryKey: ['object-detail', objectId, langPrefs],
    queryFn: () => getObjectResource(objectId ?? '', langPrefs),
    enabled: Boolean(objectId),
  });
}
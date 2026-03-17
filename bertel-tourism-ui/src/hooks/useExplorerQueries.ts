import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import { getObjectResource, listExplorerPage, listMapObjects } from '../services/rpc';
import { shallow } from 'zustand/shallow';

export function useExplorerInfiniteQuery() {
  const filters = useExplorerStore((state) => ({
    selectedTypes: state.selectedTypes,
    search: state.search,
    labels: state.labels,
    amenities: state.amenities,
    openNow: state.openNow,
    capacityMetricCode: state.capacityMetricCode,
    capacityMin: state.capacityMin,
    capacityMax: state.capacityMax,
    itineraryDifficultyMin: state.itineraryDifficultyMin,
    itineraryDifficultyMax: state.itineraryDifficultyMax,
    elevationGainMin: state.elevationGainMin,
    bbox: state.bbox,
    polygon: state.polygon,
    view: state.view,
  }), shallow);
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
  const filters = useExplorerStore((state) => ({
    selectedTypes: state.selectedTypes,
    search: state.search,
    labels: state.labels,
    amenities: state.amenities,
    openNow: state.openNow,
    capacityMetricCode: state.capacityMetricCode,
    capacityMin: state.capacityMin,
    capacityMax: state.capacityMax,
    itineraryDifficultyMin: state.itineraryDifficultyMin,
    itineraryDifficultyMax: state.itineraryDifficultyMax,
    elevationGainMin: state.elevationGainMin,
    bbox: state.bbox,
    polygon: state.polygon,
    view: state.view,
  }), shallow);
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
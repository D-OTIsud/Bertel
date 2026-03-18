import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import { listExplorerReferences } from '../services/explorer-reference';
import { getObjectResource, listExplorerCards } from '../services/rpc';
import { applyFrontendOnlyExplorerFilters } from '../utils/facets';

function useExplorerFilters() {
  const selectedBuckets = useExplorerStore((state) => state.selectedBuckets);
  const common = useExplorerStore((state) => state.common);
  const hot = useExplorerStore((state) => state.hot);
  const res = useExplorerStore((state) => state.res);
  const iti = useExplorerStore((state) => state.iti);
  const act = useExplorerStore((state) => state.act);
  const vis = useExplorerStore((state) => state.vis);
  const srv = useExplorerStore((state) => state.srv);

  return useMemo(
    () => ({
      selectedBuckets,
      common,
      hot,
      res,
      iti,
      act,
      vis,
      srv,
    }),
    [act, common, hot, iti, res, selectedBuckets, srv, vis],
  );
}

export function useExplorerCardsQuery() {
  const filters = useExplorerFilters();
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const queryFilters = useMemo(
    () => ({
      ...filters,
      hot: {
        ...filters.hot,
        subtypes: [],
      },
    }),
    [filters],
  );

  const query = useQuery({
    queryKey: ['explorer-cards', queryFilters, langPrefs],
    queryFn: () => listExplorerCards(queryFilters, langPrefs),
  });

  const data = useMemo(
    () => applyFrontendOnlyExplorerFilters(query.data ?? [], filters),
    [filters, query.data],
  );

  return {
    ...query,
    data,
  };
}

export function useExplorerReferencesQuery() {
  return useQuery({
    queryKey: ['explorer-references'],
    queryFn: listExplorerReferences,
    staleTime: 5 * 60 * 1000,
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
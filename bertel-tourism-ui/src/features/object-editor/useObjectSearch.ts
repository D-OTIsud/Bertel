import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listExplorerCards } from '../../services/rpc';
import { useSessionStore } from '../../store/session-store';
import type { ExplorerBucketKey, ExplorerFilters, ObjectCard } from '../../types/domain';
import { DEFAULT_EXPLORER_FILTERS, EXPLORER_BUCKET_OPTIONS } from '../../utils/facets';

export interface ObjectSearchResult {
  id: string;
  name: string;
  type: string;
  status: string;
  city: string;
  code: string;
  /** Carte Explorer complète (image, description, coords…) — déjà chargée par la recherche ;
   *  portée telle quelle pour que les consommateurs enrichissent sans re-fetch (palette Listes). */
  card: ObjectCard;
}

interface UseObjectSearchOptions {
  enabled?: boolean;
  currentObjectId?: string;
  buckets?: ExplorerBucketKey[];
  debounceMs?: number;
  limit?: number;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return undefined;
    }

    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

export function buildObjectSearchFilters(query: string, buckets?: ExplorerBucketKey[]): ExplorerFilters {
  return {
    ...DEFAULT_EXPLORER_FILTERS,
    selectedBuckets: buckets ?? EXPLORER_BUCKET_OPTIONS.map((bucket) => bucket.code),
    common: {
      ...DEFAULT_EXPLORER_FILTERS.common,
      search: query.trim(),
      statuses: ['published', 'draft'],
      // §109 — keep object linking (duplicate-name hint, RelationPicker) name/city-focused;
      // do NOT broaden to the global search_document the Explorer uses.
      searchScope: 'name',
    },
  };
}

export function normalizeObjectSearchResults(
  cards: ObjectCard[],
  currentObjectId?: string,
  limit = 8,
): ObjectSearchResult[] {
  return cards
    .filter((card) => card.id !== currentObjectId)
    .slice(0, limit)
    .map((card) => ({
      id: card.id,
      name: card.name,
      type: card.type,
      status: card.status ?? '',
      city: card.location?.city ?? '',
      code: card.id,
      card,
    }));
}

export function useObjectSearch(query: string, options: UseObjectSearchOptions = {}) {
  const {
    enabled = true,
    currentObjectId,
    buckets,
    debounceMs = 250,
    limit = 8,
  } = options;
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const debouncedQuery = useDebouncedValue(query, debounceMs);
  const normalizedQuery = debouncedQuery.trim();

  const filters = useMemo(
    () => buildObjectSearchFilters(normalizedQuery, buckets),
    [buckets, normalizedQuery],
  );

  const queryResult = useQuery({
    queryKey: ['object-search', normalizedQuery, buckets ?? 'all', langPrefs],
    queryFn: async () => normalizeObjectSearchResults(
      await listExplorerCards(filters, langPrefs),
      currentObjectId,
      limit,
    ),
    enabled: enabled && normalizedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  return {
    results: queryResult.data ?? [],
    loading: queryResult.isFetching,
    error: queryResult.error,
  };
}

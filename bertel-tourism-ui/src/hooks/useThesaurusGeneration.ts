import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchThesaurusGeneration } from '../services/thesaurus-generation';

export const THESAURUS_GENERATION_QUERY_KEY = ['thesaurus-generation'] as const;

export function useThesaurusGeneration() {
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  const query = useQuery({
    queryKey: THESAURUS_GENERATION_QUERY_KEY,
    queryFn: fetchThesaurusGeneration,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    meta: { persist: false },
  });
  useEffect(() => {
    if (!query.isSuccess) return;
    if (previous.current !== undefined && previous.current !== query.data) {
      void client.invalidateQueries({ predicate: (entry) => {
        const key = String(entry.queryKey[0] ?? '');
        return key.startsWith('explorer-') || key === 'object-detail' || key === 'object-workspace'
          || key === 'reference-catalogs' || key === 'location-reference-options';
      } });
    }
    previous.current = query.data;
  }, [client, query.data, query.isSuccess]);
  useEffect(() => {
    const published = (event: Event) => {
      const id = (event as CustomEvent<{ releaseId?: string | number }>).detail?.releaseId;
      if (id != null) client.setQueryData(THESAURUS_GENERATION_QUERY_KEY, String(id));
      void client.invalidateQueries({ queryKey: THESAURUS_GENERATION_QUERY_KEY });
    };
    window.addEventListener('bertel:thesaurus-published', published);
    return () => window.removeEventListener('bertel:thesaurus-published', published);
  }, [client]);
  return query;
}

export function generationQueryKey(base: readonly unknown[], generation: {
  isPending: boolean; isError: boolean; data?: string | null;
}): readonly unknown[] {
  if (generation.isPending) return [...base, 'checking-generation'];
  if (generation.isError) return [...base, 'generation-unavailable'];
  return generation.data == null ? [...base] : [...base, generation.data];
}

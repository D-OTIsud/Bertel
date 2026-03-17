'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { buildSearchParams, parseSearchParams } from '@/lib/explorer-search-params';
import { useExplorerStore } from '@/store/explorer-store';

export function useExplorerUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const setFiltersFromUrl = useExplorerStore((state) => state.setFiltersFromUrl);
  const lastUrlRef = useRef<string | null>(null);

  // 1. URL -> Store : On lit l'URL au chargement ou lors d'un "Précédent / Suivant"
  useEffect(() => {
    if (lastUrlRef.current === searchParamsString) return;
    const parsed = parseSearchParams(new URLSearchParams(searchParamsString));
    lastUrlRef.current = searchParamsString;
    if (Object.keys(parsed).length > 0) {
      setFiltersFromUrl(parsed);
    }
  }, [searchParamsString, setFiltersFromUrl]);

  // 2. Store -> URL : On s'abonne au store Zustand DIRECTEMENT (évite les boucles React)
  // Debounce 300ms pour ne pas lancer router.replace sur chaque frappe du champ recherche
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;

    const unsubscribe = useExplorerStore.subscribe((state) => {
      const next = buildSearchParams(state);
      const str = next.toString();

      if (lastUrlRef.current === str) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        lastUrlRef.current = str;
        const url = str ? `/explorer?${str}` : '/explorer';
        router.replace(url, { scroll: false });
      }, 300);
    });

    return () => {
      unsubscribe();
      clearTimeout(debounceTimer);
    };
  }, [router]);
}

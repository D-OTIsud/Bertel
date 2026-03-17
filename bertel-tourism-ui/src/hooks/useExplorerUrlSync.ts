'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { buildSearchParams, parseSearchParams } from '@/lib/explorer-search-params';
import { useExplorerStore } from '@/store/explorer-store';

export function useExplorerUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setFiltersFromUrl = useExplorerStore((state) => state.setFiltersFromUrl);
  const lastUrlRef = useRef<string | null>(null);

  // 1. URL -> Store : On lit l'URL au chargement ou lors d'un "Précédent / Suivant"
  useEffect(() => {
    if (!searchParams) return;
    const str = searchParams.toString();
    const parsed = parseSearchParams(searchParams);
    if (Object.keys(parsed).length > 0) {
      lastUrlRef.current = str;
      setFiltersFromUrl(parsed);
    }
  }, [searchParams, setFiltersFromUrl]);

  // 2. Store -> URL : On s'abonne au store Zustand DIRECTEMENT (évite les boucles React)
  useEffect(() => {
    const unsubscribe = useExplorerStore.subscribe((state) => {
      const next = buildSearchParams(state);
      const str = next.toString();

      // La sécurité anti-boucle : si l'URL est la même, on s'arrête
      if (lastUrlRef.current === str) return;

      lastUrlRef.current = str;
      const url = str ? `/explorer?${str}` : '/explorer';
      router.replace(url, { scroll: false });
    });

    // Nettoyage de l'abonnement quand le composant est démonté
    return () => unsubscribe();
  }, [router]);
}

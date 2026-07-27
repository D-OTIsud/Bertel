'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { buildSearchParams, parseSearchParams } from '@/lib/explorer-search-params';
import { DRAWER_URL_PARAM } from '@/hooks/useExplorerContextSync';
import { useExplorerStore } from '@/store/explorer-store';
import { DEFAULT_EXPLORER_FILTERS } from '@/utils/facets';

/** Sérialisation de l'état par défaut — NON vide (les sous-types HOT par défaut y
 *  figurent). C'est la référence « rien de choisi » à laquelle comparer le store
 *  avant de restaurer une recherche (cf. garde du passage URL->Store ci-dessous). */
const DEFAULT_FILTER_PARAMS = buildSearchParams(DEFAULT_EXPLORER_FILTERS).toString();

/** Vue « filtres seulement » de l'URL : les clés de contexte (D25 `fiche`) sont
 *  hors du périmètre de cette synchro — sans ce strip, ouvrir/fermer le drawer
 *  re-déclencherait replaceFiltersFromUrl (qui remet à zéro polygon/bbox). */
function filtersView(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(DRAWER_URL_PARAM);
  return params.toString();
}

export function useExplorerUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const replaceFiltersFromUrl = useExplorerStore((state) => state.replaceFiltersFromUrl);
  const lastUrlRef = useRef<string | null>(null);

  // 1. URL -> Store : On lit l'URL au chargement ou lors d'un "Précédent / Suivant"
  useEffect(() => {
    const filterParams = filtersView(searchParamsString);
    if (lastUrlRef.current === filterParams) return;

    // Retour sur l'Explorer par la navigation (lien `/explorer` NU) alors que la
    // recherche de l'utilisateur est toujours dans le store : le store est un
    // singleton de module, il survit à la navigation client (aller éditer une
    // fiche, passer par le Dashboard…) — seule l'URL est repartie de zéro. Sans
    // cette garde, le premier passage URL->Store écrasait les filtres avec un
    // état vide. On ré-écrit donc l'URL DEPUIS le store (URL et store restent la
    // même vérité : rechargement / partage du lien continuent de fonctionner).
    // `lastUrlRef.current === null` == premier passage de CE montage : une remise
    // à zéro explicite (resetAll) ou un Back vers une URL nue passent après, et
    // réinitialisent normalement.
    if (lastUrlRef.current === null && !filterParams) {
      const restored = buildSearchParams(useExplorerStore.getState()).toString();
      if (restored && restored !== DEFAULT_FILTER_PARAMS) {
        lastUrlRef.current = restored;
        router.replace(`/explorer?${restored}`, { scroll: false });
        return;
      }
    }

    const parsed = parseSearchParams(new URLSearchParams(filterParams));
    lastUrlRef.current = filterParams;
    replaceFiltersFromUrl(parsed);
  }, [searchParamsString, replaceFiltersFromUrl, router]);

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
        // D25 : ré-attache la clé `fiche` courante (lue au moment de l'écriture —
        // le drawer a pu changer pendant le debounce) pour ne pas l'effacer.
        const withContext = new URLSearchParams(str);
        const fiche = new URLSearchParams(window.location.search).get(DRAWER_URL_PARAM);
        if (fiche) withContext.set(DRAWER_URL_PARAM, fiche);
        const full = withContext.toString();
        const url = full ? `/explorer?${full}` : '/explorer';
        router.replace(url, { scroll: false });
      }, 300);
    });

    return () => {
      unsubscribe();
      clearTimeout(debounceTimer);
    };
  }, [router]);
}

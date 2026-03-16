'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { buildSearchParams, parseSearchParams } from '@/lib/explorer-search-params';
import { useExplorerStore } from '@/store/explorer-store';

/**
 * Syncs explorer filters with URL searchParams:
 * - On mount and when URL changes (e.g. back/forward): parses params and updates store.
 * - When store filters change: updates URL with router.replace.
 */
export function useExplorerUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setFiltersFromUrl = useExplorerStore((state) => state.setFiltersFromUrl);
  const filterSlice = useExplorerStore((state) => ({
    selectedTypes: state.selectedTypes,
    search: state.search,
    view: state.view,
    labels: state.labels,
    amenities: state.amenities,
    openNow: state.openNow,
    capacityMetricCode: state.capacityMetricCode,
    capacityMin: state.capacityMin,
    capacityMax: state.capacityMax,
    itineraryDifficultyMin: state.itineraryDifficultyMin,
    itineraryDifficultyMax: state.itineraryDifficultyMax,
    elevationGainMin: state.elevationGainMin,
  }));
  const lastUrlRef = useRef<string | null>(null);

  // URL -> store: when searchParams change (e.g. initial load or back/forward)
  useEffect(() => {
    const str = searchParams.toString();
    const parsed = parseSearchParams(searchParams);
    if (Object.keys(parsed).length > 0) {
      lastUrlRef.current = str;
      setFiltersFromUrl(parsed);
    }
  }, [searchParams, setFiltersFromUrl]);

  // Store -> URL: when filters change, update URL
  useEffect(() => {
    const state = useExplorerStore.getState();
    const next = buildSearchParams(state);
    const str = next.toString();
    if (lastUrlRef.current === str) return;
    lastUrlRef.current = str;
    const url = str ? `/explorer?${str}` : '/explorer';
    router.replace(url, { scroll: false });
  }, [filterSlice, router]);
}

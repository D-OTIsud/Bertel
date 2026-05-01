'use client';

import { useEffect, useMemo } from 'react';
import { listExplorerCards } from '@/services/rpc';
import { useCardCacheStore } from '@/store/card-cache-store';
import { useSessionStore } from '@/store/session-store';
import type { ExplorerFilters } from '@/types/domain';
import { DEFAULT_EXPLORER_FILTERS, resolveExplorerStatuses } from '@/utils/facets';

const DAY_MS = 24 * 60 * 60 * 1000;

export function useCardCacheBootstrap() {
  const userId = useSessionStore((s) => s.userId);
  const langPrefs = useSessionStore((s) => s.langPrefs);
  const canEditObjects = useSessionStore((s) => s.canEditObjects);
  const demoMode = useSessionStore((s) => s.demoMode);
  const sessionStatus = useSessionStore((s) => s.status);

  const buster = useMemo(() => `v1:${userId ?? 'anon'}:${langPrefs.join(',')}`, [langPrefs, userId]);

  const hydrate = useCardCacheStore((s) => s.hydrate);
  const mergeCards = useCardCacheStore((s) => s.mergeCards);
  const cards = useCardCacheStore((s) => s.cards);
  const hydrated = useCardCacheStore((s) => s.hydrated);
  const lastBulkLoadAt = useCardCacheStore((s) => s.lastBulkLoadAt);
  const setBulkLoadInFlight = useCardCacheStore((s) => s.setBulkLoadInFlight);
  const markBulkLoadComplete = useCardCacheStore((s) => s.markBulkLoadComplete);
  const invalidateEpoch = useCardCacheStore((s) => s.invalidateEpoch);

  useEffect(() => {
    if (sessionStatus !== 'ready') {
      return;
    }
    void hydrate(buster);
  }, [buster, hydrate, invalidateEpoch, sessionStatus]);

  useEffect(() => {
    if (!hydrated || sessionStatus !== 'ready') {
      return;
    }
    const stale = !lastBulkLoadAt || Date.now() - new Date(lastBulkLoadAt).getTime() > DAY_MS;
    if (cards.size > 0 && !stale) {
      return;
    }

    const bulkFilters: ExplorerFilters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        statuses: resolveExplorerStatuses([], canEditObjects),
      },
      hot: {
        ...DEFAULT_EXPLORER_FILTERS.hot,
        subtypes: demoMode ? DEFAULT_EXPLORER_FILTERS.hot.subtypes : [],
      },
    };

    setBulkLoadInFlight(true);
    listExplorerCards(bulkFilters, langPrefs)
      .then((all) => {
        mergeCards(all);
        markBulkLoadComplete();
      })
      .finally(() => {
        setBulkLoadInFlight(false);
      });
  }, [
    canEditObjects,
    cards.size,
    demoMode,
    hydrated,
    langPrefs,
    lastBulkLoadAt,
    markBulkLoadComplete,
    mergeCards,
    sessionStatus,
    setBulkLoadInFlight,
  ]);
}

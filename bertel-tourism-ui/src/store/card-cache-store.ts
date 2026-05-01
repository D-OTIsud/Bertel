import { create } from 'zustand';
import { clearCardCache, loadCardCache, saveCardCache } from '@/lib/card-cache-storage';
import type { ObjectCard } from '@/types/domain';

const DEBOUNCE_MS = 500;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(buster: string, cards: Map<string, ObjectCard>): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void saveCardCache(buster, Array.from(cards.values())).catch(() => {
      // IndexedDB quota or private mode — in-memory cache still works.
    });
  }, DEBOUNCE_MS);
}

interface CardCacheState {
  cards: Map<string, ObjectCard>;
  hydrated: boolean;
  bulkLoadInFlight: boolean;
  lastBulkLoadAt: string | null;
  currentBuster: string | null;
  /** Bumped on `clear()` so bootstrap re-runs `hydrate` even when `buster` is unchanged (e.g. demo role switch). */
  invalidateEpoch: number;

  hydrate: (buster: string) => Promise<void>;
  mergeCards: (incoming: ObjectCard[]) => void;
  setBulkLoadInFlight: (inFlight: boolean) => void;
  markBulkLoadComplete: () => void;
  clear: () => Promise<void>;
}

export const useCardCacheStore = create<CardCacheState>((set, get) => ({
  cards: new Map(),
  hydrated: false,
  bulkLoadInFlight: false,
  lastBulkLoadAt: null,
  currentBuster: null,
  invalidateEpoch: 0,

  hydrate: async (buster) => {
    set({ currentBuster: buster, hydrated: false });
    try {
      const { cards, savedAt } = await loadCardCache(buster);
      set({
        cards: new Map(cards.map((c) => [c.id, c])),
        lastBulkLoadAt: savedAt,
        hydrated: true,
      });
    } catch {
      set({
        cards: new Map(),
        lastBulkLoadAt: null,
        hydrated: true,
      });
    }
  },

  mergeCards: (incoming) => {
    const { cards, currentBuster } = get();
    if (!currentBuster) {
      return;
    }
    const next = new Map(cards);
    for (const card of incoming) {
      next.set(card.id, card);
    }
    set({ cards: next });
    schedulePersist(currentBuster, next);
  },

  setBulkLoadInFlight: (bulkLoadInFlight) => set({ bulkLoadInFlight }),

  markBulkLoadComplete: () => {
    set({ lastBulkLoadAt: new Date().toISOString() });
  },

  clear: async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await clearCardCache();
    set((state) => ({
      cards: new Map(),
      hydrated: false,
      bulkLoadInFlight: false,
      lastBulkLoadAt: null,
      currentBuster: null,
      invalidateEpoch: state.invalidateEpoch + 1,
    }));
  },
}));

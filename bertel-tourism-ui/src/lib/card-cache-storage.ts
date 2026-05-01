import { del, get, set } from 'idb-keyval';
import type { ObjectCard } from '@/types/domain';

const KEY = 'explorer-cards-v1';

interface Payload {
  buster: string;
  cards: ObjectCard[];
  savedAt: string;
}

export async function loadCardCache(buster: string): Promise<{ cards: ObjectCard[]; savedAt: string | null }> {
  try {
    const raw = (await get(KEY)) as Payload | undefined;
    if (!raw || raw.buster !== buster) {
      return { cards: [], savedAt: null };
    }
    return { cards: raw.cards, savedAt: raw.savedAt ?? null };
  } catch {
    return { cards: [], savedAt: null };
  }
}

export async function saveCardCache(buster: string, cards: ObjectCard[]): Promise<void> {
  await set(KEY, {
    buster,
    cards,
    savedAt: new Date().toISOString(),
  } satisfies Payload);
}

export async function clearCardCache(): Promise<void> {
  await del(KEY);
}

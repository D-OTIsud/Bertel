'use client';

import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useGlobalPresence } from '@/hooks/useGlobalPresence';

export function AppBootstrap() {
  useBootstrapSession();
  useGlobalPresence();
  // §125 — the whole-corpus card-cache bulk-load (useCardCacheBootstrap) is retired: the Explorer
  // now lazily paginates the list and feeds the map from the lightweight markers RPC, so nothing
  // consumes the bulk cache anymore. Removing the mount kills a per-session full-corpus heavy
  // fetch that contributed to the 8s statement_timeout under contention.

  return null;
}

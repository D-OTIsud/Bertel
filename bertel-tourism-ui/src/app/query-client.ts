import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { isSandboxMode } from '@/lib/sandbox-mode';
import { bindSessionQueryCache } from './session-query-cache';

const DAY_MS = 24 * 60 * 60 * 1000;

// Do not retry on permanent HTTP errors (auth failure, not found, forbidden).
// Retrying these would hammer the backend while the session is already known bad.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status === 401 || status === 403 || status === 404) return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: DAY_MS,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});

// Discard records persisted before actor realm isolation was enforced server-side.
export const queryCacheBuster = 'v2-actor-realm-isolation';
function browserCacheStorage(): { key: string; storage: Storage } | undefined {
  if (typeof window === 'undefined') return undefined;
  // Storage getters and the sandbox-mode read can throw before Providers mounts.
  // Keep its existing memory-only path reachable; never try the other realm's cache.
  try {
    const sandbox = isSandboxMode();
    return {
      key: sandbox ? 'bertel-test-rq-cache' : 'bertel-rq-cache',
      storage: sandbox ? window.sessionStorage : window.localStorage,
    };
  } catch {
    return undefined;
  }
}

const cacheStorage = browserCacheStorage();
export const queryCacheStorageKey = cacheStorage?.key ?? 'bertel-rq-cache';
export const queryCacheMaxAgeMs = DAY_MS;

export const queryPersister = cacheStorage ? createSyncStoragePersister(cacheStorage) : undefined;

bindSessionQueryCache(queryClient, () => { void queryPersister?.removeClient(); });

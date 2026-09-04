import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { isSandboxMode } from '@/lib/sandbox-mode';

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

export const queryCacheBuster = 'v1';
export const queryCacheStorageKey = isSandboxMode() ? 'bertel-test-rq-cache' : 'bertel-rq-cache';
export const queryCacheMaxAgeMs = DAY_MS;

export const queryPersister =
  typeof window !== 'undefined'
    ? createSyncStoragePersister({
        key: queryCacheStorageKey,
        storage: isSandboxMode() ? window.sessionStorage : window.localStorage,
      })
    : undefined;

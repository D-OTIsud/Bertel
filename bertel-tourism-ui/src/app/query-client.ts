import { QueryClient } from '@tanstack/react-query';

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
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});
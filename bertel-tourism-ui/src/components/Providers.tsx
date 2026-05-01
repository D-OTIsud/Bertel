'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster } from 'sonner';
import { AppBootstrap } from '@/components/common/AppBootstrap';
import { ThemeBootstrap } from '@/components/common/ThemeBootstrap';
import { queryCacheBuster, queryCacheMaxAgeMs, queryClient, queryPersister } from '@/app/query-client';
import { useSessionStore } from '@/store/session-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const userId = useSessionStore((state) => state.userId);
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const buster = `${queryCacheBuster}:${userId ?? 'anon'}:${langPrefs.join(',')}`;

  if (!queryPersister) {
    return (
      <QueryClientProvider client={queryClient}>
        <AppBootstrap />
        <ThemeBootstrap />
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: queryCacheMaxAgeMs,
        buster,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === 'success' && query.meta?.persist === true,
        },
      }}
    >
      <AppBootstrap />
      <ThemeBootstrap />
      {children}
      <Toaster richColors position="top-right" />
    </PersistQueryClientProvider>
  );
}

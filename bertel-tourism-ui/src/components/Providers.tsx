'use client';

import { Fragment } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster } from 'sonner';
import { AppBootstrap } from '@/components/common/AppBootstrap';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { ThemeBootstrap } from '@/components/common/ThemeBootstrap';
import { queryCacheBuster, queryCacheMaxAgeMs, queryClient, queryPersister } from '@/app/query-client';
import { useSessionStore } from '@/store/session-store';
import { sessionQueryScopeKey } from '@/app/session-query-cache';

export function Providers({ children }: { children: React.ReactNode }) {
  const sessionScope = useSessionStore(sessionQueryScopeKey);
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const buster = `${queryCacheBuster}:${sessionScope}:${langPrefs.join(',')}`;

  // D4 : le boundary englobe aussi les bootstraps (thème/session) — un throw à cet
  // étage affichait une page blanche ; Toaster/OfflineBanner restent hors boundary.
  const content = (
    <>
      <ErrorBoundary>
        <AppBootstrap />
        <ThemeBootstrap />
        {/* Old query observers also hold results after cache eviction. Recreate views
            when their session scope changes so those results cannot remain visible. */}
        <Fragment key={sessionScope}>{children}</Fragment>
      </ErrorBoundary>
      <Toaster richColors position="top-right" />
      <OfflineBanner />
    </>
  );

  if (!queryPersister) {
    return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
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
      {content}
    </PersistQueryClientProvider>
  );
}

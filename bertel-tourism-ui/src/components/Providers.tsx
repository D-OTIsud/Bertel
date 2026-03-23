'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppBootstrap } from '@/components/common/AppBootstrap';
import { ThemeBootstrap } from '@/components/common/ThemeBootstrap';
import { queryClient } from '@/app/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppBootstrap />
      <ThemeBootstrap />
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

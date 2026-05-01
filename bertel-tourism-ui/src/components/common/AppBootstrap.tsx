'use client';

import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useCardCacheBootstrap } from '@/hooks/useCardCacheBootstrap';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';

export function AppBootstrap() {
  useBootstrapSession();
  useNetworkMonitor();
  useCardCacheBootstrap();

  return null;
}

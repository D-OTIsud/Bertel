'use client';

import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';

export function AppBootstrap() {
  useBootstrapSession();
  useNetworkMonitor();

  return null;
}

'use client';

import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useCardCacheBootstrap } from '@/hooks/useCardCacheBootstrap';
import { useGlobalPresence } from '@/hooks/useGlobalPresence';

export function AppBootstrap() {
  useBootstrapSession();
  useGlobalPresence();
  useCardCacheBootstrap();

  return null;
}

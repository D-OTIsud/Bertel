'use client';

import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../app/query-client';
import { useSessionStore } from '../store/session-store';
import { serviceAvailabilityOptions, UNAVAILABLE_SERVICES } from '../services/service-availability';

export function useServiceAvailability() {
  const userId = useSessionStore((state) => state.userId);
  const orgId = useSessionStore((state) => state.orgId);
  const isTestRealm = useSessionStore((state) => state.isTestRealm);
  const ready = useSessionStore((state) => state.status === 'ready' && !state.demoMode);
  const scope = ready && userId ? { userId, orgId, isTestRealm } : null;
  const query = useQuery({
    ...serviceAvailabilityOptions(scope),
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  }, queryClient);
  return scope && !query.isError && !query.isPending ? query.data ?? UNAVAILABLE_SERVICES : UNAVAILABLE_SERVICES;
}

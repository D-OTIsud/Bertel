import { queryOptions } from '@tanstack/react-query';
import { queryClient } from '../app/query-client';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

export interface ServiceAvailability {
  translation: boolean;
  imageAnalysis: boolean;
  email: boolean;
}

export const UNAVAILABLE_SERVICES: ServiceAvailability = Object.freeze({
  translation: false, imageAnalysis: false, email: false,
});

interface AvailabilityScope { userId: string; orgId: string | null; isTestRealm: boolean }
const key = ['service-availability'] as const;
let revision = 0;

function scopeIdentity(session: ReturnType<typeof useSessionStore.getState>): string | null {
  if (session.status !== 'ready' || !session.userId || session.demoMode) return null;
  return `${session.userId}\u0000${session.orgId ?? ''}\u0000${session.isTestRealm}`;
}

/** Purges capability results when the authenticated identity can have changed. */
export function clearServiceAvailabilityForSessionTransition(): void {
  revision += 1;
  // `removeQueries` matters for a logout/login of the same user: its normal query key
  // would otherwise reuse a still-fresh true result before the next refetch completes.
  void queryClient.cancelQueries({ queryKey: key }, { revert: false });
  queryClient.removeQueries({ queryKey: key });
}

// Session bootstrap deliberately retains the global QueryClient. Subscribe here so every
// readiness/logout/org/realm transition still purges this security-sensitive, non-persistent key.
let observedScope = scopeIdentity(useSessionStore.getState());
useSessionStore.subscribe((state) => {
  const nextScope = scopeIdentity(state);
  if (nextScope !== observedScope) {
    observedScope = nextScope;
    clearServiceAvailabilityForSessionTransition();
  }
});

export function serviceAvailabilityScope(): AvailabilityScope | null {
  const session = useSessionStore.getState();
  return session.status === 'ready' && session.userId && !session.demoMode
    ? { userId: session.userId, orgId: session.orgId, isTestRealm: session.isTestRealm }
    : null;
}

function sameScope(expected: AvailabilityScope): boolean {
  const current = serviceAvailabilityScope();
  return current?.userId === expected.userId && current.orgId === expected.orgId
    && current.isTestRealm === expected.isTestRealm;
}

async function fetchAvailability(scope: AvailabilityScope, signal: AbortSignal): Promise<ServiceAvailability> {
  const startedAtRevision = revision;
  const client = getSupabaseClient();
  if (!client) return UNAVAILABLE_SERVICES;
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token || data.session.user.id !== scope.userId
    || !sameScope(scope) || signal.aborted || startedAtRevision !== revision) return UNAVAILABLE_SERVICES;
  const response = await fetch('/api/service-availability', {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error('Services indisponibles.');
  const result = await response.json();
  if (!sameScope(scope) || signal.aborted || startedAtRevision !== revision) return UNAVAILABLE_SERVICES;
  return {
    translation: result?.translation === true,
    imageAnalysis: result?.imageAnalysis === true,
    email: result?.email === true,
  };
}

export function serviceAvailabilityOptions(scope: AvailabilityScope | null) {
  return queryOptions({
    queryKey: [...key, scope?.userId ?? null, scope?.orgId ?? null, scope?.isTestRealm ?? false],
    queryFn: ({ signal }) => scope ? fetchAvailability(scope, signal) : Promise.resolve(UNAVAILABLE_SERVICES),
    enabled: scope !== null,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    meta: { persist: false },
  });
}

/** Also used immediately before background pings and actions outside React. */
export async function getServiceAvailability(options: { force?: boolean } = {}): Promise<ServiceAvailability> {
  const scope = serviceAvailabilityScope();
  if (!scope) return UNAVAILABLE_SERVICES;
  const requestRevision = revision;
  try {
    const result = await queryClient.fetchQuery({
      ...serviceAvailabilityOptions(scope),
      ...(options.force ? { staleTime: 0 } : {}),
    });
    return sameScope(scope) && requestRevision === revision ? result : UNAVAILABLE_SERVICES;
  } catch {
    return UNAVAILABLE_SERVICES;
  }
}

/** Hide immediately, cancel old reads, then refresh active subscribers after a settings save. */
export function invalidateServiceAvailability(): void {
  revision += 1;
  void queryClient.cancelQueries({ queryKey: key }, { revert: false }).then(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  });
  queryClient.setQueriesData({ queryKey: key }, UNAVAILABLE_SERVICES);
}

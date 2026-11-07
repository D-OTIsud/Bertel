import type { QueryClient } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session-store';

type SessionQueryScope = Pick<ReturnType<typeof useSessionStore.getState>,
  'status' | 'userId' | 'orgId' | 'isTestRealm' | 'role'>;

export function sessionQueryScopeKey(session: SessionQueryScope): string {
  return JSON.stringify([
    session.status, session.userId, session.orgId, session.isTestRealm, session.role,
  ]);
}

/**
 * CRM query keys are shared by several views. Evict them synchronously when the
 * authenticated scope changes, before a view can render another session's actors.
 * clear() also cancels pending queries so an old response cannot refill the cache.
 */
export function bindSessionQueryCache(client: QueryClient, removePersistedCache: () => void): () => void {
  return useSessionStore.subscribe((session, previous) => {
    if (sessionQueryScopeKey(session) === sessionQueryScopeKey(previous)) return;
    client.clear();
    removePersistedCache();
  });
}

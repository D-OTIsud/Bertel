import { QueryClient } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session-store';
import { bindSessionQueryCache } from './session-query-cache';

describe('session query isolation', () => {
  let client: QueryClient;
  let removePersistedCache: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(() => {
    useSessionStore.setState({
      status: 'ready', userId: 'test-user', orgId: 'ORG-TEST', isTestRealm: true, role: 'tourism_agent',
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    removePersistedCache = jest.fn();
    unsubscribe = bindSessionQueryCache(client, removePersistedCache);
  });

  afterEach(() => {
    unsubscribe();
    client.clear();
  });

  it.each([
    { userId: 'production-user' },
    { orgId: 'ORG-PRODUCTION' },
    { isTestRealm: false },
    { role: 'actor' as const },
    { status: 'guest' as const },
    { status: 'error' as const },
  ])('removes actor results immediately on session scope change %j', (change) => {
    client.setQueryData(['crm-directory'], [{ actorId: 'test-actor' }]);
    client.setQueryData(['crm-actor', 'test-actor'], { displayName: 'Test actor' });

    useSessionStore.setState(change);

    expect(client.getQueryData(['crm-directory'])).toBeUndefined();
    expect(client.getQueryData(['crm-actor', 'test-actor'])).toBeUndefined();
    expect(removePersistedCache).toHaveBeenCalledTimes(1);
  });

  it('prevents a response from the previous realm from replacing production results', async () => {
    let resolveTestActors!: (actors: Array<{ actorId: string }>) => void;
    const oldRequest = client.fetchQuery({
      queryKey: ['crm-directory'],
      queryFn: () => new Promise<Array<{ actorId: string }>>((resolve) => { resolveTestActors = resolve; }),
    }).catch(() => undefined);

    useSessionStore.setState({ userId: 'production-user', orgId: 'ORG-PRODUCTION', isTestRealm: false });
    client.setQueryData(['crm-directory'], [{ actorId: 'real-actor' }]);
    resolveTestActors([{ actorId: 'test-actor' }]);
    await oldRequest;

    expect(client.getQueryData(['crm-directory'])).toEqual([{ actorId: 'real-actor' }]);
  });

  it('preserves cache on profile updates and unchanged session refreshes', () => {
    client.setQueryData(['crm-directory'], [{ actorId: 'test-actor' }]);

    useSessionStore.getState().applyProfile({ userName: 'Updated name' });
    useSessionStore.setState({ userId: 'test-user', orgId: 'ORG-TEST', isTestRealm: true });

    expect(client.getQueryData(['crm-directory'])).toEqual([{ actorId: 'test-actor' }]);
    expect(removePersistedCache).not.toHaveBeenCalled();
  });
});

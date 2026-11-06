jest.mock('./session-query-cache', () => ({ bindSessionQueryCache: jest.fn() }));

describe('query cache bootstrap when browser storage is unavailable', () => {
  const localDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
  const sessionDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', localDescriptor);
    Object.defineProperty(window, 'sessionStorage', sessionDescriptor);
    jest.restoreAllMocks();
  });

  function loadClient() {
    let module!: typeof import('./query-client');
    jest.isolateModules(() => { module = require('./query-client'); });
    return module;
  }

  it.each(['localStorage', 'sessionStorage'] as const)('keeps the memory cache available if the %s getter is denied', (name) => {
    Object.defineProperty(window, name, { configurable: true, get: () => {
      throw new DOMException('Synthetic storage access refusal', 'SecurityError');
    } });
    const { queryClient, queryPersister } = loadClient();
    expect(queryPersister).toBeUndefined();
    queryClient.setQueryData(['synthetic'], 'memory-only');
    expect(queryClient.getQueryData(['synthetic'])).toBe('memory-only');
    queryClient.clear();
  });

  it('also handles a refused sandbox-mode read without accessing a different cache', () => {
    const session = window.sessionStorage;
    const local = window.localStorage;
    const originalRead = Storage.prototype.getItem;
    const reads = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (this === session) throw new DOMException('Synthetic storage read refusal', 'SecurityError');
      return originalRead.call(this, key);
    });
    const { queryClient, queryPersister } = loadClient();
    expect(queryPersister).toBeUndefined();
    expect(reads.mock.contexts).not.toContain(local);
    queryClient.clear();
  });

  it.each([false, true])('preserves the real cache namespace when storage is accessible (sandbox %s)', async (sandbox) => {
    window.sessionStorage.setItem('bertel-test-mode', String(sandbox));
    const key = sandbox ? 'bertel-test-rq-cache' : 'bertel-rq-cache';
    const other = sandbox ? 'bertel-rq-cache' : 'bertel-test-rq-cache';
    const persisted = { timestamp: 123, buster: 'synthetic', clientState: { mutations: [], queries: [] } };
    (sandbox ? window.sessionStorage : window.localStorage).setItem(key, JSON.stringify(persisted));
    (sandbox ? window.localStorage : window.sessionStorage).setItem(other, JSON.stringify({ ...persisted, buster: 'other-realm' }));
    const { queryClient, queryCacheStorageKey, queryPersister } = loadClient();
    expect(queryCacheStorageKey).toBe(key);
    expect(queryPersister).toBeDefined();
    expect(await queryPersister!.restoreClient()).toEqual(persisted);
    queryClient.clear();
  });
});

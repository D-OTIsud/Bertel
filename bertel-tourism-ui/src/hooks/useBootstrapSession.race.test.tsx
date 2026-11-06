import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { useBootstrapSession } from './useBootstrapSession';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { getOrCreateUserProfile, type AppUserProfileRow } from '../services/user-profile';
import { GUEST_SIGNED_OUT_MESSAGE, useSessionStore } from '../store/session-store';
import { useProviderScopeStore } from '../store/provider-scope-store';
import { useDashboardExplorerStore, useExplorerStore } from '../store/explorer-store';
import { bindSessionQueryCache } from '../app/session-query-cache';
import { SANDBOX_MODE_KEY } from '../lib/sandbox-mode';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn(), getApiClient: jest.fn() }));
jest.mock('../services/user-profile', () => ({
  ...jest.requireActual('../services/user-profile'),
  getOrCreateUserProfile: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function user(id: string): User {
  return {
    id, email: `${id}@example.invalid`, app_metadata: { role: 'tourism_agent' }, user_metadata: {},
    aud: 'authenticated', created_at: '2099-01-01T00:00:00Z',
  };
}

function profile(id: string, overrides: Partial<AppUserProfileRow> = {}): AppUserProfileRow {
  return {
    id, display_name: `Synthetic ${id}`, avatar_url: null, locale: 'fr', timezone: 'Indian/Reunion',
    role: 'tourism_agent', lang_prefs: ['fr'], preferences: { provider_only: id === 'account-a' },
    ...overrides,
  };
}

const PROBES = [
  'current_user_can_edit_objects', 'user_can_create_object', 'current_user_active_org',
  'current_user_admin_rank', 'current_user_admin_role_code', 'current_user_test_realm',
];

function authHarness(initialUser = user('account-a')) {
  let activeUser: User | null = initialUser;
  let inAuthCallback = false;
  const callbacks: Array<(event: AuthChangeEvent, session: Session | null) => unknown> = [];
  const unsubscribes: jest.Mock[] = [];
  const getUser = jest.fn(async () => {
    // A callback executes under the auth SDK's lock. A nested SDK operation
    // would be unsafe even if the callback did not await its returned promise.
    expect(inAuthCallback).toBe(false);
    return { data: { user: activeUser }, error: null };
  });
  const onAuthStateChange = jest.fn((callback: typeof callbacks[number]) => {
    callbacks.push(callback);
    const unsubscribe = jest.fn();
    unsubscribes.push(unsubscribe);
    return { data: { subscription: { unsubscribe } } };
  });
  const client = { auth: { getUser, onAuthStateChange } };
  jest.mocked(getSupabaseClient).mockReturnValue(client as unknown as ReturnType<typeof getSupabaseClient>);
  const dataFor = (name: string) => {
    if (name === 'current_user_active_org') return [{ org_id: `ORG-${activeUser?.id}`, org_name: 'Synthetic organisation' }];
    if (name === 'current_user_admin_rank') return 10;
    if (name === 'current_user_admin_role_code') return 'TEAM_LEAD';
    return name !== 'current_user_test_realm';
  };
  const rpc = jest.fn(async (name: string): Promise<{ data: unknown; error: null }> => ({ data: dataFor(name), error: null }));
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as unknown as ReturnType<typeof getApiClient>);
  jest.mocked(getOrCreateUserProfile).mockImplementation(async (current) => profile(current.id));
  const emit = (event: AuthChangeEvent, nextUser: User | null = activeUser, index = callbacks.length - 1) => {
    activeUser = nextUser;
    inAuthCallback = true;
    try {
      return callbacks[index](event, nextUser ? { user: nextUser } as Session : null);
    } finally {
      inAuthCallback = false;
    }
  };
  return { getUser, rpc, dataFor, emit, onAuthStateChange, unsubscribes };
}

async function finish<T>(pending: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => { pending.resolve(value); });
}

beforeEach(() => {
  jest.resetAllMocks();
  window.sessionStorage.clear();
  useSessionStore.getState().setGuest();
  useSessionStore.setState({ demoMode: false, status: 'booting', errorMessage: null, langPrefs: ['fr', 'en'] });
});

it('bootstraps a real ready session, preserving capabilities and provider preference', async () => {
  const auth = authHarness();
  renderHook(() => useBootstrapSession());
  await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
  expect(useSessionStore.getState()).toMatchObject({
    userId: 'account-a', role: 'tourism_agent', orgId: 'ORG-account-a',
    canEditObjects: true, canCreateObjects: true, adminRank: 10, langPrefs: ['fr'],
  });
  expect(auth.rpc.mock.calls.map(([name]) => name)).toEqual(PROBES);
  expect(useProviderScopeStore.getState()).toMatchObject({ userId: 'account-a', enabled: true });
});

it('starts all independent probes after the profile, without waiting for any earlier probe, and hydrates only the complete batch', async () => {
  const auth = authHarness();
  const pendingProfile = deferred<AppUserProfileRow>();
  jest.mocked(getOrCreateUserProfile).mockReturnValueOnce(pendingProfile.promise);
  const pending = new Map(PROBES.map((name) => [name, deferred<{ data: unknown; error: null }>()]));
  const trace: string[] = [];
  auth.rpc.mockImplementation((name) => {
    trace.push(`start:${name}`);
    return pending.get(name)!.promise;
  });
  renderHook(() => useBootstrapSession());
  await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(1));
  expect(auth.rpc).not.toHaveBeenCalled(); // The persona dependency remains sequential.
  await finish(pendingProfile, profile('account-a'));
  await waitFor(() => expect(auth.rpc).toHaveBeenCalledTimes(6));
  expect(trace).toEqual(PROBES.map((name) => `start:${name}`));
  expect(useSessionStore.getState().status).toBe('booting');
  expect(useProviderScopeStore.getState().userId).toBeNull();

  // Logical network trace: later requests can finish before the first. There is
  // one dependency frontier, not six round trips accumulated by the client.
  for (const name of PROBES.slice(1).reverse()) {
    trace.push(`finish:${name}`);
    await finish(pending.get(name)!, { data: auth.dataFor(name), error: null });
    expect(useSessionStore.getState().status).toBe('booting');
    expect(useProviderScopeStore.getState().userId).toBeNull();
  }
  trace.push(`finish:${PROBES[0]}`);
  await finish(pending.get(PROBES[0])!, { data: true, error: null });
  await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
  expect(useSessionStore.getState()).toMatchObject({ userId: 'account-a', orgId: 'ORG-account-a', canEditObjects: true, canCreateObjects: true });
  expect(useProviderScopeStore.getState()).toMatchObject({ userId: 'account-a', enabled: true });
  expect(trace.slice(0, 6).every((entry) => entry.startsWith('start:'))).toBe(true);
});

it.each(PROBES)('a failed parallel %s keeps its original neutral fallback and the other successful capability results', async (failedProbe) => {
  const auth = authHarness();
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const pending = new Map(PROBES.map((name) => [name, deferred<{ data: unknown; error: null }>()]));
  auth.rpc.mockImplementation((name) => pending.get(name)!.promise);
  try {
    renderHook(() => useBootstrapSession());
    await waitFor(() => expect(auth.rpc).toHaveBeenCalledTimes(6));
    await act(async () => { pending.get(failedProbe)!.reject(new Error('Synthetic probe unavailable')); });
    expect(useSessionStore.getState().status).toBe('booting');
    for (const name of PROBES.filter((probe) => probe !== failedProbe)) {
      await finish(pending.get(name)!, { data: name === 'current_user_test_realm' ? true : auth.dataFor(name), error: null });
    }
    await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
    expect(useSessionStore.getState()).toMatchObject({
      userId: 'account-a', role: 'tourism_agent',
      canEditObjects: failedProbe !== 'current_user_can_edit_objects',
      canCreateObjects: failedProbe !== 'user_can_create_object',
      orgId: failedProbe === 'current_user_active_org' ? null : 'ORG-account-a',
      adminRank: failedProbe === 'current_user_admin_rank' ? null : 10,
      adminRoleCode: failedProbe === 'current_user_admin_role_code' ? null : 'TEAM_LEAD',
      isTestRealm: failedProbe !== 'current_user_test_realm',
    });
    expect(warning).toHaveBeenCalledTimes(1);
  } finally { warning.mockRestore(); }
});

it('the sandbox realm check still refuses a batch whose unrelated permissions succeeded', async () => {
  const auth = authHarness();
  window.sessionStorage.setItem(SANDBOX_MODE_KEY, 'true');
  const realm = deferred<{ data: unknown; error: null }>();
  auth.rpc.mockImplementation(async (name) => name === 'current_user_test_realm'
    ? realm.promise : { data: auth.dataFor(name), error: null });
  renderHook(() => useBootstrapSession());
  await waitFor(() => expect(auth.rpc).toHaveBeenCalledTimes(6));
  expect(useSessionStore.getState().status).toBe('booting');
  await finish(realm, { data: false, error: null });
  await waitFor(() => expect(useSessionStore.getState().status).toBe('error'));
  expect(useSessionStore.getState().errorMessage).toContain('cloisonnement');
  expect(useProviderScopeStore.getState().userId).toBeNull();
});

it.each(['sign-out', 'unmount'])('a whole pending batch cannot publish after %s', async (transition) => {
  const auth = authHarness();
  const pending = new Map(PROBES.map((name) => [name, deferred<{ data: unknown; error: null }>()]));
  auth.rpc.mockImplementation((name) => pending.get(name)!.promise);
  const view = renderHook(() => useBootstrapSession());
  await waitFor(() => expect(auth.rpc).toHaveBeenCalledTimes(6));
  if (transition === 'sign-out') act(() => { auth.emit('SIGNED_OUT', null); });
  else view.unmount();
  const status = useSessionStore.getState().status;
  for (const name of PROBES) await finish(pending.get(name)!, { data: auth.dataFor(name), error: null });
  expect(useSessionStore.getState()).toMatchObject({ status, userId: null });
  expect(useProviderScopeStore.getState().userId).toBeNull();
});

it('SIGNED_OUT clears the session and populated cache immediately; a late profile cannot restore either', async () => {
  const auth = authHarness();
  const oldProfile = deferred<AppUserProfileRow>();
  jest.mocked(getOrCreateUserProfile).mockReturnValueOnce(oldProfile.promise);
  const cache = new QueryClient();
  const unbind = bindSessionQueryCache(cache, jest.fn());
  try {
    renderHook(() => useBootstrapSession());
    await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(1));
    cache.setQueryData(['crm', 'scope'], { owner: 'account-a' });
    act(() => { expect(auth.emit('SIGNED_OUT', null)).toBeUndefined(); });
    expect(useSessionStore.getState()).toMatchObject({ status: 'guest', userId: null, errorMessage: GUEST_SIGNED_OUT_MESSAGE });
    expect(cache.getQueryData(['crm', 'scope'])).toBeUndefined();
    await finish(oldProfile, profile('account-a', { lang_prefs: ['de'] }));
    expect(useSessionStore.getState()).toMatchObject({ status: 'guest', userId: null });
    expect(useProviderScopeStore.getState().userId).toBeNull();
    expect(useExplorerStore.getState().common.providerOnly).toBe(false);
    expect(useDashboardExplorerStore.getState().common.providerOnly).toBe(false);
    expect(auth.getUser).toHaveBeenCalledTimes(1); // SIGNED_OUT does not wait for another SDK call.
    expect(auth.rpc).not.toHaveBeenCalled();
  } finally {
    unbind();
    cache.clear();
  }
});

it('A→B ignores the late profile, language and provider preference of A without clearing B’s cache', async () => {
  const auth = authHarness();
  const oldProfile = deferred<AppUserProfileRow>();
  jest.mocked(getOrCreateUserProfile).mockReturnValueOnce(oldProfile.promise);
  const cache = new QueryClient();
  const removePersisted = jest.fn();
  const unbind = bindSessionQueryCache(cache, removePersisted);
  try {
    renderHook(() => useBootstrapSession());
    await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(1));
    act(() => { auth.emit('SIGNED_IN', user('account-b')); });
    await waitFor(() => expect(useSessionStore.getState().userId).toBe('account-b'));
    cache.setQueryData(['crm', 'scope'], { owner: 'account-b' });
    const evictions = removePersisted.mock.calls.length;
    await finish(oldProfile, profile('account-a', { lang_prefs: ['de'] }));
    expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'account-b', langPrefs: ['fr'], orgId: 'ORG-account-b' });
    expect(useProviderScopeStore.getState()).toMatchObject({ userId: 'account-b', enabled: false });
    expect(cache.getQueryData(['crm', 'scope'])).toEqual({ owner: 'account-b' });
    expect(removePersisted).toHaveBeenCalledTimes(evictions);
  } finally {
    unbind();
    cache.clear();
  }
});

it.each(['current_user_can_edit_objects', 'current_user_active_org', 'current_user_test_realm'])(
  'a late %s result cannot initialize the old preference or continue probing after B is ready',
  async (blockedProbe) => {
    const auth = authHarness();
    const oldResult = deferred<{ data: unknown; error: null }>();
    let blocked = false;
    auth.rpc.mockImplementation(async (name) => {
      if (name === blockedProbe && !blocked) {
        blocked = true;
        return oldResult.promise;
      }
      return { data: auth.dataFor(name), error: null };
    });
    renderHook(() => useBootstrapSession());
    await waitFor(() => expect(blocked).toBe(true));
    expect(useProviderScopeStore.getState().userId).toBeNull();
    act(() => { auth.emit('SIGNED_IN', user('account-b')); });
    await waitFor(() => expect(useSessionStore.getState().userId).toBe('account-b'));
    const probeCount = auth.rpc.mock.calls.length;
    await finish(oldResult, { data: [{ org_id: 'ORG-old', org_name: 'Synthetic old' }], error: null });
    expect(useSessionStore.getState()).toMatchObject({ userId: 'account-b', orgId: 'ORG-account-b' });
    expect(useProviderScopeStore.getState()).toMatchObject({ userId: 'account-b', enabled: false });
    expect(auth.rpc).toHaveBeenCalledTimes(probeCount);
  },
);

it('same-user role and ORG refresh keeps the newest context when an earlier ORG response arrives late', async () => {
  const auth = authHarness();
  renderHook(() => useBootstrapSession());
  await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
  const oldOrg = deferred<{ data: unknown; error: null }>();
  let blocked = false;
  auth.rpc.mockImplementation(async (name) => {
    if (name === 'current_user_active_org' && !blocked) { blocked = true; return oldOrg.promise; }
    return { data: auth.dataFor(name), error: null };
  });
  act(() => { auth.emit('USER_UPDATED'); });
  await waitFor(() => expect(blocked).toBe(true));
  jest.mocked(getOrCreateUserProfile).mockResolvedValue(profile('account-a', { role: 'owner', lang_prefs: ['en'] }));
  auth.rpc.mockImplementation(async (name) => ({
    data: name === 'current_user_active_org' ? [{ org_id: 'ORG-new', org_name: 'Synthetic new' }] : auth.dataFor(name), error: null,
  }));
  act(() => { auth.emit('TOKEN_REFRESHED'); });
  expect(useSessionStore.getState().status).toBe('ready'); // Existing refresh UX stays available.
  await waitFor(() => expect(useSessionStore.getState().orgId).toBe('ORG-new'));
  await finish(oldOrg, { data: [{ org_id: 'ORG-old', org_name: 'Synthetic old' }], error: null });
  expect(useSessionStore.getState()).toMatchObject({ status: 'ready', role: 'owner', orgId: 'ORG-new', langPrefs: ['en'] });
});

it('INITIAL_SESSION coalesces with the pending bootstrap and runs outside the auth callback', async () => {
  const auth = authHarness();
  renderHook(() => useBootstrapSession());
  act(() => { expect(auth.emit('INITIAL_SESSION')).toBeUndefined(); });
  expect(auth.getUser).not.toHaveBeenCalled();
  await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
  expect(auth.getUser).toHaveBeenCalledTimes(1);
  expect(getOrCreateUserProfile).toHaveBeenCalledTimes(1);
});

it('a synchronous SIGNED_OUT notification while subscribing is not superseded by the fallback bootstrap', async () => {
  const auth = authHarness();
  auth.onAuthStateChange.mockImplementationOnce((callback) => {
    callback('SIGNED_OUT', null);
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  renderHook(() => useBootstrapSession());
  expect(useSessionStore.getState()).toMatchObject({ status: 'guest', userId: null, errorMessage: GUEST_SIGNED_OUT_MESSAGE });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(auth.getUser).not.toHaveBeenCalled();
});

it('TOKEN_REFRESHED invalidates an older getUser response while actor bootstrap retains its narrow guards', async () => {
  const auth = authHarness();
  const oldAuth = deferred<Awaited<ReturnType<typeof auth.getUser>>>();
  auth.getUser.mockReturnValueOnce(oldAuth.promise);
  renderHook(() => useBootstrapSession());
  await waitFor(() => expect(auth.getUser).toHaveBeenCalledTimes(1));
  jest.mocked(getOrCreateUserProfile).mockResolvedValue(profile('account-a', { role: 'actor' }));
  act(() => { auth.emit('TOKEN_REFRESHED'); });
  await waitFor(() => expect(useSessionStore.getState().role).toBe('actor'));
  await finish(oldAuth, { data: { user: null }, error: null });
  expect(useSessionStore.getState()).toMatchObject({ status: 'ready', role: 'actor', canEditObjects: false, canCreateObjects: false, orgId: null });
  expect(auth.rpc.mock.calls.map(([name]) => name)).toEqual(['current_user_test_realm']);
});

it('StrictMode cancels the first scheduled bootstrap, and unmount blocks a pending profile and retained callback', async () => {
  const auth = authHarness();
  const pendingProfile = deferred<AppUserProfileRow>();
  jest.mocked(getOrCreateUserProfile).mockReturnValueOnce(pendingProfile.promise);
  const view = renderHook(() => useBootstrapSession(), { reactStrictMode: true });
  await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(1));
  expect(auth.onAuthStateChange).toHaveBeenCalledTimes(2);
  expect(auth.getUser).toHaveBeenCalledTimes(1);
  expect(auth.unsubscribes[0]).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(auth.unsubscribes[1]).toHaveBeenCalledTimes(1);
  await finish(pendingProfile, profile('account-a'));
  act(() => { auth.emit('SIGNED_OUT', null); });
  expect(useSessionStore.getState().status).toBe('booting');
  expect(useSessionStore.getState().userId).toBeNull();
  expect(useProviderScopeStore.getState().userId).toBeNull();
});

it('a rejected obsolete profile does not replace a newer ready session with an error', async () => {
  const auth = authHarness();
  const oldProfile = deferred<AppUserProfileRow>();
  jest.mocked(getOrCreateUserProfile).mockReturnValueOnce(oldProfile.promise);
  renderHook(() => useBootstrapSession());
  await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(1));
  act(() => { auth.emit('SIGNED_IN', user('account-b')); });
  await waitFor(() => expect(useSessionStore.getState().userId).toBe('account-b'));
  await act(async () => { oldProfile.reject(new Error('Synthetic late failure')); });
  expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'account-b', errorMessage: null });
});

import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createClient, type AuthChangeEvent, type Session, type User } from '@supabase/supabase-js';
import { useBootstrapSession } from './useBootstrapSession';
import { useRestoreObjectVersionMutation } from './useExplorerQueries';
import { useSessionStore } from '@/store/session-store';
import { getApiClient, getSupabaseClient } from '@/lib/supabase';
import { getOrCreateUserProfile, type AppUserProfileRow } from '@/services/user-profile';

// Actual bootstrap, mutation, service and SDK request builder. Auth notification,
// profile/probes and final transport are synthetic; no socket or hosted service.
jest.mock('@/lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/services/user-profile', () => ({ ...jest.requireActual('@/services/user-profile'), getOrCreateUserProfile: jest.fn() }));

const OBJECT = 'PCURUN0000000001';
const user = (id: string): User => ({ id, email: `${id}@example.invalid`, app_metadata: { role: 'tourism_agent' }, user_metadata: {}, aud: 'authenticated', created_at: '2099-01-01T00:00:00Z' });
const profile = (id: string): AppUserProfileRow => ({ id, display_name: id, role: 'tourism_agent', avatar_url: null, locale: 'fr', timezone: 'Indian/Reunion', lang_prefs: ['fr'], preferences: {} });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
const clients: QueryClient[] = [];
function RestorePage() {
  useBootstrapSession();
  const mutation = useRestoreObjectVersionMutation(OBJECT);
  return <button onClick={() => mutation.mutate(2)}>Restore synthetic version</button>;
}
beforeAll(() => {
  global.TextEncoder = require('node:util').TextEncoder; global.TextDecoder = require('node:util').TextDecoder;
  Object.assign(globalThis, require('node:stream/web'));
  const web = require('next/dist/compiled/@edge-runtime/primitives/fetch');
  global.Headers = web.Headers; global.Response = web.Response; global.Request = web.Request;
});
beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ ...useSessionStore.getInitialState(), demoMode: false, status: 'booting' });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
});

it.each(['old B', 'new B', 'old ABA', 'new ABA', 'queued ABA', 'same A', 'sign-in A', 'refresh A'] as const)
  ('binds restoration to synchronous Auth authority before delayed hydration: %s', async (mode) => {
    let currentUser = user('user-A'), paused = false, inCallback = false;
    let notify!: (event: AuthChangeEvent, session: Session | null) => unknown;
    const hydration = deferred<AppUserProfileRow>(), entered = deferred<void>(), authToken = deferred<unknown>();
    const admitted: { token: string; objectId: string; version: number }[] = [];
    const transport = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)); expect(url.origin).toBe('https://synthetic.invalid');
      expect(url.pathname).toBe('/rest/v1/rpc/rpc_restore_object_version'); expect(init?.method).toBe('POST');
      if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
      const body = JSON.parse(String(init?.body)); const bearer = new Headers(init?.headers).get('authorization') ?? '';
      admitted.push({ token: bearer.includes('TOKEN_B') ? 'B' : bearer.includes('REFRESH_A') ? 'refreshA' : 'A', objectId: body.p_object_id, version: body.p_version_number });
      return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const sdk = createClient('https://synthetic.invalid', 'SYNTHETIC_ANON_NOT_A_KEY', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `version-authority-${mode}` }, global: { fetch: transport } });
    await sdk.auth.initialize();
    jest.spyOn(sdk.auth, 'getSession').mockImplementation(() => { entered.resolve(); return authToken.promise as never; });
    jest.mocked(getSupabaseClient).mockReturnValue({ auth: {
      getUser: jest.fn(async () => { expect(inCallback).toBe(false); return { data: { user: currentUser }, error: null }; }),
      onAuthStateChange: jest.fn((callback: typeof notify) => { notify = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
    } } as unknown as ReturnType<typeof getSupabaseClient>);
    jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc: (name: string, args: never) => {
      if (name === 'rpc_restore_object_version') return sdk.schema('api').rpc(name, args);
      return Promise.resolve({ data: name === 'current_user_active_org' ? [{ org_id: 'ORG1', org_name: 'Synthetic ORG' }] : name === 'current_user_test_realm' ? false : name === 'current_user_admin_rank' || name === 'current_user_admin_role_code' ? null : true, error: null });
    } }) } as unknown as ReturnType<typeof getApiClient>);
    jest.mocked(getOrCreateUserProfile).mockImplementation(async (active) => paused ? hydration.promise : profile(active.id));
    const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(query);
    render(<QueryClientProvider client={query}><RestorePage /></QueryClientProvider>);
    await waitFor(() => expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'user-A', orgId: 'ORG1' }));
    const gesture = () => fireEvent.click(screen.getByRole('button', { name: 'Restore synthetic version' }));
    const oldWriter = !mode.startsWith('new');
    if (mode === 'queued ABA') onlineManager.setOnline(false);
    if (oldWriter) {
      gesture();
      if (mode === 'queued ABA') await waitFor(() => expect(query.getMutationCache().getAll()[0].state.isPaused).toBe(true));
      else { await entered.promise; expect(transport).not.toHaveBeenCalled(); }
    }
    paused = true;
    const emit = (event: AuthChangeEvent, id: string) => {
      currentUser = user(id); inCallback = true;
      try { expect(notify(event, { user: currentUser } as Session)).toBeUndefined(); }
      finally { inCallback = false; }
    };
    act(() => {
      if (mode.includes('B') || mode.includes('ABA')) emit('SIGNED_IN', 'user-B');
      if (mode.includes('ABA')) emit('SIGNED_IN', 'user-A');
      if (mode === 'sign-in A') emit('SIGNED_IN', 'user-A');
      if (mode === 'refresh A') emit('TOKEN_REFRESHED', 'user-A');
    });
    if (mode !== 'same A') await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(2));
    // The real bootstrap has observed the next subject, but deliberately keeps
    // the old profile/screen until the awaited profile has been hydrated.
    expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'user-A', orgId: 'ORG1' });
    if (!oldWriter) gesture();
    await act(async () => { authToken.resolve({ data: { session: { access_token: mode.includes('B') && !mode.includes('ABA') ? 'SYNTHETIC_TOKEN_B' : mode === 'refresh A' ? 'SYNTHETIC_REFRESH_A' : 'SYNTHETIC_TOKEN_A' } }, error: null }); });
    if (mode === 'queued ABA') {
      await act(async () => { hydration.resolve(profile('user-A')); });
      await waitFor(() => expect(useSessionStore.getState().authAuthority?.hydrated).toBe(true));
      act(() => onlineManager.setOnline(true));
    }
    await waitFor(() => expect(query.getMutationCache().getAll().every((mutation) => mutation.state.status !== 'pending')).toBe(true));
    if (mode === 'same A' || mode === 'sign-in A' || mode === 'refresh A') {
      expect(admitted).toEqual([{ token: mode === 'refresh A' ? 'refreshA' : 'A', objectId: OBJECT, version: 2 }]);
    } else expect(admitted).toEqual([]);
    if (mode !== 'same A' && mode !== 'queued ABA') {
      await act(async () => { hydration.resolve(profile(currentUser.id)); });
      await waitFor(() => expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: currentUser.id }));
      if (mode === 'new B') {
        gesture();
        await waitFor(() => expect(admitted).toEqual([{ token: 'B', objectId: OBJECT, version: 2 }]));
      }
    }
  });

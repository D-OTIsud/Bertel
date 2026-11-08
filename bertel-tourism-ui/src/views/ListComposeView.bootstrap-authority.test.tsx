import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createClient, type AuthChangeEvent, type Session, type User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useSessionStore } from '@/store/session-store';
import { getApiClient, getSupabaseClient } from '@/lib/supabase';
import { getOrCreateUserProfile, type AppUserProfileRow } from '@/services/user-profile';
import { getList, listsQueryKeys, parseListDetail } from '@/services/lists';

// Real bootstrap, page, QueryClient, updateList and SDK. Only the Auth event,
// profile/probe responses and final HTTP transport are synthetic (no socket).
jest.mock('@/lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/services/user-profile', () => ({ ...jest.requireActual('@/services/user-profile'), getOrCreateUserProfile: jest.fn() }));
jest.mock('@/services/lists', () => ({ ...jest.requireActual('@/services/lists'), getList: jest.fn(), getListEmailContext: jest.fn() }));
jest.mock('@/features/object-editor/useObjectSearch', () => ({ useObjectSearch: () => ({ results: [], loading: false }) }));
jest.mock('@/hooks/useServiceAvailability', () => ({ useServiceAvailability: () => ({ translation: false, imageAnalysis: false, email: false }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/features/lists/OtiTemplate', () => ({ __esModule: true, default: () => <div />, itemsToOtiPois: () => [] }));
jest.mock('@/features/lists/ChannelFrame', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const LIST = '52000000-0000-4000-8000-000000000020';
const raw = (name = 'Original A') => ({ id: LIST, name, kind: 'static', lang: 'fr', created_by: 'user-A', org_object_id: 'ORG1', can_edit: true, can_manage_sharing: true, items: [] });
const user = (id: string): User => ({ id, email: `${id}@example.invalid`, app_metadata: { role: 'tourism_agent' }, user_metadata: {}, aud: 'authenticated', created_at: '2099-01-01T00:00:00Z' });
const profile = (id: string): AppUserProfileRow => ({ id, display_name: id, role: 'tourism_agent', avatar_url: null, locale: 'fr', timezone: 'Indian/Reunion', lang_prefs: ['fr'], preferences: {} });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
const clients: QueryClient[] = [];
function BootstrapPage() { useBootstrapSession(); return <ListComposeView listId={LIST} />; }
beforeAll(() => {
  global.TextEncoder = require('node:util').TextEncoder; global.TextDecoder = require('node:util').TextDecoder;
  Object.assign(globalThis, require('node:stream/web'));
  const web = require('next/dist/compiled/@edge-runtime/primitives/fetch');
  global.Headers = web.Headers; global.Response = web.Response; global.Request = web.Request;
});
beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ ...useSessionStore.getInitialState(), demoMode: false, status: 'booting' });
  jest.mocked(getList).mockResolvedValue(parseListDetail(raw()));
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

it.each(['old B', 'new B', 'old ABA', 'new ABA', 'same A', 'sign-in A', 'refresh A'] as const)
  ('separates synchronous Auth authority from delayed profile hydration: %s', async (mode) => {
    let currentUser = user('user-A'), paused = false, inCallback = false;
    let notify!: (event: AuthChangeEvent, session: Session | null) => unknown;
    const hydration = deferred<AppUserProfileRow>(), entered = deferred<void>(), authToken = deferred<unknown>();
    const admitted: { token: string; name: string }[] = [];
    const transport = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)); expect(url.origin).toBe('https://synthetic.invalid');
      expect(url.pathname).toBe('/rest/v1/rpc/update_list'); expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)); expect(body.p_list_id).toBe(LIST);
      const headers = new Headers(init?.headers); const bearer = headers.get('authorization') ?? '';
      if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
      admitted.push({ token: bearer.includes('TOKEN_B') ? 'B' : bearer.includes('REFRESH_A') ? 'refreshA' : 'A', name: body.p_patch.name });
      return new Response(JSON.stringify(raw(body.p_patch.name)), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const sdk = createClient('https://synthetic.invalid', 'SYNTHETIC_ANON_NOT_A_KEY', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `bootstrap-authority-${mode}` }, global: { fetch: transport } });
    await sdk.auth.initialize();
    jest.spyOn(sdk.auth, 'getSession').mockImplementation(() => { entered.resolve(); return authToken.promise as never; });
    jest.mocked(getSupabaseClient).mockReturnValue({ auth: {
      getUser: jest.fn(async () => { expect(inCallback).toBe(false); return { data: { user: currentUser }, error: null }; }),
      onAuthStateChange: jest.fn((callback: typeof notify) => { notify = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
    } } as unknown as ReturnType<typeof getSupabaseClient>);
    // The six existing read-only probes are synthetic. The actual writer builder
    // and its Auth wait still execute in the unmodified Supabase SDK.
    jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc: (name: string, args: never) => {
      if (name === 'update_list') return sdk.schema('api').rpc(name, args);
      return Promise.resolve({ data: name === 'current_user_active_org' ? [{ org_id: 'ORG1', org_name: 'Synthetic ORG' }] : name === 'current_user_test_realm' ? false : name === 'current_user_admin_rank' || name === 'current_user_admin_role_code' ? null : true, error: null });
    } }) } as unknown as ReturnType<typeof getApiClient>);
    jest.mocked(getOrCreateUserProfile).mockImplementation(async (active) => paused ? hydration.promise : profile(active.id));
    const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } }); clients.push(query);
    for (const id of ['user-A', 'user-B']) query.setQueryData(listsQueryKeys.detail(LIST, id, 'ORG1'), parseListDetail(raw()));
    render(<QueryClientProvider client={query}><BootstrapPage /></QueryClientProvider>);
    await waitFor(() => expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'user-A', orgId: 'ORG1' }));
    const gesture = (name: string) => { const field = screen.getByLabelText('Nom de la liste'); fireEvent.change(field, { target: { value: name } }); fireEvent.blur(field); };
    const oldWriter = !mode.startsWith('new');
    if (oldWriter) { gesture('Sent A'); await entered.promise; expect(transport).not.toHaveBeenCalled(); }
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
    // No explicit store transition to B: the real bootstrap intentionally keeps
    // the existing screen/profile A until the new profile/probes are complete.
    expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'user-A', orgId: 'ORG1' });
    if (!oldWriter) gesture('New draft A');
    await act(async () => { authToken.resolve({ data: { session: { access_token: mode.includes('B') && !mode.includes('ABA') ? 'SYNTHETIC_TOKEN_B' : mode === 'refresh A' ? 'SYNTHETIC_REFRESH_A' : 'SYNTHETIC_TOKEN_A' } }, error: null }); });
    await waitFor(() => expect(query.getMutationCache().getAll().every((mutation) => mutation.state.status !== 'pending')).toBe(true));
    if (mode === 'same A' || mode === 'sign-in A' || mode === 'refresh A') {
      expect(admitted).toEqual([{ token: mode === 'refresh A' ? 'refreshA' : 'A', name: 'Sent A' }]);
    } else {
      expect(admitted).toEqual([]);
      if (!oldWriter) expect(screen.getByLabelText('Nom de la liste')).toHaveValue('New draft A');
    }
    if (mode !== 'same A') {
      await act(async () => { hydration.resolve(profile(currentUser.id)); });
      await waitFor(() => expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: currentUser.id }));
      if (mode === 'new B') {
        gesture('Visible B');
        await waitFor(() => expect(admitted).toEqual([{ token: 'B', name: 'Visible B' }]));
      }
    }
  });

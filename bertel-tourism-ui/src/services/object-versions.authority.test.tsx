import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createClient, type AuthChangeEvent, type Session, type User } from '@supabase/supabase-js';
import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { useSessionStore } from '@/store/session-store';
import { getApiClient, getSupabaseClient } from '@/lib/supabase';
import { getOrCreateUserProfile, type AppUserProfileRow } from './user-profile';
import { getObjectVersions, getObjectVersionSnapshot, restoreObjectVersion } from './object-versions';

jest.mock('@/lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('./user-profile', () => ({ ...jest.requireActual('./user-profile'), getOrCreateUserProfile: jest.fn() }));

const OBJECT = 'PCURUN0000000001';
const user = (id: string): User => ({ id, email: `${id}@example.invalid`, app_metadata: { role: 'tourism_agent' }, user_metadata: {}, aud: 'authenticated', created_at: '2099-01-01T00:00:00Z' });
const profile = (id: string): AppUserProfileRow => ({ id, display_name: id, role: 'tourism_agent', avatar_url: null, locale: 'fr', timezone: 'Indian/Reunion', lang_prefs: ['fr'], preferences: {} });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
function Bootstrap() { useBootstrapSession(); return null; }
const operations = [
  { name: 'history', rpc: 'get_object_versions', run: () => getObjectVersions(OBJECT), data: [], value: [] },
  { name: 'snapshot', rpc: 'get_object_version_snapshot', run: () => getObjectVersionSnapshot(OBJECT, 2), data: { name: 'Version 2' }, value: { name: 'Version 2' } },
  { name: 'restore', rpc: 'rpc_restore_object_version', run: () => restoreObjectVersion(OBJECT, 2), data: null, value: undefined },
] as const;
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
afterEach(cleanup);

describe.each(operations)('$name authority', (operation) => {
  it.each(['old B', 'new B', 'old ABA', 'late B', 'same A', 'refresh A'] as const)
    ('guards the actual SDK request and its result: %s', async (mode) => {
      let currentUser = user('user-A'), pauseProfile = false, inCallback = false;
      let notify!: (event: AuthChangeEvent, session: Session | null) => unknown;
      const hydration = deferred<AppUserProfileRow>(), authEntered = deferred<void>(), transportEntered = deferred<void>();
      const token = deferred<unknown>(), reply = deferred<void>();
      const admitted: string[] = [], requestSignals: (AbortSignal | null | undefined)[] = [];
      const transport = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input)); expect(url.origin).toBe('https://synthetic.invalid');
        expect(url.pathname).toBe(`/rest/v1/rpc/${operation.rpc}`);
        expect(JSON.parse(String(init?.body)).p_object_id).toBe(OBJECT);
        requestSignals.push(init?.signal);
        if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
        const bearer = new Headers(init?.headers).get('authorization') ?? '';
        admitted.push(bearer.includes('TOKEN_B') ? 'B' : 'A');
        transportEntered.resolve();
        // For late B deliberately ignore abort AFTER admission. The service
        // must refuse the stale result; it cannot undo that earlier request.
        if (mode === 'late B') await reply.promise;
        return new Response(JSON.stringify(operation.data), { status: 200, headers: { 'content-type': 'application/json' } });
      });
      const sdk = createClient('https://synthetic.invalid', 'SYNTHETIC_ANON_NOT_A_KEY', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `versions-${operation.name}-${mode}` }, global: { fetch: transport } });
      await sdk.auth.initialize();
      jest.spyOn(sdk.auth, 'getSession').mockImplementation(() => { authEntered.resolve(); return token.promise as never; });
      jest.mocked(getSupabaseClient).mockReturnValue({ auth: {
        getUser: jest.fn(async () => { expect(inCallback).toBe(false); return { data: { user: currentUser }, error: null }; }),
        onAuthStateChange: jest.fn((callback: typeof notify) => { notify = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
      } } as unknown as ReturnType<typeof getSupabaseClient>);
      jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc: (name: string, args: never) => {
        if (name === operation.rpc) return sdk.schema('api').rpc(name, args);
        return Promise.resolve({ data: name === 'current_user_active_org' ? [{ org_id: 'ORG1', org_name: 'Synthetic ORG' }] : name === 'current_user_test_realm' ? false : name === 'current_user_admin_rank' || name === 'current_user_admin_role_code' ? null : true, error: null });
      } }) } as unknown as ReturnType<typeof getApiClient>);
      jest.mocked(getOrCreateUserProfile).mockImplementation(async (active) => pauseProfile ? hydration.promise : profile(active.id));
      render(<Bootstrap />);
      await waitFor(() => expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'user-A', orgId: 'ORG1' }));
      const outcomes: { ok: boolean; value?: unknown }[] = [];
      const call = () => operation.run().then(value => outcomes.push({ ok: true, value }), () => outcomes.push({ ok: false }));
      let pending: Promise<unknown> | undefined;
      if (mode !== 'new B') {
        pending = call(); await authEntered.promise;
        expect(transport).not.toHaveBeenCalled();
      }
      if (mode === 'late B') {
        token.resolve({ data: { session: { access_token: 'SYNTHETIC_TOKEN_A' } }, error: null });
        await transportEntered.promise;
      }
      pauseProfile = true;
      const emit = (event: AuthChangeEvent, id: string) => {
        currentUser = user(id); inCallback = true;
        try { expect(notify(event, { user: currentUser } as Session)).toBeUndefined(); }
        finally { inCallback = false; }
      };
      act(() => {
        if (mode.includes('B') || mode.includes('ABA')) emit('SIGNED_IN', 'user-B');
        if (mode.includes('ABA')) emit('SIGNED_IN', 'user-A');
        if (mode === 'refresh A') emit('TOKEN_REFRESHED', 'user-A');
      });
      if (mode !== 'same A') await waitFor(() => expect(getOrCreateUserProfile).toHaveBeenCalledTimes(2));
      expect(useSessionStore.getState()).toMatchObject({ status: 'ready', userId: 'user-A', orgId: 'ORG1' });
      if (mode === 'new B') pending = call();
      await act(async () => {
        token.resolve({ data: { session: { access_token: mode.includes('B') && !mode.includes('ABA') ? 'SYNTHETIC_TOKEN_B' : 'SYNTHETIC_TOKEN_A' } }, error: null });
        reply.resolve(); await pending;
      });
      if (mode === 'same A' || mode === 'refresh A') {
        expect(admitted).toEqual(['A']);
        expect(outcomes).toEqual([{ ok: true, value: operation.value }]);
      } else {
        expect(admitted).toEqual(mode === 'late B' ? ['A'] : []);
        expect(outcomes).toEqual([{ ok: false }]);
        if (mode === 'late B' || mode.startsWith('old')) {
          expect(requestSignals).toHaveLength(1);
          expect(requestSignals.every(signal => signal?.aborted === true)).toBe(true);
        }
      }
      if (mode !== 'same A') await act(async () => { hydration.resolve(profile(currentUser.id)); });
    });
});

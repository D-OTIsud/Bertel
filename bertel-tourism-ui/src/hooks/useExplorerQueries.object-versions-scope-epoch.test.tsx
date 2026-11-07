import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import { useRestoreObjectVersionMutation } from './useExplorerQueries';
import { useSessionStore } from '@/store/session-store';
import { getApiClient } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn(() => null) }));
const OBJECT = 'PCURUN0000000001';
const clients: QueryClient[] = [];
function Page() {
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
  useSessionStore.setState({ ...useSessionStore.getInitialState(), demoMode: false, status: 'ready',
    userId: 'user-A', orgId: 'ORG1', role: 'tourism_agent', canEditObjects: true,
    adminRank: null, isTestRealm: false, authAuthority: { userId: 'user-A', epoch: 1, hydrated: true } });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
});

it.each(['rank', 'realm', 'demo', 'unchanged'] as const)
  ('preserves the paused restore gesture scope across an isolated %s transition', async (mode) => {
    const admitted: string[] = [];
    const transport = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(input)).origin).toBe('https://synthetic.invalid');
      expect(new URL(String(input)).pathname).toBe('/rest/v1/rpc/rpc_restore_object_version');
      expect(JSON.parse(String(init?.body))).toEqual({ p_object_id: OBJECT, p_version_number: 2 });
      if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
      admitted.push(new Headers(init?.headers).get('authorization') ?? '');
      return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const sdk = createClient('https://synthetic.invalid', 'SYNTHETIC_ANON_NOT_A_KEY', { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `version-scope-${mode}`,
    }, global: { fetch: transport } });
    await sdk.auth.initialize();
    jest.spyOn(sdk.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'SYNTHETIC_TOKEN_A' } }, error: null } as never);
    jest.mocked(getApiClient).mockReturnValue(sdk);
    const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(query);
    render(<QueryClientProvider client={query}><Page /></QueryClientProvider>);
    act(() => onlineManager.setOnline(false));
    fireEvent.click(screen.getByRole('button', { name: 'Restore synthetic version' }));
    await waitFor(() => expect(query.getMutationCache().getAll()[0].state.isPaused).toBe(true));
    expect(transport).not.toHaveBeenCalled();
    const authority = useSessionStore.getState().authAuthority;
    act(() => {
      if (mode === 'rank') useSessionStore.setState({ adminRank: 10 });
      if (mode === 'realm') useSessionStore.setState({ isTestRealm: true });
      if (mode === 'demo') useSessionStore.setState({ demoMode: true });
    });
    expect(useSessionStore.getState()).toMatchObject({ userId: 'user-A', orgId: 'ORG1', status: 'ready' });
    expect(useSessionStore.getState().authAuthority).toBe(authority);
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(query.getMutationCache().getAll()[0].state.status).not.toBe('pending'));
    if (mode === 'unchanged') {
      expect(admitted).toEqual(['Bearer SYNTHETIC_TOKEN_A']);
      expect(query.getMutationCache().getAll()[0].state.status).toBe('success');
    } else {
      expect(admitted).toEqual([]);
      // Demo already emitted no RPC on8cb, but incorrectly acknowledged the old
      // live gesture as successful. It must be rejected rather than repurposed.
      expect(query.getMutationCache().getAll()[0].state.status).toBe('error');
    }
  });

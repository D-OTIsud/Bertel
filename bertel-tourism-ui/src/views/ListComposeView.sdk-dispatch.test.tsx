import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { useSessionStore } from '@/store/session-store';
import { getApiClient } from '@/lib/supabase';
import { getList, listsQueryKeys, parseListDetail } from '@/services/lists';

// Real page, QueryClient, updateList service and SDK 2.99.1. Only Auth and HTTP
// are synthetic. No socket/provider/GoTrue or real credential is used.
jest.mock('@/lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('@/services/lists', () => ({ ...jest.requireActual('@/services/lists'), getList: jest.fn(), getListEmailContext: jest.fn() }));
jest.mock('@/features/object-editor/useObjectSearch', () => ({ useObjectSearch: () => ({ results: [], loading: false }) }));
jest.mock('@/hooks/useServiceAvailability', () => ({ useServiceAvailability: () => ({ translation: false, imageAnalysis: false, email: false }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/features/lists/OtiTemplate', () => ({ __esModule: true, default: () => <div />, itemsToOtiPois: () => [] }));
jest.mock('@/features/lists/ChannelFrame', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const LIST = '52000000-0000-4000-8000-000000000020';
const raw = (name = 'Original A') => ({ id: LIST, name, kind: 'static', lang: 'fr', created_by: 'user-A', org_object_id: 'ORG1', can_edit: true, can_manage_sharing: true, items: [] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
const clients: QueryClient[] = [];
beforeAll(() => {
  // jsdom lacks Fetch constructors. These are the existing Next runtime's real
  // Web API classes, not a substitute implementation of the Supabase SDK.
  global.TextEncoder = require('node:util').TextEncoder; global.TextDecoder = require('node:util').TextDecoder;
  Object.assign(globalThis, require('node:stream/web'));
  const web = require('next/dist/compiled/@edge-runtime/primitives/fetch');
  global.Headers = web.Headers; global.Response = web.Response; global.Request = web.Request;
});
beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ userId: 'user-A', orgId: 'ORG1', status: 'ready', role: 'tourism_agent', demoMode: false, canEditObjects: true, isTestRealm: false, adminRank: null });
  jest.mocked(getList).mockResolvedValue(parseListDetail(raw()));
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

it.each(['same A', 'A token refresh', 'other B', 'account ABA', 'unmount'] as const)
  ('gates the effective SDK HTTP dispatch after deferred Auth: %s', async (mode) => {
    const entered = deferred<void>(), token = deferred<unknown>();
    const attempts: { token: string; aborted: boolean }[] = [], admitted: string[] = [];
    const transport = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)); expect(url.origin).toBe('https://synthetic.invalid');
      expect(url.pathname).toBe('/rest/v1/rpc/update_list'); expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers); expect(headers.get('content-profile')).toBe('api');
      const body = JSON.parse(String(init?.body)); expect(body).toEqual({ p_list_id: LIST, p_patch: { name: 'Sent A' } });
      const bearer = headers.get('authorization') ?? '';
      const label = bearer.includes('TOKEN_B') ? 'B' : bearer.includes('REFRESH_A') ? 'refreshA' : 'A';
      attempts.push({ token: label, aborted: init?.signal?.aborted === true });
      // Match native fetch: an already-aborted signal does not admit HTTP.
      if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
      admitted.push(label); return new Response(JSON.stringify(raw('Sent A')), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const sdk = createClient('https://synthetic.invalid', 'SYNTHETIC_ANON_NOT_A_KEY', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `synthetic-dispatch-${mode}` }, global: { fetch: transport } });
    await sdk.auth.initialize();
    jest.spyOn(sdk.auth, 'getSession').mockImplementation(() => { entered.resolve(); return token.promise as never; });
    jest.mocked(getApiClient).mockReturnValue(sdk as never);
    const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } }); clients.push(query);
    for (const user of ['user-A','user-B']) query.setQueryData(listsQueryKeys.detail(LIST, user, 'ORG1'), parseListDetail(raw()));
    const view = render(<QueryClientProvider client={query}><ListComposeView listId={LIST} /></QueryClientProvider>);
    const field = await screen.findByLabelText('Nom de la liste'); fireEvent.change(field, { target: { value: 'Sent A' } }); fireEvent.blur(field);
    await entered.promise; expect(transport).not.toHaveBeenCalled();
    if (mode === 'other B' || mode === 'account ABA') act(() => { useSessionStore.setState({ userId: 'user-B' }); if (mode === 'account ABA') useSessionStore.setState({ userId: 'user-A' }); });
    if (mode === 'unmount') view.unmount();
    await act(async () => { token.resolve({ data: { session: { access_token: mode === 'other B' ? 'SYNTHETIC_TOKEN_B' : mode === 'A token refresh' ? 'SYNTHETIC_REFRESH_A' : 'SYNTHETIC_TOKEN_A' } }, error: null }); });
    await waitFor(() => expect(query.getMutationCache().getAll().every((mutation) => mutation.state.status !== 'pending')).toBe(true));
    if (mode === 'same A' || mode === 'A token refresh') {
      expect(admitted).toEqual([mode === 'A token refresh' ? 'refreshA' : 'A']);
      expect(query.getQueryData(listsQueryKeys.detail(LIST, 'user-A', 'ORG1'))).toMatchObject({ id: LIST, name: 'Sent A' });
    } else {
      expect(admitted).toEqual([]); expect(attempts.every((attempt) => attempt.aborted)).toBe(true);
      if (mode !== 'unmount') expect(screen.queryByText(/Synthetic aborted transport/)).not.toBeInTheDocument();
    }
  });

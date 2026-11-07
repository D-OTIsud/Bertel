import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { useSessionStore } from '@/store/session-store';
import { getList, getListEmailContext, parseListDetail, LIST_EMAIL_UNKNOWN_MESSAGE, LIST_EMAIL_RESEND_CONFIRMATION } from '@/services/lists';

// Real send service + real view/QueryClient. Auth/HTTP/list/context reads are
// synthetic boundaries; no SMTP/provider/server or external network is contacted.
jest.mock('@/lib/supabase', () => ({ getApiClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token', user: { id: 'user-A' } } } }) } }) }));
jest.mock('@/services/service-availability', () => ({ getServiceAvailability: async () => ({ translation: false, imageAnalysis: false, email: true }) }));
jest.mock('@/services/lists', () => ({ ...jest.requireActual('@/services/lists'), getList: jest.fn(), getListEmailContext: jest.fn(), updateList: jest.fn(), setListItems: jest.fn() }));
jest.mock('@/features/object-editor/useObjectSearch', () => ({ useObjectSearch: () => ({ results: [], loading: false }) }));
jest.mock('@/hooks/useServiceAvailability', () => ({ useServiceAvailability: () => ({ translation: false, imageAnalysis: false, email: true }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/features/lists/OtiTemplate', () => ({ __esModule: true, default: () => <div />, itemsToOtiPois: () => [] }));
jest.mock('@/features/lists/ChannelFrame', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const originalFetch = global.fetch;
const PERMIT = 'd2000000-0000-4000-8000-000000000099';
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => {
  if (body === undefined) throw new SyntaxError('synthetic opaque HTTP body'); return body;
} });
type Call = { phase: string; operation: string; body: Record<string, unknown> };
function installFlow(overrides: (call: Call) => ReturnType<typeof response> | Promise<ReturnType<typeof response>> | undefined) {
  global.fetch = jest.fn(async (_path: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body)), operation = (options.headers as Record<string,string>)['Idempotency-Key'];
    const replacement = overrides({ phase: body.phase, body, operation }); if (replacement) return replacement;
    if (body.phase === 'prepare') return response(200,{ ok:true,phase:'prepared',operationId:operation,dispatchToken:PERMIT });
    if (body.phase === 'dispatch') return response(200,{ ok:true,phase:'accepted',operationId:operation,resultToken:'a'.repeat(64),trackingUpdated:true });
    return response(200,{ ok:true,phase:'acknowledged',operationId:operation,acknowledged:true });
  }) as unknown as typeof fetch;
}
const calls = (phase: string) => (global.fetch as jest.Mock).mock.calls.filter(([,options]) => JSON.parse(options.body).phase === phase);
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global.crypto,'subtle',{configurable:true,value:require('node:crypto').webcrypto.subtle}); global.TextEncoder=require('node:util').TextEncoder;
  useSessionStore.setState({ authAuthority: { userId: 'user-A', epoch: 1, hydrated: true }, status:'ready',userId:'user-A',orgId:'ORG1',role:'tourism_agent',demoMode:false });
  jest.mocked(getListEmailContext).mockResolvedValue({generations:{}});
  jest.mocked(getList).mockResolvedValue(parseListDetail({id:'list-A',kind:'static',name:'Synthetic',lang:'fr',created_by:'user-A',org_object_id:'ORG1',can_edit:true,can_manage_sharing:true,items:[]}));
  jest.spyOn(window,'prompt').mockReturnValue('recipient@example.invalid'); jest.spyOn(window,'confirm').mockReturnValue(false);
});
afterEach(() => { global.fetch=originalFetch; });
async function page() {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=render(<QueryClientProvider client={client}><ListComposeView listId="list-A" /></QueryClientProvider>);
  await waitFor(() => expect(client.getQueryData(['list-email-context','list-A','user-A','ORG1'])).toEqual({generations:{}}));
  return {client,...view};
}
async function send(count: number) {
  fireEvent.click(await screen.findByRole('button',{name:/^Envoyer$/}));
  await waitFor(() => expect(calls('prepare')).toHaveLength(count));
  await waitFor(() => expect(screen.getByRole('button',{name:/^Envoyer$/})).not.toBeDisabled());
}
it.each([[503,undefined],[200,undefined],[204,undefined],[200,{}],[200,{ok:false}]])
  ('opaque HTTP%s after dispatch cannot announce sent; next gesture requires confirmation (%j)',async(status,body)=>{
    installFlow(({phase}) => phase==='dispatch'?response(status as number,body):undefined);
    await page(); await send(1);
    expect(screen.queryByText(/E-mail envoyé à/)).not.toBeInTheDocument(); expect(screen.getByText(LIST_EMAIL_UNKNOWN_MESSAGE)).toBeInTheDocument();
    expect(calls('dispatch')).toHaveLength(1); expect(calls('ack')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button',{name:/^Envoyer$/}));
    expect(window.confirm).toHaveBeenCalledWith(LIST_EMAIL_RESEND_CONFIRMATION); expect(calls('prepare')).toHaveLength(1);
  });
it('known pre-prepare failure B does not discard uncertain A before C',async()=>{
  let preparations=0,dispatches=0;
  installFlow(({phase})=>{
    if(phase==='prepare' && ++preparations===2)return response(503,{error:'smtp_unavailable'});
    if(phase==='dispatch' && ++dispatches===1)return Promise.reject(new TypeError('synthetic lost A result'));
  });
  jest.spyOn(window,'confirm').mockReturnValue(true); await page(); await send(1);
  const first=calls('prepare')[0][1].headers['Idempotency-Key'];
  await send(2); await send(3); expect(window.confirm).toHaveBeenCalledTimes(2);
  expect(JSON.parse(calls('prepare')[2][1].body).confirmedPreviousOperationIds).toContain(first);
  expect(calls('dispatch')).toHaveLength(2); expect(screen.getByText(/E-mail envoyé à/)).toBeInTheDocument();
});
it('multiple lost dispatch replies retain every potentially active predecessor until a structured positive result',async()=>{
  let dispatches=0;
  installFlow(({phase})=>{if(phase==='dispatch'&&++dispatches<=2)return Promise.reject(new TypeError('synthetic lost result'));});
  jest.spyOn(window,'confirm').mockReturnValue(true); await page(); await send(1); await send(2); await send(3);
  expect(window.confirm).toHaveBeenCalledTimes(2);
  const expected=calls('prepare').slice(0,2).map(([,options])=>options.headers['Idempotency-Key']);
  expect(JSON.parse(calls('prepare')[2][1].body).confirmedPreviousOperationIds).toEqual(expect.arrayContaining(expected));
  expect(calls('ack')).toHaveLength(1);
});
it('an ambiguous prepare never dispatches or claims sent; the next explicit gesture is still safe for backend discovery',async()=>{
  installFlow(({phase})=>phase==='prepare'?response(200,{}):undefined);
  await page(); await send(1); expect(calls('dispatch')).toHaveLength(0); expect(calls('ack')).toHaveLength(0);
  expect(screen.queryByText(/E-mail envoyé à/)).not.toBeInTheDocument();
});
it('server rediscovery after reload supplies consent without relying on old in-memory IDs',async()=>{
  const old='d2000000-0000-4000-8000-000000000001';let preparations=0;
  installFlow(({phase})=>phase==='prepare'&&++preparations===1?response(409,{error:'email_delivery_unknown',operationId:old,operationIds:[old]}):undefined);
  await page(); await send(1); expect(calls('dispatch')).toHaveLength(0);
  jest.spyOn(window,'confirm').mockReturnValue(true); await send(2);
  expect(window.confirm).toHaveBeenCalledWith(LIST_EMAIL_RESEND_CONFIRMATION);
  expect(JSON.parse(calls('prepare')[1][1].body)).toMatchObject({confirmResend:true,confirmedPreviousOperationIds:[old]});
  expect(calls('dispatch')).toHaveLength(1); expect(screen.getByText(/E-mail envoyé à/)).toBeInTheDocument();
});

it('captures the context before the recipient prompt can change it, not after an async flush',async()=>{
  installFlow(()=>undefined);const {client}=await page();
  const hash=require('node:crypto').createHash('sha256').update('recipient@example.invalid').digest('hex');
  const context={generations:{[hash]:'4'}};
  await act(async()=>{client.setQueryData(['list-email-context','list-A','user-A','ORG1'],context);});
  jest.spyOn(window,'prompt').mockImplementation(()=>{context.generations[hash]='9';return 'recipient@example.invalid';});
  await send(1);
  expect(JSON.parse(calls('prepare')[0][1].body).expectedGeneration).toBe('4');
  expect(calls('dispatch')).toHaveLength(1);
});

it('known acceptance releases the view while its technical ACK is pending, with no replay',async()=>{
  let release!: (value: ReturnType<typeof response>) => void;
  const ack=new Promise<ReturnType<typeof response>>((done)=>{release=done;});
  installFlow(({phase})=>phase==='ack'?ack:undefined);
  await page();fireEvent.click(await screen.findByRole('button',{name:/^Envoyer$/}));
  try {
    await waitFor(()=>expect(calls('ack')).toHaveLength(1));
    await waitFor(()=>expect(screen.getByRole('button',{name:/^Envoyer$/})).not.toBeDisabled());
    expect(screen.getByText(/E-mail envoy/)).toBeInTheDocument();
    expect(calls('prepare')).toHaveLength(1);expect(calls('dispatch')).toHaveLength(1);
  } finally {await act(async()=>{release(response(200,{ok:true,phase:'acknowledged',acknowledged:true}));});}
});

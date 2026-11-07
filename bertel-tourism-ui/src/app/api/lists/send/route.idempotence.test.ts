/** @jest-environment node */
import type { NextRequest } from 'next/server';

const mockMail = jest.fn(async (_options: unknown) => {});
let mockListAllowed = true, mockTrackingError = false, mockProtectionUnavailable = false, mockCompleteUnavailable = false, mockClientAckUnavailable = false;
let mockHtml = '<p>Synthetic snapshot B</p>';
type Receipt = { state: string; fingerprint: unknown; recipient: unknown; token: string; generation: number; expected: number;
  trackingUpdated: boolean; result?: string; received?: boolean; parents: string[] };
const mockReceipts = new Map<string, Receipt>();
const mockGenerations = new Map<string, number>();
const mockCounts = { preparations: 0, attempts: 0 };
const originalListEmailMode = process.env.LIST_EMAIL_MODE;
afterAll(() => {
  if (originalListEmailMode === undefined) delete process.env.LIST_EMAIL_MODE;
  else process.env.LIST_EMAIL_MODE = originalListEmailMode;
});
const mockProfileRead = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'd2000000-0000-4000-8000-000000000010', email: 'synthetic@example.invalid' } }, error: null }) },
  schema: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === 'mark_list_sent') return { data: null, error: mockTrackingError ? { message: 'synthetic tracking failure' } : null };
    if (mockProtectionUnavailable) throw new Error('synthetic protection unavailable');
    const key = String(args.p_operation_id), receipt = mockReceipts.get(key);
    const response = (data: unknown) => ({ data, error: null });
    const verdict = (r: Receipt) => ({ state: r.state === 'started' ? 'unknown' : r.state, operation_id: key, operation_ids: [key],
      attempt_token: r.token, result_token: r.result, tracking_updated: r.trackingUpdated });
    if (name === 'get_list_email_context') return response(mockListAllowed ? { state: 'ready', generations: Object.fromEntries([...mockGenerations].map(([k,v]) => [k, String(v)])) } : { state: 'forbidden' });
    if (name === 'ack_list_email_client') {
      if (mockClientAckUnavailable) throw new Error('synthetic client ACK unavailable');
      const valid = receipt?.state === 'accepted' && receipt.result === args.p_result_token;
      if (valid) receipt.received = true;
      return response(valid);
    }
    if (name === 'prepare_list_email') {
      mockCounts.preparations++;
      if (!mockListAllowed) return response({ state: 'forbidden' });
      const recipient = String(args.p_recipient_fingerprint), expected = Number(args.p_expected_generation);
      if (receipt) {
        if (receipt.state === 'superseded' || receipt.fingerprint !== args.p_fingerprint || receipt.recipient !== recipient || receipt.expected !== expected) return response({ state: 'conflict' });
        return response(verdict(receipt));
      }
      const current = mockGenerations.get(recipient) ?? 0;
      if (expected !== current) return response({ state: 'stale' });
      const covered = new Set([...mockReceipts.values()].filter((r) => r.state === 'accepted' && r.received).flatMap((r) => r.parents));
      const visible = [...mockReceipts].filter(([id,r]) => r.recipient === recipient && ['reserved','started','unknown','accepted'].includes(r.state) && !r.received && !covered.has(id)).map(([id]) => id);
      if (visible.length && !args.p_confirm_resend) return response({ state: 'unknown', operation_id: visible[0], operation_ids: visible });
      const parents = [...new Set([...(args.p_confirmed_previous_operation_ids as string[]), ...(args.p_confirm_resend ? visible : [])])];
      for (const parent of parents) {
        const old = mockReceipts.get(parent);
        if (old?.state === 'reserved') old.state = 'superseded';
        else if (!old) mockReceipts.set(parent, { state: 'superseded', fingerprint: null, recipient: null, token: parent, generation: 0, expected: -1, trackingUpdated: false, parents: [] });
      }
      mockGenerations.set(recipient, current + 1);
      const next = { state: 'reserved', fingerprint: args.p_fingerprint, recipient, token: key, generation: current + 1, expected, trackingUpdated: false, parents };
      mockReceipts.set(key, next); return response(verdict(next));
    }
    if (name === 'begin_list_email') {
      if (!mockListAllowed) return response({ started: false, state: 'forbidden' });
      if (!receipt || receipt.state === 'superseded' || receipt.token !== args.p_attempt_token || receipt.fingerprint !== args.p_fingerprint || receipt.recipient !== args.p_recipient_fingerprint) return response({ started: false, state: 'conflict' });
      if (receipt.state !== 'reserved') return response({ started: false, ...verdict(receipt) });
      if (receipt.generation !== mockGenerations.get(String(receipt.recipient))) return response({ started: false, state: 'stale' });
      receipt.state = 'started'; mockCounts.attempts++;
      return response({ started: true });
    }
    if (name === 'complete_list_email') {
      if (mockCompleteUnavailable) throw new Error('synthetic durable receipt unavailable');
      if (receipt?.state === 'started' || receipt?.state === 'unknown') {
        receipt.state = String(args.p_outcome); receipt.trackingUpdated = args.p_tracking_updated === true;
        receipt.result = args.p_result_token ? String(args.p_result_token) : undefined;
      }
      return response(true);
    }
    throw new Error(`unexpected synthetic RPC ${name}`);
  } }),
}) }));
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: () => ({
  schema: () => ({ rpc: async (name: string) => name === 'get_list'
    ? { data: mockListAllowed ? { id: 'd2000000-0000-4000-8000-000000000020', org_object_id: 'ORGSYNTHETIC0001', name: 'Synthetic list', lang: 'fr', items: [] } : null, error: mockListAllowed ? null : { message: 'forbidden' } }
    : { data: { share_token: 'synthetic-token' }, error: null } }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockProfileRead() }) }) }),
}) }));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: async () => ({ host: 'synthetic.invalid', fromEmail: 'sender@example.invalid', fromName: 'Synthetic' }) }));
jest.mock('@/lib/mail.server', () => ({
  prepareListEmail: async (options: unknown) => ({ sender: { address: 'sender@example.invalid', name: 'Synthetic' }, send: () => mockMail(options) }),
  MailNotConfiguredError: class extends Error {}, MailDeliveryError: class extends Error { rejectionCode = null; },
}));
jest.mock('@/emails/ListEmail', () => ({ renderListEmailHtml: () => mockHtml, listEmailSubject: () => 'Synthetic subject' }));
jest.mock('@/features/lists/type-meta', () => ({ ACCENT_INK: { teal: '#000' }, typeLabel: () => 'Synthetic' }));

type Handler = (request: NextRequest) => Promise<Response>;
function instance(): Handler { let handler!: Handler; jest.isolateModules(() => { handler = require('./route').POST; }); return handler; }
const A = 'd2000000-0000-4000-8000-000000000001', B = 'd2000000-0000-4000-8000-000000000002', C = 'd2000000-0000-4000-8000-000000000003';
function request(phase: string, operation = A, extra: Record<string, unknown> = {}): NextRequest {
  return new Request('https://synthetic.invalid/api/lists/send', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json', 'Idempotency-Key': operation },
    body: JSON.stringify({ phase, listId: 'd2000000-0000-4000-8000-000000000020', toEmail: 'recipient@example.invalid', ...extra }),
  }) as NextRequest;
}
async function send(handler: Handler, operation = A, generation = '0', extra: Record<string, unknown> = {}, acknowledge = true) {
  const prepared = await handler(request('prepare', operation, { expectedGeneration: generation, ...extra }));
  const body = await prepared.clone().json();
  if (!prepared.ok) return prepared;
  const accepted = body.phase === 'accepted' ? prepared : await handler(request('dispatch', operation, { dispatchToken: body.dispatchToken, ...extra }));
  if (accepted.ok && acknowledge) {
    const result = await accepted.clone().json(); await handler(request('ack', operation, { resultToken: result.resultToken }));
  }
  return accepted;
}
function barrier() {
  let enter!: () => void, release!: (value: { data: null; error: null }) => void;
  const entered = new Promise<void>((done) => { enter = done; });
  const pending = new Promise<{ data: null; error: null }>((done) => { release = done; });
  return { entered, release: () => release({ data: null, error: null }), read: () => { enter(); return pending; } };
}
beforeEach(() => {
  process.env.LIST_EMAIL_MODE = 'protocol-v1';
  mockMail.mockReset().mockResolvedValue(undefined); mockReceipts.clear(); mockGenerations.clear();
  mockProfileRead.mockReset().mockResolvedValue({ data: null, error: null });
  mockListAllowed = true; mockTrackingError = false; mockProtectionUnavailable = false; mockCompleteUnavailable = false; mockClientAckUnavailable = false;
  mockHtml = '<p>Synthetic snapshot B</p>'; mockCounts.preparations = 0; mockCounts.attempts = 0;
  process.env.NEXT_PUBLIC_APP_URL = 'https://synthetic.invalid'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-not-real';
});

it('context is a pure authorized read, without SMTP preparation or receipt creation', async () => {
  const result = await instance()(request('context'));
  expect(await result.json()).toMatchObject({ ok: true, phase: 'context', generations: {} });
  expect(mockMail).not.toHaveBeenCalled(); expect(mockProfileRead).not.toHaveBeenCalled(); expect(mockReceipts.size).toBe(0);
});
it('prepare acknowledges only a permit; an abandoned response cannot dispatch', async () => {
  const response = await instance()(request('prepare', A, { expectedGeneration: '0' }));
  expect(await response.json()).toMatchObject({ ok: true, phase: 'prepared', dispatchToken: A });
  expect(mockMail).not.toHaveBeenCalled(); expect(mockCounts.attempts).toBe(0);
});
it('preserves one authorized send and refuses a revoked reader before replaying', async () => {
  const handler = instance(); expect((await send(handler)).status).toBe(200); expect(mockMail).toHaveBeenCalledTimes(1);
  const claims = mockCounts.preparations; mockListAllowed = false;
  expect((await send(handler)).status).toBe(403); expect(mockCounts.preparations).toBe(claims); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('two isolated route instances admit exactly one SMTP attempt for the same gesture', async () => {
  const responses = await Promise.all([send(instance()), send(instance())]);
  expect(responses.some((r) => r.status === 200)).toBe(true); expect(responses.every((r) => [200,409].includes(r.status))).toBe(true);
  expect(mockMail).toHaveBeenCalledTimes(1); expect(mockCounts.attempts).toBe(1);
});
it('known acceptance with failed tracking remains terminal on replay', async () => {
  mockTrackingError = true; const handler = instance(); const first = await send(handler);
  expect(await first.json()).toMatchObject({ ok: true, phase: 'accepted', trackingUpdated: false });
  expect((await send(handler)).status).toBe(200); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('same intention cannot change recipient or snapshot before replay', async () => {
  const handler = instance(); await send(handler);
  expect((await send(handler,A,'0',{toEmail:'other@example.invalid'})).status).toBe(409);
  mockHtml = '<p>Synthetic snapshot C</p>'; expect((await send(handler)).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('shared protection unavailable fails closed before SMTP', async () => {
  mockProtectionUnavailable = true; expect((await send(instance())).status).toBe(503); expect(mockMail).not.toHaveBeenCalled();
});
it('unknown relay outcome never reuses an intention', async () => {
  mockMail.mockRejectedValueOnce(new Error('synthetic final reply lost')); const handler = instance();
  expect((await send(handler)).status).toBe(409); expect((await send(handler)).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('lost durable outcome receipt preserves known success and prevents duplicate SMTP', async () => {
  mockCompleteUnavailable = true; const handler = instance();
  expect((await send(handler)).status).toBe(200); expect((await send(handler)).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('lost technical client ACK preserves success but reload still discovers the unresolved acceptance', async () => {
  mockClientAckUnavailable = true; const handler = instance(); expect((await send(handler)).status).toBe(200);
  const discovery = await handler(request('prepare',B,{expectedGeneration:'1'}));
  expect(discovery.status).toBe(409); expect(await discovery.json()).toMatchObject({ error:'email_delivery_unknown',operationIds:[A] });
  expect(mockMail).toHaveBeenCalledTimes(1);
});
it('lost positive HTTP response and all client IDs still require confirmation after reload', async () => {
  const handler = instance(); expect((await send(handler,A,'0',{},false)).status).toBe(200);
  expect((await send(instance(),B,'1')).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
  expect((await send(instance(),B,'1',{confirmResend:true})).status).toBe(200); expect(mockMail).toHaveBeenCalledTimes(2);
});
it('UUID dispatch permits and foreign result proofs cannot settle an accepted receipt', async () => {
  const handler = instance(); await send(handler,A,'0',{},false);
  const permitAck = await handler(request('ack',A,{resultToken:A})); expect(permitAck.status).toBe(400);
  const foreign = await handler(request('ack',A,{resultToken:'f'.repeat(64)})); expect(await foreign.json()).toMatchObject({ acknowledged:false });
  expect(mockReceipts.get(A)?.received).toBeUndefined(); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('dispatch requires an existing exact nonce, current rights and snapshot; it never creates a receipt', async () => {
  const handler = instance(); expect((await handler(request('dispatch',B,{dispatchToken:A}))).status).toBe(409); expect(mockReceipts.size).toBe(0);
  await handler(request('prepare',A,{expectedGeneration:'0'}));
  expect((await handler(request('dispatch',A,{dispatchToken:B}))).status).toBe(409);
  mockHtml='<p>Changed</p>'; expect((await handler(request('dispatch',A,{dispatchToken:A}))).status).toBe(409);
  mockListAllowed=false; expect((await handler(request('dispatch',A,{dispatchToken:A}))).status).toBe(403); expect(mockMail).not.toHaveBeenCalled();
});
it('validates phase, generation, intention and non-self-confirmation before the shared gate', async () => {
  const handler=instance(); const missing=request('prepare',A,{expectedGeneration:'0'}); missing.headers.delete('idempotency-key');
  for (const req of [missing,request('prepare','invalid',{expectedGeneration:'0'}),request('prepare',A,{expectedGeneration:'0',confirmResend:true,confirmedPreviousOperationIds:[A]}),request('prepare',A,{expectedGeneration:'-1'}),request('prepare',A,{expectedGeneration:'9223372036854775808'}),request('legacy')]) expect((await handler(req)).status).toBe(400);
  expect(mockMail).not.toHaveBeenCalled(); expect(mockCounts.preparations).toBe(0);
});
it('C completes and ACKs with no A IDs while live A waits before reservation; A remains stale', async () => {
  const a=barrier(); mockProfileRead.mockImplementationOnce(a.read);
  const delayed=send(instance()); await a.entered;
  expect((await send(instance(),C)).status).toBe(200); expect(mockReceipts.get(C)?.received).toBe(true);
  a.release(); const result=await delayed;
  expect(result.status).toBe(409); expect(await result.json()).toMatchObject({error:'email_context_stale'});
  expect(mockReceipts.has(A)).toBe(false); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('C closes delayed A and B under explicit chain confirmation without reviving either preparation', async () => {
  const a=barrier(), b=barrier(); mockProfileRead.mockImplementationOnce(a.read).mockImplementationOnce(b.read);
  const delayedA=send(instance()); await a.entered;
  const delayedB=send(instance(),B,'0',{confirmResend:true,confirmedPreviousOperationIds:[A]}); await b.entered;
  expect((await send(instance(),C,'0',{confirmResend:true,confirmedPreviousOperationIds:[A,B]})).status).toBe(200);
  b.release(); a.release(); expect((await delayedA).status).toBe(409); expect((await delayedB).status).toBe(409);
  expect(mockReceipts.get(A)?.state).toBe('superseded'); expect(mockReceipts.get(B)?.state).toBe('superseded'); expect(mockMail).toHaveBeenCalledTimes(1);
});

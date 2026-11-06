/** @jest-environment node */
import type { NextRequest } from 'next/server';

const mockMail = jest.fn(async (_options: unknown) => {});
let mockListAllowed = true;
let mockTrackingError = false;
let mockProtectionUnavailable = false;
let mockAckUnavailable = false;
let mockHtml = '<p>Synthetic snapshot B</p>';
const mockReceipts = new Map<string, { state: string; fingerprint: unknown; recipient: unknown; token: string; trackingUpdated: boolean }>();
const mockCounts = { claims: 0, attempts: 0 };
jest.mock('server-only', () => ({}));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'd2000000-0000-4000-8000-000000000010', email: 'synthetic@example.invalid' } }, error: null }) },
  schema: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === 'mark_list_sent') return { data: null, error: mockTrackingError ? { message: 'synthetic tracking failure' } : null };
    if (mockProtectionUnavailable) throw new Error('synthetic protection unavailable');
    const key = String(args.p_operation_id);
    const receipt = mockReceipts.get(key);
    if (name === 'claim_list_email') {
      mockCounts.claims += 1;
      if (receipt && (receipt.fingerprint !== args.p_fingerprint || receipt.recipient !== args.p_recipient_fingerprint)) {
        return { data: { state: 'conflict' }, error: null };
      }
      if (!receipt) mockReceipts.set(key, { state: 'reserved', fingerprint: args.p_fingerprint, recipient: args.p_recipient_fingerprint,
        token: 'd2000000-0000-4000-8000-000000000099', trackingUpdated: false });
      const current = mockReceipts.get(key)!;
      return { data: { state: current.state, attempt_token: current.token, tracking_updated: current.trackingUpdated }, error: null };
    }
    if (name === 'begin_list_email') {
      if (receipt?.state !== 'reserved') return { data: { started: false, state: receipt?.state ?? 'unknown' }, error: null };
      receipt.state = 'started'; mockCounts.attempts += 1;
      return { data: { started: true }, error: null };
    }
    if (name === 'complete_list_email') {
      if (mockAckUnavailable) throw new Error('synthetic ACK unavailable');
      if (receipt?.state === 'started' || receipt?.state === 'unknown') {
        receipt.state = String(args.p_outcome); receipt.trackingUpdated = args.p_tracking_updated === true;
      }
      return { data: true, error: null };
    }
    throw new Error(`unexpected synthetic RPC ${name}`);
  } }),
}) }));
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: () => ({
  schema: () => ({ rpc: async (name: string) => name === 'get_list'
    ? { data: mockListAllowed ? { id: 'd2000000-0000-4000-8000-000000000020', org_object_id: 'ORGSYNTHETIC0001', name: 'Synthetic list', lang: 'fr', items: [] } : null,
      error: mockListAllowed ? null : { message: 'forbidden' } }
    : { data: { share_token: 'synthetic-token' }, error: null } }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
}) }));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: async () => ({ host: 'synthetic.invalid', fromEmail: 'sender@example.invalid', fromName: 'Synthetic' }) }));
jest.mock('@/lib/mail.server', () => ({
  prepareListEmail: async (options: unknown) => ({ sender: { address: 'sender@example.invalid', name: 'Synthetic' }, send: () => mockMail(options) }),
  MailNotConfiguredError: class extends Error {}, MailDeliveryError: class extends Error { rejectionCode = null; },
}));
jest.mock('@/emails/ListEmail', () => ({ renderListEmailHtml: () => mockHtml, listEmailSubject: () => 'Synthetic subject' }));
jest.mock('@/features/lists/type-meta', () => ({ ACCENT_INK: { teal: '#000' }, typeLabel: () => 'Synthetic' }));

type Handler = (request: NextRequest) => Promise<Response>;
function instance(): Handler {
  let handler!: Handler;
  jest.isolateModules(() => { handler = require('./route').POST; });
  return handler;
}
const OPERATION = 'd2000000-0000-4000-8000-000000000001';
function request(toEmail = 'recipient@example.invalid', operation = OPERATION): NextRequest {
  return new Request('https://synthetic.invalid/api/lists/send', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json', 'Idempotency-Key': operation },
    body: JSON.stringify({ listId: 'd2000000-0000-4000-8000-000000000020', toEmail }),
  }) as NextRequest;
}
beforeEach(() => {
  mockMail.mockReset().mockResolvedValue(undefined); mockReceipts.clear();
  mockListAllowed = true; mockTrackingError = false; mockProtectionUnavailable = false; mockAckUnavailable = false;
  mockHtml = '<p>Synthetic snapshot B</p>'; mockCounts.claims = 0; mockCounts.attempts = 0;
  process.env.NEXT_PUBLIC_APP_URL = 'https://synthetic.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-not-real';
});

it('preserves one authorized send and refuses a revoked reader before replaying a receipt', async () => {
  const send = instance();
  expect((await send(request())).status).toBe(200); expect(mockMail).toHaveBeenCalledTimes(1);
  const claims = mockCounts.claims; mockListAllowed = false;
  expect((await send(request())).status).toBe(403); expect(mockMail).toHaveBeenCalledTimes(1);
  expect(mockCounts.claims).toBe(claims);
});
it('two isolated route instances admit exactly one SMTP attempt for the same intention', async () => {
  const first = instance(), second = instance();
  const responses = await Promise.all([first(request()), second(request())]);
  expect(responses.some((response) => response.status === 200)).toBe(true);
  expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
  expect(mockMail).toHaveBeenCalledTimes(1); expect(mockCounts.attempts).toBe(1);
});
it('SMTP accepted with failed tracking remains terminal and retries do not send again', async () => {
  mockTrackingError = true; const send = instance();
  const first = await send(request()); expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ trackingUpdated: false });
  expect((await send(request())).status).toBe(200); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('same intention with another recipient or prepared snapshot conflicts before SMTP', async () => {
  const send = instance(); await send(request());
  expect((await send(request('other@example.invalid'))).status).toBe(409);
  mockHtml = '<p>Synthetic snapshot C</p>';
  expect((await send(request())).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('shared protection unavailable fails closed before SMTP', async () => {
  mockProtectionUnavailable = true;
  const response = await instance()(request());
  expect(response.status).toBe(503); expect(mockMail).not.toHaveBeenCalled();
});
it('unknown SMTP outcome never retries the same intention', async () => {
  mockMail.mockRejectedValueOnce(new Error('synthetic final reply lost'));
  const send = instance();
  expect((await send(request())).status).toBe(409);
  expect((await send(request())).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
});
it('lost durable ACK after known SMTP acceptance keeps the first success and blocks duplicate SMTP', async () => {
  mockAckUnavailable = true; const send = instance();
  expect((await send(request())).status).toBe(200);
  expect((await send(request())).status).toBe(409); expect(mockMail).toHaveBeenCalledTimes(1);
});


it('requires a valid, non-self-confirming intention before the shared gate or SMTP', async () => {
  const send = instance();
  const missing = request(); missing.headers.delete('idempotency-key');
  const self = new Request('https://synthetic.invalid/api/lists/send', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json', 'Idempotency-Key': OPERATION },
    body: JSON.stringify({ listId: 'd2000000-0000-4000-8000-000000000020', toEmail: 'recipient@example.invalid', confirmedPreviousOperationId: OPERATION }),
  }) as NextRequest;
  for (const req of [missing, request('recipient@example.invalid', 'invalid'), self]) expect((await send(req)).status).toBe(400);
  expect(mockMail).not.toHaveBeenCalled(); expect(mockCounts.claims).toBe(0);
});

/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));
const USER = 'd3000000-0000-4000-8000-000000000010';
const LIST = 'd3000000-0000-4000-8000-000000000020';
const OPERATION = 'd3000000-0000-4000-8000-000000000001';
const PERMIT = 'd3000000-0000-4000-8000-000000000002';
const mockSend = jest.fn(async () => {});
const mockSmtp = jest.fn(async () => ({ host: 'synthetic.invalid', fromEmail: 'sender@example.invalid', fromName: 'Synthetic' }));
const mockPrepareMail = jest.fn(async () => ({ sender: { address: 'sender@example.invalid', name: 'Synthetic' }, send: mockSend }));
const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockProfile = jest.fn();
const mockCallerRpc = jest.fn();
const mockCaller = jest.fn((..._args: unknown[]) => ({ schema: () => ({ rpc: mockCallerRpc }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockProfile }) }) }),
}));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: () => ({
  auth: { getUser: mockGetUser }, schema: () => ({ rpc: mockRpc }),
}) }));
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: (...args: unknown[]) => mockCaller(...args) }));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: () => mockSmtp() }));
jest.mock('@/lib/mail.server', () => ({ prepareListEmail: () => mockPrepareMail(),
  MailNotConfiguredError: class extends Error {}, MailDeliveryError: class extends Error {},
}));
jest.mock('@/emails/ListEmail', () => ({ renderListEmailHtml: () => '<p>Synthetic</p>', listEmailSubject: () => 'Synthetic' }));
jest.mock('@/features/lists/type-meta', () => ({ ACCENT_INK: { teal: '#000' }, typeLabel: () => 'Synthetic' }));

import { POST } from './route';
const originalMode = process.env.LIST_EMAIL_MODE;
const reply = (data: unknown) => ({ data, error: null });
function request(phase: string, changes: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request('https://synthetic.invalid/api/lists/send', { method: 'POST',
    headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json', 'Idempotency-Key': OPERATION, ...headers },
    body: JSON.stringify({ phase, listId: LIST, toEmail: 'recipient@example.invalid', expectedGeneration: '0',
      dispatchToken: PERMIT, resultToken: 'a'.repeat(64), ...changes }),
  }) as NextRequest;
}
function expectNoEmitterEffect() {
  expect(mockSmtp).not.toHaveBeenCalled(); expect(mockCaller).not.toHaveBeenCalled();
  expect(mockCallerRpc).not.toHaveBeenCalled(); expect(mockProfile).not.toHaveBeenCalled();
  expect(mockPrepareMail).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
}
async function expectClosed(response: Response) {
  expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'email_protection_unavailable' });
}
beforeEach(() => {
  jest.clearAllMocks(); process.env.LIST_EMAIL_MODE = 'closed';
  process.env.NEXT_PUBLIC_APP_URL = 'https://synthetic.invalid';
  mockGetUser.mockResolvedValue({ data: { user: { id: USER, email: 'synthetic@example.invalid' } }, error: null });
  mockProfile.mockResolvedValue(reply(null));
  mockCallerRpc.mockImplementation(async (name: string) => reply(name === 'get_list'
    ? { id: LIST, name: 'Synthetic list', lang: 'fr', accent: 'teal', items: [] } : { share_token: 'synthetic' }));
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_list_email_context') return reply({ state: 'ready', generations: { ['b'.repeat(64)]: '7' } });
    if (name === 'ack_list_email_client') return reply(true);
    if (name === 'prepare_list_email') return reply({ state: 'reserved', attempt_token: PERMIT });
    if (name === 'begin_list_email') return reply({ started: true });
    if (name === 'complete_list_email' || name === 'mark_list_sent') return reply(true);
    throw new Error('Unexpected synthetic RPC');
  });
});
afterAll(() => { if (originalMode === undefined) delete process.env.LIST_EMAIL_MODE; else process.env.LIST_EMAIL_MODE = originalMode; });

describe.each([undefined, '', 'closed', 'true', 'PROTOCOL-V1', ' protocol-v1', 'protocol-v1 ', 'unknown'])('manual admission mode %s', (mode) => {
  it.each(['prepare', 'dispatch'])('refuses %s before any emitter dependency or reservation', async (phase) => {
    if (mode === undefined) delete process.env.LIST_EMAIL_MODE; else process.env.LIST_EMAIL_MODE = mode;
    await expectClosed(await POST(request(phase, { LIST_EMAIL_MODE: 'protocol-v1' }, { 'x-list-email-mode': 'protocol-v1' })));
    expect(mockRpc).not.toHaveBeenCalled(); expectNoEmitterEffect();
  });
});

it('keeps a nonempty authorized context readable while closed', async () => {
  const response = await POST(request('context'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, phase: 'context', listId: LIST, userId: USER, generations: { ['b'.repeat(64)]: '7' } });
  expect(mockRpc.mock.calls.map(([name]) => name)).toEqual(['get_list_email_context']); expectNoEmitterEffect();
});
it('keeps a valid technical ACK possible while closed without creating a permit', async () => {
  const response = await POST(request('ack'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, phase: 'acknowledged', operationId: OPERATION, acknowledged: true });
  expect(mockRpc).toHaveBeenCalledWith('ack_list_email_client', { p_user_id: USER, p_list_id: LIST,
    p_operation_id: OPERATION, p_result_token: 'a'.repeat(64) });
  expect(mockRpc).toHaveBeenCalledTimes(1); expectNoEmitterEffect();
});
it.each(['context', 'ack'])('handles an absent %s RPC before installation with the approved refusal', async (phase) => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'SQL_PRIVATE_SENTINEL' } });
  await expectClosed(await POST(request(phase))); expect(mockRpc).toHaveBeenCalledTimes(1); expectNoEmitterEffect();
});
it.each(['context', 'ack'])('sanitizes a thrown %s RPC failure', async (phase) => {
  mockRpc.mockRejectedValue(new Error('SQL_PRIVATE_SENTINEL'));
  await expectClosed(await POST(request(phase))); expectNoEmitterEffect();
});
it('retains current authorization on context', async () => {
  mockRpc.mockResolvedValue(reply({ state: 'forbidden' }));
  const response = await POST(request('context'));
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'forbidden' }); expectNoEmitterEffect();
});
it('retains an invalid technical ACK refusal without an RPC', async () => {
  const response = await POST(request('ack', { resultToken: PERMIT }));
  expect(response.status).toBe(400); expect(mockRpc).not.toHaveBeenCalled(); expectNoEmitterEffect();
});
it('retains missing JWT and malformed emitter validation refusals', async () => {
  expect((await POST(request('prepare', {}, { authorization: '' }))).status).toBe(401);
  expect((await POST(request('dispatch', { dispatchToken: 'invalid' }))).status).toBe(400);
  expect((await POST(request('prepare', { expectedGeneration: '-1' }))).status).toBe(400);
  expect(mockRpc).not.toHaveBeenCalled(); expectNoEmitterEffect();
});
it('retains failed authentication before even looking up context or an ACK', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Synthetic invalid session' } });
  expect((await POST(request('context'))).status).toBe(401);
  expect((await POST(request('ack'))).status).toBe(401);
  expect(mockRpc).not.toHaveBeenCalled(); expectNoEmitterEffect();
});
it('retains the trusted discovery restriction before all protocol phases', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER, app_metadata: { sandbox_discovery: true } } }, error: null });
  for (const phase of ['context', 'prepare', 'dispatch', 'ack']) {
    const response = await POST(request(phase));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'sandbox_external_effects_disabled' });
  }
  expect(mockRpc).not.toHaveBeenCalled(); expectNoEmitterEffect();
});
it('admits the exact open mode through prepare and dispatch with a strictly fake provider', async () => {
  process.env.LIST_EMAIL_MODE = 'protocol-v1';
  const prepared = await POST(request('prepare'));
  expect(prepared.status).toBe(200); expect(await prepared.json()).toMatchObject({ phase: 'prepared', dispatchToken: PERMIT });
  expect(mockSend).not.toHaveBeenCalled();
  const accepted = await POST(request('dispatch'));
  expect(accepted.status).toBe(200); expect(await accepted.json()).toMatchObject({ phase: 'accepted', operationId: OPERATION });
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls.map(([name]) => name)).toEqual(['prepare_list_email', 'begin_list_email', 'mark_list_sent', 'complete_list_email']);
});
it('does not pretend closing the mode cancels a dispatch already admitted past the guard', async () => {
  process.env.LIST_EMAIL_MODE = 'protocol-v1';
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((done) => { enter = done; });
  const pending = new Promise<void>((done) => { release = done; });
  let firstRead = true;
  mockCallerRpc.mockImplementation(async (name: string) => {
    if (name === 'get_list') {
      if (firstRead) { firstRead = false; enter(); await pending; }
      return reply({ id: LIST, name: 'Synthetic', lang: 'fr', items: [] });
    }
    return reply({ share_token: 'synthetic' });
  });
  const admitted = POST(request('dispatch')); await entered;
  try {
    process.env.LIST_EMAIL_MODE = 'closed';
    await expectClosed(await POST(request('dispatch')));
    expect(mockSend).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
  } finally { release(); }
  expect((await admitted).status).toBe(200); expect(mockSend).toHaveBeenCalledTimes(1);
});

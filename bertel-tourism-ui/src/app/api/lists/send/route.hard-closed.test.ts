/** @jest-environment node */
import type { NextRequest } from 'next/server';
jest.mock('server-only', () => ({}));
const mockServer = jest.fn();
const mockCaller = jest.fn();
const mockSmtp = jest.fn();
const mockMail = jest.fn();
const mockRender = jest.fn();
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: () => mockServer() }));
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: () => mockCaller() }));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: () => mockSmtp() }));
jest.mock('@/lib/mail.server', () => ({ sendListEmail: () => mockMail(), MailNotConfiguredError: class extends Error {} }));
jest.mock('@/emails/ListEmail', () => ({ renderListEmailHtml: () => mockRender(), listEmailSubject: () => 'Synthetic' }));
import { POST } from './route';

const originalMode = process.env.LIST_EMAIL_MODE;
beforeEach(() => {
  jest.clearAllMocks();
  // Real S2 can reach its fake provider with this valid fixture. B must not even
  // read the JWT/body or construct a client, whatever residual mode is present.
  mockServer.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'synthetic' } }, error: null }) },
    schema: () => ({ rpc: async () => ({ data: null, error: null }) }),
  });
  mockCaller.mockReturnValue({ schema: () => ({ rpc: async (name: string) => ({ data: name === 'get_list'
    ? { id: 'synthetic-list', name: 'Synthetic', items: [] } : { share_token: 'synthetic' }, error: null }) }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  });
  mockSmtp.mockResolvedValue({ host: 'synthetic.invalid', fromEmail: 'sender@example.invalid', fromName: 'Synthetic' });
  mockMail.mockResolvedValue(undefined); mockRender.mockReturnValue('<p>Synthetic</p>');
  process.env.NEXT_PUBLIC_APP_URL = 'https://synthetic.invalid';
});
afterAll(() => { if (originalMode === undefined) delete process.env.LIST_EMAIL_MODE; else process.env.LIST_EMAIL_MODE = originalMode; });

describe.each([undefined, '', 'closed', 'protocol-v1', 'unknown'])('bridge with residual mode %s', (mode) => {
  it.each([undefined, 'context', 'prepare', 'dispatch', 'ack'])('always refuses phase %s without any DB or provider operation', async (phase) => {
    if (mode === undefined) delete process.env.LIST_EMAIL_MODE; else process.env.LIST_EMAIL_MODE = mode;
    const getHeader = jest.fn(() => 'Bearer synthetic');
    const readBody = jest.fn(async () => ({ listId: 'synthetic-list', toEmail: 'recipient@example.invalid', phase }));
    const result = await POST({ headers: { get: getHeader }, json: readBody } as unknown as NextRequest);
    expect(result.status).toBe(503); expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({ error: 'email_protection_unavailable' });
    expect(getHeader).not.toHaveBeenCalled(); expect(readBody).not.toHaveBeenCalled();
    for (const dependency of [mockServer, mockCaller, mockSmtp, mockMail, mockRender]) expect(dependency).not.toHaveBeenCalled();
  });
});
it.each([undefined, null, '{invalid JSON'])('does not parse even an absent or malformed request: %s', async (body) => {
  const json = jest.fn(() => { throw new Error('The bridge must not read any request'); });
  const response = await POST({ json, body } as unknown as NextRequest);
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'email_protection_unavailable' });
  expect(json).not.toHaveBeenCalled(); expect(mockServer).not.toHaveBeenCalled(); expect(mockMail).not.toHaveBeenCalled();
});

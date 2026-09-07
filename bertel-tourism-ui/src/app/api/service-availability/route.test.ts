/** @jest-environment node */
import { GET } from './route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { resolveSmtpConfig } from '@/lib/smtp-settings.server';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/ai-provider.server', () => ({ resolveActiveAiProvider: jest.fn() }));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: jest.fn() }));

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedAi = jest.mocked(resolveActiveAiProvider);
const mockedSmtp = jest.mocked(resolveSmtpConfig);
const validAi = { config: { apiKind: 'openai_compatible' as const, baseUrl: 'https://provider.example/v1', model: 'm', maxOutputTokens: 256, extra: null }, apiKey: null };
function request(headers: Record<string, string> = {}) { return new Request('http://internal/api/service-availability', { headers }) as never; }

beforeEach(() => {
  jest.resetAllMocks();
  mockedServer.mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) } } as never);
  mockedAi.mockResolvedValue(validAi);
  mockedSmtp.mockResolvedValue({ host: 'smtp.example', port: 587, secure: false, fromEmail: 'from@example.com', fromName: 'Bertel', user: null, pass: null });
});

it('requires bearer authentication and never reads service configuration first', async () => {
  const result = await GET(request());
  expect(result.status).toBe(401);
  expect(await result.json()).toEqual({ translation: false, imageAnalysis: false, email: false });
  expect(mockedAi).not.toHaveBeenCalled();
  expect(mockedSmtp).not.toHaveBeenCalled();
});

it('returns only the three booleans with no-store', async () => {
  const result = await GET(request({ authorization: 'Bearer token' }));
  expect(result.headers.get('Cache-Control')).toBe('no-store');
  expect(await result.json()).toEqual({ translation: true, imageAnalysis: true, email: true });
});

it('keeps SMTP available when the AI lookup fails, and inversely', async () => {
  mockedAi.mockRejectedValueOnce(new Error('vault unavailable'));
  expect(await (await GET(request({ authorization: 'Bearer token' }))).json()).toEqual({ translation: false, imageAnalysis: false, email: true });
  mockedSmtp.mockRejectedValueOnce(new Error('smtp unavailable'));
  expect(await (await GET(request({ authorization: 'Bearer token' }))).json()).toEqual({ translation: true, imageAnalysis: true, email: false });
});

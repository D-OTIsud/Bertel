/** @jest-environment node */
import { saveSmtpSettings } from './smtp-settings';
import { invalidateServiceAvailability } from './service-availability';

jest.mock('./service-availability', () => ({ invalidateServiceAvailability: jest.fn() }));

const input = { enabled: true, host: 'smtp.example.com', port: 587, secure: false, fromEmail: 'from@example.com', fromName: 'Bertel', authMode: 'relay' as const, user: '' };

beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn() as unknown as typeof fetch; });

it('invalidates availability only after a successful SMTP save', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...input, configured: true }), { status: 200 }));
  await saveSmtpSettings('token', input);
  expect(invalidateServiceAvailability).toHaveBeenCalledTimes(1);
});

it('omits manual limits an older caller did not provide and forwards supplied limits', async () => {
  jest.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(input), { status: 200 }));
  await saveSmtpSettings('token', input);
  await saveSmtpSettings('token', { ...input, manualMaxPerMinute: 25, manualMaxPer24h: 2000 });
  const bodies = jest.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies[0]).not.toHaveProperty('manualMaxPerMinute');
  expect(bodies[0]).not.toHaveProperty('manualMaxPer24h');
  expect(bodies[1]).toMatchObject({ manualMaxPerMinute: 25, manualMaxPer24h: 2000 });
});

it('does not invalidate availability when SMTP save fails', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'invalid' }), { status: 400 }));
  await expect(saveSmtpSettings('token', input)).rejects.toThrow('invalid');
  expect(invalidateServiceAvailability).not.toHaveBeenCalled();
});

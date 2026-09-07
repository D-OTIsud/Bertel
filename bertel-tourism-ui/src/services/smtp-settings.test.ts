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

it('does not invalidate availability when SMTP save fails', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'invalid' }), { status: 400 }));
  await expect(saveSmtpSettings('token', input)).rejects.toThrow('invalid');
  expect(invalidateServiceAvailability).not.toHaveBeenCalled();
});

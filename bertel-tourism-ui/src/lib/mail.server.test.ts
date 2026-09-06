/** @jest-environment node */
import { sendListEmail, MailNotConfiguredError } from './mail.server';

const sendMail = jest.fn();
const close = jest.fn();
const createTransport = jest.fn((_opts: unknown) => ({ sendMail, close }));

jest.mock('nodemailer', () => ({ createTransport: (opts: unknown) => createTransport(opts) }));
jest.mock('./env.server', () => ({ readSmtpConfig: jest.fn() }));

import { readSmtpConfig } from './env.server';
const mockedConfig = jest.mocked(readSmtpConfig);

describe('sendListEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedConfig.mockReturnValue({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      fromEmail: 'noreply@example.com',
      fromName: 'Bertel',
      user: null,
      pass: null,
    });
  });

  it('throws MailNotConfiguredError when SMTP is not configured', async () => {
    mockedConfig.mockReturnValue(null);
    await expect(sendListEmail({ to: 'a@example.com', subject: 's', html: '<p></p>' })).rejects.toBeInstanceOf(
      MailNotConfiguredError,
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('applies bounded connection/greeting/socket timeouts', async () => {
    sendMail.mockResolvedValue(undefined);
    await sendListEmail({ to: 'a@example.com', subject: 's', html: '<p></p>' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 }),
    );
  });

  it('closes the transport after a successful send', async () => {
    sendMail.mockResolvedValue(undefined);
    await sendListEmail({ to: 'a@example.com', subject: 's', html: '<p></p>' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the transport even when sendMail throws', async () => {
    sendMail.mockRejectedValue(new Error('smtp refused'));
    await expect(sendListEmail({ to: 'a@example.com', subject: 's', html: '<p></p>' })).rejects.toThrow(
      'smtp refused',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

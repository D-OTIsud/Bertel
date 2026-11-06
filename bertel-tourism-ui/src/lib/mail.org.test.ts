/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn() } }));
jest.mock('./smtp-settings.server', () => ({ resolveSmtpConfig: jest.fn() }));
jest.mock('./org-smtp.server', () => ({ readOrgSmtpConfig: jest.fn() }));
import nodemailer from 'nodemailer';
import { resolveSmtpConfig } from './smtp-settings.server';
import { readOrgSmtpConfig } from './org-smtp.server';

const cfg = (orgId: string) => ({ orgId, host: orgId + '.smtp.test', port: 587, secure: false, fromEmail: orgId + '@example.test', fromName: orgId, user: null, pass: null });

beforeEach(() => { jest.clearAllMocks(); });

test('une invitation sans SMTP d’office ne se replie jamais sur l’expéditeur général', async () => {
  jest.mocked(readOrgSmtpConfig).mockResolvedValue(null);
  jest.mocked(resolveSmtpConfig).mockResolvedValue(cfg('platform'));
  const { sendMail } = await import('./mail.server');
  await expect(sendMail({ orgId: 'office', to: 'partner@example.test', subject: 'Invitation', html: '<p>Bonjour</p>' })).rejects.toThrow();
  expect(resolveSmtpConfig).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test('chaque office garde son transport et son expéditeur lors d’envois alternés', async () => {
  jest.mocked(readOrgSmtpConfig).mockImplementation(async (id) => cfg(id!));
  const transports: { sendMail: jest.Mock; close: jest.Mock }[] = [];
  jest.mocked(nodemailer.createTransport).mockImplementation(() => {
    const transport = { sendMail: jest.fn().mockResolvedValue({}), close: jest.fn() };
    transports.push(transport); return transport as never;
  });
  const { sendMail } = await import('./mail.server');
  for (const orgId of ['south', 'west', 'south']) await sendMail({ orgId, to: 'partner@example.test', subject: 'Invitation', html: '<p>Bonjour</p>' });
  expect(nodemailer.createTransport).toHaveBeenCalledTimes(2);
  expect(transports[0].sendMail).toHaveBeenCalledTimes(2);
  expect(transports[0].sendMail.mock.calls[0][0].from).toEqual({ name: 'south', address: 'south@example.test' });
  expect(transports[1].sendMail.mock.calls[0][0].from).toEqual({ name: 'west', address: 'west@example.test' });
  expect(resolveSmtpConfig).not.toHaveBeenCalled();
});

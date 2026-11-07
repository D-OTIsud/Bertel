/** @jest-environment node */
import net, { type Socket } from 'node:net';
import type { Transporter } from 'nodemailer';

jest.mock('server-only', () => ({}));
const mockConfig = jest.fn();
const mockTransports: Transporter[] = [];
jest.mock('./smtp-settings.server', () => ({ resolveSmtpConfig: () => mockConfig() }));
jest.mock('nodemailer', () => ({ __esModule: true, default: {
  createTransport: (options: Record<string, unknown>) => {
    // Only the test transport is redirected to our plaintext loopback peer. Assert the
    // production TLS requirement first; this is SMTP protocol evidence, not TLS qualification.
    expect(options.requireTLS).toBe(true);
    expect(options.host).toBe('127.0.0.1');
    const real = jest.requireActual('nodemailer') as typeof import('nodemailer');
    const transport = real.createTransport({ ...options, requireTLS: false, ignoreTLS: true, socketTimeout: 2000 });
    mockTransports.push(transport);
    return transport;
  },
} }));

async function peer(outcome: 'accepted' | 'reply-lost') {
  let submissions = 0;
  const sockets = new Set<Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 synthetic.invalid ESMTP\r\n');
    let buffer = '', data = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let i: number;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (data) {
          if (line !== '.') continue;
          data = false; submissions++;
          if (outcome === 'reply-lost') { socket.destroy(); return; }
          socket.write('250 2.0.0 synthetic accepted\r\n');
        } else if (/^(EHLO|HELO)/.test(line)) socket.write('250 synthetic.invalid\r\n');
        else if (/^(MAIL FROM|RCPT TO|RSET)/.test(line)) socket.write('250 2.0.0 OK\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 synthetic data\r\n'); }
        else if (line === 'QUIT') { socket.end('221 synthetic bye\r\n'); }
        else socket.write('500 synthetic unsupported\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback peer required');
  return { port: address.port, get submissions() { return submissions; },
    async close() { for (const transport of mockTransports.splice(0)) transport.close(); for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

async function run(outcome: 'accepted' | 'reply-lost') {
  const server = await peer(outcome);
  mockConfig.mockResolvedValue({ host: '127.0.0.1', port: server.port, secure: false, user: null, pass: null,
    fromEmail: 'sender@example.invalid', fromName: 'Synthetic' });
  jest.resetModules();
  const mail = await import('./mail.server');
  try {
    const prepared = await mail.prepareListEmail({ to: 'recipient@example.invalid', subject: 'Synthetic', html: '<p>Synthetic only</p>' });
    expect(prepared.sender).toEqual({ address: 'sender@example.invalid', name: 'Synthetic' });
    if (outcome === 'accepted') await expect(prepared.send()).resolves.toBeUndefined();
    else await expect(prepared.send()).rejects.toMatchObject({ name: 'MailDeliveryError', rejectionCode: null });
    expect(server.submissions).toBe(1);
  } finally { await server.close(); }
}

it('real Nodemailer pool accepts one synthetic loopback message', async () => { await run('accepted'); });
it('loss of the final DATA reply is uncertain and the real pool never retransmits that message', async () => { await run('reply-lost'); });

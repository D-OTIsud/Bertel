/** @jest-environment node */
import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from './env.server';

jest.mock('server-only', () => ({}));
const mockConfig = jest.fn();
jest.mock('./smtp-settings.server', () => ({ resolveSmtpConfig: () => mockConfig() }));
const mockTransports: Transporter[] = [];
const mockCertificate = readFileSync(path.join(__dirname, '__fixtures__/smtp-local-only/certificate.pem'));
jest.mock('nodemailer', () => {
  const actual = jest.requireActual('nodemailer');
  return { __esModule: true, default: {
    ...actual,
    // The real SMTP implementation, trusting only this loopback fixture's CA.
    // All application options, including requireTLS and pooling, are preserved.
    createTransport: (options: Record<string, unknown>) => {
      const transport = actual.createTransport({ ...options, tls: { ca: mockCertificate, servername: 'localhost' } });
      mockTransports.push(transport);
      return transport;
    },
  } };
});

type CapturedMail = { from: string; recipients: string[]; raw: string };
async function startSmtp(options: { noTls?: boolean; rejectAuth?: boolean } = {}) {
  const context = tls.createSecureContext({
    cert: mockCertificate,
    key: readFileSync(path.join(__dirname, '__fixtures__/smtp-local-only/key.pem')),
  });
  const sockets = new Set<net.Socket>();
  const messages: CapturedMail[] = [];
  let connections = 0;
  let upgrades = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let stream: net.Socket = socket;
    let buffer = '';
    let body: string[] | null = null;
    let from = '';
    let recipients: string[] = [];
    const reply = (text: string) => stream.write(`${text}\r\n`);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (body) {
          if (line === '.') {
            messages.push({ from, recipients: [...recipients], raw: body.join('\r\n') });
            body = null;
            reply('250 queued locally');
          } else body.push(line.replace(/^\.\./, '.'));
        } else if (/^(EHLO|HELO) /i.test(line)) {
          reply(`250-localhost\r\n${options.noTls ? '' : '250-STARTTLS\r\n'}250 AUTH PLAIN`);
        } else if (line === 'STARTTLS') {
          if (options.noTls) { reply('502 TLS unavailable'); continue; }
          reply('220 Begin TLS');
          socket.removeListener('data', onData);
          stream = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
          upgrades += 1;
          sockets.add(stream);
          stream.on('error', () => {});
          stream.on('close', () => sockets.delete(stream));
          stream.on('data', onData);
        } else if (/^AUTH /i.test(line)) {
          reply(options.rejectAuth ? '535 password=synthetic-fixture-secret rejected' : '235 authenticated');
        } else if (/^MAIL FROM:/i.test(line)) {
          from = line.slice('MAIL FROM:'.length).trim();
          recipients = [];
          reply('250 sender accepted');
        } else if (/^RCPT TO:/i.test(line)) {
          recipients.push(line.slice('RCPT TO:'.length).trim());
          reply('250 recipient accepted');
        } else if (line === 'DATA') { body = []; reply('354 End with dot'); }
        else if (line === 'QUIT') { reply('221 Bye'); stream.end(); }
        else if (line === 'RSET' || line === 'NOOP') reply('250 OK');
        else reply('500 Unsupported test command');
      }
    };
    socket.on('data', onData);
    reply('220 localhost test SMTP');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port, messages,
    get connections() { return connections; },
    get upgrades() { return upgrades; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

const relays: Awaited<ReturnType<typeof startSmtp>>[] = [];
async function relay(options?: Parameters<typeof startSmtp>[0]) {
  const server = await startSmtp(options);
  relays.push(server);
  mockConfig.mockReturnValue({ host: '127.0.0.1', port: server.port, secure: false,
    user: null, pass: null, fromName: 'Bertel', fromEmail: 'no-reply@example.invalid' } satisfies SmtpConfig);
  return server;
}

beforeEach(() => { jest.resetModules(); mockConfig.mockReset(); });
afterEach(async () => {
  for (const transport of mockTransports.splice(0)) transport.close();
  for (const server of relays.splice(0)) await server.close();
});

test('real SMTP uses STARTTLS, one pooled connection and isolated message senders', async () => {
  const server = await relay();
  const { sendMail, sendListEmail } = await import('./mail.server');
  await sendMail({ to: 'recipient@example.invalid', subject: 'Task', html: '<p>Task</p>',
    sender: { address: 'alice@example.invalid', name: 'Alice <other@example.invalid>' } });
  await sendListEmail({ to: 'recipient@example.invalid', subject: 'List', html: '<p>List</p>' });
  await sendListEmail({ to: 'recipient@example.invalid', subject: 'List 2', html: '<p>List 2</p>' });
  expect(server.connections).toBe(1);
  expect(server.upgrades).toBe(1);
  expect(server.messages).toHaveLength(3);
  expect(server.messages.map((message) => message.from)).toEqual([
    '<alice@example.invalid>', '<no-reply@example.invalid>', '<no-reply@example.invalid>',
  ]);
  for (const message of server.messages) expect(message.recipients).toEqual(['<recipient@example.invalid>']);
  expect(server.messages[0].raw).toContain('From: "Alice <other@example.invalid>" <alice@example.invalid>');
  expect(server.messages[1].raw).toContain('Subject: List');
});

test('connection verification uses a separate connection and emits no message', async () => {
  const server = await relay();
  const { sendListEmail, verifySmtpConnection } = await import('./mail.server');
  await sendListEmail({ to: 'recipient@example.invalid', subject: 'Before', html: '<p>Before</p>' });
  await expect(verifySmtpConnection()).resolves.toMatchObject({ ok: true });
  expect(server.messages).toHaveLength(1);
  await sendListEmail({ to: 'recipient@example.invalid', subject: 'After', html: '<p>After</p>' });
  expect(server.connections).toBe(2);
  expect(server.messages).toHaveLength(2);
});

test('a relay without STARTTLS cannot receive a message', async () => {
  const server = await relay({ noTls: true });
  const { sendListEmail } = await import('./mail.server');
  await expect(sendListEmail({ to: 'recipient@example.invalid', subject: 'Blocked', html: '<p>Blocked</p>' })).rejects.toThrow();
  expect(server.messages).toHaveLength(0);
  expect(server.upgrades).toBe(0);
});

test('real authentication refusal is reported without echoing the relay response', async () => {
  const server = await relay({ rejectAuth: true });
  mockConfig.mockReturnValue({ ...mockConfig(), user: 'synthetic-user', pass: 'synthetic-fixture-secret' });
  const { sendListEmail } = await import('./mail.server');
  await expect(sendListEmail({ to: 'recipient@example.invalid', subject: 'Blocked', html: '<p>Blocked</p>' }))
    .rejects.toThrow('Authentification refusée. Vérifiez l’identifiant et le mot de passe.');
  expect(server.messages).toHaveLength(0);
  expect(server.upgrades).toBe(1);
});

/** @jest-environment node */
import net, { type Socket } from 'node:net';
import type { Transporter } from 'nodemailer';
import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));
const mockConfig = jest.fn();
const mockServer = jest.fn();
const mockTransports: Transporter[] = [];
jest.mock('./smtp-settings.server', () => ({ resolveSmtpConfig: () => mockConfig() }));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: () => mockServer() }));
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
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 synthetic.invalid ESMTP\r\n');
    let buffer = '', data = false;
    let message = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let i: number;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (data) {
          if (line !== '.') {
            message += line + '\r\n';
            continue;
          }
          messages.push(message);
          message = '';
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
  return { port: address.port, messages, get submissions() { return submissions; },
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

it('sends only configured partner links through SMTP despite forged request and proxy headers', async () => {
  const relay = await peer('accepted');
  const env = jest.replaceProperty(process, 'env', { ...process.env, NEXT_PUBLIC_APP_URL: 'https://bertel.example/' });
  const notification = { notification_id: 'synthetic-review', kind: 'fiche_submission_reviewed',
    outcome: 'approved', recipient_email: 'recipient@example.invalid', object_name: 'Synthetic property' };
  const rpc = jest.fn((name: string) => {
    switch (name) {
      case 'claim_unmailed_notifications': return { data: [notification], error: null };
      case 'suppress_sandbox_notification_emails': return { data: [], error: null };
      case 'mark_notifications_emailed': return { data: 1, error: null };
      default: throw new Error('Unexpected synthetic notification RPC');
    }
  });
  mockServer.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    schema: () => ({ rpc }) });
  mockConfig.mockResolvedValue({ host: '127.0.0.1', port: relay.port, secure: false, user: null, pass: null,
    fromEmail: 'sender@example.invalid', fromName: 'Synthetic' });
  try {
    await jest.isolateModulesAsync(async () => {
      const { POST } = await import('@/app/api/crm/notify-drain/route');
      const headers = { authorization: 'Bearer synthetic', host: 'outside.example', origin: 'https://outside.example',
        forwarded: 'host=outside.example;proto=https', 'x-forwarded-host': 'outside.example', 'x-forwarded-proto': 'https' };
      const request = new NextRequest('https://request.invalid/api/crm/notify-drain', { method: 'POST', headers });
      expect(Object.fromEntries(request.headers)).toEqual(headers);
      const response = await POST(request);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ sent: 1, failed: 0 });
    });
    expect(rpc.mock.calls).toEqual([
      ['claim_unmailed_notifications', { p_limit: 20 }],
      ['suppress_sandbox_notification_emails', { p_notification_ids: ['synthetic-review'] }],
      ['mark_notifications_emailed', { p_sent: ['synthetic-review'], p_failed: [] }],
    ]);
    expect(relay.messages).toHaveLength(1);
    const message = relay.messages[0];
    const separator = message.indexOf('\r\n\r\n');
    expect(separator).toBeGreaterThan(0);
    const mime = message.slice(0, separator);
    const body = message.slice(separator + 4);
    expect(mime).toMatch(/^Content-Type: text\/html;/im);
    expect(mime).toMatch(/^Content-Transfer-Encoding: quoted-printable\r?$/im);
    const html = Buffer.from(body.replace(/=\r\n/g, '').replace(/=([0-9a-f]{2})/gi,
      (_escape, octet) => String.fromCharCode(Number.parseInt(octet, 16))), 'latin1').toString('utf8');
    expect([...new Set([...html.matchAll(/href="([^"]+)"/g)].map((link) => link[1]))].sort()).toEqual([
      'https://bertel.example/espace', 'https://bertel.example/login',
    ]);
    expect(html).not.toMatch(/outside\.example|request\.invalid/);
  } finally {
    env.restore();
    mockServer.mockReset();
    mockConfig.mockReset();
    await relay.close();
  }
});

/** @jest-environment node */
jest.mock('server-only', () => ({}));
// INT-03 — un e-mail accepté par le relais SMTP ne doit JAMAIS repartir en erreur : un échec
// du marquage mark_list_sent (retourné OU levé) reste un 200 avec trackingUpdated:false.
import { POST } from './route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/mail.server', () => ({
  sendListEmail: jest.fn(),
  prepareListEmail: async (options: unknown) => ({ sender: { address: 'sender@example.invalid', name: 'Synthetic' },
    send: () => jest.requireMock('@/lib/mail.server').sendListEmail(options) }),
  MailDeliveryError: class extends Error { rejectionCode: string | null; constructor(error: { code?: string }) { super('Authentification refusée.'); this.rejectionCode = error.code ?? null; } },
  MailNotConfiguredError: class extends Error {},
}));
jest.mock('@/lib/smtp-settings.server', () => ({ resolveSmtpConfig: jest.fn() }));
jest.mock('@/emails/ListEmail', () => ({
  renderListEmailHtml: jest.fn(() => '<html></html>'),
  listEmailSubject: jest.fn(() => 'subject'),
}));
jest.mock('@/features/lists/type-meta', () => ({
  ACCENT_INK: { teal: '#000' },
  typeLabel: jest.fn(() => 'Type'),
}));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { sendListEmail, MailDeliveryError } from '@/lib/mail.server';
import { resolveSmtpConfig } from '@/lib/smtp-settings.server';
import { renderListEmailHtml } from '@/emails/ListEmail';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedSend = jest.mocked(sendListEmail);
const mockedSmtp = jest.mocked(resolveSmtpConfig);
const originalListEmailMode = process.env.LIST_EMAIL_MODE;
afterAll(() => {
  if (originalListEmailMode === undefined) delete process.env.LIST_EMAIL_MODE;
  else process.env.LIST_EMAIL_MODE = originalListEmailMode;
});

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://app.test/api/lists/send', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'Idempotency-Key': 'd2000000-0000-4000-8000-000000000001' },
    body: JSON.stringify({ phase: 'prepare', expectedGeneration: '0', ...body }),
  });
}

async function send(request: NextRequest) {
  const input = await request.clone().json();
  const prepared = await POST(request);
  const body = await prepared.clone().json();
  if (!prepared.ok || body.phase !== 'prepared') return prepared;
  return POST(req({ ...input, phase: 'dispatch', dispatchToken: body.dispatchToken }));
}

const LIST_ROW = {
  id: 'list-1',
  lang: 'fr',
  name: 'Ma liste',
  intro_fr: null,
  items: [],
  accent: 'teal',
  cover_url: null,
};

/**
 * Contrat listes 2026-09-07 — `mark_list_sent(p_list_id, p_sender_id)` est grant service_role
 * UNIQUEMENT : ce marquage passe donc par `server` (le client service-role tenu depuis la
 * vérification du JWT), JAMAIS par `asCaller`. `ensure_list_share_link` remplace `share_list`
 * pour le lien « sélection complète » (un membre non-éditeur ne doit pas pouvoir réactiver un
 * lien explicitement désactivé — ce que `share_list(p_enable:true)` aurait fait).
 */
function setup(opts: { markError?: { message: string } | null; markThrows?: boolean }) {
  const serverRpc = jest.fn((name: string) => {
    if (name === 'mark_list_sent') {
      if (opts.markThrows) return Promise.reject(new Error('db down'));
      return Promise.resolve({ data: null, error: opts.markError ?? null });
    }
    if (name === 'prepare_list_email') return Promise.resolve({ data: { state: 'reserved', attempt_token: 'd2000000-0000-4000-8000-000000000099' }, error: null });
    if (name === 'begin_list_email') return Promise.resolve({ data: { started: true }, error: null });
    if (name === 'complete_list_email') return Promise.resolve({ data: true, error: null });
    throw new Error(`unexpected server rpc ${name}`);
  });

  mockedServer.mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com', user_metadata: {} } }, error: null }) },
    schema: () => ({ rpc: serverRpc }),
  } as never);

  const rpc = jest.fn((name: string) => {
    if (name === 'get_list') return Promise.resolve({ data: LIST_ROW, error: null });
    if (name === 'ensure_list_share_link') return Promise.resolve({ data: { share_token: 'tok' }, error: null });
    throw new Error(`unexpected rpc ${name}`);
  });

  mockedCreate.mockReturnValue({
    schema: () => ({ rpc }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  } as never);

  return { rpc, serverRpc };
}

describe('POST /api/lists/send — marquage après envoi SMTP accepté', () => {
  beforeEach(() => {
    process.env.LIST_EMAIL_MODE = 'protocol-v1';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
    jest.clearAllMocks();
    mockedSend.mockResolvedValue(undefined);
    mockedSmtp.mockResolvedValue({ host: 'smtp', port: 587, secure: false, user: null, pass: null, fromName: 'Bertel', fromEmail: 'no-reply@x' });
  });

  it('refuse une configuration absente avant création de lien ou SMTP, sans repli Host', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { rpc, serverRpc } = setup({});
    const response = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'app_origin_unavailable' });
    expect(rpc).not.toHaveBeenCalledWith('ensure_list_share_link', expect.anything());
    expect(mockedSend).not.toHaveBeenCalled();
    expect(serverRpc).not.toHaveBeenCalled();
  });

  it('fabrique le lien de liste avec la configuration uniquement malgré des headers étrangers', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://bertel.example/';
    setup({});
    const request = req({ listId: 'list-1', toEmail: 'a@example.com' });
    request.headers.set('origin', 'https://outside.example');
    request.headers.set('host', 'outside.example');
    request.headers.set('x-forwarded-host', 'outside.example');
    const response = await send(request);
    expect(response.status).toBe(200);
    expect(renderListEmailHtml).toHaveBeenCalledWith(expect.objectContaining({ publicUrl: 'https://bertel.example/l/tok' }));
  });

  it('SMTP absent : ni lien, ni e-mail, ni marquage', async () => {
    mockedSmtp.mockResolvedValue(null);
    const { rpc, serverRpc } = setup({ markError: null });
    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    expect(res.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(serverRpc).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('mark_list_sent renvoie une erreur => 200, trackingUpdated:false, un seul envoi SMTP', async () => {
    setup({ markError: { message: 'forbidden' } });

    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, trackingUpdated: false, warning: 'tracking_update_failed' });
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('mark_list_sent lève une exception => 200, trackingUpdated:false, un seul envoi SMTP', async () => {
    setup({ markThrows: true });

    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, trackingUpdated: false, warning: 'tracking_update_failed' });
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('mark_list_sent réussit => 200, trackingUpdated:true, pas d’avertissement', async () => {
    setup({ markError: null });

    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, trackingUpdated: true });
    expect(body.warning).toBeUndefined();
  });

  it('refus AUTH certain avant soumission => erreur, aucun marquage tenté', async () => {
    setup({ markError: null });
    mockedSend.mockRejectedValue(new MailDeliveryError({ code: 'EAUTH' }));

    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);

    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('send_failed');
  });

  it('marque via le client SERVICE-ROLE (jamais asCaller), avec p_sender_id = l’appelant authentifié', async () => {
    const { rpc, serverRpc } = setup({ markError: null });

    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    expect(res.status).toBe(200);

    expect(serverRpc).toHaveBeenCalledWith('mark_list_sent', { p_list_id: 'list-1', p_sender_id: 'u1' });
    // asCaller n'a JAMAIS reçu mark_list_sent — seuls get_list et ensure_list_share_link.
    expect(rpc).not.toHaveBeenCalledWith('mark_list_sent', expect.anything());
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual(['ensure_list_share_link', 'ensure_list_share_link', 'get_list', 'get_list']);
  });

  it('génère le lien public via ensure_list_share_link (en tant qu’appelant), pas share_list', async () => {
    const { rpc } = setup({ markError: null });
    await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    expect(rpc).toHaveBeenCalledWith('ensure_list_share_link', { p_list_id: 'list-1' });
  });

  it('SHARE_NOT_AVAILABLE (lien coupé, appelant non-éditeur) => 403, aucun envoi SMTP', async () => {
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com', user_metadata: {} } }, error: null }) },
      schema: () => ({ rpc: jest.fn() }),
    } as never);
    const rpc = jest.fn((name: string) => {
      if (name === 'get_list') return Promise.resolve({ data: LIST_ROW, error: null });
      if (name === 'ensure_list_share_link') {
        return Promise.resolve({ data: null, error: { message: 'SHARE_NOT_AVAILABLE: link disabled' } });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockedCreate.mockReturnValue({
      schema: () => ({ rpc }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    } as never);

    const res = await send(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);

    expect(res.status).toBe(403);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

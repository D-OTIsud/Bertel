/** @jest-environment node */
// INT-03 — un e-mail accepté par le relais SMTP ne doit JAMAIS repartir en erreur : un échec
// du marquage mark_list_sent (retourné OU levé) reste un 200 avec trackingUpdated:false.
import { POST } from './route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/mail.server', () => ({
  sendListEmail: jest.fn(),
  MailNotConfiguredError: class extends Error {},
}));
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
import { sendListEmail } from '@/lib/mail.server';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedSend = jest.mocked(sendListEmail);

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://app.test/api/lists/send', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

function setup(opts: { markError?: { message: string } | null; markThrows?: boolean }) {
  mockedServer.mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com', user_metadata: {} } }, error: null }) },
  } as never);

  const rpc = jest.fn((name: string) => {
    if (name === 'get_list') return Promise.resolve({ data: LIST_ROW, error: null });
    if (name === 'share_list') return Promise.resolve({ data: { share_token: 'tok' }, error: null });
    if (name === 'mark_list_sent') {
      if (opts.markThrows) return Promise.reject(new Error('db down'));
      return Promise.resolve({ data: null, error: opts.markError ?? null });
    }
    throw new Error(`unexpected rpc ${name}`);
  });

  mockedCreate.mockReturnValue({
    schema: () => ({ rpc }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  } as never);

  return { rpc };
}

describe('POST /api/lists/send — marquage après envoi SMTP accepté', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSend.mockResolvedValue(undefined);
  });

  it('mark_list_sent renvoie une erreur => 200, trackingUpdated:false, un seul envoi SMTP', async () => {
    setup({ markError: { message: 'forbidden' } });

    const res = await POST(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, trackingUpdated: false, warning: 'tracking_update_failed' });
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('mark_list_sent lève une exception => 200, trackingUpdated:false, un seul envoi SMTP', async () => {
    setup({ markThrows: true });

    const res = await POST(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, trackingUpdated: false, warning: 'tracking_update_failed' });
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('mark_list_sent réussit => 200, trackingUpdated:true, pas d’avertissement', async () => {
    setup({ markError: null });

    const res = await POST(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, trackingUpdated: true });
    expect(body.warning).toBeUndefined();
  });

  it('échec SMTP avant acceptation => erreur, aucun marquage tenté', async () => {
    setup({ markError: null });
    mockedSend.mockRejectedValue(new Error('smtp refused'));

    const res = await POST(req({ listId: 'list-1', toEmail: 'a@example.com' }) as never);

    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('send_failed');
  });
});

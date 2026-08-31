/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/mail.server', () => ({
  sendMail: jest.fn(),
  MailNotConfiguredError: class MailNotConfiguredError extends Error {},
}));
jest.mock('@/lib/env.server', () => ({ readSmtpConfig: jest.fn() }));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { sendMail } from '@/lib/mail.server';
import { readSmtpConfig } from '@/lib/env.server';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedSend = jest.mocked(sendMail);
const mockedSmtp = jest.mocked(readSmtpConfig);

const smtpOk = { host: 'smtp', port: 587, secure: false, user: null, pass: null, fromName: 'Bertel', fromEmail: 'no-reply@x' };

function req(headers: Record<string, string>): never {
  return {
    headers: new Headers(headers),
    nextUrl: { origin: 'https://app.test' },
  } as never;
}

function serverWith(rpc: jest.Mock) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    schema: () => ({ rpc }),
  } as never;
}

const row = (id: string, email: string | null = 'dest@x.re') => ({
  notification_id: id, recipient_email: email, recipient_name: 'Dest',
  task_title: 'Tâche', object_name: 'Hôtel', due_at: null, assigner_name: 'Chef',
});

describe('POST /api/crm/notify-drain', () => {
  beforeEach(() => { jest.clearAllMocks(); mockedSmtp.mockReturnValue(smtpOk as never); });

  it('401 sans Bearer', async () => {
    mockedServer.mockReturnValue(serverWith(jest.fn()));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it('503 SMTP absent — et ne réclame RIEN (le TTL ne doit pas être consommé pour rien)', async () => {
    mockedSmtp.mockReturnValue(null);
    const rpc = jest.fn();
    mockedServer.mockReturnValue(serverWith(rpc));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('draine : claim → envoi par ligne → acquittement p_sent', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [row('n-1'), row('n-2')], error: null }) // claim
      .mockResolvedValueOnce({ data: 2, error: null });                      // mark
    mockedServer.mockReturnValue(serverWith(rpc));
    mockedSend.mockResolvedValue();
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: 2, failed: 0 });
    expect(mockedSend).toHaveBeenCalledTimes(2);
    expect(mockedSend.mock.calls[0][0].to).toBe('dest@x.re');
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_notifications_emailed',
      { p_sent: ['n-1', 'n-2'], p_failed: [] });
  });

  it('un envoi qui échoue part en p_failed avec son message', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [row('n-1'), row('n-2')], error: null })
      .mockResolvedValueOnce({ data: 1, error: null });
    mockedServer.mockReturnValue(serverWith(rpc));
    mockedSend.mockResolvedValueOnce().mockRejectedValueOnce(new Error('smtp boom'));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    await expect(res.json()).resolves.toEqual({ sent: 1, failed: 1 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_notifications_emailed',
      { p_sent: ['n-1'], p_failed: [{ id: 'n-2', error: 'smtp boom' }] });
  });

  it('file vide : 200 {sent:0,failed:0} sans acquittement', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: [], error: null });
    mockedServer.mockReturnValue(serverWith(rpc));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    await expect(res.json()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  // Constat 1 : un acquittement en échec ne doit JAMAIS disparaître en silence — les
  // e-mails sont déjà partis (statut 200 assumé), mais l'appelant doit pouvoir le voir.
  it('acquittement en échec : la réponse porte ackFailed, le statut reste 200 (les e-mails SONT partis)', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [row('n-1')], error: null }) // claim
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied for function mark_notifications_emailed' } }); // mark KO
    mockedServer.mockReturnValue(serverWith(rpc));
    mockedSend.mockResolvedValue();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: 1, failed: 0, ackFailed: true });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // Constat 2 : une ligne malformée (id ou e-mail absent) est sautée défensivement —
  // jamais testé jusqu'ici. Une seule des deux lignes du claim est valide.
  it('ligne malformée dans le claim : sautée, un seul envoi, acquittement de la seule ligne valide', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [row('n-1'), row('n-2', null)], error: null }) // n-2 sans recipient_email
      .mockResolvedValueOnce({ data: 1, error: null });
    mockedServer.mockReturnValue(serverWith(rpc));
    mockedSend.mockResolvedValue();
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_notifications_emailed', { p_sent: ['n-1'], p_failed: [] });
  });

  // Constat 3 : la branche d'erreur du claim n'était pas testée.
  it('claim en erreur : 500 claim_failed, aucun envoi, aucun acquittement', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    mockedServer.mockReturnValue(serverWith(rpc));
    const res = await POST(req({ authorization: 'Bearer jwt' }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'claim_failed', detail: 'permission denied' });
    expect(mockedSend).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

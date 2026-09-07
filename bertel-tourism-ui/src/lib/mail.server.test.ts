/** @jest-environment node */
// M5 — `createTransport` était appelé À CHAQUE e-mail. Sans conséquence tant que `sendMail`
// ne servait qu'un envoi unique ; le drain de l'outbox (17i) l'appelle DANS UNE BOUCLE —
// vingt lignes par ping, donc vingt connexions successives au relais Google, dont
// l'autorisation par IP du VPS est la capacité e-mail de TOUT le produit. La sanction d'une
// rafale ne tomberait pas sur le drain seul.
jest.mock('server-only', () => ({}));

const createTransport = jest.fn();
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: (...a: unknown[]) => createTransport(...a) } }));

const readSmtpConfig = jest.fn();
jest.mock('./smtp-settings.server', () => ({ resolveSmtpConfig: () => readSmtpConfig() }));

type FakeTransport = { sendMail: jest.Mock; close: jest.Mock; verify: jest.Mock };

const cfg = (over: Record<string, unknown> = {}) => ({
  host: 'smtp-relay.gmail.com', port: 587, secure: false,
  fromEmail: 'no-reply@bertel.re', fromName: 'Bertel', user: null, pass: null, ...over,
});

function transportFactory(): FakeTransport[] {
  const made: FakeTransport[] = [];
  createTransport.mockImplementation(() => {
    const t: FakeTransport = { sendMail: jest.fn().mockResolvedValue(undefined), close: jest.fn(), verify: jest.fn().mockResolvedValue(true) };
    made.push(t);
    return t;
  });
  return made;
}

async function loadModule() {
  jest.resetModules();
  return import('./mail.server');
}

beforeEach(() => {
  createTransport.mockReset();
  readSmtpConfig.mockReset();
});

describe('mail.server — transport réutilisé', () => {
  it('vingt envois consécutifs ne construisent QU’UN transport', async () => {
    const made = transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail } = await loadModule();
    for (let i = 0; i < 20; i += 1) {
      await sendMail({ to: `d${i}@x.re`, subject: 's', html: '<p>h</p>' });
    }
    // C'est LE constat : une connexion par e-mail dans la boucle du drain.
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(made).toHaveLength(1);
    expect(made[0].sendMail).toHaveBeenCalledTimes(20);
    expect(made[0].close).not.toHaveBeenCalled();
  });

  it('le transport est POOLÉ et garde requireTLS', async () => {
    transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail } = await loadModule();
    await sendMail({ to: 'd@x.re', subject: 's', html: '<p>h</p>' });
    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(options.pool).toBe(true);
    expect(options.maxConnections).toBe(2);
    expect(options.maxMessages).toBe(100);
    // requireTLS n'est pas décoratif : le relais Google refuse une session en clair. Réutiliser
    // le transport ne doit pas être l'occasion de perdre la contrainte de chiffrement.
    expect(options.requireTLS).toBe(true);
  });

  it('borne les délais de connexion, de salutation et de socket du pool', async () => {
    transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendListEmail } = await loadModule();
    await sendListEmail({ to: 'a@example.com', subject: 's', html: '<p></p>' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 }),
    );
  });

  it('propage un refus SMTP sans fermer le pool partagé ni bloquer l’envoi suivant', async () => {
    const made = transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail } = await loadModule();
    await sendMail({ to: 'a@example.com', subject: 'premier', html: '<p></p>' });
    made[0].sendMail.mockRejectedValueOnce(new Error('smtp refused'));

    await expect(sendMail({ to: 'b@example.com', subject: 'refus', html: '<p></p>' }))
      .rejects.toThrow('L’opération SMTP a échoué');
    await expect(sendMail({ to: 'c@example.com', subject: 'suivant', html: '<p></p>' }))
      .resolves.toBeUndefined();

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(made[0].sendMail).toHaveBeenCalledTimes(3);
    expect(made[0].close).not.toHaveBeenCalled();
  });

  it('les données de MESSAGE sont relues à chaque envoi, jamais figées avec le transport', async () => {
    const made = transportFactory();
    readSmtpConfig.mockReturnValueOnce(cfg({ fromName: 'Bertel' }))
      .mockReturnValueOnce(cfg({ fromName: 'OTI du Sud' }));
    const { sendMail } = await loadModule();
    await sendMail({ to: 'a@x.re', subject: 's', html: '<p>h</p>' });
    await sendMail({ to: 'b@x.re', subject: 's', html: '<p>h</p>' });
    // Un changement de libellé d'expéditeur ne doit PAS jeter le pool…
    expect(createTransport).toHaveBeenCalledTimes(1);
    // …et ne doit pas non plus être ignoré : le `from` vient de la config du moment.
    expect(made[0].sendMail.mock.calls[0][0].from).toEqual({ name: 'Bertel', address: 'no-reply@bertel.re' });
    expect(made[0].sendMail.mock.calls[1][0].from).toEqual({ name: 'OTI du Sud', address: 'no-reply@bertel.re' });
  });

  it('un changement de config de TRANSPORT reconstruit le pool et ferme l’ancien', async () => {
    // Rotation d'identifiants ou bascule de relais : continuer à parler à l'ancien hôte avec
    // l'ancien secret serait une panne muette, et laisser vivre l'ancien pool garderait des
    // sockets ouvertes vers un relais qu'on n'utilise plus.
    const made = transportFactory();
    readSmtpConfig.mockReturnValueOnce(cfg())
      .mockReturnValueOnce(cfg({ host: 'smtp.autre.re' }));
    const { sendMail } = await loadModule();
    await sendMail({ to: 'a@x.re', subject: 's', html: '<p>h</p>' });
    await sendMail({ to: 'b@x.re', subject: 's', html: '<p>h</p>' });
    expect(createTransport).toHaveBeenCalledTimes(2);
    expect(made[0].close).toHaveBeenCalledTimes(1);
    expect(made[1].sendMail).toHaveBeenCalledTimes(1);
  });

  it('SMTP non configuré ⇒ MailNotConfiguredError et AUCUN transport construit', async () => {
    transportFactory();
    readSmtpConfig.mockReturnValue(null);
    const { sendMail, MailNotConfiguredError } = await loadModule();
    await expect(sendMail({ to: 'a@x.re', subject: 's', html: '<p>h</p>' }))
      .rejects.toBeInstanceOf(MailNotConfiguredError);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('utilise le créateur pour une notification puis l’adresse configurée pour une liste sur le même transport', async () => {
    const made = transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail, sendListEmail } = await loadModule();
    await sendMail({ to: 'editor@example.com', subject: 'Tâche', html: '<p>t</p>', sender: { address: 'creator@example.com', name: 'Alice' } });
    // Even a stray extra sender property must not change a list's sender.
    const list = { to: 'visitor@example.com', subject: 'Liste', html: '<p>l</p>', sender: { address: 'wrong@example.com', name: 'Wrong' } };
    await sendListEmail(list);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(made[0].sendMail.mock.calls[0][0].from).toEqual({ address: 'creator@example.com', name: 'Alice' });
    expect(made[0].sendMail.mock.calls[1][0].from).toEqual({ address: 'no-reply@bertel.re', name: 'Bertel' });
  });

  it('ne modifie ni le relais ni ses identifiants pour envoyer au nom du créateur', async () => {
    const made = transportFactory();
    readSmtpConfig.mockReturnValue(cfg({ user: 'smtp-account', pass: 'smtp-secret' }));
    const { sendMail } = await loadModule();
    await sendMail({ to: 'editor@example.com', subject: 'Tâche', html: '<p>t</p>', sender: { address: 'creator@example.com', name: 'Alice <other@example.com>' } });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp-relay.gmail.com', auth: { user: 'smtp-account', pass: 'smtp-secret' } }));
    expect(made[0].sendMail.mock.calls[0][0].from).toEqual({ address: 'creator@example.com', name: 'Alice <other@example.com>' });
  });

  it('refuse une adresse de créateur contenant plusieurs adresses avant de créer le transport', async () => {
    transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail } = await loadModule();
    await expect(sendMail({ to: 'editor@example.com', subject: 'Tâche', html: '<p>t</p>', sender: { address: 'alice@example.com,other@example.com', name: 'Alice' } })).rejects.toThrow('créateur de la tâche est invalide');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('une sauvegarde SMTP laisse terminer les envois déjà engagés sur l’ancien pool', async () => {
    const made = transportFactory();
    readSmtpConfig.mockResolvedValueOnce(cfg()).mockResolvedValueOnce(cfg({ host: 'new.example.com' }));
    const { sendMail } = await loadModule();
    let finishFirst: () => void = () => {};
    createTransport.mockImplementationOnce(() => {
      const t = { sendMail: jest.fn(() => new Promise<void>((resolve) => { finishFirst = resolve; })), close: jest.fn(), verify: jest.fn() };
      made.push(t);
      return t;
    });
    const first = sendMail({ to: 'a@example.com', subject: 'a', html: '<p>a</p>' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await sendMail({ to: 'b@example.com', subject: 'b', html: '<p>b</p>' });
    expect(made).toHaveLength(2);
    expect(made[0].close).not.toHaveBeenCalled();
    finishFirst();
    await first;
    expect(made[0].close).toHaveBeenCalledTimes(1);
    expect(made[1].close).not.toHaveBeenCalled();
  });

  it('ne propage pas les réponses SMTP brutes vers les listes ou le journal de notifications', async () => {
    readSmtpConfig.mockResolvedValue(cfg());
    createTransport.mockReturnValue({ sendMail: jest.fn().mockRejectedValue({ code: 'EAUTH', message: 'password=secret-value' }), close: jest.fn() });
    const { sendMail } = await loadModule();
    await expect(sendMail({ to: 'a@example.com', subject: 'a', html: '<p>a</p>' })).rejects.toThrow('Authentification refusée');
  });

  it('le nom ne peut pas remplacer l’adresse d’expédition par une adresse qu’il contient', async () => {
    const made = transportFactory();
    readSmtpConfig.mockResolvedValue(cfg({ fromName: 'Bertel <other@example.org>' }));
    const { sendMail } = await loadModule();
    await sendMail({ to: 'a@x.re', subject: 's', html: '<p>h</p>' });
    expect(made[0].sendMail.mock.calls[0][0].from).toEqual({ name: 'Bertel <other@example.org>', address: 'no-reply@bertel.re' });
  });

  it('le test SMTP vérifie une connexion séparée sans envoyer ni fermer le pool des listes', async () => {
    const made = transportFactory();
    readSmtpConfig.mockResolvedValue(cfg());
    const { sendMail, verifySmtpConnection } = await loadModule();
    await sendMail({ to: 'a@x.re', subject: 's', html: '<p>h</p>' });
    await expect(verifySmtpConnection()).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(made[0].close).not.toHaveBeenCalled();
    expect(made[1].verify).toHaveBeenCalledTimes(1);
    expect(made[1].sendMail).not.toHaveBeenCalled();
    expect(made[1].close).toHaveBeenCalledTimes(1);
  });

  it('ne retourne jamais une réponse SMTP brute susceptible de contenir le mot de passe', async () => {
    readSmtpConfig.mockResolvedValue(cfg());
    const close = jest.fn();
    createTransport.mockReturnValue({ close, verify: jest.fn().mockRejectedValue({ code: 'EAUTH', message: 'password=secret' }) });
    const { verifySmtpConnection } = await loadModule();
    const result = await verifySmtpConnection();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Authentification refusée');
    expect(result.detail).not.toContain('secret');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

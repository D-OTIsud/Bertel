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
jest.mock('./env.server', () => ({ readSmtpConfig: () => readSmtpConfig() }));

type FakeTransport = { sendMail: jest.Mock; close: jest.Mock };

const cfg = (over: Record<string, unknown> = {}) => ({
  host: 'smtp-relay.gmail.com', port: 587, secure: false,
  fromEmail: 'no-reply@bertel.re', fromName: 'Bertel', user: null, pass: null, ...over,
});

function transportFactory(): FakeTransport[] {
  const made: FakeTransport[] = [];
  createTransport.mockImplementation(() => {
    const t: FakeTransport = { sendMail: jest.fn().mockResolvedValue(undefined), close: jest.fn() };
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
  });

  it('le transport est POOLÉ et garde requireTLS', async () => {
    transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail } = await loadModule();
    await sendMail({ to: 'd@x.re', subject: 's', html: '<p>h</p>' });
    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(options.pool).toBe(true);
    // requireTLS n'est pas décoratif : le relais Google refuse une session en clair. Réutiliser
    // le transport ne doit pas être l'occasion de perdre la contrainte de chiffrement.
    expect(options.requireTLS).toBe(true);
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
    expect(made[0].sendMail.mock.calls[0][0].from).toContain('Bertel');
    expect(made[0].sendMail.mock.calls[1][0].from).toContain('OTI du Sud');
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

  it('l’alias historique sendListEmail reste LA MÊME fonction (routes listes)', async () => {
    transportFactory();
    readSmtpConfig.mockReturnValue(cfg());
    const { sendMail, sendListEmail } = await loadModule();
    expect(sendListEmail).toBe(sendMail);
  });
});

/** @jest-environment node */
export {};
// 18g — lecture du relais SMTP d'une ORG. Deux propriétés portent tout le reste : la
// mémorisation (le drain appelle cette lecture UNE FOIS PAR MESSAGE, jusqu'à vingt par ping)
// et l'absence de repli (pas de relais actif ⇒ `null`, jamais une config approchante).
jest.mock('server-only', () => ({}));

const rpc = jest.fn();
const getServerSupabaseClient = jest.fn();
jest.mock('./supabase-server', () => ({ getServerSupabaseClient: () => getServerSupabaseClient() }));

const ROW = {
  host: 'smtp.a.re', port: 587, secure: false,
  from_email: 'no-reply@a.re', from_name: 'OTI A', username: 'userA', password: 'p4ss',
};

function clientWith(mock: jest.Mock) {
  return { schema: () => ({ rpc: mock }) };
}

async function loadModule() {
  jest.resetModules();
  return import('./org-smtp.server');
}

beforeEach(() => {
  rpc.mockReset();
  getServerSupabaseClient.mockReset();
  getServerSupabaseClient.mockReturnValue(clientWith(rpc));
});

describe('readOrgSmtpConfig', () => {
  it('normalise la ligne du RPC en config de transport', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toEqual({
      orgId: 'ORG-A', host: 'smtp.a.re', port: 587, secure: false,
      fromEmail: 'no-reply@a.re', fromName: 'OTI A', user: 'userA', pass: 'p4ss',
    });
    expect(rpc).toHaveBeenCalledWith('get_org_smtp_secret', { p_org_object_id: 'ORG-A' });
  });

  it('mémorise : vingt lectures de suite ⇒ UN SEUL aller-retour RPC', async () => {
    // C'est la raison d'être du cache : le drain traite jusqu'à vingt notifications par ping et
    // lit la config à chaque message, presque toujours pour la même poignée d'ORG.
    rpc.mockResolvedValue({ data: [ROW], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    for (let i = 0; i < 20; i += 1) await readOrgSmtpConfig('ORG-A');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('mémorise AUSSI l’absence de relais — c’est le cas où le cache sert le plus', async () => {
    // Une ORG non configurée ferait sinon un aller-retour par message, indéfiniment.
    rpc.mockResolvedValue({ data: [], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toBeNull();
    await readOrgSmtpConfig('ORG-A');
    await readOrgSmtpConfig('ORG-A');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('la mémorisation est PAR ORG : deux ORG = deux lectures', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    await readOrgSmtpConfig('ORG-A');
    await readOrgSmtpConfig('ORG-B');
    await readOrgSmtpConfig('ORG-A');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('un ÉCHEC n’est PAS mémorisé : une panne transitoire n’éteint pas le relais une minute', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
       .mockResolvedValueOnce({ data: [ROW], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toBeNull();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toMatchObject({ host: 'smtp.a.re' });
    expect(rpc).toHaveBeenCalledTimes(2);
    // Le message SQL brut reste au journal — il nomme des tables et de la configuration.
    expect(errSpy).toHaveBeenCalledWith('[org-smtp] get_org_smtp_secret failed', 'boom');
    errSpy.mockRestore();
  });

  it('orgId absent ou vide ⇒ null, SANS appeler le RPC', async () => {
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig(null)).resolves.toBeNull();
    await expect(readOrgSmtpConfig('   ')).resolves.toBeNull();
    await expect(readOrgSmtpConfig(undefined)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('une ligne sans hôte ou sans adresse d’expédition ne devient PAS une config', async () => {
    // Mieux vaut un 503 explicite qu'un transport à moitié construit qui échouera au relais.
    rpc.mockResolvedValue({ data: [{ ...ROW, host: '' }], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toBeNull();
  });

  it('identifiant vide ⇒ null (relais autorisé par IP), pas une chaîne vide', async () => {
    // `user && pass` décide de poser un bloc `auth` : une chaîne vide y passerait pour un
    // identifiant et ferait tenter une authentification qui n'a pas lieu d'être.
    rpc.mockResolvedValue({ data: [{ ...ROW, username: '', password: null }], error: null });
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toMatchObject({ user: null, pass: null });
  });

  it('invalidateOrgSmtpConfig force la relecture de CETTE ORG seulement', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });
    const { readOrgSmtpConfig, invalidateOrgSmtpConfig } = await loadModule();
    await readOrgSmtpConfig('ORG-A');
    await readOrgSmtpConfig('ORG-B');
    invalidateOrgSmtpConfig('ORG-A');
    await readOrgSmtpConfig('ORG-A');
    await readOrgSmtpConfig('ORG-B');
    expect(rpc).toHaveBeenCalledTimes(3); // A, B, puis A relue ; B tient toujours
  });

  it('la mémorisation expire : au-delà du TTL, la config est relue', async () => {
    jest.useFakeTimers();
    try {
      rpc.mockResolvedValue({ data: [ROW], error: null });
      const { readOrgSmtpConfig } = await loadModule();
      await readOrgSmtpConfig('ORG-A');
      jest.advanceTimersByTime(61_000);
      await readOrgSmtpConfig('ORG-A');
      expect(rpc).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('service-role absente ⇒ null sans appel (l’appelant rend déjà 500)', async () => {
    getServerSupabaseClient.mockReturnValue(null);
    const { readOrgSmtpConfig } = await loadModule();
    await expect(readOrgSmtpConfig('ORG-A')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

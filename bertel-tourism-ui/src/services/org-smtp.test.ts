// 18g — service navigateur du relais SMTP par ORG. Ce qui compte ici est le CONTRAT du mot de
// passe (écriture seule, vide = conservé) et le fait que le test de connexion n'envoie jamais
// de paramètres de connexion : la route les relit en base.
const rpc = jest.fn();
jest.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ schema: () => ({ rpc }) }) }));

import { getOrgSmtp, saveOrgSmtp, deleteOrgSmtp, testOrgSmtp, secureForPort, SMTP_PORTS } from './org-smtp';

const PAYLOAD = {
  orgObjectId: 'ORG1', configured: true, host: 'smtp.a.re', port: 587, secure: false,
  fromEmail: 'no-reply@a.re', fromName: null, username: 'userA', hasPassword: true,
  isEnabled: true, lastTestAt: null, lastTestOk: null, lastTestError: null, fromNameFallback: 'OTI A',
};

beforeEach(() => rpc.mockReset());

test('getOrgSmtp appelle le RPC gaté et normalise la réponse', async () => {
  rpc.mockResolvedValue({ data: PAYLOAD, error: null });
  await expect(getOrgSmtp('ORG1')).resolves.toMatchObject({
    orgObjectId: 'ORG1', host: 'smtp.a.re', port: 587, hasPassword: true, fromNameFallback: 'OTI A',
  });
  expect(rpc).toHaveBeenCalledWith('get_org_smtp', { p_org_object_id: 'ORG1' });
});

test('une ORG sans ligne rend configured:false, jamais un objet à moitié rempli', async () => {
  rpc.mockResolvedValue({ data: { orgObjectId: 'ORG1', configured: false }, error: null });
  await expect(getOrgSmtp('ORG1')).resolves.toMatchObject({
    configured: false, host: null, port: null, hasPassword: false, isEnabled: false,
  });
});

test('un mot de passe vide part en null ⇒ le serveur CONSERVE celui en place', async () => {
  // C'est l'invariant qui permet au formulaire de ne jamais relire le secret.
  rpc.mockResolvedValue({ data: PAYLOAD, error: null });
  await saveOrgSmtp('ORG1', {
    host: ' smtp.b.re ', port: 587, secure: false, fromEmail: ' NO-reply@b.re ',
    fromName: '', username: '', password: '', isEnabled: true,
  });
  expect(rpc).toHaveBeenCalledWith('upsert_org_smtp', expect.objectContaining({
    p_host: 'smtp.b.re',
    p_from_email: 'NO-reply@b.re', // la normalisation en minuscules appartient à la base
    p_from_name: null,
    p_username: null,
    p_password: null,
    p_clear_password: false,
  }));
});

test('un mot de passe fourni est transmis tel quel, sans rognage', async () => {
  // Les espaces de tête ou de queue peuvent APPARTENIR au secret : les rogner remplacerait un
  // mot de passe valide par un autre, et l'échec se lirait « le fournisseur refuse ».
  rpc.mockResolvedValue({ data: PAYLOAD, error: null });
  await saveOrgSmtp('ORG1', {
    host: 'smtp.b.re', port: 587, secure: false, fromEmail: 'x@b.re', password: ' p4ss ', isEnabled: true,
  });
  expect(rpc).toHaveBeenCalledWith('upsert_org_smtp', expect.objectContaining({ p_password: ' p4ss ' }));
});

test('clearPassword est transmis explicitement', async () => {
  rpc.mockResolvedValue({ data: PAYLOAD, error: null });
  await saveOrgSmtp('ORG1', {
    host: 'smtp.b.re', port: 587, secure: false, fromEmail: 'x@b.re', isEnabled: true, clearPassword: true,
  });
  expect(rpc).toHaveBeenCalledWith('upsert_org_smtp', expect.objectContaining({ p_clear_password: true }));
});

test('une erreur RPC (42501 du gate) remonte son message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN: relais SMTP réservé…' } });
  await expect(getOrgSmtp('ORG1')).rejects.toThrow(/FORBIDDEN/);
});

test('deleteOrgSmtp appelle le RPC dédié', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await deleteOrgSmtp('ORG1');
  expect(rpc).toHaveBeenCalledWith('delete_org_smtp', { p_org_object_id: 'ORG1' });
});

test('secureForPort : 465 seul est en TLS implicite', () => {
  // La base impose (port = 465) = secure ; cette fonction EST la source de cette dérivation
  // côté formulaire.
  expect(secureForPort(465)).toBe(true);
  for (const p of SMTP_PORTS.filter((x) => x !== 465)) expect(secureForPort(p)).toBe(false);
});

test('les ports proposés sont exactement ceux que la base accepte', () => {
  expect([...SMTP_PORTS].sort((a, b) => a - b)).toEqual([25, 465, 587, 2525]);
});

describe('testOrgSmtp', () => {
  test('n’envoie QUE l’ORG — aucun paramètre de connexion ne vient du navigateur', async () => {
    // Accepter un hôte du client ferait de ce bouton un moyen d'ouvrir une connexion sortante
    // vers une destination arbitraire depuis le serveur.
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, detail: 'Connexion établie.' }),
    });
    await expect(testOrgSmtp('ORG1', 'jwt', fetchImpl as unknown as typeof fetch))
      .resolves.toEqual({ ok: true, detail: 'Connexion établie.' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/admin/org-smtp/test');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ orgObjectId: 'ORG1' });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jwt' });
  });

  test('un échec HTTP sans corps lisible rend quand même un détail utile', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => { throw new Error('not json'); },
    });
    await expect(testOrgSmtp('ORG1', 'jwt', fetchImpl as unknown as typeof fetch))
      .resolves.toEqual({ ok: false, detail: 'Échec (403)' });
  });

  test('un 200 { ok: false } est un ÉCHEC, pas un succès', async () => {
    // La route rend 200 avec ok:false quand le relais refuse la session : lire le seul statut
    // HTTP afficherait « connexion réussie » sur un relais injoignable.
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: false, detail: 'Connexion impossible : ECONNREFUSED' }),
    });
    await expect(testOrgSmtp('ORG1', 'jwt', fetchImpl as unknown as typeof fetch))
      .resolves.toEqual({ ok: false, detail: 'Connexion impossible : ECONNREFUSED' });
  });
});

/** @jest-environment node */
// 18g — « Tester la connexion » du relais d'une ORG. Deux invariants portent cette route :
// l'autorisation est celle du RPC gaté (évaluée EN TANT QU'APPELANT), et les paramètres de
// connexion ne viennent JAMAIS du corps de la requête.
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/org-smtp.server', () => ({ invalidateOrgSmtpConfig: jest.fn() }));

const asCallerRpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ schema: () => ({ rpc: asCallerRpc }) }),
}));

const verify = jest.fn();
const close = jest.fn();
const createTransport = jest.fn((_options: unknown) => ({ verify, close }));
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: (o: unknown) => createTransport(o) } }));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { invalidateOrgSmtpConfig } from '@/lib/org-smtp.server';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedInvalidate = jest.mocked(invalidateOrgSmtpConfig);

const SECRET_ROW = { host: 'smtp.a.re', port: 587, secure: false, username: 'userA', password: 'p4ss' };

function req(headers: Record<string, string>, body: unknown = { orgObjectId: 'ORG1' }): never {
  return {
    headers: new Headers(headers),
    url: 'https://app.test/api/admin/org-smtp/test',
    json: async () => {
      if (body === undefined) throw new Error('bad json');
      return body;
    },
  } as never;
}

function serverWith(rpc: jest.Mock, user: unknown = { id: 'u-1' }) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: 'no' } }) },
    schema: () => ({ rpc }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  asCallerRpc.mockResolvedValue({ data: {}, error: null }); // gate passant par défaut
  verify.mockResolvedValue(true);
});

test('401 sans Bearer', async () => {
  mockedServer.mockReturnValue(serverWith(jest.fn()));
  expect((await POST(req({}))).status).toBe(401);
});

test('400 sans orgObjectId — il n’y a pas de cible implicite', async () => {
  mockedServer.mockReturnValue(serverWith(jest.fn()));
  const res = await POST(req({ authorization: 'Bearer jwt' }, {}));
  expect(res.status).toBe(400);
});

test('403 quand le RPC gaté refuse : la garde est le RPC, pas une copie de sa règle', async () => {
  // get_org_smtp lève 42501 pour un rang < 30 ou une autre ORG. Réécrire la règle ici en
  // dupliquerait la définition — et c'est la copie qui se périme.
  asCallerRpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN: …' } });
  const rpc = jest.fn();
  mockedServer.mockReturnValue(serverWith(rpc));
  const res = await POST(req({ authorization: 'Bearer jwt' }));
  expect(res.status).toBe(403);
  // …et surtout : AUCUNE lecture du secret, AUCUNE connexion sortante tentée.
  expect(rpc).not.toHaveBeenCalled();
  expect(createTransport).not.toHaveBeenCalled();
});

test('l’hôte vient de la BASE, jamais du corps de la requête', async () => {
  // C'est l'invariant de sécurité de la route : accepter un hôte du client ferait de ce
  // bouton un moyen d'ouvrir une connexion sortante vers la destination de son choix.
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [SECRET_ROW], error: null }) // get_org_smtp_secret
    .mockResolvedValueOnce({ data: null, error: null });        // record_org_smtp_test
  mockedServer.mockReturnValue(serverWith(rpc));
  const res = await POST(req({ authorization: 'Bearer jwt' }, {
    orgObjectId: 'ORG1', host: 'evil.example.com', port: 4444, username: 'x', password: 'y',
  }));
  expect(res.status).toBe(200);
  const opts = createTransport.mock.calls[0][0] as Record<string, unknown>;
  expect(opts.host).toBe('smtp.a.re');
  expect(opts.port).toBe(587);
  expect(opts).not.toMatchObject({ host: 'evil.example.com' });
  // Le RPC de lecture n'a reçu que l'ORG.
  expect(rpc).toHaveBeenNthCalledWith(1, 'get_org_smtp_secret', { p_org_object_id: 'ORG1' });
});

test('succès : verify() passe, l’issue est consignée, le cache de config est purgé', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [SECRET_ROW], error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  mockedServer.mockReturnValue(serverWith(rpc));
  const res = await POST(req({ authorization: 'Bearer jwt' }));
  await expect(res.json()).resolves.toMatchObject({ ok: true });
  expect(rpc).toHaveBeenNthCalledWith(2, 'record_org_smtp_test',
    { p_org_object_id: 'ORG1', p_ok: true, p_error: null });
  // La config a pu changer juste avant ce test : sans purge, le prochain envoi partirait de
  // l'ancien relais alors qu'on vient de valider le nouveau.
  expect(mockedInvalidate).toHaveBeenCalledWith('ORG1');
  expect(close).toHaveBeenCalled();
});

test('échec de connexion : 200 { ok:false } avec la raison, et la raison est consignée', async () => {
  // Un relais injoignable n'est pas une erreur de la requête : c'est le résultat du test.
  verify.mockRejectedValue(Object.assign(new Error('SMTP response includes p4ss'), { code: 'EAUTH' }));
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [SECRET_ROW], error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  mockedServer.mockReturnValue(serverWith(rpc));
  const res = await POST(req({ authorization: 'Bearer jwt' }));
  expect(res.status).toBe(200);
  const result = await res.json();
  expect(result).toMatchObject({ ok: false, detail: expect.stringContaining('Authentification refusée') });
  expect(JSON.stringify(result)).not.toContain('p4ss');
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_ok: false, p_error: expect.stringContaining('Authentification refusée') });
  expect(JSON.stringify(rpc.mock.calls[1][1])).not.toContain('p4ss');
  expect(close).toHaveBeenCalled(); // le transport est fermé même sur échec
});

test('relais non activé : 200 avec la marche à suivre, aucune connexion tentée', async () => {
  // get_org_smtp_secret ne rend rien tant qu'is_enabled est faux. Ce n'est pas une erreur —
  // c'est l'état à afficher.
  const rpc = jest.fn().mockResolvedValueOnce({ data: [], error: null });
  mockedServer.mockReturnValue(serverWith(rpc));
  const res = await POST(req({ authorization: 'Bearer jwt' }));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ ok: false, detail: expect.stringContaining('Activer l’envoi') });
  expect(createTransport).not.toHaveBeenCalled();
});

test('relais sans identifiant (autorisé par IP) : aucun bloc auth n’est posé', async () => {
  // `user && pass` décide du bloc auth : le poser à vide ferait tenter une authentification
  // qui n'a pas lieu d'être, et le relais refuserait la session.
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [{ ...SECRET_ROW, username: null, password: null }], error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  mockedServer.mockReturnValue(serverWith(rpc));
  await POST(req({ authorization: 'Bearer jwt' }));
  expect(createTransport.mock.calls[0][0]).not.toHaveProperty('auth');
});

test('une consignation en échec ne transforme pas un test réussi en erreur', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [SECRET_ROW], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
  mockedServer.mockReturnValue(serverWith(rpc));
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await POST(req({ authorization: 'Bearer jwt' }));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ ok: true });
  expect(errSpy).toHaveBeenCalled();
  errSpy.mockRestore();
});

test('lecture du secret en erreur : 500 SANS le message SQL brut', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'permission denied for function get_org_smtp_secret' } });
  mockedServer.mockReturnValue(serverWith(rpc));
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await POST(req({ authorization: 'Bearer jwt' }));
  expect(res.status).toBe(500);
  // Égalité stricte : un `detail` réintroduit nommerait une fonction et un droit.
  await expect(res.json()).resolves.toEqual({ ok: false, error: 'read_failed' });
  expect(errSpy).toHaveBeenCalled();
  errSpy.mockRestore();
});

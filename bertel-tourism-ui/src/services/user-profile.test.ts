import { uploadAvatar } from './user-profile';

// BLOQUANT 2 (revue finale 2026-08-29) — cette fonction n'avait AUCUN test. Sans le garde-fou
// `if (targetUserId !== undefined) body.append(...)`, un appel sans second argument enverrait la
// CHAÎNE "undefined" au FormData : la route /api/avatar/upload bascule alors sur son bras admin
// et tout envoi de photo PERSONNELLE échoue en 403 pour un non-administrateur — régression totale
// d'une fonctionnalité existante, suite 100% verte. Vérifié rouge par sabotage (retrait du `if`)
// avant d'être considéré comme fait.
//
// BLOQUANT 3 — un 2xx au corps illisible levait une SyntaxError anglaise au lieu du message FR
// déjà écrit une ligne plus bas pour le cas `!url`.

const getSession = jest.fn();
const getSupabaseClient = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: (...a: unknown[]) => getSupabaseClient(...a),
}));

const authenticatedClient = {
  auth: { getSession: (...a: unknown[]) => getSession(...a) },
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  getSupabaseClient.mockReset().mockReturnValue(authenticatedClient);
  global.fetch = fetchMock as unknown as typeof fetch;
});

function file(): File {
  return new File(['x'], 'a.png', { type: 'image/png' });
}

function formDataOf(callIndex = 0): FormData {
  const [, opts] = fetchMock.mock.calls[callIndex] as [string, { body: FormData }];
  return opts.body;
}

it('uploadAvatar(file) sans second argument n’ajoute AUCUN champ targetUserId au FormData', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ url: 'https://cdn/x.jpg' }) });

  await uploadAvatar(file());

  expect(formDataOf().has('targetUserId')).toBe(false);
});

it('uploadAvatar(file, "u2") ajoute targetUserId avec la bonne valeur', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ url: 'https://cdn/x.jpg' }) });

  await uploadAvatar(file(), 'u2');

  expect(formDataOf().get('targetUserId')).toBe('u2');
});

it('uploadAvatar refuse (message FR) un corps illisible sur une réponse 2xx, au lieu de laisser fuiter la SyntaxError anglaise', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  });

  await expect(uploadAvatar(file())).rejects.toThrow("Réponse invalide du serveur d'avatar.");
});

it('uploadAvatar refuse une réponse 2xx sans champ url (garde déjà existante, non touchée)', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

  await expect(uploadAvatar(file())).rejects.toThrow("Réponse invalide du serveur d'avatar.");
});

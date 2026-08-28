import { getMemberProfile, updateMemberProfile, sendMemberMagicLink, sendMemberSignInLink, uploadMemberAvatar } from './team-profile';
import { AuthApiError } from '@supabase/supabase-js';

const signInWithOtp = jest.fn();
const resetPasswordForEmail = jest.fn();
const getSession = jest.fn();
// jest.fn() séparé (plutôt qu'une factory statique) : MINEUR 3 a besoin de faire varier son
// retour par test (client absent → null) sans réécrire tout le mock.
const getSupabaseClient = jest.fn();

const authenticatedClient = {
  auth: {
    getSession: (...a: unknown[]) => getSession(...a),
    signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
    resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
  },
};

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: (...a: unknown[]) => getSupabaseClient(...a),
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  getSupabaseClient.mockReset().mockReturnValue(authenticatedClient);
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('getMemberProfile lit la route avec le jeton de session', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ displayName: 'Alice', avatarUrl: null, email: 'a@b.c', platformRole: 'tourism_agent', lastSignInAt: null }),
  });
  const profile = await getMemberProfile('u1');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/admin/user-profile?userId=u1',
    expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer tok' }) }),
  );
  expect(profile.displayName).toBe('Alice');
});

it('getMemberProfile traduit une erreur de route en français (périmètre)', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ error: 'out_of_scope' }),
  });
  await expect(getMemberProfile('u2')).rejects.toThrow(/organisation/i);
});

// MINEUR 3 — authHeader() (client Supabase absent / session sans jeton) n'était couvert par aucun
// test ; on l'éprouve via getMemberProfile, son appelant le plus simple.
it('getMemberProfile échoue proprement si Supabase n’est pas configuré (client absent)', async () => {
  getSupabaseClient.mockReturnValue(null);
  await expect(getMemberProfile('u1')).rejects.toThrow('Supabase non configuré.');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('getMemberProfile échoue proprement si la session est absente (pas de jeton)', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  await expect(getMemberProfile('u1')).rejects.toThrow('Session expirée — reconnectez-vous.');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('updateMemberProfile n’émet QUE les champs fournis', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated: true }) });
  await updateMemberProfile({ userId: 'u1', displayName: 'Alice' });
  const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
  // MINEUR 2 — auparavant seul le corps était vérifié : l'URL, `method: 'PATCH'` et l'en-tête
  // `authorization` pouvaient disparaître sans qu'aucun test ne rougisse, sur le SEUL appel MUTANT
  // de ce service (identité et rang plateforme).
  expect(calledUrl).toBe('/api/admin/user-profile');
  expect(opts.method).toBe('PATCH');
  expect(opts.headers).toEqual(expect.objectContaining({ authorization: 'Bearer tok' }));
  const body = JSON.parse(opts.body);
  expect(body).toEqual({ userId: 'u1', displayName: 'Alice' });
});

it('updateMemberProfile traduit une erreur de route en français', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ error: 'owner_required', detail: 'Seul un owner peut attribuer ou retirer le rang plateforme.' }),
  });
  await expect(updateMemberProfile({ userId: 'u1', platformRole: 'owner' })).rejects.toThrow(/owner/i);
});

it('uploadMemberAvatar envoie le fichier et le targetUserId en multipart, et rend l’URL', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ url: 'https://cdn.example/avatar.jpg' }) });
  const file = new File(['x'], 'a.png', { type: 'image/png' });

  const url = await uploadMemberAvatar('u1', file);

  expect(url).toBe('https://cdn.example/avatar.jpg');
  const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, { method: string; body: FormData; headers: Record<string, string> }];
  expect(calledUrl).toBe('/api/avatar/upload');
  expect(opts.method).toBe('POST');
  expect(opts.headers).toEqual(expect.objectContaining({ authorization: 'Bearer tok' }));
  expect(opts.body.get('targetUserId')).toBe('u1');
  expect(opts.body.get('file')).toBe(file);
});

it('uploadMemberAvatar traduit un 415 en message de format explicite', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 415, json: async () => ({ error: 'mime' }) });
  const file = new File(['x'], 'a.gif', { type: 'image/gif' });
  await expect(uploadMemberAvatar('u1', file)).rejects.toThrow(/format/i);
});

// MINEUR 4 — uploadMemberAvatar délègue désormais à uploadAvatar (user-profile.ts), qui traduit
// ses erreurs via readApiErrorMessage (api-error.ts) et non plus rbacRouteError (rbac.ts).
// `readApiErrorMessage` porte le même libellé pour `user_not_found`, donc l'assertion ne change
// pas — mais la fonction réellement exercée change, d'où le titre mis à jour.
it('uploadMemberAvatar traduit les autres erreurs de route en français', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'user_not_found' }) });
  const file = new File(['x'], 'a.png', { type: 'image/png' });
  await expect(uploadMemberAvatar('u1', file)).rejects.toThrow(/compte/i);
});

// MINEUR 3 — le garde-fou le plus utile de la revue : sans lui, une réponse d'upload sans `url`
// poserait un avatar VIDE en silence (le membre voit sa photo disparaître sans message d'erreur).
it('uploadMemberAvatar refuse une réponse d’upload sans url', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
  const file = new File(['x'], 'a.png', { type: 'image/png' });
  await expect(uploadMemberAvatar('u1', file)).rejects.toThrow(/serveur d.avatar/i);
});

it('sendMemberSignInLink passe par resetPasswordForEmail vers /set-password', async () => {
  await sendMemberSignInLink('a@b.c');
  expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
    redirectTo: `${window.location.origin}/set-password`,
  });
});

// MINEUR 3 — sendMemberSignInLink délègue maintenant à requestPasswordReset (auth.ts) : le garde
// « client absent » qu'on éprouve ici est donc celui d'auth.ts, pas une copie locale.
it('sendMemberSignInLink échoue proprement si Supabase n’est pas configuré (client absent)', async () => {
  getSupabaseClient.mockReturnValue(null);
  await expect(sendMemberSignInLink('a@b.c')).rejects.toThrow('Supabase non configure.');
});

it('sendMemberMagicLink refuse de créer un compte au passage', async () => {
  await sendMemberMagicLink('a@b.c');
  expect(signInWithOtp).toHaveBeenCalledWith({
    email: 'a@b.c',
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
  });
});

// MINEUR 3 — client absent, non couvert avant ce correctif.
it('sendMemberMagicLink échoue proprement si Supabase n’est pas configuré (client absent)', async () => {
  getSupabaseClient.mockReturnValue(null);
  await expect(sendMemberMagicLink('a@b.c')).rejects.toThrow('Supabase non configuré.');
});

// IMPORTANT 1 — ce test EST le défaut de la revue, corrigé. Avant ce correctif, sendMemberMagicLink
// faisait `throw new Error(error.message)` : il épinglait le brut anglais de GoTrue ("For security
// purposes, you can only request this after 51 seconds.") au lieu de le traduire, alors que
// AUTH_ERROR_LABELS.over_email_send_rate_limit existe déjà côté auth.ts. Le correctif fait passer
// l'erreur par toFriendlyAuthError ; l'assertion ci-dessous exige maintenant le message FRANÇAIS
// exact produit pour ce code ('over_email_send_rate_limit'), plus jamais l'anglais brut.
it('sendMemberMagicLink traduit l’erreur de débit en français', async () => {
  signInWithOtp.mockResolvedValue({
    error: new AuthApiError(
      'For security purposes, you can only request this after 51 seconds.',
      429,
      'over_email_send_rate_limit',
    ),
  });
  await expect(sendMemberMagicLink('a@b.c')).rejects.toThrow(
    'Trop d’e-mails envoyés — patientez quelques minutes puis réessayez.',
  );
});

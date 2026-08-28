import { getMemberProfile, updateMemberProfile, sendMemberMagicLink, sendMemberSignInLink, uploadMemberAvatar } from './team-profile';

const signInWithOtp = jest.fn();
const resetPasswordForEmail = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
    },
  }),
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
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

it('updateMemberProfile n’émet QUE les champs fournis', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated: true }) });
  await updateMemberProfile({ userId: 'u1', displayName: 'Alice' });
  const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
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

it('uploadMemberAvatar traduit les autres erreurs de route via rbacRouteError', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'user_not_found' }) });
  const file = new File(['x'], 'a.png', { type: 'image/png' });
  await expect(uploadMemberAvatar('u1', file)).rejects.toThrow(/compte/i);
});

it('sendMemberSignInLink passe par resetPasswordForEmail vers /set-password', async () => {
  await sendMemberSignInLink('a@b.c');
  expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
    redirectTo: `${window.location.origin}/set-password`,
  });
});

it('sendMemberMagicLink refuse de créer un compte au passage', async () => {
  await sendMemberMagicLink('a@b.c');
  expect(signInWithOtp).toHaveBeenCalledWith({
    email: 'a@b.c',
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
  });
});

it('sendMemberMagicLink propage l’erreur de débit', async () => {
  signInWithOtp.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 51 seconds.' } });
  await expect(sendMemberMagicLink('a@b.c')).rejects.toThrow(/51 seconds/);
});

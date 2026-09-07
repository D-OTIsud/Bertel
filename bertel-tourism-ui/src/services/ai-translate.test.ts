import { translateWithAi } from './ai-translate';
import { getSupabaseClient } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));
const getSession = jest.fn();
const fetcher = jest.fn();
const input = { objectId: 'HOTRUN0000000001', sourceLanguage: 'fr', targetLanguage: 'en', fields: { description: '**Bonjour**' } };

beforeEach(() => {
  jest.clearAllMocks();
  (getSupabaseClient as jest.Mock).mockReturnValue({ auth: { getSession } });
  getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } }, error: null });
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ translations: { description: '**Hello**' } }) });
});

it('transports unsaved Markdown with the current user token and cancellation signal', async () => {
  const signal = new AbortController().signal;
  await expect(translateWithAi(input, signal, fetcher)).resolves.toEqual({ description: '**Hello**' });
  expect(fetcher).toHaveBeenCalledWith('/api/ai/translate', expect.objectContaining({
    body: JSON.stringify(input), signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
  }));
});

it('requires a session before any network request', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(translateWithAi(input, undefined, fetcher)).rejects.toThrow('Reconnectez-vous');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([{}, { description: '' }, { description: 42 }, { description: 'Hello', surprise: 'unrequested' }])(
  'rejects incomplete or unexpected output before applying it: %p', async (translations) => {
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ translations }) });
    await expect(translateWithAi(input, undefined, fetcher)).rejects.toThrow('incomplète');
  },
);

it('explains missing provider configuration without showing raw server details', async () => {
  fetcher.mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: 'private provider details' }) });
  await expect(translateWithAi(input, undefined, fetcher)).rejects.toThrow('administrateur');
});

it('does not send after cancellation while retrieving the session', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(translateWithAi(input, controller.signal, fetcher)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});

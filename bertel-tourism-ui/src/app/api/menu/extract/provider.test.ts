import { callVisionExtraction, ProviderError, type ProviderConfig } from './provider';

const OAI: ProviderConfig = {
  apiKind: 'openai_compatible',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-test',
  maxOutputTokens: 2048,
};
const IMAGES = [{ mime: 'image/jpeg', base64: 'AAAA' }];
const PROMPT = { system: 'sys', user: 'usr' };

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

describe('callVisionExtraction — openai_compatible', () => {
  it('POSTs chat/completions with image_url parts and a bearer key, returns the content', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return okResponse('{"title":"X","dishes":[]}');
    }) as unknown as typeof fetch;

    const res = await callVisionExtraction(OAI, 'sk-key', IMAGES, PROMPT, { fetchImpl });

    expect(res.text).toBe('{"title":"X","dishes":[]}');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-key');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe('gpt-test');
    expect(body.max_tokens).toBe(2048);
    const userParts = body.messages.find((m: { role: string }) => m.role === 'user').content;
    const imagePart = userParts.find((p: { type: string }) => p.type === 'image_url');
    expect(imagePart.image_url.url).toBe('data:image/jpeg;base64,AAAA');
  });

  it('omits the Authorization header when no key is given (e.g. local Ollama)', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return okResponse('{"dishes":[]}');
    }) as unknown as typeof fetch;

    await callVisionExtraction(OAI, null, IMAGES, PROMPT, { fetchImpl });
    expect(seen['Authorization']).toBeUndefined();
  });

  it('applies provider-specific extra headers (e.g. OpenRouter)', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return okResponse('{"dishes":[]}');
    }) as unknown as typeof fetch;

    await callVisionExtraction(
      { ...OAI, extra: { headers: { 'HTTP-Referer': 'https://bertel.app', 'X-Title': 'Bertel' } } },
      'sk',
      IMAGES,
      PROMPT,
      { fetchImpl },
    );
    expect(seen['HTTP-Referer']).toBe('https://bertel.app');
    expect(seen['X-Title']).toBe('Bertel');
  });

  it('throws ProviderError with the status on a non-ok response', async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 429, text: async () => 'rate limited' }) as unknown as Response) as unknown as typeof fetch;
    await expect(callVisionExtraction(OAI, 'sk', IMAGES, PROMPT, { fetchImpl })).rejects.toMatchObject({
      name: 'ProviderError',
      status: 429,
    });
  });

  it('throws when the response has no message content', async () => {
    const fetchImpl = (async () =>
      ({ ok: true, status: 200, json: async () => ({ choices: [] }) }) as unknown as Response) as unknown as typeof fetch;
    await expect(callVisionExtraction(OAI, 'sk', IMAGES, PROMPT, { fetchImpl })).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('callVisionExtraction — anthropic', () => {
  it('is not yet implemented and fails clearly', async () => {
    await expect(
      callVisionExtraction({ ...OAI, apiKind: 'anthropic' }, 'sk', IMAGES, PROMPT, {
        fetchImpl: (async () => okResponse('{}')) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

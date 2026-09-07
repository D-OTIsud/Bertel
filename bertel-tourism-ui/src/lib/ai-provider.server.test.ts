/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { resolveActiveAiProvider } from './ai-provider.server';

const rpc = jest.fn();
const server = { schema: () => ({ rpc }) } as never;
const signal = new AbortController().signal;
const valid = {
  api_kind: 'openai_compatible', base_url: 'https://ollama.example/v1', model: 'qwen2.5',
  max_output_tokens: 2048, extra: null, api_key: null,
};

beforeEach(() => { rpc.mockReset(); });

it('accepts a valid OpenAI-compatible local provider without a key', async () => {
  rpc.mockReturnValue({ abortSignal: jest.fn().mockResolvedValue({ data: [valid], error: null }) });
  await expect(resolveActiveAiProvider(server, signal)).resolves.toEqual({
    config: { apiKind: 'openai_compatible', baseUrl: valid.base_url, model: valid.model, maxOutputTokens: 2048, extra: null },
    apiKey: null,
  });
});

it.each([
  { ...valid, api_kind: 'anthropic' },
  { ...valid, base_url: 'ftp://provider.example' },
  { ...valid, model: '   ' },
])('fails closed for an unsupported or incomplete provider: %p', async (row) => {
  rpc.mockReturnValue({ abortSignal: jest.fn().mockResolvedValue({ data: [row], error: null }) });
  await expect(resolveActiveAiProvider(server, signal)).resolves.toBeNull();
});

it('returns null when no provider is active and surfaces only the generic config failure', async () => {
  rpc.mockReturnValueOnce({ abortSignal: jest.fn().mockResolvedValue({ data: [], error: null }) });
  await expect(resolveActiveAiProvider(server, signal)).resolves.toBeNull();
  rpc.mockReturnValueOnce({ abortSignal: jest.fn().mockResolvedValue({ data: null, error: { message: 'secret detail' } }) });
  await expect(resolveActiveAiProvider(server, signal)).rejects.toThrow('La configuration IA est indisponible.');
});

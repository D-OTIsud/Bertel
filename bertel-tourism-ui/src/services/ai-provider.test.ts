import { listAiProviders, upsertAiProvider, setActiveAiProvider, deleteAiProvider } from './ai-provider';

const rpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ schema: () => ({ rpc }) }),
}));

beforeEach(() => {
  rpc.mockReset();
});

describe('ai-provider service', () => {
  it('lists providers and maps snake_case rows to camelCase (never a key field)', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'p1', label: 'OpenRouter', api_kind: 'openai_compatible', base_url: 'https://or/v1', model: 'm', max_output_tokens: 4096, is_active: true, extra: {}, has_key: true },
      ],
      error: null,
    });

    const list = await listAiProviders();
    expect(rpc).toHaveBeenCalledWith('list_ai_providers');
    expect(list[0]).toEqual({
      id: 'p1', label: 'OpenRouter', apiKind: 'openai_compatible', baseUrl: 'https://or/v1',
      model: 'm', maxOutputTokens: 4096, isActive: true, extra: {}, hasKey: true,
    });
    expect(JSON.stringify(list[0])).not.toMatch(/api_?key|secret/i);
  });

  it('upserts with the RPC param names, passing null id for a new provider and the key once', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });
    const id = await upsertAiProvider({
      label: 'Groq', apiKind: 'openai_compatible', baseUrl: 'https://g/v1', model: 'x',
      maxOutputTokens: 2048, isActive: true, extra: { headers: { 'X-Title': 'B' } }, apiKey: 'sk-1',
    });
    expect(id).toBe('new-id');
    expect(rpc).toHaveBeenCalledWith('upsert_ai_provider', {
      p_id: null, p_label: 'Groq', p_api_kind: 'openai_compatible', p_base_url: 'https://g/v1',
      p_model: 'x', p_max_output_tokens: 2048, p_is_active: true,
      p_extra: { headers: { 'X-Title': 'B' } }, p_api_key: 'sk-1',
    });
  });

  it('omits the key (null) when not provided on edit', async () => {
    rpc.mockResolvedValue({ data: 'p1', error: null });
    await upsertAiProvider({ id: 'p1', label: 'L', apiKind: 'openai_compatible', baseUrl: 'b', model: 'm', maxOutputTokens: 4096, isActive: false });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: 'p1', p_api_key: null });
  });

  it('activates and deletes by id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await setActiveAiProvider('p2');
    expect(rpc).toHaveBeenCalledWith('set_active_ai_provider', { p_id: 'p2' });
    await deleteAiProvider('p3');
    expect(rpc).toHaveBeenCalledWith('delete_ai_provider', { p_id: 'p3' });
  });

  it('throws the RPC error message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });
    await expect(listAiProviders()).rejects.toThrow('FORBIDDEN');
  });
});

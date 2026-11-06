import { fetchThesaurusGeneration, readThesaurusReferenceSnapshot } from './thesaurus-generation';

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ schema: () => ({ rpc: mockRpc }) }) }));

beforeEach(() => mockRpc.mockReset());

it('lit un identifiant de publication sans arrondir les grands bigint', async () => {
  mockRpc.mockResolvedValue({ data: '9007199254740993', error: null });
  expect(await fetchThesaurusGeneration()).toBe('9007199254740993');
});

it('permet le déploiement échelonné uniquement si le RPC est réellement absent', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  expect(await readThesaurusReferenceSnapshot()).toBeNull();
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
  await expect(readThesaurusReferenceSnapshot()).rejects.toMatchObject({ code: '42501' });
  mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'dependency missing inside an existing RPC' } });
  await expect(readThesaurusReferenceSnapshot()).rejects.toMatchObject({ code: '42883' });
});

it('rend les valeurs et leur génération ensemble et transmet la sélection des domaines', async () => {
  const snapshot = { meta: { vocabulary_release: 2 }, refCodeByDomain: { bed_type: [] }, tables: {} };
  mockRpc.mockResolvedValue({ data: snapshot, error: null });
  expect(await readThesaurusReferenceSnapshot(['bed_type'])).toEqual(snapshot);
  expect(mockRpc).toHaveBeenCalledWith('thesaurus_reference_snapshot', { p_domains: ['bed_type'] });
});

it('refuse un instantané incomplet au lieu de recomposer plusieurs générations', async () => {
  mockRpc.mockResolvedValue({ data: { meta: { vocabulary_release: 3 } }, error: null });
  await expect(readThesaurusReferenceSnapshot()).rejects.toThrow('incomplets');
});

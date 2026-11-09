import { listExplorerReferences } from './explorer-reference';
import { readThesaurusReferenceSnapshot } from './thesaurus-generation';
jest.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({}) }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));
jest.mock('./thesaurus-generation', () => ({ readThesaurusReferenceSnapshot: jest.fn() }));

it('loads active restaurant cuisines from the shared vocabulary snapshot', async () => {
  jest.mocked(readThesaurusReferenceSnapshot).mockResolvedValue({
    meta: { vocabulary_release: '12' }, tables: {}, locationOptions: { cities: [], lieu_dits: [] },
    refCodeByDomain: { cuisine_type: [
      { code: 'creole', name: 'Créole', position: 1, is_active: true },
      { code: 'indian', name: 'Indienne', position: 2, is_active: true },
      { code: 'retired', name: 'Ancienne', position: 3, is_active: false },
    ] },
  });
  const result = await listExplorerReferences();
  expect(result.vocabularyRelease).toBe('12');
  expect(result.resCuisineTypes).toEqual([{ code: 'creole', name: 'Créole' }, { code: 'indian', name: 'Indienne' }]);
});

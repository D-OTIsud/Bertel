jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('./thesaurus-generation', () => ({ readThesaurusReferenceSnapshot: jest.fn() }));

import { getSupabaseClient } from '../lib/supabase';
import { readThesaurusReferenceSnapshot } from './thesaurus-generation';
import { listCreationCommunes } from './commune-reference';

const mockClient = getSupabaseClient as jest.Mock;
const mockSnapshot = readThesaurusReferenceSnapshot as jest.Mock;
const select = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.mockReturnValue({ from: jest.fn(() => ({ select })) });
});

it('joins live postal pairs to published assignable communes and preserves shared/multiple postcodes', async () => {
  mockSnapshot.mockResolvedValue({
    meta: { vocabulary_release: '7' },
    refCodeByDomain: {},
    tables: { ref_commune: [
      { insee_code: '97422', name: 'Le Tampon', is_active: true, thesaurus_assignable: true, thesaurus_lifecycle: 'active' },
      { insee_code: '97403', name: 'Entre-Deux', is_active: true, thesaurus_assignable: true },
      { insee_code: '97412', name: 'Saint-Joseph', is_active: false, thesaurus_assignable: true },
      { insee_code: '97416', name: 'Saint-Pierre', is_active: true, thesaurus_assignable: false },
      { insee_code: '97401', name: 'Non publiée', is_active: true },
    ] },
  });
  select.mockResolvedValue({ data: [
    { postcode: '97418', insee_code: '97422' }, { postcode: '97430', insee_code: '97422' },
    { postcode: '97414', insee_code: '97403' }, { postcode: '97414', insee_code: '97403' },
    { postcode: '99998', insee_code: '97403' }, { postcode: '99998', insee_code: '97422' },
    { postcode: '97480', insee_code: '97412' }, { postcode: '97410', insee_code: '97416' },
    { postcode: '97425', insee_code: '97401' },
  ], error: null });
  await expect(listCreationCommunes()).resolves.toEqual([
    { code: '97403', name: 'Entre-Deux', postcodes: ['97414', '99998'] },
    { code: '97422', name: 'Le Tampon', postcodes: ['97418', '97430', '99998'] },
  ]);
  expect(mockSnapshot).toHaveBeenCalledWith(['commune']);
  expect(select).toHaveBeenCalledWith('postcode,insee_code');
});

it('fails closed when the published snapshot or postcode lookup is unavailable', async () => {
  mockSnapshot.mockResolvedValue(null);
  select.mockResolvedValue({ data: [], error: null });
  await expect(listCreationCommunes()).rejects.toThrow(/référentiel/i);
  mockSnapshot.mockResolvedValue({ meta: { vocabulary_release: '7' }, tables: { ref_commune: [] } });
  select.mockResolvedValue({ data: null, error: new Error('Postal lookup unavailable') });
  await expect(listCreationCommunes()).rejects.toThrow('Postal lookup unavailable');
});

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }), subscribe: jest.fn(() => () => {}) } }));

import { getSupabaseClient } from '../lib/supabase';
import { getObjectWorkspaceCharacteristicsModule } from './object-workspace';
import type { ReferenceCatalogs } from './reference-catalogs';
import type { ObjectWorkspaceCharacteristicsModule } from './object-workspace-parser';

it('preserves selected retired characteristics and carries nonassignability to every selector', async () => {
  const old = (id: string, code: string, name: string) => ({ id, code, name, is_active: true, thesaurus_assignable: false, thesaurus_lifecycle: 'retired' });
  const catalogs: ReferenceCatalogs = {
    vocabularyRelease: 8,
    refCodeByDomain: { payment_method: [old('payment-1', 'old_payment', 'Ancien paiement')], environment_tag: [old('env-1', 'old_environment', 'Ancien environnement')], language_level: [] },
    tables: {
      ref_language: [old('lang-1', 'old_language', 'Ancienne langue')],
      ref_amenity: [{ ...old('amenity-1', 'old_amenity', 'Ancien équipement'), scope: 'object', family_id: 'family-1', family: { code: 'equipment', name: 'Équipements' } }],
    },
  };
  const rows: Record<string, unknown[]> = {
    object_language: [{ language_id: 'lang-1', level_id: null }],
    object_payment_method: [{ payment_method_id: 'payment-1' }],
    object_environment_tag: [{ environment_tag_id: 'env-1' }],
    object_amenity: [{ amenity_id: 'amenity-1' }],
  };
  jest.mocked(getSupabaseClient).mockReturnValue({ from: (table: string) => ({ select: () => ({ eq: async () => ({ data: rows[table], error: null }) }) }) } as never);
  const baseline: ObjectWorkspaceCharacteristicsModule = { languageOptions: [], languageLevelOptions: [], selectedLanguages: [], paymentOptions: [], selectedPaymentCodes: [], environmentOptions: [], selectedEnvironmentCodes: [], amenityGroups: [], selectedAmenityCodes: [], unavailableReason: null };
  const loaded = await getObjectWorkspaceCharacteristicsModule('object-1', baseline, catalogs);
  expect(loaded.unavailableReason).toBeNull();
  expect(loaded.selectedLanguages[0]).toMatchObject({ languageId: 'lang-1', code: 'old_language' });
  expect(loaded.selectedPaymentCodes).toEqual(['old_payment']);
  expect(loaded.selectedEnvironmentCodes).toEqual(['old_environment']);
  expect(loaded.selectedAmenityCodes).toEqual(['old_amenity']);
  for (const option of [...loaded.languageOptions, ...loaded.paymentOptions, ...loaded.environmentOptions, ...loaded.amenityGroups.flatMap((group) => group.options)]) expect(option.disabled).toBe(true);
});

// §211 — service front de l'administration générée des catalogues de référence.
// Couvre la frontière réseau (constat 2, revue T7) : la seule façon de détecter un nom de
// paramètre RPC ou de clé JSON qui diverge, invisible pour tsc comme pour un test qui
// n'inspecte pas l'objet passé à `.rpc()`. Gabarit : src/services/rbac.test.ts (mock de
// getSupabaseClient, `.schema('api').rpc`).

import { getSupabaseClient } from '../lib/supabase';
import {
  listRefCatalogs,
  getRefCatalog,
  upsertRefRow,
  deleteRefRow,
  reorderRefRows,
  groupByFamily,
  type RefCatalogSummary,
} from './ref-catalogs';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));
const mockedGetSupabaseClient = jest.mocked(getSupabaseClient);

function clientWithRpc(rpc: jest.Mock) {
  return { schema: jest.fn().mockReturnValue({ rpc }) } as never;
}

const cat = (over: Partial<RefCatalogSummary>): RefCatalogSummary => ({
  catalogKey: 'ref_x', kind: 'table', label: 'X', family: 'Juridique et conformité',
  usedIn: null, access: 'editable', readonlyReason: null, nValues: 0, ...over,
});

// Payload complet et valide de get_ref_catalog — chaque test malforme une copie ciblée
// plutôt que de reconstruire l'objet, pour isoler ce qu'il éprouve réellement.
const validDetailPayload: Record<string, unknown> = {
  catalog_key: 'ref_amenity',
  kind: 'table',
  label: 'Équipements',
  family: 'Structure',
  used_in: null,
  access: 'editable',
  readonly_reason: null,
  is_identifiable: true,
  primary_key_columns: [{ name: 'id', type: 'uuid' }],
  label_column: null,
  columns: [
    { name: 'id', type: 'uuid', is_required: true, has_default: true, position: 1, enum_values: null },
  ],
  outgoing_fk: [{ column: 'family_id', target: 'ref_code:amenity_family' }],
  rows: [{ id: '1' }],
  usage: { '1': 3 },
};

describe('listRefCatalogs', () => {
  beforeEach(() => mockedGetSupabaseClient.mockReset());

  it('appelle list_ref_catalogs sans argument', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await listRefCatalogs();

    expect(rpc).toHaveBeenCalledWith('list_ref_catalogs');
  });

  it('normalise chaque ligne snake_case -> camelCase', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        catalog_key: 'ref_legal_type', kind: 'table', label: 'Types de documents',
        family: 'Juridique', used_in: '§18', access: 'editable', readonly_reason: null, n_values: 20,
      }],
      error: null,
    });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    const result = await listRefCatalogs();

    expect(result).toEqual([{
      catalogKey: 'ref_legal_type', kind: 'table', label: 'Types de documents',
      family: 'Juridique', usedIn: '§18', access: 'editable', readonlyReason: null, nValues: 20,
    }]);
  });

  it('rend un tableau vide quand data est null', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(listRefCatalogs()).resolves.toEqual([]);
  });

  it('leve une erreur quand le RPC en renvoie une', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(listRefCatalogs()).rejects.toThrow('FORBIDDEN');
  });
});

describe('getRefCatalog', () => {
  beforeEach(() => mockedGetSupabaseClient.mockReset());

  it('appelle get_ref_catalog avec p_catalog_key', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: validDetailPayload, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await getRefCatalog('ref_amenity');

    expect(rpc).toHaveBeenCalledWith('get_ref_catalog', { p_catalog_key: 'ref_amenity' });
  });

  it('extrait primary_key_columns en primaryKeyColumns: string[], dans l ordre', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        ...validDetailPayload,
        primary_key_columns: [{ name: 'metric_id', type: 'uuid' }, { name: 'object_type', type: 'text' }],
      },
      error: null,
    });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    const result = await getRefCatalog('ref_capacity_applicability');

    expect(result.primaryKeyColumns).toEqual(['metric_id', 'object_type']);
  });

  it('garde labelColumn a null quand le SQL renvoie null (matrices) — ni "" ni "name"', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { ...validDetailPayload, label_column: null },
      error: null,
    });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    const result = await getRefCatalog('ref_capacity_applicability');

    expect(result.labelColumn).toBeNull();
  });

  it('renomme outgoing_fk en fks sans retoucher les target', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        ...validDetailPayload,
        outgoing_fk: [{ column: 'family_id', target: 'ref_code:amenity_family' }],
      },
      error: null,
    });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    const result = await getRefCatalog('ref_amenity');

    expect(result.fks).toEqual([{ column: 'family_id', target: 'ref_code:amenity_family' }]);
  });

  it('leve une erreur quand le RPC en renvoie une', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'UNKNOWN_CATALOG' } });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(getRefCatalog('ref_inconnu')).rejects.toThrow('UNKNOWN_CATALOG');
  });

  // Constat 3 (revue T7) : sans garde, `String(undefined)` rend la chaine litterale
  // "undefined", propagee jusqu'a l'ecran au lieu d'un echec lisible.
  it('leve une erreur explicite quand catalog_key est absent de la reponse', async () => {
    const { catalog_key: _omitted, ...malformed } = validDetailPayload;
    const rpc = jest.fn().mockResolvedValue({ data: malformed, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(getRefCatalog('ref_amenity')).rejects.toThrow(/malform/i);
  });
});

describe('upsertRefRow', () => {
  beforeEach(() => mockedGetSupabaseClient.mockReset());

  it('appelle rpc_upsert_ref_row avec p_catalog_key, p_key et p_values', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await upsertRefRow('ref_legal_type', { id: '1' }, { name: 'X' });

    expect(rpc).toHaveBeenCalledWith('rpc_upsert_ref_row', {
      p_catalog_key: 'ref_legal_type', p_key: { id: '1' }, p_values: { name: 'X' },
    });
  });

  it('transmet p_key null pour une creation', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await upsertRefRow('ref_legal_type', null, { name: 'X' });

    expect(rpc).toHaveBeenCalledWith('rpc_upsert_ref_row', {
      p_catalog_key: 'ref_legal_type', p_key: null, p_values: { name: 'X' },
    });
  });

  it('leve une erreur quand le RPC en renvoie une', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'UNKNOWN_COLUMN' } });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(upsertRefRow('ref_legal_type', null, {})).rejects.toThrow('UNKNOWN_COLUMN');
  });
});

describe('deleteRefRow', () => {
  beforeEach(() => mockedGetSupabaseClient.mockReset());

  it('appelle rpc_delete_ref_row avec p_catalog_key et p_key', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await deleteRefRow('ref_legal_type', { id: '1' });

    expect(rpc).toHaveBeenCalledWith('rpc_delete_ref_row', {
      p_catalog_key: 'ref_legal_type', p_key: { id: '1' },
    });
  });

  it('leve une erreur quand le RPC en renvoie une', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'STILL_REFERENCED' } });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(deleteRefRow('ref_legal_type', { id: '1' })).rejects.toThrow('STILL_REFERENCED');
  });
});

describe('reorderRefRows', () => {
  beforeEach(() => mockedGetSupabaseClient.mockReset());

  it('appelle rpc_reorder_ref_rows avec p_catalog_key et p_keys', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await reorderRefRows('ref_language', [{ id: '2' }, { id: '1' }]);

    expect(rpc).toHaveBeenCalledWith('rpc_reorder_ref_rows', {
      p_catalog_key: 'ref_language', p_keys: [{ id: '2' }, { id: '1' }],
    });
  });

  it('leve une erreur quand le RPC en renvoie une', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockedGetSupabaseClient.mockReturnValue(clientWithRpc(rpc));

    await expect(reorderRefRows('ref_language', [])).rejects.toThrow('boom');
  });
});

describe('groupByFamily', () => {
  it('regroupe par famille et trie les familles alphabetiquement', () => {
    expect(groupByFamily([
      cat({ label: 'B', family: 'Restauration' }),
      cat({ label: 'A', family: 'Hébergement' }),
    ]).map((g) => g.family)).toEqual(['Hébergement', 'Restauration']);
  });

  it('place « A classer » en dernier, quel que soit l alphabet', () => {
    expect(groupByFamily([
      cat({ label: 'A', family: 'À classer' }),
      cat({ label: 'B', family: 'Restauration' }),
    ]).at(-1)?.family).toBe('À classer');
  });

  it('trie les catalogues par libelle dans une famille', () => {
    expect(groupByFamily([
      cat({ label: 'Zèbre', family: 'Hébergement' }),
      cat({ label: 'Abeille', family: 'Hébergement' }),
    ])[0].catalogs.map((c) => c.label)).toEqual(['Abeille', 'Zèbre']);
  });

  // Constat 5 (revue T7) : comportement correct mais jusqu'ici non asserté.
  it('rend un tableau vide pour un tableau vide', () => {
    expect(groupByFamily([])).toEqual([]);
  });
});

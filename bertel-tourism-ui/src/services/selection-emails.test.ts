import { dedupeEmails, formatEmailList, type SelectionEmailRow } from './selection-emails';

function row(ord: number, email: string, source: 'actor' | 'object' = 'object'): SelectionEmailRow {
  return { objectId: `obj-${ord}`, email, source, ord };
}

describe('dedupeEmails', () => {
  it('réduit deux fiches partageant une adresse à une seule sortie', () => {
    const out = dedupeEmails([row(1, 'a@x.test'), row(2, 'a@x.test'), row(3, 'b@x.test')]);
    expect(out).toEqual(['a@x.test', 'b@x.test']);
  });

  it('conserve l ordre `ord` du serveur, quel que soit l ordre du tableau reçu', () => {
    const out = dedupeEmails([row(3, 'c@x.test'), row(1, 'a@x.test'), row(2, 'b@x.test')]);
    expect(out).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
  });

  it('normalise la casse et les espaces avant de dédoublonner', () => {
    const out = dedupeEmails([row(1, '  A@X.test '), row(2, 'a@x.TEST')]);
    expect(out).toEqual(['a@x.test']);
  });

  it('écarte les valeurs vides sans planter', () => {
    const out = dedupeEmails([row(1, '   '), row(2, 'a@x.test')]);
    expect(out).toEqual(['a@x.test']);
  });
});

describe('fetchSelectionEmails', () => {
  const rpc = jest.fn();
  const schema = jest.fn().mockReturnValue({ rpc });

  beforeEach(() => {
    jest.resetModules();
    rpc.mockClear();
    schema.mockClear();
    rpc.mockResolvedValue({ data: { rows: [], missing: [] }, error: null });
    jest.doMock('../lib/supabase', () => ({ getApiClient: () => ({ schema }) }));
  });

  // Garde NON VACANTE du contrat serveur : `p_reason` est le PREMIER paramètre
  // et il est OBLIGATOIRE (§208). S'il cesse d'être transmis, le RPC répond
  // PT400/REASON_REQUIRED et aucune adresse ne sort — cette assertion rougit
  // avant que quiconque le découvre en production.
  it('transmet p_reason au RPC — sélection de fiches', async () => {
    const { fetchSelectionEmails } = await import('./selection-emails');
    await fetchSelectionEmails({ objectIds: ['o1', 'o2'], reason: 'Relance adhésions' });

    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('list_selection_emails', {
      p_reason: 'Relance adhésions',
      p_object_ids: ['o1', 'o2'],
      p_list_id: null,
    });
  });

  it('transmet p_reason au RPC — liste enregistrée', async () => {
    const { fetchSelectionEmails } = await import('./selection-emails');
    await fetchSelectionEmails({ listId: 'list-1', reason: 'Relance adhésions' });

    expect(rpc).toHaveBeenCalledWith('list_selection_emails', {
      p_reason: 'Relance adhésions',
      p_object_ids: null,
      p_list_id: 'list-1',
    });
  });

  it('propage le SQLSTATE, pas le message — la modale branche dessus', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PT400', message: 'REASON_REQUIRED' } });
    const { fetchSelectionEmails } = await import('./selection-emails');

    await expect(
      fetchSelectionEmails({ objectIds: ['o1'], reason: 'x' }),
    ).rejects.toMatchObject({ code: 'PT400' });
  });
});

describe('formatEmailList', () => {
  const emails = ['a@x.test', 'b@x.test'];

  it('sépare par virgule et espace — le défaut attendu par Gmail', () => {
    expect(formatEmailList(emails, 'comma')).toBe('a@x.test, b@x.test');
  });

  it('sépare par point-virgule et espace', () => {
    expect(formatEmailList(emails, 'semicolon')).toBe('a@x.test; b@x.test');
  });

  it('sépare par retour ligne', () => {
    expect(formatEmailList(emails, 'newline')).toBe('a@x.test\nb@x.test');
  });

  it('rend une chaîne vide pour une liste vide', () => {
    expect(formatEmailList([], 'comma')).toBe('');
  });
});

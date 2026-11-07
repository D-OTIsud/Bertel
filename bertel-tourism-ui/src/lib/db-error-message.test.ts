import { SQLSTATE_LABELS, engineErrorDetail, rawDatabaseErrorFields, warnRawDatabaseError } from './db-error-message';

// UN SEUL espion pour tout le fichier : deux `jest.spyOn(console, 'warn')` successifs
// s'empilent, et le `mockRestore` du premier décroche silencieusement le second.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => warn.mockClear());
afterAll(() => warn.mockRestore());

describe('engineErrorDetail — le SQLSTATE décide, jamais le contenu du texte', () => {
  it('rend le libellé FR des SQLSTATE moteur connus', () => {
    expect(engineErrorDetail({ code: '42501', message: 'permission denied for table ref_document' }))
      .toBe(SQLSTATE_LABELS['42501']);
    expect(engineErrorDetail({ code: '57014', message: 'canceling statement due to statement timeout' }))
      .toMatch(/trop de temps/);
    expect(engineErrorDetail({ code: 'PGRST301', message: 'JWT expired' })).toMatch(/reconnectez-vous/i);
  });

  it('23503 change de SENS selon la direction : en suppression, la ligne est ENCORE référencée', () => {
    const raw = {
      code: '23503',
      message: 'update or delete on table "ref_document" violates foreign key constraint "object_document_document_id_fkey"',
    };
    // Direction écriture : la référence pointait vers une ligne disparue.
    expect(engineErrorDetail(raw)).toMatch(/supprimé entre-temps/);
    // Direction suppression : l'inverse — dire « supprimé entre-temps » induirait en erreur.
    const onDelete = engineErrorDetail(raw, { operation: 'delete' });
    expect(onDelete).toMatch(/encore utilisé/i);
    expect(onDelete).not.toMatch(/entre-temps/);
  });

  it('ne rend JAMAIS la sortie brute du moteur — ni table, ni contrainte, ni anglais', () => {
    const raw = {
      code: '23503',
      message: 'update or delete on table "ref_document" violates foreign key constraint "x_fkey"',
    };
    for (const detail of [engineErrorDetail(raw), engineErrorDetail(raw, { operation: 'delete' })]) {
      expect(detail).toBeDefined();
      expect(detail).not.toMatch(/ref_document|foreign key|violates/i);
    }
  });

  it('SQLSTATE inconnu ⇒ AUCUN detail (la route retombe sur son libellé générique) + journal', () => {
    expect(engineErrorDetail({ code: 'XX000', message: 'internal error: cache lookup failed' })).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('erreur SANS code (GoTrue, réseau, objet nu) ⇒ AUCUN detail', () => {
    expect(engineErrorDetail({ message: 'Database error deleting user' })).toBeUndefined();
    expect(engineErrorDetail(new Error('fetch failed'))).toBeUndefined();
    expect(engineErrorDetail(null)).toBeUndefined();
    expect(engineErrorDetail(undefined)).toBeUndefined();
    expect(engineErrorDetail({})).toBeUndefined();
  });

  it('nos propres RAISE ne sont PAS des codes moteur : la table ne les connaît pas', () => {
    // C'est la raison d'être de l'allowlist `CODES_WITH_BUSINESS_DETAIL` : une route dont le
    // `detail` vient d'un RAISE doit pouvoir le relayer. `engineErrorDetail` ne le lui vole pas —
    // il rend `undefined`, laissant la route décider.
    expect(engineErrorDetail({ code: 'P0001', message: 'Effacement RGPD réservé aux administrateurs plateforme.' }))
      .toBeUndefined();
    expect(engineErrorDetail({ code: '22023', message: 'Écriture CRM non autorisée' })).toBeUndefined();
    expect(SQLSTATE_LABELS.P0001).toBeUndefined();
    expect(SQLSTATE_LABELS['22023']).toBeUndefined();
  });
});

describe('journal du brut moteur — jamais affiché, réduit en production', () => {
  const raw = { code: '23503', message: 'violates foreign key constraint on table "ref_document"' };

  it('hors production, le message entier part au journal (on debugge avec)', () => {
    expect(rawDatabaseErrorFields(raw, true)).toEqual({ code: '23503', detail: raw.message });
  });

  it('en production, seul le code sort — le message porte des noms de tables et parfois la valeur', () => {
    const fields = rawDatabaseErrorFields(raw, false);
    expect(fields).toEqual({ code: '23503' });
    expect(JSON.stringify(fields)).not.toContain('ref_document');
  });

  it('warnRawDatabaseError écrit sous le scope reçu et ne lève pas sur une erreur nue', () => {
    warnRawDatabaseError('actor-document.delete', raw);
    expect(warn).toHaveBeenCalledWith(
      '[actor-document.delete] erreur moteur non relayée',
      expect.objectContaining({ code: '23503' }),
    );
    expect(() => warnRawDatabaseError('scope', null)).not.toThrow();
  });
});

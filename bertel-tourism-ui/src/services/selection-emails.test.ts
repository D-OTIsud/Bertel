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

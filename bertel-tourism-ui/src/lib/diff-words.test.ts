import { diffWords } from './diff-words';

describe('diffWords (D6 — diff avant/après modération)', () => {
  it('identiques : un seul segment same', () => {
    expect(diffWords('Chemin des Vacoas', 'Chemin des Vacoas')).toEqual([
      { type: 'same', text: 'Chemin des Vacoas' },
    ]);
  });

  it('un mot remplacé : del + ins localisés, le contexte reste same', () => {
    const segments = diffWords('Chemin des Vacoas', 'Chemin des Filaos');
    expect(segments).toEqual([
      { type: 'same', text: 'Chemin des ' },
      { type: 'del', text: 'Vacoas' },
      { type: 'ins', text: 'Filaos' },
    ]);
  });

  it('ajout pur : le nouveau texte est ins', () => {
    const segments = diffWords('Ouvert le lundi', 'Ouvert le lundi et le mardi');
    expect(segments[0]).toEqual({ type: 'same', text: 'Ouvert le lundi' });
    expect(segments[1].type).toBe('ins');
    expect(segments[1].text).toBe(' et le mardi');
  });

  it('avant vide : tout est ins ; après vide : tout est del', () => {
    expect(diffWords('', 'Nouveau texte')).toEqual([{ type: 'ins', text: 'Nouveau texte' }]);
    expect(diffWords('Ancien texte', '')).toEqual([{ type: 'del', text: 'Ancien texte' }]);
  });

  it('repli au-delà du plafond : del complet puis ins complet (pas de gel O(n·m))', () => {
    const big = Array.from({ length: 300 }, (_, k) => `mot${k}`).join(' ');
    const segments = diffWords(big, `${big} extra`.split(' ').reverse().join(' '));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.type !== 'same')).toBe(true);
  });
});

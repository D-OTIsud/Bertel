import { FAQ_RUBRIQUES } from './types';

describe('registre des rubriques FAQ', () => {
  test('ids uniques, slug-safe, libellés non vides', () => {
    const ids = FAQ_RUBRIQUES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of FAQ_RUBRIQUES) {
      expect(r.id).toMatch(/^[a-z0-9-]+$/);
      expect(r.label.trim().length).toBeGreaterThan(0);
    }
  });

  test('les 10 rubriques de la spec, dans l\'ordre de lecture', () => {
    expect(FAQ_RUBRIQUES.map((r) => r.id)).toEqual([
      'demarrer', 'creer-objet', 'choisir-type', 'explorer', 'editeur',
      'publication', 'listes', 'crm', 'equipe', 'reglages',
    ]);
  });
});

import { isModuleSubmittable } from './portal-visibility';

describe('isModuleSubmittable', () => {
  const floor = ['legal', 'publication', 'provider-follow-up'];

  it('laisse passer une rubrique ni masquée ni réservée à l’office', () => {
    expect(isModuleSubmittable('contacts', [], floor)).toBe(true);
  });

  it('refuse une rubrique masquée par cet office', () => {
    expect(isModuleSubmittable('descriptions', ['descriptions'], floor)).toBe(false);
  });

  it('refuse une rubrique du plancher, même non masquée', () => {
    expect(isModuleSubmittable('legal', [], floor)).toBe(false);
  });

  it('refuse aussi quand les deux s’appliquent', () => {
    expect(isModuleSubmittable('publication', ['publication'], floor)).toBe(false);
  });

  it('sans matrice chargée, rien n’est réservé — le serveur revalide (22023)', () => {
    expect(isModuleSubmittable('openings', [], [])).toBe(true);
  });
});

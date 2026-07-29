import {
  REMPLISSAGE_BUCKET_OPTIONS,
  REMPLISSAGE_ESSENTIAL_OPTIONS,
  essentialLabel,
  remplissageDetail,
  remplissageTone,
} from './remplissage';

describe('§204 — vocabulaire partagé du remplissage', () => {
  test('les 3 paliers sont exposés du plus rempli au moins rempli', () => {
    expect(REMPLISSAGE_BUCKET_OPTIONS.map((o) => o.code)).toEqual(['complete', 'few', 'many']);
  });

  test('« nom » n’est PAS proposé dans la facette : 0 fiche concernée, ce serait un critère muet', () => {
    expect(REMPLISSAGE_ESSENTIAL_OPTIONS.map((o) => o.code)).not.toContain('name');
    expect(REMPLISSAGE_ESSENTIAL_OPTIONS).toHaveLength(7);
  });

  test('les codes proposés sont exactement ceux du contrat RPC', () => {
    expect(REMPLISSAGE_ESSENTIAL_OPTIONS.map((o) => o.code).sort()).toEqual(
      ['contact', 'description', 'location', 'photos', 'subcategory', 'tags', 'type_block'].sort(),
    );
  });

  test('un code inconnu se rend tel quel plutôt que de disparaître', () => {
    expect(essentialLabel('photos')).toBe('Photos');
    expect(essentialLabel('name')).toBe('Nom');
    expect(essentialLabel('inconnu')).toBe('inconnu');
  });

  test('le ton suit les seuils : rien à 0, neutre 1-2, alerte à 3, danger à 4+', () => {
    expect(remplissageTone(0)).toBeNull();
    expect(remplissageTone(1)).toBe('neutral');
    expect(remplissageTone(2)).toBe('neutral');
    expect(remplissageTone(3)).toBe('warning');
    expect(remplissageTone(9)).toBe('danger');
  });

  test('le détail de survol est indéfini quand il n’y a rien à dire, jamais une chaîne vide', () => {
    expect(remplissageDetail(undefined)).toBeUndefined();
    expect(remplissageDetail([])).toBeUndefined();
    expect(remplissageDetail(['photos', 'contact'])).toBe('Manque : Photos, Contact public');
  });
});

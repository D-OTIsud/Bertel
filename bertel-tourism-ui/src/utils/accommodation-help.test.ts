import {
  accommodationFamilyDescription,
  accommodationNatureDescription,
} from './accommodation-help';

describe("microcopies utilisateur de l'hébergement", () => {
  it('documente les cinq familles visibles', () => {
    for (const code of [
      'hotellerie',
      'locatif',
      'collectif',
      'campings_terrains',
      'aires_haltes_plein_air',
    ]) {
      expect(accommodationFamilyDescription(code)).toBeTruthy();
    }
  });

  it("explique qu'une aire naturelle est un camping classé sans étoile", () => {
    const description = accommodationNatureDescription('taxonomy_hpa', 'natural_camp_area');

    expect(description).toMatch(/terrain de camping aménagé/i);
    expect(description).toMatch(/classée sans étoile/i);
    expect(description).toMatch(/six mois maximum/i);
    expect(description).toMatch(/mobil-homes.*interdits/i);
  });

  it('ne fabrique aucune explication pour un code inconnu', () => {
    expect(accommodationNatureDescription('taxonomy_hpa', 'future_unknown_code')).toBeNull();
  });
});

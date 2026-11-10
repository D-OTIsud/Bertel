import { getReferenceCatalogLabel, getThesaurusDomainLabel } from './thesaurus-domain-labels';
import reviewedNames from './thesaurus-domain-labels.fr.json';

describe('business names of thesaurus domains', () => {
  it.each([
    ['taxonomy_com', 'Taxonomie COM', 'Commerces'],
    ['package_type', 'package_type', 'Types de forfait'],
    ['menu_category', 'Menu category', 'Catégories de menu'],
    ['amenity', 'amenity', 'Équipements et services'],
    ['classification_scheme', 'classification_scheme', 'Labels et classements'],
    ['classification_value', 'Valeurs de classification', 'Valeurs des labels et classements'],
    ['taxonomy_asc', 'Taxonomie ASC', 'Activités sportives et culturelles'],
    ['taxonomy_hot', 'Taxonomie HOT', 'Hôtellerie'],
    ['taxonomy_hlo', 'Taxonomie HLO', 'Hébergements locatifs et collectifs'],
    ['taxonomy_spu', 'Taxonomie SPU', 'Services publics'],
    ['taxonomy_vil', 'Taxonomie VIL', 'Villes et villages'],
    ['price_kind', 'Natures de tarif', 'Publics tarifaires'],
    ['mood', 'Humeur', 'Ambiances touristiques'],
    ['contact_kind', 'Types de contact', 'Moyens de contact'],
    ['accommodation_type', 'Types d’hébergement', 'Types d’hébergement historiques'],
  ])('names %s according to its business context', (domain, legacyName, expected) => {
    expect(getThesaurusDomainLabel(domain, legacyName)).toBe(expected);
  });

  it('uses the same names for reference catalogues and thesaurus domains', () => {
    expect(getReferenceCatalogLabel('ref_code:taxonomy_com', 'ref_code:taxonomy_com')).toBe('Commerces');
    expect(getReferenceCatalogLabel('ref_classification_value', 'Valeurs de classification'))
      .toBe('Valeurs des labels et classements');
    expect(getReferenceCatalogLabel('ref_amenity', 'amenity')).toBe('Équipements et services');
  });

  it('keeps every reviewed name short, editorial and separate from its technical identity', () => {
    expect(Object.keys(reviewedNames)).toHaveLength(78);
    for (const [domain, name] of Object.entries(reviewedNames)) {
      expect(name.toLowerCase()).not.toBe(domain.toLowerCase());
      expect(name).not.toMatch(/taxonom(?:ie|y)|\bref_code\b|[_—–]|^Nature d[’']/i);
      expect(getThesaurusDomainLabel(domain, `Taxonomie ${domain}`)).toBe(name);
    }
  });

  it('keeps an editorial name for a new domain but never exposes its internal identifier as a fallback', () => {
    expect(getThesaurusDomainLabel('custom_domain', 'Vocabulaire local')).toBe('Vocabulaire local');
    expect(getThesaurusDomainLabel('custom_domain', 'custom_domain')).toBe('Domaine non nommé');
    expect(getThesaurusDomainLabel('taxonomy_unknown', 'Taxonomie inconnue')).toBe('Domaine non nommé');
    expect(getReferenceCatalogLabel('ref_custom', 'ref_custom')).toBe('Catalogue de référence');
    expect(getThesaurusDomainLabel('constructor')).toBe('Domaine non nommé');
    expect(getReferenceCatalogLabel('constructor')).toBe('Catalogue de référence');
  });
});

import {
  ACCOMMODATION_TYPE_CODES,
  accommodationSelectionPath,
  buildCreateAccommodationFamilies,
  isAccommodationType,
  resolveAccommodationTechnicalType,
} from './accommodation-create-flow';
import { TYPE_ARCHETYPES } from '../archetypes';
import type { ExplorerAccommodationFamily, ExplorerTaxonomyDomain } from '../../../types/domain';

const FAMILIES: ExplorerAccommodationFamily[] = [
  { code: 'collectif', name: 'Hébergement collectif', description: 'Accueil de groupes.', position: 3 },
  { code: 'campings_terrains', name: 'Campings et terrains', description: null, position: 4 },
];

const TAXONOMIES: ExplorerTaxonomyDomain[] = [
  {
    domain: 'taxonomy_rva', name: 'RVA', objectType: 'RVA',
    nodes: [{ code: 'tourism_residence', name: 'Résidence de tourisme', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'collectif' }],
  },
  {
    domain: 'taxonomy_hpa', name: 'HPA', objectType: 'HPA',
    nodes: [
      { code: 'declared_campground', name: 'Terrain de camping déclaré', parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'campings_terrains' },
      { code: 'farm_camping', name: 'Camping à la ferme', parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 1, axis: 'sous_type', family: 'campings_terrains' },
      { code: 'outdoor_glamping', name: 'Hébergement insolite de plein air', parentCode: null, depth: 0, isAssignable: false, position: 3, axis: 'type_unite', family: null },
    ],
  },
  // Domaine NON hébergement : il ne doit jamais entrer dans ce parcours.
  {
    domain: 'taxonomy_act', name: 'ACT', objectType: 'ACT',
    nodes: [{ code: 'guided_tour', name: 'Visite guidée', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'collectif' }],
  },
] as unknown as ExplorerTaxonomyDomain[];

describe('périmètre hébergement', () => {
  it('dérive les cinq types de l\'archétype HEB — jamais d\'une liste écrite à la main', () => {
    const fromArchetypes = Object.entries(TYPE_ARCHETYPES)
      .filter(([, meta]) => meta.archetype === 'HEB')
      .map(([code]) => code)
      .sort();

    expect(ACCOMMODATION_TYPE_CODES).toEqual(fromArchetypes);
    expect(ACCOMMODATION_TYPE_CODES).toEqual(['CAMP', 'HLO', 'HOT', 'HPA', 'RVA']);
  });

  it('exclut les treize autres types', () => {
    for (const code of ['RES', 'ACT', 'ITI', 'FMA', 'PNA', 'PCU', 'VIL', 'LOI', 'SPU', 'COM', 'PRD', 'ASC', 'PSV']) {
      expect(isAccommodationType(code)).toBe(false);
    }
  });
});

describe('buildCreateAccommodationFamilies', () => {
  it('ignore les domaines qui ne sont pas des hébergements', () => {
    const families = buildCreateAccommodationFamilies(TAXONOMIES, FAMILIES);
    const allCodes = families.flatMap((family) => family.natures.map((nature) => nature.code));

    expect(allCodes).not.toContain('guided_tour');
  });

  it('exclut les nœuds non assignables — on ne propose pas de créer sur une nature morte', () => {
    const families = buildCreateAccommodationFamilies(TAXONOMIES, FAMILIES);
    const allCodes = families.flatMap((family) => family.natures.map((nature) => nature.code));

    expect(allCodes).not.toContain('outdoor_glamping');
  });

  it('porte les sous-types sous leur vraie nature parente', () => {
    const campings = buildCreateAccommodationFamilies(TAXONOMIES, FAMILIES)
      .find((family) => family.code === 'campings_terrains')!;

    expect(campings.natures).toHaveLength(1);
    expect(campings.natures[0].children.map((child) => child.code)).toEqual(['farm_camping']);
  });
});

describe('resolveAccommodationTechnicalType', () => {
  const families = () => buildCreateAccommodationFamilies(TAXONOMIES, FAMILIES);

  it('dérive le type du DOMAINE du nœud choisi', () => {
    expect(resolveAccommodationTechnicalType(families(), { domain: 'taxonomy_rva', code: 'tourism_residence' })).toBe('RVA');
    expect(resolveAccommodationTechnicalType(families(), { domain: 'taxonomy_hpa', code: 'declared_campground' })).toBe('HPA');
  });

  it('donne le type du PARENT technique pour un sous-type', () => {
    expect(resolveAccommodationTechnicalType(families(), { domain: 'taxonomy_hpa', code: 'farm_camping' })).toBe('HPA');
  });

  it('rend null sans sélection ou sur un code inconnu — fail-closed', () => {
    expect(resolveAccommodationTechnicalType(families(), null)).toBeNull();
    expect(resolveAccommodationTechnicalType(families(), { domain: 'taxonomy_hpa', code: 'inexistant' })).toBeNull();
    // Même code, autre domaine : aucune parenté, aucune déduction.
    expect(resolveAccommodationTechnicalType(families(), { domain: 'taxonomy_rva', code: 'farm_camping' })).toBeNull();
  });
});

describe('accommodationSelectionPath', () => {
  it('affiche Famille › Nature › Sous-type', () => {
    const families = buildCreateAccommodationFamilies(TAXONOMIES, FAMILIES);

    expect(accommodationSelectionPath(families, { domain: 'taxonomy_hpa', code: 'farm_camping' }))
      .toBe('Campings et terrains › Terrain de camping déclaré › Camping à la ferme');
    expect(accommodationSelectionPath(families, { domain: 'taxonomy_rva', code: 'tourism_residence' }))
      .toBe('Hébergement collectif › Résidence de tourisme');
    expect(accommodationSelectionPath(families, null)).toBe('');
  });
});

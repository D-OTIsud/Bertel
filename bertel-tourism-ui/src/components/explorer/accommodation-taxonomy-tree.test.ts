import {
  accommodationBreadcrumb,
  buildAccommodationTaxonomyTree,
  filterAccommodationNatures,
} from './accommodation-taxonomy-tree';
import type { ExplorerTaxonomyDomain, ExplorerTaxonomyNode } from '../../types/domain';

type NodeOverrides = Partial<ExplorerTaxonomyNode> & Pick<ExplorerTaxonomyNode, 'code' | 'name'>;

function node(overrides: NodeOverrides): ExplorerTaxonomyNode {
  return {
    parentCode: null,
    depth: 0,
    isAssignable: true,
    position: 1,
    axis: 'nature',
    family: null,
    aliases: [],
    ...overrides,
  };
}

function domain(name: string, objectType: string, nodes: ExplorerTaxonomyNode[]): ExplorerTaxonomyDomain {
  return { domain: name, name, objectType, nodes } as ExplorerTaxonomyDomain;
}

/** L'arbre cible du §201, réduit à ce qui porte une décision. */
function targetDomains(): ExplorerTaxonomyDomain[] {
  return [
    domain('taxonomy_hlo', 'HLO', [
      node({ code: 'auberge_collective', name: 'Auberge', family: 'collectif', position: 1, aliases: ['Auberge collective'] }),
      node({ code: 'gite_de_groupe', name: 'Gîte', family: 'collectif', position: 2, aliases: ['Gîte de groupe'] }),
      node({ code: 'gite_de_randonnee', name: "Refuge et gîte d'étape", family: 'collectif', position: 3 }),
    ]),
    domain('taxonomy_rva', 'RVA', [
      node({ code: 'tourism_residence', name: 'Résidence de tourisme', family: 'collectif', position: 4 }),
      node({ code: 'holiday_village', name: 'Village de vacances', family: 'collectif', position: 5 }),
      node({ code: 'aparthotel', name: 'Résidence hôtelière', family: 'collectif', position: 6 }),
    ]),
    domain('taxonomy_camp', 'CAMP', [
      node({ code: 'camping', name: 'Camping', family: 'campings_terrains', position: 101 }),
    ]),
    domain('taxonomy_hpa', 'HPA', [
      node({ code: 'natural_camp_area', name: 'Aire naturelle de camping', family: 'campings_terrains', position: 1 }),
      node({ code: 'declared_campground', name: 'Terrain de camping déclaré', family: 'campings_terrains', position: 3 }),
      node({ code: 'farm_camping', name: 'Camping à la ferme', family: 'campings_terrains', position: 1, axis: 'sous_type', parentCode: 'declared_campground' }),
      node({ code: 'homestay_camping', name: "Camping chez l'habitant", family: 'campings_terrains', position: 2, axis: 'sous_type', parentCode: 'declared_campground' }),
      node({ code: 'residential_leisure_park', name: 'Parc résidentiel de loisirs', family: 'campings_terrains', position: 6 }),
      node({ code: 'bivouac_area', name: 'Aire de bivouac', family: 'aires_haltes_plein_air', position: 10 }),
      node({ code: 'motorhome_area', name: "Aire d'accueil camping-car", family: 'aires_haltes_plein_air', position: 4 }),
      node({ code: 'motorhome_night_stop', name: 'Halte nocturne camping-car/van', family: 'aires_haltes_plein_air', position: 12 }),
      // Sorti de l'axe nature par la migration §201.
      node({ code: 'outdoor_glamping', name: 'Hébergement insolite de plein air', family: null, position: 3, axis: 'type_unite', isAssignable: false }),
    ]),
  ];
}

const FAMILY_ORDER = ['hotellerie', 'locatif', 'collectif', 'campings_terrains', 'aires_haltes_plein_air'];

function familyCodes(tree: ReturnType<typeof buildAccommodationTaxonomyTree>): string[] {
  return tree.families.map((family) => family.code);
}

function natureNames(tree: ReturnType<typeof buildAccommodationTaxonomyTree>, code: string): string[] {
  return (tree.families.find((family) => family.code === code)?.natures ?? []).map((n) => n.entry.node.name);
}

describe('buildAccommodationTaxonomyTree', () => {
  it('range les six natures collectives au même niveau, HLO et RVA confondus', () => {
    const tree = buildAccommodationTaxonomyTree(targetDomains(), FAMILY_ORDER);

    expect(natureNames(tree, 'collectif')).toEqual([
      'Auberge',
      'Gîte',
      "Refuge et gîte d'étape",
      'Résidence de tourisme',
      'Village de vacances',
      'Résidence hôtelière',
    ]);
    // Aucune n'est l'enfant d'une autre : le défaut visible que §201 corrige.
    for (const nature of tree.families.find((f) => f.code === 'collectif')!.natures) {
      expect(nature.children).toEqual([]);
    }
  });

  it('donne à Terrain de camping déclaré ses deux vrais sous-types', () => {
    const tree = buildAccommodationTaxonomyTree(targetDomains(), FAMILY_ORDER);
    const campings = tree.families.find((family) => family.code === 'campings_terrains')!;

    expect(campings.natures.map((n) => n.entry.node.name)).toEqual([
      'Aire naturelle de camping',
      'Terrain de camping déclaré',
      'Parc résidentiel de loisirs',
      'Camping',
    ]);

    const declared = campings.natures.find((n) => n.entry.node.code === 'declared_campground')!;
    expect(declared.children.map((child) => child.entry.node.name)).toEqual([
      'Camping à la ferme',
      "Camping chez l'habitant",
    ]);
    // …et ils ne sont PAS des natures sœurs de Camping.
    expect(campings.natures.map((n) => n.entry.node.code)).not.toContain('farm_camping');
    expect(campings.natures.map((n) => n.entry.node.code)).not.toContain('homestay_camping');
  });

  it('sépare Aire naturelle (campings) et Aire d\'accueil camping-car (aires et haltes)', () => {
    const tree = buildAccommodationTaxonomyTree(targetDomains(), FAMILY_ORDER);

    expect(natureNames(tree, 'campings_terrains')).toContain('Aire naturelle de camping');
    expect(natureNames(tree, 'aires_haltes_plein_air')).not.toContain('Aire naturelle de camping');
    expect(natureNames(tree, 'aires_haltes_plein_air')).toEqual([
      "Aire d'accueil camping-car",
      'Aire de bivouac',
      'Halte nocturne camping-car/van',
    ]);
  });

  it('ordonne les familles selon le catalogue, pas selon l\'ordre de découverte', () => {
    const tree = buildAccommodationTaxonomyTree(targetDomains(), FAMILY_ORDER);
    expect(familyCodes(tree)).toEqual(['collectif', 'campings_terrains', 'aires_haltes_plein_air']);
  });

  it('exclut partout un nœud non assignable — familles, sous-arbres ET critères complémentaires', () => {
    const tree = buildAccommodationTaxonomyTree(targetDomains(), FAMILY_ORDER);

    const everyNodeCode = tree.families.flatMap((family) =>
      family.natures.flatMap((nature) => [nature.entry.node.code, ...nature.children.map((c) => c.entry.node.code)]),
    );
    expect(everyNodeCode).not.toContain('outdoor_glamping');
    expect(tree.unitTypes.map((entry) => entry.node.code)).not.toContain('outdoor_glamping');
    expect(tree.positionings.map((entry) => entry.node.code)).not.toContain('outdoor_glamping');
  });

  it('n\'établit aucune parenté entre domaines même si le parentCode existe ailleurs', () => {
    // `declared_campground` n'existe QUE dans taxonomy_hpa. Un nœud HLO qui s'en
    // réclamerait ne doit pas s'y accrocher : deux domaines sont deux mondes.
    const domains = [
      ...targetDomains(),
      domain('taxonomy_hlo_bis', 'HLO', [
        node({ code: 'intrus', name: 'Intrus', family: 'campings_terrains', axis: 'sous_type', parentCode: 'declared_campground' }),
      ]),
    ];
    const tree = buildAccommodationTaxonomyTree(domains, FAMILY_ORDER);
    const declared = tree.families
      .find((family) => family.code === 'campings_terrains')!
      .natures.find((n) => n.entry.node.code === 'declared_campground')!;

    expect(declared.children.map((child) => child.entry.node.code)).toEqual(['farm_camping', 'homestay_camping']);
    expect(tree.orphanSubtypes.map((entry) => entry.node.code)).toEqual(['intrus']);
  });

  it('exclut un sous-type orphelin du rendu au lieu de le présenter comme une nature sœur', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const domains = [
      domain('taxonomy_hpa', 'HPA', [
        node({ code: 'natural_camp_area', name: 'Aire naturelle de camping', family: 'campings_terrains' }),
        // Axe posé, re-parentage oublié : erreur de catalogue.
        node({ code: 'farm_camping', name: 'Camping à la ferme', family: 'campings_terrains', axis: 'sous_type', parentCode: null }),
      ]),
    ];

    const tree = buildAccommodationTaxonomyTree(domains, FAMILY_ORDER);

    expect(natureNames(tree, 'campings_terrains')).toEqual(['Aire naturelle de camping']);
    expect(tree.orphanSubtypes.map((entry) => entry.node.code)).toEqual(['farm_camping']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sans parent same-domain'),
      expect.stringContaining('taxonomy_hpa:farm_camping'),
    );
    warn.mockRestore();
  });

  it('ne dédoublonne jamais deux nœuds homonymes de domaines différents', () => {
    const domains = [
      domain('taxonomy_camp', 'CAMP', [node({ code: 'camping', name: 'Camping', family: 'campings_terrains' })]),
      domain('taxonomy_hpa', 'HPA', [node({ code: 'camping', name: 'Camping', family: 'campings_terrains' })]),
    ];
    const tree = buildAccommodationTaxonomyTree(domains, FAMILY_ORDER);
    const natures = tree.families.find((family) => family.code === 'campings_terrains')!.natures;

    expect(natures).toHaveLength(2);
    expect(natures.map((n) => n.entry.domain).sort()).toEqual(['taxonomy_camp', 'taxonomy_hpa']);
  });

  it('garde visibles les natures collectives de l\'ANCIEN catalogue (sous_type sous le conteneur de famille)', () => {
    // État live AVANT la migration §201 : les 3 nœuds HLO sont encore marqués
    // `sous_type` sous `hebergement_collectif` (axe `famille`). Le frontend est
    // déployé avant le SQL : s'il les traitait en orphelins, l'Explorer perdrait
    // ses natures collectives pendant toute la fenêtre de déploiement.
    const domains = [
      domain('taxonomy_hlo', 'HLO', [
        node({ code: 'hebergement_collectif', name: 'Hébergement collectif', family: 'collectif', axis: 'famille', position: 3 }),
        node({ code: 'gite_de_randonnee', name: "Refuge et gîte d'étape", family: 'collectif', axis: 'sous_type', parentCode: 'hebergement_collectif', position: 4 }),
        node({ code: 'gite_de_groupe', name: 'Gîte de groupe', family: 'collectif', axis: 'sous_type', parentCode: 'hebergement_collectif', position: 5 }),
      ]),
    ];

    const tree = buildAccommodationTaxonomyTree(domains, FAMILY_ORDER);

    // Le conteneur `hebergement_collectif` (axe `famille`) n'est pas une entrée
    // sélectionnable : il donne son nom au bloc, pas une puce de filtre.
    expect(natureNames(tree, 'collectif')).toEqual([
      "Refuge et gîte d'étape",
      'Gîte de groupe',
    ]);
    expect(tree.orphanSubtypes).toEqual([]);
    // …et aucun n'est imbriqué sous un autre : ils sont bien au même niveau.
    for (const nature of tree.families.find((f) => f.code === 'collectif')!.natures) {
      expect(nature.children).toEqual([]);
    }
  });

  it('ignore un nœud sans famille : il ne peut pas être rendu sous un bloc de premier niveau', () => {
    const domains = [
      domain('taxonomy_hpa', 'HPA', [node({ code: 'orphelin_famille', name: 'Sans famille', family: null })]),
    ];
    expect(buildAccommodationTaxonomyTree(domains, FAMILY_ORDER).families).toEqual([]);
  });
});

describe('filterAccommodationNatures', () => {
  const campings = () =>
    buildAccommodationTaxonomyTree(targetDomains(), FAMILY_ORDER).families.find((f) => f.code === 'campings_terrains')!
      .natures;

  it('révèle le parent quand la recherche correspond à un enfant', () => {
    const result = filterAccommodationNatures(campings(), (n) => n.code === 'farm_camping');

    expect(result.map((n) => n.entry.node.code)).toEqual(['declared_campground']);
    expect(result[0].children.map((c) => c.entry.node.code)).toEqual(['farm_camping']);
  });

  it('conserve tous les enfants quand la recherche correspond au parent', () => {
    const result = filterAccommodationNatures(campings(), (n) => n.code === 'declared_campground');

    expect(result).toHaveLength(1);
    expect(result[0].children.map((c) => c.entry.node.code)).toEqual(['farm_camping', 'homestay_camping']);
  });

  it('rend un ensemble vide quand rien ne correspond', () => {
    expect(filterAccommodationNatures(campings(), () => false)).toEqual([]);
  });
});

describe('accommodationBreadcrumb', () => {
  it('affiche le chemin complet, ce qui désambiguïse le libellé court « Gîte »', () => {
    expect(accommodationBreadcrumb('Hébergement collectif', 'Gîte')).toBe('Hébergement collectif › Gîte');
    expect(accommodationBreadcrumb('Campings et terrains', 'Terrain de camping déclaré', 'Camping à la ferme'))
      .toBe('Campings et terrains › Terrain de camping déclaré › Camping à la ferme');
  });
});

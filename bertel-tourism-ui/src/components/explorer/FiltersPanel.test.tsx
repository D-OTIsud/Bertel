import { render, screen, fireEvent, act } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';
import { useExplorerStore } from '../../store/explorer-store';
import type { ExplorerReferences } from '../../types/domain';

// Références minimales : seuls les schemes classés + leurs niveaux sont nécessaires ici,
// tous les autres accès à `references` dans FiltersPanel sont optional-chained.
const GRADED_REFERENCES = {
  rankedLabelSchemes: [
    { code: 'hot_stars', name: 'Classement hôtelier', group: 'Classements' },
    { code: 'LBL_CLEF_VERTE', name: 'Clef Verte', group: 'Durabilité' },
  ],
  rankedLabelSchemeValues: {
    hot_stars: [
      { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
      { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
    ],
    LBL_CLEF_VERTE: [{ code: 'granted', name: 'Labellisé' }],
  },
} as unknown as ExplorerReferences;

const HOT_TAXONOMY_REFERENCES = {
  hotCapacityMetrics: [],
  taxonomies: [
    {
      domain: 'taxonomy_camp',
      name: 'Camping classé',
      objectType: 'CAMP',
      nodes: [{ code: 'camping_chez_habitant', name: 'Camping chez l’habitant', parentCode: null, depth: 0, isAssignable: true, position: 1 }],
    },
    {
      domain: 'taxonomy_hpa',
      name: 'Hébergement de plein air',
      objectType: 'HPA',
      nodes: [{ code: 'camping_ferme', name: 'Camping à la ferme', parentCode: null, depth: 0, isAssignable: true, position: 1 }],
    },
  ],
} as unknown as ExplorerReferences;

const SEMANTIC_ACCOMMODATION_REFERENCES = {
  hotCapacityMetrics: [],
  accommodationFamilies: [
    { code: 'hotellerie', name: 'Hôtellerie', description: 'Établissements hôteliers.', position: 1 },
    { code: 'locatif', name: 'Hébergement locatif', description: 'Locations touristiques.', position: 2 },
    { code: 'collectif', name: 'Hébergement collectif', description: 'Accueil de groupes.', position: 3 },
  ],
  taxonomies: [
    {
      domain: 'taxonomy_hot',
      name: 'Nature d’hébergement — hôtellerie',
      objectType: 'HOT',
      nodes: [
        { code: 'hotel', name: 'Hôtel', description: 'Établissement hôtelier.', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'hotellerie', aliases: [], sourceRef: 'Code du tourisme art. D311-4' },
      ],
    },
    {
      domain: 'taxonomy_hlo',
      name: 'Nature d’hébergement — locatif',
      objectType: 'HLO',
      nodes: [
        { code: 'location_saisonniere', name: 'Meublé de tourisme', description: 'Villa, appartement ou studio meublé.', parentCode: 'hebergement_locatif', depth: 1, isAssignable: true, position: 1, axis: 'nature', family: 'locatif', aliases: ['Location saisonnière', 'Gîte'], sourceRef: 'Code du tourisme art. D324-1' },
        { code: 'maison', name: 'Maison / villa', description: 'Logement individuel entier.', parentCode: 'location_saisonniere', depth: 2, isAssignable: true, position: 2, axis: 'type_unite', family: 'locatif', aliases: ['Gîte & Villa'] },
        { code: 'hebergement_collectif', name: 'Hébergement collectif', description: 'Accueil de groupes.', parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'famille', family: 'collectif', aliases: ["Gîte d'étape et de randonnée"] },
        { code: 'gite_de_randonnee', name: "Refuge et gîte d'étape", description: 'Accueil à l’étape.', parentCode: 'hebergement_collectif', depth: 1, isAssignable: true, position: 4, axis: 'sous_type', family: 'collectif', aliases: ['Gîte de randonnée'] },
        { code: 'gite_de_groupe', name: 'Gîte de groupe', description: 'Accueil de groupes constitués.', parentCode: 'hebergement_collectif', depth: 1, isAssignable: true, position: 5, axis: 'sous_type', family: 'collectif', aliases: [] },
      ],
    },
  ],
} as unknown as ExplorerReferences;

// Sections type-spécifiques repliables (décision §152) : l'en-tête disclosure
// porte un nom accessible distinct (« Section X », préfixe sr-only) pour ne pas
// collisionner avec la chip de bucket homonyme au comportement destructif.
function sectionToggle(name: RegExp, expanded: boolean) {
  return screen.getByRole('button', { name, expanded });
}

function resetStore() {
  act(() => useExplorerStore.getState().resetAll());
}

describe('FiltersPanel — sections type-spécifiques repliables', () => {
  beforeEach(resetStore);

  it('la section Hébergements se replie et se déplie', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel />);

    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hébergements/, true));
    expect(screen.queryByText("Type d'hébergement")).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hébergements/, false));
    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
    // La chip de bucket homonyme garde son nom nu : pas de collision de noms.
    expect(screen.getByRole('button', { name: 'Hébergements' })).toBeInTheDocument();
  });

  it("l'en-tête Hébergements porte le compte des critères actifs (visible replié)", () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('HOT');
      useExplorerStore.getState().toggleTaxonomy('taxonomy_hot', 'hotel');
    });
    render(<FiltersPanel />);

    const toggle = sectionToggle(/Section Hébergements/, true);
    expect(toggle).toHaveTextContent('1');
    fireEvent.click(toggle);
    // Replié, le badge reste — un filtre actif n'est jamais masqué par le pli.
    expect(sectionToggle(/Section Hébergements/, false)).toHaveTextContent('1');
  });

  it('affiche les mêmes libellés canoniques et nœuds taxonomiques que la création', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel references={HOT_TAXONOMY_REFERENCES} />);

    expect(screen.getByRole('button', { name: 'Camping classé' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hébergement de plein air' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Camping chez l’habitant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Camping à la ferme' })).toBeInTheDocument();
  });

  it('affiche le nouveau modèle sémantique sous forme compacte et progressive', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel references={SEMANTIC_ACCOMMODATION_REFERENCES} />);

    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
    expect(screen.getByText("Famille d'hébergement")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hôtellerie', expanded: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hébergement locatif', expanded: true })).toBeInTheDocument();
    expect(screen.queryByText('Locations touristiques.')).not.toBeInTheDocument();
    expect(screen.queryByText('Location saisonnière')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Meublé de tourisme' }));
    expect(useExplorerStore.getState().common.taxonomyAny).toContainEqual({
      domain: 'taxonomy_hlo',
      code: 'location_saisonniere',
    });

    fireEvent.click(screen.getByRole('button', { name: /^Hébergement locatif/, expanded: true }));
    expect(screen.queryByRole('button', { name: 'Meublé de tourisme' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Hébergement locatif/, expanded: false })).toHaveTextContent('1');
  });

  it('retrouve les anciens termes Berta sans les afficher comme second libellé', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel references={SEMANTIC_ACCOMMODATION_REFERENCES} />);

    const search = screen.getByRole('textbox', { name: "Rechercher un type d'hébergement" });
    fireEvent.change(search, { target: { value: 'Gîte de randonnée' } });

    expect(screen.getByRole('button', { name: "Refuge et gîte d'étape" })).toBeInTheDocument();
    expect(screen.queryByText('Berta :')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Effacer la recherche d'hébergement" })).toBeInTheDocument();
  });

  it("range le type d'unité dans les critères complémentaires", () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel references={SEMANTIC_ACCOMMODATION_REFERENCES} />);

    expect(screen.queryByRole('button', { name: 'Maison / villa' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Critères complémentaires', expanded: false }));
    expect(screen.getByText("Type d'unité d'hébergement")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maison / villa' })).toBeInTheDocument();
  });

  // §200 — catalogue cible : 5 familles, natures collectives au même niveau,
  // vrais sous-arbres sous Terrain de camping déclaré, outdoor_glamping retiré.
  const V2_ACCOMMODATION_REFERENCES = {
    hotCapacityMetrics: [],
    accommodationFamilies: [
      { code: 'hotellerie', name: 'Hôtellerie', position: 1 },
      { code: 'locatif', name: 'Hébergement locatif', position: 2 },
      { code: 'collectif', name: 'Hébergement collectif', position: 3 },
      { code: 'campings_terrains', name: 'Campings et terrains', position: 4, aliases: ['Hôtellerie de plein air', 'Hébergement de plein air'] },
      { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air', position: 5, aliases: ['Hôtellerie de plein air', 'Hébergement de plein air'] },
    ],
    taxonomies: [
      {
        domain: 'taxonomy_hlo', name: 'HLO', objectType: 'HLO',
        nodes: [
          { code: 'auberge_collective', name: 'Auberge', parentCode: 'hebergement_collectif', depth: 1, isAssignable: true, position: 1, axis: 'nature', family: 'collectif', aliases: ['Auberge collective'] },
          { code: 'gite_de_groupe', name: 'Gîte', parentCode: 'hebergement_collectif', depth: 1, isAssignable: true, position: 2, axis: 'nature', family: 'collectif', aliases: ['Gîte de groupe'] },
          { code: 'gite_de_randonnee', name: "Refuge et gîte d'étape", parentCode: 'hebergement_collectif', depth: 1, isAssignable: true, position: 3, axis: 'nature', family: 'collectif', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_rva', name: 'RVA', objectType: 'RVA',
        nodes: [
          { code: 'tourism_residence', name: 'Résidence de tourisme', parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'collectif', aliases: [] },
          { code: 'holiday_village', name: 'Village de vacances', parentCode: null, depth: 0, isAssignable: true, position: 5, axis: 'nature', family: 'collectif', aliases: [] },
          { code: 'aparthotel', name: 'Résidence hôtelière', parentCode: null, depth: 0, isAssignable: true, position: 6, axis: 'nature', family: 'collectif', aliases: [] },
        ],
      },
      {
        domain: 'taxonomy_camp', name: 'CAMP', objectType: 'CAMP',
        nodes: [
          { code: 'camping', name: 'Camping', parentCode: null, depth: 0, isAssignable: true, position: 101, axis: 'nature', family: 'campings_terrains', aliases: ['Camping aménagé', 'Camping classé'] },
        ],
      },
      {
        domain: 'taxonomy_hpa', name: 'HPA', objectType: 'HPA',
        nodes: [
          { code: 'natural_camp_area', name: 'Aire naturelle de camping', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'campings_terrains', aliases: [] },
          { code: 'declared_campground', name: 'Terrain de camping déclaré', parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'campings_terrains', aliases: [] },
          { code: 'farm_camping', name: 'Camping à la ferme', parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 1, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
          { code: 'homestay_camping', name: "Camping chez l'habitant", parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 2, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
          { code: 'residential_leisure_park', name: 'Parc résidentiel de loisirs', parentCode: null, depth: 0, isAssignable: true, position: 6, axis: 'nature', family: 'campings_terrains', aliases: ['PRL'] },
          { code: 'motorhome_area', name: "Aire d'accueil camping-car", parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'bivouac_area', name: 'Aire de bivouac', parentCode: null, depth: 0, isAssignable: true, position: 10, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'motorhome_night_stop', name: 'Halte nocturne camping-car/van', parentCode: null, depth: 0, isAssignable: true, position: 12, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
          { code: 'outdoor_glamping', name: 'Hébergement insolite de plein air', parentCode: null, depth: 0, isAssignable: false, position: 3, axis: 'type_unite', family: null, aliases: [] },
        ],
      },
    ],
  } as unknown as ExplorerReferences;

  function openFamily(name: string) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`), expanded: false }));
  }

  describe('§200 — hiérarchie v2 des hébergements', () => {
    beforeEach(resetStore);

    it('affiche les cinq familles et plus « Hôtellerie de plein air »', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);

      for (const label of ['Hébergement collectif', 'Campings et terrains', 'Aires et haltes de plein air']) {
        expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: /^Hôtellerie de plein air/ })).not.toBeInTheDocument();
    });

    it('range les six natures collectives sous UN seul bloc Nature, sans bloc Sous-type', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);
      openFamily('Hébergement collectif');

      for (const label of ['Auberge', 'Gîte', "Refuge et gîte d'étape", 'Résidence de tourisme', 'Village de vacances', 'Résidence hôtelière']) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
      expect(screen.queryByText('Sous-type')).not.toBeInTheDocument();
    });

    it('rend Camping à la ferme et Chez l\'habitant DANS le conteneur de Terrain déclaré', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);
      openFamily('Campings et terrains');

      // Repliés par défaut : le parent porte le contrôle de dépliage.
      expect(screen.queryByRole('button', { name: 'Camping à la ferme' })).not.toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: /Déplier les sous-types de Terrain de camping déclaré/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);

      const container = document.getElementById(
        screen.getByRole('button', { name: /Replier les sous-types de Terrain de camping déclaré/ })
          .getAttribute('aria-controls') as string,
      );
      expect(container).not.toBeNull();
      // Les deux enfants sont DANS ce conteneur, pas voisins DOM de « Camping ».
      expect(container!).toContainElement(screen.getByRole('button', { name: 'Camping à la ferme' }));
      expect(container!).toContainElement(screen.getByRole('button', { name: "Camping chez l'habitant" }));
      expect(container!).not.toContainElement(screen.getByRole('button', { name: 'Camping' }));
    });

    it('sélectionner le parent et sélectionner un enfant produisent deux filtres différents', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);
      openFamily('Campings et terrains');

      fireEvent.click(screen.getByRole('button', { name: 'Terrain de camping déclaré' }));
      // Le front n'envoie QUE le parent : l'union des descendants est faite par
      // la closure serveur, jamais reconstituée ici.
      expect(useExplorerStore.getState().common.taxonomyAny).toEqual([
        { domain: 'taxonomy_hpa', code: 'declared_campground' },
      ]);

      fireEvent.click(screen.getByRole('button', { name: /Replier|Déplier/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Camping à la ferme' }));
      expect(useExplorerStore.getState().common.taxonomyAny).toContainEqual(
        { domain: 'taxonomy_hpa', code: 'farm_camping' },
      );
    });

    it('sépare Aire naturelle (campings) et Aire d\'accueil camping-car (aires et haltes)', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);

      openFamily('Campings et terrains');
      expect(screen.getByRole('button', { name: 'Aire naturelle de camping' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "Aire d'accueil camping-car" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^Campings et terrains/, expanded: true }));
      openFamily('Aires et haltes de plein air');
      expect(screen.getByRole('button', { name: "Aire d'accueil camping-car" })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Aire de bivouac' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Halte nocturne camping-car/van' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aire naturelle de camping' })).not.toBeInTheDocument();
    });

    it('n\'expose nulle part un nœud non assignable, y compris dans les critères complémentaires', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);

      expect(screen.queryByRole('button', { name: 'Hébergement insolite de plein air' })).not.toBeInTheDocument();
      // Le bloc entier disparaît quand il ne reste aucun critère assignable.
      expect(screen.queryByRole('button', { name: 'Critères complémentaires' })).not.toBeInTheDocument();
    });

    it('retrouve les deux nouvelles familles via l\'ancien terme « plein air »', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);

      const search = screen.getByRole('textbox', { name: "Rechercher un type d'hébergement" });
      fireEvent.change(search, { target: { value: 'plein air' } });

      expect(screen.getByRole('button', { name: 'Aire de bivouac' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Parc résidentiel de loisirs' })).toBeInTheDocument();
      // …sans jamais réafficher l'ancienne famille comme un choix actif.
      expect(screen.queryByRole('button', { name: /^Hôtellerie de plein air/ })).not.toBeInTheDocument();
    });

    it('révèle le chemin parent quand la recherche correspond à un sous-type', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);

      const search = screen.getByRole('textbox', { name: "Rechercher un type d'hébergement" });
      fireEvent.change(search, { target: { value: 'à la ferme' } });

      expect(screen.getByRole('button', { name: 'Terrain de camping déclaré' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Camping à la ferme' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "Camping chez l'habitant" })).not.toBeInTheDocument();
    });

    it('porte le contexte « Hébergement collectif › Gîte » sur la puce au libellé court', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);
      openFamily('Hébergement collectif');

      // Le libellé visible reste court — c'est la famille ouverte qui le situe —
      // mais « Gîte » désigne AUSSI un meublé de tourisme : le chemin complet
      // doit rester lisible sans quitter le filtre.
      expect(screen.getByRole('button', { name: 'Gîte' }))
        .toHaveAttribute('title', expect.stringContaining('Hébergement collectif › Gîte'));
    });

    it('ne dédoublonne pas deux natures homonymes de domaines différents', () => {
      const references = {
        ...V2_ACCOMMODATION_REFERENCES,
        taxonomies: [
          { domain: 'taxonomy_camp', name: 'CAMP', objectType: 'CAMP', nodes: [{ code: 'camping', name: 'Camping', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'campings_terrains', aliases: [] }] },
          { domain: 'taxonomy_hpa', name: 'HPA', objectType: 'HPA', nodes: [{ code: 'camping', name: 'Camping', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'campings_terrains', aliases: [] }] },
        ],
      } as unknown as ExplorerReferences;

      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={references} />);
      openFamily('Campings et terrains');

      expect(screen.getAllByRole('button', { name: 'Camping' })).toHaveLength(2);
    });

    it('propose le nouvel axe Type d\'unité dans les critères complémentaires', () => {
      const references = {
        ...V2_ACCOMMODATION_REFERENCES,
        accommodationUnitTypes: [
          { code: 'bubble', name: 'Bulle' },
          { code: 'lodge', name: 'Lodge' },
        ],
      } as unknown as ExplorerReferences;

      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={references} />);

      // Replié par défaut : c'est un critère secondaire, pas la nature.
      expect(screen.queryByRole('button', { name: 'Bulle' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Critères complémentaires', expanded: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Bulle' }));
      fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
      // Multi-valué : les deux coexistent, contrairement à la nature.
      expect(useExplorerStore.getState().common.accommodationUnitTypesAny).toEqual(['bubble', 'lodge']);

      fireEvent.click(screen.getByRole('button', { name: 'Bulle' }));
      expect(useExplorerStore.getState().common.accommodationUnitTypesAny).toEqual(['lodge']);
    });

    it('l\'en-tête de famille reste un accordéon, jamais un filtre', () => {
      act(() => useExplorerStore.getState().toggleBucket('HOT'));
      render(<FiltersPanel references={V2_ACCOMMODATION_REFERENCES} />);

      const header = screen.getByRole('button', { name: /^Campings et terrains/, expanded: false });
      expect(header).not.toHaveAttribute('aria-pressed');
      fireEvent.click(header);
      // Ouvrir la famille ne pose aucun filtre.
      expect(useExplorerStore.getState().common.taxonomyAny).toEqual([]);
    });
  });

  it('la section Itinéraires est repliable et compte ses critères', () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('ITI');
      useExplorerStore.getState().setItiIsLoop(true);
      useExplorerStore.getState().setItiDistance(5, undefined);
    });
    render(<FiltersPanel />);

    const toggle = sectionToggle(/Section Itinéraires/, true);
    expect(toggle).toHaveTextContent('2');
    fireEvent.click(toggle);
    expect(screen.queryByText('Type de parcours')).not.toBeInTheDocument();
  });

  it('les sections Site & visite et Services sont repliables', () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('VIS');
      useExplorerStore.getState().toggleBucket('SRV');
    });
    render(<FiltersPanel />);

    fireEvent.click(sectionToggle(/Section Site & visite/, true));
    expect(screen.queryByText('Type de visite')).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Services/, true));
    expect(screen.queryByText('Type de service')).not.toBeInTheDocument();
  });

  it('les groupes transverses restent non repliables', () => {
    render(<FiltersPanel />);
    expect(screen.queryByRole('button', { name: /Localisation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accessibilité et services/ })).not.toBeInTheDocument();
  });
});

describe('FiltersPanel — difficulté ITI en segments (§156)', () => {
  beforeEach(resetStore);

  it('sélectionne un segment (bornes posées) et le re-clic le retire', () => {
    act(() => useExplorerStore.getState().toggleBucket('ITI'));
    render(<FiltersPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Facile (1-2)' }));
    expect(useExplorerStore.getState().iti.difficultyMax).toBe(2);
    expect(useExplorerStore.getState().iti.difficultyMin).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Facile (1-2)' }));
    expect(useExplorerStore.getState().iti.difficultyMax).toBeUndefined();
  });
});

describe('FiltersPanel — toggle « Inclure les démarches équivalentes » (label classé)', () => {
  beforeEach(resetStore);

  it("n'affiche pas le toggle quand aucun label classé n'est sélectionné", () => {
    render(<FiltersPanel />);
    expect(screen.queryByText('Inclure les démarches équivalentes')).not.toBeInTheDocument();
  });

  it('affiche le toggle coché par défaut quand un label classé est sélectionné', () => {
    act(() => useExplorerStore.getState().setRankedLabelScheme('LBL_CLEF_VERTE'));
    render(<FiltersPanel />);

    const toggle = screen.getByRole('checkbox', { name: /Inclure les démarches équivalentes/ });
    expect(toggle).toBeChecked();
  });

  it('décocher le toggle bascule le store en mode exact-only', () => {
    act(() => useExplorerStore.getState().setRankedLabelScheme('LBL_CLEF_VERTE'));
    render(<FiltersPanel />);

    const toggle = screen.getByRole('checkbox', { name: /Inclure les démarches équivalentes/ });
    fireEvent.click(toggle);

    expect(useExplorerStore.getState().common.rankedLabelIncludeEquivalents).toBe(false);
    expect(toggle).not.toBeChecked();
  });

  it("masque le toggle pour un scheme GRADUÉ (classement, ≥2 niveaux) et affiche la barre de niveaux", () => {
    act(() => useExplorerStore.getState().setRankedLabelScheme('hot_stars'));
    render(<FiltersPanel references={GRADED_REFERENCES} />);

    // Un classement n'a pas de démarches équivalentes (§173 = labels uniquement).
    expect(screen.queryByText('Inclure les démarches équivalentes')).not.toBeInTheDocument();
    // Le même gate ≥2 valeurs affiche la GradeBar, câblée sur setRankedLabelValueCodes.
    fireEvent.click(screen.getByRole('button', { name: '3 étoiles' }));
    expect(useExplorerStore.getState().common.rankedLabelValueCodes).toEqual(['3']);
  });

  it('affiche le toggle pour un label binaire (1 niveau) même avec les références chargées', () => {
    act(() => useExplorerStore.getState().setRankedLabelScheme('LBL_CLEF_VERTE'));
    render(<FiltersPanel references={GRADED_REFERENCES} />);

    expect(screen.getByRole('checkbox', { name: /Inclure les démarches équivalentes/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Labellisé' })).not.toBeInTheDocument();
  });

  it('changer de scheme réinitialise le toggle à « inclure » (pas d’exact-only caché)', () => {
    act(() => {
      useExplorerStore.getState().setRankedLabelScheme('LBL_CLEF_VERTE');
      useExplorerStore.getState().setRankedLabelIncludeEquivalents(false);
      useExplorerStore.getState().setRankedLabelScheme('hot_stars');
    });
    expect(useExplorerStore.getState().common.rankedLabelIncludeEquivalents).toBe(true);
  });
});

describe('explorer-store — garde min ≤ max (§156)', () => {
  beforeEach(resetStore);

  it('réordonne une plage inversée (distance)', () => {
    act(() => useExplorerStore.getState().setItiDistance(12, 5));
    expect(useExplorerStore.getState().iti.distanceMinKm).toBe(5);
    expect(useExplorerStore.getState().iti.distanceMaxKm).toBe(12);
  });

  it('réordonne une plage de capacité inversée', () => {
    act(() => useExplorerStore.getState().setResCapacityFilter('seats', 40, 10));
    expect(useExplorerStore.getState().res.capacityFilters).toEqual([{ code: 'seats', min: 10, max: 40 }]);
  });
});

/**
 * Capacités détaillées (16o) — la liste des métriques suit les SOUS-TYPES cochés,
 * pas le bucket. C'est le signalement PO : chercher un hôtel proposait
 * « Emplacements », « Camping-cars » et « Tentes », applicables à CAMP/HPA seulement.
 */
const CAPACITY_REFERENCES = {
  hotCapacityMetrics: [
    { code: 'beds', name: 'Lits', objectTypes: ['HOT', 'HLO', 'HPA', 'CAMP', 'RVA'] },
    { code: 'bedrooms', name: 'Chambres', objectTypes: ['HOT', 'HLO', 'RVA'] },
    { code: 'pitches', name: 'Emplacements', objectTypes: ['CAMP', 'HPA'] },
  ],
  capacityBounds: {
    bedrooms: { HOT: { min: 2, max: 60, sampleSize: 8 } },
    max_capacity: { HOT: { min: 20, max: 87, sampleSize: 8 }, HLO: { min: 2, max: 44, sampleSize: 473 } },
  },
  taxonomies: [],
} as unknown as ExplorerReferences;

describe('FiltersPanel — capacités détaillées par sous-type (16o)', () => {
  beforeEach(resetStore);

  function openHot() {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
  }

  function metricOptions(): string[] {
    const select = screen.getByLabelText('Ajouter un critère de capacité') as HTMLSelectElement;
    return [...select.options].map((option) => option.value).filter(Boolean);
  }

  it('propose les métriques de tous les types du bucket quand rien n’est resserré', () => {
    openHot();
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);
    expect(metricOptions()).toEqual(['beds', 'bedrooms', 'pitches']);
  });

  it('retire « Emplacements » quand seul Hôtel reste coché', () => {
    openHot();
    act(() => useExplorerStore.getState().setHotSubtypes(['HOT']));
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);
    expect(metricOptions()).toEqual(['beds', 'bedrooms']);
  });

  it('ne propose que les métriques du plein air quand seul Camping reste coché', () => {
    openHot();
    act(() => useExplorerStore.getState().setHotSubtypes(['CAMP']));
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);
    expect(metricOptions()).toEqual(['beds', 'pitches']);
  });

  it('ajouter un critère l’amorce sur la borne basse observée et le sort de la liste', () => {
    openHot();
    act(() => useExplorerStore.getState().setHotSubtypes(['HOT']));
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);

    fireEvent.change(screen.getByLabelText('Ajouter un critère de capacité'), { target: { value: 'bedrooms' } });

    expect(useExplorerStore.getState().hot.capacityFilters).toEqual([{ code: 'bedrooms', min: 2, max: undefined }]);
    expect(metricOptions()).toEqual(['beds']);
  });

  it('la croix retire le critère', () => {
    openHot();
    act(() => useExplorerStore.getState().setHotCapacityFilter('bedrooms', 4, undefined));
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le critère Chambres' }));
    expect(useExplorerStore.getState().hot.capacityFilters).toEqual([]);
  });

  it('sans bornes connues, pas de curseur — la saisie numérique reste offerte (§150)', () => {
    openHot();
    act(() => useExplorerStore.getState().setHotCapacityFilter('beds', 3, undefined));
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);

    expect(screen.queryByLabelText('Lits — minimum')).toBeInTheDocument();
    // beds n'a pas de bornes : la mention le dit, et lui seul la porte (la vedette
    // « Capacité d'accueil » en a, elle, et affiche donc ses curseurs).
    expect(screen.getAllByText(/Aucune valeur saisie pour l'instant/)).toHaveLength(1);
    expect(screen.queryByLabelText('Lits — minimum')).toBeInTheDocument();
  });
});

/**
 * Contrôle vedette « Capacité d'accueil » : min ET max (demande PO — « au moins N » ne
 * suffit pas, on cherche aussi « un gîte de 4 à 6 »), sur la métrique que le type
 * renseigne réellement.
 */
describe('FiltersPanel — capacité d’accueil bornée des deux côtés', () => {
  beforeEach(resetStore);

  it('écrit un minimum ET un maximum sur max_capacity pour les hébergements', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel references={CAPACITY_REFERENCES} />);

    fireEvent.change(screen.getByLabelText("Capacité d'accueil — minimum", { selector: 'input[type="number"]' }), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText("Capacité d'accueil — maximum", { selector: 'input[type="number"]' }), {
      target: { value: '6' },
    });

    expect(useExplorerStore.getState().hot.capacityFilters).toEqual([{ code: 'max_capacity', min: 4, max: 6 }]);
  });

  it('cible `seats` pour les restaurants, la seule métrique qu’ils renseignent', () => {
    act(() => useExplorerStore.getState().toggleBucket('RES'));
    render(<FiltersPanel references={{ ...CAPACITY_REFERENCES, resCapacityMetrics: [] } as never} />);

    fireEvent.change(screen.getByLabelText("Capacité d'accueil — minimum", { selector: 'input[type="number"]' }), {
      target: { value: '20' },
    });

    // `max_capacity` serait mort ici : aucune fiche RES n'en porte (0 ligne en base).
    expect(useExplorerStore.getState().res.capacityFilters).toEqual([{ code: 'seats', min: 20, max: undefined }]);
  });
});

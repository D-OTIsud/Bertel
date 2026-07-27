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

    expect(screen.getByText("Nature d'hébergement")).toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hébergements/, true));
    expect(screen.queryByText("Nature d'hébergement")).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hébergements/, false));
    expect(screen.getByText("Nature d'hébergement")).toBeInTheDocument();
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

  it('garde le sélecteur compact quand le catalogue contient les axes sémantiques', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel references={SEMANTIC_ACCOMMODATION_REFERENCES} />);

    expect(screen.getByText("Nature d'hébergement")).toBeInTheDocument();
    expect(screen.queryByLabelText('Rechercher dans le vocabulaire')).not.toBeInTheDocument();
    expect(screen.queryByText('Locations touristiques.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Meublé de tourisme' }));
    expect(useExplorerStore.getState().common.taxonomyAny).toContainEqual({
      domain: 'taxonomy_hlo',
      code: 'location_saisonniere',
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

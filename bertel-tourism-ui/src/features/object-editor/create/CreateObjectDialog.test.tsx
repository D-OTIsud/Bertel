import type { ObjectSearchResult } from '../useObjectSearch';

jest.mock('../../../services/rpc', () => ({ createObject: jest.fn(), assignObjectTaxonomy: jest.fn() }));
const mockListCreationCommunes = jest.fn();
jest.mock('../../../services/commune-reference', () => ({ listCreationCommunes: () => mockListCreationCommunes() }));

const mockListTaxonomyReferences = jest.fn();
const mockListAccommodationFamilies = jest.fn();
jest.mock('../../../services/explorer-reference', () => ({
  listTaxonomyReferences: () => mockListTaxonomyReferences(),
  listAccommodationFamilies: () => mockListAccommodationFamilies(),
}));

type SearchReturn = { results: ObjectSearchResult[]; loading: boolean };
const mockUseObjectSearch = jest.fn((): SearchReturn => ({ results: [], loading: false }));
jest.mock('../useObjectSearch', () => ({ useObjectSearch: () => mockUseObjectSearch() }));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateObjectDialog } from './CreateObjectDialog';
import { assignObjectTaxonomy, createObject } from '../../../services/rpc';
import { TYPE_ARCHETYPES } from '../archetypes';
import { ACCOMMODATION_TYPE_CODES } from './accommodation-create-flow';
import type { ExplorerAccommodationFamily, ExplorerTaxonomyDomain } from '../../../types/domain';

const mockCreateObject = createObject as jest.Mock;
const mockAssignObjectTaxonomy = assignObjectTaxonomy as jest.Mock;

const MOCK_TAXONOMIES: ExplorerTaxonomyDomain[] = Object.keys(TYPE_ARCHETYPES).map((objectType) => ({
  domain: `taxonomy_${objectType.toLowerCase()}`,
  name: `Taxonomie ${objectType}`,
  objectType,
  nodes: [{
    code: `${objectType.toLowerCase()}_option`,
    name: objectType === 'CAMP' ? 'Camping chez l’habitant' : `${objectType} — sous-catégorie`,
    parentCode: null,
    depth: 0,
    isAssignable: true,
    position: 1,
  }],
}));

// §201 — le parcours hébergement remplace les 5 tuiles techniques par les cinq
// familles métier directement sélectionnables. Ce catalogue reproduit l'arbre cible.
const ACCOMMODATION_FAMILIES: ExplorerAccommodationFamily[] = [
  { code: 'hotellerie', name: 'Hôtellerie', description: 'Description interne à ne pas afficher.', position: 1 },
  { code: 'locatif', name: 'Hébergement locatif', description: 'Description interne à ne pas afficher.', position: 2 },
  { code: 'collectif', name: 'Hébergement collectif', description: 'Accueil de groupes.', position: 3 },
  { code: 'campings_terrains', name: 'Campings et terrains', description: 'Terrains organisés pour le camping.', position: 4 },
  { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air', description: 'Halte ou nuitée sans terrain de camping.', position: 5 },
];

const V2_TAXONOMIES: ExplorerTaxonomyDomain[] = [
  {
    domain: 'taxonomy_hot', name: 'HOT', objectType: 'HOT',
    nodes: [
      { code: 'hotel', name: 'Hôtel', description: 'Description interne à ne pas afficher.', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'hotellerie', aliases: [] },
      { code: 'hotel_with_restaurant', name: 'Hôtel-restaurant', description: null, parentCode: 'hotel', depth: 1, isAssignable: true, position: 10, axis: 'sous_type', family: 'hotellerie', aliases: [] },
    ],
  },
  {
    domain: 'taxonomy_hlo', name: 'HLO', objectType: 'HLO',
    nodes: [
      { code: 'chambre_d_hotes', name: "Chambre d'hôtes", description: null, parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'locatif', aliases: [] },
      { code: 'location_saisonniere', name: 'Meublé de tourisme', description: 'Candidat à la fusion — arbitrage L3.', parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'locatif', aliases: [] },
      { code: 'gite_de_groupe', name: 'Gîte', description: "Accueil d'un groupe.", parentCode: null, depth: 0, isAssignable: true, position: 2, axis: 'nature', family: 'collectif', aliases: [] },
    ],
  },
  {
    domain: 'taxonomy_rva', name: 'RVA', objectType: 'RVA',
    nodes: [
      { code: 'tourism_residence', name: 'Résidence de tourisme', description: null, parentCode: null, depth: 0, isAssignable: true, position: 4, axis: 'nature', family: 'collectif', aliases: [] },
    ],
  },
  {
    domain: 'taxonomy_camp', name: 'CAMP', objectType: 'CAMP',
    nodes: [
      { code: 'camping', name: 'Camping', description: 'Le classement se filtre séparément.', parentCode: null, depth: 0, isAssignable: true, position: 101, axis: 'nature', family: 'campings_terrains', aliases: [] },
    ],
  },
  {
    domain: 'taxonomy_hpa', name: 'HPA', objectType: 'HPA',
    nodes: [
      { code: 'natural_camp_area', name: 'Aire naturelle de camping', description: 'Catégorie de terrain de camping, malgré le mot « aire ».', parentCode: null, depth: 0, isAssignable: true, position: 1, axis: 'nature', family: 'campings_terrains', aliases: [] },
      { code: 'declared_campground', name: 'Terrain de camping déclaré', description: 'Régime déclaratif.', parentCode: null, depth: 0, isAssignable: true, position: 3, axis: 'nature', family: 'campings_terrains', aliases: [] },
      { code: 'farm_camping', name: 'Camping à la ferme', description: 'Sur une exploitation agricole.', parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 1, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
      { code: 'homestay_camping', name: "Camping chez l'habitant", description: 'Chez un particulier.', parentCode: 'declared_campground', depth: 1, isAssignable: true, position: 2, axis: 'sous_type', family: 'campings_terrains', aliases: [] },
      { code: 'bivouac_area', name: 'Aire de bivouac', description: 'Halte légère et temporaire.', parentCode: null, depth: 0, isAssignable: true, position: 10, axis: 'nature', family: 'aires_haltes_plein_air', aliases: [] },
    ],
  },
];

beforeEach(() => {
  mockCreateObject.mockReset();
  mockAssignObjectTaxonomy.mockReset();
  mockAssignObjectTaxonomy.mockResolvedValue(undefined);
  mockUseObjectSearch.mockReturnValue({ results: [], loading: false });
  mockListTaxonomyReferences.mockReset();
  mockListAccommodationFamilies.mockReset();
  mockListCreationCommunes.mockReset();
  mockListCreationCommunes.mockResolvedValue([
    { code: '97403', name: 'Entre-Deux', postcodes: ['97414', '99998'] },
    { code: '97422', name: 'Le Tampon', postcodes: ['97418', '97430', '99998'] },
  ]);
  // Most dialog tests do not concern the catalogue. Keeping the request pending
  // avoids unrelated async state updates after their assertions/unmount.
  mockListTaxonomyReferences.mockImplementation(() => new Promise(() => {}));
  mockListAccommodationFamilies.mockImplementation(() => new Promise(() => {}));
});

/** Parcours NON hébergement : inchangé — une tuile de type, puis le nom. */
async function fillLocation(postcode = '97414') {
  await waitFor(() => expect(screen.queryByText('Chargement du référentiel des communes…')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/^Code postal$/), { target: { value: postcode } });
  await waitFor(() => expect(screen.getByLabelText(/^Commune$/)).toHaveValue(postcode === '97414' ? '97403' : '97422'));
}

async function selectTypeAndName(name: string) {
  fireEvent.click(screen.getByRole('radio', { name: /^Restaurant$/i }));
  fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: name } });
  await fillLocation();
}

/** Charge le parcours guidé avec le catalogue v2 résolu. */
async function openGuidedAccommodation() {
  mockListTaxonomyReferences.mockResolvedValueOnce(V2_TAXONOMIES);
  mockListAccommodationFamilies.mockResolvedValueOnce(ACCOMMODATION_FAMILIES);
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  await waitFor(() => expect(mockListAccommodationFamilies).toHaveBeenCalledTimes(1));
  await screen.findByRole('button', { name: 'Hébergement collectif' });
}

async function chooseFamilyAndNature(family: string, nature: string) {
  await openGuidedAccommodation();
  fireEvent.click(screen.getByRole('button', { name: family }));
  fireEvent.click(await screen.findByRole('button', { name: nature }));
}

async function expectGuidedCreationType(family: string, nature: string, expectedType: string) {
  mockCreateObject.mockResolvedValue(`${expectedType}RUN0000000999`);
  await chooseFamilyAndNature(family, nature);
  fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: `Test ${nature}` } });
  await fillLocation();
  fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
  await waitFor(() => expect(mockCreateObject).toHaveBeenCalledWith({
    type: expectedType,
    name: `Test ${nature}`,
    city: 'Entre-Deux',
    postcode: '97414',
  }));
}

it('keeps create available and reports missing fields on submit', async () => {
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  const create = screen.getByRole('button', { name: /créer la fiche/i });
  expect(create).toBeEnabled();
  fireEvent.click(create);
  expect(mockCreateObject).not.toHaveBeenCalled();
  expect(screen.getByText('Le code postal est obligatoire.')).toBeInTheDocument();
  await selectTypeAndName('Hôtel des Cimes');
  expect(create).toBeEnabled();
});

it('shows a concise taxonomy preview only from the info affordance', async () => {
  mockListTaxonomyReferences.mockResolvedValueOnce(MOCK_TAXONOMIES);
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);

  await waitFor(() => expect(mockListTaxonomyReferences).toHaveBeenCalledTimes(1));
  const radios = screen.getAllByRole('radio');
  // §201 — les 5 types d'hébergement ne sont plus des tuiles : ils passent par le
  // parcours guidé. Les 13 autres gardent exactement leur tuile.
  expect(radios).toHaveLength(Object.keys(TYPE_ARCHETYPES).length - ACCOMMODATION_TYPE_CODES.length);
  for (const radio of radios) {
    expect(radio).not.toHaveAttribute('aria-describedby');
  }

  const res = screen.getByRole('radio', { name: /^Restaurant$/i });
  fireEvent.mouseEnter(res.closest('div') as HTMLDivElement);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  const info = screen.getByRole('button', { name: /sous-catégories pour restaurant/i });
  fireEvent.mouseEnter(info);

  const tooltip = await screen.findByRole('tooltip');
  expect(info).toHaveAttribute('aria-describedby', 'create-type-RES-tooltip');
  expect(tooltip).toHaveTextContent('RES — sous-catégorie');
  expect(tooltip).toHaveTextContent(/^1 sous-catégorie disponibleEx\./);
  expect(tooltip).toHaveClass('w-72');
  expect(tooltip).toHaveClass('fixed', 'z-[1000]');
  expect(screen.getByRole('dialog')).not.toContainElement(tooltip);

  fireEvent.mouseLeave(info);
  fireEvent.focus(info);
  fireEvent.click(info);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
});

it('calls createObject with the chosen type+name and forwards the new id', async () => {
  mockCreateObject.mockResolvedValue('RESRUN0000000001');
  const onCreated = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
  await selectTypeAndName('Le Longanis');
  fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('RESRUN0000000001'));
  expect(mockCreateObject).toHaveBeenCalledWith({ type: 'RES', name: 'Le Longanis', city: 'Entre-Deux', postcode: '97414' });
  // Parcours non hébergement : aucune taxonomie n'est posée à la création.
  expect(mockAssignObjectTaxonomy).not.toHaveBeenCalled();
});

it('surfaces a backend error and stays open (no onCreated)', async () => {
  mockCreateObject.mockRejectedValue(new Error('Pas la permission de créer'));
  const onCreated = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
  await selectTypeAndName('X');
  fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/permission de créer/i);
  expect(onCreated).not.toHaveBeenCalled();
});

it('warns about existing fiches with a close name and opens one on click', () => {
  mockUseObjectSearch.mockReturnValue({
    results: [
      {
        id: 'LOIRUN0000000001',
        name: 'La Cité du Volcan',
        type: 'LOI',
        status: 'published',
        city: 'Le Tampon',
        code: 'LOIRUN0000000001',
        card: { id: 'LOIRUN0000000001', type: 'LOI', name: 'La Cité du Volcan' },
      },
    ],
    loading: false,
  });
  const onOpenExisting = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} onOpenExisting={onOpenExisting} />);
  fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'La Cité du Volcan' } });

  expect(screen.getByText(/au nom proche/i)).toBeInTheDocument();
  expect(screen.getByText(/identique/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /La Cité du Volcan/i }));
  expect(onOpenExisting).toHaveBeenCalledWith('LOIRUN0000000001');
});

describe("§201 — création guidée d'un hébergement", () => {
  it('affiche directement les cinq familles, sans bouton intermédiaire Hébergement', async () => {
    await openGuidedAccommodation();

    for (const family of ['Hôtellerie', 'Hébergement locatif', 'Hébergement collectif', 'Campings et terrains', 'Aires et haltes de plein air']) {
      expect(screen.getByRole('button', { name: family })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Hébergement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /famille d'hébergement/i })).not.toBeInTheDocument();
  });

  it('propose une aide explicite pour les deux familles de plein air sans les sélectionner', async () => {
    await openGuidedAccommodation();

    const campingHelp = screen.getByRole('button', { name: 'Comprendre la famille Campings et terrains' });
    fireEvent.click(campingHelp);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/terrains organisés pour le camping/i);
    expect(screen.queryByRole('group', { name: /choix dans/i })).not.toBeInTheDocument();

    fireEvent.blur(campingHelp);
    fireEvent.click(screen.getByRole('button', { name: 'Comprendre la famille Aires et haltes de plein air' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/halte ou une nuitée/i);
  });

  it("explique précisément ce qu'est une Aire naturelle de camping", async () => {
    await chooseFamilyAndNature('Campings et terrains', 'Aire naturelle de camping');

    fireEvent.click(screen.getByRole('button', { name: 'Comprendre Aire naturelle de camping' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/terrain de camping aménagé/i);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/classée sans étoile/i);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/mobil-homes.*interdits/i);
  });

  it('calcule RVA pour Résidence de tourisme, sans jamais demander le code', async () => {
    await expectGuidedCreationType('Hébergement collectif', 'Résidence de tourisme', 'RVA');
  });

  it('reproduit la hiérarchie Hôtellerie › Hôtel › Hôtel-restaurant sans surtitre Nature', async () => {
    await chooseFamilyAndNature('Hôtellerie', 'Hôtel');

    expect(screen.getByRole('group', { name: 'Choix dans Hôtellerie' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hôtel-restaurant' })).toBeInTheDocument();
    expect(screen.queryByText(/Nature de l'établissement/i)).not.toBeInTheDocument();
  });

  it('calcule HLO pour Gîte sous Hébergement collectif', async () => {
    await expectGuidedCreationType('Hébergement collectif', 'Gîte', 'HLO');
  });

  it('calcule CAMP pour Camping', async () => {
    await expectGuidedCreationType('Campings et terrains', 'Camping', 'CAMP');
  });

  it('calcule HPA pour Aire naturelle de camping', async () => {
    await expectGuidedCreationType('Campings et terrains', 'Aire naturelle de camping', 'HPA');
  });

  it('calcule HPA pour Aire de bivouac', async () => {
    await expectGuidedCreationType('Aires et haltes de plein air', 'Aire de bivouac', 'HPA');
  });

  it('conserve le chemin parent pour Terrain déclaré puis Camping à la ferme', async () => {
    await chooseFamilyAndNature('Campings et terrains', 'Terrain de camping déclaré');
    fireEvent.click(screen.getByRole('button', { name: 'Camping à la ferme' }));

    expect(screen.getByRole('button', { name: 'Camping à la ferme' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("conserve le chemin parent pour Terrain déclaré puis Camping chez l'habitant", async () => {
    await chooseFamilyAndNature('Campings et terrains', 'Terrain de camping déclaré');
    fireEvent.click(screen.getByRole('button', { name: "Camping chez l'habitant" }));

    expect(screen.getByRole('button', { name: "Camping chez l'habitant" })).toHaveAttribute('aria-pressed', 'true');
  });

  it('n’affiche ni codes techniques ni descriptions internes dans le parcours', async () => {
    await chooseFamilyAndNature('Hébergement locatif', 'Meublé de tourisme');

    expect(screen.queryByText(/candidat à la fusion/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/arbitrage L3/i)).not.toBeInTheDocument();
    expect(screen.queryByText('(HLO)')).not.toBeInTheDocument();
  });

  it('crée la fiche avec le type calculé ET pose la nature choisie', async () => {
    mockCreateObject.mockResolvedValue('HPARUN0000000001');
    await chooseFamilyAndNature('Aires et haltes de plein air', 'Aire de bivouac');
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Bivouac du Piton' } });
    await fillLocation();
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));

    await waitFor(() => expect(mockCreateObject).toHaveBeenCalledWith({ type: 'HPA', name: 'Bivouac du Piton', city: 'Entre-Deux', postcode: '97414' }));
    // Sans cette écriture, la nature choisie par l'agent serait silencieusement
    // perdue : la nature se pose après la création atomique fiche/localisation.
    await waitFor(() => expect(mockAssignObjectTaxonomy).toHaveBeenCalledWith({
      objectId: 'HPARUN0000000001', domain: 'taxonomy_hpa', code: 'bivouac_area',
    }));
  });

  it("ne présente jamais un échec d'affectation comme un échec de création", async () => {
    mockCreateObject.mockResolvedValue('HPARUN0000000002');
    mockAssignObjectTaxonomy.mockRejectedValue(new Error('RLS'));
    const onCreated = jest.fn();

    mockListTaxonomyReferences.mockResolvedValueOnce(V2_TAXONOMIES);
    mockListAccommodationFamilies.mockResolvedValueOnce(ACCOMMODATION_FAMILIES);
    render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
    await waitFor(() => expect(mockListAccommodationFamilies).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Aires et haltes de plein air' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aire de bivouac' }));
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Bivouac du Piton' } });
    await fillLocation();
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));

    // La fiche EXISTE : re-proposer « créer » ferait fabriquer un doublon.
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('HPARUN0000000002'));
    expect(await screen.findByRole('status')).toHaveTextContent(/nature n'a pas pu être enregistrée/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('propose les treize types hors hébergement, et eux seuls, comme tuiles', async () => {
    mockListTaxonomyReferences.mockResolvedValueOnce(V2_TAXONOMIES);
    mockListAccommodationFamilies.mockResolvedValueOnce(ACCOMMODATION_FAMILIES);
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(mockListAccommodationFamilies).toHaveBeenCalledTimes(1));

    // Fixture des 18 codes : si un code hors hébergement disparaît ou bascule
    // dans le parcours guidé, ce test tombe.
    const allCodes = Object.keys(TYPE_ARCHETYPES);
    expect(allCodes).toHaveLength(18);
    expect(allCodes.filter((code) => !ACCOMMODATION_TYPE_CODES.includes(code))).toHaveLength(13);
    expect(ACCOMMODATION_TYPE_CODES).toEqual(['CAMP', 'HLO', 'HOT', 'HPA', 'RVA']);
    expect(screen.getAllByRole('radio')).toHaveLength(13);
  });

  it('un parcours non hébergement ne montre aucun panneau de natures', () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /^Itinéraire$/i }));

    expect(screen.queryByRole('group', { name: /choix dans/i })).not.toBeInTheDocument();
  });

  it("choisir un type hors hébergement quitte le parcours guidé — jamais d'état mixte", async () => {
    await chooseFamilyAndNature('Hébergement collectif', 'Gîte');
    expect(screen.getByRole('group', { name: /choix dans hébergement collectif/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /^Restaurant$/i }));
    expect(screen.queryByRole('group', { name: /choix dans/i })).not.toBeInTheDocument();

    mockCreateObject.mockResolvedValue('RESRUN0000000009');
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Chez Guilaine' } });
    await fillLocation();
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
    await waitFor(() => expect(mockCreateObject).toHaveBeenCalledWith({ type: 'RES', name: 'Chez Guilaine', city: 'Entre-Deux', postcode: '97414' }));
    expect(mockAssignObjectTaxonomy).not.toHaveBeenCalled();
  });

  it('annuler réinitialise le parcours guidé', async () => {
    const onClose = jest.fn();
    mockListTaxonomyReferences.mockResolvedValueOnce(V2_TAXONOMIES);
    mockListAccommodationFamilies.mockResolvedValueOnce(ACCOMMODATION_FAMILIES);
    render(<CreateObjectDialog open onClose={onClose} onCreated={() => {}} />);
    await waitFor(() => expect(mockListAccommodationFamilies).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Hébergement collectif' }));
    await screen.findByRole('group', { name: /choix dans hébergement collectif/i });

    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/ }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: /choix dans/i })).not.toBeInTheDocument();
  });

  it('garde la détection de doublons active pendant le parcours guidé', async () => {
    mockUseObjectSearch.mockReturnValue({
      results: [{
        id: 'HLORUN0000000001', name: 'Gîte Hydrangea 974', type: 'HLO', status: 'published',
        city: 'Le Tampon', code: 'HLORUN0000000001',
        card: { id: 'HLORUN0000000001', type: 'HLO', name: 'Gîte Hydrangea 974' },
      }],
      loading: false,
    });
    await chooseFamilyAndNature('Hébergement collectif', 'Gîte');
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Gîte Hydrangea 974' } });

    expect(screen.getByText(/au nom proche/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// Chantier 2026-08-28 n°4, lot B — validation PAR CHAMP.
// `validation.errors` n'était jamais lu : les trois messages français de
// `create-object-options.ts` étaient du CODE MORT, et l'agent voyait un bouton grisé sans
// savoir quel champ manquait. C'est le gain le plus direct du chantier : les messages
// existaient déjà, il manquait leur rendu.
// ---------------------------------------------------------------------------------------
describe('CreateObjectDialog — validation par champ (chantier 2026-08-28)', () => {
  it('ne reproche RIEN sur un formulaire vierge', () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByText('Le nom est obligatoire.')).not.toBeInTheDocument();
    expect(screen.queryByText('Choisissez un type de fiche.')).not.toBeInTheDocument();
  });

  it('dit QUEL champ manque une fois le champ Nom quitté', () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    const input = screen.getByLabelText(/nom de la fiche/i);
    fireEvent.blur(input);
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    // Le contrôle lui-même est marqué invalide et relié à son message (contrat de Field).
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'create-object-name-error');
  });

  it('signale le type manquant seulement une fois le nom saisi (étape 2, pas avant)', () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByText('Choisissez un type de fiche.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Hôtel des Cimes' } });
    expect(screen.getByText('Choisissez un type de fiche.')).toBeInTheDocument();
  });

  it('les deux reproches disparaissent quand la saisie devient valide', async () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.blur(screen.getByLabelText(/nom de la fiche/i));
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    await selectTypeAndName('Hôtel des Cimes');
    expect(screen.queryByText('Le nom est obligatoire.')).not.toBeInTheDocument();
    expect(screen.queryByText('Choisissez un type de fiche.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nom de la fiche/i)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('button', { name: /créer la fiche/i })).toBeEnabled();
  });
});

describe('CreateObjectDialog — commune et code postal', () => {
  it('proposes the commune from its postal mapping and never asks for an INSEE code', async () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    await fillLocation('97418');
    expect(screen.getByLabelText(/^Commune$/)).toHaveValue('97422');
    expect(screen.queryByLabelText(/insee/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Code postal$/)).toHaveAttribute('required');
    expect(screen.getByLabelText(/^Code postal$/)).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText(/^Code postal$/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/^Commune$/)).toHaveAttribute('required');
  });

  it('requires an explicit commune choice for a shared postcode and clears an incompatible old choice', async () => {
    mockCreateObject.mockResolvedValue('RESRUN0000000100');
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    await selectTypeAndName('Localisation partagée');
    fireEvent.change(screen.getByLabelText(/^Code postal$/), { target: { value: '99998' } });
    // A previous matching choice stays valid; an empty new shared postcode never picks arbitrarily.
    fireEvent.change(screen.getByLabelText(/^Commune$/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
    expect(mockCreateObject).not.toHaveBeenCalled();
    expect(screen.getByText('Choisissez une commune correspondant au code postal.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Commune$/)).toHaveFocus());
    fireEvent.change(screen.getByLabelText(/^Commune$/), { target: { value: '97422' } });
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
    await waitFor(() => expect(mockCreateObject).toHaveBeenCalledWith({
      type: 'RES', name: 'Localisation partagée', city: 'Le Tampon', postcode: '99998',
    }));
  });

  it('rejects an unknown postal code and focuses the field without calling creation', async () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    await selectTypeAndName('Commune inconnue');
    fireEvent.change(screen.getByLabelText(/^Code postal$/), { target: { value: '12345' } });
    expect(screen.queryByText('Aucune commune disponible pour ce code postal.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
    expect(mockCreateObject).not.toHaveBeenCalled();
    expect(screen.getByText('Aucune commune disponible pour ce code postal.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Code postal$/)).toHaveFocus());
    fireEvent.change(screen.getByLabelText(/^Code postal$/), { target: { value: '97430' } });
    await waitFor(() => expect(screen.getByLabelText(/^Commune$/)).toHaveValue('97422'));
    expect(screen.queryByText('Aucune commune disponible pour ce code postal.')).not.toBeInTheDocument();
  });

  it('allows retry after a reference failure and retains the entered name and postcode', async () => {
    mockListCreationCommunes.mockRejectedValueOnce(new Error('Unavailable'));
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Conserver ma saisie' } });
    fireEvent.change(screen.getByLabelText(/^Code postal$/), { target: { value: '97414' } });
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByLabelText(/^Commune$/)).toHaveValue('97403'));
    expect(screen.getByLabelText(/nom de la fiche/i)).toHaveValue('Conserver ma saisie');
    expect(screen.getByLabelText(/^Code postal$/)).toHaveValue('97414');
    expect(mockListCreationCommunes).toHaveBeenCalledTimes(2);
  });

  it('resets name, postcode, commune and validation when cancelling', async () => {
    const onClose = jest.fn();
    render(<CreateObjectDialog open onClose={onClose} onCreated={() => {}} />);
    await selectTypeAndName('À annuler');
    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/nom de la fiche/i)).toHaveValue('');
    expect(screen.getByLabelText(/^Code postal$/)).toHaveValue('');
    expect(screen.getByLabelText(/^Commune$/)).toHaveValue('');
    expect(screen.queryByText('Le code postal est obligatoire.')).not.toBeInTheDocument();
  });
});

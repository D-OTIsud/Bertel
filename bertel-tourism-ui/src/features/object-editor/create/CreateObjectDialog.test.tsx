import type { ObjectSearchResult } from '../useObjectSearch';

jest.mock('../../../services/rpc', () => ({ createObject: jest.fn(), assignObjectTaxonomy: jest.fn() }));

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

// §201 — le parcours hébergement remplace les 5 tuiles techniques par une entrée
// « Hébergement » guidée. Ce catalogue reproduit l'arbre cible.
const ACCOMMODATION_FAMILIES: ExplorerAccommodationFamily[] = [
  { code: 'collectif', name: 'Hébergement collectif', description: 'Accueil de groupes.', position: 3 },
  { code: 'campings_terrains', name: 'Campings et terrains', description: 'Terrains organisés pour le camping.', position: 4 },
  { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air', description: 'Halte ou nuitée sans terrain de camping.', position: 5 },
];

const V2_TAXONOMIES: ExplorerTaxonomyDomain[] = [
  {
    domain: 'taxonomy_hlo', name: 'HLO', objectType: 'HLO',
    nodes: [
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
  // Most dialog tests do not concern the catalogue. Keeping the request pending
  // avoids unrelated async state updates after their assertions/unmount.
  mockListTaxonomyReferences.mockImplementation(() => new Promise(() => {}));
  mockListAccommodationFamilies.mockImplementation(() => new Promise(() => {}));
});

/** Parcours NON hébergement : inchangé — une tuile de type, puis le nom. */
function selectTypeAndName(name: string) {
  fireEvent.click(screen.getByRole('radio', { name: /^Restaurant$/i }));
  fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: name } });
}

/** Ouvre le parcours guidé avec le catalogue v2 résolu. */
async function openGuidedAccommodation() {
  mockListTaxonomyReferences.mockResolvedValueOnce(V2_TAXONOMIES);
  mockListAccommodationFamilies.mockResolvedValueOnce(ACCOMMODATION_FAMILIES);
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  await waitFor(() => expect(mockListAccommodationFamilies).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: /^Hébergement$/ }));
  return screen.findByLabelText(/famille d'hébergement/i);
}

async function chooseFamilyAndNature(family: string, nature: string) {
  const select = await openGuidedAccommodation();
  fireEvent.change(select, { target: { value: family } });
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${nature}`) }));
}

it('disables create until a type and a non-empty name are chosen', () => {
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  const create = screen.getByRole('button', { name: /créer la fiche/i });
  expect(create).toBeDisabled();
  selectTypeAndName('Hôtel des Cimes');
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
  selectTypeAndName('Le Longanis');
  fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('RESRUN0000000001'));
  expect(mockCreateObject).toHaveBeenCalledWith({ type: 'RES', name: 'Le Longanis' });
  // Parcours non hébergement : aucune taxonomie n'est posée à la création.
  expect(mockAssignObjectTaxonomy).not.toHaveBeenCalled();
});

it('surfaces a backend error and stays open (no onCreated)', async () => {
  mockCreateObject.mockRejectedValue(new Error('Pas la permission de créer'));
  const onCreated = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
  selectTypeAndName('X');
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
  it('calcule RVA pour Résidence de tourisme, sans jamais demander le code', async () => {
    await chooseFamilyAndNature('collectif', 'Résidence de tourisme');
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(RVA)');
  });

  it('calcule HLO pour Gîte sous Hébergement collectif', async () => {
    await chooseFamilyAndNature('collectif', 'Gîte');
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(HLO)');
  });

  it('calcule CAMP pour Camping', async () => {
    await chooseFamilyAndNature('campings_terrains', 'Camping Le classement');
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(CAMP)');
  });

  it('calcule HPA pour Aire naturelle de camping', async () => {
    await chooseFamilyAndNature('campings_terrains', 'Aire naturelle de camping');
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(HPA)');
  });

  it('calcule HPA pour Aire de bivouac', async () => {
    await chooseFamilyAndNature('aires_haltes_plein_air', 'Aire de bivouac');
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(HPA)');
  });

  it('conserve le chemin parent pour Terrain déclaré puis Camping à la ferme', async () => {
    await chooseFamilyAndNature('campings_terrains', 'Terrain de camping déclaré');
    fireEvent.click(screen.getByRole('button', { name: /^Camping à la ferme/ }));

    expect(screen.getByText('Campings et terrains › Terrain de camping déclaré › Camping à la ferme')).toBeInTheDocument();
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(HPA)');
  });

  it("conserve le chemin parent pour Terrain déclaré puis Camping chez l'habitant", async () => {
    await chooseFamilyAndNature('campings_terrains', 'Terrain de camping déclaré');
    fireEvent.click(screen.getByRole('button', { name: /^Camping chez l'habitant/ }));

    expect(screen.getByText("Campings et terrains › Terrain de camping déclaré › Camping chez l'habitant")).toBeInTheDocument();
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(HPA)');
  });

  it('affiche le type calculé en lecture seule — aucun contrôle pour le changer', async () => {
    await chooseFamilyAndNature('collectif', 'Gîte');
    const readout = screen.getByTestId('computed-technical-type');

    expect(readout.tagName).toBe('SPAN');
    expect(readout.closest('button')).toBeNull();
    expect(readout.closest('label')).toBeNull();
  });

  it('crée la fiche avec le type calculé ET pose la nature choisie', async () => {
    mockCreateObject.mockResolvedValue('HPARUN0000000001');
    await chooseFamilyAndNature('aires_haltes_plein_air', 'Aire de bivouac');
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Bivouac du Piton' } });
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));

    await waitFor(() => expect(mockCreateObject).toHaveBeenCalledWith({ type: 'HPA', name: 'Bivouac du Piton' }));
    // Sans cette écriture, la nature choisie par l'agent serait silencieusement
    // perdue : rpc_create_object ne prend que type/nom/région.
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
    fireEvent.click(screen.getByRole('button', { name: /^Hébergement$/ }));
    fireEvent.change(await screen.findByLabelText(/famille d'hébergement/i), { target: { value: 'aires_haltes_plein_air' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Aire de bivouac/ }));
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Bivouac du Piton' } });
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

  it('un parcours non hébergement ne montre aucune étape Famille', () => {
    render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /^Itinéraire$/i }));

    expect(screen.queryByLabelText(/famille d'hébergement/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('computed-technical-type')).not.toBeInTheDocument();
  });

  it("choisir un type hors hébergement quitte le parcours guidé — jamais d'état mixte", async () => {
    await chooseFamilyAndNature('collectif', 'Gîte');
    expect(screen.getByTestId('computed-technical-type')).toHaveTextContent('(HLO)');

    fireEvent.click(screen.getByRole('radio', { name: /^Restaurant$/i }));
    expect(screen.queryByLabelText(/famille d'hébergement/i)).not.toBeInTheDocument();

    mockCreateObject.mockResolvedValue('RESRUN0000000009');
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Chez Guilaine' } });
    fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
    await waitFor(() => expect(mockCreateObject).toHaveBeenCalledWith({ type: 'RES', name: 'Chez Guilaine' }));
    expect(mockAssignObjectTaxonomy).not.toHaveBeenCalled();
  });

  it('annuler réinitialise le parcours guidé', async () => {
    const onClose = jest.fn();
    mockListTaxonomyReferences.mockResolvedValueOnce(V2_TAXONOMIES);
    mockListAccommodationFamilies.mockResolvedValueOnce(ACCOMMODATION_FAMILIES);
    render(<CreateObjectDialog open onClose={onClose} onCreated={() => {}} />);
    await waitFor(() => expect(mockListAccommodationFamilies).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Hébergement$/ }));
    await screen.findByLabelText(/famille d'hébergement/i);

    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/ }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByLabelText(/famille d'hébergement/i)).not.toBeInTheDocument();
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
    await chooseFamilyAndNature('collectif', 'Gîte');
    fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'Gîte Hydrangea 974' } });

    expect(screen.getByText(/au nom proche/i)).toBeInTheDocument();
  });
});

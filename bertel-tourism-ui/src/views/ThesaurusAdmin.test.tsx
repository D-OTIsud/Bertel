import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getThesaurusDomainLabel } from '@/lib/thesaurus-domain-labels';
import { ThesaurusAdmin } from './ThesaurusAdmin';
import { ThesaurusConceptEditor } from '../features/settings/ThesaurusConceptEditor';
import * as service from '../services/thesaurus-admin';
import type { ThesaurusConcept, ThesaurusRevision, ThesaurusWorkspace } from '../types/thesaurus-admin';

jest.mock('../services/thesaurus-admin', () => ({
  ...jest.requireActual('../services/thesaurus-admin'),
  fetchThesaurusWorkspace: jest.fn(), saveThesaurusDraft: jest.fn(), validateThesaurusDraft: jest.fn(),
  previewThesaurusPublication: jest.fn(), publishThesaurus: jest.fn(),
  configureThesaurusInstance: jest.fn(), configureThesaurusDomain: jest.fn(), bootstrapThesaurus: jest.fn(), retryThesaurusOutbox: jest.fn(),
  rebaseThesaurusDraft: jest.fn(), discardThesaurusDraft: jest.fn(),
  analyseThesaurusImport: jest.fn(), importThesaurusCorrections: jest.fn(), validateThesaurusImport: jest.fn(),
}));
const mock = jest.mocked(service);
const concept = (overrides: Partial<ThesaurusConcept> = {}): ThesaurusConcept => ({
  ...service.normalizeThesaurusDocument({ code: 'appartement', name: 'Appartement', description: 'Logement indépendant dans un immeuble.' }),
  concept_id: 'concept-1', domain: 'taxonomy_hlo', assignable: true,
  source_key: { id: 'source-1', domain: 'taxonomy_hlo' }, source_fingerprint: 'source-fp', usage_count: 12,
  ...overrides,
});
const revision = (overrides: Partial<ThesaurusRevision> = {}): ThesaurusRevision => ({
  revision_id: 'revision-1', concept_id: 'concept-1', domain: 'taxonomy_hlo', version: 2,
  status: 'draft', document: service.normalizeThesaurusDocument(concept()), errors: [], warnings: [],
  ...overrides,
});
function workspace(overrides: Partial<ThesaurusWorkspace> = {}): ThesaurusWorkspace {
  return {
    domains: [{ domain: 'taxonomy_hlo', name: getThesaurusDomainLabel('taxonomy_hlo'), is_governed: true, is_public: true, require_definition: true, concept_count: 2 }],
    concepts: [concept(), concept({ concept_id: 'concept-2', name: 'Studio', code: 'studio' })],
    revisions: [], releases: [{ release_id: 7, previous_release_id: 6, changed_count: 2, affected_objects: 12, created_at: '2026-11-06T10:00:00Z' }],
    latest_release_id: 7, stats: { total_concepts: 2, matching_concepts: 2, retired_usages: 0 },
    outbox: [], requalification: [], instance: { base_uri: 'https://bertel.example/api/public/thesaurus/concepts/', license: 'Licence retenue', attribution: 'OTI du Sud' },
    ...overrides,
  };
}
function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ThesaurusAdmin /></QueryClientProvider>);
}

function workspaceWithTechnicalDomainNames(isGoverned = true): ThesaurusWorkspace {
  return workspace({
    domains: [
      { domain: 'taxonomy_com', name: 'Taxonomie COM' },
      { domain: 'package_type', name: 'package_type' },
      { domain: 'menu_category', name: 'menu_category' },
    ].map((item) => ({ ...item, is_governed: isGoverned, is_public: true, require_definition: false, concept_count: 2 })),
    concepts: [
      concept({ domain: 'taxonomy_com', name: 'Marché couvert', code: 'marche_couvert' }),
      concept({ concept_id: 'commerce-2', domain: 'taxonomy_com', name: 'Boutique artisanale', code: 'boutique_artisanale' }),
      concept({ concept_id: 'package-1', domain: 'package_type', name: 'Forfait séjour', code: 'forfait_sejour' }),
      concept({ concept_id: 'menu-1', domain: 'menu_category', name: 'Menu enfant', code: 'menu_enfant' }),
    ],
    revisions: [revision({ domain: 'taxonomy_com', document: service.normalizeThesaurusDocument({ code: 'marche_couvert', name: 'Marché couvert', description: 'Marché de commerces organisé dans un bâtiment couvert.' }) })],
  });
}

describe('ThesaurusAdmin editorial workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace());
    mock.saveThesaurusDraft.mockResolvedValue(revision());
    mock.validateThesaurusDraft.mockResolvedValue(revision({ status: 'validated' }));
    mock.previewThesaurusPublication.mockResolvedValue({ errors: [], warnings: [], changed_count: 1, affected_objects: 12, changes: [], preview_fingerprint: 'preview-fp' });
    mock.publishThesaurus.mockResolvedValue({ release_id: 8, previous_release_id: 7, changed_count: 1, affected_objects: 12, created_at: '' });
    mock.configureThesaurusInstance.mockResolvedValue(undefined);
    mock.configureThesaurusDomain.mockResolvedValue(undefined);
    mock.bootstrapThesaurus.mockResolvedValue(undefined);
    mock.retryThesaurusOutbox.mockResolvedValue(undefined);
    mock.rebaseThesaurusDraft.mockResolvedValue(revision({ version: 3 }));
    mock.discardThesaurusDraft.mockResolvedValue(undefined);
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => '00000000-0000-4000-8000-000000000001' });
  });

  it('opens a fresh import after a completed lot without reloading the page', async () => {
    const proposal = { domain: 'taxonomy_hlo', context_key: '', code: 'appartement', base: { description: 'Ancienne' }, changes: { description: 'Logement indépendant proposé à la location.' } };
    const firstBatch = { format_version: 1, batch_id: 'premier-lot', proposals: [proposal] };
    const analysis = { batch_id: firstBatch.batch_id, results: [{ proposal, status: 'ready' as const, concept_id: 'concept-1', name: 'Appartement', source_fingerprint: 'a'.repeat(32) }] };
    mock.analyseThesaurusImport.mockResolvedValue(analysis);
    mock.importThesaurusCorrections.mockResolvedValue({ analysis, revisions: [revision()] });
    mock.validateThesaurusImport.mockResolvedValue({ revisions: [revision({ status: 'validated' })] });
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(screen.getByRole('button', { name: /^Publications/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Importer des corrections' }));
    fireEvent.change(screen.getByLabelText('Lot de corrections (JSON)'), { target: { value: JSON.stringify(firstBatch) } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le lot' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer les brouillons privés' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Créer les brouillons privés' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Valider les brouillons du lot' }));
    await waitFor(() => expect(mock.validateThesaurusImport).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revenir aux publications' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux publications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Importer des corrections' }));
    expect(screen.getByLabelText('Lot de corrections (JSON)')).toBeEnabled();
    expect(screen.getByLabelText('Lot de corrections (JSON)')).toHaveValue('');
    expect(screen.queryByText('Lot premier-lot')).not.toBeInTheDocument();
    const secondBatch = { ...firstBatch, batch_id: 'deuxieme-lot' };
    mock.analyseThesaurusImport.mockResolvedValue({ ...analysis, batch_id: secondBatch.batch_id });
    fireEvent.change(screen.getByLabelText('Lot de corrections (JSON)'), { target: { value: JSON.stringify(secondBatch) } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le lot' }));
    await screen.findByText('Lot deuxieme-lot');
    expect(mock.analyseThesaurusImport).toHaveBeenLastCalledWith(secondBatch);
    expect(mock.importThesaurusCorrections).toHaveBeenCalledTimes(1);
  });

  it('uses business domain names in navigation, editor, publication and configuration even when the API returns technical names', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspaceWithTechnicalDomainNames());
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    const domainSelect = screen.getByRole('combobox', { name: 'Domaine du thésaurus' });
    expect(within(domainSelect).getByRole('option', { name: 'Commerces' })).toHaveValue('taxonomy_com');
    expect(within(domainSelect).getByRole('option', { name: 'Types de forfait' })).toHaveValue('package_type');
    expect(within(domainSelect).getByRole('option', { name: 'Catégories de menu' })).toHaveValue('menu_category');
    expect(screen.getByText('Commerces · 12 fiches')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Taxonomie|taxonomy_|package_type|menu_category/);

    fireEvent.click(screen.getByRole('button', { name: /^Publications/ }));
    expect(screen.getByText('Commerces · Révision 2')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Taxonomie|taxonomy_|package_type|menu_category/);

    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    for (const label of ['Commerces', 'Types de forfait', 'Catégories de menu']) {
      expect(screen.getByText(label, { selector: 'strong' })).toBeInTheDocument();
    }
    expect(document.body).not.toHaveTextContent(/Taxonomie|taxonomy_|package_type|menu_category/);
    const commerceRule = screen.getByText('Commerces', { selector: 'strong' }).closest('.thesaurus__domain-policy');
    if (!(commerceRule instanceof HTMLElement)) throw new Error('Règle du domaine Commerces introuvable.');
    expect(within(commerceRule).getByRole('checkbox', { name: 'Définition obligatoire' })).toBeChecked();
    expect(within(commerceRule).getByRole('checkbox', { name: 'Définition obligatoire' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer la règle' })).not.toBeInTheDocument();
    expect(mock.configureThesaurusDomain).not.toHaveBeenCalled();
  });

  it('shows business labels during source activation and still sends the unchanged domain identifiers', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspaceWithTechnicalDomainNames(false));
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Commerces/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Types de forfait/ }));
    expect(screen.getByRole('checkbox', { name: /Catégories de menu/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’activation de 2 domaines' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activer ces domaines dans le thésaurus ?' });
    expect(within(dialog).getByText('Commerces · 2 concepts ; Types de forfait · 2 concepts')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Taxonomie|taxonomy_|package_type|menu_category/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activer les domaines sélectionnés' }));
    await waitFor(() => expect(mock.bootstrapThesaurus).toHaveBeenCalledWith(['taxonomy_com', 'package_type']));
  });

  it('names domains in semantic relation choices when no lookup catalogue has been loaded', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspaceWithTechnicalDomainNames());
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(screen.getByText(/Hiérarchie et relations/));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    fireEvent.focus(screen.getByLabelText('Concept lié 1'));
    expect(screen.getByRole('button', { name: /Boutique artisanale Commerces/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forfait séjour Types de forfait/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Menu enfant Catégories de menu/ }));
    expect(document.body).not.toHaveTextContent(/Taxonomie|taxonomy_|package_type|menu_category/);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(mock.saveThesaurusDraft).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'taxonomy_com', concept_id: 'concept-1',
      document: expect.objectContaining({ relations: [{ type: 'related', target_id: 'menu-1' }] }),
    })));
  });

  it('saves a complete draft without changing the published concept or its stable code', async () => {
    renderAdmin();
    const name = await screen.findByLabelText('Libellé préféré (fr)');
    expect(screen.getByLabelText('Code stable')).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Appartement indépendant' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un terme' }));
    fireEvent.change(screen.getByLabelText('Terme 1'), { target: { value: 'Appart' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(mock.saveThesaurusDraft).toHaveBeenCalledWith(expect.objectContaining({
      concept_id: 'concept-1', domain: 'taxonomy_hlo', expected_version: 0,
      document: expect.objectContaining({ code: 'appartement', name: 'Appartement indépendant', labels: [{ lang: 'fr', kind: 'alt', value: 'Appart' }] }),
    })));
    expect(await screen.findByText(/version publiée reste inchangée/)).toBeInTheDocument();
    expect(mock.publishThesaurus).not.toHaveBeenCalled();
  });

  it('keeps the current published document available read-only alongside an edited draft', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace({ concepts: [concept({ revision: revision({ document: service.normalizeThesaurusDocument({ code: 'appartement', name: 'Appartement proposé', description: 'Définition proposée.' }) }) })] }));
    renderAdmin();
    expect(await screen.findByLabelText('Libellé préféré (fr)')).toHaveValue('Appartement proposé');
    const details = screen.getByText('Version publiée actuelle · lecture seule').closest('details')!;
    fireEvent.click(within(details).getByText('Version publiée actuelle · lecture seule'));
    expect(within(details).getByRole('cell', { name: 'Appartement' })).toBeInTheDocument();
    expect(within(details).getByRole('cell', { name: 'Logement indépendant dans un immeuble.' })).toBeInTheDocument();
    expect(within(details).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not present an uncomputed usage count as zero', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace({ concepts: [concept({ usage_count: undefined })] }));
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    expect(screen.getByText(/Impact calculé dans la prévisualisation/)).toBeInTheDocument();
    expect(screen.queryByText(/· 0 fiche/)).not.toBeInTheDocument();
  });

  it('keeps the typed value after a version conflict and exposes an explicit reload', async () => {
    mock.saveThesaurusDraft.mockRejectedValue(new Error('PT409 REVISION_CONFLICT'));
    renderAdmin();
    const input = await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.change(input, { target: { value: 'Ma modification locale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByText(/Votre saisie est conservée/)).toBeInTheDocument();
    expect(input).toHaveValue('Ma modification locale');
    expect(screen.getByRole('button', { name: 'Recharger la version courante' })).toBeInTheDocument();
  });

  it('recovers a newly saved draft after leaving the editor and locks its assigned stable code', async () => {
    const created = revision({ concept_id: 'concept-new', document: service.normalizeThesaurusDocument({ code: 'nouveau', name: 'Nouveau logement', description: 'Logement disposant d’un espace de vie indépendant.' }) });
    mock.saveThesaurusDraft.mockResolvedValue(created);
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau concept' }));
    fireEvent.change(screen.getByLabelText('Code stable'), { target: { value: 'nouveau' } });
    fireEvent.change(screen.getByLabelText('Libellé préféré (fr)'), { target: { value: 'Nouveau logement' } });
    fireEvent.change(screen.getByLabelText('Définition (fr)'), { target: { value: 'Logement disposant d’un espace de vie indépendant.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await screen.findByText(/Brouillon enregistré/);
    await waitFor(() => expect(screen.queryByText('Modifications non enregistrées')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Code stable')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Publications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Concepts' }));
    expect(screen.getByLabelText('Libellé préféré (fr)')).toHaveValue('Nouveau logement');
    expect(screen.getByLabelText('Code stable')).toHaveValue('nouveau');
    expect(screen.getByLabelText('Code stable')).toBeDisabled();
  });

  it('submits the saved version for validation and presents server quality errors', async () => {
    mock.validateThesaurusDraft.mockResolvedValue(revision({ errors: [{ code: 'definition', message: 'La définition doit préciser le sens du terme.' }] }));
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre à validation' }));
    await waitFor(() => expect(mock.validateThesaurusDraft).toHaveBeenCalledWith('revision-1', 2));
    expect(await screen.findByText('La définition doit préciser le sens du terme.')).toBeInTheDocument();
    expect(screen.queryByText('Brouillon validé. Vous pouvez préparer sa publication.')).not.toBeInTheDocument();
  });

  it('confirms before abandoning local changes and leaves them intact on cancel', async () => {
    renderAdmin();
    const input = await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.change(input, { target: { value: 'À conserver' } });
    await waitFor(() => expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Studio studio/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Quitter les modifications ?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(input).toHaveValue('À conserver');
    expect(mock.saveThesaurusDraft).not.toHaveBeenCalled();
  });

  it('previews selected validated revisions, compares changes and publishes the exact reviewed version', async () => {
    const validated = revision({ status: 'validated', version: 4, document: { ...service.normalizeThesaurusDocument(concept()), name: 'Appartement indépendant' } });
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace({ revisions: [validated] }));
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(await screen.findByRole('button', { name: /Publications/ }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser la publication' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vérifier la publication du thésaurus' });
    expect(mock.previewThesaurusPublication).toHaveBeenCalledWith(['revision-1'], { 'revision-1': 4 });
    expect(within(dialog).getByRole('cell', { name: 'Appartement indépendant' })).toBeInTheDocument();
    expect(within(dialog).getByText('Appartement')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publier cette version' }));
    await waitFor(() => expect(mock.publishThesaurus).toHaveBeenCalledWith({
      revision_ids: ['revision-1'], expected_revision_versions: { 'revision-1': 4 }, expected_release_id: 7,
      idempotency_key: '00000000-0000-4000-8000-000000000001', preview_fingerprint: 'preview-fp',
    }));
    expect(await screen.findByText(/Publication 8 disponible/)).toBeInTheDocument();
  });

  it('never enables publication when preview reports an integrity failure', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace({ revisions: [revision({ status: 'validated' })] }));
    mock.previewThesaurusPublication.mockResolvedValue({ errors: [{ code: 'cycle', message: 'Cycle dans les relations.' }], warnings: [], changed_count: 1, affected_objects: 12, changes: [] });
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(await screen.findByRole('button', { name: /Publications/ }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser la publication' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vérifier la publication du thésaurus' });
    expect(within(dialog).getByText('Cycle dans les relations.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Publier cette version' })).toBeDisabled();
    expect(mock.publishThesaurus).not.toHaveBeenCalled();
  });

  it('does not bootstrap on load and activates only selected source domains after confirmation', async () => {
    const base = workspace();
    mock.fetchThesaurusWorkspace.mockResolvedValue({ ...base, domains: base.domains.map((item) => ({ ...item, is_governed: false })) });
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    expect(screen.queryByRole('link', { name: 'Guide métier du thésaurus (nouvel onglet)' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Configuration' }));
    const guide = screen.getByRole('link', { name: 'Guide métier du thésaurus (nouvel onglet)' });
    expect(guide).toHaveAttribute('href', 'https://doc.bertel.otisud.re/thesaurus.html');
    expect(guide).toHaveAttribute('target', '_blank');
    expect(guide).toHaveAttribute('rel', 'noopener noreferrer');
    expect(mock.bootstrapThesaurus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(getThesaurusDomainLabel('taxonomy_hlo')) }));
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’activation de 1 domaine' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activer ces domaines dans le thésaurus ?' });
    expect(mock.bootstrapThesaurus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activer les domaines sélectionnés' }));
    await waitFor(() => expect(mock.bootstrapThesaurus).toHaveBeenCalledWith(['taxonomy_hlo']));
  });

  it('shows retired usages and links directly to explicit requalification in the object editor', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace({ requalification: [{ object_id: 'HLO 1', object_name: 'La kaz', concept_id: 'concept-1', concept_name: 'Ancien gîte', domain: 'taxonomy_hlo', lifecycle: 'retired', reason: 'Scission à examiner' }] }));
    renderAdmin();
    await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.click(await screen.findByRole('button', { name: /Fiches à reprendre/ }));
    expect(screen.getByText('La kaz')).toBeInTheDocument();
    expect(screen.getByText('Scission à examiner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche' })).toHaveAttribute('href', '/objects/HLO%201/edit');
  });

  it('creates a classification value with its typed scheme identity rather than an unqualified code', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scheme = concept({ concept_id: 'scheme-concept', domain: 'classification_scheme', code: 'hotel_stars', name: 'Étoiles hôtelières', source_key: { id: 'scheme-source' } });
    render(<QueryClientProvider client={client}><ThesaurusConceptEditor concept={null} initialRevision={null} domain={{ domain: 'classification_value', name: 'Valeurs de classement', source_kind: 'classification_value', is_governed: true, is_public: true, require_definition: false, concept_count: 0 }} concepts={[scheme]} onSaved={jest.fn()} onDirtyChange={jest.fn()} onReload={jest.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('Code stable'), { target: { value: '4_stars' } });
    fireEvent.change(screen.getByLabelText('Libellé préféré (fr)'), { target: { value: 'Quatre étoiles' } });
    fireEvent.change(screen.getByLabelText('Définition (fr)'), { target: { value: 'Niveau quatre étoiles du classement hôtelier choisi.' } });
    fireEvent.focus(screen.getByLabelText('Schéma ou valeur de classement parent'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Étoiles hôtelières ${getThesaurusDomainLabel('classification_scheme')}`) }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(mock.saveThesaurusDraft).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'classification_value', concept_id: null,
      document: expect.objectContaining({ code: '4_stars', parent_concept_id: 'scheme-concept', source_fields: expect.objectContaining({ scheme_id: 'scheme-source' }) }),
    })));
    expect(screen.queryByText('Dates de validité')).not.toBeInTheDocument();
  });

  it('rebases a stored draft while preserving non-overlapping unsaved input', async () => {
    const base = workspace();
    mock.fetchThesaurusWorkspace.mockResolvedValue({ ...base, revisions: [revision()] });
    mock.rebaseThesaurusDraft.mockResolvedValue(revision({ version: 3, document: { ...service.normalizeThesaurusDocument(concept()), name: 'Nom actualisé par la publication' } }));
    renderAdmin();
    const definition = await screen.findByLabelText('Définition (fr)');
    fireEvent.change(definition, { target: { value: 'Ma précision locale non enregistrée.' } });
    fireEvent.click(screen.getByText('Historique et reprise du brouillon'));
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre sur la publication courante' }));
    await waitFor(() => expect(mock.rebaseThesaurusDraft).toHaveBeenCalledWith('revision-1', 2));
    expect(await screen.findByDisplayValue('Nom actualisé par la publication')).toBeInTheDocument();
    expect(definition).toHaveValue('Ma précision locale non enregistrée.');
    expect(mock.validateThesaurusDraft).not.toHaveBeenCalled();
  });

  it('keeps all local fields after a refused overlapping rebase', async () => {
    mock.fetchThesaurusWorkspace.mockResolvedValue(workspace({ revisions: [revision()] }));
    mock.rebaseThesaurusDraft.mockRejectedValue(new Error('PT409 Overlapping source edits'));
    renderAdmin();
    const name = await screen.findByLabelText('Libellé préféré (fr)');
    fireEvent.change(name, { target: { value: 'Ma proposition à préserver' } });
    fireEvent.click(screen.getByText('Historique et reprise du brouillon'));
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre sur la publication courante' }));
    expect(await screen.findByText(/aucune fusion automatique n’a été appliquée/)).toBeInTheDocument();
    expect(name).toHaveValue('Ma proposition à préserver');
    expect(mock.saveThesaurusDraft).not.toHaveBeenCalled();
  });

  it('discards a draft only after an explicit confirmation and preserves published content', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const discarded = jest.fn();
    render(<QueryClientProvider client={client}><ThesaurusConceptEditor concept={concept()} initialRevision={revision()} domain={workspace().domains[0]} concepts={[concept()]} onSaved={jest.fn()} onDirtyChange={jest.fn()} onReload={jest.fn()} onDiscarded={discarded} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('Libellé préféré (fr)'), { target: { value: 'Brouillon abandonné' } });
    fireEvent.click(screen.getByText('Historique et reprise du brouillon'));
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner ce brouillon' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abandonner ce brouillon ?' });
    expect(mock.discardThesaurusDraft).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abandonner le brouillon' }));
    await waitFor(() => expect(mock.discardThesaurusDraft).toHaveBeenCalledWith('revision-1', 2));
    expect(discarded).toHaveBeenCalled();
    expect(screen.getByLabelText('Libellé préféré (fr)')).toHaveValue('Appartement');
  });
});


describe('mandatory business definitions in every edited language', () => {
  it('renders required missing languages, prevents their removal and blocks incomplete validation', async () => {
    jest.clearAllMocks();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ThesaurusConceptEditor concept={concept()} initialRevision={null} domain={{ domain: 'taxonomy_hlo', name: 'Hébergements locatifs', is_governed: true, is_public: true, require_definition: false, required_languages: ['fr', 'en', 'de'], concept_count: 1 }} concepts={[concept()]} onSaved={jest.fn()} onDirtyChange={jest.fn()} onReload={jest.fn()} /></QueryClientProvider>);
    for (const language of ['fr', 'en', 'de']) {
      expect(screen.getByLabelText(`Libellé préféré (${language})`)).toBeRequired();
      expect(screen.getByLabelText(`Définition (${language})`)).toBeRequired();
    }
    expect(screen.queryByRole('button', { name: 'Retirer cette langue' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre à validation' }));
    await screen.findByText('Chaque langue du concept doit avoir un libellé et une définition expliquant son contexte métier.');
    expect(mock.saveThesaurusDraft).not.toHaveBeenCalled();
    expect(mock.validateThesaurusDraft).not.toHaveBeenCalled();
  });
});

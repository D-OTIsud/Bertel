import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    domains: [{ domain: 'taxonomy_hlo', name: 'Hébergements locatifs', is_governed: true, is_public: true, require_definition: true, concept_count: 2 }],
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
    fireEvent.click(await screen.findByRole('button', { name: 'Configuration' }));
    expect(mock.bootstrapThesaurus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Hébergements locatifs/ }));
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
    fireEvent.focus(screen.getByLabelText('Schéma ou valeur de classement parent'));
    fireEvent.click(screen.getByRole('button', { name: /Étoiles hôtelières classification_scheme/ }));
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

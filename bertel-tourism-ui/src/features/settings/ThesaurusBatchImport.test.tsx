import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ThesaurusBatchImport } from './ThesaurusBatchImport';
import * as service from '../../services/thesaurus-admin';
import { parseThesaurusContentBatch } from '../../lib/thesaurus-content-batch';

jest.mock('../../services/thesaurus-admin', () => ({ ...jest.requireActual('../../services/thesaurus-admin'), analyseThesaurusImport: jest.fn(), importThesaurusCorrections: jest.fn(), validateThesaurusImport: jest.fn(), publishThesaurus: jest.fn() }));
const mock = jest.mocked(service);
const text = JSON.stringify({ format_version: 1, batch_id: 'corrections-locales', proposals: [{ domain: 'taxonomy_com', context_key: '', code: 'marche', base: { description: 'Ancienne définition' }, changes: { description: 'Commerce regroupant plusieurs étals.' } }] });
const proposal = parseThesaurusContentBatch(text).proposals[0];
const analysis = { batch_id: 'corrections-locales', results: [{ proposal, status: 'ready' as const, name: 'Marché', concept_id: 'concept-1', source_fingerprint: 'a'.repeat(32) }] };
const revision = service.normalizeThesaurusRevision({ revision_id: 'revision-1', concept_id: 'concept-1', domain: 'taxonomy_com', version: 1, status: 'draft', document: { name: 'Marché' }, errors: [], warnings: [] });
function setup() {
  const onSaved = jest.fn().mockResolvedValue(undefined);
  render(<ThesaurusBatchImport open onOpenChange={jest.fn()} domains={[]} onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText('Lot de corrections (JSON)'), { target: { value: text } });
  return { onSaved };
}
describe('approved private import flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock.analyseThesaurusImport.mockResolvedValue(analysis);
    mock.importThesaurusCorrections.mockResolvedValue({ analysis, revisions: [revision] });
    mock.validateThesaurusImport.mockResolvedValue({ revisions: [{ ...revision, version: 2, status: 'validated' }] });
  });
  it('keeps the JSON field full-width and styled after the dialog is portalled outside the admin view', () => {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = readFileSync(resolve(__dirname, '../../styles/29-thesaurus.css'), 'utf8');
    document.head.append(stylesheet);
    try {
      setup();
      const field = screen.getByLabelText('Lot de corrections (JSON)');
      expect(window.getComputedStyle(field).width).toBe('100%');
      expect(window.getComputedStyle(field.closest('label')!).display).toBe('flex');
    } finally { stylesheet.remove(); }
  });
  it('requires analysis, creation, and separate validation and never publishes automatically', async () => {
    const { onSaved } = setup();
    expect(screen.getByRole('button', { name: 'Créer les brouillons privés' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le lot' }));
    await screen.findByText('Marché');
    expect(screen.getByText('Commerces')).toBeInTheDocument();
    expect(mock.importThesaurusCorrections).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Créer les brouillons privés' }));
    const validate = await screen.findByRole('button', { name: 'Valider les brouillons du lot' });
    expect(mock.validateThesaurusImport).not.toHaveBeenCalled();
    expect(screen.getByText(/1 brouillon privé créé/)).toBeInTheDocument();
    fireEvent.click(validate);
    await waitFor(() => expect(onSaved).toHaveBeenLastCalledWith([expect.objectContaining({ status: 'validated', version: 2 })]));
    expect(mock.publishThesaurus).not.toHaveBeenCalled();
  });
  it('blocks all creation for conflicts and discards stale analysis when the input changes', async () => {
    mock.analyseThesaurusImport.mockResolvedValue({ ...analysis, results: [{ ...analysis.results[0], status: 'conflict', reason: 'Un brouillon existe déjà.' }] });
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Analyser le lot' }));
    await screen.findByText('Un brouillon existe déjà.');
    expect(screen.getByRole('button', { name: 'Créer les brouillons privés' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lot de corrections (JSON)'), { target: { value: text + ' ' } });
    expect(screen.queryByLabelText('Résultat de l’analyse du lot')).not.toBeInTheDocument();
    expect(mock.importThesaurusCorrections).not.toHaveBeenCalled();
  });
  it('keeps confirmed earlier drafts and clearly stops an uncertain partial request', async () => {
    mock.importThesaurusCorrections.mockResolvedValue({ analysis, revisions: [revision], error: 'Connexion perdue.', uncertain: true });
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Analyser le lot' }));
    await screen.findByText('Marché');
    fireEvent.click(screen.getByRole('button', { name: 'Créer les brouillons privés' }));
    await screen.findByText(/dernière requête n’a pas fourni de réponse certaine/);
    expect(screen.getByText(/1 réponses de création confirmées/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider les brouillons du lot' })).toBeDisabled();
    expect(screen.getByLabelText('Lot de corrections (JSON)')).toHaveValue(text);
    expect(mock.validateThesaurusImport).not.toHaveBeenCalled();
  });
  it('retains input after malformed JSON and never calls the backend for it', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Lot de corrections (JSON)'), { target: { value: '{' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le lot' }));
    await screen.findByText(/JSON est invalide/);
    expect(screen.getByLabelText('Lot de corrections (JSON)')).toHaveValue('{');
    expect(mock.analyseThesaurusImport).not.toHaveBeenCalled();
  });
});

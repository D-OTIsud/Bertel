import { render, screen, fireEvent, within } from '@testing-library/react';
import { ClassificationEditModal } from './ClassificationEditModal';
import { createClassificationDraft } from '../sections/classification-edit';
import type {
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionSchemeOption,
} from '../../../services/object-workspace-parser';

const starsScheme: ObjectWorkspaceDistinctionSchemeOption = {
  id: 'sch-stars',
  code: 'hot_stars',
  label: 'Classement hôtelier',
  selectionMode: 'single',
  isAccessibility: false,
  displayGroup: 'official_classification',
  valueOptions: [
    { id: 'v1', code: '1', label: '1 étoile' },
    { id: 'v2', code: '2', label: '2 étoiles' },
    { id: 'v3', code: '3', label: '3 étoiles' },
  ],
};

const grantedLabel: ObjectWorkspaceDistinctionSchemeOption = {
  id: 'sch-mr',
  code: 'maitre_restaurateur',
  label: 'Maîtres Restaurateurs',
  selectionMode: 'single',
  isAccessibility: false,
  displayGroup: 'quality_label',
  valueOptions: [{ id: 'g1', code: 'granted', label: 'Marque accordée' }],
};

const SCHEMES = [starsScheme, grantedLabel];

function renderAdd(over: Partial<Parameters<typeof ClassificationEditModal>[0]> = {}) {
  const onSave = jest.fn();
  render(
    <ClassificationEditModal
      open
      mode="add"
      schemes={SCHEMES}
      existingItems={[]}
      draft={createClassificationDraft()}
      onClose={() => {}}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave };
}

describe('ClassificationEditModal', () => {
  it('groups the référentiel picker by classements / labels', () => {
    renderAdd();
    // EditorModal renders inside a Radix portal (document.body), not the render container.
    expect(document.querySelector('optgroup[label="Classements officiels"]')).not.toBeNull();
    expect(document.querySelector('optgroup[label="Labels qualité"]')).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Classement hôtelier' })).toBeInTheDocument();
  });

  it('shows a value selector with levels for a star scheme', () => {
    renderAdd();
    fireEvent.change(screen.getByLabelText('Référentiel'), { target: { value: 'hot_stars' } });
    const valueSelect = screen.getByLabelText('Valeur attribuée');
    expect(valueSelect.tagName).toBe('SELECT');
    expect(within(valueSelect).getByRole('option', { name: '3 étoiles' })).toBeInTheDocument();
  });

  it('hides the value selector for a single-value label and resolves the value automatically', () => {
    const { onSave } = renderAdd();
    fireEvent.change(screen.getByLabelText('Référentiel'), { target: { value: 'maitre_restaurateur' } });
    expect(screen.queryByLabelText('Valeur attribuée')).not.toBeInTheDocument();
    expect(screen.getByText('Marque accordée')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Acquis le'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceDistinctionItem;
    expect(saved.valueCode).toBe('granted');
  });

  it('requires the acquisition date to save a granted label, validity stays optional', () => {
    renderAdd();
    fireEvent.change(screen.getByLabelText('Référentiel'), { target: { value: 'hot_stars' } });
    // Defaults to status "Accordée" → save blocked until an acquisition date is set.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Acquis le'), { target: { value: '2025-01-01' } });
    // Validity left empty — still saveable (some labels never expire).
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('does not require an acquisition date for an en cours / requested entry', () => {
    renderAdd();
    fireEvent.change(screen.getByLabelText('Référentiel'), { target: { value: 'hot_stars' } });
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'requested' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('offers the canonical granted status, not the legacy active alias', () => {
    renderAdd();
    const statusValues = screen.getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(statusValues).toContain('granted');
    expect(statusValues).not.toContain('active');
  });

  it('returns the chosen scheme + value on save', () => {
    const { onSave } = renderAdd();
    fireEvent.change(screen.getByLabelText('Référentiel'), { target: { value: 'hot_stars' } });
    fireEvent.change(screen.getByLabelText('Valeur attribuée'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Acquis le'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceDistinctionItem;
    expect(saved.schemeCode).toBe('hot_stars');
    expect(saved.valueCode).toBe('3');
    expect(saved.valueId).toBe('v3');
  });

  it('disables a single-selection scheme already held in the add picker', () => {
    renderAdd({
      existingItems: [
        { ...createClassificationDraft(), schemeCode: 'hot_stars', valueCode: '4' },
      ],
    });
    const refSelect = screen.getByLabelText('Référentiel');
    expect(within(refSelect).getByRole('option', { name: 'Classement hôtelier' })).toBeDisabled();
  });

  it('locks the référentiel in edit mode but keeps the value editable', () => {
    render(
      <ClassificationEditModal
        open
        mode="edit"
        schemes={SCHEMES}
        existingItems={[
          { ...createClassificationDraft(), schemeId: 'sch-stars', schemeCode: 'hot_stars', schemeLabel: 'Classement hôtelier', valueId: 'v3', valueCode: '3', valueLabel: '3 étoiles' },
        ]}
        draft={{ ...createClassificationDraft(), schemeId: 'sch-stars', schemeCode: 'hot_stars', schemeLabel: 'Classement hôtelier', valueId: 'v3', valueCode: '3', valueLabel: '3 étoiles' }}
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Référentiel')).not.toBeInTheDocument();
    expect(screen.getByText('Classement hôtelier')).toBeInTheDocument();
    expect(screen.getByLabelText('Valeur attribuée')).toBeInTheDocument();
  });
});

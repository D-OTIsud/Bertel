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

/** Drive the searchable référentiel picker: open → type → click the matching option. */
function selectRef(_search: string, label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

function renderAdd(over: Partial<Parameters<typeof ClassificationEditModal>[0]> = {}) {
  const onSave = jest.fn();
  render(
    <ClassificationEditModal
      open
      mode="add"
      schemes={SCHEMES}
      existingItems={[]}
      draft={createClassificationDraft()}
      objectId="HOTRUN0000000001"
      onClose={() => {}}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave };
}

describe('ClassificationEditModal', () => {
  it('renvoie la couverture des handicaps vers Accessibilité 09', () => {
    renderAdd({
      schemes: [{ ...grantedLabel, displayGroup: 'accessibility_labels' }],
      draft: { ...createClassificationDraft(), schemeCode: grantedLabel.code },
    });
    expect(screen.getByText(/La couverture par type de handicap/)).toHaveTextContent('Accessibilité (§09)');
    expect(screen.queryByText(/Accessibilité \(§10\)/)).not.toBeInTheDocument();
  });

  it('groups the référentiel picker into collapsible categories', () => {
    renderAdd();
    expect(screen.getByText('Classements officiels')).toBeInTheDocument();
    expect(screen.getByText('Labels qualité')).toBeInTheDocument();
  });

  it('labels the sustainability category for durabilité labels', () => {
    const sustaScheme: ObjectWorkspaceDistinctionSchemeOption = {
      id: 'sch-de',
      code: 'LBL_DESTINATION_EXCELLENCE',
      label: "Destination d'excellence",
      selectionMode: 'single',
      isAccessibility: false,
      displayGroup: 'sustainability_labels',
      valueOptions: [{ id: 'g', code: 'granted', label: 'Obtenu' }],
    };
    renderAdd({ schemes: [starsScheme, sustaScheme] });
    expect(screen.getByText('Durabilité / environnement')).toBeInTheDocument();
  });

  it('shows a value selector with levels for a star scheme', () => {
    renderAdd();
    selectRef('hotel', 'Classement hôtelier');
    const valueSelect = screen.getByRole('group', { name: 'Valeur attribuée' });
    expect(within(valueSelect).getByRole('button', { name: '3 étoiles' })).toBeInTheDocument();
  });

  it('hides the value selector for a single-value label and resolves the value automatically', () => {
    const { onSave } = renderAdd();
    selectRef('maitre', 'Maîtres Restaurateurs');
    expect(screen.queryByLabelText('Valeur attribuée')).not.toBeInTheDocument();
    expect(screen.getByText('Marque accordée')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Obtenu le'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceDistinctionItem;
    expect(saved.valueCode).toBe('granted');
  });

  it('requires the acquisition date to save a granted label, validity stays optional', () => {
    renderAdd();
    selectRef('hotel', 'Classement hôtelier');
    // Defaults to status "Accordée" → save blocked until an acquisition date is set.
    expect(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Obtenu le'), { target: { value: '2025-01-01' } });
    // Validity left empty — still saveable (some labels never expire).
    expect(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ })).toBeEnabled();
  });

  it('does not require an acquisition date for an en cours / requested entry', () => {
    renderAdd();
    selectRef('hotel', 'Classement hôtelier');
    fireEvent.click(screen.getByRole('button', { name: 'En cours' }));
    expect(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ })).toBeEnabled();
  });

  it('blocks saving when the validity date precedes the acquisition date', () => {
    renderAdd();
    selectRef('hotel', 'Classement hôtelier');
    fireEvent.change(screen.getByLabelText('Obtenu le'), { target: { value: '2025-06-01' } });
    fireEvent.change(screen.getByLabelText("Valable jusqu'au"), { target: { value: '2025-01-01' } });
    expect(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/postérieure/);
  });

  it('offers the canonical granted status, not the legacy active alias', () => {
    renderAdd();
    expect(screen.getByRole('button', { name: 'Accordé' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Active' })).not.toBeInTheDocument();
  });

  it('returns the chosen scheme + value on save', () => {
    const { onSave } = renderAdd();
    selectRef('hotel', 'Classement hôtelier');
    fireEvent.click(screen.getByRole('button', { name: '3 étoiles' }));
    fireEvent.change(screen.getByLabelText('Obtenu le'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceDistinctionItem;
    expect(saved.schemeCode).toBe('hot_stars');
    expect(saved.valueCode).toBe('3');
    expect(saved.valueId).toBe('v3');
  });

  it('omits a single-selection scheme already held from the add picker', () => {
    renderAdd({
      existingItems: [{ ...createClassificationDraft(), schemeCode: 'hot_stars', valueCode: '4' }],
    });
    expect(screen.queryByRole('button', { name: 'Classement hôtelier' })).not.toBeInTheDocument();
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
        objectId="HOTRUN0000000001"
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Référentiel' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Classement hôtelier').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Valeur attribuée')).toBeInTheDocument();
  });
});

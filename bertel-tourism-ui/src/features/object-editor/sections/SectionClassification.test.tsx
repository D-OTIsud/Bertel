import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionClassification } from './SectionClassification';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type {
  ObjectWorkspaceDistinctionGroup,
  ObjectWorkspaceDistinctionItem,
} from '../../../services/object-workspace-parser';

function classRow(over: Partial<ObjectWorkspaceDistinctionItem>): ObjectWorkspaceDistinctionItem {
  return {
    recordId: null,
    schemeId: 'sch-stars',
    schemeCode: 'hot_stars',
    schemeLabel: 'Classement hôtelier',
    valueId: 'v4',
    valueCode: '4',
    valueLabel: '4 étoiles',
    status: 'granted',
    awardedAt: '2025-01-01',
    validUntil: '',
    disabilityTypesCovered: [],
    documentId: '',
    documentUrl: '',
    documentTitle: '',
    ...over,
  };
}

function modulesWithSchemes(groups: ObjectWorkspaceDistinctionGroup[] = []) {
  const m = fullModulesFixture();
  m.distinctions = {
    distinctionGroups: groups,
    accessibilityLabels: [],
    accessibilityAmenityCoverage: [],
    schemeOptions: [
      {
        id: 'sch-stars',
        code: 'hot_stars',
        label: 'Classement hôtelier',
        selectionMode: 'single',
        isAccessibility: false,
        displayGroup: 'official_classification',
        valueOptions: [
          { id: 'v1', code: '1', label: '1 étoile' },
          { id: 'v4', code: '4', label: '4 étoiles' },
          { id: 'v5', code: '5', label: '5 étoiles' },
        ],
      },
      {
        id: 'sch-mr',
        code: 'maitre_restaurateur',
        label: 'Maîtres Restaurateurs',
        selectionMode: 'single',
        isAccessibility: false,
        displayGroup: 'quality_label',
        valueOptions: [{ id: 'g1', code: 'granted', label: 'Marque accordée' }],
      },
      {
        id: 'sch-acc',
        code: 'th',
        label: 'Tourisme & Handicap',
        selectionMode: 'single',
        isAccessibility: true,
        displayGroup: 'accessibility_labels',
        valueOptions: [{ id: 'a1', code: 'granted', label: 'Obtenu' }],
      },
    ],
    unavailableReason: null,
  };
  return m;
}

describe('SectionClassification', () => {
  it('shows an empty state and an add affordance when nothing is held', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithSchemes()));
    render(<SectionClassification editor={result.current} permissions={allowAll} />);
    expect(screen.getByText(/Aucune classification/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter une classification/i })).toBeInTheDocument();
  });

  it('adds a classification through the modal and appends it to the draft', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithSchemes()));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter une classification/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Référentiel' }));
    });
    // T&H is surfaced here too (§71 follow-up), under the Accessibilité category.
    act(() => {
      fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'handicap' } });
    });
    expect(screen.getByRole('option', { name: 'Tourisme & Handicap' })).toBeInTheDocument();
    act(() => {
      fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'hotel' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('option', { name: 'Classement hôtelier' }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Valeur attribuée'), { target: { value: '4' } });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Acquis le'), { target: { value: '2025-01-01' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    });

    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    const items = result.current.draft.distinctions.distinctionGroups.flatMap((g) => g.items);
    expect(items).toHaveLength(1);
    expect(items[0].schemeCode).toBe('hot_stars');
    expect(items[0].valueCode).toBe('4');
  });

  it('adds Tourisme & Handicap and routes it to the accessibilityLabels arm (no saver double-write)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithSchemes()));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter une classification/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Référentiel' }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'handicap' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('option', { name: 'Tourisme & Handicap' }));
    });
    // Value auto-resolves to 'granted' (read-only); acquisition date required for a granted label.
    act(() => {
      fireEvent.change(screen.getByLabelText('Acquis le'), { target: { value: '2025-01-01' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    });

    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    const d = result.current.draft.distinctions;
    expect(d.distinctionGroups.flatMap((g) => g.items)).toHaveLength(0); // NOT a distinction-arm row
    expect(d.accessibilityLabels).toHaveLength(1);
    expect(d.accessibilityLabels[0].schemeCode).toBe('th');
    expect(d.accessibilityLabels[0].valueCode).toBe('granted');
  });

  it('editing a held T&H row in §08 preserves the §10 disability-type coverage (no wipe)', () => {
    const m = modulesWithSchemes();
    m.distinctions.accessibilityLabels = [
      {
        recordId: 'thr',
        schemeId: 'sch-acc',
        schemeCode: 'th',
        schemeLabel: 'Tourisme & Handicap',
        valueId: 'a1',
        valueCode: 'granted',
        valueLabel: 'Obtenu',
        status: 'granted',
        awardedAt: '2025-01-01',
        validUntil: '',
        disabilityTypesCovered: ['motor', 'visual'],
        documentId: '',
        documentUrl: '',
        documentTitle: '',
      },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', m));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Valable jusqu'au"), { target: { value: '2028-01-01' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    });

    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    const acc = result.current.draft.distinctions.accessibilityLabels;
    expect(acc).toHaveLength(1);
    expect(acc[0].validUntil).toBe('2028-01-01');
    // CRITICAL: the §10 coverage is untouched (the §08 modal never edits disabilityTypesCovered).
    expect(acc[0].disabilityTypesCovered).toEqual(['motor', 'visual']);
  });

  it('deletes a held classification row', () => {
    const groups: ObjectWorkspaceDistinctionGroup[] = [
      { schemeCode: 'hot_stars', schemeLabel: 'Classement hôtelier', items: [classRow({ recordId: 'd1' })] },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithSchemes(groups)));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));
    });

    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.distinctions.distinctionGroups.flatMap((g) => g.items)).toHaveLength(0);
  });

  it('edits a held row through the modal', () => {
    const groups: ObjectWorkspaceDistinctionGroup[] = [
      { schemeCode: 'hot_stars', schemeLabel: 'Classement hôtelier', items: [classRow({ recordId: 'd1' })] },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithSchemes(groups)));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Valeur attribuée'), { target: { value: '5' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    });

    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    const items = result.current.draft.distinctions.distinctionGroups.flatMap((g) => g.items);
    expect(items).toHaveLength(1);
    expect(items[0].valueCode).toBe('5');
  });

  it('shows the unavailable notice and no add button when the module is gated', () => {
    const m = modulesWithSchemes();
    m.distinctions.unavailableReason = 'Distinctions indisponibles dans le live actuel.';
    const { result } = renderHook(() => useObjectEditorState('o1', m));
    render(<SectionClassification editor={result.current} permissions={allowAll} />);
    expect(screen.getByText(/Module indisponible/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une classification/i })).not.toBeInTheDocument();
  });
});

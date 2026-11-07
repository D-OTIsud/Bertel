import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionSustainability } from './SectionSustainability';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionSustainability', () => {
  it('renders the category list and KPI summary from the fixture', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionSustainability editor={result.current} permissions={allowAll} />);

    // Section header + the seeded "Énergie" category from the fixture.
    expect(screen.getByText('Démarche durable')).toBeInTheDocument();
    expect(screen.getByText('Énergie')).toBeInTheDocument();
    expect(screen.getByText('LED généralisée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Énergie/ })).toHaveAttribute(
      'title',
      'Réduction de la consommation énergétique.',
    );
    expect(screen.getByRole('button', { name: 'LED généralisée' })).toHaveAttribute(
      'title',
      'Éclairage LED sur la majorité des zones.',
    );
    // KPI: 1 selected out of 2 actions in the fixture.
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('collapses categories without selection and expands on header click', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', {
        ...fullModulesFixture(),
        sustainability: {
          categories: [
            {
              id: 'cat-a',
              code: 'A',
              label: 'Eau',
              description: '',
              actions: [
                {
                  id: 'a1',
                  code: 'X',
                  label: 'Action eau',
                  description: 'Desc eau',
                  selected: false,
                  note: '',
                  documentId: '',
                },
              ],
            },
            fullModulesFixture().sustainability.categories[0],
          ],
          equivalentLabels: [],
        },
      }),
    );
    render(<SectionSustainability editor={result.current} permissions={allowAll} />);

    expect(screen.queryByRole('button', { name: 'Action eau' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Eau/ }));
    expect(screen.getByRole('button', { name: 'Action eau' })).toBeInTheDocument();
  });

  it('toggles an action and marks the sustainability module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionSustainability editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Audit énergétique' }));
    });
    view.rerender(<SectionSustainability editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.sustainability).toBe(true);
    expect(result.current.draft.sustainability.categories[0].actions[1].selected).toBe(true);
  });
});

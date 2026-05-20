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
    // KPI: 1 selected out of 2 actions in the fixture.
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
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

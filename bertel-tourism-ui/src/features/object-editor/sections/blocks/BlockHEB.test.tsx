import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockHEB } from './BlockHEB';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

describe('BlockHEB pet policy', () => {
  it('hides the conditions textarea until pets are accepted', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.petPolicy.accepted = false;
    modules.capacityPolicies.petPolicy.conditions = '';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.queryByLabelText("Conditions d'accueil des animaux")).not.toBeInTheDocument();

    act(() => { fireEvent.click(screen.getByLabelText('Animaux acceptés')); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(result.current.draft.capacityPolicies.petPolicy.accepted).toBe(true);
    expect(screen.getByLabelText("Conditions d'accueil des animaux")).toBeInTheDocument();
  });

  it('renders no "Politique animaux renseignée" toggle', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.queryByText(/Politique animaux renseignée/i)).not.toBeInTheDocument();
  });
});

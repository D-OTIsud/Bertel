import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionMedia } from './SectionMedia';
import { SectionPricing } from './SectionPricing';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import { getRegisteredSections } from './section-registry';

describe('section registry', () => {
  it('returns the full ordered section list by archetype', () => {
    expect(getRegisteredSections('HEB')).toHaveLength(21);
    expect(getRegisteredSections('ITI')).toHaveLength(22);
  });

  it('mounts the HEB registered sections with fixture data', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(
      <>
        {getRegisteredSections('HEB').map(({ num, Component }) => (
          <Component key={num} editor={result.current} permissions={allowAll} archetype="HEB" objectId="o1" />
        ))}
      </>,
    );
    expect(screen.getByText('Chambres, équipements & séminaire')).toBeInTheDocument();
    expect(screen.getByText('Identifiants externes & synchronisation')).toBeInTheDocument();
  });

  it('marks media and pricing modules dirty when edited', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    // Open the edit modal for the existing media item, change a field, and save.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier le média/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Crédit / auteur'), { target: { value: 'OTI' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(result.current.dirtySections.media).toBe(true);

    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);
    act(() => {
      fireEvent.change(screen.getByDisplayValue('12'), { target: { value: '15' } });
    });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.pricing).toBe(true);
  });
});

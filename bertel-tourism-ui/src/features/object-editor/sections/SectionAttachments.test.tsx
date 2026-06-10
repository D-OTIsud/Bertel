import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAttachments } from './SectionAttachments';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

/**
 * §17 org-link authoring (§48). The read-only "Organisation éditrice" kv becomes an editable
 * repeater over object_org_link (org / role / primary / note), persisted through the org_links
 * arm of api.save_object_relations. When the org links could not be loaded reliably the section
 * falls back to read-only (anti-clobber: the saver omits the org_links key on a set reason).
 */
describe('SectionAttachments — §17 org-link authoring (§48)', () => {
  it('changes an org-link role and marks relationships dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByDisplayValue('Publisher principal'), { target: { value: 'contributor' } });
    });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks[0].roleCode).toBe('contributor');
    expect(result.current.dirtySections.relationships).toBe(true);
  });

  it('adds an org link defaulting to publisher', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinks = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher une organisation/i })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks).toHaveLength(1);
    expect(result.current.draft.relationships.organizationLinks[0].roleCode).toBe('publisher');
    expect(result.current.draft.relationships.organizationLinks[0].isPrimary).toBe(true);
  });

  it('renders read-only when the org links could not be loaded', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinkWriteUnavailableReason = 'load failed';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rattacher une organisation/i })).not.toBeInTheDocument();
  });
});

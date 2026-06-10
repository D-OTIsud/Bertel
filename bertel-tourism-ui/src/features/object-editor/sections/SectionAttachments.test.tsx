import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAttachments } from './SectionAttachments';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

// §48 Task 7 — the ActorPicker has its own spec (debounce + api.search_actors); here it is
// stubbed so the section specs only exercise the §17 repeater's onPick wiring.
jest.mock('../widgets/ActorPicker', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    ActorPicker: ({ onPick }: { onPick: (actor: { id: string; displayName: string; firstName: string; lastName: string }) => void }) =>
      mockReact.createElement(
        'button',
        {
          type: 'button',
          onClick: () => onPick({ id: 'act-9', displayName: 'Rémi Janisset', firstName: 'Rémi', lastName: 'Janisset' }),
        },
        'Choisir Rémi Janisset',
      ),
  };
});

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

  it('setting a row primary clears the other rows (uq_object_primary_org)', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinks = [
      { ...modules.relationships.organizationLinks[0], isPrimary: true },
      { ...modules.relationships.organizationLinks[0], id: 'ORG2', name: 'OTI Nord', roleCode: 'contributor', roleLabel: 'ORG contributrice', isPrimary: false },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByLabelText('Définir comme organisation principale')); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    const links = result.current.draft.relationships.organizationLinks;
    expect(links.map((link) => link.isPrimary)).toEqual([false, true]);
  });

  it('removes an org link and marks relationships dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks).toHaveLength(0);
    expect(result.current.dirtySections.relationships).toBe(true);
  });
});

/**
 * §17 actor-role authoring (§48 Task 7). The read-only "Acteurs liés" kv becomes an editable
 * repeater over actor_object_role (actor / role / visibility / primary-per-role / note),
 * persisted through the actors arm of api.save_object_relations. New actors are linked via
 * the ActorPicker (api.search_actors). Delete buttons carry per-actor aria-labels so they
 * never collide with the org-link / membership "Supprimer" buttons.
 */
describe('SectionAttachments — §17 actor authoring (§48)', () => {
  it('changes an actor role and marks relationships dirty', () => {
    const modules = fullModulesFixture();
    modules.relationships.actorRoleOptions = [
      { id: 'operator', code: 'operator', label: 'Exploitant' },
      { id: 'guide', code: 'guide', label: 'Guide accompagnateur' },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByDisplayValue('Exploitant'), { target: { value: 'guide' } });
    });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.actors[0].roleCode).toBe('guide');
    expect(result.current.dirtySections.relationships).toBe(true);
  });

  it('removes an actor link via its aria-label and marks relationships dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: "Supprimer l'acteur Marie Guide" }));
    });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.actors).toHaveLength(0);
    expect(result.current.dirtySections.relationships).toBe(true);
  });

  it('picks an actor and appends a row defaulting to operator, primary when first for that role', () => {
    const modules = fullModulesFixture();
    modules.relationships.actors = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Lier un acteur/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    const actors = result.current.draft.relationships.actors;
    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({
      id: 'act-9', displayName: 'Rémi Janisset', roleCode: 'operator', isPrimary: true, visibility: 'public',
    });
    expect(result.current.dirtySections.relationships).toBe(true);
  });

  it('a picked actor is not primary when the role already has a primary (uq_actor_object_role_primary)', () => {
    // Default fixture: Marie Guide is already the primary operator.
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Lier un acteur/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });

    const actors = result.current.draft.relationships.actors;
    expect(actors).toHaveLength(2);
    expect(actors[1].isPrimary).toBe(false);
  });

  it('renders read-only when the actor links could not be loaded (anti-clobber)', () => {
    const modules = fullModulesFixture();
    modules.relationships.actorWriteUnavailableReason = 'load failed';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lier un acteur/i })).not.toBeInTheDocument();
  });
});

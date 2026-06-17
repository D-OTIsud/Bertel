import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAttachments } from './SectionAttachments';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

// NB: actor (prestataire) authoring moved to §19 (ProviderCards.test.tsx). §17 keeps org links only.

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

  it('adds an org link via the OrgPicker modal, defaulting to publisher', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinks = [];
    if (modules.relationships.orgOptions.length === 0) {
      modules.relationships.orgOptions = [{ id: 'ORG1', name: 'OTI du Sud' }];
    }
    const firstOrg = modules.relationships.orgOptions[0];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    // open the modal, then pick the first catalog org
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher une organisation/i })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: new RegExp(firstOrg.name, 'i') })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks).toHaveLength(1);
    expect(result.current.draft.relationships.organizationLinks[0].id).toBe(firstOrg.id);
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

  it('no longer renders the prestataire (actor) block — moved to §19', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/Acteurs liés/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lier un acteur/i })).not.toBeInTheDocument();
  });
});

describe('SectionAttachments — §17 adhésions (modale + état vide)', () => {
  it('shows an explicit empty state when there is no adhésion', () => {
    const modules = fullModulesFixture();
    modules.memberships.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/Aucune adhésion/i)).toBeInTheDocument();
  });

  it('opens the membership modal from "Ajouter une adhésion"', () => {
    const modules = fullModulesFixture();
    modules.memberships.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter une adhésion/i })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeInTheDocument();
  });

  it('no longer renders the "Campagnes disponibles" chipset', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.queryByText(/Campagnes disponibles/i)).not.toBeInTheDocument();
  });
});

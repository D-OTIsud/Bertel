import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionContacts } from './SectionContacts';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspaceContactItem, ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

function contact(overrides: Partial<ObjectWorkspaceContactItem> = {}): ObjectWorkspaceContactItem {
  return {
    id: 'c1',
    kindId: 'k1',
    kindCode: 'phone',
    kindLabel: 'Téléphone',
    roleId: '',
    roleCode: '',
    roleLabel: '',
    value: '+262 000',
    isPublic: true,
    isPrimary: true,
    position: '0',
    ...overrides,
  };
}

function modulesWithContacts(
  contactsOverride: Partial<ObjectWorkspaceModules['contacts']> = {},
): ObjectWorkspaceModules {
  const modules = fullModulesFixture();
  modules.contacts = { ...modules.contacts, ...contactsOverride };
  return modules;
}

describe('SectionContacts', () => {
  it('populates the contact type dropdown from kindOptions', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithContacts()));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    const kindSelect = screen.getByRole('combobox', { name: 'Type de contact' });
    const labels = within(kindSelect).getAllByRole('option').map((option) => option.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Téléphone', 'E-mail']));
  });

  it('populates the contact role dropdown from roleOptions', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithContacts()));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    const roleSelect = screen.getByRole('combobox', { name: 'Rôle du contact' });
    const labels = within(roleSelect).getAllByRole('option').map((option) => option.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Accueil', 'Réservation']));
  });

  it('keeps an empty role possible with a clear label', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithContacts()));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    const roleSelect = screen.getByRole('combobox', { name: 'Rôle du contact' }) as HTMLSelectElement;
    expect(within(roleSelect).getByRole('option', { name: '— Aucun rôle —' })).toBeInTheDocument();
    expect(roleSelect.value).toBe('');
  });

  it('shows a clear state when no contact type reference data is available', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithContacts({ kindOptions: [] })));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/types de contact ne sont pas disponibles/i)).toBeInTheDocument();
  });

  it('adds a usable editable contact row', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({ objectItems: [contact()] })),
    );
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.getAllByRole('combobox', { name: 'Type de contact' })).toHaveLength(1);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter un canal de contact/i }));
    });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.getAllByRole('combobox', { name: 'Type de contact' })).toHaveLength(2);
    expect(result.current.draft.contacts.objectItems).toHaveLength(2);
  });

  it('deletes the targeted contact row', () => {
    const modules = modulesWithContacts({
      objectItems: [
        contact({ id: 'c1', value: '+262 111' }),
        contact({ id: 'c2', value: '+262 222', isPrimary: false, position: '1' }),
      ],
    });
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.contacts.objectItems).toHaveLength(1);
    expect(result.current.draft.contacts.objectItems[0].value).toBe('+262 222');
  });

  it('renders an accessible delete control that is not a bare cross', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({ objectItems: [contact()] })),
    );
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    const del = screen.getByRole('button', { name: 'Supprimer' });
    expect(del.textContent?.trim()).not.toBe('×');
    expect(del.querySelector('svg')).toBeInTheDocument();
  });

  it('provides at least one contact type and one contact role in the fixture', () => {
    const fixture = fullModulesFixture();
    expect(fixture.contacts.kindOptions.length).toBeGreaterThanOrEqual(1);
    expect(fixture.contacts.roleOptions.length).toBeGreaterThanOrEqual(1);
  });

  it('marks the contacts module dirty when a value is edited', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({ objectItems: [contact()] })),
    );
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByDisplayValue('+262 000'), { target: { value: '+262 999' } });
    });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.contacts).toBe(true);
  });

  it('shows the platform favicon in front of a URL-valued contact', () => {
    const { result } = renderHook(() =>
      useObjectEditorState(
        'o1',
        modulesWithContacts({
          objectItems: [
            contact({
              id: 'cb',
              kindCode: 'booking_engine',
              kindLabel: 'Plateforme de réservation',
              value: 'https://www.booking.com/hotel/re/lagon.html',
            }),
          ],
        }),
      ),
    );
    const { container } = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(
      container.querySelector('img[src="https://icons.duckduckgo.com/ip3/booking.com.ico"]'),
    ).toBeInTheDocument();
  });

  it('shows no favicon for a non-URL contact value', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({ objectItems: [contact()] })),
    );
    const { container } = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(container.querySelector('img[src^="https://icons.duckduckgo.com"]')).not.toBeInTheDocument();
  });
});

describe('SectionContacts — review round (sub-title, liaison note, reorder)', () => {
  it('drops "dirigeants" from the sub-title (director lives in §18)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithContacts()));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/dirigeants/i)).not.toBeInTheDocument();
    expect(screen.getByText(/réseaux sociaux/i)).toBeInTheDocument();
  });

  it('surfaces the linked actor/org contacts published elsewhere (liaison note)', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({
        relatedActorContactsCount: 2,
        relatedOrganizationContactsCount: 1,
      })),
    );
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    const note = screen.getByText(/aussi publiés sur la fiche/i);
    expect(note).toHaveTextContent('2 contact(s) d’acteurs');
    expect(note).toHaveTextContent('1 contact(s) d’organisations');
    expect(note).toHaveTextContent(/Rattachements/);
  });

  it('shows no liaison note when there are no linked contacts', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({
        relatedActorContactsCount: 0,
        relatedOrganizationContactsCount: 0,
      })),
    );
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/aussi publiés sur la fiche/i)).not.toBeInTheDocument();
  });

  it('renders a real drag handle per row (sortable list, no decorative span)', () => {
    const modules = modulesWithContacts({
      objectItems: [
        contact({ id: 'c1', value: '+262 111' }),
        contact({ id: 'c2', value: '+262 222', isPrimary: false, position: '1' }),
      ],
    });
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.getAllByRole('button', { name: 'Déplacer' })).toHaveLength(2);
  });
});

describe('reindexContactPositions', () => {
  it('rewrites position from the new array order', async () => {
    const { reindexContactPositions } = await import('./contacts-reorder');
    const reordered = reindexContactPositions([
      contact({ id: 'c2', position: '1' }),
      contact({ id: 'c1', position: '0' }),
    ]);
    expect(reordered.map((item) => [item.id, item.position])).toEqual([
      ['c2', '0'],
      ['c1', '1'],
    ]);
  });
});

describe('SectionContacts — §48 contact flags', () => {
  // Fix 2: public/interne toggle — accessible name is now fixed 'Visibilité publique' (aria-label),
  // visible text flips Public / Interne; aria-pressed flips true → false.
  it('toggles is_public and marks contacts dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    const toggle = screen.getAllByLabelText('Visibilité publique')[0];
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    act(() => { fireEvent.click(toggle); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.contacts.objectItems[0].isPublic).toBe(false);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('Interne');
    expect(result.current.dirtySections.contacts).toBe(true);
  });

  it('sets a row primary and clears other rows of the same kind', () => {
    const modules = fullModulesFixture();
    modules.contacts.objectItems = [
      { ...modules.contacts.objectItems[0], id: 'c1', isPrimary: true },
      { ...modules.contacts.objectItems[0], id: 'c2', value: '+262 111', isPrimary: false },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getAllByLabelText('Définir comme canal principal')[0]); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    const items = result.current.draft.contacts.objectItems;
    expect(items.find((item) => item.id === 'c2')?.isPrimary).toBe(true);
    expect(items.find((item) => item.id === 'c1')?.isPrimary).toBe(false);
  });

  // Fix 1: kind-change must not create a double primary for the destination kind.
  it('moving a primary row to a kind that already has a primary clears its star (no double primary)', () => {
    const modules = fullModulesFixture();
    modules.contacts.objectItems = [
      { ...modules.contacts.objectItems[0], id: 'c1', kindCode: 'phone', isPrimary: true },
      { ...modules.contacts.objectItems[0], id: 'c2', kindCode: 'email', kindLabel: 'E-mail', value: 'a@b.re', isPrimary: true },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.change(screen.getAllByLabelText('Type de contact')[0], { target: { value: 'email' } }); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    const items = result.current.draft.contacts.objectItems;
    expect(items.find((item) => item.id === 'c1')?.isPrimary).toBe(false);
    expect(items.find((item) => item.id === 'c2')?.isPrimary).toBe(true);
  });

  // Fix 5a: per-kind isolation — setting phone primary must not touch email primary.
  it('setting a phone primary leaves an email primary untouched (per-kind isolation)', () => {
    const modules = fullModulesFixture();
    modules.contacts.objectItems = [
      { ...modules.contacts.objectItems[0], id: 'c1', kindCode: 'phone', isPrimary: false },
      { ...modules.contacts.objectItems[0], id: 'c2', kindCode: 'phone', value: '+262 111', isPrimary: true },
      { ...modules.contacts.objectItems[0], id: 'c3', kindCode: 'email', kindLabel: 'E-mail', value: 'a@b.re', isPrimary: true },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getAllByLabelText('Définir comme canal principal')[0]); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    const items = result.current.draft.contacts.objectItems;
    expect(items.find((item) => item.id === 'c1')?.isPrimary).toBe(true);
    expect(items.find((item) => item.id === 'c2')?.isPrimary).toBe(false);
    expect(items.find((item) => item.id === 'c3')?.isPrimary).toBe(true);
  });

  // Fix 5b: clicking the current primary star is a no-op and does not dirty the section.
  it('clicking the current primary star is a no-op and does not dirty the section', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByLabelText('Canal principal pour ce type')); });

    expect(result.current.dirtySections.contacts).toBe(false);
  });

  it('renders the §90 web channels group with its kind catalog', () => {
    const { result } = renderHook(() =>
      useObjectEditorState('o1', modulesWithContacts({
        webItems: [
          { id: 'w1', kindId: 'wk1', kindCode: 'facebook', kindLabel: 'Facebook', kindDomain: 'social_network', value: 'https://facebook.com/x', isPublic: true, position: '0' },
        ],
      })),
    );
    render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Réseaux sociaux\s*&\s*distribution/i)).toBeInTheDocument();
    const webSelect = screen.getByRole('combobox', { name: 'Type de réseau ou canal' });
    const labels = within(webSelect).getAllByRole('option').map((option) => option.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Facebook', 'Instagram', 'Booking.com']));
  });

  it('adds an editable web channel row (§90)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithContacts({ webItems: [] })));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.queryByRole('combobox', { name: 'Type de réseau ou canal' })).not.toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un réseau ou canal' })); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(screen.getByRole('combobox', { name: 'Type de réseau ou canal' })).toBeInTheDocument();
    expect(result.current.draft.contacts.webItems).toHaveLength(1);
    expect(result.current.dirtySections.contacts).toBe(true);
  });
});

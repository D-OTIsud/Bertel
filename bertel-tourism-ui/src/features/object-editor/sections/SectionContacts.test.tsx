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
});

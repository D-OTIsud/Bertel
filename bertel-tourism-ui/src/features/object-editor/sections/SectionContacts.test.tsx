import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionContacts } from './SectionContacts';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

function modulesWithOneContact(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    contacts: {
      objectItems: [
        {
          id: 'c1',
          kindId: 'k',
          kindCode: 'phone',
          kindLabel: 'Téléphone',
          roleId: '',
          roleCode: '',
          roleLabel: '',
          value: '+262 000',
          isPublic: true,
          isPrimary: true,
          position: '0',
        },
      ],
      kindOptions: [{ id: 'k', code: 'phone', label: 'Téléphone' }],
      roleOptions: [],
      relatedActorContactsCount: 0,
      relatedOrganizationContactsCount: 0,
    },
  } as unknown as ObjectWorkspaceModules;
}

const allowAll = new Proxy(
  {},
  {
    get: () => ({
      canDirectWrite: true,
      canPrepareProposal: true,
      canSubmitProposal: true,
      disabledReason: null,
    }),
  },
) as ObjectWorkspacePermissions;

describe('SectionContacts', () => {
  it('renders existing contact values and marks the module dirty on edit', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithOneContact()));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);
    const input = screen.getByDisplayValue('+262 000');
    act(() => {
      fireEvent.change(input, { target: { value: '+262 999' } });
    });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.contacts).toBe(true);
  });

  it('lets the user pick a contact role from reference data', () => {
    const modules = modulesWithOneContact();
    modules.contacts.roleOptions = [{ id: 'r1', code: 'reservation', label: 'Réservation' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);
    const selects = screen.getAllByRole('combobox');
    // [0] = kind, [1] = role
    act(() => { fireEvent.change(selects[1], { target: { value: 'reservation' } }); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.contacts.objectItems[0].roleCode).toBe('reservation');
    expect(result.current.dirtySections.contacts).toBe(true);
  });
});

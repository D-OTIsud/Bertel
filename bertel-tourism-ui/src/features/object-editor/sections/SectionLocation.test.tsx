import { render, screen, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionLocation } from './SectionLocation';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

const perms = {} as ObjectWorkspacePermissions;

function modules(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    location: {
      main: {
        recordId: null,
        address1: '38 Chemin du Bel Air',
        address1Suite: '',
        address2: '',
        address3: '',
        postcode: '97414',
        city: "L'Entre-Deux",
        codeInsee: '',
        lieuDit: '',
        direction: '',
        latitude: '',
        longitude: '',
        zoneTouristique: '',
      },
      places: [],
      zoneCodes: [],
    },
  } as unknown as ObjectWorkspaceModules;
}

describe('SectionLocation', () => {
  it('renders the address into the controlled field', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    expect(screen.getByDisplayValue('38 Chemin du Bel Air')).toBeInTheDocument();
  });
});

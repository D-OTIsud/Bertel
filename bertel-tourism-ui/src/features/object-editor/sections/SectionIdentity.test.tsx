import { render, screen, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionIdentity } from './SectionIdentity';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

const perms = {} as ObjectWorkspacePermissions;

function modules(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'Domaine du Bel Air', status: 'published', commercialVisibility: 'full' },
    taxonomy: { domains: [], unavailableReason: null },
  } as unknown as ObjectWorkspaceModules;
}

describe('SectionIdentity', () => {
  it('renders the object name into the controlled field', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionIdentity editor={result.current} permissions={perms} />);
    expect(screen.getByDisplayValue('Domaine du Bel Air')).toBeInTheDocument();
  });
});

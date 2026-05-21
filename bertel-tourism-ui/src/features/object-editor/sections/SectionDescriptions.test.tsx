import { render, screen, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionDescriptions } from './SectionDescriptions';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

const perms = {} as ObjectWorkspacePermissions;
const emptyField = () => ({ baseValue: '', values: {} as Record<string, string> });

function modules(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    descriptions: {
      localLanguage: 'fr',
      activeLanguage: 'fr',
      availableLanguages: ['fr', 'en'],
      object: {
        recordId: null,
        scope: 'object',
        placeId: null,
        label: '',
        visibility: 'public',
        description: { baseValue: '', values: { fr: 'Un descriptif' } },
        chapo: emptyField(),
        adaptedDescription: emptyField(),
        mobileDescription: emptyField(),
        editorialDescription: emptyField(),
      },
      places: [],
    },
  } as unknown as ObjectWorkspaceModules;
}

describe('SectionDescriptions', () => {
  it('renders the descriptif for the active language', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={perms} />);
    expect(screen.getByDisplayValue('Un descriptif')).toBeInTheDocument();
  });

  it('renders canonical text when the local i18n map is empty', () => {
    const fixture = modules();
    fixture.descriptions.object.description = { baseValue: 'Descriptif canonique', values: {} };
    const { result } = renderHook(() => useObjectEditorState('o1', fixture));
    render(<SectionDescriptions editor={result.current} permissions={perms} />);
    expect(screen.getByDisplayValue('Descriptif canonique')).toBeInTheDocument();
  });
});

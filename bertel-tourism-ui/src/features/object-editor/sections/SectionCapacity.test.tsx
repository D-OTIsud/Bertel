import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCapacity } from './SectionCapacity';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionCapacity', () => {
  it('no longer renders the pet-policy field (moved to BlockHEB)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText('Animaux')).not.toBeInTheDocument();
    // Group policy stays in §07.
    expect(screen.getByText('Groupes')).toBeInTheDocument();
  });
});

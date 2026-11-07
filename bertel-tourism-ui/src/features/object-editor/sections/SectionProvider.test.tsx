import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionProvider } from './SectionProvider';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionProvider', () => {
  it('renders the SIRET card + provider compliments from the fixture', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionProvider editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Fournisseur / Prestataire')).toBeInTheDocument();
    expect(screen.getByText('SARL Domaine du Bel Air')).toBeInTheDocument();
    expect(screen.getByText('44851998300012')).toBeInTheDocument();
    // Read-only banner in Plan 4.
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    // Director contact field surfaced (read-only input).
    expect(screen.getByDisplayValue('Mr Franck Versluys')).toBeInTheDocument();
  });
});

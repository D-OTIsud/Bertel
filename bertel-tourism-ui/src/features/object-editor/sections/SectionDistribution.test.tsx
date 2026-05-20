import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionDistribution } from './SectionDistribution';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionDistribution', () => {
  it('renders the distribution channels grouped by booking vs social', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionDistribution editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Distribution & réseaux sociaux')).toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
    expect(screen.getByText('booking.com/le-bel-air')).toBeInTheDocument();
    // Section is read-only in Plan 4 — the lecture seule banner must be shown.
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
  });
});

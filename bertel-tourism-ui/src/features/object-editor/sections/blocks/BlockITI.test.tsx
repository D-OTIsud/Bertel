import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockITI } from './BlockITI';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * §48 honesty sweep on the ITI block: the GPX dropzone has no upload pipeline and
 * object_iti.geom has no write path (the nested RPC skips geom) — it must read as
 * disabled-with-reason, not as an inviting drop target. The TRAIL_SEASON SeasonPicker
 * was a hardcoded mock (§34 pattern) — removed; the SeasonPicker primitive itself is
 * retained for the future seasonality feature.
 */
describe('BlockITI — honest controls (§48)', () => {
  it('renders the GPX zone as disabled-with-reason, not as a drop invitation', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Déposer un fichier GPX ou KML')).not.toBeInTheDocument();
    expect(screen.getByText(/import de données/i)).toBeInTheDocument();
  });

  it('renders no inert seasonal-availability picker', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Praticabilité saisonnière')).not.toBeInTheDocument();
    expect(screen.queryByText('JAN')).not.toBeInTheDocument();
  });

  it('renders the §46 notice instead of controls when the itinerary module is gated', () => {
    const modules = fullModulesFixture();
    modules.itinerary.unavailableReason = 'Module non applicable au type RES (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    // §46 gate: notice rendered exactly once
    expect(screen.getAllByText(/Module non applicable au type RES/).length).toBe(1);
    // Add buttons absent when gated (Repeater renders "+ {label}")
    expect(screen.queryByText(/Ajouter une étape \/ un POI/)).not.toBeInTheDocument();
    // Gated pill present
    expect(screen.getByText('Non applicable')).toBeInTheDocument();
  });

  it('renders the stages repeater add button and GPX disabled zone when NOT gated', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Ajouter une étape \/ un POI/)).toBeInTheDocument();
    // Disabled-with-reason text is present (not "Déposer un fichier GPX ou KML")
    expect(screen.getByText(/import de données/i)).toBeInTheDocument();
  });
});

import { fireEvent, render, renderHook, screen } from '@testing-library/react';
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
    expect(screen.getByText(/import de données/i).closest('.dropzone')).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders honest empty-trace pill and empty-state text when no geometry', () => {
    const modules = fullModulesFixture();
    modules.itinerary.geometrySummary = '';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    // The dropzone inner text still says "Aucune trace importée"
    expect(screen.getByText('Aucune trace importée')).toBeInTheDocument();
    // The pill must be the honest "no trace" label, not the stale "Trace verrouillée"
    expect(screen.getByText('Aucune trace — import requis')).toBeInTheDocument();
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

/**
 * §111 Phase B2/B3: the inert +/- steppers are wired (StatCard.onStep) and the
 * Difficulté / Statut d'ouverture free-text inputs (latent write-traps against an
 * INTEGER / enum column) become DB-vocab selects (iti_difficulty / iti_open_status).
 * Harness component so a patch re-renders the block (editor is recreated on change).
 */
function ItiHarness() {
  const editor = useObjectEditorState('o1', fullModulesFixture());
  return <BlockITI editor={editor} folded={false} />;
}

describe('BlockITI — §06 selects + steppers (§111 B2/B3)', () => {
  it('renders Difficulté and Statut d\'ouverture as DB-vocab selects, not free-text inputs', () => {
    render(<ItiHarness />);
    const difficulty = screen.getByRole('combobox', { name: 'Difficulté' });
    expect(difficulty.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Moyen' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Très difficile' })).toBeInTheDocument();
    // ReferenceSelect is stale-safe: a legacy free-text value is preserved, not blanked.
    expect((difficulty as HTMLSelectElement).value).toBe('modéré');
    expect(screen.getByRole('combobox', { name: "Statut d'ouverture" }).tagName).toBe('SELECT');
  });

  it('changing the Difficulté select switches to the picked code', () => {
    render(<ItiHarness />);
    const difficulty = screen.getByRole('combobox', { name: 'Difficulté' }) as HTMLSelectElement;
    fireEvent.change(difficulty, { target: { value: '3' } });
    expect(difficulty.value).toBe('3');
  });

  it('the Distance + stepper increments the displayed distance by 0.5', () => {
    render(<ItiHarness />);
    expect(screen.getByText('8.5')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Augmenter Distance'));
    expect(screen.getByText('9.0')).toBeInTheDocument();
  });

  it('§B5: renders the Infos pratiques block with the relocated Boucle + child-friendly toggles', () => {
    render(<ItiHarness />);
    expect(screen.getByText('Infos pratiques')).toBeInTheDocument();
    // object_iti_info field round-trips its value
    expect(screen.getByDisplayValue('Depuis le parking du col')).toBeInTheDocument();
    // is_loop is now grouped here as a boolean characteristic, next to is_child_friendly
    expect(screen.getByText('Tracé en boucle')).toBeInTheDocument();
    expect(screen.getByText('Adapté aux enfants')).toBeInTheDocument();
    // the old "Type de tracé" strip is gone
    expect(screen.queryByText('Type de tracé')).not.toBeInTheDocument();
  });

  it('§B4: practices are edited via a summary button → modal (not an inline chip wall)', () => {
    render(<ItiHarness />);
    // the summary button shows the selected practice; the modal is closed
    expect(screen.queryByText("Pratiques de l'itinéraire")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Randonnée'));
    // modal opens with the picker
    expect(screen.getByText("Pratiques de l'itinéraire")).toBeInTheDocument();
    // cancel closes it
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByText("Pratiques de l'itinéraire")).not.toBeInTheDocument();
  });
});

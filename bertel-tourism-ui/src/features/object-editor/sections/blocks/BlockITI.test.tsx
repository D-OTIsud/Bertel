import type { ReactNode } from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockITI } from './BlockITI';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

// react-map-gl/maplibre needs WebGL (absent in jsdom) — stub it for the §06 trace map + stage modal.
jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="iti-trace-map">{children}</div>,
  Source: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="iti-stage-marker">{children}</div>,
  NavigationControl: () => null,
}));

/**
 * §48 honesty sweep on the ITI block: the GPX dropzone has no upload pipeline and
 * object_iti.geom has no write path (the nested RPC skips geom) — it must read as
 * disabled-with-reason, not as an inviting drop target. The TRAIL_SEASON SeasonPicker
 * was a hardcoded mock (§34 pattern) — removed; the SeasonPicker primitive itself is
 * retained for the future seasonality feature.
 */
describe('BlockITI — honest controls (§48)', () => {
  it('§111 B1: renders the real GPX/KML import zone (the §48 disabled-with-reason placeholder is gone)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    // the §48 "géométrie gérée par l'import de données" disabled placeholder no longer exists
    expect(screen.queryByText(/import de données/i)).not.toBeInTheDocument();
    // the import is now actionable (set_itinerary_track pipeline)
    expect(screen.getByRole('button', { name: 'Importer un fichier' })).toBeInTheDocument();
  });

  it('renders the honest empty-trace pill and the import prompt when no geometry', () => {
    const modules = fullModulesFixture();
    modules.itinerary.geometrySummary = '';
    modules.itinerary.trackGeojson = null;
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    // the import zone invites a drop when there is no trace
    expect(screen.getByText('Glissez un fichier GPX / KML')).toBeInTheDocument();
    // the pill must be the honest "no trace" label
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

  it('renders the stages repeater add button and the GPX import zone when NOT gated', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Ajouter une étape \/ un POI/)).toBeInTheDocument();
    // the real import zone is present (B1 replaced the §48 disabled-with-reason placeholder)
    expect(screen.getByRole('button', { name: 'Importer un fichier' })).toBeInTheDocument();
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

  it('§C1: renders stages as cards with the explicit type label + a Modifier action (no D/A guess)', () => {
    render(<ItiHarness />);
    // the stage name from the fixture
    expect(screen.getByText('Belvédère du Maïdo')).toBeInTheDocument();
    // explicit type + GPS-point meta (replaces the old position-derived D/A)
    expect(screen.getByText(/Panorama · point GPS/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  });

  it('§C2: Modifier opens the detailed stage modal (type select, name, corridor slider)', () => {
    render(<ItiHarness />);
    expect(screen.queryByText("Étape / point d'intérêt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByText("Étape / point d'intérêt")).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: "Type d'étape" })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Belvédère du Maïdo')).toBeInTheDocument();
    // corridor slider present because the fixture has an imported trace
    expect(screen.getByLabelText('Largeur du corridor en mètres')).toBeInTheDocument();
  });

  it('§C3: renders the objets liés block with the linked object, its role label, and an add button', () => {
    render(<ItiHarness />);
    expect(screen.getByText('Objets liés')).toBeInTheDocument();
    // the linked object from the fixture + its role resolved from the role id
    expect(screen.getByText('Snack du Maïdo')).toBeInTheDocument();
    expect(screen.getByText(/Restauration/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Ajouter un objet lié' })).toBeInTheDocument();
  });
});

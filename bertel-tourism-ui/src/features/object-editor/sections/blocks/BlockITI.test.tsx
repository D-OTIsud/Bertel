import type { ReactNode } from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ObjectWorkspaceModules } from '../../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../../services/object-workspace';
import { buildItineraryUpsertPayload } from '../../../../services/object-workspace-payloads/itinerary';
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
    expect(screen.getByRole('button', { name: 'Remplacer le tracé' })).toBeInTheDocument();
  });

  it('renders the honest empty-trace pill and the import prompt when no geometry', () => {
    const modules = fullModulesFixture();
    modules.itinerary.geometrySummary = '';
    modules.itinerary.trackGeojson = null;
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    // the import zone invites a drop when there is no trace
    expect(screen.getByText('Glissez un fichier GPX / KML sur la carte.')).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Ajouter une étape' })).not.toBeInTheDocument();
    // Gated pill present
    expect(screen.getByText('Non applicable')).toBeInTheDocument();
  });

  it('renders the stages repeater add button and the GPX import zone when NOT gated', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.getByRole('button', { name: 'Ajouter une étape' })).toBeInTheDocument();
    // the real import zone is present (B1 replaced the §48 disabled-with-reason placeholder)
    expect(screen.getByRole('button', { name: 'Remplacer le tracé' })).toBeInTheDocument();
  });
});

/**
 * §111 Phase B2/B3: the inert +/- steppers are wired (StatCard.onStep) and the
 * Difficulté / Statut d'ouverture free-text inputs (latent write-traps against an
 * INTEGER / enum column) become DB-vocab selects (iti_difficulty / iti_open_status).
 * Harness component so a patch re-renders the block (editor is recreated on change).
 */
function ItiHarness({ modules = fullModulesFixture(), permissions = allowAll }: { modules?: ObjectWorkspaceModules; permissions?: ObjectWorkspacePermissions }) {
  const editor = useObjectEditorState('o1', modules);
  return <><BlockITI editor={editor} permissions={permissions} folded={false} /><output data-testid="saved-stages">{JSON.stringify(editor.draft.itinerary.stages)}</output><output data-testid="itinerary-payload">{JSON.stringify(buildItineraryUpsertPayload('o1', editor.draft.itinerary))}</output></>;
}

function itineraryPayload(): ReturnType<typeof buildItineraryUpsertPayload> {
  return JSON.parse(screen.getByTestId('itinerary-payload').textContent!);
}

describe('BlockITI — §06 selects + steppers (§111 B2/B3)', () => {
  it('cancels a new stage without adding an empty row or altering existing stages', () => {
    render(<ItiHarness />);
    const before = screen.getByTestId('saved-stages').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    fireEvent.change(screen.getByLabelText(/Nom de l’étape/), { target: { value: 'Brouillon' } });
    expect(screen.getByTestId('saved-stages').textContent).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByTestId('saved-stages').textContent).toBe(before);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('commits a stage while preserving its translations, metadata and attached media', () => {
    const modules = fullModulesFixture();
    modules.itinerary.stages[0] = { ...modules.itinerary.stages[0], mediaIds: ['media-1'], nameTranslations: { en: 'Viewpoint' }, extra: { source: 'import' } };
    render(<ItiHarness modules={modules} />);
    fireEvent.click(screen.getByRole('button', { name: 'Étape 1 : Belvédère du Maïdo' }));
    fireEvent.change(screen.getByLabelText(/Nom de l’étape/), { target: { value: 'Nouveau belvédère' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’étape' }));
    expect(JSON.parse(screen.getByTestId('saved-stages').textContent!)[0]).toMatchObject({ name: 'Nouveau belvédère', recordId: 'st1', mediaIds: ['media-1'], nameTranslations: { en: 'Viewpoint' }, extra: { source: 'import' } });
  });

  it('rejects manual coordinates outside the trail corridor without saving them', () => {
    render(<ItiHarness />);
    const before = screen.getByTestId('saved-stages').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Modifier l’étape 1 : Belvédère du Maïdo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Coordonnées GPS' }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’étape' }));
    expect(screen.getByRole('alert')).toHaveTextContent('plus de 50 m');
    expect(screen.getByTestId('saved-stages').textContent).toBe(before);
  });

  it('renumbers stages after keyboard-accessible reordering', () => {
    const modules = fullModulesFixture();
    modules.itinerary.stages.push({ ...modules.itinerary.stages[0], recordId: 'st2', name: 'Cascade', position: '2' });
    render(<ItiHarness modules={modules} />);
    fireEvent.click(screen.getByRole('button', { name: 'Monter Cascade' }));
    expect(JSON.parse(screen.getByTestId('saved-stages').textContent!).map((s: { name: string; position: string }) => [s.name, s.position])).toEqual([['Cascade', '1'], ['Belvédère du Maïdo', '2']]);
    expect(screen.getByRole('button', { name: 'Étape 1 : Cascade' })).toBeInTheDocument();
  });

  it('keeps public numbering contiguous after removing an intermediate stage', () => {
    const modules = fullModulesFixture();
    modules.itinerary.stages.push({ ...modules.itinerary.stages[0], recordId: 'st2', name: 'Cascade', position: '5' });
    render(<ItiHarness modules={modules} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier l’étape 1 : Belvédère du Maïdo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer cette étape' }));
    expect(JSON.parse(screen.getByTestId('saved-stages').textContent!)).toEqual([expect.objectContaining({ name: 'Cascade', position: '1' })]);
  });
  it('renders Difficulté and Statut d\'ouverture as DB-vocab selects, not free-text inputs', () => {
    render(<ItiHarness />);
    const difficulty = screen.getByRole('combobox', { name: 'Difficulté' });
    expect(difficulty.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Moyen' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Très difficile' })).toBeInTheDocument();
    // ReferenceSelect is stale-safe: a legacy free-text value is preserved, not blanked.
    expect((difficulty as HTMLSelectElement).value).toBe('modéré');
    fireEvent.click(screen.getByRole('button', { name: /Praticabilité & fermetures/ }));
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
    expect(screen.getByLabelText('Distance')).toHaveValue('8.5');
    fireEvent.click(screen.getByLabelText('Augmenter Distance'));
    expect(screen.getByLabelText('Distance')).toHaveValue('9.0');
  });

  it.each(['2,175', '2.175'])('accepts exact distance %s and keeps its precision through both shortcuts', (value) => {
    render(<ItiHarness />);
    const distance = screen.getByLabelText('Distance');
    expect(distance).toHaveAttribute('inputmode', 'decimal');
    fireEvent.change(distance, { target: { value } });
    expect(itineraryPayload().distance_km).toBe(2.175);

    fireEvent.click(screen.getByLabelText('Augmenter Distance'));
    expect(itineraryPayload().distance_km).toBe(2.675);
    fireEvent.click(screen.getByLabelText('Diminuer Distance'));
    expect(itineraryPayload().distance_km).toBe(2.175);
  });

  it('accepts separate hours and minutes and keeps them synchronized with duration shortcuts', () => {
    render(<ItiHarness />);
    const hours = screen.getByLabelText('Durée, heures');
    const minutes = screen.getByLabelText('Durée, minutes');
    expect(hours).toHaveAttribute('inputmode', 'numeric');
    expect(minutes).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(hours, { target: { value: '2' } });
    fireEvent.change(minutes, { target: { value: '37' } });
    expect(itineraryPayload().duration_min).toBe(157);

    fireEvent.click(screen.getByLabelText('Augmenter Durée'));
    expect(hours).toHaveValue('2');
    expect(minutes).toHaveValue('52');
    expect(itineraryPayload().duration_min).toBe(172);
    fireEvent.click(screen.getByLabelText('Diminuer Durée'));
    expect(minutes).toHaveValue('37');
    expect(itineraryPayload().duration_min).toBe(157);
  });

  it('normalizes excess minutes after editing without dropping duration precision', () => {
    render(<ItiHarness />);
    const hours = screen.getByLabelText('Durée, heures');
    const minutes = screen.getByLabelText('Durée, minutes');
    fireEvent.change(hours, { target: { value: '2' } });
    fireEvent.change(minutes, { target: { value: '90' } });
    expect(itineraryPayload().duration_min).toBe(210);
    fireEvent.blur(minutes);
    expect(hours).toHaveValue('3');
    expect(minutes).toHaveValue('30');
    expect(itineraryPayload().duration_min).toBe(210);
  });

  it('accepts exact elevation values independently and retains both shortcuts', () => {
    render(<ItiHarness />);
    const gain = screen.getByLabelText('Dénivelé +');
    const loss = screen.getByLabelText('Dénivelé −');
    expect(gain).toHaveAttribute('inputmode', 'numeric');
    expect(loss).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(gain, { target: { value: '173' } });
    fireEvent.change(loss, { target: { value: '169' } });
    expect(itineraryPayload()).toMatchObject({ elevation_gain: 173, elevation_loss: 169 });

    fireEvent.click(screen.getByLabelText('Augmenter Dénivelé +'));
    expect(itineraryPayload()).toMatchObject({ elevation_gain: 183, elevation_loss: 169 });
    fireEvent.click(screen.getByLabelText('Diminuer Dénivelé −'));
    expect(itineraryPayload()).toMatchObject({ elevation_gain: 183, elevation_loss: 159 });
  });

  it('lets all four metrics be cleared without turning unknown values into zero', () => {
    render(<ItiHarness />);
    for (const label of ['Distance', 'Durée, heures', 'Durée, minutes', 'Dénivelé +', 'Dénivelé −']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    }
    for (const label of ['Distance', 'Durée, heures', 'Durée, minutes', 'Dénivelé +', 'Dénivelé −']) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }
    expect(itineraryPayload()).toMatchObject({ distance_km: null, duration_min: null, elevation_gain: null, elevation_loss: null });
  });

  it('keeps a cleared hour segment blank while tabbing to clear the remaining minutes', () => {
    render(<ItiHarness />);
    const hours = screen.getByLabelText('Durée, heures');
    const minutes = screen.getByLabelText('Durée, minutes');
    fireEvent.focus(hours);
    fireEvent.change(hours, { target: { value: '' } });
    fireEvent.blur(hours, { relatedTarget: minutes });
    fireEvent.focus(minutes, { relatedTarget: hours });
    expect(hours).toHaveValue('');
    fireEvent.change(minutes, { target: { value: '' } });
    fireEvent.blur(minutes, { relatedTarget: screen.getByLabelText('Distance') });
    expect(hours).toHaveValue('');
    expect(minutes).toHaveValue('');
    expect(itineraryPayload().duration_min).toBeNull();
  });

  it('rejects negative and malformed metrics and fractional minute/metre values', () => {
    render(<ItiHarness />);
    const before = itineraryPayload();
    const invalidByLabel: Record<string, string[]> = {
      Distance: ['-1', '12abc', '1,2.3'],
      'Durée, heures': ['-1', '1.5', 'abc'],
      'Durée, minutes': ['-1', '1.5', 'abc'],
      'Dénivelé +': ['-1', '173.5', '12abc'],
      'Dénivelé −': ['-1', '169,5', '1e3'],
    };
    for (const [label, values] of Object.entries(invalidByLabel)) {
      const field = screen.getByLabelText(label);
      for (const value of values) fireEvent.change(field, { target: { value } });
    }
    expect(itineraryPayload()).toEqual(before);
  });

  it('keeps metric inputs and shortcuts disabled without itinerary write or proposal permissions', () => {
    const permissions = new Proxy(allowAll, {
      get(target, key) {
        const permission = Reflect.get(target, key);
        return key === 'itinerary'
          ? { ...permission, canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false }
          : permission;
      },
    });
    render(<ItiHarness permissions={permissions} />);
    for (const label of ['Distance', 'Durée, heures', 'Durée, minutes', 'Dénivelé +', 'Dénivelé −']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    for (const metric of ['Distance', 'Durée', 'Dénivelé +', 'Dénivelé −']) {
      expect(screen.getByLabelText(`Augmenter ${metric}`)).toBeDisabled();
      expect(screen.getByLabelText(`Diminuer ${metric}`)).toBeDisabled();
    }
  });

  it('§B5: renders the Infos pratiques block with the relocated Boucle + child-friendly toggles', () => {
    render(<ItiHarness />);
    expect(screen.getByText('Conseils & accès au départ')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Modifier l’étape 1 : Belvédère du Maïdo' })).toBeInTheDocument();
  });

  it('edits the selected stage beside the same map, with the corridor control', () => {
    render(<ItiHarness />);
    expect(screen.queryByRole('dialog', { name: 'Modifier l’étape' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier l’étape 1 : Belvédère du Maïdo' }));
    expect(screen.getByRole('form', { name: 'Modifier l’étape' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('iti-trace-map')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Type d’étape' })).toBeInTheDocument();
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

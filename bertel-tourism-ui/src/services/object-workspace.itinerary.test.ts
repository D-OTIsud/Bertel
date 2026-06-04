import { buildItineraryUpsertPayload, buildItineraryStagesPayload } from './object-workspace';
import type { ObjectWorkspaceItineraryModule } from './object-workspace-parser';

// Pins the object_iti WRITE contract to the REAL columns after the greenfield retype
// (duration_hours -> duration_min INTEGER; elevation_gain + elevation_loss).
// The previous save wrote elevation_positive_m / elevation_negative_m, which do NOT exist
// in the object_iti DDL — so every itinerary save silently failed. This test guards against
// regressing to non-existent columns.
const baseInput: ObjectWorkspaceItineraryModule = {
  distanceKm: '8.5',
  durationMin: '120',
  difficultyLevel: '3',
  elevationPositiveM: '500',
  elevationNegativeM: '480',
  loop: false,
  openStatus: 'open',
  statusNote: '',
  practiceOptions: [],
  practiceCodes: [],
  stages: [],
  sectionsCount: 0,
  profilesCount: 0,
  geometrySummary: '',
  traceEditable: false,
  unavailableReason: null,
};

describe('buildItineraryUpsertPayload', () => {
  it('maps editor fields to the real object_iti columns', () => {
    const p = buildItineraryUpsertPayload('ITI1', baseInput);
    expect(p).toMatchObject({
      object_id: 'ITI1',
      distance_km: 8.5,
      duration_min: 120,        // minutes, stored directly (no hours round-trip)
      elevation_gain: 500,      // was elevation_positive_m (non-existent)
      elevation_loss: 480,      // was elevation_negative_m (non-existent)
      is_loop: false,
      open_status: 'open',
    });
  });

  it('never writes columns absent from the object_iti DDL', () => {
    const p = buildItineraryUpsertPayload('ITI1', baseInput) as Record<string, unknown>;
    expect('elevation_positive_m' in p).toBe(false);
    expect('elevation_negative_m' in p).toBe(false);
    expect('duration_hours' in p).toBe(false);
  });

  it('coerces empty numeric strings to null', () => {
    const p = buildItineraryUpsertPayload('ITI1', {
      ...baseInput,
      durationMin: '',
      elevationPositiveM: '',
      elevationNegativeM: '',
    });
    expect(p.duration_min).toBeNull();
    expect(p.elevation_gain).toBeNull();
    expect(p.elevation_loss).toBeNull();
  });
});

describe('buildItineraryStagesPayload', () => {
  // Phase 1: stages persist via api.save_object_itinerary_nested, which replaces all stages
  // (delete + reinsert). The editor manages stages (BlockITI / SectionPlaces add/edit/remove),
  // so module.stages is the source of truth; the guard below avoids clobbering on a failed load.
  const stages = [
    { recordId: 'stage-1', name: 'Col de Bellevue', description: 'Point haut', position: '1' },
    { recordId: null, name: 'Nouvelle etape', description: '', position: '2' },
  ];

  it('maps managed stages to the RPC shape — recordId becomes id, new rows omit id', () => {
    expect(buildItineraryStagesPayload({ ...baseInput, stages })).toEqual([
      { id: 'stage-1', name: 'Col de Bellevue', description: 'Point haut', position: '1' },
      { name: 'Nouvelle etape', description: '', position: '2' },
    ]);
  });

  it('returns null when the module did not load (guard against clobbering existing stages)', () => {
    expect(
      buildItineraryStagesPayload({ ...baseInput, stages, unavailableReason: 'Le live ne fournit pas le detail.' }),
    ).toBeNull();
  });

  it('returns [] for a loaded module with no stages (intentional clear)', () => {
    expect(buildItineraryStagesPayload(baseInput)).toEqual([]);
  });
});

import { buildItineraryUpsertPayload } from './object-workspace';
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

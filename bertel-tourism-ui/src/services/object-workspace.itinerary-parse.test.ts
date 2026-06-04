import { parseWorkspaceItineraryModule } from './object-workspace-parser';

// Pins the itinerary READ contract to the api.get_object_resource payload after the greenfield retype:
// the resource emits duration_min + elevation_gain + elevation_loss (never duration_hours / *_positive_m).
describe('parseWorkspaceItineraryModule', () => {
  it('reads duration_min, elevation_gain and elevation_loss from the itinerary payload', () => {
    const m = parseWorkspaceItineraryModule({
      itinerary: {
        distance_km: 8.5,
        duration_min: 120,
        difficulty_level: 3,
        elevation_gain: 500,
        elevation_loss: 480,
        is_loop: false,
        open_status: 'open',
      },
    });
    expect(m.durationMin).toBe('120');
    expect(m.elevationPositiveM).toBe('500');
    expect(m.elevationNegativeM).toBe('480'); // from elevation_loss
  });
});

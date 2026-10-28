import { parseWorkspaceItineraryModule } from './object-workspace-parser';

// Pins the itinerary READ contract to the api.get_object_resource payload after the greenfield retype:
// the resource emits duration_min + elevation_gain + elevation_loss (never duration_hours / *_positive_m).
describe('parseWorkspaceItineraryModule', () => {
  it('reads the existing serialized GeoJSON track and prefers the native geometry', () => {
    const line = { type: 'LineString', coordinates: [[55.5, -21], [55.51, -21.01]] };
    expect(parseWorkspaceItineraryModule({ itinerary: { track_format: 'geojson', track: JSON.stringify(line) } }).trackGeojson).toEqual(line);
    expect(parseWorkspaceItineraryModule({ itinerary_details: { track_geojson: line }, itinerary: { track_format: 'geojson', track: 'invalid' } }).trackGeojson).toEqual(line);
    expect(parseWorkspaceItineraryModule({ itinerary: { track_format: 'geojson', track: '{invalid' } }).trackGeojson).toBeNull();
    expect(parseWorkspaceItineraryModule({ itinerary_details: { track_geojson: { type: 'LineString', coordinates: [[999, 1], [3, 5]] } } }).trackGeojson).toBeNull();
  });
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

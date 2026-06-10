import { facetUnavailableReason, TYPE_SPECIFIC_MODULE_FACETS } from './object-workspace';

const ROWS = [
  { facetTable: 'object_room_type', objectType: 'HOT' },
  { facetTable: 'object_room_type', objectType: 'HLO' },
  { facetTable: 'object_menu', objectType: 'RES' },
];

describe('facetUnavailableReason (§46 registry gating)', () => {
  it('returns null when the type is applicable', () => {
    expect(facetUnavailableReason('object_room_type', 'HOT', ROWS)).toBeNull();
  });
  it('returns a reason when the type is not applicable', () => {
    expect(facetUnavailableReason('object_menu', 'HOT', ROWS)).toMatch(/non applicable au type HOT/);
  });
  it('fails open when the registry has no rows for that facet (fetch failed / unenrolled)', () => {
    expect(facetUnavailableReason('object_iti', 'HOT', ROWS)).toBeNull();
    expect(facetUnavailableReason('object_menu', 'RES', [])).toBeNull();
  });
  it('fails open when the object type is unknown', () => {
    expect(facetUnavailableReason('object_menu', '', ROWS)).toBeNull();
  });
  it('covers exactly the 6 type-specific modules', () => {
    expect(Object.keys(TYPE_SPECIFIC_MODULE_FACETS).sort()).toEqual(
      ['activity', 'event', 'itinerary', 'meetingRooms', 'menus', 'rooms'].sort(),
    );
  });
});

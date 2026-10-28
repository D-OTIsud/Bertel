import { itineraryMapBounds, itineraryStagePoint } from './itinerary-map-utils';

describe('itinerary map coordinates', () => {
  it('never turns missing coordinates into a point at zero, while allowing a real zero coordinate', () => {
    expect(itineraryStagePoint({ lng: '', lat: '' })).toBeNull();
    expect(itineraryStagePoint({ lng: '55.5', lat: '' })).toBeNull();
    expect(itineraryStagePoint({ lng: '999', lat: '-21' })).toBeNull();
    expect(itineraryStagePoint({ lng: '0', lat: '0' })).toEqual([0, 0]);
  });
  it('frames the complete route and its stages and ignores malformed positions', () => {
    expect(itineraryMapBounds([[55.4, -21.4], [55.6, -21.1], [55.3, -21.2], [NaN, 1]]))
      .toEqual([55.3, -21.4, 55.6, -21.1]);
    expect(itineraryMapBounds([])).toBeNull();
  });
});

import { buildItiTrackFeatureCollection, parseItiTrack } from './iti-tracks';

const LINE = { type: 'LineString', coordinates: [[55.5, -21.1], [55.6, -21.2]] };

describe('parseItiTrack (D18)', () => {
  it('parse un track GeoJSON en chaîne (LineString nu)', () => {
    const track = parseItiTrack('iti-1', { name: 'Sentier', itinerary: { track: JSON.stringify(LINE) } });
    expect(track.id).toBe('iti-1');
    expect(track.name).toBe('Sentier');
    expect(track.lines).toHaveLength(1);
    expect(track.lines[0].type).toBe('LineString');
  });

  it('déballe Feature / FeatureCollection / GeometryCollection et ignore les Points', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: LINE, properties: {} },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [55.5, -21.1] }, properties: {} },
        { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [{ type: 'MultiLineString', coordinates: [[[55.5, -21.1], [55.51, -21.11]]] }] }, properties: {} },
      ],
    };
    const track = parseItiTrack('iti-2', { itinerary: { track: fc } });
    expect(track.lines.map((line) => line.type)).toEqual(['LineString', 'MultiLineString']);
  });

  it('un track non-GeoJSON (gpx brut) ne produit aucune ligne', () => {
    const track = parseItiTrack('iti-3', { itinerary: { track: '<gpx>…</gpx>', track_format: 'gpx' } });
    expect(track.lines).toHaveLength(0);
  });

  it('extrait les étapes lng/lat triées par position et ignore celles sans point', () => {
    const track = parseItiTrack('iti-4', {
      itinerary: { track: JSON.stringify(LINE) },
      itinerary_details: {
        stages: [
          { position: 2, name: 'Cascade', lat: -21.2, lng: 55.6 },
          { position: 1, name: 'Départ', lat: -21.1, lng: 55.5 },
          { position: 3, name: 'Sans point', lat: null, lng: null },
        ],
      },
    });
    expect(track.stages.map((s) => s.name)).toEqual(['Départ', 'Cascade']);
  });

  it('numérote depuis l’index quand position manque', () => {
    const track = parseItiTrack('iti-5', {
      itinerary_details: { stages: [{ name: 'A', lat: -21, lng: 55 }, { name: 'B', lat: -21.01, lng: 55.01 }] },
    });
    expect(track.stages.map((s) => s.position)).toEqual([1, 2]);
  });
});

describe('buildItiTrackFeatureCollection (D18)', () => {
  it('une feature par géométrie, props id/name', () => {
    const track = parseItiTrack('iti-1', { name: 'Sentier', itinerary: { track: JSON.stringify(LINE) } });
    const fc = buildItiTrackFeatureCollection([track, { id: 'iti-x', name: 'Vide', lines: [], stages: [] }]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ id: 'iti-1', name: 'Sentier' });
  });
});

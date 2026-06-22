import { detectTrackFormat, mergeFeaturesToLineString, parseTrackFile } from './gpx-import';

describe('detectTrackFormat', () => {
  it('detects gpx/kml case-insensitively, null otherwise', () => {
    expect(detectTrackFormat('rando.gpx')).toBe('gpx');
    expect(detectTrackFormat('RANDO.GPX')).toBe('gpx');
    expect(detectTrackFormat('rando.kml')).toBe('kml');
    expect(detectTrackFormat('rando.txt')).toBeNull();
  });
});

describe('mergeFeaturesToLineString', () => {
  it('merges LineString + MultiLineString features into one LineString, preserving elevation', () => {
    const fc = {
      features: [
        { geometry: { type: 'LineString', coordinates: [[55.5, -21, 100], [55.51, -21, 150]] } },
        { geometry: { type: 'MultiLineString', coordinates: [[[55.52, -21, 120]], [[55.53, -21, 200]]] } },
      ],
    };
    expect(mergeFeaturesToLineString(fc)).toEqual({
      type: 'LineString',
      coordinates: [[55.5, -21, 100], [55.51, -21, 150], [55.52, -21, 120], [55.53, -21, 200]],
    });
  });

  it('ignores non-line geometries and returns null when < 2 points', () => {
    expect(mergeFeaturesToLineString({ features: [] })).toBeNull();
    expect(mergeFeaturesToLineString({ features: [{ geometry: { type: 'Point', coordinates: [1, 2] } }] })).toBeNull();
    expect(mergeFeaturesToLineString({ features: [null, { geometry: null }] })).toBeNull();
  });
});

describe('parseTrackFile', () => {
  it('parses a multi-segment GPX into one merged LineString with elevation (Z)', () => {
    const gpxText =
      '<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>' +
      '<trkpt lat="-21.0" lon="55.50"><ele>100</ele></trkpt>' +
      '<trkpt lat="-21.0" lon="55.51"><ele>150</ele></trkpt></trkseg>' +
      '<trkseg><trkpt lat="-21.0" lon="55.52"><ele>120</ele></trkpt>' +
      '<trkpt lat="-21.0" lon="55.53"><ele>200</ele></trkpt></trkseg></trk></gpx>';
    const line = parseTrackFile(gpxText, 'track.gpx');
    expect(line.type).toBe('LineString');
    expect(line.coordinates).toHaveLength(4);
    expect(line.coordinates[0]).toEqual([55.5, -21, 100]);
    expect(line.coordinates[3]).toEqual([55.53, -21, 200]);
  });

  it('parses a KML LineString', () => {
    const kmlText =
      '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>' +
      '<LineString><coordinates>55.50,-21.0,100 55.52,-21.0,200</coordinates></LineString>' +
      '</Placemark></Document></kml>';
    const line = parseTrackFile(kmlText, 'track.kml');
    expect(line.coordinates).toHaveLength(2);
  });

  it('throws on an unsupported extension', () => {
    expect(() => parseTrackFile('x', 'photo.txt')).toThrow(/Format non supporté/);
  });

  it('throws when the file has no track', () => {
    expect(() => parseTrackFile('<gpx></gpx>', 'empty.gpx')).toThrow(/Aucun tracé/);
  });
});

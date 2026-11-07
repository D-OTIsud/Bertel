jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({ demoMode: false })),
    subscribe: jest.fn(() => () => {}),
  },
}));
jest.mock('../data/mock', () => ({
  mockObjectDetails: {},
  filterMockCards: jest.fn(),
  mockAuditQuestions: [],
  mockPublicationCards: [],
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mockObjectDetails } from '../data/mock';
import { getObjectItineraryGpx } from './rpc';
import { parseTrackFile } from '../features/object-editor/sections/blocks/gpx-import';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;
const mockDetails = mockObjectDetails as Record<string, { name?: string; raw: Record<string, unknown> }>;

describe('getObjectItineraryGpx (PLAN 4.5)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    mockGetState.mockReturnValue({ demoMode: false });
    for (const key of Object.keys(mockDetails)) delete mockDetails[key];
  });

  it('appelle get_object_resource en gpx et renvoie la trace', async () => {
    rpc.mockResolvedValue({ data: { itinerary: { track: '<gpx>...</gpx>' } }, error: null });

    const track = await getObjectItineraryGpx('ITIRUN1', ['fr']);

    expect(track).toBe('<gpx>...</gpx>');
    expect(rpc).toHaveBeenCalledWith('get_object_resource', expect.objectContaining({
      p_object_id: 'ITIRUN1',
      p_lang_prefs: ['fr'],
      p_track_format: 'gpx',
      p_options: expect.objectContaining({
        fields: [],
        include_stages: true,
        render: false,
        include_private: true,
      }),
    }));
  });

  it('lève une erreur quand la trace est absente/vide', async () => {
    rpc.mockResolvedValue({ data: { itinerary: {} }, error: null });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toThrow(/indisponible/i);

    rpc.mockResolvedValue({ data: { itinerary: { track: '   ' } }, error: null });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toThrow(/indisponible/i);
  });

  it('propage une erreur RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toBeTruthy();
  });

  it('mode démo : préserve une trace GPX existante', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    const gpx = '<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="-21.1" lon="55.4"/><trkpt lat="-21.2" lon="55.5"/></trkseg></trk></gpx>';
    mockDetails['ITIRUN1'] = { raw: { itinerary: { track: gpx, track_format: 'gpx' } } };
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).resolves.toBe(gpx);
    expect(mockGetApiClient).not.toHaveBeenCalled();
  });

  it('mode démo : convertit le GeoJSON en GPX lisible, avec coordonnées, altitude et étapes réelles', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    const coordinates = [[55.4, -21.1, 125], [55.45, -21.15, 180], [55.5, -21.2, 150]];
    mockDetails['ITIRUN1'] = {
      name: 'Sentier & <remparts>',
      raw: {
        itinerary: { track_format: 'geojson', track: JSON.stringify({ type: 'LineString', coordinates }) },
        itinerary_details: { stages: [
          { name: 'Cascade <aval>', lng: 55.5, lat: -21.2, position: 2 },
          { name: 'Départ & parking', lng: 55.4, lat: -21.1, position: 1 },
          { name: 'Étape sans GPS', lng: null, lat: null },
          { name: 'Coordonnées invalides', lng: 200, lat: -21.1 },
        ] },
      },
    };

    const gpx = await getObjectItineraryGpx('ITIRUN1', ['fr']);
    const xml = new DOMParser().parseFromString(gpx, 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.documentElement.localName).toBe('gpx');
    expect(xml.documentElement.namespaceURI).toBe('http://www.topografix.com/GPX/1/1');
    expect(xml.querySelector('trk > name')?.textContent).toBe('Sentier & <remparts>');
    expect(Array.from(xml.querySelectorAll('wpt')).map((point) => [point.getAttribute('lon'), point.getAttribute('lat'), point.querySelector('name')?.textContent]))
      .toEqual([['55.4', '-21.1', 'Départ & parking'], ['55.5', '-21.2', 'Cascade <aval>']]);
    expect(parseTrackFile(gpx, 'parcours.gpx')).toEqual({ type: 'LineString', coordinates });
    expect(mockGetApiClient).not.toHaveBeenCalled();
  });

  it('mode démo : accepte le GeoJSON du détail et préserve ses segments séparés', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    mockDetails['ITIRUN1'] = { raw: { itinerary_details: { track_geojson: {
      type: 'MultiLineString',
      coordinates: [[[55.4, -21.1], [55.45, -21.15]], [[55.46, -21.16], [55.5, -21.2]]],
    } } } };
    const xml = new DOMParser().parseFromString(await getObjectItineraryGpx('ITIRUN1', ['fr']), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelectorAll('trkseg')).toHaveLength(2);
    expect(xml.querySelectorAll('trkpt')).toHaveLength(4);
  });

  it('mode démo : lève une erreur si aucune trace mock', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toThrow(/indisponible/i);
  });
});

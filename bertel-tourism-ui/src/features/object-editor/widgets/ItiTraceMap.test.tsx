import type { ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { ItiTraceMap } from './ItiTraceMap';

let mockMapProps: any;
const mockFitBounds = jest.fn();
jest.mock('react-map-gl/maplibre', () => ({
  Map: require('react').forwardRef((props: { children?: ReactNode }, ref: unknown) => {
    require('react').useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds }));
    mockMapProps = props;
    return <div data-testid="map">{props.children}</div>;
  }),
  Source: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="marker">{children}</div>,
  NavigationControl: () => null,
}));

function stage(over: Partial<import('../../../services/object-workspace-parser').ObjectWorkspaceItineraryStageSummary>) {
  return { recordId: null, name: '', description: '', position: '1', kind: '', lng: '', lat: '', mediaIds: [], ...over };
}

const saveTrackMock = jest.fn();
jest.mock('../../../services/object-workspace', () => ({
  saveObjectWorkspaceItineraryTrack: (...args: unknown[]) => saveTrackMock(...args),
}));

describe('ItiTraceMap (§111 B1)', () => {
  beforeEach(() => { saveTrackMock.mockReset(); mockFitBounds.mockClear(); });

  it('prevents a file drop from navigating away or importing while the track is locked', () => {
    const onImported = jest.fn();
    const view = render(<ItiTraceMap objectId="ITI1" initialTrack={null} onImported={onImported} importDisabled />);
    const prevented = !fireEvent.drop(view.getByRole('group', { name: 'Carte du parcours et de ses étapes' }), { dataTransfer: { files: [{ name: 'track.gpx' }] } });
    expect(prevented).toBe(true);
    expect(view.getByRole('button', { name: 'Importer un fichier' })).toBeDisabled();
    expect(saveTrackMock).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('shows corridor errors on the active placement map where the user clicked', () => {
    const { getByRole } = render(<ItiTraceMap objectId="ITI1" initialTrack={null} onImported={jest.fn()} placementActive placementError="Le point est à plus de 50 m du tracé." />);
    expect(getByRole('alert')).toHaveTextContent('plus de 50 m');
    expect(getByRole('alert')).toHaveClass('iti-trace-map__notice');
  });

  it('fits the whole route on load and resize, and only places points in explicit placement mode', () => {
    const onPlacePoint = jest.fn();
    const line = { type: 'LineString', coordinates: [[55.3, -21.4], [55.6, -21.1]] };
    const view = render(<ItiTraceMap objectId="ITI1" initialTrack={line} onImported={jest.fn()} onPlacePoint={onPlacePoint} />);
    act(() => { mockMapProps.onLoad(); mockMapProps.onResize(); mockMapProps.onClick({ lngLat: { lng: 55.4, lat: -21.2 } }); });
    expect(mockFitBounds).toHaveBeenLastCalledWith([55.3, -21.4, 55.6, -21.1], expect.objectContaining({ maxZoom: 16, duration: 0 }));
    expect(onPlacePoint).not.toHaveBeenCalled();
    view.rerender(<ItiTraceMap objectId="ITI1" initialTrack={line} onImported={jest.fn()} onPlacePoint={onPlacePoint} placementActive />);
    act(() => mockMapProps.onClick({ lngLat: { lng: 55.4, lat: -21.2 } }));
    expect(onPlacePoint).toHaveBeenCalledWith(55.4, -21.2);
  });

  it('keeps the current track when a replacement cannot be saved', async () => {
    saveTrackMock.mockRejectedValue(new Error('Enregistrement impossible'));
    const line = { type: 'LineString', coordinates: [[55.5, -21], [55.51, -21]] };
    const onImported = jest.fn();
    const { container, findByRole, getByRole } = render(<ItiTraceMap objectId="ITI1" initialTrack={line} onImported={onImported} />);
    const file = { name: 'new.gpx', text: () => Promise.resolve('<gpx><trk><trkseg><trkpt lat="-21" lon="55.5"/><trkpt lat="-21" lon="55.51"/></trkseg></trk></gpx>') } as File;
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await findByRole('alert')).toHaveTextContent('Enregistrement impossible');
    expect(getByRole('button', { name: 'Remplacer le tracé' })).toBeEnabled();
    expect(mockMapProps.initialViewState.bounds).toEqual([55.5, -21, 55.51, -21]);
    expect(onImported).not.toHaveBeenCalled();
  });

  it('imports a GPX, calls set_itinerary_track, and reports the geometry + metrics to the draft', async () => {
    saveTrackMock.mockResolvedValue({ distanceKm: '3.1', elevationGain: '130', elevationLoss: '30', hasElevation: true });
    const onImported = jest.fn();
    const { container } = render(<ItiTraceMap objectId="ITI1" initialTrack={null} onImported={onImported} />);

    const gpx =
      '<?xml version="1.0"?><gpx><trk><trkseg>' +
      '<trkpt lat="-21" lon="55.50"><ele>100</ele></trkpt>' +
      '<trkpt lat="-21" lon="55.53"><ele>200</ele></trkpt>' +
      '</trkseg></trk></gpx>';
    // jsdom's File has no .text() (works in real browsers) — use a file-like stub.
    const file = { name: 'track.gpx', text: () => Promise.resolve(gpx) } as unknown as File;
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onImported).toHaveBeenCalled());
    const result = onImported.mock.calls[0][0];
    expect(result.distanceKm).toBe('3.1');
    expect(result.elevationGain).toBe('130');
    // the parsed geometry flows back so the stage map / steppers see it (the reported bug)
    expect(result.trackGeojson).toEqual(expect.objectContaining({ type: 'LineString' }));
    expect(result.trackGeojson.coordinates).toHaveLength(2);
    expect(saveTrackMock).toHaveBeenCalledWith('ITI1', expect.objectContaining({ type: 'LineString' }));
  });

  it('renders one numbered marker per stage that has a GPS point', () => {
    const stages = [
      stage({ recordId: 's1', name: 'Parking', position: '1', lng: '55.50', lat: '-21.10' }),
      stage({ recordId: 's2', name: 'Cascade', position: '2', lng: '55.53', lat: '-21.12' }),
      stage({ recordId: 's3', name: 'Sans point', position: '3', lng: '', lat: '' }),
    ];
    const { getAllByTestId, getByText, queryByText } = render(
      <ItiTraceMap objectId="ITI1" initialTrack={null} stages={stages} onImported={jest.fn()} />,
    );
    // only the two stages with coordinates produce a marker
    expect(getAllByTestId('marker')).toHaveLength(2);
    // markers are numbered by list position (matches the stage cards below the map)
    expect(getByText('1')).toBeInTheDocument();
    expect(getByText('2')).toBeInTheDocument();
    expect(queryByText('3')).not.toBeInTheDocument();
  });

  it('surfaces a friendly error for an unsupported file (no import call)', async () => {
    const onImported = jest.fn();
    const { container, findByRole } = render(<ItiTraceMap objectId="ITI1" initialTrack={null} onImported={onImported} />);
    const file = { name: 'photo.txt', text: () => Promise.resolve('nope') } as unknown as File;
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    expect(await findByRole('alert')).toHaveTextContent(/Format non supporté/);
    expect(saveTrackMock).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });
});

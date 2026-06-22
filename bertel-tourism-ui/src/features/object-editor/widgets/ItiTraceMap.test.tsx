import type { ReactNode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { ItiTraceMap } from './ItiTraceMap';

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  Source: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: () => null,
  NavigationControl: () => null,
}));

const saveTrackMock = jest.fn();
jest.mock('../../../services/object-workspace', () => ({
  saveObjectWorkspaceItineraryTrack: (...args: unknown[]) => saveTrackMock(...args),
}));

describe('ItiTraceMap (§111 B1)', () => {
  beforeEach(() => saveTrackMock.mockReset());

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

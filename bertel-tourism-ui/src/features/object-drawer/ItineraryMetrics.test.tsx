import { act, fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ItineraryMetrics } from './ItineraryMetrics';
import { parseItinerarySummary, type ItinerarySummary } from './utils';

const itinerary: ItinerarySummary = {
  distanceKm: '12,5', durationHours: '4', difficulty: 'Difficile', elevationGain: '850', isLoop: true,
  track: '', trackFormat: '', practices: [], info: [], sectionsCount: 0, stagesCount: 9,
  profiles: [], profilesCount: 0, trackGeojson: null,
};

describe('ItineraryMetrics', () => {
  it('uses real route facts and the rendered stage count with accessible names', () => {
    render(<ItineraryMetrics itinerary={itinerary} stageCount={3} />);
    expect(screen.getByRole('list', { name: 'Chiffres du parcours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Distance : 12,5 km' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Durée : 4 h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Étapes : 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Boucle : Oui' })).toBeInTheDocument();
    expect(screen.queryByText('Difficile')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('exposes labels on hover and focus, retains a focused tooltip after pointer exit, and dismisses with Escape', () => {
    render(<ItineraryMetrics itinerary={itinerary} stageCount={3} />);
    const distance = screen.getByRole('button', { name: 'Distance : 12,5 km' });
    fireEvent.mouseEnter(distance.closest('li')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Distance');
    expect(distance).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.focus(distance);
    fireEvent.mouseLeave(distance.closest('li')!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(distance, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(distance).not.toHaveAttribute('aria-describedby');
    fireEvent.blur(distance);
    fireEvent.focus(distance);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Distance');
    fireEvent.blur(distance);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses the tooltip before its parent Radix dialog and lets the next Escape close the dialog', () => {
    const onOpenChange = jest.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogTitle>Fiche du parcours</DialogTitle>
          <DialogDescription>Informations sur le parcours sélectionné.</DialogDescription>
          <ItineraryMetrics itinerary={itinerary} stageCount={3} />
        </DialogContent>
      </Dialog>,
    );
    const distance = screen.getByRole('button', { name: 'Distance : 12,5 km' });
    act(() => distance.focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Distance');

    fireEvent.keyDown(distance, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Fiche du parcours' })).toBeInTheDocument();
    expect(distance).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(distance, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not invent absent facts and distinguishes a known non-loop from an unknown loop', () => {
    const { rerender, container } = render(<ItineraryMetrics itinerary={null} stageCount={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ItineraryMetrics itinerary={{ ...itinerary, distanceKm: '', durationHours: '', isLoop: false }} stageCount={0} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Boucle : Non' })).toBeInTheDocument();
    rerender(<ItineraryMetrics itinerary={{ ...itinerary, distanceKm: '', durationHours: '', isLoop: null }} stageCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows exact source minutes in hours and minutes, with French decimal formatting', () => {
    const summary = parseItinerarySummary({ itinerary: { duration_min: 192, distance_km: 8.4 } });
    expect(summary?.durationMinutes).toBe(192);
    render(<ItineraryMetrics itinerary={summary} stageCount={0} />);
    expect(screen.getByRole('button', { name: 'Durée : 3 h 12 min' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Distance : 8,4 km' })).toBeInTheDocument();
  });

  it('preserves minute precision and supports legacy fractional hours or durations below an hour', () => {
    const summary = parseItinerarySummary({ itinerary: { duration_min: 61 } });
    expect(summary?.durationHours).toBe('1.02');
    const { rerender } = render(<ItineraryMetrics itinerary={summary} stageCount={0} />);
    expect(screen.getByRole('button', { name: 'Durée : 1 h 1 min' })).toBeInTheDocument();
    rerender(<ItineraryMetrics itinerary={{ ...itinerary, durationHours: '3,2' }} stageCount={0} />);
    expect(screen.getByRole('button', { name: 'Durée : 3 h 12 min' })).toBeInTheDocument();
    rerender(<ItineraryMetrics itinerary={{ ...itinerary, durationMinutes: 45 }} stageCount={0} />);
    expect(screen.getByRole('button', { name: 'Durée : 45 min' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /0 h/ })).not.toBeInTheDocument();
  });
});

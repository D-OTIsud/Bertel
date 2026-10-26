import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssociatedObjectModal } from './AssociatedObjectModal';
import { listObjectMarkers } from '../../../services/rpc';

jest.mock('../../../services/rpc', () => ({ listObjectMarkers: jest.fn() }));
jest.mock('./RelationPicker', () => ({ RelationPicker: () => <div>Recherche par nom disponible</div> }));

test('nearby recommendations exclude the itinerary and distant cards, then link only the chosen object', async () => {
  (listObjectMarkers as jest.Mock).mockResolvedValue([
    { id: 'itinerary', name: 'Le parcours', type: 'ITI', location: { lon: 55.5, lat: -21.3 } },
    { id: 'nearby', name: 'Restaurant proche', type: 'RES', location: { lon: 55.5001, lat: -21.3001 } },
    { id: 'far', name: 'Restaurant éloigné', type: 'RES', location: { lon: 55.9, lat: -21.4 } },
  ]);
  const onSave = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>
    <AssociatedObjectModal open objectId="itinerary" trackGeojson={{ type: 'LineString', coordinates: [[55.5, -21.3], [55.51, -21.31]] }}
      roleOptions={[{ id: 'role-nearby', code: 'nearby', label: 'À proximité' }]} onClose={() => {}} onSave={onSave} />
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /Restaurant proche/ }));
  expect(screen.queryByText('Restaurant éloigné')).not.toBeInTheDocument();
  expect(screen.queryByText('Le parcours')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Rôle de l'objet lié"), { target: { value: 'role-nearby' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lier la fiche' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ associatedObjectId: 'nearby', roleId: 'role-nearby', targetType: 'RES' }));
  expect(listObjectMarkers).toHaveBeenCalledWith(expect.objectContaining({ common: expect.objectContaining({ bbox: expect.any(Array) }) }), expect.any(AbortSignal));
});

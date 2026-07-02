import type { ObjectSearchResult } from '../useObjectSearch';

jest.mock('../../../services/rpc', () => ({ createObject: jest.fn() }));

type SearchReturn = { results: ObjectSearchResult[]; loading: boolean };
const mockUseObjectSearch = jest.fn((): SearchReturn => ({ results: [], loading: false }));
jest.mock('../useObjectSearch', () => ({ useObjectSearch: () => mockUseObjectSearch() }));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateObjectDialog } from './CreateObjectDialog';
import { createObject } from '../../../services/rpc';

const mockCreateObject = createObject as jest.Mock;

beforeEach(() => {
  mockCreateObject.mockReset();
  mockUseObjectSearch.mockReturnValue({ results: [], loading: false });
});

function selectTypeAndName(name: string) {
  fireEvent.click(screen.getByRole('radio', { name: /^Hôtel$/i }));
  fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: name } });
}

it('disables create until a type and a non-empty name are chosen', () => {
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  const create = screen.getByRole('button', { name: /créer la fiche/i });
  expect(create).toBeDisabled();
  selectTypeAndName('Hôtel des Cimes');
  expect(create).toBeEnabled();
});

it('calls createObject with the chosen type+name and forwards the new id', async () => {
  mockCreateObject.mockResolvedValue('HOTRUN0000000001');
  const onCreated = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
  selectTypeAndName('Hôtel des Cimes');
  fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('HOTRUN0000000001'));
  expect(mockCreateObject).toHaveBeenCalledWith({ type: 'HOT', name: 'Hôtel des Cimes' });
});

it('surfaces a backend error and stays open (no onCreated)', async () => {
  mockCreateObject.mockRejectedValue(new Error('Pas la permission de créer'));
  const onCreated = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
  selectTypeAndName('X');
  fireEvent.click(screen.getByRole('button', { name: /créer la fiche/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/permission de créer/i);
  expect(onCreated).not.toHaveBeenCalled();
});

it('warns about existing fiches with a close name and opens one on click', () => {
  mockUseObjectSearch.mockReturnValue({
    results: [
      {
        id: 'LOIRUN0000000001',
        name: 'La Cité du Volcan',
        type: 'LOI',
        status: 'published',
        city: 'Le Tampon',
        code: 'LOIRUN0000000001',
        card: { id: 'LOIRUN0000000001', type: 'LOI', name: 'La Cité du Volcan' },
      },
    ],
    loading: false,
  });
  const onOpenExisting = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} onOpenExisting={onOpenExisting} />);
  fireEvent.change(screen.getByLabelText(/nom de la fiche/i), { target: { value: 'La Cité du Volcan' } });

  expect(screen.getByText(/au nom proche/i)).toBeInTheDocument();
  expect(screen.getByText(/identique/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /La Cité du Volcan/i }));
  expect(onOpenExisting).toHaveBeenCalledWith('LOIRUN0000000001');
});

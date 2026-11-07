import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { resetTestData } from '../../services/test-corpus';
import { TestCorpusSettings } from './TestCorpusSettings';

jest.mock('../../services/test-corpus', () => ({ resetTestData: jest.fn() }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

describe('TestCorpusSettings', () => {
  it('requires the confirmation phrase and clears it after a successful reset', async () => {
    (resetTestData as jest.Mock).mockResolvedValue({ deleted: 110, reseeded: { objects: 105 } });
    render(<TestCorpusSettings />);
    const button = screen.getByRole('button', { name: 'Réinitialiser le corpus de test' });
    const confirmation = screen.getByLabelText(/Pour confirmer, saisissez/);
    expect(button).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: 'oui' } });
    expect(button).toBeDisabled();
    expect(resetTestData).not.toHaveBeenCalled();
    fireEvent.change(confirmation, { target: { value: 'REINITIALISER' } });
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('110 fiche(s) supprimée(s), 105 recréée(s).');
    expect(confirmation).toHaveValue('');
    expect(button).toBeDisabled();
    expect(resetTestData).toHaveBeenCalledTimes(1);
    expect(resetTestData).toHaveBeenCalledWith();
  });

  it('keeps the confirmation available after a server rejection without reporting success', async () => {
    (resetTestData as jest.Mock).mockRejectedValue(new Error('Organisation de test indisponible'));
    render(<TestCorpusSettings />);
    fireEvent.change(screen.getByLabelText(/Pour confirmer, saisissez/), { target: { value: 'REINITIALISER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le corpus de test' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Organisation de test indisponible'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser le corpus de test' })).toBeEnabled();
  });
});

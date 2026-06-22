import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteObjectModal, deleteConfirmEnabled } from './DeleteObjectModal';

jest.mock('../../../services/object-delete', () => ({
  requestObjectDeletion: jest.fn().mockResolvedValue({ ok: true, report: {}, mediaDeleted: [], documentsDeleted: [], storageError: null }),
}));
import { requestObjectDeletion } from '../../../services/object-delete';

describe('deleteConfirmEnabled', () => {
  it('is false until the typed text matches the name (trimmed)', () => {
    expect(deleteConfirmEnabled('', 'Hôtel X')).toBe(false);
    expect(deleteConfirmEnabled('Hotel X', 'Hôtel X')).toBe(false);
    expect(deleteConfirmEnabled('  Hôtel X  ', 'Hôtel X')).toBe(true);
  });
});

describe('DeleteObjectModal', () => {
  const baseProps = {
    open: true, objectId: 'HOTRUN0000000001', objectName: 'Hôtel X',
    accessToken: 'jwt-123', onClose: jest.fn(), onDeleted: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());

  it('keeps the destructive button disabled until the name matches', () => {
    render(<DeleteObjectModal {...baseProps} />);
    const btn = screen.getByRole('button', { name: /supprimer définitivement/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/nom de confirmation/i), { target: { value: 'Hôtel X' } });
    expect(btn).toBeEnabled();
  });

  it('calls requestObjectDeletion then onDeleted on confirm', async () => {
    const onDeleted = jest.fn();
    render(<DeleteObjectModal {...baseProps} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText(/nom de confirmation/i), { target: { value: 'Hôtel X' } });
    fireEvent.click(screen.getByRole('button', { name: /supprimer définitivement/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(requestObjectDeletion).toHaveBeenCalledWith({ objectId: 'HOTRUN0000000001', confirmName: 'Hôtel X', accessToken: 'jwt-123' });
  });
});

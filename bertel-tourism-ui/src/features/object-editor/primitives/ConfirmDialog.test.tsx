import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders the title, message and labelled actions when open', () => {
    render(
      <ConfirmDialog
        open
        title="Détacher le prestataire"
        message="Voulez-vous vraiment détacher ?"
        confirmLabel="Détacher"
        tone="danger"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByText('Détacher le prestataire')).toBeInTheDocument();
    expect(screen.getByText('Voulez-vous vraiment détacher ?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Détacher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('fires onConfirm and onCancel from the matching buttons', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        open
        title="T"
        message="M"
        confirmLabel="Confirmer"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(<ConfirmDialog open={false} title="T" message="M" onCancel={() => undefined} onConfirm={() => undefined} />);
    expect(screen.queryByText('T')).not.toBeInTheDocument();
  });
});

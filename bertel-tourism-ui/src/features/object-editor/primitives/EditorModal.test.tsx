import { render, screen, fireEvent } from '@testing-library/react';
import { EditorModal } from './EditorModal';

describe('EditorModal', () => {
  it('renders title + children when open and fires save/cancel', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
      <EditorModal open title="Modifier le média" onClose={onClose} onSave={onSave}>
        <p>Corps</p>
      </EditorModal>,
    );
    expect(screen.getByText('Modifier le média')).toBeInTheDocument();
    expect(screen.getByText('Corps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<EditorModal open={false} title="X" onClose={() => {}} onSave={() => {}}><p>Corps</p></EditorModal>);
    expect(screen.queryByText('Corps')).not.toBeInTheDocument();
  });
});

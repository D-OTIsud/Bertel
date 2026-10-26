import { render, screen, fireEvent } from '@testing-library/react';
import { MeetingRoomEditModal } from './MeetingRoomEditModal';
import type { ObjectWorkspaceMeetingRoomItem } from '../../../services/object-workspace-parser';

const mr: ObjectWorkspaceMeetingRoomItem = {
  recordId: 'mr1', name: 'Salle A', nameTranslations: {}, areaM2: '50',
  capacityTheatre: '40', capacityU: '20', capacityClassroom: '24', capacityBoardroom: '16', equipmentCodes: [],
};

describe('MeetingRoomEditModal', () => {
  it('opens an illustrated layout and retains its capacity when the card is folded', () => {
    const onSave = jest.fn();
    render(<MeetingRoomEditModal open room={{ ...mr, recordId: null, name: 'Salle libre',
      capacityTheatre: '', capacityU: '', capacityClassroom: '', capacityBoardroom: '' }}
      equipmentOptions={[]} onClose={() => {}} onSave={onSave} />);
    for (const label of ['Théâtre', 'En U', 'Classe', 'Conseil']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByRole('spinbutton', { name: 'Capacité théâtre' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Théâtre' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Capacité théâtre' }), { target: { value: '65' } });
    fireEvent.click(screen.getByRole('button', { name: 'Théâtre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ capacityTheatre: '65', capacityU: '', capacityClassroom: '', capacityBoardroom: '' }));
  });

  it('keeps all four distinct dispositions and the existing translations on apply', () => {
    const onSave = jest.fn();
    const existing = { ...mr, nameTranslations: { en: 'Meeting room A' } };
    render(<MeetingRoomEditModal open room={existing} equipmentOptions={[]} onClose={() => {}} onSave={onSave} />);
    for (const label of ['Capacité théâtre', 'Capacité en U', 'Capacité classe', 'Capacité conseil']) {
      expect(screen.getByRole('spinbutton', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(onSave).toHaveBeenCalledWith(existing);
  });

  it('toggles equipment and returns the patched room on save', () => {
    const onSave = jest.fn();
    render(
      <MeetingRoomEditModal
        open room={mr}
        equipmentOptions={[{ id: 'e1', code: 'projector', label: 'Vidéoprojecteur' }]}
        onClose={() => {}} onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vidéoprojecteur' }));
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect((onSave.mock.calls[0][0] as ObjectWorkspaceMeetingRoomItem).equipmentCodes).toEqual(['projector']);
  });
});

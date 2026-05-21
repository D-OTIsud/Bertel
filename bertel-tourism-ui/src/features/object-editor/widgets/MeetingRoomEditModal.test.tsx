import { render, screen, fireEvent } from '@testing-library/react';
import { MeetingRoomEditModal } from './MeetingRoomEditModal';
import type { ObjectWorkspaceMeetingRoomItem } from '../../../services/object-workspace-parser';

const mr: ObjectWorkspaceMeetingRoomItem = {
  recordId: 'mr1', name: 'Salle A', nameTranslations: {}, areaM2: '50',
  capacityTheatre: '40', capacityU: '20', capacityClassroom: '24', capacityBoardroom: '16', equipmentCodes: [],
};

describe('MeetingRoomEditModal', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((onSave.mock.calls[0][0] as ObjectWorkspaceMeetingRoomItem).equipmentCodes).toEqual(['projector']);
  });
});

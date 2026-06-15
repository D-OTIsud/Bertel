import { render, screen, fireEvent } from '@testing-library/react';
import { RoomEditModal } from './RoomEditModal';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';

const room: ObjectWorkspaceRoomTypeItem = {
  recordId: 'r1', code: 'std', name: 'Chambre standard', nameTranslations: {},
  description: '', descriptionTranslations: {}, capacityAdults: '2', capacityChildren: '0',
  capacityTotal: '2', sizeSqm: '22', bedConfig: 'Double', bedConfigTranslations: {}, quantity: '12',
  floorLevel: '', viewTypeId: '', viewTypeCode: '', viewTypeLabel: '',
  roomTypeId: '', roomTypeCode: '', roomTypeLabel: '',
  basePrice: '165', currency: 'EUR', accessible: false, published: true, position: '1',
  amenityCodes: [], mediaIds: [],
};
const mod: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions'> = {
  roomTypeOptions: [{ id: 'rt1', code: 'double', label: 'Chambre double' }],
  viewTypeOptions: [{ id: 'v1', code: 'sea', label: 'Vue mer' }],
  amenityOptions: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }],
};

describe('RoomEditModal', () => {
  it('edits the room type and returns the patched room on save', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Type de chambre'), { target: { value: 'double' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.roomTypeCode).toBe('double');
  });

  it('uses numeric inputs and unit suffixes', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByLabelText('Couchages (total)').getAttribute('type')).toBe('number');
    expect(screen.getByLabelText('Surface').getAttribute('type')).toBe('number');
    expect(screen.getByLabelText('Tarif indicatif').getAttribute('type')).toBe('number');
    expect(screen.getByText('m²')).toBeInTheDocument();
    expect(screen.getByText('€ / nuit')).toBeInTheDocument();
  });

  it('relabels Unités to Nb. de chambres (de ce type)', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByLabelText('Nb. de chambres (de ce type)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unités')).not.toBeInTheDocument();
  });

  it('locks adults + children to the total', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Couchages (total)'), { target: { value: '4' } });
    expect((screen.getByLabelText('Adultes') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Enfants') as HTMLInputElement).value).toBe('0');
    fireEvent.change(screen.getByLabelText('Adultes'), { target: { value: '1' } });
    expect((screen.getByLabelText('Enfants') as HTMLInputElement).value).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved).toMatchObject({ capacityTotal: '4', capacityAdults: '1', capacityChildren: '3' });
  });

  it('edits amenities through the searchable equipment modal', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Choisir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.amenityCodes).toEqual(['wifi']);
  });

  it('renders a PMR accessibility toggle', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Chambre accessible (PMR)' })).toBeInTheDocument();
  });
});

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
  amenityCodes: [], mediaIds: [], beds: [],
};
const mod: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions' | 'amenityGroups' | 'bedTypeOptions'> = {
  roomTypeOptions: [{ id: 'rt1', code: 'double', label: 'Chambre double' }],
  viewTypeOptions: [{ id: 'v1', code: 'sea', label: 'Vue mer' }],
  amenityOptions: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }],
  amenityGroups: [{ familyCode: 'general', familyLabel: 'Général', options: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi', disabilityTypes: [] }] }],
  bedTypeOptions: [{ id: 'bt-double', code: 'double', label: 'Lit double' }],
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

  it('groups available equipment by collapsible category (collapsed by default)', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    // The « Général » family header is shown; its Wi-Fi chip is hidden until expanded.
    expect(screen.getByRole('button', { name: /Général/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wi-Fi' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Général/ }));
    expect(screen.getByRole('button', { name: 'Wi-Fi' })).toBeInTheDocument();
  });

  it('adds an amenity from its category and returns it on save', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Général/ })); // expand the category
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.amenityCodes).toEqual(['wifi']);
  });

  it('search filters across categories and auto-expands matches', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    // A matching search reveals the chip without manually expanding its category.
    fireEvent.change(screen.getByLabelText('Rechercher un équipement'), { target: { value: 'Wi' } });
    expect(screen.getByRole('button', { name: 'Wi-Fi' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher un équipement'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('button', { name: 'Wi-Fi' })).not.toBeInTheDocument();
  });

  it('renders a PMR accessibility toggle', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Chambre accessible (PMR)' })).toBeInTheDocument();
  });

  it('adds and edits a structured bed row', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un lit/i }));
    fireEvent.change(screen.getByLabelText('Type de lit 1'), { target: { value: 'double' } });
    fireEvent.change(screen.getByLabelText('Nombre de lits 1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.beds).toEqual([
      { bedTypeId: 'bt-double', bedTypeCode: 'double', bedTypeLabel: 'Lit double', quantity: '2' },
    ]);
  });
});

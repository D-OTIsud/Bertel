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
const mod: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions' | 'amenityGroups' | 'bedTypeOptions' | 'mediaOptions'> = {
  roomTypeOptions: [{ id: 'rt1', code: 'double', label: 'Chambre double' }],
  viewTypeOptions: [{ id: 'v1', code: 'sea', label: 'Vue mer' }],
  amenityOptions: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }, { id: 'concierge', code: 'concierge', label: 'Conciergerie' }],
  amenityGroups: [
    // wifi is a curated « common » code → surfaces flat in « Les plus courants ».
    { familyCode: 'general', familyLabel: 'Général', options: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi', disabilityTypes: [] }] },
    // concierge is not common → lives in a collapsible category.
    { familyCode: 'services', familyLabel: 'Services', options: [{ id: 'concierge', code: 'concierge', label: 'Conciergerie', disabilityTypes: [] }] },
  ],
  bedTypeOptions: [{ id: 'bt-double', code: 'double', label: 'Lit double' }],
  mediaOptions: [
    { id: 'm1', code: 'm1', label: 'Vue terrasse', url: 'https://cdn.example/m1.jpg' },
    { id: 'm2', code: 'm2', label: 'Salle de bain', url: 'https://cdn.example/m2.jpg' },
  ],
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

  it('surfaces common amenities flat and keeps the rest in collapsible categories', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    // Wi-Fi is a « common » code → visible flat, no expanding needed.
    expect(screen.getByRole('button', { name: 'Wi-Fi' })).toBeInTheDocument();
    // Conciergerie is not common → its « Services » category is collapsed until clicked.
    expect(screen.getByRole('button', { name: /Services/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conciergerie' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Services/ }));
    expect(screen.getByRole('button', { name: 'Conciergerie' })).toBeInTheDocument();
  });

  it('adds a common amenity in one click (Les plus courants)', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' })); // flat, no category to open
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.amenityCodes).toEqual(['wifi']);
  });

  it('adds an amenity from a collapsible category and returns it on save', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Services/ })); // expand the category
    fireEvent.click(screen.getByRole('button', { name: 'Conciergerie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.amenityCodes).toEqual(['concierge']);
  });

  it('search reveals a category amenity without manually expanding', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Conciergerie' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher un équipement'), { target: { value: 'Conci' } });
    expect(screen.getByRole('button', { name: 'Conciergerie' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher un équipement'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('button', { name: 'Conciergerie' })).not.toBeInTheDocument();
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

  it('renders linked room photos as thumbnails', () => {
    const withMedia = { ...room, mediaIds: ['m1'] };
    render(<RoomEditModal open room={withMedia} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByAltText('Vue terrasse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la photo Vue terrasse' })).toBeInTheDocument();
    // The section header reflects the linked count.
    expect(screen.getByText('Photos & médias (1)')).toBeInTheDocument();
  });

  it('links an existing establishment photo to the room', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lier la photo Salle de bain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.mediaIds).toEqual(['m2']);
  });

  it('unlinks a linked photo', () => {
    const onSave = jest.fn();
    const withMedia = { ...room, mediaIds: ['m1', 'm2'] };
    render(<RoomEditModal open room={withMedia} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la photo Vue terrasse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.mediaIds).toEqual(['m2']);
  });

  it('guides to the Médias section when the object has no media to link', () => {
    const onSave = jest.fn();
    const emptyMod = { ...mod, mediaOptions: [] };
    render(<RoomEditModal open room={room} module={emptyMod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    expect(screen.getByText(/Ajoutez des photos dans la/i)).toBeInTheDocument();
  });
});

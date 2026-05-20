import { Chip, ChipSet, Fs, Input, Repeater, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import type {
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceRoomTypeItem,
} from '../../../../services/object-workspace-parser';

function createRoom(index: number): ObjectWorkspaceRoomTypeItem {
  return {
    recordId: null,
    code: `unit-${index + 1}`,
    name: '',
    nameTranslations: {},
    description: '',
    descriptionTranslations: {},
    capacityAdults: '',
    capacityChildren: '',
    capacityTotal: '',
    sizeSqm: '',
    bedConfig: '',
    bedConfigTranslations: {},
    quantity: '',
    floorLevel: '',
    viewTypeId: '',
    viewTypeCode: '',
    viewTypeLabel: '',
    basePrice: '',
    currency: 'EUR',
    accessible: false,
    published: true,
    position: String(index + 1),
    amenityCodes: [],
    mediaIds: [],
  };
}

function createMeetingRoom(): ObjectWorkspaceMeetingRoomItem {
  return {
    recordId: null,
    name: '',
    nameTranslations: {},
    areaM2: '',
    capacityTheatre: '',
    capacityU: '',
    capacityClassroom: '',
    capacityBoardroom: '',
    equipmentCodes: [],
  };
}

export function BlockHEB({ editor, folded }: SectionProps) {
  const rooms = editor.draft.rooms;
  const meetingRooms = editor.draft.meetingRooms;
  const capacity = editor.draft.capacityPolicies;

  function updateRoom(index: number, patch: Partial<ObjectWorkspaceRoomTypeItem>) {
    editor.replaceModule('rooms', {
      ...rooms,
      items: rooms.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
  }

  function updateMeetingRoom(index: number, patch: Partial<ObjectWorkspaceMeetingRoomItem>) {
    editor.replaceModule('meetingRooms', {
      ...meetingRooms,
      items: meetingRooms.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
  }

  return (
    <Fs num="05" title="Chambres, équipements & séminaire" sub="Unités locatives, capacités, tarifs d’appel, équipements, salles MICE" folded={folded} pill={{ tone: 'ok', label: `${rooms.items.length} type(s)` }}>
      <Repeater
        items={rooms.items}
        getKey={(item, index) => item.recordId ?? item.code ?? `room-${index}`}
        columns="1.4fr 76px 76px 76px 90px 90px auto"
        addLabel="Ajouter un type de chambre"
        onAdd={() => editor.replaceModule('rooms', { ...rooms, items: [...rooms.items, createRoom(rooms.items.length)] })}
        renderRow={(item, index) => (
          <>
            <Input value={item.name} placeholder="Type de chambre" onChange={(name) => updateRoom(index, { name })} />
            <Input value={item.capacityTotal} mono placeholder="Pers." onChange={(capacityTotal) => updateRoom(index, { capacityTotal })} />
            <Input value={item.sizeSqm} mono suffix="m2" onChange={(sizeSqm) => updateRoom(index, { sizeSqm })} />
            <Input value={item.quantity} mono onChange={(quantity) => updateRoom(index, { quantity })} />
            <Input value={item.basePrice} mono suffix="EUR" onChange={(basePrice) => updateRoom(index, { basePrice })} />
            <Toggle label="Publié" on={item.published} onChange={(published) => updateRoom(index, { published })} />
            <button type="button" className="del" onClick={() => editor.replaceModule('rooms', { ...rooms, items: rooms.items.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
          </>
        )}
      />

      {rooms.amenityOptions.length > 0 && rooms.items[0] && (
        <>
          <div className="chip-group__label">Équipements de la première unité</div>
          <ChipSet>
            {rooms.amenityOptions.slice(0, 18).map((option) => {
              const selected = rooms.items[0].amenityCodes.includes(option.code);
              return (
                <Chip
                  key={option.code}
                  label={option.label}
                  on={selected}
                  onClick={() => updateRoom(0, {
                    amenityCodes: selected
                      ? rooms.items[0].amenityCodes.filter((code) => code !== option.code)
                      : [...rooms.items[0].amenityCodes, option.code],
                  })}
                />
              );
            })}
          </ChipSet>
        </>
      )}

      <div className="chip-group__label">Politiques</div>
      <div className="grid-3">
        <Input value={capacity.groupPolicy.minSize} prefix="min" mono onChange={(minSize) => editor.replaceModule('capacityPolicies', { ...capacity, groupPolicy: { ...capacity.groupPolicy, minSize } })} />
        <Input value={capacity.groupPolicy.maxSize} prefix="max" mono onChange={(maxSize) => editor.replaceModule('capacityPolicies', { ...capacity, groupPolicy: { ...capacity.groupPolicy, maxSize } })} />
        <Toggle label="Animaux acceptés" on={capacity.petPolicy.accepted} onChange={(accepted) => editor.replaceModule('capacityPolicies', { ...capacity, petPolicy: { ...capacity.petPolicy, accepted, hasPolicy: true } })} />
      </div>

      <div className="chip-group__label">Salles MICE</div>
      <Repeater
        items={meetingRooms.items}
        getKey={(item, index) => item.recordId ?? `meeting-${index}`}
        columns="1.4fr 80px 80px 80px 80px auto"
        addLabel="Ajouter une salle"
        onAdd={() => editor.replaceModule('meetingRooms', { ...meetingRooms, items: [...meetingRooms.items, createMeetingRoom()] })}
        renderRow={(item, index) => (
          <>
            <Input value={item.name} placeholder="Salle" onChange={(name) => updateMeetingRoom(index, { name })} />
            <Input value={item.areaM2} mono suffix="m2" onChange={(areaM2) => updateMeetingRoom(index, { areaM2 })} />
            <Input value={item.capacityTheatre} mono placeholder="Théâtre" onChange={(capacityTheatre) => updateMeetingRoom(index, { capacityTheatre })} />
            <Input value={item.capacityClassroom} mono placeholder="Classe" onChange={(capacityClassroom) => updateMeetingRoom(index, { capacityClassroom })} />
            <Input value={item.capacityBoardroom} mono placeholder="Board" onChange={(capacityBoardroom) => updateMeetingRoom(index, { capacityBoardroom })} />
            <button type="button" className="del" onClick={() => editor.replaceModule('meetingRooms', { ...meetingRooms, items: meetingRooms.items.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
          </>
        )}
      />
    </Fs>
  );
}

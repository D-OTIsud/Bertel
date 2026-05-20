import { Chip, ChipSet, Field, Fs, Input, Repeater, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import type {
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceRoomTypeItem,
} from '../../../../services/object-workspace-parser';

const ROOM_COLS = '14px 1.4fr 70px 70px 70px 80px auto';
const MICE_COLS = '14px 1.4fr 70px 70px 70px 70px auto';

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 8,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

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
  const totalUnits = rooms.items.reduce((sum, item) => sum + (Number.parseInt(item.quantity, 10) || 0), 0);
  const pillLabel =
    totalUnits > 0
      ? `${rooms.items.length} type(s) · ${totalUnits} unité(s)`
      : `${rooms.items.length} type(s)`;

  function updateRoom(index: number, patch: Partial<ObjectWorkspaceRoomTypeItem>) {
    editor.replaceModule('rooms', {
      ...rooms,
      items: rooms.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    });
  }

  function updateMeetingRoom(index: number, patch: Partial<ObjectWorkspaceMeetingRoomItem>) {
    editor.replaceModule('meetingRooms', {
      ...meetingRooms,
      items: meetingRooms.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    });
  }

  const amenitySlice = rooms.amenityOptions;
  const comfortOptions = amenitySlice.slice(0, Math.ceil(amenitySlice.length / 3));
  const serviceOptions = amenitySlice.slice(comfortOptions.length, comfortOptions.length * 2);
  const accessOptions = amenitySlice.slice(comfortOptions.length * 2);

  function renderAmenityGroup(
    title: string,
    options: typeof amenitySlice,
    roomIndex: number,
  ) {
    if (options.length === 0 || !rooms.items[roomIndex]) return null;
    const item = rooms.items[roomIndex];
    return (
      <>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', margin: '14px 0 4px' }}>{title}</div>
        <ChipSet>
          {options.map((option) => {
            const selected = item.amenityCodes.includes(option.code);
            return (
              <Chip
                key={option.code}
                label={option.label}
                on={selected}
                onClick={() =>
                  updateRoom(roomIndex, {
                    amenityCodes: selected
                      ? item.amenityCodes.filter((code) => code !== option.code)
                      : [...item.amenityCodes, option.code],
                  })
                }
              />
            );
          })}
        </ChipSet>
      </>
    );
  }

  return (
    <Fs
      num="05"
      title="Chambres, équipements & séminaire"
      sub="Inventaire de l'offre hébergement : unités locatives, capacités, tarifs, équipements, salles MICE"
      folded={folded}
      pill={{ tone: rooms.items.length > 0 ? 'ok' : 'warn', label: pillLabel }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Chambres / unités locatives
      </div>
      {repHeader(ROOM_COLS, ['', 'Type · vue · équipements', 'Couchages', 'Surface', 'Unités', 'Tarif'])}
      <Repeater
        items={rooms.items}
        getKey={(item, index) => item.recordId ?? item.code ?? `room-${index}`}
        columns={ROOM_COLS}
        addLabel="Ajouter un type de chambre"
        onAdd={() =>
          editor.replaceModule('rooms', {
            ...rooms,
            items: [...rooms.items, createRoom(rooms.items.length)],
          })
        }
        renderRow={(item, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <div>
              <Input value={item.name} placeholder="Type de chambre" onChange={(name) => updateRoom(index, { name })} />
              <div style={{ marginTop: 4 }}>
                <Input
                  value={item.description || item.bedConfig}
                  placeholder="vue · équipements clés"
                  onChange={(description) => updateRoom(index, { description })}
                />
              </div>
            </div>
            <Input
              value={item.capacityTotal || item.capacityAdults}
              mono
              placeholder="2"
              onChange={(capacityTotal) => updateRoom(index, { capacityTotal })}
            />
            <Input value={item.sizeSqm} mono suffix="m²" onChange={(sizeSqm) => updateRoom(index, { sizeSqm })} />
            <Input value={item.quantity} mono onChange={(quantity) => updateRoom(index, { quantity })} />
            <Input value={item.basePrice} mono suffix="€" onChange={(basePrice) => updateRoom(index, { basePrice })} />
            <div className="rep-row__act">
              <Toggle label="PMR" on={item.accessible} onChange={(accessible) => updateRoom(index, { accessible })} />
              <button
                type="button"
                className="del"
                onClick={() =>
                  editor.replaceModule('rooms', {
                    ...rooms,
                    items: rooms.items.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                ×
              </button>
            </div>
          </>
        )}
      />

      {rooms.amenityOptions.length > 0 && rooms.items[0] && (
        <>
          <div className="chip-group__label" style={{ marginTop: 20 }}>
            Équipements & services sur place (catégorisés)
          </div>
          {renderAmenityGroup('Confort chambre', comfortOptions, 0)}
          {renderAmenityGroup('Services & loisirs', serviceOptions, 0)}
          {renderAmenityGroup('Accessibilité', accessOptions, 0)}
        </>
      )}

      <div className="chip-group__label" style={{ marginTop: 20 }}>
        Politiques d'accueil
      </div>
      <div className="grid-3" style={{ marginBottom: 10 }}>
        <Field label="Groupes — min">
          <Input
            value={capacity.groupPolicy.minSize}
            mono
            suffix="pers."
            onChange={(minSize) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                groupPolicy: { ...capacity.groupPolicy, minSize },
              })
            }
          />
        </Field>
        <Field label="Groupes — max">
          <Input
            value={capacity.groupPolicy.maxSize}
            mono
            suffix="pers."
            onChange={(maxSize) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                groupPolicy: { ...capacity.groupPolicy, maxSize },
              })
            }
          />
        </Field>
        <Field label="Notes groupes">
          <Input
            value={capacity.groupPolicy.notes}
            onChange={(notes) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                groupPolicy: { ...capacity.groupPolicy, notes },
              })
            }
          />
        </Field>
      </div>
      <div className="grid-3">
        <Toggle
          label="Animaux acceptés"
          sub={capacity.petPolicy.conditions || 'Politique animaux'}
          on={capacity.petPolicy.accepted}
          onChange={(accepted) =>
            editor.replaceModule('capacityPolicies', {
              ...capacity,
              petPolicy: { ...capacity.petPolicy, accepted, hasPolicy: true },
            })
          }
        />
        <Toggle
          label="Groupes uniquement"
          sub="Réservation groupe obligatoire"
          on={capacity.groupPolicy.groupOnly}
          onChange={(groupOnly) =>
            editor.replaceModule('capacityPolicies', {
              ...capacity,
              groupPolicy: { ...capacity.groupPolicy, groupOnly },
            })
          }
        />
        <Toggle
          label="Politique animaux renseignée"
          on={capacity.petPolicy.hasPolicy}
          onChange={(hasPolicy) =>
            editor.replaceModule('capacityPolicies', {
              ...capacity,
              petPolicy: { ...capacity.petPolicy, hasPolicy },
            })
          }
        />
      </div>

      <div className="chip-group__label" style={{ marginTop: 20 }}>
        Salles séminaire & événementiel
      </div>
      {repHeader(MICE_COLS, ['', 'Salle', 'Surface m²', 'Théâtre', 'Classe', 'Banquet'])}
      <Repeater
        items={meetingRooms.items}
        getKey={(item, index) => item.recordId ?? `meeting-${index}`}
        columns={MICE_COLS}
        addLabel="Ajouter une salle"
        onAdd={() =>
          editor.replaceModule('meetingRooms', {
            ...meetingRooms,
            items: [...meetingRooms.items, createMeetingRoom()],
          })
        }
        renderRow={(item, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Input value={item.name} placeholder="Salle" onChange={(name) => updateMeetingRoom(index, { name })} />
            <Input value={item.areaM2} mono suffix="m²" onChange={(areaM2) => updateMeetingRoom(index, { areaM2 })} />
            <Input
              value={item.capacityTheatre}
              mono
              onChange={(capacityTheatre) => updateMeetingRoom(index, { capacityTheatre })}
            />
            <Input
              value={item.capacityClassroom}
              mono
              onChange={(capacityClassroom) => updateMeetingRoom(index, { capacityClassroom })}
            />
            <Input
              value={item.capacityBoardroom}
              mono
              onChange={(capacityBoardroom) => updateMeetingRoom(index, { capacityBoardroom })}
            />
            <div className="rep-row__act">
              <button
                type="button"
                className="del"
                onClick={() =>
                  editor.replaceModule('meetingRooms', {
                    ...meetingRooms,
                    items: meetingRooms.items.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                ×
              </button>
            </div>
          </>
        )}
      />
    </Fs>
  );
}

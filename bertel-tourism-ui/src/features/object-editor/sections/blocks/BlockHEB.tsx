import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Field, Fs, Repeater, SortableList, Textarea, Toggle } from '../../primitives';
import { RoomEditModal } from '../../widgets/RoomEditModal';
import { MeetingRoomEditModal } from '../../widgets/MeetingRoomEditModal';
import type { SectionProps } from '../section-types';
import type {
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceRoomTypeItem,
} from '../../../../services/object-workspace-parser';
import { ModuleUnavailableNotice, OwnedElsewhereNote } from './block-notes';
import { computeRoomsCapacitySum, nextRoomCode, reindexRoomPositions, syncCapacityWithRooms } from './rooms-utils';

const ROOM_COLS = '14px 1.4fr 70px 70px 70px 80px auto';
// No handle column: meeting-room order is NOT persisted (object_meeting_room has no
// position column), so a drag affordance would lie.
const MICE_COLS = '1.4fr 70px 70px 70px 70px auto';

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

function createRoom(items: ObjectWorkspaceRoomTypeItem[]): ObjectWorkspaceRoomTypeItem {
  const index = items.length;
  return {
    recordId: null,
    // UNIQUE(object_id, code) + delete-reinsert saver: a collision aborts mid-rewrite.
    code: nextRoomCode(items),
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
    roomTypeId: '',
    roomTypeCode: '',
    roomTypeLabel: '',
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
  // When the rooms module is §46-gated, "0 type(s)" would read as missing data — say why instead.
  const pill = rooms.unavailableReason
    ? { tone: 'warn' as const, label: 'Non applicable' }
    : {
        tone: rooms.items.length > 0 ? ('ok' as const) : ('warn' as const),
        label:
          totalUnits > 0
            ? `${rooms.items.length} type(s) · ${totalUnits} unité(s)`
            : `${rooms.items.length} type(s)`,
      };

  // Index of the room currently open in the per-room edit modal (null = closed)
  const [editingRoom, setEditingRoom] = useState<number | null>(null);

  // Index of the meeting room currently open in the per-meeting-room edit modal (null = closed)
  const [editingMeeting, setEditingMeeting] = useState<number | null>(null);

  // Add-flow drafts: "Ajouter" opens the edit modal on a draft NOT yet in the list —
  // Enregistrer appends it, Annuler leaves no ghost row.
  const [creatingRoom, setCreatingRoom] = useState<ObjectWorkspaceRoomTypeItem | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState<ObjectWorkspaceMeetingRoomItem | null>(null);

  /** Write the rooms list + keep the §07 capacity_total metric in sync (derived-unless-overridden). */
  function setRoomItems(nextItems: ObjectWorkspaceRoomTypeItem[]) {
    editor.replaceModule('rooms', { ...rooms, items: nextItems });
    const syncedCapacity = syncCapacityWithRooms(capacity, rooms.items, nextItems);
    if (syncedCapacity) {
      editor.replaceModule('capacityPolicies', syncedCapacity);
    }
  }

  function updateRoom(index: number, patch: Partial<ObjectWorkspaceRoomTypeItem>) {
    setRoomItems(rooms.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateMeetingRoom(index: number, patch: Partial<ObjectWorkspaceMeetingRoomItem>) {
    editor.replaceModule('meetingRooms', {
      ...meetingRooms,
      items: meetingRooms.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    });
  }

  const accessibleRoomsCount = rooms.items.filter((item) => item.accessible).length;
  const roomsCapacitySum = computeRoomsCapacitySum(rooms.items);

  return (
    <Fs
      num="05"
      title="Chambres, équipements & séminaire"
      sub="Inventaire de l'offre hébergement : unités locatives, capacités, tarifs, équipements, salles MICE"
      folded={folded}
      pill={pill}
    >
      {/* §46 type-gated rooms module — notice INSTEAD of controls when gated */}
      {rooms.unavailableReason ? (
        <ModuleUnavailableNotice reason={rooms.unavailableReason} />
      ) : (
        <>
          <div className="chip-group__label" style={{ marginTop: 0 }}>
            Chambres / unités locatives
          </div>
          {repHeader(ROOM_COLS, ['', 'Type · vue', 'Couchages', 'Surface', 'Unités', 'Tarif'])}
          <SortableList
            items={rooms.items}
            getId={(item) => item.recordId ?? item.code}
            columns={ROOM_COLS}
            onReorder={(next) => setRoomItems(reindexRoomPositions(next))}
            renderItem={(item, index) => (
              <>
                {/* Compact summary — full editing is done inside RoomEditModal */}
                <div>
                  <span style={{ fontWeight: 600 }}>{item.name || '—'}</span>
                  {item.viewTypeLabel && (
                    <span style={{ color: 'var(--ink-4)', marginLeft: 6, fontSize: 12 }}>{item.viewTypeLabel}</span>
                  )}
                </div>
                <span>{item.capacityTotal || item.capacityAdults || '—'}</span>
                <span>{item.sizeSqm ? `${item.sizeSqm} m²` : '—'}</span>
                <span>{item.quantity || '—'}</span>
                <span>{item.basePrice ? `${item.basePrice} €` : '—'}</span>
                <div className="rep-row__act">
                  {item.accessible && (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)' }} title="Chambre PMR">PMR</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Modifier la chambre ${item.name || index + 1}`}
                    onClick={() => setEditingRoom(index)}
                    style={{ fontSize: 12, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="del"
                    aria-label="Supprimer"
                    onClick={() =>
                      setRoomItems(reindexRoomPositions(rooms.items.filter((_, itemIndex) => itemIndex !== index)))
                    }
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </>
            )}
          />
          <button
            type="button"
            className="rep-add"
            onClick={() => setCreatingRoom(createRoom(rooms.items))}
          >
            + Ajouter un type de chambre
          </button>

          {rooms.items.length > 0 && (
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Capacité cumulée : <strong>{roomsCapacitySum} personne(s)</strong> — reportée
              automatiquement dans la capacité totale (§07) tant qu&apos;elle n&apos;y est pas saisie
              manuellement.
            </p>
          )}
          {accessibleRoomsCount > 0 && (
            <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              ♿ {accessibleRoomsCount} chambre(s) PMR déclarée(s) — les équipements
              d&apos;accessibilité correspondants se gèrent en section 10 (Accessibilité).
            </p>
          )}

          {/* Per-room edit modal — opens when editingRoom is set. Amenities are edited here,
              not in the compact row, so every room (not just rooms.items[0]) can have its own amenities. */}
          {editingRoom !== null && rooms.items[editingRoom] && (
            <RoomEditModal
              open
              room={rooms.items[editingRoom]}
              module={rooms}
              onClose={() => setEditingRoom(null)}
              onSave={(updated) => {
                updateRoom(editingRoom, updated);
                setEditingRoom(null);
              }}
            />
          )}

          {/* Add-flow: the modal edits a draft NOT yet in the list — cancel leaves no ghost row. */}
          {creatingRoom && (
            <RoomEditModal
              open
              room={creatingRoom}
              module={rooms}
              onClose={() => setCreatingRoom(null)}
              onSave={(created) => {
                setRoomItems([...rooms.items, created]);
                setCreatingRoom(null);
              }}
            />
          )}
        </>
      )}

      <div className="chip-group__label" style={{ marginTop: 20 }}>
        Politiques d'accueil
      </div>
      {/* §48 single-owner: the group policy is edited in §07 only (last-edit-wins trap otherwise).
          petPolicy stays: this block is its SOLE editing surface (not duplicated in §07). */}
      <OwnedElsewhereNote
        num="07"
        label="Capacité & cadre"
        summary={
          capacity.groupPolicy.minSize || capacity.groupPolicy.maxSize
            ? `Groupes ${capacity.groupPolicy.minSize || '—'}–${capacity.groupPolicy.maxSize || '—'} pers.`
            : undefined
        }
      />
      <div className="grid-3">
        <div>
          <Toggle
            label="Animaux acceptés"
            on={capacity.petPolicy.accepted}
            onChange={(accepted) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                petPolicy: { ...capacity.petPolicy, accepted },
              })
            }
          />
          {capacity.petPolicy.accepted && (
            <Field label="Conditions d'accueil des animaux">
              <Textarea
                aria-label="Conditions d'accueil des animaux"
                value={capacity.petPolicy.conditions}
                rows={3}
                onChange={(conditions) =>
                  editor.replaceModule('capacityPolicies', {
                    ...capacity,
                    petPolicy: { ...capacity.petPolicy, conditions },
                  })
                }
              />
            </Field>
          )}
        </div>
      </div>

      {/* §46 type-gated meetingRooms module — notice INSTEAD of controls when gated (independent of rooms) */}
      {meetingRooms.unavailableReason ? (
        <ModuleUnavailableNotice reason={meetingRooms.unavailableReason} />
      ) : (
        <>
          <div className="chip-group__label" style={{ marginTop: 20 }}>
            Salles séminaire & événementiel
          </div>
          {/* cap_boardroom = salle de CONSEIL (boardroom), pas banquet — le drawer dit « Conseil ». */}
          {repHeader(MICE_COLS, ['Salle', 'Surface m²', 'Théâtre', 'Classe', 'Conseil'])}
          <Repeater
            items={meetingRooms.items}
            getKey={(item, index) => item.recordId ?? `meeting-${index}`}
            columns={MICE_COLS}
            addLabel="Ajouter une salle"
            onAdd={() => setCreatingMeeting(createMeetingRoom())}
            renderRow={(item, index) => (
              <>
                {/* Compact summary — full editing is done inside MeetingRoomEditModal */}
                <span style={{ fontWeight: 600 }}>{item.name || '—'}</span>
                <span>{item.areaM2 ? `${item.areaM2} m²` : '—'}</span>
                <span>{item.capacityTheatre || '—'}</span>
                <span>{item.capacityClassroom || '—'}</span>
                <span>{item.capacityBoardroom || '—'}</span>
                <div className="rep-row__act">
                  <button
                    type="button"
                    aria-label={`Modifier la salle ${item.name || index + 1}`}
                    onClick={() => setEditingMeeting(index)}
                    style={{ fontSize: 12, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="del"
                    aria-label="Supprimer"
                    onClick={() =>
                      editor.replaceModule('meetingRooms', {
                        ...meetingRooms,
                        items: meetingRooms.items.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </>
            )}
          />

          {/* Per-meeting-room edit modal — opens when editingMeeting is set. Equipment is edited here,
              not in the compact row, so every meeting room can have its own equipment set. */}
          {editingMeeting !== null && meetingRooms.items[editingMeeting] && (
            <MeetingRoomEditModal
              open
              room={meetingRooms.items[editingMeeting]}
              equipmentOptions={meetingRooms.equipmentOptions}
              onClose={() => setEditingMeeting(null)}
              onSave={(updated) => {
                updateMeetingRoom(editingMeeting, updated);
                setEditingMeeting(null);
              }}
            />
          )}

          {/* Add-flow: draft salle, appended only on save. */}
          {creatingMeeting && (
            <MeetingRoomEditModal
              open
              room={creatingMeeting}
              equipmentOptions={meetingRooms.equipmentOptions}
              onClose={() => setCreatingMeeting(null)}
              onSave={(created) => {
                editor.replaceModule('meetingRooms', {
                  ...meetingRooms,
                  items: [...meetingRooms.items, created],
                });
                setCreatingMeeting(null);
              }}
            />
          )}
        </>
      )}
    </Fs>
  );
}

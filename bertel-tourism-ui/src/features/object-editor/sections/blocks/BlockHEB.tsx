import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Field, Fs, Input, Repeater, SortableList, StatCard } from '../../primitives';
import { RoomEditModal } from '../../widgets/RoomEditModal';
import { MeetingRoomEditModal } from '../../widgets/MeetingRoomEditModal';
import type { SectionProps } from '../section-types';
import type {
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceRoomTypeItem,
} from '../../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './block-notes';
import { AccueilPolicies, EnvironmentChips } from '../capacity-controls';
import {
  computeUnitCount,
  nextRoomCode,
  reindexRoomPositions,
  syncCapacityWithRooms,
  syncDerivedStructural,
  unitCountMetricCode,
  upsertMaxCapacity,
} from './rooms-utils';

// Dernière piste = actions, en LARGEUR FIXE — un `auto` vaut 0px dans l'en-tête (vide) et
// ~90px dans les lignes (boutons), donc le `1.4fr` partagé se résout différemment et désaligne
// toutes les colonnes. Fixe = pistes identiques en-tête vs lignes (alignement exact).
const ROOM_COLS = '14px 1.4fr 70px 70px 70px 80px 120px';
// No handle column: meeting-room order is NOT persisted (object_meeting_room has no
// position column), so a drag affordance would lie.
const MICE_COLS = '1.4fr 70px 70px 70px 70px 96px';

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 10,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label, index) => (
        <span key={label || `col-${index}`}>{label}</span>
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

export function BlockHEB({ editor, folded, typeCode }: SectionProps) {
  const rooms = editor.draft.rooms;
  const meetingRooms = editor.draft.meetingRooms;
  const capacity = editor.draft.capacityPolicies;
  const characteristics = editor.draft.characteristics;
  const type = typeCode ?? '';
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

  /**
   * Write the rooms list + keep capacity in sync : max_capacity (derived-unless-overridden)
   * ET les métriques structurelles dérivées (bedrooms/pitches/meeting_rooms) pour l'Explorer.
   */
  function setRoomItems(nextItems: ObjectWorkspaceRoomTypeItem[]) {
    editor.replaceModule('rooms', { ...rooms, items: nextItems });
    const synced = syncCapacityWithRooms(capacity, rooms.items, nextItems) ?? capacity;
    editor.replaceModule('capacityPolicies', syncDerivedStructural(synced, nextItems, meetingRooms.items.length, type));
  }

  function setMeetingItems(nextItems: ObjectWorkspaceMeetingRoomItem[]) {
    editor.replaceModule('meetingRooms', { ...meetingRooms, items: nextItems });
    editor.replaceModule('capacityPolicies', syncDerivedStructural(capacity, rooms.items, nextItems.length, type));
  }

  /** Capacité max éditable : crée la ligne si absente (objet vide), sinon mute en place. */
  function setMaxCapacity(value: string) {
    editor.replaceModule('capacityPolicies', upsertMaxCapacity(capacity, value));
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
  const maxCapValue = capacity.capacityItems.find((item) => item.metricCode === 'max_capacity')?.value ?? '';
  const unitCount = computeUnitCount(rooms.items);
  const unitLabel = unitCountMetricCode(type) === 'pitches' ? 'Emplacements' : 'Chambres';

  return (
    <Fs
      num="06"
      title="Chambres, capacité & séminaire"
      sub="Capacité d'accueil, groupes et animaux — et inventaire détaillé des chambres et salles MICE. Alimente les filtres Explorer et la fiche publique."
      folded={folded}
      pill={pill}
    >
      {/* Encart Capacité d'accueil — toujours visible, indépendant des chambres (§64).
          La capacité max est la SEULE valeur chiffrée éditable ; chambres/salles sont dérivées. */}
      <div className="chip-group__label" style={{ marginTop: 0 }}>Capacité d'accueil</div>
      <div className="grid-3" style={{ marginBottom: 6 }}>
        <Field label="Capacité max.">
          <Input value={maxCapValue} type="number" mono aria-label="Capacité max." onChange={setMaxCapacity} />
        </Field>
        {rooms.items.length > 0 && <StatCard label={unitLabel} value={String(unitCount)} />}
        {meetingRooms.items.length > 0 && <StatCard label="Salles de réunion" value={String(meetingRooms.items.length)} />}
      </div>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 12 }}>
        Capacité d'accueil totale. Si vous détaillez les chambres ci-dessous, elle se calcule
        automatiquement — ajustez au besoin (lit d'appoint).
      </p>

      <EnvironmentChips characteristics={characteristics} onChange={(next) => editor.replaceModule('characteristics', next)} />
      <AccueilPolicies capacity={capacity} onChange={(next) => editor.replaceModule('capacityPolicies', next)} />

      {/* §46 type-gated rooms module — notice INSTEAD of controls when gated */}
      {rooms.unavailableReason ? (
        <ModuleUnavailableNotice reason={rooms.unavailableReason} />
      ) : (
        <>
          <div className="chip-group__label" style={{ marginTop: 0 }}>
            Chambres / unités locatives
          </div>
          {repHeader(ROOM_COLS, ['', 'Type · vue', 'Couchages', 'Surface', 'Unités', 'Tarif', ''])}
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

          {accessibleRoomsCount > 0 && (
            <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              ♿ {accessibleRoomsCount} chambre(s) PMR — équipements en §10.
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

      {/* §46 type-gated meetingRooms module — notice INSTEAD of controls when gated (independent of rooms) */}
      {meetingRooms.unavailableReason ? (
        <ModuleUnavailableNotice reason={meetingRooms.unavailableReason} />
      ) : (
        <>
          <div className="chip-group__label" style={{ marginTop: 20 }}>
            Salles séminaire & événementiel
          </div>
          {/* cap_boardroom = salle de CONSEIL (boardroom), pas banquet — le drawer dit « Conseil ». */}
          {repHeader(MICE_COLS, ['Salle', 'Surface m²', 'Théâtre', 'Classe', 'Conseil', ''])}
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
                    onClick={() => setMeetingItems(meetingRooms.items.filter((_, itemIndex) => itemIndex !== index))}
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
                setMeetingItems([...meetingRooms.items, created]);
                setCreatingMeeting(null);
              }}
            />
          )}
        </>
      )}
    </Fs>
  );
}

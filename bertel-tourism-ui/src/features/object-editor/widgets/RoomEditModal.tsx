import { useState } from 'react';
import { EditorModal, ReferenceSelect, ChipMultiSelect, Field, Input, Textarea, Toggle } from '../primitives';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions'>;
  onClose: () => void;
  onSave: (room: ObjectWorkspaceRoomTypeItem) => void;
}

/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item. */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorModal open={open} title={draft.name || 'Type de chambre'} onClose={onClose} onSave={() => onSave(draft)}>
      <Field label="Type de chambre">
        <ReferenceSelect
          value={draft.roomTypeCode}
          options={module.roomTypeOptions}
          allowEmpty
          emptyLabel="— Type non défini —"
          aria-label="Type de chambre"
          onChange={(code, opt) => set({ roomTypeCode: code, roomTypeId: opt?.id ?? '', roomTypeLabel: opt?.label ?? '' })}
        />
      </Field>
      <Field label="Nom / libellé"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
      <Field label="Vue">
        <ReferenceSelect
          value={draft.viewTypeCode}
          options={module.viewTypeOptions}
          allowEmpty
          emptyLabel="— Aucune —"
          aria-label="Vue"
          onChange={(code, opt) => set({ viewTypeCode: code, viewTypeId: opt?.id ?? '', viewTypeLabel: opt?.label ?? '' })}
        />
      </Field>
      <Field label="Couchages"><Input value={draft.capacityTotal} mono onChange={(capacityTotal) => set({ capacityTotal })} /></Field>
      <Field label="Surface (m²)"><Input value={draft.sizeSqm} mono onChange={(sizeSqm) => set({ sizeSqm })} /></Field>
      <Field label="Configuration lits"><Input value={draft.bedConfig} onChange={(bedConfig) => set({ bedConfig })} /></Field>
      <Field label="Unités"><Input value={draft.quantity} mono onChange={(quantity) => set({ quantity })} /></Field>
      <Field label="Tarif"><Input value={draft.basePrice} mono onChange={(basePrice) => set({ basePrice })} /></Field>
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>
      <Field label="Équipements">
        <ChipMultiSelect
          options={module.amenityOptions}
          selected={draft.amenityCodes}
          onToggle={(code) =>
            set({
              amenityCodes: draft.amenityCodes.includes(code)
                ? draft.amenityCodes.filter((c) => c !== code)
                : [...draft.amenityCodes, code],
            })
          }
        />
      </Field>
      <Toggle label="Chambre accessible (PMR)" on={draft.accessible} onChange={(accessible) => set({ accessible })} />
      <Toggle label="Publiée" on={draft.published} onChange={(published) => set({ published })} />
    </EditorModal>
  );
}

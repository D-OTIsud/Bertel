import { useState } from 'react';
import { EditorModal, ChipMultiSelect, Field, Input } from '../primitives';
import type { ObjectWorkspaceMeetingRoomItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface Props {
  open: boolean;
  room: ObjectWorkspaceMeetingRoomItem;
  equipmentOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (room: ObjectWorkspaceMeetingRoomItem) => void;
}

export function MeetingRoomEditModal({ open, room, equipmentOptions, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(room);
  const set = (patch: Partial<ObjectWorkspaceMeetingRoomItem>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorModal open={open} title={draft.name || 'Salle de séminaire'} onClose={onClose} onSave={() => onSave(draft)}>
      <Field label="Nom de la salle"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
      <Field label="Surface (m²)"><Input value={draft.areaM2} mono onChange={(areaM2) => set({ areaM2 })} /></Field>
      <Field label="Capacité théâtre"><Input value={draft.capacityTheatre} mono onChange={(v) => set({ capacityTheatre: v })} /></Field>
      <Field label="Capacité classe"><Input value={draft.capacityClassroom} mono onChange={(v) => set({ capacityClassroom: v })} /></Field>
      <Field label="Capacité banquet"><Input value={draft.capacityBoardroom} mono onChange={(v) => set({ capacityBoardroom: v })} /></Field>
      <Field label="Équipements">
        <ChipMultiSelect
          options={equipmentOptions}
          selected={draft.equipmentCodes}
          onToggle={(code) => set({
            equipmentCodes: draft.equipmentCodes.includes(code)
              ? draft.equipmentCodes.filter((c) => c !== code)
              : [...draft.equipmentCodes, code],
          })}
        />
      </Field>
    </EditorModal>
  );
}

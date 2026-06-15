import { useState, type ReactNode } from 'react';
import { EditorModal, ReferenceSelect, ChipMultiSelect, Field, Input, Textarea, Toggle } from '../primitives';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';
import { applyCouchagesTotal, applyAdults, applyChildren } from '../sections/blocks/rooms-utils';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions'>;
  onClose: () => void;
  onSave: (room: ObjectWorkspaceRoomTypeItem) => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="chip-group__label" style={{ marginTop: 6 }}>{children}</div>;
}

/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item.
 *  Grouped sections + numeric capacities; couchages total anchors a locked adults/enfants split. */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  const priceUnit = `${draft.currency === 'EUR' ? '€' : draft.currency} / nuit`;
  return (
    <EditorModal open={open} title={draft.name || 'Type de chambre'} onClose={onClose} onSave={() => onSave(draft)}>
      <SectionLabel>Identité</SectionLabel>
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

      <SectionLabel>Couchages &amp; capacité</SectionLabel>
      {/* Total is the anchor — adults/children stay locked to it (applyAdults/applyChildren rebalance). */}
      <Field label="Couchages (total)">
        <Input type="number" value={draft.capacityTotal} mono aria-label="Couchages (total)" onChange={(v) => set(applyCouchagesTotal(v))} />
      </Field>
      <Field label="Adultes">
        <Input type="number" value={draft.capacityAdults} mono aria-label="Adultes" onChange={(v) => set(applyAdults(v, draft.capacityTotal))} />
      </Field>
      <Field label="Enfants">
        <Input type="number" value={draft.capacityChildren} mono aria-label="Enfants" onChange={(v) => set(applyChildren(v, draft.capacityTotal))} />
      </Field>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
        Adultes + enfants suivent toujours le total{draft.capacityTotal ? ` (${draft.capacityTotal})` : ''}.
      </p>

      <SectionLabel>Configuration des lits</SectionLabel>
      {/* Phase 1 placeholder — Phase 2 replaces this with the structured « quantité × type de lit » list. */}
      <Field label="Configuration lits"><Input value={draft.bedConfig} aria-label="Configuration lits" onChange={(bedConfig) => set({ bedConfig })} /></Field>

      <SectionLabel>Surface, quantité &amp; tarif</SectionLabel>
      <Field label="Surface">
        <Input type="number" value={draft.sizeSqm} mono suffix="m²" aria-label="Surface" onChange={(sizeSqm) => set({ sizeSqm })} />
      </Field>
      {/* `quantity` = object_room_type.total_rooms — « combien de chambres identiques de ce type ». */}
      <Field label="Nb. de chambres (de ce type)" hint="Nombre de chambres identiques de ce type.">
        <Input type="number" value={draft.quantity} mono aria-label="Nb. de chambres (de ce type)" onChange={(quantity) => set({ quantity })} />
      </Field>
      <Field label="Tarif indicatif">
        <Input type="number" value={draft.basePrice} mono suffix={priceUnit} aria-label="Tarif indicatif" onChange={(basePrice) => set({ basePrice })} />
      </Field>

      <SectionLabel>Description</SectionLabel>
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>

      <SectionLabel>Équipements</SectionLabel>
      <ChipMultiSelect
        options={module.amenityOptions}
        selected={draft.amenityCodes}
        modalTitle="Équipements de la chambre"
        searchPlaceholder="Rechercher un équipement…"
        onChange={(amenityCodes) => set({ amenityCodes })}
      />

      <SectionLabel>Accessibilité &amp; publication</SectionLabel>
      <Toggle
        label="Chambre accessible (PMR)"
        sub="Aménagée pour les personnes à mobilité réduite."
        on={draft.accessible}
        onChange={(accessible) => set({ accessible })}
      />
      <Toggle label="Publiée" on={draft.published} onChange={(published) => set({ published })} />
    </EditorModal>
  );
}

import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { EditorModal, ReferenceSelect, ChipMultiSelect, Field, Input, Textarea, Toggle } from '../primitives';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';
import { applyCouchagesTotal, applyAdults, applyChildren, addBedRow, setBedType, removeBedRow, updateBedQuantity } from '../sections/blocks/rooms-utils';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions' | 'bedTypeOptions'>;
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
      {/* Structured « quantité × type de lit » list (§70). Blank rows are dropped at save (buildBedRows). */}
      {draft.beds.map((bed, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 32px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <Input
            type="number"
            value={bed.quantity}
            mono
            aria-label={`Nombre de lits ${i + 1}`}
            onChange={(q) => setDraft((d) => ({ ...d, beds: updateBedQuantity(d.beds, i, q) }))}
          />
          <ReferenceSelect
            value={bed.bedTypeCode}
            options={module.bedTypeOptions}
            allowEmpty
            emptyLabel="— Type de lit —"
            aria-label={`Type de lit ${i + 1}`}
            onChange={(code, opt) => setDraft((d) => ({ ...d, beds: setBedType(d.beds, i, { id: opt?.id ?? '', code, label: opt?.label ?? '' }) }))}
          />
          <button
            type="button"
            className="del"
            aria-label={`Supprimer le lit ${i + 1}`}
            onClick={() => setDraft((d) => ({ ...d, beds: removeBedRow(d.beds, i) }))}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      ))}
      <button type="button" className="rep-add" onClick={() => setDraft((d) => ({ ...d, beds: addBedRow(d.beds) }))}>
        + Ajouter un lit
      </button>

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

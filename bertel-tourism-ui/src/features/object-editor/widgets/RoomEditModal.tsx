import { useState, type ReactNode } from 'react';
import { Trash2, Search, Lock, Plus } from 'lucide-react';
import { EditorModal, ReferenceSelect, Field, Input, Textarea, Toggle, Chip, ChipSet } from '../primitives';
import { fold } from '../../../components/ui/pickers/fold';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';
import {
  applyCouchagesTotal, applyAdults, applyChildren,
  addBedRow, setBedType, removeBedRow, updateBedQuantity,
} from '../sections/blocks/rooms-utils';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions' | 'bedTypeOptions'>;
  onClose: () => void;
  onSave: (room: ObjectWorkspaceRoomTypeItem) => void;
}

/** Section header with a divider above (first section omits the rule) — gives the modal the
 *  grouped rhythm of the approved mockup. */
function SectionLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div
      className="chip-group__label"
      style={{ margin: 0, paddingTop: first ? 0 : 14, borderTop: first ? 'none' : '1px solid var(--line)' }}
    >
      {children}
    </div>
  );
}

const COL3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'start' } as const;
const COL2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const;
const BED_ROW = { display: 'grid', gridTemplateColumns: '72px 1fr 36px', gap: 8, alignItems: 'center' } as const;
const ICON_BTN = {
  display: 'inline-grid', placeItems: 'center', width: 32, height: 32,
  border: '1px solid transparent', borderRadius: 8, background: 'transparent',
  color: 'var(--ink-3)', cursor: 'pointer',
} as const;

/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item.
 *  Grouped column layout + numeric capacities (total anchors a locked adults/enfants split) +
 *  inline searchable equipment (selected pulled to the top). */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const [equipQuery, setEquipQuery] = useState('');
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  const priceUnit = `${draft.currency === 'EUR' ? '€' : draft.currency} / nuit`;

  const toggleAmenity = (code: string) =>
    set({ amenityCodes: draft.amenityCodes.includes(code) ? draft.amenityCodes.filter((c) => c !== code) : [...draft.amenityCodes, code] });
  const selectedAmenities = module.amenityOptions.filter((o) => draft.amenityCodes.includes(o.code));
  const foldedQuery = fold(equipQuery.trim());
  const availableAmenities = module.amenityOptions.filter(
    (o) => !draft.amenityCodes.includes(o.code) && (foldedQuery === '' || fold(o.label).includes(foldedQuery)),
  );

  return (
    <EditorModal open={open} title={draft.name || 'Type de chambre'} onClose={onClose} onSave={() => onSave(draft)}>
      <SectionLabel first>Identité</SectionLabel>
      <div style={COL2}>
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
      </div>
      <Field label="Nom / libellé"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>

      <SectionLabel>Couchages &amp; capacité</SectionLabel>
      {/* Total is the anchor — adults/children stay locked to it (applyAdults/applyChildren rebalance). */}
      <div style={COL3}>
        <Field label="Couchages (total)">
          <Input type="number" value={draft.capacityTotal} mono aria-label="Couchages (total)" onChange={(v) => set(applyCouchagesTotal(v))} />
        </Field>
        <Field label="Adultes">
          <Input type="number" value={draft.capacityAdults} mono aria-label="Adultes" onChange={(v) => set(applyAdults(v, draft.capacityTotal))} />
        </Field>
        <Field label="Enfants">
          <Input type="number" value={draft.capacityChildren} mono aria-label="Enfants" onChange={(v) => set(applyChildren(v, draft.capacityTotal))} />
        </Field>
      </div>
      <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '2px 0 0' }}>
        <Lock size={13} aria-hidden /> Adultes + enfants suivent toujours le total{draft.capacityTotal ? ` (${draft.capacityTotal})` : ''}.
      </p>

      <SectionLabel>Configuration des lits</SectionLabel>
      {/* Structured « quantité × type de lit » list (§72). Blank rows are dropped at save (buildBedRows). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {draft.beds.map((bed, i) => (
          <div key={i} style={BED_ROW}>
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
              aria-label={`Supprimer le lit ${i + 1}`}
              style={ICON_BTN}
              onClick={() => setDraft((d) => ({ ...d, beds: removeBedRow(d.beds, i) }))}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="rep-add" onClick={() => setDraft((d) => ({ ...d, beds: addBedRow(d.beds) }))}>
        <Plus size={14} aria-hidden /> Ajouter un lit
      </button>

      <SectionLabel>Surface, quantité &amp; tarif</SectionLabel>
      <div style={COL3}>
        <Field label="Surface">
          <Input type="number" value={draft.sizeSqm} mono suffix="m²" aria-label="Surface" onChange={(sizeSqm) => set({ sizeSqm })} />
        </Field>
        {/* `quantity` = object_room_type.total_rooms — « combien de chambres identiques de ce type ». */}
        <Field label="Nb. de chambres">
          <Input type="number" value={draft.quantity} mono aria-label="Nb. de chambres (de ce type)" onChange={(quantity) => set({ quantity })} />
          <span className="muted" style={{ fontSize: 11 }}>chambres identiques</span>
        </Field>
        <Field label="Tarif indicatif">
          <Input type="number" value={draft.basePrice} mono suffix={priceUnit} aria-label="Tarif indicatif" onChange={(basePrice) => set({ basePrice })} />
        </Field>
      </div>

      <SectionLabel>Description</SectionLabel>
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>

      <SectionLabel>Équipements de la chambre</SectionLabel>
      {/* Inline searchable picker — selected pulled to the top, available below (the mockup). */}
      <Input
        value={equipQuery}
        onChange={setEquipQuery}
        placeholder="Rechercher un équipement…"
        aria-label="Rechercher un équipement"
        prefix={<Search size={15} aria-hidden />}
      />
      <div className="chip-group__label" style={{ margin: '4px 0 6px' }}>Sélectionnés ({selectedAmenities.length})</div>
      {selectedAmenities.length > 0 ? (
        <ChipSet>
          {selectedAmenities.map((o) => (
            <Chip key={o.code} label={o.label} on sm title="Retirer" onClick={() => toggleAmenity(o.code)} />
          ))}
        </ChipSet>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>Aucune sélection</span>
      )}
      <div className="chip-group__label" style={{ margin: '10px 0 6px' }}>Disponibles</div>
      {availableAmenities.length > 0 ? (
        <ChipSet>
          {availableAmenities.map((o) => (
            <Chip key={o.code} label={o.label} sm onClick={() => toggleAmenity(o.code)} />
          ))}
        </ChipSet>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>Aucun équipement disponible</span>
      )}

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

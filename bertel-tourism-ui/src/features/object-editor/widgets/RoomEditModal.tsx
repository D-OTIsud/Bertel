import { useState, type ReactNode } from 'react';
import { Trash2, Search, Lock, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { Disclosure, EditorModal, ReferenceSelect, Field, Input, Toggle, Chip, ChipSet } from '../primitives';
import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';
import { fold } from '../../../components/ui/pickers/fold';
import type {
  ObjectWorkspaceRoomTypeItem,
  ObjectWorkspaceRoomsModule,
} from '../../../services/object-workspace-parser';
import {
  applyCouchagesTotal,
  applyAdults,
  applyChildren,
  addBedRow,
  setBedType,
  removeBedRow,
  updateBedQuantity,
  splitRoomAmenities,
} from '../sections/blocks/rooms-utils';
import { MediaLinkField } from './MediaLinkField';
import { resolveMediaLinks } from './media-links';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<
    ObjectWorkspaceRoomsModule,
    | 'roomTypeOptions'
    | 'viewTypeOptions'
    | 'amenityOptions'
    | 'amenityGroups'
    | 'bedTypeOptions'
    | 'mediaOptions'
  >;
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
const BED_ROW = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr 36px',
  gap: 8,
  alignItems: 'center',
} as const;
const ICON_BTN = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 32,
  height: 32,
  border: '1px solid transparent',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--ink-3)',
  cursor: 'pointer',
} as const;
/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item.
 *  Grouped column layout + numeric capacities (total anchors a locked adults/enfants split) +
 *  inline searchable equipment (selected pulled to the top). */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const isNew = room.isNew ?? !room.recordId;
  const [equipQuery, setEquipQuery] = useState('');
  const [openFamilies, setOpenFamilies] = useState<Set<string>>(new Set());
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  const priceUnit = `${draft.currency === 'EUR' ? '€' : draft.currency} / nuit`;

  function selectRoomType(code: string) {
    const option = module.roomTypeOptions.find((candidate) => candidate.code === code);
    const patch: Partial<ObjectWorkspaceRoomTypeItem> = {
      roomTypeCode: code,
      roomTypeId: option?.id ?? '',
      roomTypeLabel: option?.label ?? '',
    };
    // Suggestions only for an untouched new type; an existing room's real capacity
    // and beds must never be reset by choosing a different label.
    if (isNew && !draft.capacityTotal && draft.beds.length === 0) {
      const text = fold(`${code} ${option?.label ?? ''}`);
      const capacity = /triple/.test(text)
        ? '3'
        : /family|familiale/.test(text)
          ? '4'
          : /single|simple/.test(text)
            ? '1'
            : /double|twin|jumeaux|suite/.test(text)
              ? '2'
              : '';
      if (capacity) Object.assign(patch, applyCouchagesTotal(capacity));
      const bedCode = /twin|jumeaux|single|simple/.test(text)
        ? 'single'
        : /double|suite|familiale/.test(text)
          ? 'double'
          : '';
      const bedType = module.bedTypeOptions.find((bed) => bed.code === bedCode);
      if (bedType)
        patch.beds = [
          {
            bedTypeId: bedType.id,
            bedTypeCode: bedType.code,
            bedTypeLabel: bedType.label,
            quantity: /twin|jumeaux/.test(text) ? '2' : '1',
          },
        ];
      if (!draft.quantity) patch.quantity = '1';
    }
    set(patch);
  }

  const toggleAmenity = (code: string) =>
    set({
      amenityCodes: draft.amenityCodes.includes(code)
        ? draft.amenityCodes.filter((c) => c !== code)
        : [...draft.amenityCodes, code],
    });
  const toggleFamily = (code: string) =>
    setOpenFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const selectedAmenities = module.amenityOptions.filter((o) => draft.amenityCodes.includes(o.code));
  const foldedQuery = fold(equipQuery.trim());
  const searchingEquip = foldedQuery !== '';
  // « Les plus courants » (curated common room amenities, flat) + the remaining category groups
  // (collapsed, ordered by industry popularity §73, common codes removed). A search matches across
  // both and auto-expands the categories with hits (§74).
  const isAmenityAvailable = (o: { code: string; label: string }) =>
    !draft.amenityCodes.includes(o.code) && (foldedQuery === '' || fold(o.label).includes(foldedQuery));
  const { common: courantAmenities, categories: dispoGroups } = splitRoomAmenities(
    module.amenityGroups,
    isAmenityAvailable,
  );

  // Room photos = a curation of the establishment's media (object_room_type_media). Linking points
  // at an existing object media row; new files are uploaded in §05 Médias (single media-writer).
  const linkedMedia = resolveMediaLinks(draft.mediaIds, module.mediaOptions);
  const linkedMediaCount = linkedMedia.length;

  return (
    <EditorModal
      open={open}
      title={isNew ? 'Ajouter un type de chambre' : 'Modifier le type de chambre'}
      eyebrow="Chambres · Capacité et équipements"
      saveLabel={isNew ? 'Ajouter' : 'Appliquer'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={isNew && !draft.name.trim()}
      aside={
        <>
          <h3>Sur la fiche</h3>
          <div className="ed-record-modal__preview">
            {linkedMedia[0]?.url && (
              <img className="ed-modal__preview" src={linkedMedia[0].url} alt="" aria-hidden />
            )}
            <strong>{draft.name || draft.roomTypeLabel || 'Nouveau type de chambre'}</strong>
            <p>
              {draft.capacityTotal || '—'} pers. · ×{draft.quantity || '1'} chambre(s)
            </p>
            {draft.beds.length > 0 && (
              <p>
                {draft.beds
                  .map((bed) => `${bed.quantity || '1'} × ${bed.bedTypeLabel || bed.bedTypeCode}`)
                  .join(' · ')}
              </p>
            )}
            {draft.basePrice && (
              <p>
                À partir de {draft.basePrice} {priceUnit}
              </p>
            )}
            {selectedAmenities.length > 0 && (
              <p>{selectedAmenities.map((option) => option.label).join(' · ')}</p>
            )}
            {draft.accessible && <p>Accessible (PMR)</p>}
          </div>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={Boolean(draft.roomTypeCode)}>
              {draft.roomTypeCode ? '✓' : '○'} Type de chambre
            </li>
            <li data-complete={Boolean(draft.name.trim())}>{draft.name.trim() ? '✓' : '○'} Nom</li>
            <li data-complete={Boolean(draft.capacityTotal)}>
              {draft.capacityTotal ? '✓' : '○'} Capacité et lits
            </li>
          </ul>
        </>
      }
    >
      <SectionLabel first>Identité</SectionLabel>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Field label="Type de chambre">
          <ChipSet>
            {module.roomTypeOptions.slice(0, 6).map((option) => (
              <Chip
                key={option.id || option.code}
                label={option.label}
                on={draft.roomTypeCode === option.code}
                onClick={() => selectRoomType(option.code)}
              />
            ))}
          </ChipSet>
          <Disclosure title="Autre type de chambre…">
            <ReferenceSelect
              value={draft.roomTypeCode}
              options={module.roomTypeOptions}
              allowEmpty
              emptyLabel="— Type non défini —"
              aria-label="Type de chambre"
              onChange={selectRoomType}
            />
          </Disclosure>
        </Field>
        <Disclosure title="Vue" defaultOpen={Boolean(draft.viewTypeCode)}>
          <Field label="Vue">
            <ReferenceSelect
              value={draft.viewTypeCode}
              options={module.viewTypeOptions}
              allowEmpty
              emptyLabel="— Aucune —"
              aria-label="Vue"
              onChange={(code, opt) =>
                set({ viewTypeCode: code, viewTypeId: opt?.id ?? '', viewTypeLabel: opt?.label ?? '' })
              }
            />
          </Field>
        </Disclosure>
      </div>
      <Field label="Nom / libellé">
        <Input value={draft.name} onChange={(name) => set({ name })} />
      </Field>
      {/* `quantity` = object_room_type.total_rooms — INVENTORY of this room TYPE, not rooms-inside-a-suite.
          Standalone + explained (PO §74) so it isn't misread as a per-room physical attribute. */}
      <Field label="Nombre de chambres de ce type">
        <Input
          type="number"
          value={draft.quantity}
          mono
          aria-label="Nb. de chambres (de ce type)"
          onChange={(quantity) => set({ quantity })}
        />
        <span className="muted" style={{ fontSize: 11 }}>
          Combien de chambres identiques de ce type l'établissement propose-t-il&nbsp;? (ex.&nbsp;5 suites
          «&nbsp;Vue Mer&nbsp;» identiques)
        </span>
      </Field>

      <SectionLabel>Couchages &amp; capacité</SectionLabel>
      {/* Total is the anchor — adults/children stay locked to it (applyAdults/applyChildren rebalance). */}
      <div style={COL3}>
        <Field label="Couchages (total)">
          <Input
            type="number"
            value={draft.capacityTotal}
            mono
            aria-label="Couchages (total)"
            onChange={(v) => set(applyCouchagesTotal(v))}
          />
        </Field>
        <Field label="Adultes">
          <Input
            type="number"
            value={draft.capacityAdults}
            mono
            aria-label="Adultes"
            onChange={(v) => set(applyAdults(v, draft.capacityTotal))}
          />
        </Field>
        <Field label="Enfants">
          <Input
            type="number"
            value={draft.capacityChildren}
            mono
            aria-label="Enfants"
            onChange={(v) => set(applyChildren(v, draft.capacityTotal))}
          />
        </Field>
      </div>
      <p
        className="muted"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '2px 0 0' }}
      >
        <Lock size={13} aria-hidden /> Adultes + enfants suivent toujours le total
        {draft.capacityTotal ? ` (${draft.capacityTotal})` : ''}.
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
              onChange={(code, opt) =>
                setDraft((d) => ({
                  ...d,
                  beds: setBedType(d.beds, i, { id: opt?.id ?? '', code, label: opt?.label ?? '' }),
                }))
              }
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
      <button
        type="button"
        className="rep-add"
        onClick={() => setDraft((d) => ({ ...d, beds: addBedRow(d.beds) }))}
      >
        <Plus size={14} aria-hidden /> Ajouter un lit
      </button>

      <Disclosure title="Prix indicatif et surface" defaultOpen={Boolean(draft.basePrice || draft.sizeSqm)}>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Field label="Surface">
            <Input
              type="number"
              value={draft.sizeSqm}
              mono
              suffix="m²"
              aria-label="Surface"
              onChange={(sizeSqm) => set({ sizeSqm })}
            />
          </Field>
          <Field label="Tarif indicatif">
            <Input
              type="number"
              value={draft.basePrice}
              mono
              suffix={priceUnit}
              aria-label="Tarif indicatif"
              onChange={(basePrice) => set({ basePrice })}
            />
          </Field>
        </div>
      </Disclosure>

      <Disclosure title="Description" defaultOpen={Boolean(draft.description)}>
        <Field label="Description">
          <MarkdownEditorLazy
            value={draft.description}
            onChange={(description) => set({ description })}
            ariaLabel="Description de la chambre"
            variant="block"
          />
        </Field>
      </Disclosure>

      <Disclosure
        title="Photos et médias"
        summary={linkedMediaCount ? `${linkedMediaCount}` : undefined}
        defaultOpen={linkedMediaCount > 0}
      >
        {/* Rattache des photos de l'établissement à cette chambre (object_room_type_media). Les
          fichiers eux-mêmes s'ajoutent dans la section Médias — ici on choisit lesquels montrer. */}
        <MediaLinkField
          mediaIds={draft.mediaIds}
          options={module.mediaOptions}
          onChange={(mediaIds) => set({ mediaIds })}
          emptyLinkedHint="Aucune photo rattachée à cette chambre."
        />
      </Disclosure>

      <SectionLabel>Équipements de la chambre</SectionLabel>
      {/* Inline searchable picker — selected pulled to the top, available below (the mockup). */}
      <Input
        value={equipQuery}
        onChange={setEquipQuery}
        placeholder="Rechercher un équipement…"
        aria-label="Rechercher un équipement"
        prefix={<Search size={15} aria-hidden />}
      />
      <div className="chip-group__label" style={{ margin: '4px 0 6px' }}>
        Sélectionnés ({selectedAmenities.length})
      </div>
      {selectedAmenities.length > 0 ? (
        <ChipSet>
          {selectedAmenities.map((o) => (
            <Chip key={o.code} label={o.label} on sm title="Retirer" onClick={() => toggleAmenity(o.code)} />
          ))}
        </ChipSet>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>
          Aucune sélection
        </span>
      )}
      {/* Curated common room amenities — flat + always visible, one click away (§74). */}
      {courantAmenities.length > 0 && (
        <>
          <div className="chip-group__label" style={{ margin: '10px 0 6px' }}>
            Les plus courants
          </div>
          <ChipSet>
            {courantAmenities.map((o) => (
              <Chip key={o.code} label={o.label} sm onClick={() => toggleAmenity(o.code)} />
            ))}
          </ChipSet>
        </>
      )}
      <div className="chip-group__label" style={{ margin: '12px 0 6px' }}>
        Par catégorie
      </div>
      {dispoGroups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {dispoGroups.map((g) => {
            const open = searchingEquip || openFamilies.has(g.familyCode);
            return (
              <div key={g.familyCode}>
                <button
                  type="button"
                  onClick={() => toggleFamily(g.familyCode)}
                  aria-expanded={open}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '6px 4px',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    color: 'var(--ink-2)',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'left',
                  }}
                >
                  {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                  <span style={{ flex: 1 }}>{g.familyLabel}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {g.options.length}
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '2px 0 8px 20px' }}>
                    <ChipSet>
                      {g.options.map((o) => (
                        <Chip key={o.code} label={o.label} sm onClick={() => toggleAmenity(o.code)} />
                      ))}
                    </ChipSet>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>
          Aucun équipement disponible
        </span>
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

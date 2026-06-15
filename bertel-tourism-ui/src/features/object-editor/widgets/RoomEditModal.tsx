import { useState, type ReactNode } from 'react';
import { Trash2, Search, Lock, Plus, ChevronDown, ChevronRight, ImagePlus, X, Film, FileText } from 'lucide-react';
import { EditorModal, ReferenceSelect, Field, Input, Textarea, Toggle, Chip, ChipSet } from '../primitives';
import { fold } from '../../../components/ui/pickers/fold';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule, WorkspaceMediaOption } from '../../../services/object-workspace-parser';
import {
  applyCouchagesTotal, applyAdults, applyChildren,
  addBedRow, setBedType, removeBedRow, updateBedQuantity, splitRoomAmenities,
  addRoomMedia, removeRoomMedia, resolveRoomMedia, availableRoomMedia,
} from '../sections/blocks/rooms-utils';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions' | 'amenityGroups' | 'bedTypeOptions' | 'mediaOptions'>;
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
const MEDIA_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 } as const;
const MEDIA_TILE = {
  position: 'relative', aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden',
  border: '1px solid var(--line)', background: 'var(--bg-tint)',
} as const;
const MEDIA_IMG = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const;
const MEDIA_FALLBACK = {
  display: 'grid', placeItems: 'center', width: '100%', height: '100%',
  color: 'var(--ink-3)', gap: 2, padding: 4, textAlign: 'center',
} as const;

/** Storage extension drives the thumbnail: images render as <img>, everything else (videos,
 *  documents) gets a labelled icon tile — robust without a per-row media-type column. */
const isImageUrl = (url: string) => /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url);
const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

/** One media thumbnail: images render as <img>, videos/documents fall back to a labelled icon
 *  tile (the storage extension, not a per-row type column, drives the choice). */
function MediaThumb({ option }: { option: WorkspaceMediaOption }) {
  if (option.url && isImageUrl(option.url)) {
    return <img src={option.url} alt={option.label} style={MEDIA_IMG} loading="lazy" />;
  }
  const Icon = option.url && isVideoUrl(option.url) ? Film : FileText;
  return (
    <span style={MEDIA_FALLBACK}>
      <Icon size={20} aria-hidden />
      <span style={{ fontSize: 10, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {option.label}
      </span>
    </span>
  );
}

/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item.
 *  Grouped column layout + numeric capacities (total anchors a locked adults/enfants split) +
 *  inline searchable equipment (selected pulled to the top). */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const [equipQuery, setEquipQuery] = useState('');
  const [openFamilies, setOpenFamilies] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  const priceUnit = `${draft.currency === 'EUR' ? '€' : draft.currency} / nuit`;

  const toggleAmenity = (code: string) =>
    set({ amenityCodes: draft.amenityCodes.includes(code) ? draft.amenityCodes.filter((c) => c !== code) : [...draft.amenityCodes, code] });
  const toggleFamily = (code: string) =>
    setOpenFamilies((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  const selectedAmenities = module.amenityOptions.filter((o) => draft.amenityCodes.includes(o.code));
  const foldedQuery = fold(equipQuery.trim());
  const searchingEquip = foldedQuery !== '';
  // « Les plus courants » (curated common room amenities, flat) + the remaining category groups
  // (collapsed, ordered by industry popularity §73, common codes removed). A search matches across
  // both and auto-expands the categories with hits (§74).
  const isAmenityAvailable = (o: { code: string; label: string }) =>
    !draft.amenityCodes.includes(o.code) && (foldedQuery === '' || fold(o.label).includes(foldedQuery));
  const { common: courantAmenities, categories: dispoGroups } = splitRoomAmenities(module.amenityGroups, isAmenityAvailable);

  // Room photos = a curation of the establishment's media (object_room_type_media). Linking points
  // at an existing object media row; new files are uploaded in §05 Médias (single media-writer).
  const linkedMedia = resolveRoomMedia(draft.mediaIds, module.mediaOptions);
  const availableMedia = availableRoomMedia(draft.mediaIds, module.mediaOptions);

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
      {/* `quantity` = object_room_type.total_rooms — INVENTORY of this room TYPE, not rooms-inside-a-suite.
          Standalone + explained (PO §74) so it isn't misread as a per-room physical attribute. */}
      <Field label="Nombre de chambres de ce type">
        <Input type="number" value={draft.quantity} mono aria-label="Nb. de chambres (de ce type)" onChange={(quantity) => set({ quantity })} />
        <span className="muted" style={{ fontSize: 11 }}>
          Combien de chambres identiques de ce type l'établissement propose-t-il&nbsp;? (ex.&nbsp;5 suites «&nbsp;Vue Mer&nbsp;» identiques)
        </span>
      </Field>

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

      <SectionLabel>Surface &amp; tarif</SectionLabel>
      <div style={COL2}>
        <Field label="Surface">
          <Input type="number" value={draft.sizeSqm} mono suffix="m²" aria-label="Surface" onChange={(sizeSqm) => set({ sizeSqm })} />
        </Field>
        <Field label="Tarif indicatif">
          <Input type="number" value={draft.basePrice} mono suffix={priceUnit} aria-label="Tarif indicatif" onChange={(basePrice) => set({ basePrice })} />
        </Field>
      </div>

      <SectionLabel>Description</SectionLabel>
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>

      <SectionLabel>Photos &amp; médias{linkedMedia.length > 0 ? ` (${linkedMedia.length})` : ''}</SectionLabel>
      {/* Rattache des photos de l'établissement à cette chambre (object_room_type_media). Les
          fichiers eux-mêmes s'ajoutent dans la section Médias — ici on choisit lesquels montrer. */}
      {linkedMedia.length > 0 ? (
        <div style={MEDIA_GRID}>
          {linkedMedia.map((m) => (
            <div key={m.id} style={MEDIA_TILE} title={m.label}>
              <MediaThumb option={m} />
              <button
                type="button"
                aria-label={`Retirer la photo ${m.label}`}
                onClick={() => set({ mediaIds: removeRoomMedia(draft.mediaIds, m.id) })}
                style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                  display: 'grid', placeItems: 'center', borderRadius: 999, border: 'none',
                  background: 'rgba(0,0,0,.55)', color: '#fff', cursor: 'pointer',
                }}
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>Aucune photo rattachée à cette chambre.</span>
      )}
      <button type="button" className="rep-add" onClick={() => setLinking((v) => !v)} aria-expanded={linking}>
        <ImagePlus size={14} aria-hidden /> {linking ? 'Fermer' : 'Lier une photo'}
      </button>
      {linking && (
        module.mediaOptions.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Aucune photo n'est encore enregistrée pour cet établissement. Ajoutez des photos dans la
            section <strong>Médias</strong>, puis revenez les rattacher ici.
          </p>
        ) : availableMedia.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Toutes les photos de l'établissement sont déjà rattachées à cette chambre.
          </p>
        ) : (
          <div style={{ ...MEDIA_GRID, marginTop: 8 }}>
            {availableMedia.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-label={`Lier la photo ${m.label}`}
                title={m.label}
                onClick={() => set({ mediaIds: addRoomMedia(draft.mediaIds, m.id) })}
                style={{ ...MEDIA_TILE, padding: 0, cursor: 'pointer' }}
              >
                <MediaThumb option={m} />
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', bottom: 4, right: 4, width: 22, height: 22,
                    display: 'grid', placeItems: 'center', borderRadius: 999,
                    background: 'var(--accent, #2563eb)', color: '#fff',
                  }}
                >
                  <Plus size={13} />
                </span>
              </button>
            ))}
          </div>
        )
      )}

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
      {/* Curated common room amenities — flat + always visible, one click away (§74). */}
      {courantAmenities.length > 0 && (
        <>
          <div className="chip-group__label" style={{ margin: '10px 0 6px' }}>Les plus courants</div>
          <ChipSet>
            {courantAmenities.map((o) => (
              <Chip key={o.code} label={o.label} sm onClick={() => toggleAmenity(o.code)} />
            ))}
          </ChipSet>
        </>
      )}
      <div className="chip-group__label" style={{ margin: '12px 0 6px' }}>Par catégorie</div>
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
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '6px 4px', background: 'transparent', border: 0, cursor: 'pointer',
                    color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, textAlign: 'left',
                  }}
                >
                  {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                  <span style={{ flex: 1 }}>{g.familyLabel}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{g.options.length}</span>
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

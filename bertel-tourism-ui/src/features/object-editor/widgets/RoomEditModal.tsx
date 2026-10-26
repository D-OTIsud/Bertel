import { useId, useState, type ComponentProps } from 'react';
import { Trash2, Search, Minus, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { EditorModal, ReferenceSelect, Field, Input, Toggle, Chip, ChipSet } from '../primitives';
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
import './room-edit-modal.css';

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

/** Compact controls keep the model's rhythm while retaining direct numeric entry. */
function RoomStepper({
  value, onChange, min = 0, 'aria-label': label, ...inputProps
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const minimum = Number(min);
  const current = Number.parseInt(value, 10) || 0;
  return (
    <div className="room-stepper">
      <button type="button" aria-label={`Diminuer ${label}`} disabled={current <= minimum}
        onClick={() => onChange(String(Math.max(minimum, current - 1)))}>
        <Minus size={13} aria-hidden />
      </button>
      <input {...inputProps} type="number" min={min} value={value} aria-label={label}
        onChange={(event) => onChange(event.target.value)} />
      <button type="button" aria-label={`Augmenter ${label}`}
        onClick={() => onChange(String(Math.max(minimum, current + 1)))}>
        <Plus size={13} aria-hidden />
      </button>
    </div>
  );
}

/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item.
 *  Grouped column layout + numeric capacities (total anchors a locked adults/enfants split) +
 *  inline searchable equipment (selected pulled to the top). */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const isNew = room.isNew ?? !room.recordId;
  const expansionId = useId();
  const [showOtherTypes, setShowOtherTypes] = useState(Boolean(room.roomTypeCode &&
    !module.roomTypeOptions.slice(0, 6).some((option) => option.code === room.roomTypeCode)));
  const [showSplit, setShowSplit] = useState(Number.parseInt(room.capacityChildren, 10) > 0);
  const [bedsOpen, setBedsOpen] = useState(false);
  const [allEquipmentOpen, setAllEquipmentOpen] = useState(false);
  const [optional, setOptional] = useState({
    view: Boolean(room.viewTypeCode), size: Boolean(room.sizeSqm),
    description: Boolean(room.description), photos: room.mediaIds.length > 0,
  });
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
  const allCommon = splitRoomAmenities(module.amenityGroups, () => true).common.slice(0, 10);
  const compactCodes = new Set(allCommon.map((option) => option.code));
  const compactAmenities = [...allCommon, ...selectedAmenities.filter((option) => !compactCodes.has(option.code))];
  const visibleCompactAmenities = compactAmenities.filter((option) =>
    !searchingEquip || fold(option.label).includes(foldedQuery));
  const { common: courantAmenities, categories: dispoGroups } = splitRoomAmenities(
    module.amenityGroups,
    (option) => !compactCodes.has(option.code) && isAmenityAvailable(option),
  );

  // Room photos = a curation of the establishment's media (object_room_type_media). Linking points
  // at an existing object media row; new files are uploaded in §05 Médias (single media-writer).
  const linkedMedia = resolveMediaLinks(draft.mediaIds, module.mediaOptions);
  const linkedMediaCount = linkedMedia.length;

  const bedsSummary = draft.beds.length
    ? draft.beds.map((bed) => `${bed.quantity || '1'} × ${bed.bedTypeLabel || bed.bedTypeCode || 'lit à préciser'}`).join(' + ')
    : draft.bedConfig || 'Aucun lit indiqué';
  const previewFacts = [draft.capacityTotal ? `${draft.capacityTotal} pers.` : null,
    draft.beds.length ? bedsSummary : draft.bedConfig || null,
    draft.sizeSqm ? `${draft.sizeSqm} m²` : null].filter(Boolean).join(' · ');
  const toggleOptional = (key: keyof typeof optional) =>
    setOptional((value) => ({ ...value, [key]: !value[key] }));

  return (
    <EditorModal
      open={open}
      className="ed-room-modal"
      title={isNew ? 'Ajouter un type de chambre' : 'Modifier le type de chambre'}
      eyebrow="Chambres · Capacité et équipements"
      saveLabel={isNew ? 'Ajouter' : 'Appliquer'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={isNew && !draft.name.trim()}
      aside={
        <>
          <h3>Sur la fiche</h3>
          <div className="ed-record-modal__preview room-preview">
            <div className="room-preview__photo">
              {linkedMedia[0]?.url ? <img src={linkedMedia[0].url} alt="" aria-hidden /> : 'Aucune photo'}
            </div>
            <div className="room-preview__content">
              <div className="room-preview__name">
                <strong>{draft.name || draft.roomTypeLabel || 'Nouveau type de chambre'}</strong>
                <span>×{draft.quantity || '1'}</span>
              </div>
              {(draft.roomTypeLabel || draft.viewTypeLabel) && <p>{[draft.roomTypeLabel, draft.viewTypeLabel].filter(Boolean).join(' · ')}</p>}
              {previewFacts && <p>{previewFacts}</p>}
              {selectedAmenities.length > 0 && <div className="room-preview__tags">
                {selectedAmenities.slice(0, 4).map((option) => <span key={option.code}>{option.label}</span>)}
                {selectedAmenities.length > 4 && <span>+{selectedAmenities.length - 4}</span>}
              </div>}
              {draft.basePrice && <p>À partir de <b>{draft.basePrice} {priceUnit}</b></p>}
              {draft.accessible && <p>Accessible (PMR)</p>}
              {!draft.published && <p>Non visible sur la fiche</p>}
            </div>
          </div>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={Boolean(draft.roomTypeCode)}>{draft.roomTypeCode ? '✓' : '○'} Type de chambre</li>
            <li data-complete={Boolean(draft.name.trim())}>{draft.name.trim() ? '✓' : '○'} Nom</li>
            <li data-complete={Boolean(draft.capacityTotal)}>{draft.capacityTotal ? '✓' : '○'} Capacité et lits</li>
          </ul>
        </>
      }
    >
      <section className="room-section room-section--first" aria-labelledby={`${expansionId}-type-title`}>
        <div className="room-section__heading">
          <h3 id={`${expansionId}-type-title`}>Quel type de chambre ?</h3>
          <span>pré-remplit la capacité et les lits</span>
        </div>
        <ChipSet>
          {module.roomTypeOptions.slice(0, 6).map((option) => <Chip key={option.id || option.code}
            label={option.label} on={draft.roomTypeCode === option.code} onClick={() => selectRoomType(option.code)} />)}
          <button type="button" className="chip room-more" aria-expanded={showOtherTypes}
            aria-controls={`${expansionId}-types`} onClick={() => setShowOtherTypes((value) => !value)}>Autre type…</button>
        </ChipSet>
        <div id={`${expansionId}-types`} hidden={!showOtherTypes}>
          <ReferenceSelect value={draft.roomTypeCode} options={module.roomTypeOptions} allowEmpty
            emptyLabel="— Type non défini —" aria-label="Type de chambre" onChange={selectRoomType} />
        </div>
      </section>

      <div className="room-identity">
        <Field label="Nom affiché sur la fiche"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
        <Field label="Nombre de chambres identiques">
          <RoomStepper value={draft.quantity} min={1} aria-label="Nb. de chambres (de ce type)" onChange={(quantity) => set({ quantity })} />
        </Field>
      </div>

      <section className="room-section" aria-labelledby={`${expansionId}-capacity-title`}>
        <h3 id={`${expansionId}-capacity-title`}>Couchage</h3>
        <div className="room-capacity">
          <div className="room-inline-field">
            <label htmlFor={`${expansionId}-capacity-input`}>Personnes</label>
            <RoomStepper id={`${expansionId}-capacity-input`} value={draft.capacityTotal} aria-label="Couchages (total)"
              onChange={(value) => set(applyCouchagesTotal(value))} />
          </div>
          <button type="button" className="room-link" aria-expanded={showSplit} aria-controls={`${expansionId}-split`}
            onClick={() => setShowSplit((value) => !value)}>{showSplit ? 'Masquer adultes / enfants' : 'Préciser adultes / enfants'}</button>
        </div>
        <div className="room-split" id={`${expansionId}-split`} hidden={!showSplit}>
          <Field label="Adultes"><RoomStepper value={draft.capacityAdults} aria-label="Adultes"
            onChange={(value) => set(applyAdults(value, draft.capacityTotal))} /></Field>
          <Field label="Enfants"><RoomStepper value={draft.capacityChildren} aria-label="Enfants"
            onChange={(value) => set(applyChildren(value, draft.capacityTotal))} /></Field>
          <p>Adultes + enfants suivent le total{draft.capacityTotal ? ` (${draft.capacityTotal})` : ''}.</p>
        </div>
        <div className="room-beds">
          <div className="room-beds__summary"><span>Lits : <strong>{bedsSummary}</strong></span>
            <button type="button" className="room-link" aria-expanded={bedsOpen} aria-controls={`${expansionId}-beds`}
              onClick={() => setBedsOpen((value) => !value)}>{bedsOpen ? 'Réduire' : 'Modifier'}</button>
          </div>
          <div id={`${expansionId}-beds`} hidden={!bedsOpen}>
            <div className="room-beds__rows">
              {draft.beds.map((bed, index) => <div className="room-bed-row" key={index}>
                <RoomStepper value={bed.quantity} min={1} aria-label={`Nombre de lits ${index + 1}`}
                  onChange={(quantity) => setDraft((value) => ({ ...value, beds: updateBedQuantity(value.beds, index, quantity) }))} />
                <ReferenceSelect value={bed.bedTypeCode} options={module.bedTypeOptions} allowEmpty
                  emptyLabel="— Type de lit —" aria-label={`Type de lit ${index + 1}`}
                  onChange={(code, option) => setDraft((value) => ({ ...value,
                    beds: setBedType(value.beds, index, { id: option?.id ?? '', code, label: option?.label ?? '' }) }))} />
                <button type="button" className="room-icon-button" aria-label={`Supprimer le lit ${index + 1}`}
                  onClick={() => setDraft((value) => ({ ...value, beds: removeBedRow(value.beds, index) }))}><Trash2 size={15} aria-hidden /></button>
              </div>)}
            </div>
            <button type="button" className="room-link" onClick={() => setDraft((value) => ({ ...value, beds: addBedRow(value.beds) }))}>
              <Plus size={14} aria-hidden /> Ajouter un lit
            </button>
          </div>
        </div>
      </section>

      <section className="room-section" aria-labelledby={`${expansionId}-price-title`}>
        <div className="room-section__heading"><h3 id={`${expansionId}-price-title`}>Prix indicatif</h3>
          <span>facultatif · le détail se saisit dans la section Tarifs</span></div>
        <div className="room-price"><span>À partir de</span><div>
          <Input type="number" value={draft.basePrice} mono suffix={draft.currency === 'EUR' ? '€' : draft.currency}
            aria-label="Tarif indicatif" onChange={(basePrice) => set({ basePrice })} /></div><span>par nuit</span></div>
      </section>

      <section className="room-section" aria-labelledby={`${expansionId}-equipment-title`}>
        <h3 id={`${expansionId}-equipment-title`}>Équipements de la chambre</h3>
        <ChipSet>
          {visibleCompactAmenities.map((option) => <Chip key={option.code} label={option.label}
            on={draft.amenityCodes.includes(option.code)} sm onClick={() => toggleAmenity(option.code)} />)}
          <button type="button" className="chip size-sm room-more" aria-expanded={allEquipmentOpen}
            aria-controls={`${expansionId}-equipment`} onClick={() => {
              setAllEquipmentOpen((value) => !value);
              setEquipQuery('');
            }}>{allEquipmentOpen ? 'Réduire les équipements' : 'Tous les équipements…'}</button>
        </ChipSet>
        <div className="room-equipment-details" id={`${expansionId}-equipment`} hidden={!allEquipmentOpen}>
          <Input value={equipQuery} onChange={setEquipQuery} placeholder="Rechercher un équipement…"
            aria-label="Rechercher un équipement" prefix={<Search size={15} aria-hidden />} />
          {courantAmenities.length > 0 && <ChipSet>{courantAmenities.map((option) =>
            <Chip key={option.code} label={option.label} sm onClick={() => toggleAmenity(option.code)} />)}</ChipSet>}
          {dispoGroups.map((group) => {
            const expanded = searchingEquip || openFamilies.has(group.familyCode);
            return <div key={group.familyCode}>
              <button type="button" className="room-equipment-family" aria-expanded={expanded}
                onClick={() => toggleFamily(group.familyCode)}>
                {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                <span>{group.familyLabel}</span><small>{group.options.length}</small>
              </button>
              {expanded && <div className="room-equipment-family__body"><ChipSet>{group.options.map((option) =>
                <Chip key={option.code} label={option.label} sm onClick={() => toggleAmenity(option.code)} />)}</ChipSet></div>}
            </div>;
          })}
          {searchingEquip && visibleCompactAmenities.length + courantAmenities.length + dispoGroups.length === 0 &&
            <p className="muted">Aucun équipement ne correspond à cette recherche.</p>}
        </div>
      </section>

      <section className="room-section room-options" aria-label="Informations complémentaires">
        <div className="room-option-links">
          <button type="button" className="room-link" aria-expanded={optional.view} aria-controls={`${expansionId}-view`}
            onClick={() => toggleOptional('view')}>{optional.view ? 'Vue' : '+ Vue'}</button>
          <button type="button" className="room-link" aria-expanded={optional.size} aria-controls={`${expansionId}-size`}
            onClick={() => toggleOptional('size')}>{optional.size ? 'Surface' : '+ Surface'}</button>
          <button type="button" className="room-link" aria-expanded={optional.description} aria-controls={`${expansionId}-description`}
            onClick={() => toggleOptional('description')}>{optional.description ? 'Description' : '+ Description'}</button>
          <button type="button" className="room-link" aria-label={`Photos et médias${linkedMediaCount ? ` ${linkedMediaCount}` : ''}`}
            aria-expanded={optional.photos} aria-controls={`${expansionId}-photos`} onClick={() => toggleOptional('photos')}>
            {optional.photos ? 'Photos' : '+ Photos'}{linkedMediaCount ? ` (${linkedMediaCount})` : ''}</button>
        </div>
        <div id={`${expansionId}-view`} hidden={!optional.view}><Field label="Vue">
          <ReferenceSelect value={draft.viewTypeCode} options={module.viewTypeOptions} allowEmpty emptyLabel="— Aucune —"
            aria-label="Vue" onChange={(code, option) => set({ viewTypeCode: code, viewTypeId: option?.id ?? '', viewTypeLabel: option?.label ?? '' })} />
        </Field></div>
        <div id={`${expansionId}-size`} className="room-surface" hidden={!optional.size}><Field label="Surface">
          <Input type="number" value={draft.sizeSqm} mono suffix="m²" aria-label="Surface" onChange={(sizeSqm) => set({ sizeSqm })} />
        </Field></div>
        <div id={`${expansionId}-description`} hidden={!optional.description}><Field label="Description">
          <MarkdownEditorLazy value={draft.description} onChange={(description) => set({ description })}
            ariaLabel="Description de la chambre" variant="block" />
        </Field></div>
        <div id={`${expansionId}-photos`} hidden={!optional.photos}>
          <MediaLinkField mediaIds={draft.mediaIds} options={module.mediaOptions}
            onChange={(mediaIds) => set({ mediaIds })} emptyLinkedHint="Aucune photo rattachée à cette chambre." />
        </div>
      </section>

      <div className="room-section room-toggles">
        <Toggle label="Chambre accessible (PMR)" on={draft.accessible} onChange={(accessible) => set({ accessible })} />
        <Toggle label="Visible sur la fiche" on={draft.published} onChange={(published) => set({ published })} />
      </div>
    </EditorModal>
  );
}

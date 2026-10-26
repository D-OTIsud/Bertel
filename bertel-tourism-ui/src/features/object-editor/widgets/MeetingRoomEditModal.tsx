import { useId, useState } from 'react';
import { Chip, ChipSet, EditorModal, Field, Input } from '../primitives';
import type {
  ObjectWorkspaceMeetingRoomItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import './meeting-room-edit-modal.css';

interface Props {
  open: boolean;
  room: ObjectWorkspaceMeetingRoomItem;
  equipmentOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (room: ObjectWorkspaceMeetingRoomItem) => void;
}

const DISPOSITIONS = [
  { key: 'capacityTheatre', label: 'Théâtre', inputLabel: 'Capacité théâtre' },
  { key: 'capacityU', label: 'En U', inputLabel: 'Capacité en U' },
  { key: 'capacityClassroom', label: 'Classe', inputLabel: 'Capacité classe' },
  { key: 'capacityBoardroom', label: 'Conseil', inputLabel: 'Capacité conseil' },
] as const;
type Disposition = typeof DISPOSITIONS[number]['key'];

/** Small diagrams from the approved four room layouts; no external visual dependency. */
function DispositionDiagram({ disposition }: { disposition: Disposition }) {
  return <svg width="64" height="44" viewBox="0 0 64 44" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="60" height="40" rx="4" stroke="var(--line)" />
    <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      {disposition === 'capacityTheatre' && <path d="M14 13h36M14 21h36M14 29h36M24 36h16" />}
      {disposition === 'capacityU' && <path d="M16 10v24h32V10" />}
      {disposition === 'capacityClassroom' && <path d="M13 13h15m9 0h15M13 23h15m9 0h15M13 33h15m9 0h15" />}
      {disposition === 'capacityBoardroom' && <path d="M18 15h28v15H18z" />}
    </g>
  </svg>;
}

export function MeetingRoomEditModal({ open, room, equipmentOptions, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(room);
  const layoutId = useId();
  const [expanded, setExpanded] = useState<Set<Disposition>>(() =>
    new Set(DISPOSITIONS.filter(({ key }) => room[key] !== '').map(({ key }) => key)));
  const set = (patch: Partial<ObjectWorkspaceMeetingRoomItem>) => setDraft((value) => ({ ...value, ...patch }));
  const hasCapacity = DISPOSITIONS.some(({ key }) => draft[key]);
  return (
    <EditorModal
      className="ed-record-modal--meeting-room ed-meeting-room-modal"
      open={open}
      title={room.recordId ? 'Modifier la salle de réunion' : 'Ajouter une salle de réunion'}
      eyebrow="Salles et séminaires"
      saveLabel={room.recordId ? 'Appliquer' : 'Ajouter'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!room.recordId && !draft.name.trim()}
      aside={<>
        <h3>Sur la fiche</h3>
        <div className="ed-record-modal__preview">
          <strong>{draft.name || 'Nouvelle salle'}</strong>
          {draft.areaM2 && <p>{draft.areaM2} m²</p>}
          {hasCapacity ? DISPOSITIONS.filter(({ key }) => draft[key]).map(({ key, label }) =>
            <p key={key}>{label} · {draft[key]} personnes</p>) : <p>Capacité à renseigner</p>}
          {draft.equipmentCodes.length > 0 && <p>{equipmentOptions
            .filter((option) => draft.equipmentCodes.includes(option.code))
            .map((option) => option.label).join(' · ')}</p>}
        </div>
        <h3>Avant d’appliquer</h3>
        <ul className="ed-record-modal__checks">
          <li data-complete={Boolean(draft.name.trim())}>{draft.name.trim() ? '✓' : '○'} Nom</li>
          <li data-complete={hasCapacity}>{hasCapacity ? '✓' : '○'} Capacité selon la disposition</li>
          <li>Équipements · facultatif</li>
        </ul>
      </>}
    >
      <div className="meeting-room-identity">
        <Field label="Nom de la salle"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
        <Field label="Surface"><Input type="number" value={draft.areaM2} mono suffix="m²"
          aria-label="Surface (m²)" onChange={(areaM2) => set({ areaM2 })} /></Field>
      </div>
      <section className="ed-modal__section">
        <div className="meeting-room-heading"><h3>Combien de personnes, selon la disposition ?</h3>
          <span>cliquez les dispositions proposées</span></div>
        <div className="meeting-room-layouts">
          {DISPOSITIONS.map(({ key, label, inputLabel }) => <div className="meeting-room-layout"
            key={key} data-active={expanded.has(key)}>
            <button type="button" className="meeting-room-layout__heading" aria-expanded={expanded.has(key)}
              aria-controls={`${layoutId}-${key}`} onClick={() => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}>
              <DispositionDiagram disposition={key} /><span>{label}</span>
            </button>
            <div className="meeting-room-layout__capacity" id={`${layoutId}-${key}`} hidden={!expanded.has(key)}>
              <Input type="number" value={draft[key]} mono aria-label={inputLabel}
                onChange={(value) => set({ [key]: value })} /><span>personnes</span>
            </div>
          </div>)}
        </div>
      </section>
      <section className="ed-modal__section"><h3>Équipements</h3><ChipSet>
        {equipmentOptions.map((option) => <Chip key={option.id || option.code} label={option.label}
          on={draft.equipmentCodes.includes(option.code)} onClick={() => set({
            equipmentCodes: draft.equipmentCodes.includes(option.code)
              ? draft.equipmentCodes.filter((code) => code !== option.code)
              : [...draft.equipmentCodes, option.code],
          })} />)}
      </ChipSet></section>
    </EditorModal>
  );
}

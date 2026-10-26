import { useState } from 'react';
import { Chip, ChipSet, EditorModal, Field, Input } from '../primitives';
import type {
  ObjectWorkspaceMeetingRoomItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

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
    <EditorModal
      open={open}
      title={room.recordId ? 'Modifier la salle de réunion' : 'Ajouter une salle de réunion'}
      eyebrow="Salles et séminaires"
      saveLabel={room.recordId ? 'Appliquer' : 'Ajouter'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!room.recordId && !draft.name.trim()}
      aside={
        <>
          <h3>Sur la fiche</h3>
          <div className="ed-record-modal__preview">
            <strong>{draft.name || 'Nouvelle salle'}</strong>
            <p>{draft.areaM2 ? `${draft.areaM2} m²` : 'Surface non renseignée'}</p>
            {[
              ['Théâtre', draft.capacityTheatre],
              ['En U', draft.capacityU],
              ['Classe', draft.capacityClassroom],
              ['Conseil', draft.capacityBoardroom],
            ]
              .filter(([, count]) => count)
              .map(([name, count]) => (
                <p key={name}>
                  {name} · {count} personnes
                </p>
              ))}
            {draft.equipmentCodes.length > 0 && (
              <p>
                {equipmentOptions
                  .filter((option) => draft.equipmentCodes.includes(option.code))
                  .map((option) => option.label)
                  .join(' · ')}
              </p>
            )}
          </div>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={Boolean(draft.name.trim())}>{draft.name.trim() ? '✓' : '○'} Nom</li>
            <li
              data-complete={Boolean(
                draft.capacityTheatre ||
                draft.capacityU ||
                draft.capacityClassroom ||
                draft.capacityBoardroom,
              )}
            >
              Capacité selon la disposition
            </li>
            <li>Équipements · facultatif</li>
          </ul>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Nom de la salle">
          <Input value={draft.name} onChange={(name) => set({ name })} />
        </Field>
        <Field label="Surface (m²)">
          <Input value={draft.areaM2} mono onChange={(areaM2) => set({ areaM2 })} />
        </Field>
      </div>
      <section className="ed-modal__section">
        <h3>Combien de personnes, selon la disposition ?</h3>
        <div className="grid-2">
          <Field label="Capacité théâtre">
            <Input value={draft.capacityTheatre} mono onChange={(v) => set({ capacityTheatre: v })} />
          </Field>
          <Field label="Capacité en U">
            <Input
              value={draft.capacityU}
              mono
              aria-label="Capacité en U"
              onChange={(v) => set({ capacityU: v })}
            />
          </Field>
          <Field label="Capacité classe">
            <Input value={draft.capacityClassroom} mono onChange={(v) => set({ capacityClassroom: v })} />
          </Field>
          {/* cap_boardroom = configuration CONSEIL (boardroom) — l'ancien libellé « banquet » faisait
          saisir les chiffres banquet dans la mauvaise colonne. */}
          <Field label="Capacité conseil">
            <Input
              value={draft.capacityBoardroom}
              mono
              aria-label="Capacité conseil"
              onChange={(v) => set({ capacityBoardroom: v })}
            />
          </Field>
        </div>
      </section>
      <Field label="Équipements">
        <ChipSet>
          {equipmentOptions.map((option) => (
            <Chip
              key={option.id || option.code}
              label={option.label}
              on={draft.equipmentCodes.includes(option.code)}
              onClick={() =>
                set({
                  equipmentCodes: draft.equipmentCodes.includes(option.code)
                    ? draft.equipmentCodes.filter((code) => code !== option.code)
                    : [...draft.equipmentCodes, option.code],
                })
              }
            />
          ))}
        </ChipSet>
      </Field>
    </EditorModal>
  );
}

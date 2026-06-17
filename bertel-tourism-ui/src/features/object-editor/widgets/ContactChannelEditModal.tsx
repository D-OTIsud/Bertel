import { useState } from 'react';
import { EditorModal, Field, Input, ReferenceSelect, Toggle } from '../primitives';
import type {
  ObjectWorkspaceContactItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

interface ContactChannelEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  contact: ObjectWorkspaceContactItem;
  kindOptions: WorkspaceReferenceOption[];
  roleOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (contact: ObjectWorkspaceContactItem) => void;
}

/**
 * Focused add/edit modal for one §03 contact channel (phone / e-mail / booking link…).
 * Edits a draft copy; onSave returns the patched item — the section commits it and
 * reconciles the per-kind single-primary invariant. The value is trimmed on save to
 * match the saver (saveObjectWorkspaceContacts also trims).
 */
export function ContactChannelEditModal({
  open,
  mode,
  contact,
  kindOptions,
  roleOptions,
  onClose,
  onSave,
}: ContactChannelEditModalProps) {
  const [draft, setDraft] = useState(contact);
  const set = (patch: Partial<ObjectWorkspaceContactItem>) => setDraft((current) => ({ ...current, ...patch }));
  const saveDisabled = !draft.kindCode || draft.value.trim() === '';

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier le canal de contact' : 'Ajouter un canal de contact'}
      onClose={onClose}
      onSave={() => onSave({ ...draft, value: draft.value.trim() })}
      saveDisabled={saveDisabled}
    >
      <Field label="Type de contact" required>
        <ReferenceSelect
          value={draft.kindCode}
          options={kindOptions}
          aria-label="Type de contact"
          onChange={(code, option) =>
            set({ kindCode: code, kindId: option?.id ?? draft.kindId, kindLabel: option?.label ?? draft.kindLabel })
          }
        />
      </Field>

      <Field label="Rôle">
        <ReferenceSelect
          value={draft.roleCode}
          options={roleOptions}
          allowEmpty
          emptyLabel="— Aucun rôle —"
          aria-label="Rôle du contact"
          onChange={(code, option) =>
            set({ roleCode: code, roleId: option?.id ?? '', roleLabel: option?.label ?? '' })
          }
        />
      </Field>

      <Field label="Valeur" required>
        <Input
          value={draft.value}
          aria-label="Valeur du contact"
          mono={draft.kindCode.includes('phone')}
          placeholder="0262 00 00 00 · contact@exemple.re · https://…"
          onChange={(value) => set({ value })}
        />
      </Field>

      <Toggle
        label="Visible publiquement"
        sub="Décochez pour un usage interne uniquement."
        on={draft.isPublic}
        onChange={(isPublic) => set({ isPublic })}
      />
      <Toggle
        label="Canal principal pour ce type"
        sub="Mis en avant pour ce type de contact."
        on={draft.isPrimary}
        onChange={(isPrimary) => set({ isPrimary })}
      />
    </EditorModal>
  );
}

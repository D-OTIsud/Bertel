import { useState } from 'react';
import { EditorModal, Field, Input, ReferenceSelect, Toggle } from '../primitives';
import type {
  ObjectWorkspaceWebChannelItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

interface WebChannelEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  channel: ObjectWorkspaceWebChannelItem;
  kindOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (channel: ObjectWorkspaceWebChannelItem) => void;
}

/**
 * Focused add/edit modal for one §90 réseau social / canal de distribution
 * (object_web_channel). `kindDomain` is carried unchanged — the saver re-resolves it
 * from the kind code, so it never needs to be picked here. Value trimmed on save.
 */
export function WebChannelEditModal({
  open,
  mode,
  channel,
  kindOptions,
  onClose,
  onSave,
}: WebChannelEditModalProps) {
  const [draft, setDraft] = useState(channel);
  const set = (patch: Partial<ObjectWorkspaceWebChannelItem>) => setDraft((current) => ({ ...current, ...patch }));
  const saveDisabled = !draft.kindCode || draft.value.trim() === '';

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier le réseau ou canal' : 'Ajouter un réseau ou canal'}
      onClose={onClose}
      onSave={() => onSave({ ...draft, value: draft.value.trim() })}
      saveDisabled={saveDisabled}
    >
      <Field label="Type de réseau ou canal" required>
        <ReferenceSelect
          value={draft.kindCode}
          options={kindOptions}
          aria-label="Type de réseau ou canal"
          onChange={(code, option) =>
            set({ kindCode: code, kindId: option?.id ?? draft.kindId, kindLabel: option?.label ?? draft.kindLabel })
          }
        />
      </Field>

      <Field label="Adresse (URL ou identifiant)" required>
        <Input
          value={draft.value}
          aria-label="Adresse du réseau ou canal"
          placeholder="https://facebook.com/votre-page"
          onChange={(value) => set({ value })}
        />
      </Field>

      <Toggle
        label="Visible publiquement"
        sub="Décochez pour un usage interne uniquement."
        on={draft.isPublic}
        onChange={(isPublic) => set({ isPublic })}
      />
    </EditorModal>
  );
}

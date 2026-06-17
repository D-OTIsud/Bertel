import { useState } from 'react';
import { EditorModal, Field, Input, Select } from '../primitives';
import { EXTERNAL_ID_SOURCE_OPTIONS, isExternalIdSaveDisabled } from '../sections/external-id-edit';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

interface ExternalIdEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  item: ObjectWorkspaceExternalIdentifierItem;
  onClose: () => void;
  onSave: (item: ObjectWorkspaceExternalIdentifierItem) => void;
}

/**
 * Focused add/edit modal for one §22 external identifier (Airtable / Apidae / DataTourisme).
 * Canonical sources (OTI / SU / *canonical*) are absent from the selector AND rejected by the
 * RPC. Edits a draft copy; onSave returns the patched item (source + identifier trimmed) — the
 * section issues the upsert mutation. `organization_object_id` is NEVER chosen here (server-derived).
 */
export function ExternalIdEditModal({ open, mode, item, onClose, onSave }: ExternalIdEditModalProps) {
  const [draft, setDraft] = useState(item);
  const set = (patch: Partial<ObjectWorkspaceExternalIdentifierItem>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier l’identifiant externe' : 'Lier un nouvel identifiant externe'}
      onClose={onClose}
      onSave={() => onSave({ ...draft, sourceSystem: draft.sourceSystem.trim(), externalId: draft.externalId.trim() })}
      saveDisabled={isExternalIdSaveDisabled(draft)}
    >
      <Field label="Système source" required>
        <Select
          value={draft.sourceSystem}
          options={EXTERNAL_ID_SOURCE_OPTIONS}
          aria-label="Système source"
          onChange={(sourceSystem) => set({ sourceSystem })}
        />
      </Field>

      <Field label="Identifiant externe" required>
        <Input
          value={draft.externalId}
          aria-label="Identifiant externe"
          mono
          placeholder="recABC123 · 4567890 · https://data…"
          onChange={(externalId) => set({ externalId })}
        />
      </Field>

      <Field label="Dernière synchro" hint="Optionnel — date du dernier import depuis ce système.">
        <Input
          type="date"
          value={draft.lastSyncedAt ? draft.lastSyncedAt.slice(0, 10) : ''}
          aria-label="Dernière synchro"
          onChange={(lastSyncedAt) => set({ lastSyncedAt })}
        />
      </Field>
    </EditorModal>
  );
}

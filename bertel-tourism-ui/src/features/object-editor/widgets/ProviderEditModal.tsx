import { useState } from 'react';
import { EditorModal, Field, Input, Select, Toggle } from '../primitives';
import { ACTOR_VISIBILITY_OPTIONS } from '../sections/actor-links';
import type {
  ObjectWorkspaceActorLinkItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

interface ProviderEditModalProps {
  open: boolean;
  /** The actor link being edited (attached prestataire). */
  actor: ObjectWorkspaceActorLinkItem;
  roleOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  /** Returns the patched link — the section commits it and reconciles the one-primary-per-role rule. */
  onSave: (actor: ObjectWorkspaceActorLinkItem) => void;
}

/**
 * §19 — focused edit modal for one attached prestataire (actor_object_role link): role,
 * visibility, "principal" flag and free note. Mirrors §03/§08 (display card → modal). The
 * attach itself stays in ProviderCards (ActorPicker); this modal never changes the actor identity.
 */
export function ProviderEditModal({ open, actor, roleOptions, onClose, onSave }: ProviderEditModalProps) {
  const [draft, setDraft] = useState(actor);
  const set = (patch: Partial<ObjectWorkspaceActorLinkItem>) => setDraft((current) => ({ ...current, ...patch }));

  // Keep the current role selectable even if the catalog no longer lists it (legacy code).
  const roleSelectOptions = [
    ...(roleOptions.some((option) => option.code === draft.roleCode)
      ? []
      : [{ v: draft.roleCode, l: draft.roleLabel || draft.roleCode }]),
    ...roleOptions.map((option) => ({ v: option.code, l: option.label })),
  ];

  function setRole(roleCode: string) {
    const role = roleOptions.find((option) => option.code === roleCode);
    set({ roleCode, roleId: role?.id ?? draft.roleId, roleLabel: role?.label ?? roleCode });
  }

  return (
    <EditorModal
      open={open}
      title={`Modifier le rattachement — ${actor.displayName}`}
      onClose={onClose}
      onSave={() => onSave({ ...draft, note: draft.note.trim() })}
    >
      <div className="provider-modal__grid">
        <Field label="Rôle">
          <Select
            value={draft.roleCode}
            aria-label={`Rôle de ${actor.displayName}`}
            options={roleSelectOptions}
            onChange={setRole}
          />
        </Field>
        <Field label="Visibilité">
          <Select
            value={draft.visibility || 'public'}
            aria-label={`Visibilité de ${actor.displayName}`}
            options={ACTOR_VISIBILITY_OPTIONS.map((option) => ({ v: option.v, l: option.l }))}
            onChange={(visibility) => set({ visibility })}
          />
        </Field>
      </div>

      <Toggle
        label="Prestataire principal pour ce rôle"
        sub="Mis en avant pour ce rôle sur la fiche. Un seul principal par rôle."
        on={draft.isPrimary}
        onChange={(isPrimary) => set({ isPrimary })}
      />

      <Field label="Note">
        <Input
          value={draft.note}
          placeholder="Rôle réel, référent, conditions…"
          aria-label={`Note sur ${actor.displayName}`}
          onChange={(note) => set({ note })}
        />
      </Field>
    </EditorModal>
  );
}

'use client';

import { useState } from 'react';
import { EditorModal, Field, Input, ReferenceSelect } from '../primitives';
import { RelationPicker } from './RelationPicker';
import type { ObjectSearchResult } from '../useObjectSearch';
import type {
  ObjectWorkspaceItineraryAssocSummary,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

interface AssociatedObjectModalProps {
  open: boolean;
  objectId: string;
  roleOptions: WorkspaceReferenceOption[];
  onSave: (assoc: ObjectWorkspaceItineraryAssocSummary) => void;
  onClose: () => void;
}

/**
 * §111 C3 — link an existing tourism object to the itinerary (object_iti_associated_object).
 * Reuses the §15 RelationPicker to search any object, then asks for a role (ref_iti_assoc_role)
 * and an optional note. Saving hands the parent a full assoc summary.
 */
export function AssociatedObjectModal({ open, objectId, roleOptions, onSave, onClose }: AssociatedObjectModalProps) {
  const [picked, setPicked] = useState<ObjectSearchResult | null>(null);
  const [roleId, setRoleId] = useState('');
  const [note, setNote] = useState('');

  function reset() {
    setPicked(null);
    setRoleId('');
    setNote('');
  }

  function handleSave() {
    if (!picked || roleId === '') return;
    onSave({
      associatedObjectId: picked.id,
      roleId,
      note,
      targetName: picked.name,
      targetType: picked.type,
    });
    reset();
  }

  return (
    <EditorModal
      open={open}
      title="Lier un objet à l'itinéraire"
      size="lg"
      onClose={() => { reset(); onClose(); }}
      onSave={handleSave}
      saveLabel="Lier"
      saveDisabled={!picked || roleId === ''}
    >
      {!picked ? (
        <RelationPicker currentObjectId={objectId} onPick={setPicked} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`rpick__type type-${picked.type.toLowerCase()}`}>{picked.type}</span>
            <strong>{picked.name}</strong>
            <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPicked(null)}>
              Changer
            </button>
          </div>
          <Field label="Rôle" hint="Comment cet objet se rattache au parcours">
            {/* ReferenceSelect matches on `code`; the payload needs the role UUID, so key options by id. */}
            <ReferenceSelect
              value={roleId}
              options={roleOptions.map((option) => ({ id: option.id, code: option.id, label: option.label }))}
              onChange={(next) => setRoleId(next)}
              allowEmpty
              emptyLabel="Choisir un rôle…"
              aria-label="Rôle de l'objet lié"
            />
          </Field>
          <Field label="Note" hint="Optionnel">
            <Input value={note} onChange={setNote} />
          </Field>
        </div>
      )}
    </EditorModal>
  );
}

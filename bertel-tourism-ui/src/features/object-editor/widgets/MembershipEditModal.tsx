import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Field, Input, Select } from '../primitives';
import { createMembershipCampaign, createMembershipTier } from '../../../services/object-workspace';
import type {
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { applyMembershipPatch, buildNewMembership } from '../sections/membership-edit';

const STATUSES = ['prospect', 'invoiced', 'paid', 'canceled', 'lapsed'];

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

type Dim = 'campaign' | 'tier';

interface CreatableProps {
  label: string;
  value: string;
  options: WorkspaceReferenceOption[];
  objectId: string;
  busy: boolean;
  onSelect: (code: string) => void;
  onCreate: (name: string) => Promise<void>;
}

/** A select over existing options + a "Créer « X »" affordance when the typed name has no exact match. */
function CreatableRefField({ label, value, options, objectId, busy, onSelect, onCreate }: CreatableProps) {
  const [draft, setDraft] = useState('');
  const q = normalize(draft);
  const exact = options.some((option) => normalize(option.label) === q);
  return (
    <Field label={label}>
      <Select
        value={value}
        aria-label={label}
        options={options.map((option) => ({ v: option.code, l: option.label }))}
        onChange={onSelect}
      />
      <Input
        value={draft}
        placeholder={`Rechercher ou créer (${label.toLowerCase()})…`}
        aria-label={`${label} — rechercher ou créer`}
        onChange={setDraft}
      />
      {q && !exact && (
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: 6 }}
          disabled={busy || !objectId}
          onClick={() => { void onCreate(draft.trim()).then(() => setDraft('')); }}
        >
          Créer « {draft.trim()} »
        </button>
      )}
      {!objectId && <p className="muted" style={{ marginTop: 4 }}>Enregistrez la fiche avant de créer.</p>}
    </Field>
  );
}

interface MembershipEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  objectId: string;
  module: ObjectWorkspaceMembershipModule;
  item: ObjectWorkspaceMembershipItem | null;
  onSave: (item: ObjectWorkspaceMembershipItem) => void;
  onClose: () => void;
  /** Bubble a just-created campaign/tier up so §17 can append it to the module options. */
  onCreateOption?: (dim: Dim, option: WorkspaceReferenceOption) => void;
}

/**
 * §17 — add/edit one adhésion. Campaign & tier are creatable on the go (mirror TagPickerModal):
 * api.create_membership_campaign / _tier, gated per-object, deduped server-side. Both are required
 * (object_membership.campaign_id/tier_id NOT NULL) — a free charte is just a campaign+tier pair.
 */
export function MembershipEditModal({
  open, mode, objectId, module, item, onSave, onClose, onCreateOption,
}: MembershipEditModalProps) {
  const [draft, setDraft] = useState<ObjectWorkspaceMembershipItem>(
    () => item ?? buildNewMembership(module) ?? ({} as ObjectWorkspaceMembershipItem),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<ObjectWorkspaceMembershipItem>) {
    setDraft((current) => applyMembershipPatch(current, next, module));
  }

  async function handleCreate(dim: Dim, name: string) {
    if (!objectId || !name) return;
    setBusy(true);
    setError(null);
    try {
      const created = dim === 'campaign'
        ? await createMembershipCampaign(objectId, name)
        : await createMembershipTier(objectId, name);
      onCreateOption?.(dim, created);
      patch(dim === 'campaign'
        ? { campaignCode: created.code, campaignId: created.id, campaignLabel: created.label }
        : { tierCode: created.code, tierId: created.id, tierLabel: created.label });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  const canSave = Boolean(draft.orgObjectId && draft.campaignCode && draft.tierCode && draft.status);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Modifier l’adhésion' : 'Ajouter une adhésion'}</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">
          <Field label="Organisation">
            <Select
              value={draft.orgObjectId}
              aria-label="Organisation"
              options={module.scopeOptions.map((scope) => ({ v: scope.orgObjectId, l: scope.label }))}
              onChange={(orgObjectId) => patch({ orgObjectId })}
            />
          </Field>
          <CreatableRefField
            label="Campagne" value={draft.campaignCode} options={module.campaignOptions}
            objectId={objectId} busy={busy}
            onSelect={(campaignCode) => patch({ campaignCode })}
            onCreate={(name) => handleCreate('campaign', name)}
          />
          <CreatableRefField
            label="Palier" value={draft.tierCode} options={module.tierOptions}
            objectId={objectId} busy={busy}
            onSelect={(tierCode) => patch({ tierCode })}
            onCreate={(name) => handleCreate('tier', name)}
          />
          <Field label="Statut">
            <Select value={draft.status} aria-label="Statut" options={STATUSES} onChange={(status) => patch({ status })} />
          </Field>
          <Field label="Début">
            <Input type="date" value={draft.startsAt} onChange={(startsAt) => patch({ startsAt })} />
          </Field>
          {error && <p role="alert" style={{ marginTop: 8, color: 'var(--red, #93392a)', fontSize: 12 }}>{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn primary" disabled={!canSave || busy} onClick={() => onSave(draft)}>
            Enregistrer
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

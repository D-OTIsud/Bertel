import { stripCombiningMarks } from '../../../lib/text-fold';
import { useState } from 'react';
import { EditorModal, Field, Input, Select, Chip, ChipSet } from '../primitives';
import { createMembershipCampaign, createMembershipTier } from '../../../services/object-workspace';
import type {
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { applyMembershipPatch, buildNewMembership } from '../sections/membership-edit';
import './catalog-modals.css';
import { strictErrorMessage } from '../../../lib/strict-error-message';

const STATUSES = [
  { code: 'prospect', label: 'Prospect' },
  { code: 'invoiced', label: 'Facturée' },
  { code: 'paid', label: 'Payée' },
  { code: 'canceled', label: 'Annulée' },
  { code: 'lapsed', label: 'Non renouvelée' },
];

function normalize(value: string): string {
  return stripCombiningMarks(value.trim().toLowerCase());
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
    <section className="ed-catalog-section" aria-label={label}>
      <h3>{label === 'Campagne' ? 'Quelle campagne ?' : 'Quelle formule ?'}</h3>
      <div className="ed-membership-options">
        <ChipSet>
          {options.map((option) => (
            <Chip
              key={option.code}
              label={option.label}
              on={value === option.code}
              onClick={() => onSelect(option.code)}
            />
          ))}
        </ChipSet>
        <details className="ed-catalog-details">
          <summary>{label === 'Campagne' ? '+ Nouvelle campagne' : '+ Nouvelle formule'}</summary>
          <Field label={`Nom de la ${label === 'Campagne' ? 'campagne' : 'formule'}`}>
            <Input
              value={draft}
              placeholder={`Rechercher ou créer (${label.toLowerCase()})…`}
              aria-label={`${label} — rechercher ou créer`}
              onChange={setDraft}
            />
          </Field>
          {q && !exact && (
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 6 }}
              disabled={busy || !objectId}
              onClick={() => {
                void onCreate(draft.trim()).then(() => setDraft(''));
              }}
            >
              Créer « {draft.trim()} »
            </button>
          )}
          {!objectId && (
            <p className="muted" style={{ marginTop: 4 }}>
              Enregistrez la fiche avant de créer.
            </p>
          )}
        </details>
      </div>
    </section>
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
  open,
  mode,
  objectId,
  module,
  item,
  onSave,
  onClose,
  onCreateOption,
}: MembershipEditModalProps) {
  const [draft, setDraft] = useState<ObjectWorkspaceMembershipItem>(
    () =>
      item ??
      ({
        ...buildNewMembership(module),
        tierId: '',
        tierCode: '',
        tierLabel: '',
      } as ObjectWorkspaceMembershipItem),
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
      const created =
        dim === 'campaign'
          ? await createMembershipCampaign(objectId, name)
          : await createMembershipTier(objectId, name);
      onCreateOption?.(dim, created);
      patch(
        dim === 'campaign'
          ? { campaignCode: created.code, campaignId: created.id, campaignLabel: created.label }
          : { tierCode: created.code, tierId: created.id, tierLabel: created.label },
      );
    } catch (e) {
      setError(strictErrorMessage(e, 'Création impossible.'));
    } finally {
      setBusy(false);
    }
  }

  const datesOutOfOrder = Boolean(draft.startsAt && draft.endsAt && draft.endsAt < draft.startsAt);
  const missing =
    Number(!draft.orgObjectId) +
    Number(!draft.campaignCode) +
    Number(!draft.tierCode) +
    Number(!draft.status) +
    Number(datesOutOfOrder);
  const canSave = missing === 0;

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier l’adhésion' : 'Ajouter une adhésion'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!canSave || busy}
      saveLabel={mode === 'edit' ? 'Appliquer' : 'Ajouter'}
      footerNote={
        missing ? `${missing} point${missing > 1 ? 's' : ''} à compléter` : 'Prêt à appliquer au brouillon'
      }
    >
      {module.scopeOptions.length === 1 ? (
        <p className="ed-membership-org">
          <span>Adhésion à </span>
          <strong>{draft.orgLabel || module.scopeOptions[0].label}</strong>
          <span> · seule organisation disponible</span>
        </p>
      ) : (
        <Field label="Adhésion à">
          <Select
            value={draft.orgObjectId}
            aria-label="Organisation"
            options={module.scopeOptions.map((scope) => ({ v: scope.orgObjectId, l: scope.label }))}
            onChange={(orgObjectId) => patch({ orgObjectId })}
          />
        </Field>
      )}
      <CreatableRefField
        label="Campagne"
        value={draft.campaignCode}
        options={module.campaignOptions}
        objectId={objectId}
        busy={busy}
        onSelect={(campaignCode) => patch({ campaignCode })}
        onCreate={(name) => handleCreate('campaign', name)}
      />
      <CreatableRefField
        label="Palier"
        value={draft.tierCode}
        options={module.tierOptions}
        objectId={objectId}
        busy={busy}
        onSelect={(tierCode) => patch({ tierCode })}
        onCreate={(name) => handleCreate('tier', name)}
      />
      <section className="ed-catalog-section">
        <h3>Où en est-elle ?</h3>
        <div className="ed-membership-steps" role="group" aria-label="Statut de l’adhésion">
          {STATUSES.slice(0, 3).map((status, index) => (
            <button
              type="button"
              key={status.code}
              aria-pressed={draft.status === status.code}
              onClick={() => patch({ status: status.code })}
            >
              <span>{index + 1}</span>
              {status.label}
            </button>
          ))}
        </div>
        <ChipSet>
          {STATUSES.slice(3).map((status) => (
            <Chip
              key={status.code}
              label={status.label}
              on={draft.status === status.code}
              onClick={() => patch({ status: status.code })}
            />
          ))}
        </ChipSet>
      </section>
      <section className="ed-catalog-section">
        <div className="grid-2">
          <Field label="Début de l’adhésion">
            <Input type="date" value={draft.startsAt} onChange={(startsAt) => patch({ startsAt })} />
          </Field>
          {(draft.status === 'paid' || draft.paymentDate) && (
            <Field label="Date de paiement">
              <Input
                type="date"
                value={draft.paymentDate}
                onChange={(paymentDate) => patch({ paymentDate })}
              />
            </Field>
          )}
        </div>
        <details className="ed-catalog-details" style={{ marginTop: 12 }} open={Boolean(draft.endsAt)}>
          <summary>Préciser la fin de l’adhésion</summary>
          <Field label="Fin de l’adhésion">
            <Input type="date" value={draft.endsAt} onChange={(endsAt) => patch({ endsAt })} />
          </Field>
        </details>
        {datesOutOfOrder && (
          <p role="alert" className="muted">
            La fin de l’adhésion doit être postérieure au début.
          </p>
        )}
      </section>
      <div className="ed-catalog-summary">
        <small>Résumé : </small>
        <strong>
          {draft.tierLabel || 'Formule à choisir'} · {draft.campaignLabel || 'Campagne à choisir'} ·{' '}
          {STATUSES.find((status) => status.code === draft.status)?.label.toLowerCase() || draft.status}
        </strong>
      </div>
      {error && (
        <p role="alert" style={{ marginTop: 8, color: 'var(--red, #93392a)', fontSize: 12 }}>
          {error}
        </p>
      )}
    </EditorModal>
  );
}

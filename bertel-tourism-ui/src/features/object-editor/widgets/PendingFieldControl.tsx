import { Input } from '../primitives';
import { Provenance, type ProvenanceSource } from './Provenance';
import type { ObjectWorkspaceModerationItem } from '../../../services/object-workspace-parser';

interface PendingFieldControlProps {
  value: string;
  onChange: (next: string) => void;
  pending?: ObjectWorkspaceModerationItem;
  reviewSource?: ProvenanceSource;
  onApprove?: () => void;
  approving?: boolean;
  placeholder?: string;
  mono?: boolean;
}

/**
 * Text field with optional pending-change review UI:
 * current value struck through + proposed value in red, provenance + validate action.
 */
export function PendingFieldControl({
  value,
  onChange,
  pending,
  reviewSource = 'Prestataire',
  onApprove,
  approving = false,
  placeholder,
  mono,
}: PendingFieldControlProps) {
  if (!pending || pending.status !== 'pending') {
    return <Input value={value} onChange={onChange} placeholder={placeholder} mono={mono} />;
  }

  const currentValue = pending.beforeValue || value;
  const proposedValue = pending.afterValue;

  return (
    <>
      <div className="input input--pending-review" role="group" aria-label="Modification en attente de validation">
        <span className="pending-value pending-value--current">{currentValue || '—'}</span>
        <span className="pending-value pending-value--proposed">{proposedValue}</span>
      </div>
      <Provenance
        source={reviewSource}
        who={pending.submittedByLabel || 'Modification soumise'}
        pendingReview
        onApprove={onApprove}
        approving={approving}
      />
    </>
  );
}

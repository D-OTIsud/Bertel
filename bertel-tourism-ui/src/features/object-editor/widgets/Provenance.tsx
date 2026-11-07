export type ProvenanceSource = 'Apidae' | 'INSEE' | 'Prestataire' | 'OTI' | 'Manuel' | 'Importé' | 'DataTourisme' | 'Acceslibre';

interface ProvenanceProps {
  source: ProvenanceSource;
  who?: string;
  when?: string;
  locked?: string;
  /** Pending field review: who submitted the change + validate action. */
  pendingReview?: boolean;
  onApprove?: () => void;
  approving?: boolean;
}

const SOURCE_META: Record<ProvenanceSource, { initial: string; color: string }> = {
  Apidae: { initial: 'A', color: '#176b6a' },
  DataTourisme: { initial: 'D', color: '#1e7491' },
  INSEE: { initial: 'I', color: '#6c4f8a' },
  Acceslibre: { initial: 'A', color: '#2a7a45' },
  Prestataire: { initial: 'P', color: '#c96d3b' },
  OTI: { initial: 'O', color: '#a45330' },
  Manuel: { initial: 'M', color: 'var(--ink-3)' },
  Importé: { initial: 'I', color: 'var(--ink-3)' },
};

export function Provenance({ source, who, when, locked, pendingReview, onApprove, approving }: ProvenanceProps) {
  const meta = SOURCE_META[source];

  return (
    <div className={`prov${pendingReview ? ' prov--pending-review' : ''}`}>
      <span className="prov__src" style={{ background: meta.color }}>
        {meta.initial}
      </span>
      <span className="prov__lbl">
        {pendingReview ? (
          <>
            <strong>À valider</strong>
            {who && <> · {who}</>}
          </>
        ) : (
          <>
            <strong>{source}</strong>
            {who && <> · {who}</>}
            {when && <> · <span className="prov__when">{when}</span></>}
          </>
        )}
      </span>
      {locked && !pendingReview && (
        <span className="prov__lock" title={`Champ verrouillé par ${locked}`}>
          Verrouillé par {locked}
        </span>
      )}
      {pendingReview && onApprove ? (
        <button type="button" className="prov__approve btn sm" onClick={onApprove} disabled={approving}>
          {approving ? 'Validation…' : 'Valider'}
        </button>
      ) : null}
    </div>
  );
}

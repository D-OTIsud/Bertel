interface SaveBarProps {
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  statusMessage?: string | null;
}

/** Sticky bar carrying the global save action across all dirty sections. */
export function SaveBar({ dirtyCount, saving, onSave, statusMessage }: SaveBarProps) {
  return (
    <div className="savebar">
      <p className="savebar__msg">
        {dirtyCount > 0
          ? `${dirtyCount} modification${dirtyCount > 1 ? 's' : ''} non enregistrée${dirtyCount > 1 ? 's' : ''}`
          : 'Aucune modification en attente'}
      </p>
      <div className="savebar__actions">
        {statusMessage && <span className="savebar__status">{statusMessage}</span>}
        <button
          type="button"
          className="btn primary"
          disabled={dirtyCount === 0 || saving}
          onClick={onSave}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

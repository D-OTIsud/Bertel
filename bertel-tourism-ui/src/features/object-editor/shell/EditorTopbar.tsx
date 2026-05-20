export type EditorMode = 'rapide' | 'complet';

interface EditorTopbarProps {
  objectName: string;
  typeCode: string;
  archetypeCodeName: string;
  mode: EditorMode;
  dirtyCount: number;
  onModeChange: (mode: EditorMode) => void;
  onPreview: () => void;
  onCancel: () => void;
  onPublish: () => void;
}

export function EditorTopbar({
  objectName,
  typeCode,
  archetypeCodeName,
  mode,
  dirtyCount,
  onModeChange,
  onPreview,
  onCancel,
  onPublish,
}: EditorTopbarProps) {
  return (
    <div className="edit-top">
      <div className="edit-top__left">
        <div>
          <div className="edit-top__crumbs">
            Explorer <span className="sep">›</span>
            <strong>{archetypeCodeName}</strong> <span className="sep">›</span>
            {objectName} <span className="sep">›</span>
            <strong>Modifier</strong>
          </div>
          <div className="edit-top__title">
            {objectName}
            <span className="edit-top__code">{typeCode}</span>
          </div>
        </div>
      </div>
      <div className="edit-top__right">
        <div className="mode-tog">
          <button
            type="button"
            className={mode === 'rapide' ? 'is-on' : ''}
            onClick={() => onModeChange('rapide')}
          >
            Rapide
          </button>
          <button
            type="button"
            className={mode === 'complet' ? 'is-on' : ''}
            onClick={() => onModeChange('complet')}
          >
            Complet
          </button>
        </div>
        <span className="edit-top__save">
          {dirtyCount > 0
            ? `${dirtyCount} modification${dirtyCount > 1 ? 's' : ''} non enregistrée${dirtyCount > 1 ? 's' : ''}`
            : 'À jour'}
        </span>
        <button type="button" className="btn sm" onClick={onPreview}>
          Aperçu fiche
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="btn primary" onClick={onPublish}>
          Publier les modifs
        </button>
      </div>
    </div>
  );
}

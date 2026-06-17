import { ChevronLeft } from 'lucide-react';
import type { EditorMode } from './EditorTopbar.types';
import { buildEditTopSaveLabel } from './format-last-object-update';

export type { EditorMode } from './EditorTopbar.types';

interface EditorTopbarProps {
  objectName: string;
  archetypeCodeName: string;
  mode: EditorMode;
  dirtyCount: number;
  lastSavedAt?: string | null;
  lastUpdatedSource?: string | null;
  blockerCount?: number;
  warningCount?: number;
  publishing?: boolean;
  saving?: boolean;
  savingDraft?: boolean;
  publishDisabled?: boolean;
  statusMessage?: string | null;
  onModeChange: (mode: EditorMode) => void;
  onPreview: () => void;
  onCancel: () => void;
  onPublish: () => void;
  onSaveDraft?: () => void;
  onShowBlockers?: () => void;
}

export function EditorTopbar({
  objectName,
  archetypeCodeName,
  mode,
  dirtyCount,
  lastSavedAt,
  lastUpdatedSource,
  blockerCount = 0,
  warningCount = 0,
  publishing = false,
  saving = false,
  savingDraft = false,
  publishDisabled = false,
  statusMessage = null,
  onModeChange,
  onPreview,
  onCancel,
  onPublish,
  onSaveDraft,
  onShowBlockers,
}: EditorTopbarProps) {
  const saveLabel = buildEditTopSaveLabel({ statusMessage, dirtyCount, lastSavedAt });
  const saveTitle =
    lastSavedAt && lastUpdatedSource
      ? `Dernière mise à jour enregistrée (${lastUpdatedSource})`
      : lastSavedAt
        ? 'Dernière mise à jour enregistrée en base'
        : undefined;

  return (
    <div className="edit-top">
      <div className="edit-top__left">
        <button type="button" className="icbtn" aria-label="Retour à l'Explorer" onClick={onCancel}>
          <ChevronLeft width={14} height={14} />
        </button>
        <div>
          <div className="edit-top__crumbs">
            <strong>{archetypeCodeName}</strong> <span className="sep">›</span>
            {objectName} <span className="sep">›</span>
            <strong style={{ color: 'var(--accent-deep)' }}>Modifier</strong>
          </div>
          <div className="edit-top__title">{objectName}</div>
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
        <span
          className={`edit-top__save${dirtyCount > 0 ? ' is-dirty' : ''}`}
          title={saveTitle}
        >
          {dirtyCount === 0 && !statusMessage && <span className="pulse" aria-hidden />}
          {saveLabel}
        </span>
        {(() => {
          const validationLabel =
            blockerCount > 0
              ? `${blockerCount} blocage${blockerCount > 1 ? 's' : ''}`
              : `${warningCount} alerte${warningCount > 1 ? 's' : ''}`;
          const validationClass = `edit-top__validation${blockerCount > 0 ? ' has-blockers' : ''}`;
          return onShowBlockers ? (
            <button type="button" className={validationClass} onClick={onShowBlockers}>
              {validationLabel}
            </button>
          ) : (
            <span className={validationClass}>{validationLabel}</span>
          );
        })()}
        <button type="button" className="btn sm" onClick={onPreview}>
          Aperçu fiche
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        {onSaveDraft && (
          <button
            type="button"
            className="btn"
            disabled={savingDraft || saving || publishing || dirtyCount === 0}
            onClick={onSaveDraft}
          >
            {savingDraft ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={publishDisabled || publishing || saving}
          onClick={onPublish}
        >
          {publishing || saving ? 'Enregistrement…' : 'Publier'}
        </button>
      </div>
    </div>
  );
}
